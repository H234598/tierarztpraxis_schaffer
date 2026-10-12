import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import playwrightConfig from "../playwright.config";

function project(name: string) {
  const value = playwrightConfig.projects?.find((candidate) => candidate.name === name);
  expect(value, `Playwright-Projekt ${name} fehlt`).toBeDefined();
  return value!;
}

describe("Playwright-Matrix", () => {
  it("führt alle Specs ausschließlich einmal auf Desktop aus", () => {
    expect(playwrightConfig.projects?.map(({ name }) => name)).toEqual([
      "desktop",
      "tablet",
      "mobile",
    ]);
    expect(project("desktop").testMatch).toBeUndefined();
    expect(project("desktop").use).toMatchObject({
      browserName: "chromium",
      viewport: { width: 1440, height: 1100 },
    });
  });

  it("begrenzt Tablet und Mobile auf den Accessibility-Spec", () => {
    for (const name of ["tablet", "mobile"]) {
      expect(String(project(name).testMatch)).toBe("/accessibility\\.spec\\.ts/");
    }
    expect(project("tablet").use).toMatchObject({
      browserName: "chromium",
      viewport: { width: 768, height: 1024 },
    });
    expect(project("mobile").use).toMatchObject({
      browserName: "chromium",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
  });

  it("bewahrt Goldens und sammelt nur Fehlerartefakte", () => {
    const snapshotEnvironmentSuffix =
      process.env.CI === "true" ? "-ci-ubuntu-24.04" : "";

    expect(playwrightConfig.snapshotPathTemplate).toBe(
      `{testDir}/{testFilePath}-snapshots/{arg}-{platform}${snapshotEnvironmentSuffix}{ext}`,
    );
    expect(playwrightConfig.timeout).toBe(15_000);
    expect(playwrightConfig.retries).toBe(process.env.CI ? 2 : 0);
    expect(playwrightConfig.reporter).toEqual([["list"], ["html", { open: "never" }]]);
    expect(playwrightConfig.use).toMatchObject({
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
    });
  });
});

describe("Startseiten-Qualitätsgates", () => {
  it("stellt minimale Paket-Skripte bereit", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["test:e2e"]).toBe("playwright test");
    expect(packageJson.scripts["check:home-budgets"]).toBe(
      "tsx scripts/check-home-budgets.ts",
    );
  });

  it("prüft Budgets direkt nach dem Build in der Haupt-CI", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const build = workflow.indexOf("run: pnpm build");
    const budget = workflow.indexOf("run: pnpm check:home-budgets");

    expect(build).toBeGreaterThan(-1);
    expect(budget).toBeGreaterThan(build);
    expect(workflow.slice(build, budget).match(/run: pnpm /g)).toHaveLength(1);
  });

  it("führt Chromium-E2E reproduzierbar und ohne Schreibrechte aus", () => {
    const workflow = readFileSync(".github/workflows/e2e.yml", "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("runs-on: ubuntu-24.04");
    expect(workflow).toContain("timeout-minutes: 20");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm exec playwright install --with-deps chromium");
    expect(workflow).toContain("run: pnpm test:e2e");
    expect(workflow).toContain("uses: actions/upload-artifact@v4");
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("retention-days: 5");
    expect(workflow).toContain("if-no-files-found: ignore");
    expect(workflow).not.toMatch(/(?:contents|pages|id-token): write/);
    expect(workflow).not.toContain("deploy");
  });
});
