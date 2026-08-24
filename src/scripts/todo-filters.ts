export function setupTodoFilters(root: Document): void {
  const page = root.querySelector<HTMLElement>("[data-todo-page]");
  const form = page?.querySelector<HTMLFormElement>("[data-todo-filters]");
  const result = page?.querySelector<HTMLElement>("[data-todo-result-count]");
  const cards = [...(page?.querySelectorAll<HTMLElement>("[data-todo-card]") ?? [])];

  if (!page || !form || !result) return;

  const update = () => {
    const values = new FormData(form);
    const category = String(values.get("todo-category") ?? "all");
    const status = String(values.get("todo-status") ?? "all");
    const owner = String(values.get("todo-owner") ?? "all");
    let visible = 0;

    for (const card of cards) {
      const matches =
        (category === "all" || card.dataset.category === category) &&
        (status === "all" || card.dataset.status === status) &&
        (owner === "all" || card.dataset.owner === owner);

      card.hidden = !matches;
      visible += Number(matches);
    }

    result.textContent = `${visible} Aufgaben entsprechen dem Filter`;
    result.hidden = false;
  };

  form.addEventListener("change", update);
  form.addEventListener("reset", () => setTimeout(update));
  update();
}
