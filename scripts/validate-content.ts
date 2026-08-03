import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

interface ValidationProblem {
  readonly path: string;
  readonly message: string;
}

const deploymentMode = process.env.SITE_DEPLOYMENT_MODE ?? "development";
const allowPlaceholders =
  process.env.ALLOW_PLACEHOLDERS === "true" ||
  (deploymentMode === "development" &&
    process.env.ALLOW_PLACEHOLDERS === undefined);

const canonicalProductionUrl =
  "https://tierarztpraxis-schaffer.telacore.org";
const allowedSourceExtensions = new Set([
  ".astro",
  ".css",
  ".html",
  ".json",
  ".md",
  ".svg",
  ".ts",
  ".txt",
]);
const placeholderPatterns = [
  { label: "TODO", pattern: /\bTODO\b/iu },
  { label: "TBD", pattern: /\bTBD\b/iu },
  { label: "CHANGEME", pattern: /\bCHANGEME\b/iu },
];
const problems: ValidationProblem[] = [];

if (deploymentMode !== "development" && deploymentMode !== "production") {
  throw new Error(
    `Ungültiger SITE_DEPLOYMENT_MODE: ${deploymentMode}. ` +
      "Erlaubt sind development und production.",
  );
}

if (deploymentMode === "production" && allowPlaceholders) {
  throw new Error(
    "Unsichere Konfiguration: Platzhalter dürfen in Produktion niemals " +
      "erlaubt sein.",
  );
}

function addProblem(path: string, message: string): void {
  problems.push({ path, message });
}

function inspectText(path: string, content: string): void {
  for (const { label, pattern } of placeholderPatterns) {
    if (pattern.test(content)) {
      addProblem(path, `enthält den Platzhalter ${label}`);
    }
  }
}

async function inspectDirectory(directory: string): Promise<void> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : "unknown";

    if (code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await inspectDirectory(absolutePath);
      continue;
    }

    if (!entry.isFile() || !allowedSourceExtensions.has(extname(entry.name))) {
      continue;
    }

    const displayPath = relative(process.cwd(), absolutePath).replaceAll(
      "\\",
      "/",
    );
    inspectText(displayPath, await readFile(absolutePath, "utf8"));
  }
}

await inspectDirectory(join(process.cwd(), "src"));
await inspectDirectory(join(process.cwd(), "public"));

if (deploymentMode === "production") {
  if (process.env.PUBLIC_SITE_URL !== canonicalProductionUrl) {
    addProblem(
      "environment.PUBLIC_SITE_URL",
      `muss exakt ${canonicalProductionUrl} sein`,
    );
  }

  if (process.env.PUBLIC_BASE_PATH !== "/") {
    addProblem(
      "environment.PUBLIC_BASE_PATH",
      "muss bei der Custom Domain exakt / sein",
    );
  }

  const turnstileSiteKey = process.env.PUBLIC_TURNSTILE_SITE_KEY;
  if (!turnstileSiteKey || turnstileSiteKey.startsWith("1x0000")) {
    addProblem(
      "environment.PUBLIC_TURNSTILE_SITE_KEY",
      "muss in Produktion ein echtes Cloudflare-Turnstile-Sitekey sein",
    );
  }
}

const uniqueProblems = [
  ...new Map(
    problems.map((problem) => [
      `${problem.path}\u0000${problem.message}`,
      problem,
    ]),
  ).values(),
];

if (uniqueProblems.length === 0) {
  console.log(`Inhaltsprüfung erfolgreich (${deploymentMode}).`);
  process.exit(0);
}

const formattedProblems = uniqueProblems
  .map(({ path, message }) => `- ${path}: ${message}`)
  .join("\n");

if (deploymentMode === "production" || !allowPlaceholders) {
  console.error(`Inhaltsprüfung fehlgeschlagen:\n${formattedProblems}`);
  process.exit(1);
}

console.warn(
  `Entwicklungsbuild mit ${uniqueProblems.length} bewusst erlaubten ` +
    `Platzhalterproblemen:\n${formattedProblems}`,
);
