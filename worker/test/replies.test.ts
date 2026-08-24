import { describe, expect, it } from "vitest";

import type { VerifiedAdminIdentity } from "../src/security/access-jwt";
import {
  createAdminReply,
  ReplyInputError,
  validateAdminReplyInput,
} from "../src/transfers/replies";

const admin: VerifiedAdminIdentity = {
  email: "praxis@example.test",
  subject: "admin-subject",
};

function result<T>(changes = 1): D1Result<T> {
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

class ReplyDatabase implements Pick<D1Database, "prepare" | "batch"> {
  readonly queries: { query: string; values: readonly unknown[] }[] = [];
  caseRow: { status: string } | null = { status: "open" };
  submissionRow: {
    id: string;
    notification_email: string | null;
    status: string;
  } | null = {
    id: "submission-1",
    notification_email: "kunde@example.test",
    status: "submitted",
  };
  batchChanges: number[] | null = null;

  prepare(query: string): D1PreparedStatement {
    const database = this;
    const statement = {
      query,
      values: [] as readonly unknown[],
      bind(...values: unknown[]) {
        const bound = { ...statement, values };
        database.queries.push({ query, values });
        return bound;
      },
      async first<T>() {
        return (
          query.includes("transfer_submissions")
            ? database.submissionRow
            : database.caseRow
        ) as T | null;
      },
      async run<T>() {
        return result<T>();
      },
      async all<T>() {
        return result<T>(0);
      },
      async raw<T>(_options?: { columnNames?: boolean }) {
        return [] as T;
      },
    };
    return statement as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return statements.map((_statement, index) =>
      result<T>(this.batchChanges?.[index] ?? 1),
    );
  }
}

describe("Praxisantworten und Rückrufstatus", () => {
  it("erlaubt genau 8.000 Zeichen, aber keine leere Antwort ohne Rückrufstatus", () => {
    expect(validateAdminReplyInput({ body: "a".repeat(8_000) }).body).toHaveLength(
      8_000,
    );
    expect(() => validateAdminReplyInput({ body: "a".repeat(8_001) })).toThrow();
    expect(() => validateAdminReplyInput({ body: "" })).toThrow();
    expect(
      validateAdminReplyInput({
        submissionId: "submission-1",
        callbackPlanned: true,
        callbackNote: "Morgen anrufen",
      }),
    ).toMatchObject({ body: null, callbackPlanned: true });
    expect(() => validateAdminReplyInput({ callbackPlanned: true })).toThrowError(
      ReplyInputError,
    );
  });

  it("speichert Antwort, Status und Notification nur bei Kundenwunsch atomar", async () => {
    const database = new ReplyDatabase();
    const response = await createAdminReply(
      database as unknown as D1Database,
      "case-1",
      admin,
      validateAdminReplyInput({
        submissionId: "submission-1",
        body: "Bitte beobachten Sie die Stelle weiter.",
      }),
      new Date("2026-08-05T10:00:00.000Z"),
    );

    expect(response).toMatchObject({
      status: "replied",
      notificationRequested: true,
    });
    expect(database.queries.map(({ query }) => query).join("\n")).toContain(
      "INSERT INTO transfer_notifications",
    );
    expect(database.queries.map(({ query }) => query).join("\n")).toContain(
      "INSERT INTO transfer_replies",
    );
  });

  it("legt ohne Benachrichtigungsadresse keine Kunden-Notification an", async () => {
    const database = new ReplyDatabase();
    database.submissionRow = { ...database.submissionRow!, notification_email: null };
    const response = await createAdminReply(
      database as unknown as D1Database,
      "case-1",
      admin,
      validateAdminReplyInput({ submissionId: "submission-1", body: "Antwort" }),
      new Date("2026-08-05T10:00:00.000Z"),
    );

    expect(response).toMatchObject({ notificationRequested: false });
    expect(database.queries.map(({ query }) => query).join("\n")).not.toContain(
      "INSERT INTO transfer_notifications",
    );
  });

  it("setzt callback_planned ohne Antwort und ohne Reply-Datensatz", async () => {
    const database = new ReplyDatabase();
    const response = await createAdminReply(
      database as unknown as D1Database,
      "case-1",
      admin,
      validateAdminReplyInput({
        submissionId: "submission-1",
        callbackPlanned: true,
        callbackNote: "Morgen vormittags anrufen",
      }),
      new Date("2026-08-05T10:00:00.000Z"),
    );

    expect(response).toEqual({
      status: "callback_planned",
      replyId: null,
      notificationRequested: false,
    });
    const queries = database.queries.map(({ query }) => query).join("\n");
    expect(queries).toContain("status = ?");
    expect(queries).toContain("callback_note");
    expect(queries).not.toContain("INSERT INTO transfer_replies");
  });

  it("weist eine submission aus einem anderen Fall vor jeder Mutation ab", async () => {
    const database = new ReplyDatabase();
    database.submissionRow = null;
    const response = await createAdminReply(
      database as unknown as D1Database,
      "case-1",
      admin,
      validateAdminReplyInput({ submissionId: "foreign", body: "Antwort" }),
      new Date("2026-08-05T10:00:00.000Z"),
    );

    expect(response).toBe("not_found");
    expect(database.queries.some(({ query }) => query.includes("INSERT"))).toBe(false);
  });
});
