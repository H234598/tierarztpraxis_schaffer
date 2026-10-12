import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const allowedOrigin = "https://tierarztpraxis-schaffer.telacore.org";
const testRecipient = "tierarztpraxis_schaffer@herr-der-mails.de";

function turnstileResponse(hostname: string, action: string): Response {
  return new Response(JSON.stringify({ success: true, hostname, action }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Max Mustermann",
    email: "max@example.org",
    phone: "0911 123456",
    category: "appointment",
    message: "Ich möchte gerne einen Termin für mein Tier anfragen.",
    companyWebsite: "",
    privacyAccepted: true,
    startedAt: Date.now() - 5_000,
    turnstileToken: "test-token",
    ...overrides,
  };
}

function request(body: Record<string, unknown>, origin = allowedOrigin): Request {
  return new Request("https://api.tierarztpraxis-schaffer.telacore.org/v1/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "cf-connecting-ip": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

interface RawRequestOptions {
  readonly method?: string;
  readonly origin?: string | null;
  readonly contentType?: string | null;
  readonly headers?: Readonly<Record<string, string>>;
}

function rawRequest(body: string | null, options: RawRequestOptions = {}): Request {
  const headers = new Headers(options.headers);
  const origin = options.origin === undefined ? allowedOrigin : options.origin;
  const contentType =
    options.contentType === undefined ? "application/json" : options.contentType;

  if (origin !== null) headers.set("origin", origin);
  if (contentType !== null) headers.set("content-type", contentType);

  return new Request("https://api.tierarztpraxis-schaffer.telacore.org/v1/contact", {
    method: options.method ?? "POST",
    headers,
    body,
  });
}

function expectSecurityHeaders(response: Response, origin?: string): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("access-control-allow-origin")).toBe(origin ?? null);
}

function contactConfig(value: string | null = null): KVNamespace {
  return {
    get: vi.fn().mockResolvedValue(value),
    getWithMetadata: vi.fn(),
    list: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function unusedTestBinding(name: string): never {
  throw new Error(`unused test binding: ${name}`);
}

function environment(
  overrides: Partial<Cloudflare.DevelopmentEnv> = {},
): Cloudflare.DevelopmentEnv {
  return {
    ENVIRONMENT: "development",
    ALLOWED_ORIGINS:
      "https://tierarztpraxis-schaffer.telacore.org,https://h234598.github.io,http://localhost:4321",
    EXPECTED_HOSTNAMES: "tierarztpraxis-schaffer.telacore.org,h234598.github.io,test",
    EXPECTED_TURNSTILE_ACTION: "contact_form",
    CONTACT_RECIPIENT_KEY: "contact:recipient:development",
    TEST_CONTACT_RECIPIENT: testRecipient,
    MAIL_FROM: "website@tierarztpraxis-schaffer.telacore.org",
    TURNSTILE_SECRET: "test-secret",
    RATE_LIMIT_SALT: "test-rate-limit-salt",
    get TOKEN_PEPPER(): string {
      return unusedTestBinding("TOKEN_PEPPER");
    },
    get SESSION_PEPPER(): string {
      return unusedTestBinding("SESSION_PEPPER");
    },
    get ACCESS_TEAM_DOMAIN(): string {
      return unusedTestBinding("ACCESS_TEAM_DOMAIN");
    },
    get ACCESS_ADMIN_API_AUD(): string {
      return unusedTestBinding("ACCESS_ADMIN_API_AUD");
    },
    CONTACT_CONFIG: contactConfig(),
    get TRANSFER_DB(): D1Database {
      return unusedTestBinding("TRANSFER_DB");
    },
    get TRANSFER_FILES(): R2Bucket {
      return unusedTestBinding("TRANSFER_FILES");
    },
    get TRANSFER_NOTIFICATIONS(): Queue {
      return unusedTestBinding("TRANSFER_NOTIFICATIONS");
    },
    CONTACT_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    EMAIL: {
      send: vi.fn().mockResolvedValue({ messageId: "test-message" }),
    },
    ...overrides,
  };
}

function productionEnvironment(
  overrides: Partial<Cloudflare.ProductionEnv> = {},
): Cloudflare.ProductionEnv {
  return {
    ENVIRONMENT: "production",
    ALLOWED_ORIGINS: allowedOrigin,
    EXPECTED_HOSTNAMES: "tierarztpraxis-schaffer.telacore.org",
    EXPECTED_TURNSTILE_ACTION: "contact_form",
    CONTACT_RECIPIENT_KEY: "contact:recipient:production",
    MAIL_FROM: "website@tierarztpraxis-schaffer.telacore.org",
    TURNSTILE_SECRET: "test-secret",
    RATE_LIMIT_SALT: "test-rate-limit-salt",
    CONTACT_CONFIG: contactConfig(),
    CONTACT_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    EMAIL: {
      send: vi.fn().mockResolvedValue({ messageId: "test-message" }),
    },
    ...overrides,
  };
}

const executionContext: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  get exports(): Cloudflare.Exports {
    throw new Error("unused test execution context export");
  },
  props: undefined,
  get tracing(): Tracing {
    throw new Error("unused test execution context tracing");
  },
};

function execute(request: Request, env: WorkerEnv): Promise<Response> {
  return worker.fetch(request, env, executionContext);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(turnstileResponse("test", "test")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Kontaktformular-Worker", () => {
  it("meldet seinen Zustand ohne personenbezogene Daten", async () => {
    const response = await execute(
      new Request("https://api.tierarztpraxis-schaffer.telacore.org/health"),
      environment(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "tierarztpraxis-schaffer-contact",
      environment: "development",
    });
    expectSecurityHeaders(response);
  });

  it("antwortet auf unbekannte Pfade mit not_found", async () => {
    const response = await execute(
      new Request("https://api.tierarztpraxis-schaffer.telacore.org/unknown"),
      environment(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
    expectSecurityHeaders(response);
  });

  it("weist eine fehlende Origin mit forbidden ab", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await execute(
      rawRequest(JSON.stringify(payload()), { origin: null }),
      environment(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expectSecurityHeaders(response);
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('"outcome":"forbidden_origin"'),
    );
  });

  it("liefert auf gültiges OPTIONS den unveränderten CORS-Vertrag", async () => {
    const response = await execute(
      rawRequest(null, { method: "OPTIONS" }),
      environment(),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expectSecurityHeaders(response, allowedOrigin);
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type");
    expect(response.headers.get("access-control-max-age")).toBe("600");
  });

  it("weist andere Methoden mit method_not_allowed ab", async () => {
    const response = await execute(
      rawRequest(null, { method: "GET", contentType: null }),
      environment(),
    );

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({
      error: "method_not_allowed",
    });
    expectSecurityHeaders(response, allowedOrigin);
  });

  it("weist einen falschen Content-Type ab", async () => {
    const response = await execute(
      rawRequest("name=Max", { contentType: "application/x-www-form-urlencoded" }),
      environment(),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_media_type",
    });
    expectSecurityHeaders(response, allowedOrigin);
  });

  it("meldet syntaktisch ungültiges JSON mit Formularfeld", async () => {
    const response = await execute(rawRequest("{"), environment());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_json",
      fields: ["form"],
    });
  });

  it("meldet ein nicht-objektförmiges JSON-Payload", async () => {
    const response = await execute(rawRequest("[]"), environment());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_payload",
      fields: ["form"],
    });
  });

  it("weist deklarierte Bodies über 8 KiB vor dem Lesen ab", async () => {
    const response = await execute(
      rawRequest("{}", { headers: { "content-length": "8193" } }),
      environment(),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "payload_too_large",
      fields: ["form"],
    });
  });

  it("weist gelesene Bodies über 8 KiB ab", async () => {
    const response = await execute(
      rawRequest(`{"message":"${"x".repeat(8_193)}"}`),
      environment(),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "payload_too_large",
      fields: ["form"],
    });
  });

  it("weist eine fremde Origin ab", async () => {
    const env = environment();
    const response = await execute(request(payload(), "https://evil.example"), env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expectSecurityHeaders(response);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });

  it("behandelt einen ausgelösten Honeypot neutral und sendet keine Mail", async () => {
    const env = environment();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await execute(
      request(payload({ companyWebsite: "https://spam.example" })),
      env,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(env.CONTACT_RATE_LIMITER.limit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('"outcome":"bot_signal"'),
    );
  });

  it("antwortet bei ausgeschöpftem Rate Limit mit 429", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const env = environment({
      CONTACT_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: false }),
      },
    });
    const response = await execute(request(payload()), env);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "too_many_requests",
    });
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('"outcome":"rate_limited"'),
    );
  });

  it("liefert alle ungültigen Formularfelder in stabiler Reihenfolge", async () => {
    const response = await execute(
      request(
        payload({
          name: "x",
          email: "invalid",
          phone: "x",
          category: "invalid",
          message: "kurz",
          privacyAccepted: false,
          startedAt: 0,
          turnstileToken: "",
        }),
      ),
      environment(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_form",
      fields: [
        "name",
        "email",
        "phone",
        "category",
        "message",
        "privacyAccepted",
        "startedAt",
        "turnstileToken",
      ],
    });
  });

  it("weist eine abgelehnte Turnstile-Prüfung ab", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false }), { status: 200 }),
        ),
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const env = environment();
    const response = await execute(request(payload()), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "security_check_failed",
    });
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('"outcome":"turnstile_failed"'),
    );
  });

  it("akzeptiert in Produktion keinen fremden Turnstile-Host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(turnstileResponse("evil.example", "contact_form")),
    );
    const env = productionEnvironment();
    const response = await execute(request(payload()), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "security_check_failed",
    });
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });

  it("sendet in Entwicklung an den festgelegten Testempfänger", async () => {
    const env = environment();
    const response = await execute(request(payload()), env);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
    expectSecurityHeaders(response, allowedOrigin);
    expect(env.EMAIL.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testRecipient,
        from: "website@tierarztpraxis-schaffer.telacore.org",
        replyTo: "max@example.org",
      }),
    );
  });

  it("bewahrt Subject, Text und Reply-To der Kontaktmail", async () => {
    const requestId = "00000000-0000-4000-8000-000000000012";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(requestId);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const env = environment();
    const response = await execute(request(payload()), env);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, requestId });
    expect(env.EMAIL.send).toHaveBeenCalledWith({
      to: testRecipient,
      from: "website@tierarztpraxis-schaffer.telacore.org",
      subject: `[Website] Terminanfrage – ${requestId}`,
      text: [
        "Neue Nachricht über die Praxis-Website",
        "",
        `Anfrage-ID: ${requestId}`,
        "Umgebung: development",
        "Anliegen: Terminanfrage",
        "Name: Max Mustermann",
        "E-Mail: max@example.org",
        "Telefon: 0911 123456",
        "",
        "Nachricht:",
        "Ich möchte gerne einen Termin für mein Tier anfragen.",
      ].join("\n"),
      replyTo: "max@example.org",
    });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"outcome":"accepted"'));
  });

  it("bevorzugt einen gültigen Development-Empfänger aus KV", async () => {
    const env = environment({
      CONTACT_CONFIG: contactConfig("anderer-test@example.org"),
    });
    const response = await execute(request(payload()), env);

    expect(response.status).toBe(202);
    expect(env.EMAIL.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "anderer-test@example.org" }),
    );
  });

  it("fällt in Produktion niemals auf die Testadresse zurück", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          turnstileResponse("tierarztpraxis-schaffer.telacore.org", "contact_form"),
        ),
    );

    const env = productionEnvironment();

    const response = await execute(request(payload()), env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "temporarily_unavailable",
    });
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });

  it("antwortet bei Sendefehlern mit 503 und strukturiertem Fehlerlog", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const env = environment({
      EMAIL: {
        send: vi.fn().mockRejectedValue(new Error("email unavailable")),
      },
    });
    const response = await execute(request(payload()), env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "temporarily_unavailable",
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('"event":"contact_request_error"'),
    );
  });
});
