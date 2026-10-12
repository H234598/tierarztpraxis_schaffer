export type RequestedRobots = "index,follow" | "noindex,follow" | "noindex,nofollow";
export type ResolvedRobots = RequestedRobots;

export const resolveRobots = (
  isDevelopment: boolean,
  requestedRobots: RequestedRobots,
): ResolvedRobots => (isDevelopment ? "noindex,nofollow" : requestedRobots);
