interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
}

interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

interface EmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<{ messageId: string }>;
}

interface Env {
  ENVIRONMENT: "development" | "production";
  ALLOWED_ORIGINS: string;
  EXPECTED_HOSTNAMES: string;
  EXPECTED_TURNSTILE_ACTION: string;
  CONTACT_RECIPIENT_KEY: string;
  TEST_CONTACT_RECIPIENT?: string;
  MAIL_FROM: string;
  TURNSTILE_SECRET: string;
  RATE_LIMIT_SALT: string;
  CONTACT_CONFIG: KVNamespaceLike;
  CONTACT_RATE_LIMITER: RateLimitBinding;
  EMAIL: EmailBinding;
}

type ContactCategory =
  | "appointment"
  | "general"
  | "feedback"
  | "accessibility"
  | "other";

interface ContactSubmission {
  name: string;
  email: string;
  phone: string;
  category: ContactCategory;
  message: string;
  startedAt: number;
  turnstileToken: string;
}

interface TurnstileResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
}

class RequestError extends Error {
  readonly status: number;
  readonly fields?: readonly string[];

  constructor(
    message: string,
    status: number,
    fields?: readonly string[],
  ) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.fields = fields;
  }
}

const CONTACT_PATH = "/v1/contact";
const MAX_BODY_BYTES = 8_192;
const MIN_FILL_TIME_MS = 2_200;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const PHONE_PATTERN = /^[+\d][\d\s()/.-]{2,39}$/u;
const HEADER_BREAK_PATTERN = /[\r\n]/u;
const CATEGORIES = new Set<ContactCategory>([
  "appointment",
  "general",
  "feedback",
  "accessibility",
  "other",
]);

function allowedValues(csv: string): Set<string> {
  return new Set(
    csv
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function responseHeaders(origin?: string): Headers {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });

  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }

  return headers;
}

function json(
  body: Record<string, unknown>,
  status = 200,
  origin?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function accepted(requestId: string, origin: string): Response {
  return json({ accepted: true, requestId }, 202, origin);
}

function logResult(
  requestId: string,
  outcome: string,
  startedAt: number,
  environment: string,
): void {
  console.info(
    JSON.stringify({
      event: "contact_request",
      requestId,
      outcome,
      environment,
      durationMs: Date.now() - startedAt,
    }),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().slice(0, maxLength + 1);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestError("payload_too_large", 413, ["form"]);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new RequestError("payload_too_large", 413, ["form"]);
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value)) {
      throw new RequestError("invalid_payload", 400, ["form"]);
    }
    return value;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("invalid_json", 400, ["form"]);
  }
}

function isBotSignal(input: Record<string, unknown>): boolean {
  const honeypot = text(input.companyWebsite, 200);
  if (honeypot) return true;

  const startedAt = Number(input.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;

  const elapsed = Date.now() - startedAt;
  return elapsed < 0 || elapsed < MIN_FILL_TIME_MS;
}

function validateSubmission(
  input: Record<string, unknown>,
): ContactSubmission {
  const name = text(input.name, 120);
  const email = text(input.email, 254).toLowerCase();
  const phone = text(input.phone, 40);
  const category = text(input.category, 40) as ContactCategory;
  const message = text(input.message, 2_000).replaceAll("\r\n", "\n");
  const startedAt = Number(input.startedAt);
  const turnstileToken = text(input.turnstileToken, 2_048);
  const privacyAccepted = input.privacyAccepted === true;
  const fields: string[] = [];

  if (name.length < 2 || name.length > 120 || HEADER_BREAK_PATTERN.test(name)) {
    fields.push("name");
  }
  if (email && (!EMAIL_PATTERN.test(email) || HEADER_BREAK_PATTERN.test(email))) {
    fields.push("email");
  }
  if (phone && (!PHONE_PATTERN.test(phone) || HEADER_BREAK_PATTERN.test(phone))) {
    fields.push("phone");
  }
  if (!email && !phone) fields.push("contact");
  if (!CATEGORIES.has(category)) fields.push("category");
  if (message.length < 10 || message.length > 2_000) fields.push("message");
  if (!privacyAccepted) fields.push("privacyAccepted");
  if (!Number.isFinite(startedAt) || startedAt <= 0) fields.push("startedAt");
  if (!turnstileToken || turnstileToken.length > 2_048) {
    fields.push("turnstileToken");
  }

  if (fields.length > 0) {
    throw new RequestError("invalid_form", 400, [...new Set(fields)]);
  }

  return {
    name,
    email,
    phone,
    category,
    message,
    startedAt,
    turnstileToken,
  };
}

async function hashRateLimitKey(request: Request, env: Env): Promise<string> {
  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  const material = `${env.RATE_LIMIT_SALT}|${clientIp}|contact-v1`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function verifyTurnstile(
  token: string,
  requestId: string,
  env: Env,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);

  try {
    const body = new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token,
      idempotency_key: requestId,
    });

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        signal: controller.signal,
      },
    );

    if (!response.ok) return false;
    const result = (await response.json()) as TurnstileResponse;
    if (!result.success) return false;

    if (
      env.ENVIRONMENT === "development" &&
      result.hostname === "test" &&
      result.action === "test"
    ) {
      return true;
    }

    const expectedHostnames = allowedValues(env.EXPECTED_HOSTNAMES);
    return (
      Boolean(result.hostname) &&
      expectedHostnames.has(result.hostname?.toLowerCase() ?? "") &&
      result.action === env.EXPECTED_TURNSTILE_ACTION
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveRecipient(env: Env): Promise<string> {
  const configured = (
    await env.CONTACT_CONFIG.get(env.CONTACT_RECIPIENT_KEY)
  )
    ?.trim()
    .toLowerCase();

  if (configured && EMAIL_PATTERN.test(configured)) return configured;

  if (
    env.ENVIRONMENT === "development" &&
    env.TEST_CONTACT_RECIPIENT &&
    EMAIL_PATTERN.test(env.TEST_CONTACT_RECIPIENT)
  ) {
    return env.TEST_CONTACT_RECIPIENT.toLowerCase();
  }

  throw new Error("recipient_not_configured");
}

async function sendMail(
  submission: ContactSubmission,
  recipient: string,
  requestId: string,
  env: Env,
): Promise<void> {
  if (!EMAIL_PATTERN.test(env.MAIL_FROM)) {
    throw new Error("sender_not_configured");
  }

  const labels: Record<ContactCategory, string> = {
    appointment: "Terminanfrage",
    general: "Allgemeine Frage",
    feedback: "Rückmeldung zur Website",
    accessibility: "Barriere gemeldet",
    other: "Sonstiges Anliegen",
  };

  const mail = {
    to: recipient,
    from: env.MAIL_FROM,
    subject: `[Website] ${labels[submission.category]} – ${requestId}`,
    text: [
      "Neue Nachricht über die Praxis-Website",
      "",
      `Anfrage-ID: ${requestId}`,
      `Umgebung: ${env.ENVIRONMENT}`,
      `Anliegen: ${labels[submission.category]}`,
      `Name: ${submission.name}`,
      submission.email
        ? `E-Mail: ${submission.email}`
        : "E-Mail: nicht angegeben",
      submission.phone
        ? `Telefon: ${submission.phone}`
        : "Telefon: nicht angegeben",
      "",
      "Nachricht:",
      submission.message,
    ].join("\n"),
    ...(submission.email ? { replyTo: submission.email } : {}),
  };

  await env.EMAIL.send(mail);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestStartedAt = Date.now();
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "tierarztpraxis-schaffer-contact",
        environment: env.ENVIRONMENT,
      });
    }

    if (url.pathname !== CONTACT_PATH) {
      return json({ error: "not_found" }, 404);
    }

    const origin = request.headers.get("origin") ?? "";
    if (!origin || !allowedValues(env.ALLOWED_ORIGINS).has(origin.toLowerCase())) {
      logResult(requestId, "forbidden_origin", requestStartedAt, env.ENVIRONMENT);
      return json({ error: "forbidden" }, 403);
    }

    if (request.method === "OPTIONS") {
      const headers = responseHeaders(origin);
      headers.set("access-control-allow-methods", "POST, OPTIONS");
      headers.set("access-control-allow-headers", "content-type");
      headers.set("access-control-max-age", "600");
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, origin);
    }

    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      return json({ error: "unsupported_media_type" }, 415, origin);
    }

    try {
      const input = await readJson(request);

      if (isBotSignal(input)) {
        logResult(requestId, "bot_signal", requestStartedAt, env.ENVIRONMENT);
        return accepted(requestId, origin);
      }

      const rateLimitKey = await hashRateLimitKey(request, env);
      const rateLimit = await env.CONTACT_RATE_LIMITER.limit({
        key: rateLimitKey,
      });
      if (!rateLimit.success) {
        logResult(requestId, "rate_limited", requestStartedAt, env.ENVIRONMENT);
        return json({ error: "too_many_requests" }, 429, origin);
      }

      const submission = validateSubmission(input);
      if (
        !(await verifyTurnstile(
          submission.turnstileToken,
          requestId,
          env,
        ))
      ) {
        logResult(
          requestId,
          "turnstile_failed",
          requestStartedAt,
          env.ENVIRONMENT,
        );
        return json({ error: "security_check_failed" }, 400, origin);
      }

      const recipient = await resolveRecipient(env);
      await sendMail(submission, recipient, requestId, env);

      logResult(requestId, "accepted", requestStartedAt, env.ENVIRONMENT);
      return accepted(requestId, origin);
    } catch (error) {
      if (error instanceof RequestError) {
        logResult(requestId, error.message, requestStartedAt, env.ENVIRONMENT);
        return json(
          {
            error: error.message,
            ...(error.fields ? { fields: error.fields } : {}),
          },
          error.status,
          origin,
        );
      }

      console.error(
        JSON.stringify({
          event: "contact_request_error",
          requestId,
          environment: env.ENVIRONMENT,
          errorType: error instanceof Error ? error.name : "unknown",
          durationMs: Date.now() - requestStartedAt,
        }),
      );
      return json({ error: "temporarily_unavailable" }, 503, origin);
    }
  },
};
