import {
  inlineSafeMediaTypes,
  isAllowedMediaType,
  type AllowedMediaType,
} from "./limits";
import { detectMediaType, needsMoreSignatureBytes } from "./file-signatures";

export interface UploadExpectation {
  readonly size: number;
  readonly mediaType: AllowedMediaType;
}

export function validateUploadHeaders(
  headers: Headers,
  expected: UploadExpectation,
): void {
  const contentLength = headers.get("content-length");
  if (!contentLength || !/^[1-9]\d*$/u.test(contentLength)) {
    throw new TypeError("Invalid upload length");
  }
  const length = Number(contentLength);
  if (!Number.isSafeInteger(length) || length !== expected.size) {
    throw new TypeError("Invalid upload length");
  }

  const contentType = headers.get("content-type")?.toLowerCase();
  if (!contentType || contentType.includes(";") || !isAllowedMediaType(contentType)) {
    throw new TypeError("Invalid upload media type");
  }
  if (contentType !== expected.mediaType) {
    throw new TypeError("Unexpected upload media type");
  }

  const contentEncoding = headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    throw new TypeError("Invalid upload encoding");
  }
}

interface UploadSlotRow extends UploadExpectation {
  readonly id: string;
  readonly r2_key: string;
}

interface UploadBucket {
  put(
    key: string,
    value: ReadableStream<Uint8Array>,
    options: R2PutOptions,
  ): Promise<{ readonly size: number; readonly etag: string } | null>;
  delete(key: string): Promise<void>;
}

export type UploadResult = "unauthorized" | "conflict" | "invalid" | "unavailable" | "stored";

class InvalidUploadBodyError extends Error {}

async function compensateUploadSlot(
  database: Pick<D1Database, "prepare">,
  fileId: string,
  caseId: string,
  preferred: "pending" | "rejected",
): Promise<void> {
  const setState = async (state: "pending" | "rejected"): Promise<boolean> => {
    try {
      const result = await database.prepare(
        "UPDATE transfer_files SET state = ? WHERE id = ? AND case_id = ? AND state = 'uploading'",
      ).bind(state, fileId, caseId).run();
      return result.meta.changes === 1;
    } catch {
      return false;
    }
  };
  if (await setState(preferred)) return;
  if (preferred === "pending" && await setState("rejected")) return;
  console.error("transfer_upload_orphan");
}

export function validatedUploadStream(
  expected: UploadExpectation,
  onInvalid = (): void => {},
): TransformStream<Uint8Array, Uint8Array> {
  let prefix = new Uint8Array();
  let signatureChecked = false;
  let received = 0;

  const validatePrefix = (): void => {
    const detected = detectMediaType(prefix);
    if (detected === expected.mediaType) {
      signatureChecked = true;
      return;
    }
    if (needsMoreSignatureBytes(prefix)) return;
    if (detected !== null || prefix.byteLength >= 12) {
      onInvalid();
      throw new InvalidUploadBodyError("Invalid upload signature");
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > expected.size) {
        onInvalid();
        throw new InvalidUploadBodyError("Invalid upload length");
      }

      if (signatureChecked) {
        controller.enqueue(chunk);
        return;
      }

      const consumed = Math.min(64 - prefix.byteLength, chunk.byteLength);
      const nextPrefix = new Uint8Array(prefix.byteLength + consumed);
      nextPrefix.set(prefix);
      nextPrefix.set(chunk.slice(0, consumed), prefix.byteLength);
      prefix = nextPrefix;
      validatePrefix();
      if (signatureChecked) {
        controller.enqueue(prefix);
        if (consumed < chunk.byteLength) controller.enqueue(chunk.slice(consumed));
      }
    },
    flush(controller) {
      if (!signatureChecked) validatePrefix();
      if (!signatureChecked || received !== expected.size) {
        onInvalid();
        throw new InvalidUploadBodyError("Invalid upload body");
      }
    },
  });
}

export async function uploadReservedFile(
  database: Pick<D1Database, "prepare" | "batch">,
  bucket: UploadBucket,
  headers: Headers,
  body: ReadableStream<Uint8Array> | null,
  caseId: string,
  sessionId: string,
  fileId: string,
  now: Date,
): Promise<UploadResult> {
  if (!body) return "invalid";
  const nowIso = now.toISOString();
  const slot = await database
    .prepare(
      `SELECT f.id, f.r2_key, f.expected_size AS size, f.declared_media_type AS mediaType
      FROM transfer_files AS f
      INNER JOIN transfer_submissions AS s ON s.id = f.submission_id
      INNER JOIN transfer_cases AS c ON c.id = f.case_id
      WHERE f.id = ? AND f.case_id = ? AND f.state = 'pending'
        AND f.delete_after > ? AND s.status = 'draft'
        AND c.status = 'open' AND c.expires_at > ?
        AND c.submission_count BETWEEN 1 AND c.max_submissions
        AND c.total_bytes BETWEEN f.expected_size AND c.max_total_bytes`,
    )
    .bind(fileId, caseId, nowIso, nowIso)
    .first<UploadSlotRow>();
  if (!slot) return "conflict";
  try {
    validateUploadHeaders(headers, slot);
  } catch {
    const rejected = await database.prepare(
      `UPDATE transfer_files SET state = 'rejected'
      WHERE id = ? AND case_id = ? AND state = 'pending'
        AND EXISTS (
          SELECT 1 FROM transfer_sessions AS active_session
          WHERE active_session.id = ? AND active_session.case_id = transfer_files.case_id
            AND active_session.revoked_at IS NULL
            AND active_session.expires_at > ? AND active_session.absolute_expires_at > ?
        )`,
    ).bind(fileId, caseId, sessionId, nowIso, nowIso).run();
    return rejected.meta.changes === 1 ? "invalid" : "unauthorized";
  }

  const [sessionGate, claim] = await database.batch([
    database.prepare(
      `UPDATE transfer_sessions SET last_seen_at = last_seen_at
      WHERE id = ? AND case_id = ? AND revoked_at IS NULL
        AND expires_at > ? AND absolute_expires_at > ?`,
    ).bind(sessionId, caseId, nowIso, nowIso),
    database.prepare(
      `UPDATE transfer_files SET state = 'uploading'
      WHERE id = ? AND case_id = ? AND state = 'pending'
        AND delete_after > ?
        AND EXISTS (
          SELECT 1 FROM transfer_submissions AS s
          INNER JOIN transfer_cases AS c ON c.id = s.case_id
          WHERE s.id = transfer_files.submission_id AND s.status = 'draft'
            AND c.id = transfer_files.case_id AND c.status = 'open'
            AND c.expires_at > ?
            AND c.submission_count BETWEEN 1 AND c.max_submissions
            AND c.total_bytes BETWEEN transfer_files.expected_size AND c.max_total_bytes
        )
        AND EXISTS (
          SELECT 1 FROM transfer_sessions AS active_session
          WHERE active_session.id = ? AND active_session.case_id = transfer_files.case_id
            AND active_session.revoked_at IS NULL
            AND active_session.expires_at > ? AND active_session.absolute_expires_at > ?
        )`,
    ).bind(fileId, caseId, nowIso, nowIso, sessionId, nowIso, nowIso),
  ]);
  if (sessionGate?.meta.changes !== 1) return "unauthorized";
  if (claim?.meta.changes !== 1) return "conflict";

  let object: { readonly size: number; readonly etag: string } | null = null;
  let invalidBody = false;
  try {
    object = await bucket.put(
      slot.r2_key,
      body
        .pipeThrough(validatedUploadStream(slot, () => { invalidBody = true; }))
        .pipeThrough(new FixedLengthStream(slot.size)),
      { httpMetadata: { contentType: slot.mediaType }, onlyIf: { etagDoesNotMatch: "*" } },
    );
  } catch (error) {
    if (invalidBody || error instanceof InvalidUploadBodyError) {
      await compensateUploadSlot(database, fileId, caseId, "rejected");
      return "invalid";
    }
    await compensateUploadSlot(database, fileId, caseId, "pending");
    return "unavailable";
  }
  if (!object) {
    await compensateUploadSlot(database, fileId, caseId, "pending");
    return "conflict";
  }
  if (object.size !== slot.size) {
    try {
      await bucket.delete(slot.r2_key);
    } catch {
      console.error("transfer_upload_orphan");
    }
    await compensateUploadSlot(database, fileId, caseId, "rejected");
    return "invalid";
  }

  const finalizedAt = new Date().toISOString();
  let finalized: D1Result | null = null;
  try {
    finalized = await database.prepare(
    `UPDATE transfer_files
    SET state = 'stored', verified_media_type = ?, stored_size = ?, etag = ?,
      inline_safe = ?, uploaded_at = ?
    WHERE id = ? AND case_id = ? AND state = 'uploading'
      AND expected_size = ? AND delete_after > ?
      AND EXISTS (
        SELECT 1 FROM transfer_submissions AS s
        INNER JOIN transfer_cases AS c ON c.id = s.case_id
        WHERE s.id = transfer_files.submission_id AND s.status = 'draft'
          AND c.id = transfer_files.case_id AND c.status = 'open'
          AND c.expires_at > ?
          AND c.submission_count BETWEEN 1 AND c.max_submissions
          AND c.total_bytes BETWEEN transfer_files.expected_size AND c.max_total_bytes
      )
      AND EXISTS (
        SELECT 1 FROM transfer_sessions AS active_session
        WHERE active_session.id = ? AND active_session.case_id = transfer_files.case_id
          AND active_session.revoked_at IS NULL
          AND active_session.expires_at > ? AND active_session.absolute_expires_at > ?
      )`,
    ).bind(
    slot.mediaType,
    object.size,
    object.etag,
    inlineSafeMediaTypes.has(slot.mediaType) ? 1 : 0,
    finalizedAt,
    fileId,
    caseId,
    slot.size,
    finalizedAt,
    sessionId,
    finalizedAt,
    finalizedAt,
    ).run();
  } catch {
    finalized = null;
  }
  if (finalized?.meta.changes === 1) return "stored";
  let deleted = false;
  try {
    await bucket.delete(slot.r2_key);
    deleted = true;
  } catch {
    console.error("transfer_upload_orphan");
  }
  await compensateUploadSlot(database, fileId, caseId, deleted ? "pending" : "rejected");
  return "unavailable";
}
