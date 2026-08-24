import { describe, expect, it } from "vitest";
import {
  buildAssetPath,
  executableInlineScriptCount,
  firstPartyScriptSources,
  remoteStyleOrFontSources,
} from "../scripts/inspect-home-build-utils";

describe("build asset path", () => {
  it("entfernt den Deployment-Basepfad, nicht das physische _assets-Verzeichnis", () => {
    expect(
      buildAssetPath(
        "/tmp/tierarzt-dist",
        "/tierarztpraxis_schaffer/_assets/start-menu.js?v=1",
      ),
    ).toBe("/tmp/tierarzt-dist/_assets/start-menu.js");
    expect(buildAssetPath("/tmp/tierarzt-dist", "/_assets/start-menu.js")).toBe(
      "/tmp/tierarzt-dist/_assets/start-menu.js",
    );
  });

  it("weist Traversal außerhalb des Build-Verzeichnisses ab", () => {
    expect(() =>
      buildAssetPath("/tmp/tierarzt-dist", "../_assets/start-menu.js"),
    ).toThrow("außerhalb");
  });
});

describe("home build inspector links", () => {
  it("rejects unquoted mixed-case remote stylesheet and font preload links", () => {
    const html = [
      "<link REL=StyleSheet HREF=https://styles.example/remote.css>",
      "<link rel=PRELOAD AS=FoNt href=//fonts.example/remote.woff2>",
      '<link rel="stylesheet" href="/_assets/site.css">',
    ].join("");

    expect(remoteStyleOrFontSources(html)).toEqual([
      "https://styles.example/remote.css",
      "//fonts.example/remote.woff2",
    ]);
  });
});

describe("home build inspector scripts", () => {
  it("findet First-Party-Skripte und ausführbare Inline-Skripte", () => {
    const html = [
      '<script src="/_assets/start-menu.js"></script>',
      '<script src="https://example.org/third-party.js"></script>',
      "<script>window.startMenu = true;</script>",
    ].join("");

    expect(firstPartyScriptSources(html)).toEqual(["/_assets/start-menu.js"]);
    expect(executableInlineScriptCount(html)).toBe(1);
  });
});
