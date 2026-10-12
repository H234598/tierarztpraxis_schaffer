import type { DevelopmentRouteContext } from "../env";
import { json } from "../http/response";
import { generateCsrfToken, verifyCsrfToken } from "../security/csrf";
import { verifyHmacHex } from "../security/hmac";
import { hashRateLimitKey } from "../security/rate-limit";
import { verifyTurnstile } from "../security/turnstile";
import {
  findCaseForTransferToken,
  findCaseForTransferSession,
  isOpenTransferCase,
  loadPublicCaseData,
  publicTransferCase,
} from "./cases";
import {
  clearSessionCookie,
  createTransferSession,
  hmacTransferSession,
  nextSessionExpiry,
  parseSessionCookie,
  serializeSessionCookie,
  verifyTransferSession,
} from "./sessions";
import { parseTransferToken, verifyTransferToken } from "./tokens";
import { hmacHex } from "../security/hmac";
import {
  createSubmissionDraft,
  finalizeSubmission,
  validateSubmissionInput,
  type SubmissionInput,
} from "./submissions";
import { uploadReservedFile } from "./uploads";
import {
  loadCustomerStoredFile,
  rangeNotSatisfiable,
  storedFileResponse,
} from "./file-response";
import { enqueueNotification } from "./notifications";

const maximumSessionBodyBytes = 4 * 1_024;
const maximumSubmissionBodyBytes = 32 * 1_024;
const sessionPath = "/api/transfers/session";
const casePath = "/api/transfers/case";
const logoutPath = "/api/transfers/session/logout";
const unauthorizedCode = "unauthorized";
const unauthorizedMessage = "Invalid or expired credentials";
const dummyHmac = "0".repeat(64);

interface SessionRequestBody {
  readonly token: string;
  readonly turnstileToken: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSessionRequestBody(value: unknown): value is SessionRequestBody {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    keys.includes("token") &&
    keys.includes("turnstileToken") &&
    typeof value.token === "string" &&
    value.token.length > 0 &&
    value.token.length <= 256 &&
    typeof value.turnstileToken === "string" &&
    value.turnstileToken.length > 0 &&
    value.turnstileToken.length <= 2_048
  );
}

export function transferError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  fields?: readonly string[],
): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message,
        requestId,
        ...(fields ? { fields } : {}),
      },
    },
    status,
  );
}

async function routeCreateSession(context: DevelopmentRouteContext): Promise<Response> {
  const { request, requestId, url, env } = context;
  if (request.headers.get("origin") !== url.origin) {
    return transferError(requestId, 403, "forbidden", "Request forbidden");
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return transferError(
      requestId,
      415,
      "unsupported_media_type",
      "Content type must be application/json",
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumSessionBodyBytes) {
    return transferError(requestId, 413, "payload_too_large", "Request body too large");
  }

  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > maximumSessionBodyBytes) {
    return transferError(requestId, 413, "payload_too_large", "Request body too large");
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return transferError(requestId, 400, "invalid_request", "Invalid request", [
      "body",
    ]);
  }
  if (!isSessionRequestBody(body)) {
    return transferError(requestId, 400, "invalid_request", "Invalid request", [
      "token",
      "turnstileToken",
    ]);
  }

  const rateLimitKey = await hashRateLimitKey(request, env, "transfer-session-v1");
  const rateLimit = await env.CONTACT_RATE_LIMITER.limit({ key: rateLimitKey });
  if (!rateLimit.success) {
    return transferError(requestId, 429, "rate_limited", "Too many requests");
  }

  if (
    !(await verifyTurnstile(
      body.turnstileToken,
      requestId,
      env,
      "datatransfer_session",
    ))
  ) {
    return transferError(requestId, 401, unauthorizedCode, unauthorizedMessage);
  }

  const parsedToken = parseTransferToken(body.token);
  if (!parsedToken) {
    await verifyHmacHex(env.TOKEN_PEPPER, body.token, dummyHmac);
    return transferError(requestId, 401, unauthorizedCode, unauthorizedMessage);
  }

  try {
    const tokenHmac = await hmacHex(env.TOKEN_PEPPER, parsedToken.secret);
    const now = new Date();
    const tokenCase = await findCaseForTransferToken(
      env.TRANSFER_DB,
      parsedToken.publicCaseId,
      tokenHmac,
    );
    if (!tokenCase) {
      await verifyHmacHex(env.TOKEN_PEPPER, parsedToken.secret, dummyHmac);
      return transferError(requestId, 401, unauthorizedCode, unauthorizedMessage);
    }

    const tokenValid = await verifyTransferToken(
      body.token,
      {
        publicCaseId: tokenCase.public_id,
        version: tokenCase.token_version,
        tokenHmac: tokenCase.token_hmac,
        expiresAt: tokenCase.token_expires_at,
        revokedAt: tokenCase.token_revoked_at,
      },
      env.TOKEN_PEPPER,
      now,
    );
    if (!tokenValid || !isOpenTransferCase(tokenCase, now)) {
      return transferError(requestId, 401, unauthorizedCode, unauthorizedMessage);
    }

    const session = await createTransferSession(env.SESSION_PEPPER, now);
    const csrf = await generateCsrfToken(env.SESSION_PEPPER);
    const nowIso = now.toISOString();
    const insertSession = env.TRANSFER_DB.prepare(
      `INSERT INTO transfer_sessions (
        id, case_id, token_id, session_hmac, csrf_hmac, created_at,
        last_seen_at, expires_at, absolute_expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).bind(
      crypto.randomUUID(),
      tokenCase.case_id,
      tokenCase.token_id,
      session.storage.sessionHmac,
      csrf.csrfHmac,
      nowIso,
      nowIso,
      session.storage.expiresAt,
      session.storage.absoluteExpiresAt,
    );
    const updateToken = env.TRANSFER_DB.prepare(
      `UPDATE transfer_tokens
        SET last_used_at = ?, use_count = use_count + 1
      WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`,
    ).bind(nowIso, tokenCase.token_id, nowIso);

    await env.TRANSFER_DB.batch([insertSession, updateToken]);

    const response = json({
      ok: true,
      case: publicTransferCase(tokenCase),
      csrfToken: csrf.token,
    });
    response.headers.set("set-cookie", session.setCookie);
    return response;
  } catch {
    console.error("transfer_api_unexpected_error", requestId);
    return transferError(requestId, 503, "service_unavailable", "Service unavailable");
  }
}

async function authenticatedSession(context: DevelopmentRouteContext): Promise<{
  readonly cookieValue: string;
  readonly row: NonNullable<Awaited<ReturnType<typeof findCaseForTransferSession>>>;
} | null> {
  const cookieValue = parseSessionCookie(context.request.headers.get("cookie"));
  if (!cookieValue) return null;
  const sessionHmac = await hmacTransferSession(
    cookieValue,
    context.env.SESSION_PEPPER,
  );
  const row = await findCaseForTransferSession(context.env.TRANSFER_DB, sessionHmac);
  if (!row) return null;
  const now = new Date();
  const valid = await verifyTransferSession(
    cookieValue,
    {
      sessionHmac: row.session_hmac,
      expiresAt: row.session_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      revokedAt: row.session_revoked_at,
    },
    context.env.SESSION_PEPPER,
    now,
  );
  const tokenExpiresAt = Date.parse(row.token_expires_at);
  const tokenValid =
    row.token_revoked_at === null &&
    Number.isFinite(tokenExpiresAt) &&
    tokenExpiresAt > now.getTime();
  return valid && tokenValid && isOpenTransferCase(row, now)
    ? { cookieValue, row }
    : null;
}

async function authenticatedMutation(
  context: DevelopmentRouteContext,
): Promise<NonNullable<Awaited<ReturnType<typeof authenticatedSession>>> | Response> {
  if (context.request.headers.get("origin") !== context.url.origin) {
    return transferError(context.requestId, 403, "forbidden", "Request forbidden");
  }
  const authenticated = await authenticatedSession(context);
  if (!authenticated) {
    return transferError(context.requestId, 401, unauthorizedCode, unauthorizedMessage);
  }
  const csrfValid = await verifyCsrfToken(
    context.request.headers.get("x-datentransfer-csrf"),
    authenticated.row.csrf_hmac,
    context.env.SESSION_PEPPER,
  );
  return csrfValid
    ? authenticated
    : transferError(context.requestId, 403, "forbidden", "Request forbidden");
}

async function readSubmissionInput(
  context: DevelopmentRouteContext,
  allowCallback: boolean,
): Promise<SubmissionInput | Response> {
  const contentType = context.request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return transferError(
      context.requestId,
      415,
      "unsupported_media_type",
      "Content type must be application/json",
    );
  }
  const contentLength = Number(context.request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumSubmissionBodyBytes) {
    return transferError(
      context.requestId,
      413,
      "payload_too_large",
      "Request body too large",
    );
  }
  const bodyText = await context.request.text();
  if (new TextEncoder().encode(bodyText).byteLength > maximumSubmissionBodyBytes) {
    return transferError(
      context.requestId,
      413,
      "payload_too_large",
      "Request body too large",
    );
  }
  try {
    return validateSubmissionInput(JSON.parse(bodyText), { allowCallback });
  } catch {
    return transferError(context.requestId, 400, "invalid_request", "Invalid request", [
      "submission",
    ]);
  }
}

async function routeCreateSubmission(
  context: DevelopmentRouteContext,
): Promise<Response> {
  const authenticated = await authenticatedMutation(context);
  if (authenticated instanceof Response) return authenticated;
  const input = await readSubmissionInput(
    context,
    authenticated.row.allow_callback === 1,
  );
  if (input instanceof Response) return input;
  const caseRow = authenticated.row;
  if (
    !Number.isSafeInteger(caseRow.submission_count) ||
    !Number.isSafeInteger(caseRow.max_submissions) ||
    !Number.isSafeInteger(caseRow.total_bytes) ||
    !Number.isSafeInteger(caseRow.max_total_bytes) ||
    caseRow.submission_count >= caseRow.max_submissions ||
    caseRow.total_bytes > caseRow.max_total_bytes - input.totalFileBytes
  ) {
    return transferError(context.requestId, 409, "conflict", "Submission unavailable");
  }

  const created = await createSubmissionDraft(
    context.env.TRANSFER_DB,
    caseRow.case_id,
    caseRow.session_id,
    input,
    new Date(),
  );
  if (created === "unauthorized") {
    return transferError(context.requestId, 401, unauthorizedCode, unauthorizedMessage);
  }
  return created
    ? json({ ok: true, ...created })
    : transferError(context.requestId, 409, "conflict", "Submission unavailable");
}

async function routeFinalizeSubmission(
  context: DevelopmentRouteContext,
  submissionId: string,
): Promise<Response> {
  const authenticated = await authenticatedMutation(context);
  if (authenticated instanceof Response) return authenticated;
  const now = new Date();
  const finalized = await finalizeSubmission(
    context.env.TRANSFER_DB,
    authenticated.row.case_id,
    authenticated.row.session_id,
    submissionId,
    now,
  );
  if (finalized === "unauthorized") {
    return transferError(context.requestId, 401, unauthorizedCode, unauthorizedMessage);
  }
  if (!finalized) {
    return transferError(context.requestId, 409, "conflict", "Submission unavailable");
  }
  try {
    context.ctx.waitUntil(
      enqueueNotification(
        context.env.TRANSFER_DB,
        context.env.TRANSFER_NOTIFICATIONS,
        finalized.notificationId,
      ).catch(() => undefined),
    );
  } catch {
    console.error("transfer_notification_schedule_failed", context.requestId);
  }
  return json({ ok: true, submissionId });
}

async function routeUpload(
  context: DevelopmentRouteContext,
  fileId: string,
): Promise<Response> {
  const authenticated = await authenticatedMutation(context);
  if (authenticated instanceof Response) return authenticated;
  const result = await uploadReservedFile(
    context.env.TRANSFER_DB,
    context.env.TRANSFER_FILES,
    context.request.headers,
    context.request.body,
    authenticated.row.case_id,
    authenticated.row.session_id,
    fileId,
    new Date(),
  );
  if (result === "stored") return json({ ok: true, fileId });
  if (result === "unauthorized") {
    return transferError(context.requestId, 401, unauthorizedCode, unauthorizedMessage);
  }
  if (result === "invalid") {
    return transferError(context.requestId, 400, "invalid_request", "Invalid upload");
  }
  if (result === "conflict") {
    return transferError(context.requestId, 409, "conflict", "Upload unavailable");
  }
  return transferError(
    context.requestId,
    503,
    "service_unavailable",
    "Service unavailable",
  );
}

async function routeDownloadFile(
  context: DevelopmentRouteContext,
  fileId: string,
): Promise<Response> {
  const authenticated = await authenticatedSession(context);
  if (!authenticated)
    return transferError(context.requestId, 401, unauthorizedCode, unauthorizedMessage);
  const file = await loadCustomerStoredFile(
    context.env.TRANSFER_DB,
    fileId,
    authenticated.row.case_id,
    authenticated.row.session_id,
    new Date(),
  );
  if (!file) return transferError(context.requestId, 404, "not_found", "Not found");
  const response = await storedFileResponse(
    context.env.TRANSFER_FILES,
    file,
    context.request.headers.get("range"),
    context.requestId,
  );
  if (response === "invalid") return rangeNotSatisfiable(file.size);
  if (response === "unavailable")
    return transferError(
      context.requestId,
      503,
      "service_unavailable",
      "Service unavailable",
    );
  return response;
}

async function routeGetCase(context: DevelopmentRouteContext): Promise<Response> {
  try {
    const authenticated = await authenticatedSession(context);
    if (!authenticated) {
      return transferError(
        context.requestId,
        401,
        unauthorizedCode,
        unauthorizedMessage,
      );
    }

    const now = new Date();
    const expiresAt = nextSessionExpiry(now, authenticated.row.absolute_expires_at);
    if (!expiresAt) {
      return transferError(
        context.requestId,
        401,
        unauthorizedCode,
        unauthorizedMessage,
      );
    }
    const renewal = await context.env.TRANSFER_DB.prepare(
      `UPDATE transfer_sessions
      SET last_seen_at = ?, expires_at = ?
      WHERE id = ? AND revoked_at IS NULL`,
    )
      .bind(now.toISOString(), expiresAt, authenticated.row.session_id)
      .run();
    if (renewal.meta.changes !== 1) {
      return transferError(
        context.requestId,
        401,
        unauthorizedCode,
        unauthorizedMessage,
      );
    }
    const snapshot = await loadPublicCaseData(
      context.env.TRANSFER_DB,
      authenticated.row.case_id,
    );
    const response = json({
      ok: true,
      case: publicTransferCase(authenticated.row),
      ...snapshot,
    });
    response.headers.set(
      "set-cookie",
      serializeSessionCookie(authenticated.cookieValue),
    );
    return response;
  } catch {
    console.error("transfer_api_unexpected_error", context.requestId);
    return transferError(
      context.requestId,
      503,
      "service_unavailable",
      "Service unavailable",
    );
  }
}

async function routeLogout(context: DevelopmentRouteContext): Promise<Response> {
  if (context.request.headers.get("origin") !== context.url.origin) {
    return transferError(context.requestId, 403, "forbidden", "Request forbidden");
  }

  try {
    const authenticated = await authenticatedSession(context);
    if (!authenticated) {
      return transferError(
        context.requestId,
        401,
        unauthorizedCode,
        unauthorizedMessage,
      );
    }
    const csrfValid = await verifyCsrfToken(
      context.request.headers.get("x-datentransfer-csrf"),
      authenticated.row.csrf_hmac,
      context.env.SESSION_PEPPER,
    );
    if (!csrfValid) {
      return transferError(context.requestId, 403, "forbidden", "Request forbidden");
    }

    const revocation = await context.env.TRANSFER_DB.prepare(
      `UPDATE transfer_sessions
      SET revoked_at = ?
      WHERE id = ? AND revoked_at IS NULL`,
    )
      .bind(new Date().toISOString(), authenticated.row.session_id)
      .run();
    if (revocation.meta.changes !== 1) {
      return transferError(
        context.requestId,
        401,
        unauthorizedCode,
        unauthorizedMessage,
      );
    }
    const response = json({ ok: true });
    response.headers.set("set-cookie", clearSessionCookie());
    return response;
  } catch {
    console.error("transfer_api_unexpected_error", context.requestId);
    return transferError(
      context.requestId,
      503,
      "service_unavailable",
      "Service unavailable",
    );
  }
}

async function routePublicTransferRequest(
  context: DevelopmentRouteContext,
): Promise<Response> {
  if (context.request.method === "POST" && context.url.pathname === sessionPath) {
    return routeCreateSession(context);
  }

  if (context.request.method === "GET" && context.url.pathname === casePath) {
    return routeGetCase(context);
  }

  if (context.request.method === "POST" && context.url.pathname === logoutPath) {
    return routeLogout(context);
  }

  if (
    context.request.method === "POST" &&
    context.url.pathname === "/api/transfers/submissions"
  ) {
    return routeCreateSubmission(context);
  }

  const finalizeMatch = context.url.pathname.match(
    /^\/api\/transfers\/submissions\/([^/]+)\/finalize$/u,
  );
  if (context.request.method === "POST" && finalizeMatch?.[1]) {
    return routeFinalizeSubmission(context, finalizeMatch[1]);
  }

  const uploadMatch = context.url.pathname.match(
    /^\/api\/transfers\/uploads\/([^/]+)$/u,
  );
  if (context.request.method === "PUT" && uploadMatch?.[1]) {
    return routeUpload(context, uploadMatch[1]);
  }

  const fileMatch = context.url.pathname.match(/^\/api\/transfers\/files\/([^/]+)$/u);
  if (context.request.method === "GET" && fileMatch?.[1])
    return routeDownloadFile(context, fileMatch[1]);

  return transferError(context.requestId, 404, "not_found", "Not found");
}

export async function routePublicTransfer(
  context: DevelopmentRouteContext,
): Promise<Response> {
  try {
    return await routePublicTransferRequest(context);
  } catch {
    console.error("transfer_api_unexpected_error", context.requestId);
    return transferError(
      context.requestId,
      503,
      "service_unavailable",
      "Service unavailable",
    );
  }
}
