import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildAssetPath,
  executableInlineScriptCount,
  firstPartyScriptSources,
  isFontPreload,
  isRemoteUrl,
  isStylesheet,
  links,
} from "./inspect-home-build-utils";

const distDirectory = resolve("dist");
const htmlPath = resolve(distDirectory, "index.html");
const html = await readFile(htmlPath, "utf8");

const csp = html.match(
  /<meta\b(?=[^>]*\bhttp-equiv=["']Content-Security-Policy["'])[^>]*\bcontent=(["'])(.*?)\1[^>]*>/iu,
)?.[2];
const styleLinks = links(html).filter(isStylesheet);
const fontLinks = links(html).filter(isFontPreload);

if (styleLinks.length === 0) {
  throw new Error("Startseite enthält kein externes First-Party-CSS-Asset.");
}
if (styleLinks.some((link) => !link.href || isRemoteUrl(link.href))) {
  throw new Error(
    "Startseite enthält ein Remote-Stylesheet oder Stylesheet ohne href.",
  );
}
if (fontLinks.some((link) => !link.href || isRemoteUrl(link.href))) {
  throw new Error("Startseite enthält einen Remote-Font oder Font ohne href.");
}
if (/<style\b[^>]*>/iu.test(html) || /\sstyle\s*=/iu.test(html)) {
  throw new Error("Startseite enthält CSP-widrige Inline-Styles.");
}
if (!csp?.match(/(?:^|;)\s*style-src\s+'self'(?:\s*;|$)/iu)) {
  throw new Error("CSP der Startseite setzt style-src 'self' nicht exakt.");
}
if (/style-src[^;]*unsafe-inline/iu.test(csp)) {
  throw new Error("CSP der Startseite erlaubt unsafe-inline für Styles.");
}
if (executableInlineScriptCount(html) > 0) {
  throw new Error("Startseite enthält CSP-widrige ausführbare Inline-Skripte.");
}

for (const source of styleLinks.map((link) => link.href)) {
  if (!source) continue;
  const cssPath = buildAssetPath(distDirectory, source);
  const css = await readFile(cssPath, "utf8");
  if (/@import\s+(?:url\(\s*)?["']?(?:https?:)?\/\//iu.test(css)) {
    throw new Error(`CSS-Asset importiert Remote-CSS: ${source}`);
  }
  if (/url\(\s*["']?(?:https?:)?\/\//iu.test(css)) {
    throw new Error(`CSS-Asset lädt Remote-Ressource oder Font: ${source}`);
  }
  console.log(`CSS: ${source}; bytes=${Buffer.byteLength(css, "utf8")}`);
}

let startVariantMenuHandlerFound = false;
for (const source of firstPartyScriptSources(html)) {
  const scriptPath = buildAssetPath(distDirectory, source);
  const script = await readFile(scriptPath, "utf8");
  const hasMenuSelector = script.includes("data-start-variant-menu");
  const hasEscapeHandler = script.includes("Escape");

  console.log(
    `JS: ${source}; bytes=${Buffer.byteLength(script, "utf8")}; ` +
      `startVariantMenu=${hasMenuSelector}; escape=${hasEscapeHandler}`,
  );
  startVariantMenuHandlerFound ||= hasMenuSelector && hasEscapeHandler;
}

if (!startVariantMenuHandlerFound) {
  throw new Error(
    "Startseiten-Build enthält keinen First-Party-Handler für das Variantenmenü.",
  );
}

console.log(`HTML: ${htmlPath}`);
console.log(`CSP: ${csp}`);
console.log(
  "Startseiten-Build enthält nur CSP-konforme First-Party-Styles und Menü-JavaScript.",
);
