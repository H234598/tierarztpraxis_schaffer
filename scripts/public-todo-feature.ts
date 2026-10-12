const technicalReferences: Readonly<Record<string, readonly string[]>> = {
  "src/components/DevelopmentBanner.astro": ['withBase("todo/")'],
  "src/components/todo/TodoCard.astro": ['class="todo-', "data-todo-"],
  "src/pages/todo/index.astro": [
    '"../../components/todo/TodoCard.astro"',
    '"../../styles/todo.css"',
    'canonicalPath="/todo/"',
    'class="todo-',
    "data-todo-",
    'aria-labelledby="todo-',
    'id="todo-',
    'name="todo-',
    '"../../scripts/todo-filters"',
  ],
  "src/scripts/todo-filters.ts": [
    '"[data-todo-',
    '"todo-category"',
    '"todo-status"',
    '"todo-owner"',
  ],
  "src/styles/todo.css": ["[data-todo-", ".todo-", "--todo-", 'name="todo-'],
};

export function exemptPublicTodoFeatureReferences(
  path: string,
  content: string,
): string {
  return (technicalReferences[path] ?? []).reduce(
    (normalized, reference) =>
      normalized.replaceAll(reference, reference.replace("todo", "project-overview")),
    content,
  );
}
