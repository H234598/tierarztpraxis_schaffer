import { describe, expect, it } from "vitest";

import {
  accessibilityFaqAnswer,
  practiceAccessibility,
} from "../src/config/practice";

describe("bestätigte Barrierefreiheitsangaben", () => {
  it("kennzeichnet die bekannten Angaben als bestätigt", () => {
    const confirmed = [
      practiceAccessibility.location,
      practiceAccessibility.entranceThreshold,
      practiceAccessibility.entranceDoor,
      practiceAccessibility.elevator,
      practiceAccessibility.parking,
      practiceAccessibility.teamAssistance,
    ];

    expect(confirmed.every((entry) => entry.status === "verified")).toBe(true);
    expect(confirmed.every((entry) => entry.verifiedAt === "2026-07-16")).toBe(
      true,
    );
  });

  it("behauptet wegen der Türschwelle nicht pauschal vollständige Barrierefreiheit", () => {
    expect(accessibilityFaqAnswer).toContain("kleine Türschwelle");
    expect(accessibilityFaqAnswer).toContain("nicht vollständig schwellenlos");
    expect(accessibilityFaqAnswer.toLowerCase()).not.toContain(
      "vollständig barrierefrei",
    );
  });

  it("nennt Erdgeschoss, Parkplätze und jederzeitige Unterstützung", () => {
    expect(accessibilityFaqAnswer).toContain("Erdgeschoss");
    expect(accessibilityFaqAnswer).toContain("Parkplätze");
    expect(accessibilityFaqAnswer).toContain("jederzeit");
  });
});
