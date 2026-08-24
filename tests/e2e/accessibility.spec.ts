import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { e2eOrigin } from "./origin";

const variants = [1, 2, 3, 4].map((variant) => ({
  label: `Startseite ${variant}`,
  path: `/startseiten/${variant}/`,
}));

const allowedExternalHosts = new Set([
  "www.openstreetmap.org",
  "tile.openstreetmap.org",
  "a.tile.openstreetmap.org",
  "b.tile.openstreetmap.org",
  "c.tile.openstreetmap.org",
]);

async function expectNoSevereAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length }));

  expect(severe).toEqual([]);
}

async function expectWorkingSkipLink(page: Page) {
  const skipLink = page.getByRole("link", {
    name: "Zum Hauptinhalt springen",
  });

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  const box = await skipLink.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight),
  );

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => {
      const main = document.querySelector("#main-content");
      return Boolean(
        main &&
        document.activeElement !== main &&
        main.contains(document.activeElement),
      );
    }),
  ).toBe(true);
}

for (const variant of variants) {
  test(`${variant.label}: axe meldet keine schweren Verstöße`, async ({ page }) => {
    await page.goto(variant.path);
    await expectNoSevereAxeViolations(page);
  });

  test(`${variant.label}: Skip-Link führt ohne Fokusfalle ins Main`, async ({
    page,
  }) => {
    await page.goto(variant.path);
    await expectWorkingSkipLink(page);
  });

  test(`${variant.label}: reflowt bei 640 und 320 CSS-Pixeln`, async ({ page }) => {
    for (const width of [640, 320]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(variant.path);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `${variant.label} erweitert bei ${width}px die Seite horizontal`,
      ).toBe(true);
    }
  });
}

test("Root übernimmt axe- und Tastaturvertrag der Standardvariante", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Root genügt auf Desktop");
  await page.goto("/");
  await expectNoSevereAxeViolations(page);
  await expectWorkingSkipLink(page);
});

test("alle Startseiten erlauben nur eigene Requests und exakte OSM-Hosts", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Request-Grenze ist viewport-unabhängig",
  );

  expect(allowedExternalHosts.has("www.openstreetmap.org.invalid")).toBe(false);
  expect(allowedExternalHosts.has("evilopenstreetmap.org")).toBe(false);

  const unexpectedHosts = new Set<string>();
  const observedExternalHosts = new Set<string>();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === e2eOrigin) {
      await route.continue();
      return;
    }

    observedExternalHosts.add(url.hostname);
    if (!allowedExternalHosts.has(url.hostname)) {
      unexpectedHosts.add(url.hostname);
    }
    await route.abort();
  });

  for (const variant of variants) {
    await page.goto(variant.path);
  }

  expect([...unexpectedHosts].sort()).toEqual([]);
  expect([...observedExternalHosts].sort()).toEqual(["www.openstreetmap.org"]);
});
