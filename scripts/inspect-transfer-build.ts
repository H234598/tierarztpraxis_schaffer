import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAssetPath } from "./inspect-home-build-utils";

const distDirectory = resolve("dist");
const htmlPath = resolve(distDirectory, "datentransfer/index.html");
const html = await readFile(htmlPath, "utf8");

const csp = html.match(
  /<meta\b(?=[^>]*\bhttp-equiv=["']Content-Security-Policy["'])[^>]*\bcontent=(['"])(.*?)\1[^>]*>/iu,
)?.[2];
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)].map(
  (match) => ({
    attributes: match[1] ?? "",
    body: match[2] ?? "",
  }),
);
const scriptSources = scripts
  .map((script) => script.attributes.match(/\bsrc=["']([^"']+)["']/iu)?.[1])
  .filter((source): source is string => Boolean(source));

if (!html.includes("data-transfer-root")) {
  throw new Error("Datentransfer-Build enthält keinen Transfer-Wurzelknoten.");
}
if (!html.includes("data-transfer-token")) {
  throw new Error("Datentransfer-Build enthält kein Tokenfeld.");
}
if (!/kein Notfall/iu.test(html)) {
  throw new Error("Datentransfer-Build enthält keine Notfallwarnung.");
}
if (html.search(/kein Notfall/iu) > html.indexOf("data-transfer-token")) {
  throw new Error("Notfallwarnung steht nicht vor dem Tokenfeld.");
}
if (/transfer-v1\./u.test(html)) {
  throw new Error("Datentransfer-Build enthält einen rohen Transfertoken.");
}
if (/\blocalStorage\b/iu.test(html)) {
  throw new Error(
    "Datentransfer-Build darf keine localStorage-Tokenpersistenz enthalten.",
  );
}
if (
  scripts.some(
    ({ attributes, body }) => !/\bsrc=["'][^"']+["']/iu.test(attributes) && body.trim(),
  )
) {
  throw new Error("Datentransfer-Build enthält ausführbaren Inline-Code.");
}
if (
  !csp?.match(
    /(?:^|;)\s*script-src\s+'self'\s+https:\/\/challenges\.cloudflare\.com(?:\s*;|$)/iu,
  )
) {
  throw new Error(
    "CSP des Datentransfer-Builds begrenzt script-src nicht auf First-Party und Turnstile.",
  );
}
if (/script-src[^;]*unsafe-inline/iu.test(csp ?? "")) {
  throw new Error("CSP des Datentransfer-Builds erlaubt unsafe-inline.");
}

const firstPartySources = scriptSources.filter(
  (source) => !source.startsWith("https://"),
);
if (firstPartySources.length === 0) {
  throw new Error("Datentransfer-Build enthält kein First-Party-JavaScript.");
}

let transferHandlerFound = false;
for (const source of firstPartySources) {
  const asset = await readFile(buildAssetPath(distDirectory, source), "utf8");
  const hasRootSelector = asset.includes("data-transfer-root");
  const hasSessionRequest = asset.includes("/api/transfers/session");
  const hasCsrfHandling = asset.includes("csrf");
  const hasLogout = asset.includes("data-transfer-logout");
  console.log(
    `JS: ${source}; bytes=${Buffer.byteLength(asset, "utf8")}; ` +
      `root=${hasRootSelector}; session=${hasSessionRequest}; ` +
      `csrf=${hasCsrfHandling}; logout=${hasLogout}`,
  );
  transferHandlerFound ||=
    hasRootSelector && hasSessionRequest && hasCsrfHandling && hasLogout;
}

if (!transferHandlerFound) {
  throw new Error("First-Party-JavaScript des Datentransfers ist unvollständig.");
}

console.log(`HTML: ${htmlPath}`);
console.log(`CSP: ${csp}`);
console.log(
  "Datentransfer-Build enthält keinen rohen Token, keine localStorage-Persistenz und nur erlaubte Skripte.",
);
