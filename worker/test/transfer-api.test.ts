import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import { generateCsrfToken } from "../src/security/csrf";
import { hashRateLimitKey } from "../src/security/rate-limit";
import { verifyTurnstile } from "../src/security/turnstile";
import { hmacHex } from "../src/security/hmac";
import { hmacTransferSession } from "../src/transfers/sessions";
import { generateTransferToken } from "../src/transfers/tokens";

const apiOrigin = "https://tierarztpraxis-schaffer.telacore.org";

function unusedBinding(name: string): never {
  throw new Error(`unused test binding: ${name}`);
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected object");
  }
  return Object.assign(Object.create(null), value);
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected array");
  return value;
}

interface PreparedCall {
  readonly query: string;
  readonly values: readonly unknown[];
}

function result<T>(results: T[], changes = 0): D1Result<T> {
  return {
    success: true,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
    results,
  };
}

class FakeD1Statement implements D1PreparedStatement {
  constructor(
    private readonly database: FakeD1Database,
    readonly query: string,
    readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    const statement = new FakeD1Statement(this.database, this.query, values);
    this.database.prepared.push(statement);
    return statement;
  }

  first<T = unknown>(columnName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  first<T = Record<string, unknown>>(_columnName?: string): Promise<T | null> {
    return Promise.resolve(this.database.first<T>(this.query, this.values));
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.database.runs.push({ query: this.query, values: this.values });
    const changes = this.query.includes("UPDATE transfer_sessions")
      ? this.database.sessionUpdateChanges
      : 1;
    return Promise.resolve(result<T>([], changes));
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve(this.database.all<T>(this.query));
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(
    _options?: { columnNames?: boolean },
  ): Promise<T[] | [string[], ...T[]]> {
    return unusedBinding("D1 raw");
  }
}

class FakeD1Database implements D1Database {
  readonly prepared: FakeD1Statement[] = [];
  readonly runs: PreparedCall[] = [];
  batchSize = 0;
  failBatch = false;
  sessionUpdateChanges = 1;
  tokenCase: Readonly<Record<string, unknown>> | null = null;
  sessionCase: Readonly<Record<string, unknown>> | null = null;
  storedFile: Readonly<Record<string, unknown>> | null = null;
  storedFileId = "file-1";
  storedFileCaseId = "case-1";
  beforeStoredFileLookup: (() => void) | null = null;
  submissions: Readonly<Record<string, unknown>>[] = [];
  links: Readonly<Record<string, unknown>>[] = [];
  files: Readonly<Record<string, unknown>>[] = [];
  replies: Readonly<Record<string, unknown>>[] = [];

  prepare(query: string): D1PreparedStatement {
    return new FakeD1Statement(this, query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    this.batchSize = statements.length;
    if (this.failBatch) throw new Error("simulated D1 batch failure");
    return Promise.all(statements.map((statement) => statement.run<T>()));
  }

  exec(_query: string): Promise<D1ExecResult> {
    return unusedBinding("D1 exec");
  }

  withSession(
    _constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint,
  ): D1DatabaseSession {
    return unusedBinding("D1 session");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  private customerStoredFile(
    query: string,
    values: readonly unknown[],
  ): Readonly<Record<string, unknown>> | null {
    if (query.includes("FROM transfer_files AS f")) {
      const beforeLookup = this.beforeStoredFileLookup;
      this.beforeStoredFileLookup = null;
      beforeLookup?.();
    }
    const session = this.sessionCase;
    const now = new Date().toISOString();
    const [fileId, caseId, sessionId, sessionExpiryAt, absoluteExpiryAt, caseExpiryAt] =
      values;
    const requiredPredicates = [
      "s.id = f.submission_id AND s.case_id = f.case_id",
      "active_session.case_id = c.id",
      "f.id = ? AND f.case_id = ? AND f.state = 'stored'",
      "active_session.id = ? AND active_session.revoked_at IS NULL",
      "active_session.expires_at > ? AND active_session.absolute_expires_at > ?",
      "c.status = 'open' AND c.expires_at > ?",
    ];
    if (
      !this.storedFile ||
      !session ||
      !requiredPredicates.every((predicate) => query.includes(predicate)) ||
      fileId !== this.storedFileId ||
      caseId !== this.storedFileCaseId ||
      sessionId !== session.session_id ||
      caseId !== session.case_id ||
      sessionExpiryAt !== now ||
      absoluteExpiryAt !== now ||
      caseExpiryAt !== now ||
      session.session_revoked_at !== null ||
      typeof session.session_expires_at !== "string" ||
      session.session_expires_at <= now ||
      typeof session.absolute_expires_at !== "string" ||
      session.absolute_expires_at <= now ||
      session.status !== "open" ||
      typeof session.expires_at !== "string" ||
      session.expires_at <= now
    ) {
      return null;
    }
    return this.storedFile;
  }

  first<T>(query: string, values: readonly unknown[] = []): T | null {
    const row = query.includes("FROM transfer_sessions AS s")
      ? this.sessionCase
      : query.includes("FROM transfer_files AS f")
        ? this.customerStoredFile(query, values)
        : query.includes("transfer_tokens")
          ? this.tokenCase
          : null;
    return row === null ? null : Object.assign(Object.create(null), row);
  }

  all<T>(query: string): D1Result<T> {
    const rows = query.includes("transfer_links")
        ? this.links
        : query.includes("transfer_files")
          ? this.files
          : query.includes("transfer_replies")
            ? this.replies
            : query.includes("transfer_submissions")
              ? this.submissions
            : [];
    return result(
      rows.map((row) => Object.assign(Object.create(null), row)),
    );
  }
}

function developmentEnvironment(
  limiterSuccess = true,
  transferDatabase?: D1Database,
  transferFiles?: R2Bucket,
): Cloudflare.DevelopmentEnv {
  return {
    ENVIRONMENT: "development",
    ALLOWED_ORIGINS:
      "https://tierarztpraxis-schaffer.telacore.org,https://h234598.github.io,http://localhost:4321",
    EXPECTED_HOSTNAMES:
      "tierarztpraxis-schaffer.telacore.org,h234598.github.io,test",
    EXPECTED_TURNSTILE_ACTION: "contact_form",
    CONTACT_RECIPIENT_KEY: "contact:recipient:development",
    TEST_CONTACT_RECIPIENT: "tierarztpraxis_schaffer@herr-der-mails.de",
    MAIL_FROM: "website@tierarztpraxis-schaffer.telacore.org",
    TURNSTILE_SECRET: "turnstile-secret",
    RATE_LIMIT_SALT: "rate-limit-salt",
    TOKEN_PEPPER: "token-pepper",
    SESSION_PEPPER: "session-pepper",
    ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    ACCESS_ADMIN_API_AUD: "test-audience",
    get CONTACT_CONFIG(): KVNamespace {
      return unusedBinding("CONTACT_CONFIG");
    },
    get TRANSFER_DB(): D1Database {
      return transferDatabase ?? unusedBinding("TRANSFER_DB");
    },
    get TRANSFER_FILES(): R2Bucket {
      return transferFiles ?? unusedBinding("TRANSFER_FILES");
    },
    get TRANSFER_NOTIFICATIONS(): Queue {
      return unusedBinding("TRANSFER_NOTIFICATIONS");
    },
    CONTACT_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: limiterSuccess }),
    },
    get EMAIL(): SendEmail {
      return unusedBinding("EMAIL");
    },
  };
}

function productionEnvironment(): Cloudflare.ProductionEnv {
  return {
    ENVIRONMENT: "production",
    ALLOWED_ORIGINS: apiOrigin,
    EXPECTED_HOSTNAMES: "tierarztpraxis-schaffer.telacore.org",
    EXPECTED_TURNSTILE_ACTION: "contact_form",
    CONTACT_RECIPIENT_KEY: "contact:recipient:production",
    MAIL_FROM: "website@tierarztpraxis-schaffer.telacore.org",
    TURNSTILE_SECRET: "turnstile-secret",
    RATE_LIMIT_SALT: "rate-limit-salt",
    get CONTACT_CONFIG(): KVNamespace {
      return unusedBinding("CONTACT_CONFIG");
    },
    CONTACT_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    get EMAIL(): SendEmail {
      return unusedBinding("EMAIL");
    },
  };
}

const executionContext: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  get exports(): Cloudflare.Exports {
    return unusedBinding("exports");
  },
  props: undefined,
  get tracing(): Tracing {
    return unusedBinding("tracing");
  },
};

function transferRequest(
  path: string,
  body: string | null,
  headers: Readonly<Record<string, string>> = {},
  method = "POST",
): Request {
  return new Request(`${apiOrigin}${path}`, {
    method,
    headers,
    body,
  });
}

function sessionRequest(
  body: Readonly<Record<string, unknown>>,
  url = `${apiOrigin}/api/transfers/session`,
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      origin: apiOrigin,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

function successfulTurnstile(): Response {
  return new Response(
    JSON.stringify({ success: true, hostname: "test", action: "test" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function tokenFixture(
  database: FakeD1Database,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const generated = await generateTransferToken("token-pepper");
  database.tokenCase = {
    case_id: "case-1",
    public_id: generated.storage.publicCaseId,
    pet_name: "Luna",
    public_reference: "Kontrolle Haut",
    internal_reference: "P-123",
    internal_note: "Never public",
    callback_note: "Never public",
    created_by_sub: "admin-sub",
    created_by_email: "admin@example.org",
    status: "open",
    allow_replies: 1,
    allow_callback: 1,
    max_submissions: 3,
    max_total_bytes: 1_000,
    submission_count: 1,
    total_bytes: 200,
    expires_at: "2026-08-18T20:00:00.000Z",
    delete_after: "2026-09-18T20:00:00.000Z",
    token_id: "token-1",
    token_version: generated.storage.version,
    token_hmac: generated.storage.tokenHmac,
    token_expires_at: "2026-08-18T20:00:00.000Z",
    token_revoked_at: null,
    ...overrides,
  };
  return generated.token;
}

async function sessionFixture(
  database: FakeD1Database,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<{ readonly cookie: string; readonly csrfToken: string }> {
  const cookie = "A".repeat(43);
  const csrf = await generateCsrfToken("session-pepper");
  database.sessionCase = {
    session_id: "session-1",
    case_id: "case-1",
    session_hmac: await hmacTransferSession(cookie, "session-pepper"),
    csrf_hmac: csrf.csrfHmac,
    session_expires_at: "2026-08-04T10:20:00.000Z",
    absolute_expires_at: "2026-08-04T22:00:00.000Z",
    session_revoked_at: null,
    token_id: "token-1",
    token_revoked_at: null,
    token_expires_at: "2026-08-18T20:00:00.000Z",
    public_id: "ABCD2345EFGH",
    pet_name: "Luna",
    public_reference: "Kontrolle Haut",
    internal_reference: "P-123",
    internal_note: "Never public",
    callback_note: "Never public",
    created_by_sub: "admin-sub",
    created_by_email: "admin@example.org",
    status: "open",
    allow_replies: 1,
    allow_callback: 1,
    max_submissions: 3,
    max_total_bytes: 1_000,
    submission_count: 1,
    total_bytes: 200,
    expires_at: "2026-08-18T20:00:00.000Z",
    delete_after: "2026-09-18T20:00:00.000Z",
    ...overrides,
  };
  return { cookie, csrfToken: csrf.token };
}

const storedFile = {
  r2Key: "cases/case-1/submissions/submission-1/file-1",
  originalName: "befund.jpg",
  mediaType: "image/jpeg",
  size: 3,
  etag: "etag-1",
  inlineSafe: 1,
};

function storedFileBucket(counter: { reads: number }): R2Bucket {
  return {
    async get() {
      counter.reads += 1;
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff]));
            controller.close();
          },
        }),
        size: storedFile.size,
        etag: storedFile.etag,
      };
    },
  } as unknown as R2Bucket;
}

function authenticatedRequest(
  path: string,
  cookie: string,
  method = "GET",
  csrfToken?: string,
  origin = apiOrigin,
): Request {
  const headers = new Headers({ cookie: `dt_session=${cookie}` });
  if (method === "POST") headers.set("origin", origin);
  if (csrfToken) headers.set("x-datentransfer-csrf", csrfToken);
  return new Request(`${apiOrigin}${path}`, { method, headers });
}

function findForbiddenKey(value: unknown): string | null {
  const forbidden = new Set([
    "internal_note",
    "callback_note",
    "internal_reference",
    "created_by_sub",
    "created_by_email",
    "notification_email",
    "callback_phone",
    "token_hmac",
    "session_hmac",
    "csrf_hmac",
    "r2_key",
    "etag",
    "delete_after",
  ]);
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key)) return key;
    const found = findForbiddenKey(nested);
    if (found) return found;
  }
  return null;
}

function normalizeError(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = Object.assign(Object.create(null), value);
  if (
    body.error &&
    typeof body.error === "object" &&
    !Array.isArray(body.error)
  ) {
    body.error.requestId = "request-id";
  }
  return body;
}

function execute(request: Request, env: Parameters<typeof worker.fetch>[1]) {
  return worker.fetch(request, env, executionContext);
}

function expectTransferHeaders(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe(
    "application/json; charset=utf-8",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T10:00:00.000Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("public transfer API", () => {
  it("fails closed in production before transfer bindings exist", async () => {
    const response = await execute(
      transferRequest("/api/transfers/case", null, {}, "GET"),
      productionEnvironment(),
    );

    expect(response.status).toBe(503);
    expectTransferHeaders(response);
  });

  it("returns uniform not-found errors for unknown paths and methods", async () => {
    for (const request of [
      transferRequest("/api/transfers/unknown", null, {}, "GET"),
      transferRequest("/api/transfers/session", null, {}, "GET"),
    ]) {
      const response = await execute(request, developmentEnvironment());
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "not_found", message: "Not found" },
      });
      expectTransferHeaders(response);
    }
  });

  it.each([null, "null", "https://evil.example"])(
    "rejects missing or foreign Origin %j",
    async (origin) => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (origin !== null) headers.origin = origin;
      const response = await execute(
        transferRequest(
          "/api/transfers/session",
          JSON.stringify({ token: "x", turnstileToken: "x" }),
          headers,
        ),
        developmentEnvironment(),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "forbidden", message: "Request forbidden" },
      });
      expectTransferHeaders(response);
    },
  );

  it("enforces JSON and the 4 KiB body limit", async () => {
    const wrongType = await execute(
      transferRequest(
        "/api/transfers/session",
        "token=x",
        { origin: apiOrigin, "content-type": "text/plain" },
      ),
      developmentEnvironment(),
    );
    expect(wrongType.status).toBe(415);

    const oversized = await execute(
      transferRequest(
        "/api/transfers/session",
        JSON.stringify({ token: "x".repeat(4_097), turnstileToken: "x" }),
        { origin: apiOrigin, "content-type": "application/json" },
      ),
      developmentEnvironment(),
    );
    expect(oversized.status).toBe(413);
  });

  it.each([
    {},
    { token: "x", turnstileToken: "x", extra: "x" },
    { token: 1, turnstileToken: "x" },
    { token: "x".repeat(257), turnstileToken: "x" },
    { token: "x", turnstileToken: "x".repeat(2_049) },
  ])("rejects non-exact request bodies %#", async (body) => {
    const response = await execute(
      transferRequest(
        "/api/transfers/session",
        JSON.stringify(body),
        { origin: apiOrigin, "content-type": "application/json" },
      ),
      developmentEnvironment(),
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops rate-limited requests before Turnstile and D1", async () => {
    const response = await execute(
      transferRequest(
        "/api/transfers/session",
        JSON.stringify({ token: "x", turnstileToken: "x" }),
        {
          origin: apiOrigin,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.10",
        },
      ),
      developmentEnvironment(false),
    );

    expect(response.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("domain-separates contact and transfer rate-limit keys", async () => {
    const request = transferRequest(
      "/api/transfers/session",
      null,
      { "cf-connecting-ip": "203.0.113.10" },
    );
    const env = developmentEnvironment();

    await expect(hashRateLimitKey(request, env)).resolves.not.toBe(
      await hashRateLimitKey(request, env, "transfer-session-v1"),
    );
  });

  it("validates Turnstile hostname and explicit transfer action", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          hostname: "tierarztpraxis-schaffer.telacore.org",
          action: "datatransfer_session",
        }),
      ),
    );
    await expect(
      verifyTurnstile(
        "turnstile-token",
        "request-id",
        developmentEnvironment(),
        "datatransfer_session",
      ),
    ).resolves.toBe(true);

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          hostname: "tierarztpraxis-schaffer.telacore.org",
          action: "contact_form",
        }),
      ),
    );
    await expect(
      verifyTurnstile(
        "turnstile-token",
        "request-id",
        developmentEnvironment(),
        "datatransfer_session",
      ),
    ).resolves.toBe(false);
  });

  it("allows test/test only in Development and rejects oversized tokens pre-fetch", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, hostname: "test", action: "test" }),
      ),
    );
    await expect(
      verifyTurnstile(
        "turnstile-token",
        "request-id",
        developmentEnvironment(),
        "datatransfer_session",
      ),
    ).resolves.toBe(true);
    await expect(
      verifyTurnstile(
        "turnstile-token",
        "request-id",
        productionEnvironment(),
        "datatransfer_session",
      ),
    ).resolves.toBe(false);

    vi.mocked(fetch).mockClear();
    await expect(
      verifyTurnstile(
        "x".repeat(2_049),
        "request-id",
        developmentEnvironment(),
        "datatransfer_session",
      ),
    ).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("exchanges a valid token with an atomic session batch and public DTO", async () => {
    const database = new FakeD1Database();
    const token = await tokenFixture(database);
    vi.mocked(fetch).mockResolvedValue(successfulTurnstile());

    const response = await execute(
      sessionRequest({ token, turnstileToken: "turnstile-token" }),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(200);
    expectTransferHeaders(response);
    const body = requireObject(await response.json());
    const caseDto = requireObject(body.case);
    expect(body).toMatchObject({
      ok: true,
      case: {
        publicId: database.tokenCase?.public_id,
        petName: "Luna",
        publicReference: "Kontrolle Haut",
        expiresAt: "2026-08-18T20:00:00.000Z",
        remainingSubmissions: 2,
        remainingBytes: 800,
        allowReplies: true,
        allowCallback: true,
      },
    });
    expect(Object.keys(caseDto)).toEqual([
      "publicId",
      "petName",
      "publicReference",
      "expiresAt",
      "remainingSubmissions",
      "remainingBytes",
      "allowReplies",
      "allowCallback",
    ]);
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers.get("set-cookie")).toMatch(
      /^dt_session=[A-Za-z0-9_-]{43}; Max-Age=1800; Path=\/api\/transfers\/; Secure; HttpOnly; SameSite=Strict$/,
    );
    expect(database.batchSize).toBe(2);
    expect(database.runs.some((call) => call.query.includes("use_count"))).toBe(
      true,
    );

    const persistence = JSON.stringify(database.runs);
    const cookieSecret = response.headers
      .get("set-cookie")
      ?.match(/^dt_session=([^;]+)/)?.[1];
    expect(persistence).not.toContain(token);
    expect(persistence).not.toContain(cookieSecret);
    expect(persistence).not.toContain(body.csrfToken);
    expect(persistence).toMatch(/[0-9a-f]{64}/);
  });

  it("clamps exhausted case quotas to zero", async () => {
    const database = new FakeD1Database();
    const token = await tokenFixture(database, {
      submission_count: 8,
      total_bytes: 2_000,
    });
    vi.mocked(fetch).mockResolvedValue(successfulTurnstile());

    const response = await execute(
      sessionRequest({ token, turnstileToken: "turnstile-token" }),
      developmentEnvironment(true, database),
    );
    const body = requireObject(await response.json());
    const caseDto = requireObject(body.case);
    expect(caseDto.remainingSubmissions).toBe(0);
    expect(caseDto.remainingBytes).toBe(0);
  });

  it("fails closed without cookie or partial writes when the atomic batch fails", async () => {
    const database = new FakeD1Database();
    const token = await tokenFixture(database);
    database.failBatch = true;
    vi.mocked(fetch).mockResolvedValue(successfulTurnstile());
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await execute(
      sessionRequest({ token, turnstileToken: "turnstile-token" }),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(database.batchSize).toBe(2);
    expect(database.runs).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toBe("transfer_api_unexpected_error");
    expect(JSON.stringify(error.mock.calls)).not.toContain(token);
  });

  it("returns one generic unauthorized contract for every token and case failure", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulTurnstile());
    const failures: unknown[] = [];

    for (const overrides of [
      { token_hmac: "0".repeat(64) },
      { token_expires_at: "2026-08-04T10:00:00.000Z" },
      { token_revoked_at: "2026-08-04T09:00:00.000Z" },
      { status: "closed" },
      { expires_at: "2026-08-04T10:00:00.000Z" },
    ]) {
      const database = new FakeD1Database();
      const token = await tokenFixture(database, overrides);
      const response = await execute(
        sessionRequest({ token, turnstileToken: "turnstile-token" }),
        developmentEnvironment(true, database),
      );
      expect(response.status).toBe(401);
      failures.push(normalizeError(await response.json()));
    }

    const missingDatabase = new FakeD1Database();
    const missingToken = await tokenFixture(missingDatabase);
    missingDatabase.tokenCase = null;
    const response = await execute(
      sessionRequest({ token: missingToken, turnstileToken: "turnstile-token" }),
      developmentEnvironment(true, missingDatabase),
    );
    expect(response.status).toBe(401);
    failures.push(normalizeError(await response.json()));

    expect(new Set(failures.map((failure) => JSON.stringify(failure))).size).toBe(
      1,
    );
  });

  it("runs a dummy HMAC verification when the public case lookup misses", async () => {
    const database = new FakeD1Database();
    const token = await tokenFixture(database);
    database.tokenCase = null;
    vi.mocked(fetch).mockResolvedValue(successfulTurnstile());
    const verify = vi.spyOn(crypto.subtle, "verify");

    const response = await execute(
      sessionRequest({ token, turnstileToken: "turnstile-token" }),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(401);
    expect(verify).toHaveBeenCalled();
    expect(database.prepared[0]?.query).not.toContain(token);
    const publicId = token.split("_")[1];
    const secret = token.split("_")[2];
    if (secret === undefined) {
      throw new Error("Transfer token missing secret segment");
    }
    expect(database.prepared[0]?.values).toEqual([
      publicId,
      await hmacHex("token-pepper", secret),
    ]);
  });

  it("ignores URL fragments and uses only the JSON token", async () => {
    const database = new FakeD1Database();
    const token = await tokenFixture(database);
    vi.mocked(fetch).mockResolvedValue(successfulTurnstile());

    const response = await execute(
      sessionRequest(
        { token, turnstileToken: "turnstile-token" },
        `${apiOrigin}/api/transfers/session#token=wrong`,
      ),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(200);
  });

  it("loads a case snapshot by session case_id with strict DTO allowlists", async () => {
    const database = new FakeD1Database();
    const { cookie } = await sessionFixture(database);
    database.submissions = [
      {
        id: "submission-1",
        case_id: "case-1",
        title: "Linkes Ohr",
        message: "Beobachtung ohne Diagnose.",
        observed_since: "Gestern",
        urgency: "normal",
        callback_requested: 0,
        callback_phone: "0911 secret",
        notification_email: "secret@example.org",
        status: "submitted",
        created_at: "2026-08-04T09:00:00.000Z",
        finalized_at: "2026-08-04T09:05:00.000Z",
      },
    ];
    database.links = [
      {
        id: "link-1",
        submission_id: "submission-1",
        url: "https://example.org/video",
        label: "Video",
        created_at: "2026-08-04T09:01:00.000Z",
      },
    ];
    database.files = [
      {
        id: "file-1",
        submission_id: "submission-1",
        original_name: "ohr.jpg",
        declared_media_type: "image/jpeg",
        verified_media_type: "image/jpeg",
        expected_size: 200,
        stored_size: 200,
        state: "stored",
        created_at: "2026-08-04T09:02:00.000Z",
        uploaded_at: "2026-08-04T09:03:00.000Z",
        r2_key: "secret-key",
        etag: "secret-etag",
        delete_after: "2026-09-04T09:00:00.000Z",
      },
    ];
    database.replies = [
      {
        id: "reply-1",
        submission_id: "submission-1",
        body: "Bitte Termin vereinbaren.",
        created_at: "2026-08-04T09:10:00.000Z",
        created_by_sub: "admin-sub",
        created_by_email: "admin@example.org",
      },
    ];

    const response = await execute(
      authenticatedRequest("/api/transfers/case", cookie),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(200);
    expectTransferHeaders(response);
    expect(response.headers.get("set-cookie")).toBe(
      `dt_session=${cookie}; Max-Age=1800; Path=/api/transfers/; Secure; HttpOnly; SameSite=Strict`,
    );
    const body = requireObject(await response.json());
    const submissions = requireArray(body.submissions);
    const links = requireArray(body.links);
    const files = requireArray(body.files);
    const replies = requireArray(body.replies);
    expect(Object.keys(body)).toEqual([
      "ok",
      "case",
      "submissions",
      "links",
      "files",
      "replies",
    ]);
    expect(Object.keys(requireObject(submissions[0]))).toEqual([
      "id",
      "title",
      "message",
      "observedSince",
      "urgency",
      "callbackRequested",
      "status",
      "createdAt",
      "finalizedAt",
    ]);
    expect(Object.keys(requireObject(links[0]))).toEqual([
      "id",
      "submissionId",
      "url",
      "label",
      "createdAt",
    ]);
    expect(Object.keys(requireObject(files[0]))).toEqual([
      "id",
      "submissionId",
      "originalName",
      "declaredMediaType",
      "verifiedMediaType",
      "expectedSize",
      "storedSize",
      "state",
      "createdAt",
      "uploadedAt",
    ]);
    expect(Object.keys(requireObject(replies[0]))).toEqual([
      "id",
      "submissionId",
      "body",
      "createdAt",
    ]);
    expect(findForbiddenKey(body)).toBeNull();

    const dataQueries = database.prepared.filter((statement) =>
      /transfer_(submissions|links|files|replies)/.test(statement.query),
    );
    expect(dataQueries).toHaveLength(4);
    for (const query of dataQueries) expect(query.values).toEqual(["case-1"]);
    expect(
      database.runs.some(
        (call) =>
          call.query.includes("last_seen_at") &&
          call.values.includes("session-1"),
      ),
    ).toBe(true);
  });

  it("returns one generic unauthorized contract for invalid GET sessions", async () => {
    const failures: unknown[] = [];
    for (const cookieHeader of [
      null,
      "dt_session=wrong",
      `dt_session=${"A".repeat(43)}; dt_session=${"A".repeat(43)}`,
    ]) {
      const request = new Request(`${apiOrigin}/api/transfers/case`, {
        headers: cookieHeader ? { cookie: cookieHeader } : {},
      });
      const response = await execute(request, developmentEnvironment());
      expect(response.status).toBe(401);
      failures.push(normalizeError(await response.json()));
    }

    for (const overrides of [
      { session_expires_at: "2026-08-04T10:00:00.000Z" },
      { absolute_expires_at: "2026-08-04T10:00:00.000Z" },
      { session_revoked_at: "2026-08-04T09:00:00.000Z" },
      { status: "closed" },
      { expires_at: "2026-08-04T10:00:00.000Z" },
    ]) {
      const database = new FakeD1Database();
      const { cookie } = await sessionFixture(database, overrides);
      const response = await execute(
        authenticatedRequest("/api/transfers/case", cookie),
        developmentEnvironment(true, database),
      );
      expect(response.status).toBe(401);
      failures.push(normalizeError(await response.json()));
    }
    expect(new Set(failures.map((failure) => JSON.stringify(failure))).size).toBe(
      1,
    );
  });

  it("liefert gespeicherte Customer-Datei nur über gebundene Live-Session", async () => {
    const database = new FakeD1Database();
    const { cookie } = await sessionFixture(database);
    database.storedFile = storedFile;
    const counter = { reads: 0 };

    const response = await execute(
      authenticatedRequest("/api/transfers/files/file-1", cookie),
      developmentEnvironment(true, database, storedFileBucket(counter)),
    );

    expect(response.status).toBe(200);
    expect(counter.reads).toBe(1);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
    const fileQueries = database.prepared.filter((statement) =>
      statement.query.includes("FROM transfer_files AS f"),
    );
    expect(fileQueries).toHaveLength(1);
    expect(fileQueries[0]?.values).toEqual([
      "file-1",
      "case-1",
      "session-1",
      "2026-08-04T10:00:00.000Z",
      "2026-08-04T10:00:00.000Z",
      "2026-08-04T10:00:00.000Z",
    ]);
    expect(fileQueries[0]?.query).toContain("f.state = 'stored'");
    expect(fileQueries[0]?.query).toContain("active_session.revoked_at IS NULL");
    expect(fileQueries[0]?.query).toContain("active_session.expires_at > ?");
    expect(fileQueries[0]?.query).toContain("active_session.absolute_expires_at > ?");
    expect(fileQueries[0]?.query).toContain("c.status = 'open'");
    expect(fileQueries[0]?.query).toContain("c.expires_at > ?");
  });

  it.each([
    ["widerrufene", { session_revoked_at: "2026-08-04T09:59:59.000Z" }],
    ["abgelaufene", { session_expires_at: "2026-08-04T10:00:00.000Z" }],
  ])("wiederholt %s Sessionprüfung bei D1-Dateizugriff", async (_label, overrides) => {
    const database = new FakeD1Database();
    const { cookie } = await sessionFixture(database);
    database.storedFile = storedFile;
    database.beforeStoredFileLookup = () => {
      database.sessionCase = { ...database.sessionCase, ...overrides };
    };
    const counter = { reads: 0 };

    const response = await execute(
      authenticatedRequest("/api/transfers/files/file-1", cookie),
      developmentEnvironment(true, database, storedFileBucket(counter)),
    );

    expect(response.status).toBe(404);
    expect(counter.reads).toBe(0);
    expect(
      database.prepared.filter((statement) =>
        statement.query.includes("FROM transfer_files AS f"),
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["fremde File-ID", "file-foreign", null],
    ["fallfremde Datei", "file-1", "case-foreign"],
  ])("weist %s nach frischer Bindung ohne R2 als 404 ab", async (_label, fileId, fileCaseId) => {
    const database = new FakeD1Database();
    const { cookie } = await sessionFixture(database);
    database.storedFile = storedFile;
    if (fileCaseId) {
      database.beforeStoredFileLookup = () => {
        database.storedFileCaseId = fileCaseId;
      };
    }
    const counter = { reads: 0 };

    const response = await execute(
      authenticatedRequest(`/api/transfers/files/${fileId}`, cookie),
      developmentEnvironment(true, database, storedFileBucket(counter)),
    );

    expect(response.status).toBe(404);
    expect(counter.reads).toBe(0);
    const fileQuery = database.prepared.find((statement) =>
      statement.query.includes("FROM transfer_files AS f"),
    );
    expect(fileQuery?.values.slice(0, 3)).toEqual([
      fileId,
      "case-1",
      "session-1",
    ]);
    expect(fileQuery?.query).toContain("f.case_id = ?");
  });

  it("does not expose a snapshot when sliding renewal loses a revoke race", async () => {
    const database = new FakeD1Database();
    const { cookie } = await sessionFixture(database);
    database.sessionUpdateChanges = 0;

    const response = await execute(
      authenticatedRequest("/api/transfers/case", cookie),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Invalid or expired credentials",
      },
    });
    expect(
      database.prepared.some((statement) =>
        /transfer_(submissions|links|files|replies)/.test(statement.query),
      ),
    ).toBe(false);
  });

  it("revokes a live session with exact Origin and CSRF then clears cookie", async () => {
    const database = new FakeD1Database();
    const { cookie, csrfToken } = await sessionFixture(database);
    const response = await execute(
      authenticatedRequest(
        "/api/transfers/session/logout",
        cookie,
        "POST",
        csrfToken,
      ),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toBe(
      "dt_session=; Max-Age=0; Path=/api/transfers/; Secure; HttpOnly; SameSite=Strict",
    );
    expect(
      database.runs.some(
        (call) =>
          call.query.includes("revoked_at") &&
          call.values[1] === "session-1",
      ),
    ).toBe(true);
  });

  it("does not report logout success when session revocation loses a race", async () => {
    const database = new FakeD1Database();
    const { cookie, csrfToken } = await sessionFixture(database);
    database.sessionUpdateChanges = 0;

    const response = await execute(
      authenticatedRequest(
        "/api/transfers/session/logout",
        cookie,
        "POST",
        csrfToken,
      ),
      developmentEnvironment(true, database),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Invalid or expired credentials",
      },
    });
  });

  it("rejects logout with foreign Origin, invalid session, or invalid CSRF", async () => {
    const database = new FakeD1Database();
    const { cookie } = await sessionFixture(database);
    const foreign = await execute(
      authenticatedRequest(
        "/api/transfers/session/logout",
        cookie,
        "POST",
        "A".repeat(43),
        "https://evil.example",
      ),
      developmentEnvironment(true, database),
    );
    expect(foreign.status).toBe(403);

    const missing = await execute(
      transferRequest(
        "/api/transfers/session/logout",
        null,
        { origin: apiOrigin },
      ),
      developmentEnvironment(),
    );
    expect(missing.status).toBe(401);

    const badCsrf = await execute(
      authenticatedRequest(
        "/api/transfers/session/logout",
        cookie,
        "POST",
        "B".repeat(43),
      ),
      developmentEnvironment(true, database),
    );
    expect(badCsrf.status).toBe(403);
  });
});
