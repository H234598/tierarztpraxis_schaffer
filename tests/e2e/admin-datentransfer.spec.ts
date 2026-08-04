import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const clearToken = "dt1_ABCDEFGHIJKLMNOP_abcdefghijklmnopqrstuvwxyzABCDE1234567890-_";

function caseSummary(status = "open") {
  return {
    id: "case-1", publicId: "ABCDEFGHIJKLMNOP", petName: "Luna",
    ownerDisplayName: "Familie M.", internalReference: "P-12", status,
    submissionCount: 1, totalBytes: 1234, createdAt: "2026-08-04T10:00:00.000Z",
    expiresAt: "2026-08-18T10:00:00.000Z", exportedAt: null,
  };
}

function caseDetail(status = "open") {
  return {
    ok: true,
    case: { ...caseSummary(status), internalNote: "Nur intern", allowReplies: true, allowCallback: true },
    tokens: [{ id: "token-1", hint: "7890", revokedAt: null, createdAt: "now", expiresAt: "later" }],
    submissions: [{ id: "submission-1", title: "Ohr", status: "submitted" }],
    files: [], links: [], replies: [],
    audit: [{ id: "audit-1", eventType: "case_created", createdAt: "now" }],
  };
}

async function routeAdmin(page: Page): Promise<{ methods: string[]; urls: string[]; bodies: unknown[] }> {
  const state = { methods: [] as string[], urls: [] as string[], bodies: [] as unknown[] };
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.methods.push(`${request.method()} ${url.pathname}`);
    state.urls.push(`${url.pathname}${url.search}`);
    if (request.method() !== "GET") state.bodies.push(request.postDataJSON());
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers()["cf-access-jwt-assertion"]).toBeUndefined();
    if (url.pathname === "/api/admin/session") return route.fulfill({ json: { ok: true, admin: { email: "admin@example.test" } } });
    if (url.pathname === "/api/admin/cases" && request.method() === "GET") return route.fulfill({ json: { ok: true, cases: [caseSummary()], page: Number(url.searchParams.get("page")), pageSize: 20, total: 21 } });
    if (url.pathname === "/api/admin/cases" && request.method() === "POST") return route.fulfill({ status: 201, json: { ok: true, case: caseSummary(), token: clearToken, shareUrl: `/datentransfer/#token=${clearToken}` } });
    if (url.pathname === "/api/admin/cases/case-1" && request.method() === "GET") return route.fulfill({ json: caseDetail() });
    if (url.pathname === "/api/admin/cases/case-1/status") return route.fulfill({ json: { ok: true, status: "closed" } });
    if (url.pathname === "/api/admin/tokens/token-1/revoke") return route.fulfill({ json: { ok: true } });
    if (url.pathname === "/api/admin/cases/case-1/tokens") return route.fulfill({ status: 201, json: { ok: true, token: clearToken, shareUrl: `/datentransfer/#token=${clearToken}`, expiresAt: "later" } });
    if (url.pathname === "/api/admin/cases/case-1/mark-exported") return route.fulfill({ json: { ok: true, exportedAt: "now" } });
    return route.fulfill({ status: 404, json: { ok: false } });
  });
  return state;
}

test("401 bleibt fail-closed und lädt keine Falldaten", async ({ page }) => {
  const calls: string[] = [];
  await page.route("**/api/admin/**", async (route) => {
    calls.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 401, json: { ok: false, error: { requestId: "request-401" } } });
  });
  await page.goto("/admin/datentransfer/");

  await expect(page.getByRole("heading", { name: "Datentransfer verwalten" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Admin-Zugang erforderlich" })).toBeVisible();
  await expect(page.getByText(/Vorgangskennung: request-401/u)).toBeVisible();
  expect(calls).toEqual(["/api/admin/session"]);
  expect(await page.locator("body").textContent()).not.toContain("dt1_");
});

test("Fallanlage zeigt Token einmalig, kopiert Link und verliert ihn beim Reload", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await routeAdmin(page);
  await page.goto("/admin/datentransfer/");
  await expect(page.getByText("Angemeldet als admin@example.test")).toBeVisible();

  await page.getByLabel("Tiername").fill("Luna");
  await page.getByRole("button", { name: "Fall und Token anlegen" }).click();
  const dialog = page.getByRole("dialog", { name: "Token einmalig sichern" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Freigabelink")).toHaveValue(`/datentransfer/#token=${clearToken}`);
  await page.getByRole("button", { name: "Link kopieren" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`/datentransfer/#token=${clearToken}`);
  expect(state.bodies[0]).toEqual({
    petName: "Luna", ownerDisplayName: "", internalReference: "", internalNote: "",
    expiresInDays: 14, maxSubmissions: 3, maxTotalBytes: 100 * 1024 * 1024,
    allowReplies: true, allowCallback: true,
  });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.reload();
  await expect(dialog).toBeHidden();
  expect(await page.locator("body").textContent()).not.toContain(clearToken);
});

test("Liste, Detail und Verwaltungsaktionen bleiben explizit", async ({ page }) => {
  const state = await routeAdmin(page);
  await page.goto("/admin/datentransfer/");
  await page.getByRole("button", { name: "Details öffnen" }).click();
  await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeFocused();
  await expect(page.getByText("Nur intern")).toBeVisible();
  await page.getByRole("button", { name: "Token widerrufen" }).click();
  await page.getByRole("button", { name: "Fall schließen" }).click();
  await page.getByRole("button", { name: "Als exportiert markieren" }).click();
  await page.getByRole("button", { name: "Neuen Token erstellen" }).click();
  await expect(page.getByRole("dialog", { name: "Token einmalig sichern" })).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Token rotieren" }).click();
  await expect(page.getByRole("dialog", { name: "Token einmalig sichern" })).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByLabel("Status").selectOption("open");
  await page.getByLabel("Suche").fill("Luna");
  await page.getByRole("button", { name: "Filtern" }).click();
  await page.getByRole("button", { name: "Weiter" }).click();

  expect(state.methods).toContain("POST /api/admin/tokens/token-1/revoke");
  expect(state.methods).toContain("PATCH /api/admin/cases/case-1/status");
  expect(state.methods).toContain("POST /api/admin/cases/case-1/mark-exported");
  expect(state.methods.filter((entry) => entry === "POST /api/admin/cases/case-1/tokens")).toHaveLength(2);
  expect(state.urls).toContain("/api/admin/cases?page=2&status=open&q=Luna");
  expect(state.bodies).toContainEqual({});
  expect(state.bodies).toContainEqual({ status: "closed" });
  expect(state.bodies).toContainEqual({ revokeExisting: false });
  expect(state.bodies).toContainEqual({ revokeExisting: true });
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("Adminoberfläche ist bei 320px zugänglich; Druck blendet interne Notiz aus", async ({ page }) => {
  await routeAdmin(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/admin/datentransfer/");
  await page.getByRole("button", { name: "Details öffnen" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const severe = (await new AxeBuilder({ page }).analyze()).violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ id }) => id);
  expect(severe).toEqual([]);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-admin-internal-note-section]")).toHaveCSS("display", "none");
});
