import {
  decodeCanonicalBase64Url,
  generateRandomSecret,
  hmacHex,
  verifyHmacHex,
} from "../security/hmac";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const publicCaseIdPattern = /^[A-Z2-7]{12,16}$/;

export interface ParsedTransferToken {
  version: "dt1";
  publicCaseId: string;
  secret: string;
}

export interface TransferTokenStorage {
  publicCaseId: string;
  version: "dt1";
  tokenHmac: string;
  tokenHint: string;
}

export interface GeneratedTransferToken {
  token: string;
  storage: TransferTokenStorage;
}

export interface StoredTransferToken {
  publicCaseId: string;
  version: string;
  tokenHmac: string;
  expiresAt: string;
  revokedAt: string | null;
}

function generatePublicCaseId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let accumulator = 0;
  let bits = 0;
  let result = "";

  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += base32Alphabet[(accumulator >>> bits) & 31];
      accumulator &= (1 << bits) - 1;
    }
  }

  return result;
}

function generateTokenSecret(): string {
  let secret = generateRandomSecret();
  while (secret.includes("_")) secret = generateRandomSecret();
  return secret;
}

export function parseTransferToken(value: string): ParsedTransferToken | null {
  if (/\s|\./.test(value)) return null;

  const parts = value.split("_");
  if (parts.length !== 3) return null;
  const [version, publicCaseId, secret] = parts;
  if (
    version !== "dt1" ||
    !publicCaseId ||
    !publicCaseIdPattern.test(publicCaseId) ||
    !secret
  ) {
    return null;
  }

  const decodedSecret = decodeCanonicalBase64Url(secret);
  if (!decodedSecret || decodedSecret.byteLength < 32) return null;

  return { version, publicCaseId, secret };
}

export async function generateTransferToken(
  tokenPepper: string,
): Promise<GeneratedTransferToken> {
  const publicCaseId = generatePublicCaseId();
  const secret = generateTokenSecret();

  return {
    token: `dt1_${publicCaseId}_${secret}`,
    storage: {
      publicCaseId,
      version: "dt1",
      tokenHmac: await hmacHex(tokenPepper, secret),
      tokenHint: secret.slice(-4),
    },
  };
}

export async function verifyTransferToken(
  token: string,
  stored: StoredTransferToken,
  tokenPepper: string,
  now: Date,
): Promise<boolean> {
  const parsed = parseTransferToken(token);
  const nowTimestamp = now.getTime();
  const expiresTimestamp = Date.parse(stored.expiresAt);
  if (
    !parsed ||
    !Number.isFinite(nowTimestamp) ||
    !Number.isFinite(expiresTimestamp) ||
    stored.revokedAt !== null ||
    expiresTimestamp <= nowTimestamp ||
    parsed.publicCaseId !== stored.publicCaseId ||
    parsed.version !== stored.version
  ) {
    return false;
  }

  return verifyHmacHex(
    tokenPepper,
    parsed.secret,
    stored.tokenHmac,
  );
}
