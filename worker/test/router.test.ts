import { describe, expect, it } from "vitest";

import { routeRequest } from "../src/router";

describe("Worker-Router", () => {
  it("stellt eine schmale importierbare Routinggrenze bereit", () => {
    expect(routeRequest).toBeTypeOf("function");
  });
});
