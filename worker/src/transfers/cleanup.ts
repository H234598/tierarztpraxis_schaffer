import {
  enqueueNotification,
  MAXIMUM_NOTIFICATION_ATTEMPTS,
  type NotificationMessage,
} from "./notifications";

const BATCH_SIZE = 100;
const DRAFT_RETENTION_MS = 24 * 60 * 60 * 1_000;

type Database = D1Database;
interface CleanupBindings {
  readonly TRANSFER_DB: D1Database;
  readonly TRANSFER_FILES: Pick<R2Bucket, "delete"> & Partial<Pick<R2Bucket, "list">>;
  readonly TRANSFER_NOTIFICATIONS: Queue<NotificationMessage>;
}

export interface CleanupResult {
  sessions: number;
  tokens: number;
  drafts: number;
  files: number;
  cases: number;
  notifications: number;
}

async function ids(
  database: Database,
  query: string,
  ...parameters: string[]
): Promise<string[]> {
  const result = await database
    .prepare(query)
    .bind(...parameters)
    .all<{ id: string }>();
  return result.results
    .map((row) => row.id)
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(0, BATCH_SIZE);
}

export async function cleanupExpired(
  env: CleanupBindings,
  now = new Date(),
): Promise<CleanupResult> {
  const database = env.TRANSFER_DB;
  const timestamp = now.toISOString();
  const draftBefore = new Date(now.getTime() - DRAFT_RETENTION_MS).toISOString();
  const result: CleanupResult = {
    sessions: 0,
    tokens: 0,
    drafts: 0,
    files: 0,
    cases: 0,
    notifications: 0,
  };

  const sessionIds = await ids(
    database,
    "SELECT id FROM transfer_sessions WHERE (expires_at <= ? OR absolute_expires_at <= ?) AND revoked_at IS NULL LIMIT 100",
    timestamp,
    timestamp,
  );
  if (sessionIds.length) {
    await database.batch(
      sessionIds.map((id) =>
        database
          .prepare(
            "UPDATE transfer_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
          )
          .bind(timestamp, id),
      ),
    );
    result.sessions = sessionIds.length;
  }
  const tokenIds = await ids(
    database,
    "SELECT id FROM transfer_tokens WHERE expires_at <= ? AND revoked_at IS NULL LIMIT 100",
    timestamp,
  );
  if (tokenIds.length) {
    await database.batch(
      tokenIds.map((id) =>
        database
          .prepare(
            "UPDATE transfer_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
          )
          .bind(timestamp, id),
      ),
    );
    result.tokens = tokenIds.length;
  }

  const draftIds = await ids(
    database,
    "SELECT id FROM transfer_submissions WHERE status = 'draft' AND updated_at <= ? LIMIT 100",
    draftBefore,
  );
  if (draftIds.length) {
    await database.batch(
      draftIds.map((id) =>
        database
          .prepare(
            "DELETE FROM transfer_submissions WHERE id = ? AND status = 'draft' AND updated_at <= ?",
          )
          .bind(id, draftBefore),
      ),
    );
    result.drafts = draftIds.length;
  }

  const files = await database
    .prepare(
      "SELECT id, r2_key FROM transfer_files WHERE delete_after <= ? AND state <> 'deleted' LIMIT 100",
    )
    .bind(timestamp)
    .all<{ id: string; r2_key: string }>();
  for (const file of files.results) {
    if (
      typeof file.id !== "string" ||
      typeof file.r2_key !== "string" ||
      file.r2_key.length === 0
    )
      continue;
    try {
      await env.TRANSFER_FILES.delete(file.r2_key);
      await database
        .prepare(
          "UPDATE transfer_files SET state = 'deleted' WHERE id = ? AND delete_after <= ? AND state <> 'deleted'",
        )
        .bind(file.id, timestamp)
        .run();
      result.files++;
    } catch {
      // Deliberately no key or error details: cleanup is fail-closed and retryable.
    }
  }

  // Only inspect the transfer namespace and only delete keys that are both
  // unreferenced in D1 and older than the draft retention window. This grace
  // period avoids racing a just-created upload before its D1 row is visible.
  if (typeof env.TRANSFER_FILES.list === "function") {
    try {
      const referenced = new Set(
        (
          await database
            .prepare("SELECT r2_key FROM transfer_files WHERE state <> 'deleted'")
            .all<{ r2_key: string }>()
        ).results
          .map((row) => row.r2_key)
          .filter((key): key is string => typeof key === "string"),
      );
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await env.TRANSFER_FILES.list({
          prefix: "cases/",
          limit: BATCH_SIZE,
          ...(cursor ? { cursor } : {}),
        });
        for (const object of page.objects) {
          if (
            !referenced.has(object.key) &&
            object.uploaded.getTime() <= now.getTime() - DRAFT_RETENTION_MS
          ) {
            try {
              await env.TRANSFER_FILES.delete(object.key);
              result.files++;
            } catch {
              // Keep the object for the next reconciliation run.
            }
          }
        }
        cursor = page.truncated ? page.cursor : undefined;
        pages++;
      } while (cursor && pages < 10);
    } catch {
      // An unavailable listing must never widen deletion scope.
    }
  }

  const caseIds = await ids(
    database,
    "SELECT id FROM transfer_cases WHERE delete_after <= ? AND status IN ('closed', 'expired') LIMIT 100",
    timestamp,
  );
  if (caseIds.length) {
    await database.batch(
      caseIds.map((id) =>
        database
          .prepare(
            "DELETE FROM transfer_cases WHERE id = ? AND delete_after <= ? AND status IN ('closed', 'expired')",
          )
          .bind(id, timestamp),
      ),
    );
    result.cases = caseIds.length;
  }
  const notificationCutoff = new Date(now.getTime() - 15 * 60 * 1_000).toISOString();
  const notificationIds = await ids(
    database,
    `SELECT id FROM transfer_notifications
      WHERE state IN ('queued', 'failed') AND updated_at <= ?
        AND attempts < ${MAXIMUM_NOTIFICATION_ATTEMPTS}
      LIMIT ${BATCH_SIZE}`,
    notificationCutoff,
  );
  for (const id of notificationIds) {
    const reset = await database
      .prepare(
        `UPDATE transfer_notifications SET state = 'pending', updated_at = ?
        WHERE id = ? AND state IN ('queued', 'failed') AND updated_at <= ?
          AND attempts < ${MAXIMUM_NOTIFICATION_ATTEMPTS}`,
      )
      .bind(timestamp, id, notificationCutoff)
      .run();
    if (
      reset.meta.changes === 1 &&
      (await enqueueNotification(database, env.TRANSFER_NOTIFICATIONS, id, now))
    ) {
      result.notifications++;
    }
  }
  return result;
}

export type CleanupEnv = CleanupBindings;
