import type { DevelopmentEnv, Env, RouteContext } from "./env";
import { routeRequest } from "./router";
import {
  consumeNotifications,
  type NotificationMessage,
} from "./transfers/notifications";
import { runMaintenance } from "./scheduled/maintenance";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const context: RouteContext = { request, env, ctx, requestId, url };

    return routeRequest(context);
  },
  async queue(batch: MessageBatch<NotificationMessage>, env: Env): Promise<void> {
    if (env.ENVIRONMENT !== "development") return;
    await consumeNotifications(batch, env as DevelopmentEnv);
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (env.ENVIRONMENT !== "development") return;
    await runMaintenance(env as DevelopmentEnv, new Date(controller.scheduledTime));
  },
} satisfies ExportedHandler<Env, NotificationMessage>;
