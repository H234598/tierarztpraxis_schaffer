import type { DevelopmentEnv } from "../env";
import { resolveRecipient } from "../contact/mail";
import { isValidEmail } from "../contact/validation";

export const MAXIMUM_NOTIFICATION_ATTEMPTS = 5;

export interface NotificationMessage {
  readonly notificationId: string;
}

interface NotificationRow {
  readonly id: string;
  readonly kind: "practice_submission" | "customer_reply";
  readonly attempts: number;
  readonly state: string;
  readonly notification_email: string | null;
  readonly public_id: string;
  readonly pet_name: string;
}

function isNotificationId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value);
}

export function parseNotificationMessage(value: unknown): NotificationMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return isNotificationId(record.notificationId)
    ? { notificationId: record.notificationId }
    : null;
}

/** Creates the practice notification row before any queue message is sent. */
export async function createPracticeSubmissionNotification(
  database: D1Database,
  caseId: string,
  submissionId: string,
  now: Date,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const nowIso = now.toISOString();
  const result = await database
    .prepare(
      `INSERT INTO transfer_notifications
        (id, case_id, submission_id, reply_id, kind, state, attempts,
         created_at, updated_at)
      SELECT ?, case_id, id, NULL, 'practice_submission', 'pending', 0, ?, ?
      FROM transfer_submissions
      WHERE id = ? AND case_id = ? AND status = 'submitted'`,
    )
    .bind(id, nowIso, nowIso, submissionId, caseId)
    .run();
  return result.meta.changes === 1 ? id : null;
}

export async function findPendingNotificationForReply(
  database: D1Database,
  replyId: string,
): Promise<string | null> {
  const row = await database
    .prepare(
      `SELECT id
      FROM transfer_notifications
      WHERE reply_id = ? AND kind = 'customer_reply' AND state = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    )
    .bind(replyId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** Claims a pending row and sends only its opaque ID to the queue. */
export async function enqueueNotification(
  database: D1Database,
  queue: Queue<NotificationMessage>,
  notificationId: string,
  now = new Date(),
): Promise<boolean> {
  const nowIso = now.toISOString();
  const claim = await database
    .prepare(
      `UPDATE transfer_notifications
      SET state = 'queued', updated_at = ?
      WHERE id = ? AND state = 'pending' AND attempts < ?`,
    )
    .bind(nowIso, notificationId, MAXIMUM_NOTIFICATION_ATTEMPTS)
    .run();
  if (claim.meta.changes !== 1) return false;

  try {
    await queue.send({ notificationId }, { contentType: "json" });
    return true;
  } catch {
    await database
      .prepare(
        `UPDATE transfer_notifications
        SET state = 'failed', last_error_code = 'queue_send_failed', updated_at = ?
        WHERE id = ? AND state = 'queued'`,
      )
      .bind(new Date().toISOString(), notificationId)
      .run()
      .catch(() => undefined);
    return false;
  }
}

async function loadNotification(
  database: D1Database,
  notificationId: string,
): Promise<NotificationRow | null> {
  return database
    .prepare(
      `SELECT n.id, n.kind, n.attempts, n.state,
        s.notification_email, c.public_id, c.pet_name
      FROM transfer_notifications AS n
      INNER JOIN transfer_cases AS c ON c.id = n.case_id
      LEFT JOIN transfer_submissions AS s ON s.id = n.submission_id
      WHERE n.id = ?
      LIMIT 1`,
    )
    .bind(notificationId)
    .first<NotificationRow>();
}

function notificationMail(
  row: NotificationRow,
  recipient: string,
  env: DevelopmentEnv,
): Parameters<SendEmail["send"]>[0] {
  const customer = row.kind === "customer_reply";
  return {
    to: recipient,
    from: env.MAIL_FROM,
    subject: customer
      ? "Ihre Tierarztpraxis hat den Datentransfer aktualisiert"
      : `[Datentransfer] Neue Einreichung für ${row.pet_name}`,
    text: customer
      ? [
          "Ihre Tierarztpraxis hat den Datentransfer aktualisiert.",
          "",
          "Bitte öffnen Sie den bereits erhaltenen Datentransferlink, um den Status zu sehen.",
          "Diese Nachricht enthält keinen Token und keine medizinischen Inhalte.",
        ].join("\n")
      : [
          "Neue Einreichung im Datentransferportal.",
          "",
          `Fallkennung: ${row.public_id}`,
          `Tier: ${row.pet_name}`,
          "Bitte öffnen Sie den geschützten Praxisbereich zur Prüfung.",
        ].join("\n"),
  };
}

async function deliverNotification(
  database: D1Database,
  env: DevelopmentEnv,
  row: NotificationRow,
): Promise<void> {
  const recipient =
    row.kind === "customer_reply"
      ? (row.notification_email?.trim().toLowerCase() ?? "")
      : await resolveRecipient(env);
  if (!isValidEmail(recipient)) {
    throw Object.assign(new Error("recipient_not_configured"), { retryable: false });
  }
  if (!isValidEmail(env.MAIL_FROM)) {
    throw Object.assign(new Error("sender_not_configured"), { retryable: false });
  }
  await env.EMAIL.send(notificationMail(row, recipient, env));
}

async function updateDeliveryState(
  database: D1Database,
  notificationId: string,
  state: "sent" | "failed" | "abandoned",
  errorCode: string | null,
): Promise<void> {
  await database
    .prepare(
      `UPDATE transfer_notifications
      SET state = ?, last_error_code = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END,
        updated_at = ?
      WHERE id = ?`,
    )
    .bind(
      state,
      errorCode,
      state,
      state === "sent" ? new Date().toISOString() : null,
      new Date().toISOString(),
      notificationId,
    )
    .run();
}

/** Queue consumer: retries transient mail failures and abandons permanent ones. */
export async function consumeNotifications(
  batch: MessageBatch<NotificationMessage>,
  env: DevelopmentEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = parseNotificationMessage(message.body);
    if (!parsed) {
      message.ack();
      continue;
    }
    const row = await loadNotification(env.TRANSFER_DB, parsed.notificationId);
    if (!row || row.state === "sent" || row.state === "abandoned") {
      message.ack();
      continue;
    }
    const attempt = row.attempts + 1;
    const claim = await env.TRANSFER_DB.prepare(
      `UPDATE transfer_notifications
        SET state = 'queued', attempts = ?, updated_at = ?
        WHERE id = ? AND state = ? AND attempts = ?
          AND state IN ('pending', 'failed', 'queued')
          AND attempts < ?`,
    )
      .bind(
        attempt,
        new Date().toISOString(),
        parsed.notificationId,
        row.state,
        row.attempts,
        MAXIMUM_NOTIFICATION_ATTEMPTS,
      )
      .run();
    if (claim.meta.changes !== 1) {
      message.ack();
      continue;
    }
    try {
      await deliverNotification(env.TRANSFER_DB, env, row);
      await updateDeliveryState(env.TRANSFER_DB, parsed.notificationId, "sent", null);
      message.ack();
    } catch (error) {
      const retryable =
        error instanceof Error &&
        (error as Error & { retryable?: boolean }).retryable !== false;
      const terminal = !retryable || attempt >= MAXIMUM_NOTIFICATION_ATTEMPTS;
      await updateDeliveryState(
        env.TRANSFER_DB,
        parsed.notificationId,
        terminal ? "abandoned" : "failed",
        error instanceof Error ? error.name : "unknown",
      ).catch(() => undefined);
      if (terminal) message.ack();
      else message.retry({ delaySeconds: Math.min(300, 2 ** attempt * 5) });
    }
  }
}
