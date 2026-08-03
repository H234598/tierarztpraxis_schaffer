import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const allowedOrigin = "https://tierarztpraxis-schaffer.telacore.org";
const testRecipient = "tierarztpraxis_schaffer@herr-der-mails.de";

function turnstileResponse(hostname: string, action: string): Response {
  return new Response(
    JSON.stringify({ success: true, hostname, action }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
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

function request(
  body: Record<string, unknown>,
  origin = allowedOrigin,
): Request {
  return new Request(
    "https://api.tierarztpraxis-schaffer.telacore.org/v1/contact",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "cf-connecting-ip": "203.0.113.10",
      },
      body: JSON.stringify(body),
    },
  );
}

function environment(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    ENVIRONMENT: "development",
    ALLOWED_ORIGINS: allowedOrigin,
    EXPECTED_HOSTNAMES: "tierarztpraxis-schaffer.telacore.org,test",
    EXPECTED_TURNSTILE_ACTION: "contact_form",
    CONTACT_RECIPIENT_KEY: "contact:recipient:development",
    TEST_CONTACT_RECIPIENT: testRecipient,
    MAIL_FROM: "website@tierarztpraxis-schaffer.telacore.org",
    TURNSTILE_SECRET: "test-secret",
    RATE_LIMIT_SALT: "test-rate-limit-salt",
    CONTACT_CONFIG: {
      get: vi.fn().mockResolvedValue(null),
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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(turnstileResponse("test", "test")),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Kontaktformular-Worker", () => {
  it("meldet seinen Zustand ohne personenbezogene Daten", async () => {
    const response = await worker.fetch(
      new Request(
        "https://api.tierarztpraxis-schaffer.telacore.org/health",
      ),
      environment(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      environment: "development",
    });
  });

  it("weist eine fremde Origin ab", async () => {
    const env = environment();
    const response = await worker.fetch(
      request(payload(), "https://evil.example"),
      env,
    );

    expect(response.status).toBe(403);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });

  it("behandelt einen ausgelösten Honeypot neutral und sendet keine Mail", async () => {
    const env = environment();
    const response = await worker.fetch(
      request(payload({ companyWebsite: "https://spam.example" })),
      env,
    );

    expect(response.status).toBe(202);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });

  it("sendet in Entwicklung an den festgelegten Testempfänger", async () => {
    const env = environment();
    const response = await worker.fetch(request(payload()), env);

    expect(response.status).toBe(202);
    expect(env.EMAIL.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testRecipient,
        from: "website@tierarztpraxis-schaffer.telacore.org",
        replyTo: "max@example.org",
      }),
    );
  });

  it("bevorzugt einen gültigen Development-Empfänger aus KV", async () => {
    const env = environment({
      CONTACT_CONFIG: {
        get: vi.fn().mockResolvedValue("anderer-test@example.org"),
      },
    });
    const response = await worker.fetch(request(payload()), env);

    expect(response.status).toBe(202);
    expect(env.EMAIL.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "anderer-test@example.org" }),
    );
  });

  it("fällt in Produktion niemals auf die Testadresse zurück", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        turnstileResponse(
          "tierarztpraxis-schaffer.telacore.org",
          "contact_form",
        ),
      ),
    );

    const env = environment({
      ENVIRONMENT: "production",
      EXPECTED_HOSTNAMES: "tierarztpraxis-schaffer.telacore.org",
      CONTACT_RECIPIENT_KEY: "contact:recipient:production",
    });
    delete env.TEST_CONTACT_RECIPIENT;

    const response = await worker.fetch(request(payload()), env);

    expect(response.status).toBe(503);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
});
