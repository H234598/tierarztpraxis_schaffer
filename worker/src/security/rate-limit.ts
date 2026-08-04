import type { Env } from "../env";

export async function hashRateLimitKey(request: Request, env: Env): Promise<string> {
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
