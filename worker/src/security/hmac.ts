const encoder = new TextEncoder();
const hmacAlgorithm = { name: "HMAC", hash: "SHA-256" } as const;

async function importHmacKey(
  secret: string,
  usage: "sign" | "verify",
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), hmacAlgorithm, false, [
    usage,
  ]);
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await importHmacKey(secret, "sign");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyHmacHex(
  secret: string,
  value: string,
  expectedHex: string,
): Promise<boolean> {
  if (!/^[0-9a-fA-F]{64}$/.test(expectedHex)) return false;

  const signature = new Uint8Array(32);
  for (let index = 0; index < signature.length; index += 1) {
    signature[index] = Number.parseInt(expectedHex.slice(index * 2, index * 2 + 2), 16);
  }

  const key = await importHmacKey(secret, "verify");
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(value));
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeCanonicalBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;

  const padded = `${value.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return encodeBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

export function generateRandomSecret(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
