import {
  decodeCanonicalBase64Url,
  generateRandomSecret,
  hmacHex,
  verifyHmacHex,
} from "../security/hmac";

const sessionDomain = "session-v1\0";
const slidingLifetimeMs = 30 * 60 * 1_000;
const absoluteLifetimeMs = 12 * 60 * 60 * 1_000;
const cookieAttributes = "Path=/api/transfers/; Secure; HttpOnly; SameSite=Strict";

export interface TransferSessionStorage {
  sessionHmac: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

export interface GeneratedTransferSession {
  cookieValue: string;
  setCookie: string;
  storage: TransferSessionStorage;
}

export interface StoredTransferSession extends TransferSessionStorage {
  revokedAt: string | null;
}

function isSessionSecret(value: string): boolean {
  return decodeCanonicalBase64Url(value)?.byteLength === 32;
}

export function serializeSessionCookie(value: string): string {
  if (!isSessionSecret(value)) throw new TypeError("Invalid session cookie");
  return `dt_session=${value}; Max-Age=1800; ${cookieAttributes}`;
}

export function clearSessionCookie(): string {
  return `dt_session=; Max-Age=0; ${cookieAttributes}`;
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  let sessionValue: string | null = null;
  for (const rawPart of cookieHeader.split(";")) {
    const part = rawPart.replace(/^[ \t]+/, "");
    if (!part.startsWith("dt_session=")) continue;
    if (sessionValue !== null) return null;
    sessionValue = part.slice("dt_session=".length);
  }

  return sessionValue !== null && isSessionSecret(sessionValue) ? sessionValue : null;
}

export function nextSessionExpiry(now: Date, absoluteExpiresAt: string): string | null {
  const nowTimestamp = now.getTime();
  const absoluteTimestamp = Date.parse(absoluteExpiresAt);
  if (!Number.isFinite(nowTimestamp) || !Number.isFinite(absoluteTimestamp)) {
    return null;
  }

  return new Date(
    Math.min(nowTimestamp + slidingLifetimeMs, absoluteTimestamp),
  ).toISOString();
}

export function hmacTransferSession(
  cookieValue: string,
  sessionPepper: string,
): Promise<string> {
  return hmacHex(sessionPepper, `${sessionDomain}${cookieValue}`);
}

export async function createTransferSession(
  sessionPepper: string,
  now: Date,
): Promise<GeneratedTransferSession> {
  const cookieValue = generateRandomSecret();
  const absoluteExpiresAt = new Date(now.getTime() + absoluteLifetimeMs).toISOString();
  const expiresAt = nextSessionExpiry(now, absoluteExpiresAt);
  if (expiresAt === null) throw new TypeError("Invalid session timestamp");

  return {
    cookieValue,
    setCookie: serializeSessionCookie(cookieValue),
    storage: {
      sessionHmac: await hmacTransferSession(cookieValue, sessionPepper),
      expiresAt,
      absoluteExpiresAt,
    },
  };
}

export async function verifyTransferSession(
  cookieValue: string,
  stored: StoredTransferSession,
  sessionPepper: string,
  now: Date,
): Promise<boolean> {
  const nowTimestamp = now.getTime();
  const expiresTimestamp = Date.parse(stored.expiresAt);
  const absoluteTimestamp = Date.parse(stored.absoluteExpiresAt);
  if (
    !isSessionSecret(cookieValue) ||
    !Number.isFinite(nowTimestamp) ||
    !Number.isFinite(expiresTimestamp) ||
    !Number.isFinite(absoluteTimestamp) ||
    stored.revokedAt !== null ||
    expiresTimestamp <= nowTimestamp ||
    absoluteTimestamp <= nowTimestamp
  ) {
    return false;
  }

  return verifyHmacHex(
    sessionPepper,
    `${sessionDomain}${cookieValue}`,
    stored.sessionHmac,
  );
}
