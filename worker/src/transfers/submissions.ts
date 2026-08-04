import {
  validateSubmissionLinks,
  type SubmissionLinkInput,
} from "./links";

export type AllowedSubmissionMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm";

export interface SubmissionFileInput {
  readonly name: string;
  readonly mediaType: AllowedSubmissionMediaType;
  readonly size: number;
}

export interface SubmissionInput {
  readonly title: string;
  readonly message: string;
  readonly observedSince?: string;
  readonly urgency: "normal" | "callback_requested";
  readonly callbackRequested: boolean;
  readonly callbackPhone?: string;
  readonly notificationEmail?: string;
  readonly links: readonly SubmissionLinkInput[];
  readonly files: readonly SubmissionFileInput[];
  readonly notEmergencyConfirmed: true;
  readonly totalFileBytes: number;
}

interface SubmissionValidationOptions {
  readonly allowCallback: boolean;
}

const allowedKeys = new Set([
  "title",
  "message",
  "observedSince",
  "urgency",
  "callbackRequested",
  "callbackPhone",
  "notificationEmail",
  "links",
  "files",
  "notEmergencyConfirmed",
]);

const imageMediaTypes = new Set<AllowedSubmissionMediaType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export interface CreatedSubmission {
  readonly submissionId: string;
  readonly uploads: readonly {
    readonly fileId: string;
    readonly uploadUrl: string;
    readonly expiresAt: string;
  }[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(
  value: unknown,
  maximumLength: number,
): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" && value.length <= maximumLength)
  );
}

function validNotificationEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  );
}

function isAllowedMediaType(value: string): value is AllowedSubmissionMediaType {
  return (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp" ||
    value === "image/heic" ||
    value === "image/heif" ||
    value === "video/mp4" ||
    value === "video/quicktime" ||
    value === "video/webm"
  );
}

function validateFiles(value: unknown): {
  readonly files: readonly SubmissionFileInput[];
  readonly totalFileBytes: number;
} {
  if (!Array.isArray(value) || value.length > 8) {
    throw new TypeError("Invalid submission files");
  }

  let totalFileBytes = 0;
  const files = value.map((candidate): SubmissionFileInput => {
    if (!isObject(candidate)) throw new TypeError("Invalid submission file");
    const keys = Object.keys(candidate);
    if (
      keys.length !== 3 ||
      !keys.includes("name") ||
      !keys.includes("mediaType") ||
      !keys.includes("size") ||
      typeof candidate.name !== "string" ||
      candidate.name.length < 1 ||
      candidate.name.length > 255 ||
      typeof candidate.mediaType !== "string" ||
      !isAllowedMediaType(candidate.mediaType) ||
      typeof candidate.size !== "number" ||
      !Number.isSafeInteger(candidate.size) ||
      candidate.size <= 0
    ) {
      throw new TypeError("Invalid submission file");
    }
    const mediaType = candidate.mediaType;
    const maximumBytes = imageMediaTypes.has(mediaType)
      ? 12 * 1_024 * 1_024
      : 50 * 1_024 * 1_024;
    if (candidate.size > maximumBytes) {
      throw new TypeError("Invalid submission file");
    }
    const nextTotal = totalFileBytes + candidate.size;
    if (!Number.isSafeInteger(nextTotal)) {
      throw new TypeError("Invalid submission files");
    }
    totalFileBytes = nextTotal;
    return { name: candidate.name, mediaType, size: candidate.size };
  });

  return { files, totalFileBytes };
}

export function validateSubmissionInput(
  value: unknown,
  options: SubmissionValidationOptions,
): SubmissionInput {
  if (!isObject(value) || Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new TypeError("Invalid submission");
  }
  if (
    typeof value.title !== "string" ||
    value.title.length < 3 ||
    value.title.length > 120 ||
    typeof value.message !== "string" ||
    value.message.length < 20 ||
    value.message.length > 8_000 ||
    !optionalString(value.observedSince, 200) ||
    (value.urgency !== "normal" && value.urgency !== "callback_requested") ||
    typeof value.callbackRequested !== "boolean" ||
    !optionalString(value.callbackPhone, 40) ||
    !optionalString(value.notificationEmail, 254) ||
    value.notEmergencyConfirmed !== true
  ) {
    throw new TypeError("Invalid submission");
  }
  if (
    value.callbackRequested !== (value.urgency === "callback_requested") ||
    (value.callbackRequested && !options.allowCallback) ||
    (!value.callbackRequested && value.callbackPhone !== undefined) ||
    (value.notificationEmail !== undefined &&
      !validNotificationEmail(value.notificationEmail))
  ) {
    throw new TypeError("Invalid submission");
  }

  const links = validateSubmissionLinks(value.links);
  const { files, totalFileBytes } = validateFiles(value.files);
  return {
    title: value.title,
    message: value.message,
    ...(value.observedSince === undefined
      ? {}
      : { observedSince: value.observedSince }),
    urgency: value.urgency,
    callbackRequested: value.callbackRequested,
    ...(value.callbackPhone === undefined
      ? {}
      : { callbackPhone: value.callbackPhone }),
    ...(value.notificationEmail === undefined
      ? {}
      : { notificationEmail: value.notificationEmail }),
    links,
    files,
    notEmergencyConfirmed: true,
    totalFileBytes,
  };
}

export async function createSubmissionDraft(
  database: D1Database,
  caseId: string,
  input: SubmissionInput,
  now: Date,
): Promise<CreatedSubmission | null> {
  const submissionId = crypto.randomUUID();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO transfer_submissions (
          id, case_id, title, message, observed_since, urgency,
          callback_requested, callback_phone, notification_email,
          status, created_at, finalized_at, updated_at
        )
        SELECT ?, c.id, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, ?
        FROM transfer_cases AS c
        WHERE c.id = ?
          AND c.status = 'open'
          AND c.expires_at > ?
          AND c.submission_count < c.max_submissions
          AND c.total_bytes <= c.max_total_bytes - ?`,
      )
      .bind(
        submissionId,
        input.title,
        input.message,
        input.observedSince ?? null,
        input.urgency,
        input.callbackRequested ? 1 : 0,
        input.callbackPhone ?? null,
        input.notificationEmail ?? null,
        nowIso,
        nowIso,
        caseId,
        nowIso,
        input.totalFileBytes,
      ),
  ];

  for (const link of input.links) {
    statements.push(
      database
        .prepare(
          `INSERT INTO transfer_links (id, submission_id, url, label, created_at)
          SELECT ?, s.id, ?, ?, ?
          FROM transfer_submissions AS s
          WHERE s.id = ? AND s.case_id = ? AND s.status = 'draft'`,
        )
        .bind(
          crypto.randomUUID(),
          link.url,
          link.label ?? null,
          nowIso,
          submissionId,
          caseId,
        ),
    );
  }

  const uploads: CreatedSubmission["uploads"][number][] = [];
  for (const file of input.files) {
    const fileId = crypto.randomUUID();
    statements.push(
      database
        .prepare(
          `INSERT INTO transfer_files (
            id, case_id, submission_id, r2_key, original_name,
            declared_media_type, verified_media_type, expected_size,
            stored_size, etag, state, inline_safe, created_at,
            uploaded_at, delete_after
          )
          SELECT ?, s.case_id, s.id, ?, ?, ?, NULL, ?, NULL, NULL,
            'pending', 0, ?, NULL, ?
          FROM transfer_submissions AS s
          WHERE s.id = ? AND s.case_id = ? AND s.status = 'draft'`,
        )
        .bind(
          fileId,
          `cases/${caseId}/submissions/${submissionId}/${fileId}`,
          file.name,
          file.mediaType,
          file.size,
          nowIso,
          expiresAt,
          submissionId,
          caseId,
        ),
    );
    uploads.push({
      fileId,
      uploadUrl: `/api/transfers/uploads/${fileId}`,
      expiresAt,
    });
  }

  statements.push(
    database
      .prepare(
        `UPDATE transfer_cases
        SET submission_count = submission_count + 1,
          total_bytes = total_bytes + ?,
          updated_at = ?
        WHERE id = ?
          AND EXISTS (
            SELECT 1 FROM transfer_submissions AS s
            WHERE s.id = ? AND s.case_id = transfer_cases.id
              AND s.status = 'draft' AND s.created_at = ?
          )`,
      )
      .bind(input.totalFileBytes, nowIso, caseId, submissionId, nowIso),
  );

  const results = await database.batch(statements);
  if (
    results.length !== statements.length ||
    results.some((result) => result.meta.changes !== 1)
  ) {
    return null;
  }
  return { submissionId, uploads };
}

export async function finalizeSubmission(
  database: D1Database,
  caseId: string,
  submissionId: string,
  now: Date,
): Promise<boolean> {
  const nowIso = now.toISOString();
  const result = await database
    .prepare(
      `UPDATE transfer_submissions
      SET status = 'submitted', finalized_at = ?, updated_at = ?
      WHERE id = ? AND case_id = ? AND status = 'draft'
        AND NOT EXISTS (
          SELECT 1 FROM transfer_files AS f
          WHERE f.submission_id = transfer_submissions.id
            AND f.case_id = ?
            AND (f.state <> 'stored' OR f.stored_size IS NULL)
        )`,
    )
    .bind(nowIso, nowIso, submissionId, caseId, caseId)
    .run();
  return result.meta.changes === 1;
}
