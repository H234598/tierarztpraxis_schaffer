import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { e2eOrigin } from "./origin";

const csrfToken = "csrf-session-only";
const fragmentToken = "dt1_ABCD1234EFGH.geheim";

function transferCase(finalized = false) {
  return {
    ok: true,
    case: {
      publicId: "ABCD1234EFGH",
      petName: "Luna",
      publicReference: "Kontrolle Haut",
      expiresAt: "2026-08-18T20:00:00.000Z",
      remainingSubmissions: finalized ? 1 : 2,
      remainingBytes: finalized ? 700 : 1_000,
      allowReplies: true,
      allowCallback: true,
    },
    submissions: finalized
      ? [
          {
            id: "submission-new",
            title: "Linkes Ohr",
            message: "Luna kratzt sich seit gestern deutlich häufiger.",
            observedSince: "Seit gestern",
            urgency: "callback_requested",
            callbackRequested: true,
            status: "submitted",
            createdAt: "2026-08-04T10:00:00.000Z",
            finalizedAt: "2026-08-04T10:01:00.000Z",
          },
        ]
      : [],
    links: finalized
      ? [
          {
            id: "link-1",
            submissionId: "submission-new",
            url: "https://example.org/video",
            label: "Video",
            createdAt: "2026-08-04T10:00:00.000Z",
          },
        ]
      : [],
    files: finalized
      ? [
          {
            id: "file-1",
            submissionId: "submission-new",
            originalName: "ohr.jpg",
            declaredMediaType: "image/jpeg",
            verifiedMediaType: "image/jpeg",
            expectedSize: 3,
            storedSize: 3,
            state: "stored",
            createdAt: "2026-08-04T10:00:00.000Z",
            uploadedAt: "2026-08-04T10:01:00.000Z",
          },
        ]
      : [],
    replies: finalized
      ? [
          {
            id: "reply-1",
            submissionId: "submission-new",
            body: "Bitte vereinbaren Sie telefonisch einen Termin.",
            createdAt: "2026-08-04T10:02:00.000Z",
          },
        ]
      : [],
  };
}

async function routeTurnstile(page: Page): Promise<void> {
  await page.route("https://challenges.cloudflare.com/**", async (route) => {
    if (route.request().url().includes("/turnstile/v0/api.js")) {
      await route.fulfill({
        contentType: "application/javascript",
        body: `window.transferTurnstileResetCount = 0;
        window.turnstile = { reset() { window.transferTurnstileResetCount += 1; } };
        for (const widget of document.querySelectorAll('.cf-turnstile')) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'cf-turnstile-response';
          input.value = 'turnstile-test-token';
          widget.append(input);
        }`,
      });
      return;
    }
    await route.abort();
  });
}

async function routeSessionApi(page: Page): Promise<{ logoutCalls: number }> {
  const state = { logoutCalls: 0 };
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({
        token: fragmentToken,
        turnstileToken: "turnstile-test-token",
      });
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case" && request.method() === "GET") {
      await route.fulfill({ json: transferCase() });
      return;
    }
    if (path === "/api/transfers/session/logout" && request.method() === "POST") {
      state.logoutCalls += 1;
      expect(request.headers()["x-datentransfer-csrf"]).toBe(csrfToken);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });
  return state;
}

async function enterFragmentSession(page: Page): Promise<void> {
  await page.goto(`/datentransfer/#token=${encodeURIComponent(fragmentToken)}`);
  await expect(page).toHaveURL(/\/datentransfer\/$/u);
  await expect(page.locator("input[name='cf-turnstile-response']")).toHaveValue(
    "turnstile-test-token",
  );
  await page.getByRole("button", { name: "Sichere Sitzung starten" }).click();
  await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeFocused();
}

test("Warnung steht vor Token, Fragment verschwindet und Logout löscht Sitzung", async ({
  page,
}) => {
  await routeTurnstile(page);
  const state = await routeSessionApi(page);
  await enterFragmentSession(page);

  const warningBeforeToken = await page.evaluate(() => {
    const warning = document.querySelector("[data-transfer-warning]");
    const token = document.querySelector("[data-transfer-token]");
    return Boolean(
      warning &&
      token &&
      warning.compareDocumentPosition(token) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(warningBeforeToken).toBe(true);
  await expect(page.getByText("kein Notfallkanal", { exact: false })).toBeVisible();
  const warning = page.locator("[data-transfer-warning]");
  await expect(warning.getByText("12 MiB", { exact: false })).toBeVisible();
  await expect(warning.getByText("50 MiB", { exact: false })).toBeVisible();
  await expect(page.locator("[data-transfer-token]")).toHaveValue("");
  expect(
    await page.evaluate(() => ({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
      url: location.href,
    })),
  ).toEqual({
    local: {},
    session: { "tierarztpraxis:datentransfer:csrf": csrfToken },
    url: `${e2eOrigin}/datentransfer/`,
  });

  await page.getByRole("button", { name: "Sicher abmelden" }).click();
  await expect(page.getByRole("status")).toContainText("abgemeldet");
  await expect(page.getByLabel("Datentransfer-Token")).toBeFocused();
  expect(state.logoutCalls).toBe(1);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test("Draft, sequenzielle Uploads, Einzelretry, Finalisierung und Thread", async ({
  page,
}) => {
  await routeTurnstile(page);
  let finalized = false;
  const uploadCalls = new Map<string, number>();
  await page.route("**/api/transfers/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session") {
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case") {
      await route.fulfill({ json: transferCase(finalized) });
      return;
    }
    if (path === "/api/transfers/submissions") {
      expect(request.headers()["x-datentransfer-csrf"]).toBe(csrfToken);
      expect(request.postDataJSON()).toMatchObject({
        title: "Linkes Ohr",
        urgency: "callback_requested",
        callbackRequested: true,
        notEmergencyConfirmed: true,
        files: [
          { name: "ohr.jpg", mediaType: "image/jpeg", size: 3 },
          { name: "profil.png", mediaType: "image/png", size: 3 },
        ],
      });
      await route.fulfill({
        json: {
          ok: true,
          submissionId: "submission-new",
          uploads: [
            {
              fileId: "file-1",
              uploadUrl: "/api/transfers/uploads/file-1",
            },
            {
              fileId: "file-2",
              uploadUrl: "/api/transfers/uploads/file-2",
            },
          ],
        },
      });
      return;
    }
    if (path.startsWith("/api/transfers/uploads/")) {
      const count = (uploadCalls.get(path) ?? 0) + 1;
      uploadCalls.set(path, count);
      expect(request.method()).toBe("PUT");
      expect(request.headers()["x-datentransfer-csrf"]).toBe(csrfToken);
      expect(request.postDataBuffer()).toBeTruthy();
      if (path.endsWith("file-1") && count === 1) {
        await route.fulfill({ status: 503, json: { ok: false } });
      } else {
        await route.fulfill({ json: { ok: true } });
      }
      return;
    }
    if (path === "/api/transfers/submissions/submission-new/finalize") {
      expect(request.headers()["x-datentransfer-csrf"]).toBe(csrfToken);
      finalized = true;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await enterFragmentSession(page);
  await page.getByLabel("Überschrift").fill("Linkes Ohr");
  await page
    .getByLabel("Beobachtung und Bericht")
    .fill("Luna kratzt sich seit gestern deutlich häufiger.");
  await page.getByLabel("Seit wann").fill("Seit gestern");
  await page.getByLabel("Zeitnaher Rückruf erwünscht").check();
  await page.getByLabel("Telefonnummer für Rückruf").fill("0911 123456");
  await page.getByLabel("Links").fill("https://example.org/video");
  await page.getByLabel("Datenschutzhinweise gelesen").check();
  await page.getByLabel("Ich bestätige: Kein Notfall").check();
  await page.locator("input[name='files']").setInputFiles([
    { name: "ohr.jpg", mimeType: "image/jpeg", buffer: Buffer.from([1, 2, 3]) },
    { name: "profil.png", mimeType: "image/png", buffer: Buffer.from([4, 5, 6]) },
  ]);
  await page.getByRole("button", { name: "Bericht sicher senden" }).click();

  const failedRow = page.getByRole("listitem").filter({ hasText: "ohr.jpg" });
  await expect(
    failedRow.getByRole("button", { name: "Erneut versuchen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "profil.png" }),
  ).toContainText("Übertragen");
  expect(finalized).toBe(false);

  await failedRow.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByRole("heading", { name: "Bisheriger Verlauf" })).toBeFocused();
  await expect(
    page.getByText("Bitte vereinbaren Sie telefonisch einen Termin."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Video" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await expect(page.getByRole("link", { name: "ohr.jpg" })).toHaveAttribute(
    "href",
    "/api/transfers/files/file-1",
  );
  expect(uploadCalls.get("/api/transfers/uploads/file-1")).toBe(2);
  expect(uploadCalls.get("/api/transfers/uploads/file-2")).toBe(1);
  await expect(page.getByLabel("Überschrift")).toHaveValue("");
});

test("axe, Tastatur, Live-Status und 320-px-Reflow", async ({ page }) => {
  await routeTurnstile(page);
  await routeSessionApi(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/datentransfer/");

  const severe = (await new AxeBuilder({ page }).analyze()).violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map(({ target, failureSummary }) => ({
        target,
        failureSummary,
      })),
    }));
  expect(severe).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(page.locator("[data-case-heading]")).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#transfer-report-heading")).toHaveAttribute(
    "tabindex",
    "-1",
  );

  const token = page.getByLabel("Datentransfer-Token");
  await token.focus();
  await page.keyboard.type(fragmentToken);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Sichere Sitzung starten" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Sichere Sitzung aktiv");
});

test("stellt ausschließlich eine vorhandene CSRF-Sitzung per GET wieder her", async ({
  page,
}) => {
  await routeTurnstile(page);
  let caseRequests = 0;
  await page.addInitScript((csrf) => {
    sessionStorage.setItem("tierarztpraxis:datentransfer:csrf", csrf);
  }, csrfToken);
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    if (
      new URL(request.url()).pathname === "/api/transfers/case" &&
      request.method() === "GET"
    ) {
      caseRequests += 1;
      await route.fulfill({ json: transferCase() });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await page.goto("/datentransfer/");

  await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeFocused();
  await expect(page.getByRole("status")).toContainText("wiederhergestellt");
  expect(caseRequests).toBe(1);
  expect(
    await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage))),
  ).toEqual({ "tierarztpraxis:datentransfer:csrf": csrfToken });
});

test("behält CSRF nach Session-Erfolg und wiederholt nur den fehlgeschlagenen GET", async ({
  page,
}) => {
  await routeTurnstile(page);
  let sessionCalls = 0;
  let caseCalls = 0;
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session" && request.method() === "POST") {
      sessionCalls += 1;
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case" && request.method() === "GET") {
      caseCalls += 1;
      if (caseCalls === 1) {
        await route.fulfill({
          status: 503,
          json: {
            ok: false,
            error: { code: "internal", requestId: "req-case" },
          },
        });
      } else {
        await route.fulfill({ json: transferCase() });
      }
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await page.goto(`/datentransfer/#token=${encodeURIComponent(fragmentToken)}`);
  await expect(page.locator("input[name='cf-turnstile-response']")).toHaveValue(
    "turnstile-test-token",
  );
  await page.getByRole("button", { name: "Sichere Sitzung starten" }).click();

  await expect(
    page.getByRole("button", { name: "Fallansicht erneut laden" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tierarztpraxis:datentransfer:csrf"),
    ),
  ).toBe(csrfToken);

  await page.getByRole("button", { name: "Fallansicht erneut laden" }).click();
  await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeFocused();
  expect(sessionCalls).toBe(1);
  expect(caseCalls).toBe(2);
});

test("behält CSRF beim fehlgeschlagenen initialen Restore und wiederholt nur GET", async ({
  page,
}) => {
  await routeTurnstile(page);
  let caseCalls = 0;
  await page.addInitScript((csrf) => {
    sessionStorage.setItem("tierarztpraxis:datentransfer:csrf", csrf);
  }, csrfToken);
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/case" && request.method() === "GET") {
      caseCalls += 1;
      if (caseCalls === 1) {
        await route.fulfill({
          status: 503,
          json: {
            ok: false,
            error: { code: "internal", requestId: "req-restore" },
          },
        });
      } else {
        await route.fulfill({ json: transferCase() });
      }
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await page.goto("/datentransfer/");

  await expect(
    page.getByRole("button", { name: "Fallansicht erneut laden" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tierarztpraxis:datentransfer:csrf"),
    ),
  ).toBe(csrfToken);

  await page.getByRole("button", { name: "Fallansicht erneut laden" }).click();
  await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeFocused();
  expect(caseCalls).toBe(2);
});

for (const failure of ["Netzwerkfehler", "Protokollfehler"] as const) {
  test(`behält CSRF beim initialen Restore nach ${failure}`, async ({ page }) => {
    await routeTurnstile(page);
    let caseCalls = 0;
    await page.addInitScript((csrf) => {
      sessionStorage.setItem("tierarztpraxis:datentransfer:csrf", csrf);
    }, csrfToken);
    await page.route("**/api/transfers/case", async (route) => {
      caseCalls += 1;
      if (caseCalls > 1) {
        await route.fulfill({ json: transferCase() });
      } else if (failure === "Netzwerkfehler") {
        await route.abort("connectionfailed");
      } else {
        await route.fulfill({ json: { ok: true } });
      }
    });

    await page.goto("/datentransfer/");

    await expect(
      page.getByRole("button", { name: "Fallansicht erneut laden" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("tierarztpraxis:datentransfer:csrf"),
      ),
    ).toBe(csrfToken);

    await page.getByRole("button", { name: "Fallansicht erneut laden" }).click();
    await expect(page.getByRole("heading", { name: "Fall für Luna" })).toBeFocused();
    expect(caseCalls).toBe(2);
  });
}

test("wiederholt nach bestätigtem Finalize nur den fehlgeschlagenen GET", async ({
  page,
}) => {
  await routeTurnstile(page);
  let caseCalls = 0;
  let finalizeCalls = 0;
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session") {
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case") {
      caseCalls += 1;
      if (caseCalls === 2) {
        await route.fulfill({
          status: 503,
          json: {
            ok: false,
            error: { code: "internal", requestId: "req-final-case" },
          },
        });
      } else {
        await route.fulfill({ json: transferCase(caseCalls > 1) });
      }
      return;
    }
    if (path === "/api/transfers/submissions") {
      await route.fulfill({
        json: { ok: true, submissionId: "submission-new", uploads: [] },
      });
      return;
    }
    if (path === "/api/transfers/submissions/submission-new/finalize") {
      finalizeCalls += 1;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await enterFragmentSession(page);
  await page.getByLabel("Überschrift").fill("Linkes Ohr");
  await page
    .getByLabel("Beobachtung und Bericht")
    .fill("Luna kratzt sich seit gestern deutlich häufiger.");
  await page.getByLabel("Datenschutzhinweise gelesen").check();
  await page.getByLabel("Ich bestätige: Kein Notfall").check();
  await page.getByRole("button", { name: "Bericht sicher senden" }).click();

  await expect(
    page.getByRole("button", { name: "Fallansicht erneut laden" }),
  ).toBeVisible();
  expect(finalizeCalls).toBe(1);

  await page.getByRole("button", { name: "Fallansicht erneut laden" }).click();
  await expect(page.getByRole("heading", { name: "Bisheriger Verlauf" })).toBeFocused();
  expect(finalizeCalls).toBe(1);
  expect(caseCalls).toBe(3);
});

test("wiederholt fehlgeschlagenen Finalize-POST ohne erneuten Datei-Upload", async ({
  page,
}) => {
  await routeTurnstile(page);
  let uploadCalls = 0;
  let finalizeCalls = 0;
  let finalized = false;
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session") {
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case") {
      await route.fulfill({ json: transferCase(finalized) });
      return;
    }
    if (path === "/api/transfers/submissions") {
      await route.fulfill({
        json: {
          ok: true,
          submissionId: "submission-finalize-retry",
          uploads: [
            {
              fileId: "file-finalize-retry",
              uploadUrl: "/api/transfers/uploads/file-finalize-retry",
            },
          ],
        },
      });
      return;
    }
    if (path === "/api/transfers/uploads/file-finalize-retry") {
      uploadCalls += 1;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (path === "/api/transfers/submissions/submission-finalize-retry/finalize") {
      finalizeCalls += 1;
      if (finalizeCalls === 1) {
        await route.fulfill({
          status: 503,
          json: {
            ok: false,
            error: { code: "internal", requestId: "req-finalize" },
          },
        });
      } else {
        finalized = true;
        await route.fulfill({ json: { ok: true } });
      }
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await enterFragmentSession(page);
  await page.getByLabel("Überschrift").fill("Linkes Ohr");
  await page
    .getByLabel("Beobachtung und Bericht")
    .fill("Luna kratzt sich seit gestern deutlich häufiger.");
  await page.getByLabel("Datenschutzhinweise gelesen").check();
  await page.getByLabel("Ich bestätige: Kein Notfall").check();
  await page.locator("input[name='files']").setInputFiles({
    name: "ohr.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole("button", { name: "Bericht sicher senden" }).click();

  await expect(
    page.getByRole("button", { name: "Abschluss erneut versuchen" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sicher abmelden" })).toBeEnabled();
  await expect(page.locator("[data-transfer-final-status]")).toContainText(
    "Vorgangskennung: req-finalize",
  );
  expect(uploadCalls).toBe(1);
  expect(finalizeCalls).toBe(1);

  await page.getByRole("button", { name: "Abschluss erneut versuchen" }).click();

  await expect(page.getByRole("heading", { name: "Bisheriger Verlauf" })).toBeFocused();
  expect(uploadCalls).toBe(1);
  expect(finalizeCalls).toBe(2);
});

test("zeigt fallweite Antworten ohne submissionId als eigenen Thread-Eintrag", async ({
  page,
}) => {
  await routeTurnstile(page);
  await page.addInitScript((csrf) => {
    sessionStorage.setItem("tierarztpraxis:datentransfer:csrf", csrf);
  }, csrfToken);
  await page.route("**/api/transfers/case", async (route) => {
    await route.fulfill({
      json: {
        ...transferCase(),
        replies: [
          {
            id: "reply-case",
            submissionId: null,
            body: "Bitte senden Sie noch ein Foto von der rechten Seite.",
            createdAt: "2026-08-04T10:02:00.000Z",
          },
        ],
      },
    });
  });

  await page.goto("/datentransfer/");

  await expect(
    page.getByRole("heading", { name: "Antwort der Praxis zum Fall" }),
  ).toBeVisible();
  await expect(
    page.getByText("Bitte senden Sie noch ein Foto von der rechten Seite."),
  ).toBeVisible();
});

test("zeigt fallweite und einreichungsbezogene Antworten im gemischten Thread", async ({
  page,
}) => {
  await routeTurnstile(page);
  await page.addInitScript((csrf) => {
    sessionStorage.setItem("tierarztpraxis:datentransfer:csrf", csrf);
  }, csrfToken);
  await page.route("**/api/transfers/case", async (route) => {
    const snapshot = transferCase(true);
    await route.fulfill({
      json: {
        ...snapshot,
        replies: [
          ...snapshot.replies,
          {
            id: "reply-case",
            submissionId: null,
            body: "Fallweite Rückfrage der Praxis.",
            createdAt: "2026-08-04T10:03:00.000Z",
          },
        ],
      },
    });
  });

  await page.goto("/datentransfer/");

  await expect(
    page.getByText("Bitte vereinbaren Sie telefonisch einen Termin."),
  ).toHaveCount(1);
  await expect(page.getByText("Fallweite Rückfrage der Praxis.")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Antwort der Praxis zum Fall" }),
  ).toHaveCount(1);
});

test("terminales Upload-4xx lässt Sitzung und neuen Bericht erreichbar", async ({
  page,
}) => {
  await routeTurnstile(page);
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session") {
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case") {
      await route.fulfill({ json: transferCase() });
      return;
    }
    if (path === "/api/transfers/submissions") {
      await route.fulfill({
        json: {
          ok: true,
          submissionId: "submission-rejected",
          uploads: [
            {
              fileId: "file-rejected",
              uploadUrl: "/api/transfers/uploads/file-rejected",
            },
          ],
        },
      });
      return;
    }
    if (path === "/api/transfers/uploads/file-rejected") {
      await route.fulfill({
        status: 422,
        json: {
          ok: false,
          error: {
            requestId: "req-upload-422",
            message: "dt1_geheim patientenakte.jpg",
          },
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await enterFragmentSession(page);
  await page.getByLabel("Überschrift").fill("Linkes Ohr");
  await page
    .getByLabel("Beobachtung und Bericht")
    .fill("Luna kratzt sich seit gestern deutlich häufiger.");
  await page.getByLabel("Datenschutzhinweise gelesen").check();
  await page.getByLabel("Ich bestätige: Kein Notfall").check();
  await page.locator("input[name='files']").setInputFiles({
    name: "ohr.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole("button", { name: "Bericht sicher senden" }).click();

  const failedRow = page.getByRole("listitem").filter({ hasText: "ohr.jpg" });
  await expect(failedRow).toContainText("Vorgangskennung: req-upload-422");
  await expect(failedRow).not.toContainText("dt1_geheim");
  await expect(page.getByRole("button", { name: "Sicher abmelden" })).toBeEnabled();
  await expect(page.getByLabel("Überschrift")).toBeEnabled();
  await expect(page.locator("[data-transfer-final-status]")).toContainText(
    "korrigierten Dateien",
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tierarztpraxis:datentransfer:csrf"),
    ),
  ).toBe(csrfToken);
});

test("sperrt Retry draft-weit und lädt abgeschlossene Slots nicht erneut", async ({
  page,
}) => {
  await routeTurnstile(page);
  let releaseRetry: (() => void) | undefined;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const uploadCalls = new Map<string, number>();
  let activeUploads = 0;
  let maxActiveUploads = 0;
  let finalizeCalls = 0;
  let finalized = false;
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session") {
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case") {
      await route.fulfill({ json: transferCase(finalized) });
      return;
    }
    if (path === "/api/transfers/submissions") {
      await route.fulfill({
        json: {
          ok: true,
          submissionId: "submission-retry-lock",
          uploads: [
            { fileId: "file-1", uploadUrl: "/api/transfers/uploads/file-1" },
            { fileId: "file-2", uploadUrl: "/api/transfers/uploads/file-2" },
          ],
        },
      });
      return;
    }
    if (path.startsWith("/api/transfers/uploads/")) {
      const count = (uploadCalls.get(path) ?? 0) + 1;
      uploadCalls.set(path, count);
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      if (count === 1) {
        await route.fulfill({ status: 503, json: { ok: false } });
      } else {
        if (path.endsWith("file-1")) await retryGate;
        await route.fulfill({ json: { ok: true } });
      }
      activeUploads -= 1;
      return;
    }
    if (path === "/api/transfers/submissions/submission-retry-lock/finalize") {
      finalizeCalls += 1;
      finalized = true;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await enterFragmentSession(page);
  await page.getByLabel("Überschrift").fill("Linkes Ohr");
  await page
    .getByLabel("Beobachtung und Bericht")
    .fill("Luna kratzt sich seit gestern deutlich häufiger.");
  await page.getByLabel("Datenschutzhinweise gelesen").check();
  await page.getByLabel("Ich bestätige: Kein Notfall").check();
  await page.locator("input[name='files']").setInputFiles([
    { name: "eins.jpg", mimeType: "image/jpeg", buffer: Buffer.from([1]) },
    { name: "zwei.jpg", mimeType: "image/jpeg", buffer: Buffer.from([2]) },
  ]);
  await page.getByRole("button", { name: "Bericht sicher senden" }).click();

  const firstRow = page.getByRole("listitem").filter({ hasText: "eins.jpg" });
  const secondRow = page.getByRole("listitem").filter({ hasText: "zwei.jpg" });
  const firstRetry = firstRow.getByRole("button", { name: "Erneut versuchen" });
  const secondRetry = secondRow.getByRole("button", { name: "Erneut versuchen" });
  await firstRetry.click();
  await expect(secondRetry).toBeDisabled();
  await secondRetry.evaluate((button: HTMLButtonElement) => button.click());
  expect(uploadCalls.get("/api/transfers/uploads/file-2")).toBe(1);

  releaseRetry?.();
  await expect(firstRow).toContainText("Übertragen");
  await expect(secondRetry).toBeEnabled();
  await secondRetry.click();

  await expect(page.getByRole("heading", { name: "Bisheriger Verlauf" })).toBeFocused();
  expect(uploadCalls.get("/api/transfers/uploads/file-1")).toBe(2);
  expect(uploadCalls.get("/api/transfers/uploads/file-2")).toBe(2);
  expect(maxActiveUploads).toBe(1);
  expect(finalizeCalls).toBe(1);
});

test("sperrt doppelten Sessiontausch und setzt Turnstile nach Fehler zurück", async ({
  page,
}) => {
  await routeTurnstile(page);
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let sessionCalls = 0;
  await page.route("**/api/transfers/session", async (route) => {
    sessionCalls += 1;
    await responseGate;
    await route.fulfill({
      status: 403,
      json: {
        ok: false,
        error: { code: "forbidden", requestId: "req-session" },
      },
    });
  });

  await page.goto("/datentransfer/");
  await page.getByLabel("Datentransfer-Token").fill(fragmentToken);
  const start = page.getByRole("button", { name: "Sichere Sitzung starten" });
  await start.click();
  await expect(start).toBeDisabled();
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>("[data-transfer-entry] button")?.click(),
  );
  expect(sessionCalls).toBe(1);

  releaseResponse?.();
  await expect(start).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("Vorgangskennung: req-session");
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { transferTurnstileResetCount: number })
          .transferTurnstileResetCount,
    ),
  ).toBe(1);
});

test("XHR-401 beendet Sitzung fail-closed und entfernt CSRF", async ({ page }) => {
  await routeTurnstile(page);
  await page.route("**/api/transfers/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/transfers/session") {
      await route.fulfill({
        json: { ok: true, case: transferCase().case, csrfToken },
      });
      return;
    }
    if (path === "/api/transfers/case") {
      await route.fulfill({ json: transferCase() });
      return;
    }
    if (path === "/api/transfers/submissions") {
      await route.fulfill({
        json: {
          ok: true,
          submissionId: "submission-401",
          uploads: [
            {
              fileId: "file-401",
              uploadUrl: "/api/transfers/uploads/file-401",
            },
          ],
        },
      });
      return;
    }
    if (path === "/api/transfers/uploads/file-401") {
      await route.fulfill({ status: 401, json: { ok: false } });
      return;
    }
    await route.fulfill({ status: 404, json: { ok: false } });
  });

  await enterFragmentSession(page);
  await page.getByLabel("Überschrift").fill("Linkes Ohr");
  await page
    .getByLabel("Beobachtung und Bericht")
    .fill("Luna kratzt sich seit gestern deutlich häufiger.");
  await page.getByLabel("Datenschutzhinweise gelesen").check();
  await page.getByLabel("Ich bestätige: Kein Notfall").check();
  await page.locator("input[name='files']").setInputFiles({
    name: "ohr.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole("button", { name: "Bericht sicher senden" }).click();

  await expect(page.getByRole("status")).toContainText("Sitzung ist abgelaufen");
  await expect(
    page.getByRole("button", { name: "Sichere Sitzung starten" }),
  ).toBeVisible();
  await expect(page.getByLabel("Datentransfer-Token")).toBeFocused();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test("CSP und Laufzeitrequests bleiben auf Same-Origin und Turnstile begrenzt", async ({
  page,
}) => {
  const externalHosts = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== e2eOrigin) externalHosts.add(url.hostname);
  });
  await routeTurnstile(page);
  await page.goto("/datentransfer/");

  expect([...externalHosts]).toEqual(["challenges.cloudflare.com"]);
  const csp = await page
    .locator("meta[http-equiv='Content-Security-Policy']")
    .getAttribute("content");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
  expect(csp).toContain("connect-src 'self'");
});
