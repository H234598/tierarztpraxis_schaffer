import { spawnSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { exemptHistoricalH15Placeholders } from "../scripts/historical-h15-placeholder";
import { exemptPublicTodoFeatureReferences } from "../scripts/public-todo-feature";

describe("Inhaltsvalidator", () => {
  it("maskiert nur technische Referenzen der Projektübersicht", () => {
    const path = "src/pages/todo/index.astro";
    const source = `<div class="todo-page" data-todo-page>
      <p>TODO: Dieser Platzhalter muss sichtbar bleiben.</p>
    </div>`;

    const normalized = exemptPublicTodoFeatureReferences(path, source);

    expect(normalized).not.toContain('class="todo-page"');
    expect(normalized).not.toContain("data-todo-page");
    expect(normalized).toContain("TODO: Dieser Platzhalter muss sichtbar bleiben.");
  });

  it("behält TODO-Kommentare in Styles zur Prüfung", () => {
    const normalized = exemptPublicTodoFeatureReferences(
      "src/styles/todo.css",
      `[data-todo-page] { --todo-accent: red; } /* TODO-later */`,
    );

    expect(normalized).toContain("TODO-later");
  });

  it("behandelt technische Dateien der Projektübersicht nicht als Platzhalter", () => {
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/validate-content.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SITE_DEPLOYMENT_MODE: "development",
          ALLOW_PLACEHOLDERS: "true",
          ALLOW_TURNSTILE_TEST_KEYS: "true",
          PUBLIC_SITE_URL: "http://localhost:4321",
          PUBLIC_BASE_PATH: "/",
          PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("src/components/DevelopmentBanner.astro");
    expect(result.stderr).not.toContain("src/components/todo/");
    expect(result.stderr).not.toContain("src/pages/todo/");
    expect(result.stderr).not.toContain("src/scripts/todo-filters.ts");
    expect(result.stderr).not.toContain("src/styles/todo.css");
  });

  it("nimmt nur das historische H15-TODO aus und meldet andere Platzhalter", async () => {
    const fixtureName = `.content-validator-${process.pid}-${Date.now()}.ts`;
    const fixturePath = join("src", fixtureName);

    await writeFile(fixturePath, 'export const accidental = "TODO";\n');

    try {
      const result = spawnSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "scripts/validate-content.ts"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            SITE_DEPLOYMENT_MODE: "development",
            ALLOW_PLACEHOLDERS: "false",
            ALLOW_TURNSTILE_TEST_KEYS: "true",
            PUBLIC_SITE_URL: "http://localhost:4321",
            PUBLIC_BASE_PATH: "/",
            PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("src/content/milestones.ts");
      expect(result.stderr).toContain(
        `src/${fixtureName}: enthält den Platzhalter TODO`,
      );
    } finally {
      await rm(fixturePath, { force: true });
    }
  });

  it("behält kanonischen H15-Text außerhalb des H15-Datensatzes zur Prüfung", () => {
    const canonicalH15Goal =
      "Neue Seite `TODO` mit allen offenen Daten, Entscheidungen, Aufgaben und Produktionsblockern.";
    const accidentalDuplicate = `export const accidentalH15Goal = ${JSON.stringify(canonicalH15Goal)};`;
    const canonicalH15Record = `  {
    id: "H15",
    period: "2026-08-04",
    goal: "Neue Seite \`TODO\` mit allen offenen Daten, Entscheidungen, Aufgaben und Produktionsblockern.",
    status: "geplant",
    evidence: "strukturierte TODO-Registry",
  },`;

    const normalized = exemptHistoricalH15Placeholders(
      `${accidentalDuplicate}\n${canonicalH15Record}`,
    );

    expect(normalized).toContain(accidentalDuplicate);
    expect(normalized).toContain(
      'goal: "Neue Seite `Aufgabenübersicht` mit allen offenen Daten, Entscheidungen, Aufgaben und Produktionsblockern."',
    );
    expect(normalized).toContain(
      'evidence: "strukturierte Aufgabenübersicht-Registry"',
    );
  });
});
