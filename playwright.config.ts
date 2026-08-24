import { defineConfig, devices } from "@playwright/test";

const configuredPort = process.env.PLAYWRIGHT_PORT ?? "4321";
const e2ePort = /^\d{2,5}$/u.test(configuredPort) ? configuredPort : "4321";
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const configuredWorkers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? "", 10);
const e2eWorkers =
  Number.isSafeInteger(configuredWorkers) && configuredWorkers > 0
    ? configuredWorkers
    : 1;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 15_000,
  workers: e2eWorkers,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    toHaveScreenshot: {
      stylePath: "tests/e2e/snapshot.css",
    },
  },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}",
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { width: 1440, height: 1100 },
      },
    },
    {
      name: "tablet",
      testMatch: /accessibility\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "mobile",
      testMatch: /accessibility\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    env: {
      SITE_DEPLOYMENT_MODE: "development",
      ALLOW_PLACEHOLDERS: "true",
      ALLOW_TURNSTILE_TEST_KEYS: "true",
      PUBLIC_SITE_URL: e2eBaseUrl,
      PUBLIC_BASE_PATH: "/",
      PUBLIC_CONTACT_API_URL:
        "https://api.tierarztpraxis-schaffer.telacore.org/v1/contact",
      PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
  },
});
