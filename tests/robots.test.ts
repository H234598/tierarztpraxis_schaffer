import { describe, expect, it } from "vitest";

import { resolveRobots } from "../src/config/robots";

describe("Robots-Metadaten", () => {
  it("schließt Development unabhängig vom angeforderten Home-Wert für Indexierung", () => {
    expect(resolveRobots(true, "index,follow")).toBe("noindex,nofollow");
  });

  it("verwendet in Production explizite Root- und Variantenwerte", () => {
    expect(resolveRobots(false, "index,follow")).toBe("index,follow");
    expect(resolveRobots(false, "noindex,follow")).toBe("noindex,follow");
  });
});
