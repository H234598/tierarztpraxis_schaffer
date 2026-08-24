import { describe, expect, it } from "vitest";

import type { DevelopmentRouteContext } from "../src/env";
import type { VerifiedAdminIdentity } from "../src/security/access-jwt";
import {
  handleAdminCaseApi,
  validateAdminCaseInput,
} from "../src/transfers/admin-cases";
import { routeAdmin } from "../src/transfers/routes-admin";

interface RecordedStatement {
  readonly query: string;
  readonly values: readonly unknown[];
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run<T>(): Promise<D1Result<T>>;
  bind(...values: unknown[]): RecordedStatement;
}

class RecordingDatabase {
  readonly statements: RecordedStatement[] = [];
  readonly batches: RecordedStatement[][] = [];
  readonly firstRows: unknown[] = [];
  readonly allRows: unknown[][] = [];
  batchChanges: number[] = [];
  batchError: Error | null = null;

  prepare(query: string): RecordedStatement {
    const database = this;
    const statement: RecordedStatement = {
      query,
      values: [],
      bind(...values: unknown[]) {
        const bound = { ...statement, values };
        database.statements.push(bound);
        return bound;
      },
      async first<T>() {
        return (database.firstRows.shift() ?? null) as T | null;
      },
      async all<T>() {
        return result((database.allRows.shift() ?? []) as T[]);
      },
      async run<T>() {
        return result<T>([], 1);
      },
    };
    return statement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (this.batchError) throw this.batchError;
    const recorded = statements as unknown as RecordedStatement[];
    this.batches.push(recorded);
    return recorded.map((_statement, index) =>
      result<T>([], this.batchChanges[index] ?? 1),
    );
  }
}

function result<T>(results: T[] = [], changes = 0): D1Result<T> {
  return {
    success: true,
    results,
    meta: { changes },
  } as D1Result<T>;
}

const admin: VerifiedAdminIdentity = {
  email: "admin@example.test",
  subject: "subject-1",
};

function context(
  database: RecordingDatabase,
  path: string,
  method = "GET",
  body?: unknown,
): DevelopmentRouteContext {
  const request = new Request(`https://admin.example.test${path}`, {
    method,
    headers: {
      origin: "https://admin.example.test",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    request,
    url: new URL(request.url),
    requestId: "request-1",
    env: {
      TRANSFER_DB: database,
      TOKEN_PEPPER: "test-pepper-at-least-32-characters-long",
    },
  } as unknown as DevelopmentRouteContext;
}

describe("Admin-Fallvertrag", () => {
  it.each([
    ["POST", "/api/admin/cases", { petName: "Luna" }],
    ["GET", "/api/admin/cases", undefined],
    ["GET", "/api/admin/cases/case-1", undefined],
    ["POST", "/api/admin/cases/case-1/tokens", {}],
    ["POST", "/api/admin/tokens/token-1/revoke", {}],
    ["PATCH", "/api/admin/cases/case-1/status", { status: "closed" }],
    ["POST", "/api/admin/cases/case-1/mark-exported", {}],
  ])(
    "erreicht %s %s ohne verifizierte Access-Identität nie",
    async (method, path, body) => {
      const database = new RecordingDatabase();
      const response = await routeAdmin(context(database, path, method, body), {
        verify: async () => null,
      });
      expect(response.status).toBe(401);
      expect(database.statements).toHaveLength(0);
      expect(database.batches).toHaveLength(0);
    },
  );

  it("normalisiert sichere Standardwerte für eine neue Fallanlage", () => {
    expect(validateAdminCaseInput({ petName: " Luna " })).toEqual({
      petName: "Luna",
      ownerDisplayName: null,
      internalReference: null,
      internalNote: null,
      expiresInDays: 14,
      maxSubmissions: 3,
      maxTotalBytes: 100 * 1_024 * 1_024,
      allowReplies: true,
      allowCallback: true,
    });
  });

  it.each([
    [{}, "petName"],
    [{ petName: "Luna", extra: true }, "body"],
    [{ petName: "Luna", expiresInDays: 31 }, "expiresInDays"],
    [{ petName: "Luna", maxSubmissions: 6 }, "maxSubmissions"],
    [{ petName: "Luna", maxTotalBytes: 999 }, "maxTotalBytes"],
  ])("weist ungültige oder zusätzliche Felder ab", (body, field) => {
    expect(() => validateAdminCaseInput(body)).toThrow(field);
  });

  it("legt Fall, Hash-Token und Audit atomar an und gibt Klartexttoken einmalig aus", async () => {
    const database = new RecordingDatabase();
    const response = await handleAdminCaseApi(
      context(database, "/api/admin/cases", "POST", { petName: "Luna" }),
      admin,
    );
    const payload = (await response!.json()) as Record<string, unknown>;

    expect(response!.status).toBe(201);
    expect(payload.token).toMatch(/^dt1_[A-Z2-7]{16}_[A-Za-z0-9_-]+$/u);
    expect(payload.shareUrl).toBe(`/datentransfer/#token=${payload.token}`);
    expect(database.batches[0]).toHaveLength(3);
    expect(database.batches[0]?.map(({ query }) => query)).toEqual([
      expect.stringContaining("INSERT INTO transfer_cases"),
      expect.stringContaining("INSERT INTO transfer_tokens"),
      expect.stringContaining("INSERT INTO transfer_audit_events"),
    ]);
    const stored = JSON.stringify(database.batches[0]);
    expect(stored).toContain("subject-1");
    expect(stored).toContain("admin@example.test");
    expect(stored).not.toContain(String(payload.token));
    expect(JSON.stringify(payload.case)).not.toContain("hmac");
  });

  it("listet stabil, gefiltert und ohne geheime Spalten", async () => {
    const database = new RecordingDatabase();
    database.firstRows.push({ total: 1 });
    database.allRows.push([
      {
        id: "case-1",
        public_id: "PUBLICCASE01",
        pet_name: "Luna",
        owner_display_name: "Familie M.",
        internal_reference: "P-12",
        status: "open",
        submission_count: 1,
        total_bytes: 100,
        created_at: "2026-08-04T10:00:00.000Z",
        expires_at: "2026-08-18T10:00:00.000Z",
        exported_at: null,
      },
    ]);
    const response = await handleAdminCaseApi(
      context(database, "/api/admin/cases?status=open&q=Luna&page=2"),
      admin,
    );
    const payload = await response!.json();

    expect(response!.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, page: 2, pageSize: 20, total: 1 });
    expect(JSON.stringify(payload)).not.toMatch(
      /token_hmac|internal_note|created_by_sub/u,
    );
    expect(database.statements[0]?.query).toContain("status = ?");
    expect(database.statements[0]?.values).toEqual([
      "open",
      "%Luna%",
      "%Luna%",
      "%Luna%",
      "%Luna%",
    ]);
    expect(database.statements[1]?.query).toContain(
      "ORDER BY created_at DESC, id DESC",
    );
    expect(database.statements[1]?.values).toEqual([
      "open",
      "%Luna%",
      "%Luna%",
      "%Luna%",
      "%Luna%",
      20,
      20,
    ]);
  });

  it("liefert Detailrelationen ohne Hashes, R2-Schlüssel oder ETags", async () => {
    const database = new RecordingDatabase();
    database.firstRows.push({
      id: "case-1",
      public_id: "PUBLICCASE01",
      pet_name: "Luna",
      owner_display_name: null,
      internal_reference: null,
      public_reference: null,
      internal_note: "Nur intern",
      callback_note: null,
      status: "open",
      allow_replies: 1,
      allow_callback: 1,
      max_submissions: 3,
      max_total_bytes: 1000,
      submission_count: 0,
      total_bytes: 0,
      created_by_email: "admin@example.test",
      created_at: "now",
      updated_at: "now",
      expires_at: "later",
      exported_at: null,
      closed_at: null,
    });
    database.allRows.push(
      [],
      [{ id: "file-1", original_name: "bild.jpg", state: "stored" }],
      [],
      [],
      [{ id: "token-1", token_hint: "ABCD", revoked_at: null }],
      [],
    );

    const response = await handleAdminCaseApi(
      context(database, "/api/admin/cases/case-1"),
      admin,
    );
    const text = await response!.text();
    expect(response!.status).toBe(200);
    expect(text).toContain("Nur intern");
    expect(text).not.toMatch(/token_hmac|session_hmac|r2_key|etag/u);
    expect(database.statements.every(({ values }) => values[0] === "case-1")).toBe(
      true,
    );
  });

  it("rotiert Token und sperrt bestehende Tokens samt Sitzungen", async () => {
    const database = new RecordingDatabase();
    database.firstRows.push({
      id: "case-1",
      public_id: "ABCDEFGHIJKLMNOP",
      status: "open",
      expires_at: "2026-08-30T10:00:00.000Z",
    });
    const response = await handleAdminCaseApi(
      context(database, "/api/admin/cases/case-1/tokens", "POST", {
        revokeExisting: true,
      }),
      admin,
    );
    const payload = (await response!.json()) as Record<string, unknown>;

    expect(response!.status).toBe(201);
    expect(payload.token).toMatch(/^dt1_/u);
    const queries = database.batches[0]?.map(({ query }) => query).join("\n") ?? "";
    expect(queries).toContain("UPDATE transfer_tokens");
    expect(queries).toContain("UPDATE transfer_sessions");
    expect(JSON.stringify(database.batches[0])).not.toContain(payload.token);
  });

  it("widerruft Token und Sitzungen idempotent und erlaubt nur explizite Statuswechsel", async () => {
    const database = new RecordingDatabase();
    const revoke = await handleAdminCaseApi(
      context(database, "/api/admin/tokens/token-1/revoke", "POST", {}),
      admin,
    );
    expect(revoke!.status).toBe(200);
    expect(database.batches[0]?.map(({ query }) => query).join("\n")).toContain(
      "transfer_sessions",
    );

    const invalidDatabase = new RecordingDatabase();
    invalidDatabase.firstRows.push({ status: "closed" });
    const invalid = await handleAdminCaseApi(
      context(invalidDatabase, "/api/admin/cases/case-1/status", "PATCH", {
        status: "closed",
      }),
      admin,
    );
    expect(invalid!.status).toBe(409);
    expect(invalidDatabase.batches).toHaveLength(0);

    const validDatabase = new RecordingDatabase();
    validDatabase.firstRows.push({ status: "open" });
    const valid = await handleAdminCaseApi(
      context(validDatabase, "/api/admin/cases/case-1/status", "PATCH", {
        status: "closed",
      }),
      admin,
    );
    expect(valid!.status).toBe(200);
    expect(validDatabase.batches[0]?.[0]?.query).toContain("status = 'open'");
  });

  it("markiert Export genau einmal und bindet Race-Audit an den erfolgreichen Zustand", async () => {
    const database = new RecordingDatabase();
    database.firstRows.push({ exported_at: null });
    const first = await handleAdminCaseApi(
      context(database, "/api/admin/cases/case-1/mark-exported", "POST", {}),
      admin,
    );
    expect(first!.status).toBe(200);
    expect(database.batches[0]?.[1]?.query).toContain("exported_at = ?");

    const repeatedDatabase = new RecordingDatabase();
    repeatedDatabase.firstRows.push({ exported_at: "2026-08-04T10:00:00.000Z" });
    const repeated = await handleAdminCaseApi(
      context(repeatedDatabase, "/api/admin/cases/case-1/mark-exported", "POST", {}),
      admin,
    );
    await expect(repeated!.json()).resolves.toMatchObject({
      exportedAt: "2026-08-04T10:00:00.000Z",
    });
    expect(repeatedDatabase.batches).toHaveLength(0);

    const racedDatabase = new RecordingDatabase();
    racedDatabase.firstRows.push({ status: "open" });
    racedDatabase.batchChanges = [0, 0];
    const raced = await handleAdminCaseApi(
      context(racedDatabase, "/api/admin/cases/case-1/status", "PATCH", {
        status: "closed",
      }),
      admin,
    );
    expect(raced!.status).toBe(409);
    expect(racedDatabase.batches[0]?.[1]?.query).toContain("updated_at = ?");
  });

  it("gibt bei D1-Fehlern nur generischen Fehler mit requestId aus", async () => {
    const database = new RecordingDatabase();
    database.batchError = new Error("SQL includes token_hmac and secret");
    const response = await handleAdminCaseApi(
      context(database, "/api/admin/cases", "POST", { petName: "Luna" }),
      admin,
    );
    const text = await response!.text();
    expect(response!.status).toBe(503);
    expect(text).toContain("request-1");
    expect(text).not.toMatch(/token_hmac|secret|dt1_/u);
  });
});
