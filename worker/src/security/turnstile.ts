import type { Env } from "../env";
import { allowedValues } from "../http/origin";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function verifyTurnstile(
  token: string,
  requestId: string,
  env: Env,
  expectedAction: string = env.EXPECTED_TURNSTILE_ACTION,
): Promise<boolean> {
  if (token.length === 0 || token.length > 2_048) return false;

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

    const result: unknown = await response.json();
    if (!isObject(result) || !result.success) return false;

    const hostname = typeof result.hostname === "string" ? result.hostname : undefined;
    const action = typeof result.action === "string" ? result.action : undefined;

    if (env.ENVIRONMENT === "development" && hostname === "test" && action === "test") {
      return true;
    }

    const expectedHostnames = allowedValues(env.EXPECTED_HOSTNAMES);
    return (
      Boolean(hostname) &&
      expectedHostnames.has(hostname?.toLowerCase() ?? "") &&
      action === expectedAction
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
