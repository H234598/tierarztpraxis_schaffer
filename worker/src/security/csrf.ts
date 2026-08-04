import {
  decodeCanonicalBase64Url,
  generateRandomSecret,
  hmacHex,
  verifyHmacHex,
} from "./hmac";

const csrfDomain = "csrf-v1\0";

export interface GeneratedCsrfToken {
  token: string;
  csrfHmac: string;
}

export async function generateCsrfToken(
  sessionPepper: string,
): Promise<GeneratedCsrfToken> {
  const token = generateRandomSecret();
  return {
    token,
    csrfHmac: await hmacHex(sessionPepper, `${csrfDomain}${token}`),
  };
}

export async function verifyCsrfToken(
  token: string | null,
  expectedHmac: string,
  sessionPepper: string,
): Promise<boolean> {
  if (token === null) return false;

  const decoded = decodeCanonicalBase64Url(token);
  if (!decoded || decoded.byteLength < 32) return false;

  return verifyHmacHex(
    sessionPepper,
    `${csrfDomain}${token}`,
    expectedHmac,
  );
}
