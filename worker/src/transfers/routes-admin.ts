import type { DevelopmentRouteContext } from "../env";
import { json } from "../http/response";
import {
  accessVerifier,
  type AccessVerifier,
  type VerifiedAdminIdentity,
} from "../security/access-jwt";
import { transferError } from "./routes-public";
import { loadAdminStoredFile, rangeNotSatisfiable, storedFileResponse } from "./file-response";
import { handleAdminCaseApi } from "./admin-cases";

export async function authenticateAdminRequest(
  context: DevelopmentRouteContext,
  verifier: AccessVerifier = accessVerifier,
): Promise<VerifiedAdminIdentity | null> {
  if (context.request.headers.get("origin") !== context.url.origin) return null;
  return verifier.verify(
    context.request.headers.get("cf-access-jwt-assertion"),
    context.env.ACCESS_TEAM_DOMAIN,
    context.env.ACCESS_ADMIN_API_AUD,
  );
}

export async function routeAdmin(
  context: DevelopmentRouteContext,
  verifier: AccessVerifier = accessVerifier,
): Promise<Response> {
  if (context.request.headers.get("origin") !== context.url.origin) {
    return transferError(context.requestId, 403, "forbidden", "Request forbidden");
  }
  const admin = await authenticateAdminRequest(context, verifier);
  if (!admin) {
    return transferError(context.requestId, 401, "unauthorized", "Invalid or expired credentials");
  }
  if (context.request.method === "GET" && context.url.pathname === "/api/admin/session") {
    return json({ ok: true, admin: { email: admin.email } });
  }
  const caseResponse = await handleAdminCaseApi(context, admin);
  if (caseResponse) return caseResponse;
  const fileMatch = context.url.pathname.match(/^\/api\/admin\/files\/([^/]+)$/u);
  if (context.request.method === "GET" && fileMatch?.[1]) {
    const file = await loadAdminStoredFile(context.env.TRANSFER_DB, fileMatch[1]);
    if (!file) return transferError(context.requestId, 404, "not_found", "Not found");
    const response = await storedFileResponse(context.env.TRANSFER_FILES, file, context.request.headers.get("range"), context.requestId);
    if (response === "invalid") return rangeNotSatisfiable(file.size);
    if (response === "unavailable") return transferError(context.requestId, 503, "service_unavailable", "Service unavailable");
    return response;
  }
  return transferError(context.requestId, 404, "not_found", "Not found");
}
