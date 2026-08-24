import { expect, test } from "@playwright/test";

const variants = ["1", "2", "3", "4"] as const;

test.describe("Startseitenmenü", () => {
  test("öffnet alle Varianten per Hover", async ({ page }) => {
    await page.goto("/");

    await page.locator("[data-start-variant-menu]").hover();

    const menu = page.getByRole("menu", { name: "Startseiten auswählen" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(4);
    await expect(menu.getByText("Standard", { exact: true })).toBeVisible();
  });

  test("öffnet per Fokus und schließt mit Escape zum Trigger", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Startseiten auswählen" });
    await trigger.focus();
    await expect(
      page.getByRole("menu", { name: "Startseiten auswählen" }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Startseite 1" }).focus();

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("menu", { name: "Startseiten auswählen" }),
    ).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("behält Start als Link und verwendet Variantenrouten", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator(".desktop-nav > ul > li > a", { hasText: "Start" }),
    ).toHaveAttribute("href", "/");
    await page.locator("[data-start-variant-menu]").hover();

    for (const variant of variants) {
      await expect(
        page.getByRole("menuitem", { name: `Startseite ${variant}` }),
      ).toHaveAttribute("href", `/startseiten/${variant}/`);
    }
  });

  test("schließt bei Klick außerhalb des Menüs", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-start-variant-menu]").hover();
    await expect(
      page.getByRole("menu", { name: "Startseiten auswählen" }),
    ).toBeVisible();

    await page.locator("main").click({ position: { x: 8, y: 8 } });

    await expect(
      page.getByRole("menu", { name: "Startseiten auswählen" }),
    ).toBeHidden();
  });

  test("behält fokussierten Menüeintrag beim Verlassen mit der Maus offen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("[data-start-variant-menu]").hover();

    const menu = page.getByRole("menu", { name: "Startseiten auswählen" });
    const menuitem = menu.getByRole("menuitem", { name: "Startseite 1" });
    await menuitem.focus();
    await page.locator("main").hover({ position: { x: 8, y: 8 } });

    await expect(menu).toBeVisible();
    await expect(menuitem).toBeFocused();
  });

  test("zeigt mobil verschachtelte Varianten mit Standardmarkierung", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const mobileTrigger = page.locator(".mobile-menu > summary");
    await mobileTrigger.focus();
    await page.keyboard.press("Enter");

    const mobileVariants = page.locator(".mobile-menu [data-start-variants]");
    await expect(mobileVariants).toBeVisible();
    await expect(mobileVariants.getByRole("link")).toHaveCount(4);
    await expect(mobileVariants.getByText("Standard", { exact: true })).toBeVisible();
  });
});
