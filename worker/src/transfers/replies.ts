import type { VerifiedAdminIdentity } from "../security/access-jwt";

const MAXIMUM_REPLY_LENGTH = 8_000;
const MAXIMUM_CALLBACK_NOTE_LENGTH = 4_000;

const allowedKeys = new Set([
  "submissionId",
  "body",
  "callbackPlanned",
  "callbackNote",
]);

export interface AdminReplyInput {
  readonly submissionId: string | null;
  readonly body: string | null;
  readonly callbackPlanned: boolean;
  readonly callbackNote: string | null;
}

export interface CreatedAdminReply {
  readonly status: "replied" | "callback_planned";
  readonly replyId: string | null;
  readonly notificationRequested: boolean;
}

export type AdminReplyResult = CreatedAdminReply | "not_found" | "invalid_state";

export class ReplyInputError extends Error {
  constructor(readonly field: string) {
    super(field);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ReplyInputError(field);
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximum) throw new ReplyInputError(field);
  return normalized;
}

export function validateAdminReplyInput(value: unknown): AdminReplyInput {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new ReplyInputError("body");
  }
  if (
    value.submissionId !== undefined &&
    value.submissionId !== null &&
    (typeof value.submissionId !== "string" ||
      !/^[A-Za-z0-9-]{1,64}$/u.test(value.submissionId))
  ) {
    throw new ReplyInputError("submissionId");
  }
  if (
    value.callbackPlanned !== undefined &&
    typeof value.callbackPlanned !== "boolean"
  ) {
    throw new ReplyInputError("callbackPlanned");
  }

  const body = optionalText(value.body, "body", MAXIMUM_REPLY_LENGTH);
  const callbackNote = optionalText(
    value.callbackNote,
    "callbackNote",
    MAXIMUM_CALLBACK_NOTE_LENGTH,
  );
  const callbackPlanned = value.callbackPlanned === true;
  if (!body && !callbackPlanned) throw new ReplyInputError("body");
  const submissionId =
    value.submissionId === undefined || value.submissionId === null
      ? null
      : value.submissionId;
  if (callbackPlanned && !body && submissionId === null) {
    throw new ReplyInputError("submissionId");
  }

  return {
    submissionId,
    body,
    callbackPlanned,
    callbackNote,
  };
}

interface CaseRow {
  readonly status: string;
}

interface SubmissionRow {
  readonly id: string;
  readonly notification_email: string | null;
  readonly status: string;
}

function auditStatement(
  database: D1Database,
  caseId: string,
  admin: VerifiedAdminIdentity,
  eventType: string,
  now: string,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO transfer_audit_events
        (id, case_id, event_type, actor_type, actor_reference, details_json, created_at)
      VALUES (?, ?, ?, 'admin', ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      caseId,
      eventType,
      admin.subject,
      JSON.stringify({ actorEmail: admin.email }),
      now,
    );
}

/** Stores a customer-visible reply or a callback-only status transition. */
export async function createAdminReply(
  database: D1Database,
  caseId: string,
  admin: VerifiedAdminIdentity,
  input: AdminReplyInput,
  now: Date,
): Promise<AdminReplyResult> {
  const caseRow = await database
    .prepare("SELECT status FROM transfer_cases WHERE id = ? LIMIT 1")
    .bind(caseId)
    .first<CaseRow>();
  if (!caseRow) return "not_found";
  if (caseRow.status !== "open") return "invalid_state";

  let submission: SubmissionRow | null = null;
  if (input.submissionId) {
    submission = await database
      .prepare(
        `SELECT id, notification_email, status
        FROM transfer_submissions
        WHERE id = ? AND case_id = ?
        LIMIT 1`,
      )
      .bind(input.submissionId, caseId)
      .first<SubmissionRow>();
    if (!submission) return "not_found";
    if (submission.status === "draft" || submission.status === "closed") {
      return "invalid_state";
    }
  }

  const nowIso = now.toISOString();
  const replyId = input.body ? crypto.randomUUID() : null;
  const status = input.body ? "replied" : "callback_planned";
  const statements: D1PreparedStatement[] = [];

  if (input.body && replyId) {
    statements.push(
      database
        .prepare(
          `INSERT INTO transfer_replies
            (id, case_id, submission_id, body, created_by_sub,
             created_by_email, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          replyId,
          caseId,
          input.submissionId,
          input.body,
          admin.subject,
          admin.email,
          nowIso,
        ),
    );
  }

  if (input.submissionId) {
    statements.push(
      database
        .prepare(
          `UPDATE transfer_submissions
          SET status = ?, updated_at = ?
          WHERE id = ? AND case_id = ?
            AND status IN ('submitted', 'reviewing', 'callback_planned', 'replied')`,
        )
        .bind(status, nowIso, input.submissionId, caseId),
    );
  }

  if (input.callbackNote !== null) {
    statements.push(
      database
        .prepare(
          `UPDATE transfer_cases
          SET callback_note = ?, updated_at = ?
          WHERE id = ? AND status = 'open'`,
        )
        .bind(input.callbackNote, nowIso, caseId),
    );
  }

  const notificationRequested = Boolean(input.body && submission?.notification_email);
  if (notificationRequested && replyId) {
    statements.push(
      database
        .prepare(
          `INSERT INTO transfer_notifications
            (id, case_id, submission_id, reply_id, kind, state,
             attempts, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'customer_reply', 'pending', 0, ?, ?)`,
        )
        .bind(crypto.randomUUID(), caseId, input.submissionId, replyId, nowIso, nowIso),
    );
  }

  statements.push(
    auditStatement(
      database,
      caseId,
      admin,
      status === "replied" ? "practice_reply_created" : "callback_planned",
      nowIso,
    ),
  );

  const results = await database.batch(statements);
  if (results.some((result) => result.meta.changes !== 1)) {
    return "invalid_state";
  }

  return { status, replyId, notificationRequested };
}
