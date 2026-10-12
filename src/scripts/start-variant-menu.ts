export function setupStartVariantMenu(root: Document): void {
  const container = root.querySelector<HTMLElement>("[data-start-variant-menu]");
  const trigger = root.querySelector<HTMLButtonElement>("#start-variant-trigger");
  const menu = root.querySelector<HTMLElement>("#start-variant-menu");

  if (!container || !trigger || !menu) return;

  let suppressFocusOpen = false;
  let activated = false;
  const open = () => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  const close = (restoreFocus = false) => {
    activated = false;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      suppressFocusOpen = true;
      trigger.focus();
      queueMicrotask(() => {
        suppressFocusOpen = false;
      });
    }
  };

  container.addEventListener("mouseenter", open);
  container.addEventListener("mouseleave", () => {
    if (!container.contains(root.activeElement)) close();
  });
  container.addEventListener("focusin", () => {
    if (suppressFocusOpen) return;
    open();
  });
  container.addEventListener("focusout", (event) => {
    if (!container.contains(event.relatedTarget as Node | null)) close();
  });
  trigger.addEventListener("click", () => {
    if (activated) close();
    else {
      open();
      activated = true;
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      close(true);
    }
  });
  root.addEventListener("pointerdown", (event) => {
    if (!container.contains(event.target as Node)) close();
  });
}
