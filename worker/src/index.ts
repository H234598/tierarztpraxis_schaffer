import type { Env, RouteContext } from "./env";
import { routeRequest } from "./router";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const context: RouteContext = { request, env, ctx, requestId, url };

    return routeRequest(context);
  },
} satisfies ExportedHandler<Env>;
