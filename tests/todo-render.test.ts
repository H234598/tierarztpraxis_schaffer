import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { renderTodoMarkdown } from "../scripts/generate-todo-markdown";
import { resolveRobots } from "../src/config/robots";
import {
  createPublicTodoView,
  projectTodos,
  type ProjectTodo,
} from "../src/content/project-todos";
import { joinBasePath } from "../src/utils/paths";

const internalSentinel: ProjectTodo = {
  id: "INTERNAL-SENTINEL",
  title: "Nur intern sichtbarer Testeintrag",
  description: "Harmloser Sentinel für die Sichtbarkeitsgrenze.",
  status: "blocked",
  priority: "P0",
  category: "security",
  productionBlocker: true,
  visibility: "internal",
  owner: "Repository",
  source: "Testfixture",
  acceptanceCriteria: ["Sentinel bleibt außerhalb öffentlicher Ausgaben."],
  relatedPaths: ["tests/todo-render.test.ts"],
  updatedAt: "2026-08-04",
};

describe("öffentliche TODO-Ansicht", () => {
  it("filtert intern vor Gruppierung und Zählung", () => {
    const view = createPublicTodoView([...projectTodos, internalSentinel]);

    expect(view.counts).toEqual({
      open: 60,
      inProgress: 0,
      blocked: 0,
      done: 8,
      notApplicable: 0,
    });
    expect(
      [...view.productionBlockers, ...view.remainingTodos, ...view.completedTodos].map(
        (todo) => todo.id,
      ),
    ).not.toContain(internalSentinel.id);
  });

  it("sortiert aktive Produktionsblocker nach Priorität und stabiler ID", () => {
    const view = createPublicTodoView(projectTodos);

    expect(view.productionBlockers.slice(0, 4).map((todo) => todo.id)).toEqual([
      "A11Y-007",
      "A11Y-008",
      "A11Y-009",
      "A11Y-010",
    ]);
    expect(view.productionBlockers).toHaveLength(55);
  });

  it("führt ausschließlich die belegten DES-001 bis DES-008 als erledigt", () => {
    expect(
      projectTodos
        .filter((todo) => todo.id.startsWith("DES-"))
        .map(({ id, status }) => [id, status]),
    ).toEqual([
      ["DES-001", "done"],
      ["DES-002", "done"],
      ["DES-003", "done"],
      ["DES-004", "done"],
      ["DES-005", "done"],
      ["DES-006", "done"],
      ["DES-007", "done"],
      ["DES-008", "done"],
    ]);
    expect(
      projectTodos
        .filter((todo) => !todo.id.startsWith("DES-"))
        .every((todo) => todo.status === "open"),
    ).toBe(true);
  });
});

describe("TODO-Markdown", () => {
  it("ist deterministisch und schließt interne Einträge vollständig aus", () => {
    const first = renderTodoMarkdown([...projectTodos, internalSentinel]);
    const second = renderTodoMarkdown([...projectTodos, internalSentinel]);

    expect(second).toBe(first);
    expect(first).not.toContain(internalSentinel.id);
    expect(first).not.toContain(internalSentinel.title);
    expect(first.indexOf("## Produktionsblocker")).toBeLessThan(
      first.indexOf("## Weitere Aufgaben"),
    );
    expect(first.indexOf("## Weitere Aufgaben")).toBeLessThan(
      first.indexOf("## Erledigte Historie"),
    );
  });

  it("entspricht bytegleich der getrackten Datei", () => {
    expect(readFileSync("docs/TODO.md", "utf8")).toBe(renderTodoMarkdown(projectTodos));
  });
});

describe("TODO-Robots-Vertrag", () => {
  it("bewahrt angefordertes noindex,nofollow auch in Produktion", () => {
    expect(resolveRobots(false, "noindex,nofollow")).toBe("noindex,nofollow");
  });
});

describe("Development-Banner-Link", () => {
  it("hängt die Projektübersicht an einen konfigurierten Basispfad", () => {
    expect(joinBasePath("/preview/", "todo/")).toBe("/preview/todo/");
  });
});
