import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const testSitekey = "1x00000000000000000000AA";

describe("GitHub-Pages-Konfiguration", () => {
  it("bezieht das öffentliche Turnstile-Sitekey ausschließlich aus einer Actions-Variable", async () => {
    const workflow = await readFile(
      ".github/workflows/deploy-pages.yml",
      "utf8",
    );

    expect(workflow).toContain(
      "PUBLIC_TURNSTILE_SITE_KEY: ${{ vars.PUBLIC_TURNSTILE_SITE_KEY }}",
    );
    expect(workflow).not.toContain("vars.PUBLIC_TURNSTILE_SITE_KEY ||");
  });

  it("weist Cloudflare-Dummy-Sitekeys im öffentlichen Deployment ab", async () => {
    const workflow = await readFile(
      ".github/workflows/deploy-pages.yml",
      "utf8",
    );

    expect(workflow).toContain(testSitekey);
    expect(workflow).toContain(
      "Cloudflare-Test-Sitekeys dürfen nicht in die öffentliche Website gebaut werden.",
    );
  });
});

describe("Kontaktformular-Diagnose", () => {
  it("unterscheidet Sicherheitsprüfung und Maildienst-Ausfall", async () => {
    const form = await readFile(
      "src/components/ContactForm.astro",
      "utf8",
    );

    expect(form).toContain('case "security_check_failed"');
    expect(form).toContain('case "temporarily_unavailable"');
    expect(form).toContain("Die Sicherheitsprüfung wurde abgelehnt");
    expect(form).toContain("Der Maildienst ist derzeit nicht verfügbar");
  });
});
