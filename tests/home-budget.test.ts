import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HOME_BUDGETS,
  evaluateHomeBudgets,
  type HomeBudgetFiles,
} from "../scripts/check-home-budgets";

const temporaryDirectories: string[] = [];

function sized(path: string, bytes: number) {
  return { path, bytes };
}

function files(overrides: Partial<HomeBudgetFiles> = {}): HomeBudgetFiles {
  return {
    rasters: [],
    svgs: [],
    css: [],
    js: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Startseiten-Budgets", () => {
  it("akzeptiert alle inklusiven Byte-Grenzen", () => {
    expect(HOME_BUDGETS).toEqual({
      rasterFile: 100 * 1024,
      rasterTotal: 256 * 1024,
      svgFile: 10 * 1024,
      cssTotal: 64 * 1024,
      jsTotal: 32 * 1024,
    });

    expect(
      evaluateHomeBudgets(
        files({
          rasters: [
            sized("public/images/home/a.webp", 100 * 1024),
            sized("public/images/home/b.webp", 100 * 1024),
            sized("public/images/home/c.webp", 56 * 1024),
          ],
          svgs: [sized("public/images/home/icon.svg", 10 * 1024)],
          css: [sized("dist/_assets/home.css", 64 * 1024)],
          js: [sized("dist/_assets/home.js", 32 * 1024)],
        }),
      ),
    ).toEqual([]);
  });

  it("meldet Raster-Einzel- und Summenüberschreitungen getrennt", () => {
    expect(
      evaluateHomeBudgets(
        files({
          rasters: [sized("public/images/home/hero.webp", 100 * 1024 + 1)],
        }),
      ),
    ).toEqual(["Raster public/images/home/hero.webp: 102401 Byte > 102400 Byte."]);

    expect(
      evaluateHomeBudgets(
        files({
          rasters: [
            sized("public/images/home/a.webp", 90 * 1024),
            sized("public/images/home/b.webp", 90 * 1024),
            sized("public/images/home/c.webp", 90 * 1024),
          ],
        }),
      ),
    ).toEqual(["Raster gesamt: 276480 Byte > 262144 Byte."]);
  });

  it("meldet SVG-, CSS- und JavaScript-Überschreitungen deterministisch", () => {
    const input = files({
      rasters: [
        sized("public/images/home/z.webp", 100 * 1024 + 1),
        sized("public/images/home/a.webp", 100 * 1024 + 2),
      ],
      svgs: [sized("public/images/home/z.svg", 10 * 1024 + 1)],
      css: [sized("dist/_assets/z.css", 64 * 1024 + 1)],
      js: [sized("dist/_assets/z.js", 32 * 1024 + 1)],
    });

    expect(evaluateHomeBudgets(input)).toEqual([
      "Raster public/images/home/a.webp: 102402 Byte > 102400 Byte.",
      "Raster public/images/home/z.webp: 102401 Byte > 102400 Byte.",
      "SVG public/images/home/z.svg: 10241 Byte > 10240 Byte.",
      "CSS gesamt: 65537 Byte > 65536 Byte.",
      "JavaScript gesamt: 32769 Byte > 32768 Byte.",
    ]);
    expect(
      evaluateHomeBudgets(
        files({
          ...input,
          rasters: [...input.rasters].reverse(),
        }),
      ),
    ).toEqual(evaluateHomeBudgets(input));
  });

  it("beendet die CLI bei fehlendem dist/_assets reproduzierbar", () => {
    const projectRoot = resolve(import.meta.dirname, "..");
    const temporaryRoot = mkdtempSync(join(tmpdir(), "home-budget-"));
    temporaryDirectories.push(temporaryRoot);
    mkdirSync(join(temporaryRoot, "public/images/home"), { recursive: true });

    const result = spawnSync(
      process.execPath,
      [
        resolve(projectRoot, "node_modules/tsx/dist/cli.mjs"),
        resolve(projectRoot, "scripts/check-home-budgets.ts"),
      ],
      { cwd: temporaryRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(
      "Startseiten-Budgetprüfung fehlgeschlagen: dist/_assets fehlt.",
    );
  });
});
