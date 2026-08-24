import { describe, expect, it, vi } from "vitest";

import type { DevelopmentEnv } from "../src/env";
import {
  consumeNotifications,
  createPracticeSubmissionNotification,
  enqueueNotification,
  parseNotificationMessage,
  type NotificationMessage,
} from "../src/transfers/notifications";

function d1Result(changes = 1): D1Result {
  return {
    success: true,
    results: [],
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

class NotificationDatabase implements Pick<D1Database, "prepare"> {
  readonly queries: string[] = [];
  row: Record<string, unknown> | null = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "customer_reply",
    attempts: 0,
    state: "queued",
    notification_email: "kunde@example.test",
    public_id: "PUBLICCASE01",
    pet_name: "Luna",
  };
  replyNotificationId: string | null = null;

  prepare(query: string): D1PreparedStatement {
    const database = this;
    const statement = {
      bind(..._values: unknown[]) {
        database.queries.push(query);
        return statement;
      },
      async first<T>() {
        if (query.includes("SELECT id") && query.includes("customer_reply")) {
          return (
            database.replyNotificationId ? { id: database.replyNotificationId } : null
          ) as T | null;
        }
        return database.row as T | null;
      },
      async run<T>() {
        return d1Result() as D1Result<T>;
      },
      async all<T>() {
        return d1Result(0) as D1Result<T>;
      },
      async raw<T>(_options?: { columnNames?: boolean }) {
        return [] as T;
      },
    };
    return statement as unknown as D1PreparedStatement;
  }
}

class ConcurrentNotificationDatabase implements Pick<D1Database, "prepare"> {
  readonly queries: string[] = [];
  readonly row = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "customer_reply" as const,
    notification_email: "kunde@example.test",
    public_id: "PUBLICCASE01",
    pet_name: "Luna",
  };
  state = "queued";
  attempts = 0;
  private selectCount = 0;
  private releaseSelects!: () => void;
  private readonly bothSelected = new Promise<void>((resolve) => {
    this.releaseSelects = resolve;
  });

  prepare(query: string): D1PreparedStatement {
    const database = this;
    let values: readonly unknown[] = [];
    const statement = {
      bind(...bound: unknown[]) {
        values = bound;
        database.queries.push(query);
        return statement;
      },
      async first<T>() {
        const snapshot = {
          ...database.row,
          state: database.state,
          attempts: database.attempts,
        };
        database.selectCount++;
        if (database.selectCount === 2) database.releaseSelects();
        await database.bothSelected;
        return snapshot as T;
      },
      async run<T>() {
        if (query.includes("SET state = 'queued', attempts = ?")) {
          const expectedState = values.length >= 6 ? values[3] : database.state;
          const expectedAttempts = values.length >= 6 ? values[4] : database.attempts;
          const maximum = Number(values.at(-1));
          const claimed =
            database.state === expectedState &&
            database.attempts === expectedAttempts &&
            database.attempts < maximum;
          if (claimed) {
            database.state = "queued";
            database.attempts = Number(values[0]);
          }
          return d1Result(claimed ? 1 : 0) as D1Result<T>;
        }
        if (query.includes("SET state = ?, last_error_code")) {
          database.state = String(values[0]);
        }
        return d1Result() as D1Result<T>;
      },
    };
    return statement as unknown as D1PreparedStatement;
  }
}

function fakeEnvironment(
  database: NotificationDatabase,
  send: ReturnType<typeof vi.fn>,
): DevelopmentEnv {
  return {
    TRANSFER_DB: database as unknown as D1Database,
    EMAIL: { send },
    MAIL_FROM: "website@tierarztpraxis-schaffer.telacore.org",
  } as unknown as DevelopmentEnv;
}

function message(body: unknown): Message<NotificationMessage> {
  return {
    id: "message-1",
    timestamp: new Date("2026-08-05T10:00:00.000Z"),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  } as unknown as Message<NotificationMessage>;
}

function batch(
  ...messages: Message<NotificationMessage>[]
): MessageBatch<NotificationMessage> {
  return {
    messages,
    queue: "notifications",
    metadata: {},
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<NotificationMessage>;
}

describe("Datentransfer-Benachrichtigungen", () => {
  it("akzeptiert ausschließlich eine UUID-Nachricht ohne Nutzdaten", () => {
    expect(
      parseNotificationMessage({
        notificationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      notificationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parseNotificationMessage({ notificationId: "dt1_secret_token" })).toBeNull();
    expect(
      parseNotificationMessage({ notificationId: "id", body: "Bericht" }),
    ).toBeNull();
  });

  it("schreibt die Praxis-Notification zuerst und sendet danach nur ihre ID", async () => {
    const database = new NotificationDatabase();
    const id = await createPracticeSubmissionNotification(
      database as unknown as D1Database,
      "case-1",
      "submission-1",
      new Date("2026-08-05T10:00:00.000Z"),
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/u);
    const queue = { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
    await expect(
      enqueueNotification(database as unknown as D1Database, queue, id!),
    ).resolves.toBe(true);
    expect(queue.send).toHaveBeenCalledWith(
      { notificationId: id },
      { contentType: "json" },
    );
  });

  it("sendet Kunden-Mail ohne Token und ohne Antworttext und bestätigt die Queue-Nachricht", async () => {
    const database = new NotificationDatabase();
    const send = vi.fn().mockResolvedValue({ messageId: "mail-1" });
    const current = message({ notificationId: database.row!.id });

    await consumeNotifications(batch(current), fakeEnvironment(database, send));

    expect(send).toHaveBeenCalledOnce();
    const mail = send.mock.calls[0]?.[0] as { text: string };
    expect(mail.text).not.toContain("dt1_");
    expect(mail.text).not.toContain("Antworttext");
    expect(current.ack).toHaveBeenCalledOnce();
    expect(current.retry).not.toHaveBeenCalled();
  });

  it("sendet bei gleichzeitiger doppelter Zustellung nur eine Mail", async () => {
    const database = new ConcurrentNotificationDatabase();
    const send = vi.fn().mockResolvedValue({ messageId: "mail-1" });
    const first = message({ notificationId: database.row.id });
    const duplicate = message({ notificationId: database.row.id });

    await Promise.all([
      consumeNotifications(batch(first), fakeEnvironment(database as any, send)),
      consumeNotifications(batch(duplicate), fakeEnvironment(database as any, send)),
    ]);

    expect(send).toHaveBeenCalledOnce();
    expect(first.ack).toHaveBeenCalledOnce();
    expect(duplicate.ack).toHaveBeenCalledOnce();
  });

  it("markiert transiente Mailfehler und fordert einen Retry an", async () => {
    const database = new NotificationDatabase();
    const send = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const current = message({ notificationId: database.row!.id });

    await consumeNotifications(batch(current), fakeEnvironment(database, send));

    expect(current.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    expect(current.ack).not.toHaveBeenCalled();
    expect(
      database.queries.filter((query) =>
        query.includes("UPDATE transfer_notifications"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("bestätigt ungültige Queue-Nachrichten ohne Datenbank- oder Mailzugriff", async () => {
    const database = new NotificationDatabase();
    const send = vi.fn();
    const current = message({ notificationId: "not-a-uuid", report: "secret" });

    await consumeNotifications(batch(current), fakeEnvironment(database, send));

    expect(current.ack).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(database.queries).toHaveLength(0);
  });
});
