export interface TransferCaseRow {
  readonly case_id: string;
  readonly public_id: string;
  readonly pet_name: string;
  readonly public_reference: string | null;
  readonly status: string;
  readonly allow_replies: number;
  readonly allow_callback: number;
  readonly max_submissions: number;
  readonly max_total_bytes: number;
  readonly submission_count: number;
  readonly total_bytes: number;
  readonly expires_at: string;
}

export interface TransferTokenCaseRow extends TransferCaseRow {
  readonly token_id: string;
  readonly token_version: string;
  readonly token_hmac: string;
  readonly token_expires_at: string;
  readonly token_revoked_at: string | null;
}

export interface TransferSessionCaseRow extends TransferCaseRow {
  readonly session_id: string;
  readonly session_hmac: string;
  readonly csrf_hmac: string;
  readonly session_expires_at: string;
  readonly absolute_expires_at: string;
  readonly session_revoked_at: string | null;
  readonly token_id: string;
  readonly token_revoked_at: string | null;
  readonly token_expires_at: string;
}

interface SubmissionRow {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly observed_since: string | null;
  readonly urgency: string;
  readonly callback_requested: number;
  readonly status: string;
  readonly created_at: string;
  readonly finalized_at: string | null;
}

interface LinkRow {
  readonly id: string;
  readonly submission_id: string;
  readonly url: string;
  readonly label: string | null;
  readonly created_at: string;
}

interface FileRow {
  readonly id: string;
  readonly submission_id: string;
  readonly original_name: string;
  readonly declared_media_type: string;
  readonly verified_media_type: string | null;
  readonly expected_size: number;
  readonly stored_size: number | null;
  readonly state: string;
  readonly created_at: string;
  readonly uploaded_at: string | null;
}

interface ReplyRow {
  readonly id: string;
  readonly submission_id: string | null;
  readonly body: string;
  readonly created_at: string;
}

export interface PublicTransferCase {
  readonly publicId: string;
  readonly petName: string;
  readonly publicReference: string | null;
  readonly expiresAt: string;
  readonly remainingSubmissions: number;
  readonly remainingBytes: number;
  readonly allowReplies: boolean;
  readonly allowCallback: boolean;
}

export async function findCaseForTransferToken(
  database: D1Database,
  publicId: string,
  tokenHmac: string,
): Promise<TransferTokenCaseRow | null> {
  return database
    .prepare(
      `SELECT
        c.id AS case_id,
        c.public_id,
        c.pet_name,
        c.public_reference,
        c.status,
        c.allow_replies,
        c.allow_callback,
        c.max_submissions,
        c.max_total_bytes,
        c.submission_count,
        c.total_bytes,
        c.expires_at,
        t.id AS token_id,
        t.token_version,
        t.token_hmac,
        t.expires_at AS token_expires_at,
        t.revoked_at AS token_revoked_at
      FROM transfer_cases AS c
      INNER JOIN transfer_tokens AS t ON t.case_id = c.id
      WHERE c.public_id = ?
        AND t.token_hmac = ?
      LIMIT 1`,
    )
    .bind(publicId, tokenHmac)
    .first<TransferTokenCaseRow>();
}

export async function findCaseForTransferSession(
  database: D1Database,
  sessionHmac: string,
): Promise<TransferSessionCaseRow | null> {
  return database
    .prepare(
    `SELECT
        s.id AS session_id,
        s.session_hmac,
        s.csrf_hmac,
        s.expires_at AS session_expires_at,
        s.absolute_expires_at,
        s.revoked_at AS session_revoked_at,
        t.id AS token_id,
        t.revoked_at AS token_revoked_at,
        t.expires_at AS token_expires_at,
        c.id AS case_id,
        c.public_id,
        c.pet_name,
        c.public_reference,
        c.status,
        c.allow_replies,
        c.allow_callback,
        c.max_submissions,
        c.max_total_bytes,
        c.submission_count,
        c.total_bytes,
        c.expires_at
      FROM transfer_sessions AS s
      INNER JOIN transfer_tokens AS t ON t.id = s.token_id
      INNER JOIN transfer_cases AS c ON c.id = s.case_id
      WHERE s.session_hmac = ?
      LIMIT 1`,
    )
    .bind(sessionHmac)
    .first<TransferSessionCaseRow>();
}

export function isOpenTransferCase(
  row: TransferCaseRow,
  now: Date,
): boolean {
  const expiry = Date.parse(row.expires_at);
  return (
    row.status === "open" &&
    Number.isFinite(expiry) &&
    expiry > now.getTime()
  );
}

export function publicTransferCase(row: TransferCaseRow): PublicTransferCase {
  return {
    publicId: row.public_id,
    petName: row.pet_name,
    publicReference: row.public_reference,
    expiresAt: row.expires_at,
    remainingSubmissions: Math.max(
      0,
      row.max_submissions - row.submission_count,
    ),
    remainingBytes: Math.max(0, row.max_total_bytes - row.total_bytes),
    allowReplies: row.allow_replies === 1,
    allowCallback: row.allow_callback === 1,
  };
}

export async function loadPublicCaseData(
  database: D1Database,
  caseId: string,
): Promise<{
  readonly submissions: readonly Record<string, unknown>[];
  readonly links: readonly Record<string, unknown>[];
  readonly files: readonly Record<string, unknown>[];
  readonly replies: readonly Record<string, unknown>[];
}> {
  const [submissionResult, linkResult, fileResult, replyResult] =
    await Promise.all([
      database
        .prepare(
          `SELECT id, title, message, observed_since, urgency,
            callback_requested, status, created_at, finalized_at
          FROM transfer_submissions
          WHERE case_id = ?
          ORDER BY created_at ASC`,
        )
        .bind(caseId)
        .all<SubmissionRow>(),
      database
        .prepare(
          `SELECT l.id, l.submission_id, l.url, l.label, l.created_at
          FROM transfer_links AS l
          INNER JOIN transfer_submissions AS s ON s.id = l.submission_id
          WHERE s.case_id = ?
          ORDER BY l.created_at ASC`,
        )
        .bind(caseId)
        .all<LinkRow>(),
      database
        .prepare(
          `SELECT id, submission_id, original_name, declared_media_type,
            verified_media_type, expected_size, stored_size, state,
            created_at, uploaded_at
          FROM transfer_files
          WHERE case_id = ?
          ORDER BY created_at ASC`,
        )
        .bind(caseId)
        .all<FileRow>(),
      database
        .prepare(
          `SELECT id, submission_id, body, created_at
          FROM transfer_replies
          WHERE case_id = ?
          ORDER BY created_at ASC`,
        )
        .bind(caseId)
        .all<ReplyRow>(),
    ]);

  return {
    submissions: submissionResult.results.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      observedSince: row.observed_since,
      urgency: row.urgency,
      callbackRequested: row.callback_requested === 1,
      status: row.status,
      createdAt: row.created_at,
      finalizedAt: row.finalized_at,
    })),
    links: linkResult.results.map((row) => ({
      id: row.id,
      submissionId: row.submission_id,
      url: row.url,
      label: row.label,
      createdAt: row.created_at,
    })),
    files: fileResult.results.map((row) => ({
      id: row.id,
      submissionId: row.submission_id,
      originalName: row.original_name,
      declaredMediaType: row.declared_media_type,
      verifiedMediaType: row.verified_media_type,
      expectedSize: row.expected_size,
      storedSize: row.stored_size,
      state: row.state,
      createdAt: row.created_at,
      uploadedAt: row.uploaded_at,
    })),
    replies: replyResult.results.map((row) => ({
      id: row.id,
      submissionId: row.submission_id,
      body: row.body,
      createdAt: row.created_at,
    })),
  };
}
