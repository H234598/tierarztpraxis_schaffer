import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface SizedFile {
  path: string;
  bytes: number;
}

export interface HomeBudgetFiles {
  rasters: SizedFile[];
  svgs: SizedFile[];
  css: SizedFile[];
  js: SizedFile[];
}

export const HOME_BUDGETS = {
  rasterFile: 100 * 1024,
  rasterTotal: 256 * 1024,
  svgFile: 10 * 1024,
  cssTotal: 64 * 1024,
  jsTotal: 32 * 1024,
} as const;

const rasterExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function total(files: readonly SizedFile[]): number {
  return files.reduce((sum, file) => sum + file.bytes, 0);
}

function sorted(files: readonly SizedFile[]): SizedFile[] {
  return [...files].sort((left, right) => left.path.localeCompare(right.path));
}

export function evaluateHomeBudgets(files: HomeBudgetFiles): string[] {
  const violations: string[] = [];

  for (const file of sorted(files.rasters)) {
    if (file.bytes > HOME_BUDGETS.rasterFile) {
      violations.push(
        `Raster ${file.path}: ${file.bytes} Byte > ${HOME_BUDGETS.rasterFile} Byte.`,
      );
    }
  }

  const rasterTotal = total(files.rasters);
  if (rasterTotal > HOME_BUDGETS.rasterTotal) {
    violations.push(
      `Raster gesamt: ${rasterTotal} Byte > ${HOME_BUDGETS.rasterTotal} Byte.`,
    );
  }

  for (const file of sorted(files.svgs)) {
    if (file.bytes > HOME_BUDGETS.svgFile) {
      violations.push(
        `SVG ${file.path}: ${file.bytes} Byte > ${HOME_BUDGETS.svgFile} Byte.`,
      );
    }
  }

  const cssTotal = total(files.css);
  if (cssTotal > HOME_BUDGETS.cssTotal) {
    violations.push(`CSS gesamt: ${cssTotal} Byte > ${HOME_BUDGETS.cssTotal} Byte.`);
  }

  const jsTotal = total(files.js);
  if (jsTotal > HOME_BUDGETS.jsTotal) {
    violations.push(
      `JavaScript gesamt: ${jsTotal} Byte > ${HOME_BUDGETS.jsTotal} Byte.`,
    );
  }

  return violations;
}

function displayPath(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function readTree(root: string, directory: string): SizedFile[] {
  const files: SizedFile[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...readTree(root, path));
    } else if (entry.isFile()) {
      files.push({ path: displayPath(root, path), bytes: statSync(path).size });
    }
  }

  return sorted(files);
}

export function loadHomeBudgetFiles(root = process.cwd()): HomeBudgetFiles {
  const homeDirectory = resolve(root, "public/images/home");
  const assetDirectory = resolve(root, "dist/_assets");

  if (!existsSync(homeDirectory)) {
    throw new Error("public/images/home fehlt.");
  }
  if (!existsSync(assetDirectory)) {
    throw new Error("dist/_assets fehlt.");
  }

  const homeFiles = readTree(root, homeDirectory);
  const assetFiles = readTree(root, assetDirectory);

  return {
    rasters: homeFiles.filter((file) =>
      rasterExtensions.has(extname(file.path).toLowerCase()),
    ),
    svgs: homeFiles.filter((file) => extname(file.path).toLowerCase() === ".svg"),
    css: assetFiles.filter((file) => extname(file.path).toLowerCase() === ".css"),
    js: assetFiles.filter((file) => extname(file.path).toLowerCase() === ".js"),
  };
}

function run(): void {
  try {
    const files = loadHomeBudgetFiles();
    const violations = evaluateHomeBudgets(files);
    if (violations.length > 0) {
      throw new Error(violations.join("\n"));
    }

    console.log(
      [
        `Raster ${total(files.rasters)}/${HOME_BUDGETS.rasterTotal} Byte`,
        `CSS ${total(files.css)}/${HOME_BUDGETS.cssTotal} Byte`,
        `JavaScript ${total(files.js)}/${HOME_BUDGETS.jsTotal} Byte`,
      ].join("; "),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Startseiten-Budgetprüfung fehlgeschlagen: ${message}`);
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  run();
}
