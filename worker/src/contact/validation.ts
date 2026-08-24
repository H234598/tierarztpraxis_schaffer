import { RequestError } from "../http/errors";

export type ContactCategory =
  "appointment" | "general" | "feedback" | "accessibility" | "other";

export interface ContactSubmission {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly category: ContactCategory;
  readonly message: string;
  readonly startedAt: number;
  readonly turnstileToken: string;
}

const MAX_BODY_BYTES = 8_192;
const MIN_FILL_TIME_MS = 2_200;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const PHONE_PATTERN = /^[+\d][\d\s()/.-]{2,39}$/u;
const HEADER_BREAK_PATTERN = /[\r\n]/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .trim()
    .slice(0, maxLength + 1);
}

function parseCategory(value: string): ContactCategory | null {
  switch (value) {
    case "appointment":
    case "general":
    case "feedback":
    case "accessibility":
    case "other":
      return value;
    default:
      return null;
  }
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestError("payload_too_large", 413, ["form"]);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new RequestError("payload_too_large", 413, ["form"]);
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value)) {
      throw new RequestError("invalid_payload", 400, ["form"]);
    }
    return value;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("invalid_json", 400, ["form"]);
  }
}

export function isBotSignal(input: Record<string, unknown>): boolean {
  const honeypot = text(input.companyWebsite, 200);
  if (honeypot) return true;

  const startedAt = Number(input.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;

  const elapsed = Date.now() - startedAt;
  return elapsed < 0 || elapsed < MIN_FILL_TIME_MS;
}

export function validateSubmission(input: Record<string, unknown>): ContactSubmission {
  const name = text(input.name, 120);
  const email = text(input.email, 254).toLowerCase();
  const phone = text(input.phone, 40);
  const category = parseCategory(text(input.category, 40));
  const message = text(input.message, 2_000).replaceAll("\r\n", "\n");
  const startedAt = Number(input.startedAt);
  const turnstileToken = text(input.turnstileToken, 2_048);
  const privacyAccepted = input.privacyAccepted === true;
  const fields: string[] = [];

  if (name.length < 2 || name.length > 120 || HEADER_BREAK_PATTERN.test(name)) {
    fields.push("name");
  }
  if (email && (!isValidEmail(email) || HEADER_BREAK_PATTERN.test(email))) {
    fields.push("email");
  }
  if (phone && (!PHONE_PATTERN.test(phone) || HEADER_BREAK_PATTERN.test(phone))) {
    fields.push("phone");
  }
  if (!email && !phone) fields.push("contact");
  if (category === null) fields.push("category");
  if (message.length < 10 || message.length > 2_000) fields.push("message");
  if (!privacyAccepted) fields.push("privacyAccepted");
  if (!Number.isFinite(startedAt) || startedAt <= 0) fields.push("startedAt");
  if (!turnstileToken || turnstileToken.length > 2_048) {
    fields.push("turnstileToken");
  }

  if (fields.length > 0 || category === null) {
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
