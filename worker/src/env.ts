export type Env = Cloudflare.DevelopmentEnv | Cloudflare.ProductionEnv;

export interface RouteContext {
  readonly request: Request;
  readonly env: Env;
  readonly ctx: ExecutionContext;
  readonly requestId: string;
  readonly url: URL;
}
