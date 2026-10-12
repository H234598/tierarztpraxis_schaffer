import { describe, expect, it } from "vitest";

import { defaultHomeVariantId, homeVariants } from "../src/content/home-variants";

describe("Startseitenvarianten", () => {
  it("führt jede Varianten-ID genau einmal", () => {
    expect(new Set(homeVariants.map((variant) => variant.id)).size).toBe(
      homeVariants.length,
    );
    expect(homeVariants.map((variant) => variant.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("hat genau eine Standardvariante mit ID 4", () => {
    const defaults = homeVariants.filter((variant) => variant.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaultHomeVariantId).toBe("4");
    expect(defaults[0]?.id).toBe(defaultHomeVariantId);
  });
});
