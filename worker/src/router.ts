import type { DevelopmentRouteContext, RouteContext } from "./env";
import { CONTACT_PATH, routeContact } from "./contact/route";
import { json } from "./http/response";
import {
  routePublicTransfer,
  transferError,
} from "./transfers/routes-public";
import { routeAdmin } from "./transfers/routes-admin";

export async function routeRequest(context: RouteContext): Promise<Response> {
  const { request, env, url } = context;

  if (request.method === "GET" && url.pathname === "/health") {
    return json({
      ok: true,
      service: "tierarztpraxis-schaffer-contact",
      environment: env.ENVIRONMENT,
    });
  }

  if (url.pathname === CONTACT_PATH) {
    return routeContact(context);
  }

  if (url.pathname.startsWith("/api/transfers/")) {
    if (env.ENVIRONMENT !== "development") {
      return transferError(
        context.requestId,
        503,
        "service_unavailable",
        "Service unavailable",
      );
    }

    const transferContext: DevelopmentRouteContext = { ...context, env };
    return routePublicTransfer(transferContext);
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (env.ENVIRONMENT !== "development") {
      return transferError(
        context.requestId,
        503,
        "service_unavailable",
        "Service unavailable",
      );
    }
    const adminContext: DevelopmentRouteContext = { ...context, env };
    return routeAdmin(adminContext);
  }

  return json({ error: "not_found" }, 404);
}
