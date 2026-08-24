import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  resolveTurnstileSiteKey,
  TURNSTILE_TEST_SITEKEYS,
} from "../src/config/turnstile";

const validSitekey = "0x4AAAAAAABbCcDdEeFfGgHh";

describe("Turnstile-Sitekey-Validierung", () => {
  it("weist einen fehlenden Wert ohne ausdrückliches Test-Opt-in ab", () => {
    expect(() => resolveTurnstileSiteKey(undefined, { allowTestKeys: false })).toThrow(
      "PUBLIC_TURNSTILE_SITE_KEY fehlt",
    );
  });

  it.each(TURNSTILE_TEST_SITEKEYS)(
    "weist den öffentlichen Dummy-Sitekey %s ab",
    (sitekey) => {
      expect(() => resolveTurnstileSiteKey(sitekey, { allowTestKeys: false })).toThrow(
        "Cloudflare-Test-Sitekeys",
      );
    },
  );

  it.each([
    " ",
    "\t",
    ` ${validSitekey}`,
    `${validSitekey} `,
    `\t${TURNSTILE_TEST_SITEKEYS[0]}`,
  ])("weist leere oder gepolsterte Werte ab: %j", (sitekey) => {
    expect(() => resolveTurnstileSiteKey(sitekey, { allowTestKeys: false })).toThrow(
      "darf keine Leerzeichen enthalten",
    );
  });

  it("akzeptiert einen sauber formatierten echten Wert", () => {
    expect(resolveTurnstileSiteKey(validSitekey, { allowTestKeys: false })).toBe(
      validSitekey,
    );
  });

  it("erlaubt Dummy-Schlüssel ausschließlich nach ausdrücklichem Opt-in", () => {
    expect(
      resolveTurnstileSiteKey(TURNSTILE_TEST_SITEKEYS[0], {
        allowTestKeys: true,
      }),
    ).toBe(TURNSTILE_TEST_SITEKEYS[0]);
  });
});

describe("GitHub-Pages-Konfiguration", () => {
  it("bezieht das öffentliche Sitekey ausschließlich aus einer Actions-Variable", async () => {
    const workflow = await readFile(".github/workflows/deploy-pages.yml", "utf8");

    expect(workflow).toContain(
      "PUBLIC_TURNSTILE_SITE_KEY: ${{ vars.PUBLIC_TURNSTILE_SITE_KEY }}",
    );
    expect(workflow).toContain('ALLOW_TURNSTILE_TEST_KEYS: "false"');
    expect(workflow).not.toContain("vars.PUBLIC_TURNSTILE_SITE_KEY ||");
  });

  it("führt die gemeinsame Validierung vor dem Artefakt-Upload aus", async () => {
    const workflow = await readFile(".github/workflows/deploy-pages.yml", "utf8");

    const validation = workflow.indexOf(
      "pnpm exec tsx scripts/validate-turnstile-sitekey.ts",
    );
    const upload = workflow.indexOf("Pages-Artefakt hochladen");

    expect(validation).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(validation);
  });

  it("prüft das Startseiten-CSS-Artefakt nach dem Build in CI", async () => {
    const [packageJson, workflow] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile(".github/workflows/ci.yml", "utf8"),
    ]);
    const scripts = JSON.parse(packageJson) as {
      scripts: Record<string, string>;
    };

    expect(scripts.scripts["inspect:home-build"]).toBe(
      "tsx scripts/inspect-home-build.ts",
    );
    const build = workflow.indexOf("pnpm build");
    const inspectHome = workflow.indexOf("pnpm inspect:home-build");

    expect(build).toBeGreaterThanOrEqual(0);
    expect(inspectHome).toBeGreaterThanOrEqual(0);
    expect(inspectHome).toBeGreaterThan(build);
    expect(
      workflow.indexOf("pnpm exec tsx scripts/inspect-contact-build.ts"),
    ).toBeGreaterThan(workflow.indexOf("pnpm inspect:home-build"));
  });
});
