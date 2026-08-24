import { isAbsolute, relative, resolve } from "node:path";

export type HtmlAttributes = Readonly<Record<string, string>>;
export interface HtmlScript {
  readonly attributes: HtmlAttributes;
  readonly body: string;
}

const isRemoteUrl = (value: string) => /^(?:https?:)?\/\//iu.test(value);
const hasToken = (value: string | undefined, token: string) =>
  value?.split(/\s+/u).some((item) => item.toLowerCase() === token) ?? false;

export const buildAssetPath = (distDirectory: string, source: string): string => {
  const pathname = source.split(/[?#]/u)[0] ?? "";
  if (pathname.split(/[\\/]/u).includes("..")) {
    throw new Error(`Asset liegt außerhalb von dist: ${source}`);
  }
  const marker = "/_assets/";
  const markerIndex = pathname.indexOf(marker);
  const relativeSource =
    markerIndex >= 0 ? pathname.slice(markerIndex + 1) : pathname.replace(/^\/+/, "");
  const path = resolve(distDirectory, relativeSource);
  const relativePath = relative(distDirectory, path);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Asset liegt außerhalb von dist: ${source}`);
  }
  return path;
};

export const attributes = (tag: string): HtmlAttributes => {
  const result: Record<string, string> = {};
  const source = tag.replace(/^<[^\s/>]+/u, "").replace(/\/?\s*>$/u, "");

  for (const match of source.matchAll(
    /(?:^|\s+)([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu,
  )) {
    const name = match[1];
    if (name) result[name.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return result;
};

export const links = (html: string): HtmlAttributes[] =>
  [...html.matchAll(/<link\b[^>]*>/giu)].map((match) => attributes(match[0]));

export const scripts = (html: string): readonly HtmlScript[] =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)].map((match) => ({
    attributes: attributes(`<script${match[1] ?? ""}>`),
    body: match[2] ?? "",
  }));

export const isStylesheet = (link: HtmlAttributes) => hasToken(link.rel, "stylesheet");
export const isFontPreload = (link: HtmlAttributes) =>
  hasToken(link.rel, "preload") && link.as?.toLowerCase() === "font";

export const remoteStyleOrFontSources = (html: string): string[] =>
  links(html)
    .filter((link) => isStylesheet(link) || isFontPreload(link))
    .map((link) => link.href)
    .filter(
      (source): source is string => typeof source === "string" && isRemoteUrl(source),
    );

export const firstPartyScriptSources = (html: string): string[] =>
  scripts(html)
    .map((script) => script.attributes.src)
    .filter(
      (source): source is string =>
        typeof source === "string" && source.length > 0 && !isRemoteUrl(source),
    );

export const executableInlineScriptCount = (html: string): number =>
  scripts(html).filter(
    (script) => !script.attributes.src && script.body.trim().length > 0,
  ).length;

export { isRemoteUrl };
