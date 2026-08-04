import type { RouteContext } from "./env";
import { CONTACT_PATH, routeContact } from "./contact/route";
import { json } from "./http/response";

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

  return json({ error: "not_found" }, 404);
}
