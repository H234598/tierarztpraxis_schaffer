export type DevelopmentEnv = Cloudflare.DevelopmentEnv;

export type DevelopmentTransferBindings = Pick<
  DevelopmentEnv,
  "TRANSFER_DB" | "TRANSFER_FILES" | "TRANSFER_NOTIFICATIONS"
>;

export type Env = DevelopmentEnv | Cloudflare.ProductionEnv;

export interface RouteContext {
  readonly request: Request;
  readonly env: Env;
  readonly ctx: ExecutionContext;
  readonly requestId: string;
  readonly url: URL;
}
