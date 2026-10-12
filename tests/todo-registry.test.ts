import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { getOpenProductionBlockers, projectTodos } from "../src/content/project-todos";

const initialTodoIds = [
  "CNT-001",
  "CNT-002",
  "CNT-003",
  "CNT-004",
  "CNT-005",
  "CNT-006",
  "CNT-007",
  "CNT-008",
  "CNT-009",
  "A11Y-001",
  "A11Y-002",
  "A11Y-003",
  "A11Y-004",
  "A11Y-005",
  "A11Y-006",
  "A11Y-007",
  "A11Y-008",
  "A11Y-009",
  "A11Y-010",
  "LEG-001",
  "LEG-002",
  "LEG-003",
  "LEG-004",
  "LEG-005",
  "LEG-006",
  "LEG-007",
  "LEG-008",
  "LEG-009",
  "LEG-010",
  "LEG-011",
  "LEG-012",
  "LEG-013",
  "LEG-014",
  "LEG-015",
  "LEG-016",
  "DES-001",
  "DES-002",
  "DES-003",
  "DES-004",
  "DES-005",
  "DES-006",
  "DES-007",
  "DES-008",
  "DT-001",
  "DT-002",
  "DT-003",
  "DT-004",
  "DT-005",
  "DT-006",
  "DT-007",
  "DT-008",
  "DT-009",
  "DT-010",
  "DT-011",
  "DT-012",
  "DT-013",
  "DT-014",
  "DT-015",
  "DT-016",
  "DT-017",
  "OPS-001",
  "OPS-002",
  "OPS-003",
  "OPS-004",
  "OPS-005",
  "OPS-006",
  "OPS-007",
  "OPS-008",
];

describe("Projekt-TODO-Registry", () => {
  it("enthält jede initial geplante TODO-ID genau einmal", () => {
    expect(projectTodos.map((todo) => todo.id)).toEqual(initialTodoIds);
    expect(new Set(projectTodos.map((todo) => todo.id)).size).toBe(projectTodos.length);
  });

  it("verwendet erlaubte Statuswerte und vollständige Akzeptanzkriterien", () => {
    const allowedStatuses = new Set([
      "open",
      "in-progress",
      "blocked",
      "done",
      "not-applicable",
    ]);

    for (const todo of projectTodos) {
      expect(allowedStatuses.has(todo.status)).toBe(true);
      expect(todo.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(
        todo.acceptanceCriteria.every((criterion) => criterion.trim().length > 0),
      ).toBe(true);
    }
  });

  it("liefert offene Produktionsblocker aus derselben Registry", () => {
    const blockers = getOpenProductionBlockers();

    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.every((todo) => todo.productionBlocker)).toBe(true);
    expect(blockers.every((todo) => todo.status === "open")).toBe(true);
  });
});

describe("Inhaltsvalidator", () => {
  it("bricht Produktion bei offenen Produktionsblockern ab", () => {
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/validate-content.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SITE_DEPLOYMENT_MODE: "production",
          ALLOW_PLACEHOLDERS: "false",
          ALLOW_TURNSTILE_TEST_KEYS: "false",
          PUBLIC_SITE_URL: "https://tierarztpraxis-schaffer.telacore.org",
          PUBLIC_BASE_PATH: "/",
          PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAABbCcDdEeFfGgHh",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("offene Produktionsblocker");
    expect(result.stderr).toContain("CNT-001");
  });

  it("lässt Development trotz dokumentierter Platzhalter weiterlaufen", () => {
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
    expect(result.stderr).toContain("bewusst erlaubten Platzhalterproblemen");
  });
});
