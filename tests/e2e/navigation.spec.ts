import { expect, test } from "@playwright/test";

const variants = ["1", "2", "3", "4"] as const;

test.describe("Startseitenmenü", () => {
  test("öffnet alle Varianten per Hover", async ({ page }) => {
    await page.goto("/");

    await page.locator("[data-start-variant-menu]").hover();

    const list = page
      .locator(".desktop-nav")
      .getByRole("list", { name: "Startseiten auswählen" });
    const trigger = page.getByRole("button", { name: "Startseiten auswählen" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("link")).toHaveCount(4);
    await expect(list.getByText("Standard", { exact: true })).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).not.toHaveAttribute("aria-haspopup");
  });

  test("öffnet per Fokus und schließt mit Escape zum Trigger", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Startseiten auswählen" });
    await trigger.focus();
    await expect(
      page.getByRole("list", { name: "Startseiten auswählen" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Startseite 1" }).focus();

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("list", { name: "Startseiten auswählen" }),
    ).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("öffnet und schließt per echtem Pointer-Klick", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Startseiten auswählen" });
    const list = page.getByRole("list", { name: "Startseiten auswählen" });
    await expect(list).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(list).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await trigger.click();
    await expect(list).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("öffnet und schließt per echtem Touch-Tap", async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      hasTouch: true,
      viewport: { width: 1200, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Startseiten auswählen" });
    const list = page.getByRole("list", { name: "Startseiten auswählen" });
    await expect(list).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();

    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(list).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(list).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await context.close();
  });

  test("folgt per Tab und Shift+Tab der nativen Linkreihenfolge", async ({ page }) => {
    await page.goto("/");

    const start = page.locator(".desktop-nav > ul > li > a", { hasText: "Start" });
    const trigger = page.getByRole("button", { name: "Startseiten auswählen" });
    const firstVariant = page.getByRole("link", { name: "Startseite 1" });
    await start.focus();

    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole("list", { name: "Startseiten auswählen" }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(firstVariant).toBeFocused();
    await page.keyboard.press("Shift+Tab");
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
        page.getByRole("link", { name: `Startseite ${variant}` }),
      ).toHaveAttribute("href", `/startseiten/${variant}/`);
    }
  });

  test("schließt bei Klick außerhalb des Menüs", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-start-variant-menu]").hover();
    await expect(
      page.getByRole("list", { name: "Startseiten auswählen" }),
    ).toBeVisible();

    await page.locator("main").click({ position: { x: 8, y: 8 } });

    await expect(
      page.getByRole("list", { name: "Startseiten auswählen" }),
    ).toBeHidden();
  });

  test("behält fokussierten Variantenlink beim Verlassen mit der Maus offen", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("[data-start-variant-menu]").hover();

    const list = page.getByRole("list", { name: "Startseiten auswählen" });
    const variantLink = list.getByRole("link", { name: "Startseite 1" });
    await variantLink.focus();
    await page.locator("main").hover({ position: { x: 8, y: 8 } });

    await expect(list).toBeVisible();
    await expect(variantLink).toBeFocused();
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
