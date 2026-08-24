import { expect, test } from "@playwright/test";
import { e2eOrigin } from "./origin";

test("rendert öffentliche Projektübersicht mit festem noindex-Vertrag", async ({
  page,
}) => {
  await page.goto("/todo/");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${e2eOrigin}/todo/`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  await expect(
    page.getByRole("heading", { name: "Projektübersicht", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Produktionsblocker", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-todo-count="open"]')).toHaveText("60");
  await expect(page.locator('[data-todo-count="done"]')).toHaveText("8");
  await expect(page.locator('[data-todo-id="CNT-001"]')).toBeVisible();
  await expect(page.locator('[data-visibility="internal"]')).toHaveCount(0);

  const banner = page.getByRole("complementary", {
    name: "Hinweis zur Entwicklungsversion",
  });
  await expect(banner.getByRole("link", { name: "Projekt-TODOs" })).toHaveAttribute(
    "href",
    "/todo/",
  );
});

test("filtert Kategorie, Status und Verantwortliche ohne JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/todo/");

  await page.getByRole("radio", { name: "Inhalte", exact: true }).check();
  await expect(page.locator('[data-todo-id="CNT-001"]')).toBeVisible();
  await expect(page.locator('[data-todo-id="A11Y-007"]')).toBeHidden();

  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await page.getByRole("radio", { name: "Erledigt", exact: true }).check();
  await page.locator("[data-todo-history] > summary").click();
  await expect(page.locator('[data-todo-id="DES-001"]')).toBeVisible();
  await expect(page.locator('[data-todo-id="CNT-001"]')).toBeHidden();

  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await page.getByRole("radio", { name: "Cloudflare", exact: true }).check();
  await expect(page.locator('[data-todo-id="DT-001"]')).toBeVisible();
  await expect(page.locator('[data-todo-id="CNT-001"]')).toBeHidden();

  await context.close();
});

test("aktualisiert Ergebniszahl und Reset progressiv mit JavaScript", async ({
  page,
}) => {
  await page.goto("/todo/");

  const result = page.locator("[data-todo-result-count]");
  await expect(result).toHaveText("68 Aufgaben entsprechen dem Filter");

  await page.getByRole("radio", { name: "Inhalte", exact: true }).check();
  await expect(result).toHaveText("9 Aufgaben entsprechen dem Filter");

  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(result).toHaveText("68 Aufgaben entsprechen dem Filter");
});

test("reflowt bei 320 CSS-Pixeln ohne horizontale Seitenausdehnung", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1100 });
  await page.goto("/todo/");

  const hasNoHorizontalOverflow = await page
    .locator("html")
    .evaluate((element) => element.scrollWidth <= element.clientWidth);

  expect(hasNoHorizontalOverflow).toBe(true);
});
