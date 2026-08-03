import { describe, expect, it } from "vitest";
import { siteConfig } from "../src/config/site";

describe("Website-Konfiguration", () => {
  it("verwendet die bestätigten GPS-Koordinaten", () => {
    expect(siteConfig.coordinates.latitude).toBeCloseTo(49.48375, 6);
    expect(siteConfig.coordinates.longitude).toBeCloseTo(10.970583333333334, 6);
  });

  it("hält Telefonnummer und API serverseitig eindeutig", () => {
    expect(siteConfig.phone.href).toBe("tel:+4991163292983");
    expect(siteConfig.contactApiUrl).toBe(
      "https://api.tierarztpraxis-schaffer.telacore.org/v1/contact",
    );
  });

  it("beschreibt die Türschwelle transparent", () => {
    expect(siteConfig.accessibility.faqAnswer).toContain("kleine Türschwelle");
    expect(siteConfig.accessibility.faqAnswer).toContain("Erdgeschoss");
    expect(siteConfig.accessibility.faqAnswer).toContain("jederzeit");
  });
});
