import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const htmlPath = resolve("dist/kontakt/index.html");
const html = await readFile(htmlPath, "utf8");

const cspMeta = html.match(
  /<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/iu,
)?.[0];
const csp = cspMeta?.match(/\bcontent="([^"]*)"/iu)?.[1] ?? "MISSING";

const scripts = [
  ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu),
].map((match) => ({
  attributes: match[1] ?? "",
  body: match[2] ?? "",
  inlineBytes: Buffer.byteLength(match[2] ?? "", "utf8"),
}));

console.log(`HTML: ${htmlPath}`);
console.log(`CSP: ${csp}`);
console.log("SCRIPT TAGS:");
for (const [index, script] of scripts.entries()) {
  console.log(
    `${index + 1}. ${script.attributes.trim() || "(no attributes)"}; ` +
      `inlineBytes=${script.inlineBytes}`,
  );
}

const executableInlineScripts = scripts.filter(
  ({ attributes, body }) =>
    !/\bsrc=["'][^"']+["']/iu.test(attributes) && body.trim().length > 0,
);

if (executableInlineScripts.length > 0) {
  throw new Error(
    `Die Kontaktseite enthält ${executableInlineScripts.length} ausführbare ` +
      "Inline-Skripte, die von der CSP blockiert würden.",
  );
}

const firstPartySources = scripts
  .map(({ attributes }) =>
    attributes.match(/\bsrc=["']([^"']+)["']/iu)?.[1],
  )
  .filter((source): source is string => Boolean(source))
  .filter((source) => !source.startsWith("https://"));

if (firstPartySources.length === 0) {
  throw new Error(
    "Kein First-Party-JavaScript-Asset auf der Kontaktseite gefunden.",
  );
}

let handlerFound = false;
for (const source of firstPartySources) {
  const relativePath = source.replace(/^\//u, "");
  const assetPath = resolve("dist", relativePath);
  const asset = await readFile(assetPath, "utf8");
  const hasFormSelector = asset.includes("data-contact-form");
  const hasPendingMessage = asset.includes("Nachricht wird sicher versendet");
  const hasFetch = asset.includes("fetch(");

  console.log(
    `ASSET ${source}: bytes=${Buffer.byteLength(asset, "utf8")}; ` +
      `formSelector=${hasFormSelector}; pendingMessage=${hasPendingMessage}; ` +
      `fetch=${hasFetch}`,
  );

  handlerFound ||= hasFormSelector && hasPendingMessage && hasFetch;
}

if (!handlerFound) {
  throw new Error(
    "Das ausgelieferte First-Party-JavaScript enthält den Kontaktformular-Handler nicht.",
  );
}

if (!csp.includes("script-src 'self'")) {
  throw new Error("Die CSP erlaubt First-Party-JavaScript nicht.");
}

console.log(
  "Kontaktformular-Build enthält einen CSP-kompatiblen First-Party-Handler.",
);
