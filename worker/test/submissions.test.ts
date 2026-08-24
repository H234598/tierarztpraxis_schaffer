import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import { generateCsrfToken } from "../src/security/csrf";
import { hmacHex } from "../src/security/hmac";
import { validateSubmissionInput } from "../src/transfers/submissions";

const apiOrigin = "https://tierarztpraxis-schaffer.telacore.org";

const validInput = {
  title: "Tagesbericht",
  message: "Dies ist ein ausreichend langer Bericht für die Praxis.",
  urgency: "normal",
  callbackRequested: false,
  links: [],
  files: [],
  notEmergencyConfirmed: true,
};

function unusedBinding(name: string): never {
  throw new Error(`unused test binding: ${name}`);
}

function d1Result<T>(results: T[], changes = 0): D1Result<T> {
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

class SubmissionStatement implements D1PreparedStatement {
  constructor(
    private readonly database: SubmissionDatabase,
    readonly query: string,
    readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    const statement = new SubmissionStatement(this.database, this.query, values);
    this.database.prepared.push(statement);
    return statement;
  }

  first<T = unknown>(columnName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  first<T = Record<string, unknown>>(_columnName?: string): Promise<T | null> {
    return Promise.resolve(this.database.first<T>(this.query));
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.database.runs.push({ query: this.query, values: this.values });
    const changes = this.query.includes("UPDATE transfer_submissions")
      ? this.database.sessionMutationChanges === 0
        ? 0
        : this.database.finalizeChanges
      : 1;
    return Promise.resolve(d1Result<T>([], changes));
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve(d1Result<T>([]));
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw<T = unknown[]>(_options?: {
    columnNames?: boolean;
  }): Promise<T[] | [string[], ...T[]]> {
    return unusedBinding("D1 raw");
  }
}

interface PreparedCall {
  readonly query: string;
  readonly values: readonly unknown[];
}

class SubmissionDatabase implements D1Database {
  readonly prepared: SubmissionStatement[] = [];
  readonly runs: PreparedCall[] = [];
  sessionCase: Readonly<Record<string, unknown>> | null = null;
  sessionMutationChanges = 1;
  quotaAvailable = true;
  finalizeChanges = 1;
  failBatch = false;
  batchCount = 0;
  lastBatchSize = 0;

  prepare(query: string): D1PreparedStatement {
    return new SubmissionStatement(this, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.batchCount += 1;
    this.lastBatchSize = statements.length;
    if (this.failBatch) throw new Error("simulated D1 batch failure");
    return statements.map((statement, index) => {
      const changes =
        index === 0
          ? this.sessionMutationChanges
          : statement instanceof SubmissionStatement &&
              statement.query.includes("UPDATE transfer_submissions")
            ? this.finalizeChanges
            : this.quotaAvailable
              ? 1
              : 0;
      return d1Result<T>([], changes);
    });
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

  first<T>(query: string): T | null {
    const row = query.includes("transfer_sessions") ? this.sessionCase : null;
    return row === null ? null : Object.assign(Object.create(null), row);
  }
}

function environment(database: D1Database): Cloudflare.DevelopmentEnv {
  return {
    ENVIRONMENT: "development",
    ALLOWED_ORIGINS:
      "https://tierarztpraxis-schaffer.telacore.org,https://h234598.github.io,http://localhost:4321",
    EXPECTED_HOSTNAMES: "tierarztpraxis-schaffer.telacore.org,h234598.github.io,test",
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
    TRANSFER_DB: database,
    get TRANSFER_FILES(): R2Bucket {
      return unusedBinding("TRANSFER_FILES");
    },
    get TRANSFER_NOTIFICATIONS(): Queue {
      return unusedBinding("TRANSFER_NOTIFICATIONS");
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

async function sessionFixture(
  database: SubmissionDatabase,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<{ readonly cookie: string; readonly csrfToken: string }> {
  const cookie = "A".repeat(43);
  const csrf = await generateCsrfToken("session-pepper");
  database.sessionCase = {
    session_id: "session-1",
    case_id: "case-1",
    session_hmac: await hmacHex("session-pepper", `session-v1\0${cookie}`),
    csrf_hmac: csrf.csrfHmac,
    session_expires_at: "2026-08-04T10:20:00.000Z",
    absolute_expires_at: "2026-08-04T22:00:00.000Z",
    session_revoked_at: null,
    public_id: "ABCD2345EFGH",
    pet_name: "Luna",
    public_reference: "Kontrolle Haut",
    status: "open",
    allow_replies: 1,
    allow_callback: 1,
    max_submissions: 3,
    max_total_bytes: 100_000_000,
    submission_count: 1,
    total_bytes: 200,
    expires_at: "2026-08-18T20:00:00.000Z",
    token_expires_at: "2026-08-04T11:00:00.000Z",
    token_revoked_at: null,
    ...overrides,
  };
  return { cookie, csrfToken: csrf.token };
}

function apiRequest(
  path: string,
  cookie: string,
  csrfToken: string,
  body?: unknown,
  origin = apiOrigin,
): Request {
  const headers = new Headers({
    origin,
    cookie: `dt_session=${cookie}`,
    "x-datentransfer-csrf": csrfToken,
  });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${apiOrigin}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  });
}

function execute(request: Request, database: SubmissionDatabase): Promise<Response> {
  return worker.fetch(request, environment(database), executionContext);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T10:00:00.000Z"));
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Berichtseingaben", () => {
  it.each([
    ["Notfallbestätigung", { ...validInput, notEmergencyConfirmed: false }],
    ["HTTP-Link", { ...validInput, links: [{ url: "http://example.test" }] }],
    [
      "Link mit Zugangsdaten",
      { ...validInput, links: [{ url: "https://user:pass@example.test" }] },
    ],
    ["Callback ohne Freigabe", { ...validInput, callbackRequested: true }],
    [
      "zu viele Links",
      { ...validInput, links: Array(9).fill({ url: "https://example.test" }) },
    ],
  ])("weist %s ab", (_reason, input) => {
    expect(() => validateSubmissionInput(input, { allowCallback: false })).toThrow();
  });

  it.each([
    { ...validInput, title: "ab" },
    { ...validInput, title: "a".repeat(121) },
    { ...validInput, message: "a".repeat(19) },
    { ...validInput, message: "a".repeat(8_001) },
    { ...validInput, observedSince: "a".repeat(201) },
    { ...validInput, notificationEmail: "ungueltig" },
    { ...validInput, extra: true },
  ])("weist Text-, Mail- oder Formgrenzen ab %#", (input) => {
    expect(() => validateSubmissionInput(input, { allowCallback: true })).toThrow();
  });

  it.each([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "video/mp4",
    "video/quicktime",
    "video/webm",
  ])("akzeptiert erlaubten Medientyp %s", (mediaType) => {
    expect(() =>
      validateSubmissionInput(
        {
          ...validInput,
          files: [{ name: "aufnahme.bin", mediaType, size: 1 }],
        },
        { allowCallback: true },
      ),
    ).not.toThrow();
  });

  it.each([
    { name: "x.svg", mediaType: "image/svg+xml", size: 1 },
    { name: "x.jpg", mediaType: "image/jpeg", size: 12 * 1_024 * 1_024 + 1 },
    { name: "x.mp4", mediaType: "video/mp4", size: 50 * 1_024 * 1_024 + 1 },
    { name: "x.jpg", mediaType: "image/jpeg", size: 0 },
    { name: "x.jpg", mediaType: "image/jpeg", size: 1.5 },
  ])("weist unsichere Dateimetadaten ab %#", (file) => {
    expect(() =>
      validateSubmissionInput(
        { ...validInput, files: [file] },
        { allowCallback: true },
      ),
    ).toThrow();
  });

  it("weist mehr als acht Dateien ab", () => {
    expect(() =>
      validateSubmissionInput(
        {
          ...validInput,
          files: Array(9).fill({ name: "x.jpg", mediaType: "image/jpeg", size: 1 }),
        },
        { allowCallback: true },
      ),
    ).toThrow();
  });

  it("akzeptiert einen freigegebenen widerspruchsfreien Rückruf", () => {
    expect(() =>
      validateSubmissionInput(
        {
          ...validInput,
          urgency: "callback_requested",
          callbackRequested: true,
          callbackPhone: "0911 123456",
        },
        { allowCallback: true },
      ),
    ).not.toThrow();
  });
});

describe("Submission API", () => {
  it("verlangt exakte Origin, gültige Session und sessiongebundenes CSRF", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database);

    const foreign = await execute(
      apiRequest(
        "/api/transfers/submissions",
        cookie,
        csrfToken,
        validInput,
        "https://evil.example",
      ),
      database,
    );
    expect(foreign.status).toBe(403);

    const missingSession = await execute(
      apiRequest("/api/transfers/submissions", "B".repeat(43), csrfToken, validInput),
      database,
    );
    expect(missingSession.status).toBe(401);

    const badCsrf = await execute(
      apiRequest("/api/transfers/submissions", cookie, "B".repeat(43), validInput),
      database,
    );
    expect(badCsrf.status).toBe(403);
  });

  it("erstellt nach Widerruf zwischen Sessionprüfung und Batch keinen Draft", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database);
    database.sessionMutationChanges = 0;

    const response = await execute(
      apiRequest("/api/transfers/submissions", cookie, csrfToken, validInput),
      database,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  it("finalisiert nach Ablauf zwischen Sessionprüfung und Batch nicht", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database);
    database.sessionMutationChanges = 0;

    const response = await execute(
      apiRequest("/api/transfers/submissions/submission-1/finalize", cookie, csrfToken),
      database,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  it("reserviert Quote atomar und erzeugt Draft, Links und Uploadslots", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database);
    const response = await execute(
      apiRequest("/api/transfers/submissions", cookie, csrfToken, {
        ...validInput,
        links: [{ url: "https://example.test/video", label: "Video" }],
        files: [{ name: "ohr.jpg", mediaType: "image/jpeg", size: 123 }],
      }),
      database,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      uploads: [
        {
          fileId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          uploadUrl: expect.stringMatching(/^\/api\/transfers\/uploads\//),
          expiresAt: "2026-08-05T10:00:00.000Z",
        },
      ],
    });
    expect(
      database.prepared.some((statement) => statement.query.includes("'draft'")),
    ).toBe(true);
    const persisted = JSON.stringify(
      database.prepared.map(({ query, values }) => ({ query, values })),
    );
    expect(persisted).toContain("cases/case-1/submissions/");
    expect(persisted).not.toContain("cases/case-1/submissions/ohr.jpg");
    expect(database.batchCount).toBe(1);
    expect(database.lastBatchSize).toBe(5);
    expect(
      database.prepared.filter((statement) =>
        statement.query.includes("UPDATE transfer_cases"),
      ),
    ).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("weist erschöpfte Quoten und changes=0 ohne Erfolg ab", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database);
    database.quotaAvailable = false;
    const response = await execute(
      apiRequest("/api/transfers/submissions", cookie, csrfToken, validInput),
      database,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
    expect(database.batchCount).toBe(1);
  });

  it("weist erschöpfte Fallbytequote vor der Reservierung ab", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database, {
      max_total_bytes: 1_000,
      total_bytes: 900,
    });
    const response = await execute(
      apiRequest("/api/transfers/submissions", cookie, csrfToken, {
        ...validInput,
        files: [{ name: "ohr.jpg", mediaType: "image/jpeg", size: 101 }],
      }),
      database,
    );

    expect(response.status).toBe(409);
    expect(database.batchCount).toBe(0);
  });

  it("schlägt bei Batchfehler ohne Erfolg fehl", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database);
    database.failBatch = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await execute(
      apiRequest("/api/transfers/submissions", cookie, csrfToken, validInput),
      database,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("bindet Finalisierung an Submission und Session-Fall", async () => {
    const database = new SubmissionDatabase();
    const { cookie, csrfToken } = await sessionFixture(database);
    const response = await execute(
      apiRequest("/api/transfers/submissions/submission-1/finalize", cookie, csrfToken),
      database,
    );

    expect(response.status).toBe(200);
    const update = database.prepared.find((statement) =>
      statement.query.includes("UPDATE transfer_submissions"),
    );
    expect(update?.values).toContain("submission-1");
    expect(update?.values).toContain("case-1");
    expect(update?.query).toContain("f.state <> 'stored'");
    expect(update?.query).toContain("f.stored_size IS NULL");
    expect(
      database.prepared.filter((statement) =>
        statement.query.includes("UPDATE transfer_cases"),
      ),
    ).toHaveLength(0);
    expect(database.lastBatchSize).toBe(3);
    expect(
      database.prepared.some((statement) =>
        statement.query.includes("INSERT INTO transfer_notifications"),
      ),
    ).toBe(true);
    await expect(response.json()).resolves.not.toHaveProperty("notificationId");
  });

  it.each(["pending file", "rejected file", "foreign case", "replay"])(
    "finalisiert nicht bei %s",
    async () => {
      const database = new SubmissionDatabase();
      const { cookie, csrfToken } = await sessionFixture(database);
      database.finalizeChanges = 0;
      const response = await execute(
        apiRequest(
          "/api/transfers/submissions/submission-1/finalize",
          cookie,
          csrfToken,
        ),
        database,
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ ok: false });
    },
  );
});
