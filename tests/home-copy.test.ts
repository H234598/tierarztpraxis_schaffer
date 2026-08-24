import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import * as homeContent from "../src/content/home-content";

const { variant4HomeCopy } = homeContent;

describe("Startseitenkopie", () => {
  it("führt die drei bestehenden Service-TODOs einmal als gemeinsamen Karteninhalt", () => {
    const { sharedServicePlaceholderCards } = homeContent as {
      readonly sharedServicePlaceholderCards?: unknown;
    };

    expect(sharedServicePlaceholderCards).toEqual([
      {
        title: "Vorsorge und Beratung",
        text: "TODO: Tatsächliches Vorsorge-, Impf- und Beratungsangebot der Praxis fachlich bestätigen.",
      },
      {
        title: "Diagnostik und Behandlung",
        text: "TODO: Vorhandene Diagnostik, behandelte Tierarten und Behandlungsschwerpunkte ergänzen.",
      },
      {
        title: "Operationen und Nachsorge",
        text: "TODO: Operationsspektrum, Narkoseverfahren und Nachsorgeangebot bestätigen.",
      },
    ]);
  });

  it("rendert Hero-Titel und Einleitung aus der Standardvariante-4-Copy", () => {
    const result = spawnSync("pnpm", ["exec", "astro", "build"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        SITE_DEPLOYMENT_MODE: "development",
        ALLOW_PLACEHOLDERS: "true",
        ALLOW_TURNSTILE_TEST_KEYS: "true",
        PUBLIC_SITE_URL: "http://localhost:4321",
        PUBLIC_BASE_PATH: "/",
        PUBLIC_CONTACT_API_URL:
          "https://api.tierarztpraxis-schaffer.telacore.org/v1/contact",
        PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
    });

    expect(result.status, result.stderr).toBe(0);

    const home = readFileSync("dist/index.html", "utf8");
    expect(home).toContain(variant4HomeCopy.hero.title);
    expect(home).toContain(variant4HomeCopy.hero.intro);
  }, 20_000);
});
