import type { RouteContext } from "../env";
import { RequestError } from "../http/errors";
import { allowedValues } from "../http/origin";
import { accepted, json, responseHeaders } from "../http/response";
import { hashRateLimitKey } from "../security/rate-limit";
import { verifyTurnstile } from "../security/turnstile";
import { resolveRecipient, sendMail } from "./mail";
import { isBotSignal, readJson, validateSubmission } from "./validation";

export const CONTACT_PATH = "/v1/contact";

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

export async function routeContact({
  request,
  env,
  requestId,
}: RouteContext): Promise<Response> {
  const requestStartedAt = Date.now();
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
    !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")
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
    const turnstileValid = await verifyTurnstile(
      submission.turnstileToken,
      requestId,
      env,
    );

    if (!turnstileValid) {
      logResult(requestId, "turnstile_failed", requestStartedAt, env.ENVIRONMENT);
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
}
