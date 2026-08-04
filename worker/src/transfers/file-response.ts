import { inlineSafeMediaTypes, isAllowedMediaType } from "./limits";

export interface ByteRange {
  readonly offset: number;
  readonly length: number;
}

export function parseSingleRange(
  header: string | null,
  size: number,
): ByteRange | "invalid" | null {
  if (header === null) return null;
  if (!Number.isSafeInteger(size) || size <= 0 || !/^bytes=\d*-\d*$/u.test(header)) return "invalid";
  const [startText, endText] = header.slice(6).split("-") as [string, string];
  if (!startText && !endText) return "invalid";
  const number = (value: string): number | null => {
    if (!/^\d+$/u.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };
  if (!startText) {
    const suffix = number(endText);
    if (suffix === null || suffix === 0) return "invalid";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = number(startText);
  if (start === null || start >= size) return "invalid";
  if (!endText) return { offset: start, length: size - start };
  const end = number(endText);
  if (end === null || end < start) return "invalid";
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

export interface StoredFileMetadata {
  readonly r2Key: string;
  readonly originalName: string;
  readonly mediaType: string;
  readonly size: number;
  readonly etag: string;
  readonly inlineSafe: number;
}

type FileBucket = Pick<R2Bucket, "get">;

interface StoredFileRow {
  readonly r2Key: string;
  readonly originalName: string;
  readonly mediaType: string;
  readonly size: number;
  readonly etag: string;
  readonly inlineSafe: number;
}

export async function loadCustomerStoredFile(
  database: Pick<D1Database, "prepare">,
  fileId: string,
  caseId: string,
  sessionId: string,
  now: Date,
): Promise<StoredFileMetadata | null> {
  return database.prepare(
    `SELECT f.r2_key AS r2Key, f.original_name AS originalName,
      f.verified_media_type AS mediaType, f.stored_size AS size, f.etag, f.inline_safe AS inlineSafe
    FROM transfer_files AS f
    INNER JOIN transfer_submissions AS s ON s.id = f.submission_id AND s.case_id = f.case_id
    INNER JOIN transfer_cases AS c ON c.id = f.case_id
    INNER JOIN transfer_sessions AS active_session ON active_session.case_id = c.id
    WHERE f.id = ? AND f.case_id = ? AND f.state = 'stored'
      AND active_session.id = ? AND active_session.revoked_at IS NULL
      AND active_session.expires_at > ? AND active_session.absolute_expires_at > ?
      AND c.status = 'open' AND c.expires_at > ?`,
  ).bind(fileId, caseId, sessionId, now.toISOString(), now.toISOString(), now.toISOString()).first<StoredFileRow>();
}

export async function loadAdminStoredFile(
  database: Pick<D1Database, "prepare">,
  fileId: string,
): Promise<StoredFileMetadata | null> {
  return database.prepare(
    `SELECT f.r2_key AS r2Key, f.original_name AS originalName,
      f.verified_media_type AS mediaType, f.stored_size AS size, f.etag, f.inline_safe AS inlineSafe
    FROM transfer_files AS f
    INNER JOIN transfer_submissions AS s ON s.id = f.submission_id AND s.case_id = f.case_id
    WHERE f.id = ? AND f.state = 'stored'`,
  ).bind(fileId).first<StoredFileRow>();
}

function contentDisposition(name: string, inline: boolean): string {
  let wellFormed = "";
  for (let index = 0; index < name.length; index += 1) {
    const unit = name.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < name.length) {
      const next = name.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { wellFormed += name[index]! + name[index + 1]!; index += 1; continue; }
    }
    wellFormed += unit >= 0xd800 && unit <= 0xdfff ? "_" : name[index]!;
  }
  const sanitized = wellFormed.replace(/[\r\n"\\/]/gu, "_");
  const safe = sanitized.replace(/[^\x20-\x7e]/gu, "_").slice(0, 120) || "file";
  const encoded = encodeURIComponent(sanitized).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encoded || "file"}`;
}

function securityHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

function isOffsetRange(range: R2Range | undefined): range is { offset: number; length: number } {
  return Boolean(range && "offset" in range && "length" in range);
}

export function rangeNotSatisfiable(size: number): Response {
  const headers = securityHeaders();
  headers.set("content-range", `bytes */${size}`);
  return new Response(null, { status: 416, headers });
}

export async function storedFileResponse(
  bucket: FileBucket,
  metadata: StoredFileMetadata,
  rangeHeader: string | null,
  requestId: string,
): Promise<Response | "invalid" | "unavailable"> {
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || !metadata.r2Key || !metadata.etag || !metadata.originalName ||
    (metadata.inlineSafe !== 0 && metadata.inlineSafe !== 1) || !isAllowedMediaType(metadata.mediaType)) {
    return "unavailable";
  }
  const inline = metadata.inlineSafe === 1 && inlineSafeMediaTypes.has(metadata.mediaType);
  const rangeCapable = inline && (metadata.mediaType === "video/mp4" || metadata.mediaType === "video/webm");
  const range = rangeCapable ? parseSingleRange(rangeHeader, metadata.size) : null;
  if (range === "invalid") return "invalid";
  try {
    const object = await bucket.get(metadata.r2Key, {
      onlyIf: { etagMatches: metadata.etag },
      ...(range ? { range } : {}),
    });
    if (!object || !("body" in object) || !object.body || object.etag !== metadata.etag || object.size !== metadata.size ||
      (range && (!isOffsetRange(object.range) || object.range.offset !== range.offset || object.range.length !== range.length))) {
      console.error("transfer_file_object_unavailable", requestId);
      return "unavailable";
    }
    const headers = securityHeaders();
    headers.set("content-type", metadata.mediaType);
    headers.set("content-length", String(range?.length ?? object.size));
    headers.set("content-disposition", contentDisposition(metadata.originalName, inline));
    if (rangeCapable) headers.set("accept-ranges", "bytes");
    if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch {
    console.error("transfer_file_object_unavailable", requestId);
    return "unavailable";
  }
}
