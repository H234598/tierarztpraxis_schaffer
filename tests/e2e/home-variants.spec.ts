import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { e2eOrigin } from "./origin";

const variants = ["1", "2", "3", "4"] as const;

test("rendert Root mit Standardvariante 4", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-home-variant]")).toHaveAttribute(
    "data-home-variant",
    "4",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${e2eOrigin}/`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
});

test("rendert jede statische Startseitenvariante mit Canonical Root", async ({
  page,
}) => {
  for (const variant of variants) {
    await page.goto(`/startseiten/${variant}/`);

    await expect(page.locator("[data-home-variant]")).toHaveAttribute(
      "data-home-variant",
      variant,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${e2eOrigin}/`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );
  }
});

test("generiert keine ungültige Startseitenvariante", async ({ page }) => {
  const response = await page.goto("/startseiten/5/");

  expect(response?.status()).toBe(404);
  await expect(page.locator("[data-home-variant]")).toHaveCount(0);
});

test("rendert Startseite 1 mit freigegebener Hero-Copy", async ({ page }) => {
  await page.goto("/startseiten/1/");

  await expect(
    page.getByRole("heading", {
      name: "Mit Herz, Kompetenz und moderner Tiermedizin.",
    }),
  ).toBeVisible();
  await expect(page.locator(".hero-copy > p:not(.eyebrow)").first()).toHaveText(
    "Wir nehmen uns Zeit, hören zu und erklären verständlich, was Ihr Tier jetzt braucht.",
  );
});

test("rendert Startseite 4 mit freigegebener dreiteiliger Hero-Copy", async ({
  page,
}) => {
  await page.goto("/startseiten/4/");

  await expect(
    page.getByRole("heading", {
      name: "Willkommen in der Tierarztpraxis Dr. Schäffer.",
    }),
  ).toBeVisible();
  await expect(page.locator(".home-4__hero-accent")).toHaveText(
    "Persönlich. Sorgfältig. Für Ihr Tier da.",
  );
  await expect(page.locator(".home-4__hero-intro")).toHaveText(
    "Von der Vorsorge bis zur Behandlung begleiten wir Sie mit Erfahrung, Ruhe und einem offenen Ohr.",
  );
  await expect(page.locator(".home-4__hero-cta")).toHaveAttribute(
    "href",
    "tel:+4991163292983",
  );
});

test("priorisiert das Startseite-4-Herobild und setzt die Caption unter die Bildpixel", async ({
  page,
}) => {
  await page.goto("/startseiten/4/");

  const figure = page.locator('[data-home-variant="4"] .home-4__hero-figure');
  const image = figure.locator("img");
  const caption = figure.locator("img + figcaption");
  await expect(image).toHaveAttribute(
    "src",
    "/images/home/variant-4/hero-hund-katze.webp",
  );
  await expect(image).toHaveAttribute("width", "1920");
  await expect(image).toHaveAttribute("height", "1080");
  await expect(image).not.toHaveAttribute("loading", "lazy");
  await expect(image).toHaveAttribute("fetchpriority", "high");
  await expect(caption).toHaveText("Symbolbild");

  const imageBox = await image.boundingBox();
  const captionBox = await caption.boundingBox();
  expect(imageBox).not.toBeNull();
  expect(captionBox).not.toBeNull();
  expect(captionBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
});

test("gliedert Startseite 4 in freigegebene Pflichtbereiche und Schnellzugriffe", async ({
  page,
}) => {
  await page.goto("/startseiten/4/");

  for (const heading of [
    "Öffnungszeiten",
    "Leistungen",
    "Vorsorge und Beratung",
    "Diagnostik und Behandlung",
    "Operationen und Nachsorge",
    "Praxis und Zugänglichkeit",
    "Häufige Fragen",
    "Stellenangebote",
    "Direkt auf OpenStreetMap",
    "Wir sind telefonisch für Sie da",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }

  const quickLinks = page.getByRole("navigation", { name: "Schnellzugriffe" });
  for (const [label, href] of [
    ["Kontakt", "/kontakt/"],
    ["Notfall", "/notfall/"],
    ["FAQ", "/faq/"],
    ["Stellenangebote", "/stellenangebote/"],
  ] as const) {
    await expect(
      quickLinks.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("href", href);
  }

  await expect(
    page.getByRole("link", { name: "Praxisangaben ansehen" }),
  ).toHaveAttribute("href", "/praxis/");
  await expect(page.getByRole("link", { name: "Erklärung lesen" })).toHaveAttribute(
    "href",
    "/barrierefreiheit/",
  );
});

test("rendert Root und Startseitenroute mit derselben Variante-4-Struktur", async ({
  page,
}) => {
  await page.goto("/");
  const rootMarkup = await page
    .locator('[data-home-variant="4"]')
    .evaluate((element) => element.innerHTML);

  await page.goto("/startseiten/4/");
  const variantMarkup = await page
    .locator('[data-home-variant="4"]')
    .evaluate((element) => element.innerHTML);

  expect(variantMarkup).toBe(rootMarkup);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${e2eOrigin}/`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
});

test("isoliert Startseite-4-Markup und -CSS von Varianten 1 bis 3", async ({
  page,
}) => {
  await page.goto("/startseiten/4/");
  await expect(page.locator(".home-4__hero")).toBeVisible();
  await expect(page.locator('[data-home-variant="4"]')).toHaveCSS(
    "--home-4-teal",
    "#0b6468",
  );

  for (const variant of ["1", "2", "3"] as const) {
    await page.goto(`/startseiten/${variant}/`);
    await expect(page.locator(".home-4__hero")).toHaveCount(0);
    await expect(page.locator(`[data-home-variant="${variant}"]`)).not.toHaveCSS(
      "--home-4-teal",
      "#0b6468",
    );
  }
});

test("rendert Startseite 4 ohne schwere axe-Verstöße", async ({ page }) => {
  await page.goto("/startseiten/4/");

  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(seriousOrCritical).toEqual([]);
});

test("Startseite 4 reflowt bei 320 CSS-Pixeln ohne horizontale Seitenausdehnung", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1100 });
  await page.goto("/startseiten/4/");

  const hasNoHorizontalOverflow = await page
    .locator("html")
    .evaluate((element) => element.scrollWidth <= element.clientWidth);

  expect(hasNoHorizontalOverflow).toBe(true);
});

test("zeigt Startseite 4 auf Desktop stabil", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/startseiten/4/");

  await expect(page).toHaveScreenshot("home-variant-4-desktop.png", {
    animations: "disabled",
    fullPage: true,
    mask: [page.locator(".map-card iframe")],
  });
});

test("rendert Startseite 2 mit freigegebener Hero-Copy und Telefon-CTAs", async ({
  page,
}) => {
  await page.goto("/startseiten/2/");

  await expect(
    page.getByRole("heading", {
      name: "Mit Herz, Zeit und moderner Medizin für Ihr Tier da.",
    }),
  ).toBeVisible();
  await expect(page.locator(".home-2__hero-copy > p:not(.eyebrow)").first()).toHaveText(
    "Einfühlsame Betreuung, klare Worte und ein ruhiger Blick auf das, was Ihr Tier jetzt braucht.",
  );
  await expect(
    page.getByRole("link", {
      name: "Termin telefonisch anfragen",
    }),
  ).toHaveAttribute("href", "tel:+4991163292983");
  await expect(
    page.getByRole("link", {
      name: "0911 63 29 29 83 anrufen",
      exact: true,
    }),
  ).toHaveAttribute("href", "tel:+4991163292983");
});

test("kennzeichnet Startseite-2-Herobild sichtbar als Symbolbild", async ({ page }) => {
  await page.goto("/startseiten/2/");

  const image = page.locator('[data-home-variant="2"] .home-2__hero-image');
  await expect(image).toHaveAttribute(
    "src",
    "/images/home/variant-2/hero-vet-pets.webp",
  );
  await expect(image).toHaveAttribute("width", "1800");
  await expect(image).toHaveAttribute("height", "1200");
  await expect(image).not.toHaveAttribute("loading", "lazy");
  await expect(page.getByText("Symbolbild", { exact: true })).toBeVisible();
});

test("gliedert Startseite 2 in freigegebene Pflichtbereiche", async ({ page }) => {
  await page.goto("/startseiten/2/");

  for (const heading of [
    "Im Notfall",
    "Öffnungszeiten",
    "Leistungen",
    "Unsere Praxis",
    "Zugänglichkeit",
    "Häufige Fragen",
    "Stellenangebote",
    "Direkt auf OpenStreetMap",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  await expect(
    page.getByRole("link", { name: "Praxisangaben ansehen" }),
  ).toHaveAttribute("href", "/praxis/");
  await expect(page.getByRole("link", { name: "FAQ öffnen" })).toHaveAttribute(
    "href",
    "/faq/",
  );
  await expect(
    page.getByRole("link", { name: "Stellenangebote ansehen" }),
  ).toHaveAttribute("href", "/stellenangebote/");
});

test("rendert Startseite 2 ohne schwere axe-Verstöße", async ({ page }) => {
  await page.goto("/startseiten/2/");

  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(seriousOrCritical).toEqual([]);
});

test("Startseite 2 reflowt bei 320 CSS-Pixeln ohne horizontale Seitenausdehnung", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1100 });
  await page.goto("/startseiten/2/");

  const hasNoHorizontalOverflow = await page
    .locator("html")
    .evaluate((element) => element.scrollWidth <= element.clientWidth);

  expect(hasNoHorizontalOverflow).toBe(true);
});

test("zeigt Startseite 2 auf Desktop stabil", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/startseiten/2/");

  await expect(page).toHaveScreenshot("home-variant-2-desktop.png", {
    animations: "disabled",
    fullPage: true,
    mask: [page.locator(".map-card iframe")],
  });
});

test("rendert Startseite 3 mit freigegebener Hero- und Philosophie-Copy", async ({
  page,
}) => {
  await page.goto("/startseiten/3/");

  await expect(
    page.getByRole("heading", {
      name: "Vertrauen beginnt mit einem ruhigen Gespräch.",
    }),
  ).toBeVisible();
  await expect(page.locator(".home-3__hero-copy > p:not(.eyebrow)").first()).toHaveText(
    "Wir hören zu, erklären verständlich und nehmen uns Zeit – für Sie und Ihr Tier.",
  );
  await expect(
    page.getByText(
      "Jedes Tier ist einzigartig. Deshalb verbinden wir moderne Tiermedizin mit Empathie, Transparenz und einer Atmosphäre, in der Fragen willkommen sind.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Telefonisch Termin anfragen" }),
  ).toHaveAttribute("href", "tel:+4991163292983");
  await expect(
    page.getByRole("link", { name: "Sprechzeiten ansehen" }),
  ).toHaveAttribute("href", "/sprechzeiten/");
});

test("kennzeichnet Startseite-3-Herobild sichtbar als Symbolbild", async ({ page }) => {
  await page.goto("/startseiten/3/");

  const image = page.locator('[data-home-variant="3"] .home-3__hero-image');
  await expect(image).toHaveAttribute(
    "src",
    "/images/home/variant-3/hero-ruhiges-gespraech.webp",
  );
  await expect(image).toHaveAttribute("width", "1800");
  await expect(image).toHaveAttribute("height", "1125");
  await expect(image).not.toHaveAttribute("loading", "lazy");
  await expect(image).not.toHaveAttribute("fetchpriority", "high");
  await expect(page.getByText("Symbolbild", { exact: true })).toBeVisible();
});

test("gliedert Startseite 3 in freigegebene Pflichtbereiche", async ({ page }) => {
  await page.goto("/startseiten/3/");

  for (const heading of [
    "Leistungen",
    "Vorsorge und Beratung",
    "Diagnostik und Behandlung",
    "Operationen und Nachsorge",
    "Sprechzeiten",
    "Unsere Philosophie",
    "Zugänglichkeit",
    "Häufige Fragen",
    "Stellenangebote",
    "Direkt auf OpenStreetMap",
  ]) {
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }

  await expect(page.getByRole("link", { name: "Erklärung lesen" })).toHaveAttribute(
    "href",
    "/barrierefreiheit/",
  );
  await expect(page.getByRole("link", { name: "FAQ öffnen" })).toHaveAttribute(
    "href",
    "/faq/",
  );
  await expect(
    page.getByRole("link", { name: "Stellenangebote ansehen" }),
  ).toHaveAttribute("href", "/stellenangebote/");
});

test("isoliert Startseite-3-Markup und -CSS von Varianten 1, 2 und 4", async ({
  page,
}) => {
  await page.goto("/startseiten/3/");
  await expect(page.locator(".home-3__hero")).toBeVisible();
  await expect(page.locator('[data-home-variant="3"]')).toHaveCSS(
    "--home-3-surface",
    "#f7f1e5",
  );

  for (const variant of ["1", "2", "4"] as const) {
    await page.goto(`/startseiten/${variant}/`);
    await expect(page.locator(".home-3__hero")).toHaveCount(0);
    await expect(page.locator(`[data-home-variant="${variant}"]`)).not.toHaveCSS(
      "--home-3-surface",
      "#f7f1e5",
    );
  }
});

test("rendert Startseite 3 ohne schwere axe-Verstöße", async ({ page }) => {
  await page.goto("/startseiten/3/");

  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );

  expect(seriousOrCritical).toEqual([]);
});

test("Startseite 3 reflowt bei 320 CSS-Pixeln ohne horizontale Seitenausdehnung", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1100 });
  await page.goto("/startseiten/3/");

  const hasNoHorizontalOverflow = await page
    .locator("html")
    .evaluate((element) => element.scrollWidth <= element.clientWidth);

  expect(hasNoHorizontalOverflow).toBe(true);
});

test("zeigt Startseite 3 auf Desktop stabil", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/startseiten/3/");

  await expect(page).toHaveScreenshot("home-variant-3-desktop.png", {
    animations: "disabled",
    fullPage: true,
    mask: [page.locator(".map-card iframe")],
  });
});

test("Startseite 1 reflowt bei 320 CSS-Pixeln ohne horizontale Seitenausdehnung", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1100 });
  await page.goto("/startseiten/1/");

  const hasNoHorizontalOverflow = await page
    .locator("html")
    .evaluate((element) => element.scrollWidth <= element.clientWidth);

  expect(hasNoHorizontalOverflow).toBe(true);
});

test("zeigt Startseite 1 auf Desktop stabil", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/startseiten/1/");

  await expect(page).toHaveScreenshot("home-variant-1-desktop.png", {
    animations: "disabled",
    fullPage: true,
  });
});

test("zeigt Startseite 1 mobil stabil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/startseiten/1/");

  await expect(page).toHaveScreenshot("home-variant-1-mobile.png", {
    animations: "disabled",
    fullPage: true,
  });
});
