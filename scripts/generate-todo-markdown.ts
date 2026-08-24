import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createPublicTodoView,
  projectTodoCategoryLabels,
  projectTodoStatusLabels,
  projectTodos,
  type ProjectTodo,
} from "../src/content/project-todos";

function wrapMarkdownListItem(text: string): string {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > 86) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines
    .map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`))
    .join("\n");
}

function renderItem(item: ProjectTodo): string {
  const paths = item.relatedPaths.map((path) => `\`${path}\``).join(", ");
  const criteria = item.acceptanceCriteria.map(wrapMarkdownListItem).join("\n");

  return `### \`${item.id}\` – ${item.title}

${item.description}

- Status: ${projectTodoStatusLabels[item.status]}
- Priorität: ${item.priority}
- Kategorie: ${projectTodoCategoryLabels[item.category]}
- Verantwortlich: ${item.owner}
- Produktionsblocker: ${item.productionBlocker ? "Ja" : "Nein"}
- Quelle: ${item.source}
- Pfade: ${paths || "–"}
- Aktualisiert: ${item.updatedAt}

**Akzeptanzkriterien**

${criteria}
`;
}

function renderGroup(items: readonly ProjectTodo[]): string {
  return items.length === 0
    ? "Keine öffentlichen Einträge.\n"
    : items.map(renderItem).join("\n");
}

export function renderTodoMarkdown(
  items: readonly ProjectTodo[] = projectTodos,
): string {
  const view = createPublicTodoView(items);

  const markdown = `<!-- Generiert aus src/content/project-todos.ts. Nicht manuell bearbeiten. -->

# Projekt-TODOs

Öffentliche Projektübersicht. Keine Praxisleistung und kein medizinischer Status.

## Status

- Offen: ${view.counts.open}
- In Arbeit: ${view.counts.inProgress}
- Blockiert: ${view.counts.blocked}
- Erledigt: ${view.counts.done}
- Nicht zutreffend: ${view.counts.notApplicable}

## Produktionsblocker

${renderGroup(view.productionBlockers)}
## Weitere Aufgaben

${renderGroup(view.remainingTodos)}
## Erledigte Historie

${renderGroup(view.completedTodos)}`;

  return `${markdown.trimEnd()}\n`;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  writeFileSync(
    new URL("../docs/TODO.md", import.meta.url),
    renderTodoMarkdown(projectTodos),
    "utf8",
  );
}
