import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const evidencePath = join(root, "docs/BILDNACHWEISE.md");
const publicRoot = join(root, "public");
const publishedVisualExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const previewNames = [
  "startseite-2-designvorschau.png",
  "startseite-3-designvorschau.png",
  "startseite-4-designvorschau-standard.png",
];

type PublishedImage = {
  path: string;
  width?: number;
  height?: number;
  label: "Symbolbild" | "Illustration";
  hero: boolean;
};

const prescribedHomeImages: readonly PublishedImage[] = [
  {
    path: "public/images/home/variant-2/hero-vet-pets.webp",
    width: 1800,
    height: 1200,
    label: "Symbolbild",
    hero: true,
  },
  {
    path: "public/images/home/variant-3/hero-ruhiges-gespraech.webp",
    width: 1800,
    height: 1125,
    label: "Symbolbild",
    hero: true,
  },
  {
    path: "public/images/home/variant-4/hero-hund-katze.webp",
    width: 1920,
    height: 1080,
    label: "Symbolbild",
    hero: true,
  },
  {
    path: "public/images/home/shared/faq-hund.webp",
    width: 1200,
    height: 1200,
    label: "Symbolbild",
    hero: false,
  },
  {
    path: "public/images/home/shared/praxis-illustration.svg",
    label: "Illustration",
    hero: false,
  },
];

function webpDimensions(file: Buffer): { width: number; height: number } {
  expect(file.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(file.subarray(8, 12).toString("ascii")).toBe("WEBP");

  const chunkType = file.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8X") {
    return {
      width: 1 + file.readUIntLE(24, 3),
      height: 1 + file.readUIntLE(27, 3),
    };
  }

  if (chunkType === "VP8 ") {
    expect(file.subarray(23, 26)).toEqual(Buffer.from([0x9d, 0x01, 0x2a]));
    return {
      width: file.readUInt16LE(26) & 0x3fff,
      height: file.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L") {
    const bits = file.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }

  throw new Error(`Unsupported WebP chunk: ${chunkType}`);
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function publishedVisuals(): string[] {
  return filesBelow(publicRoot)
    .filter((path) => publishedVisualExtensions.has(extname(path).toLowerCase()))
    .map((path) => join("public", relative(publicRoot, path)).replaceAll("\\", "/"));
}

function evidenceEntry(evidence: string, path: string): string {
  const entryStart = evidence.indexOf(`## ${path}`);
  const entryEnd = evidence.indexOf("\n## ", entryStart + 1);

  expect(entryStart).toBeGreaterThanOrEqual(0);
  return evidence.slice(entryStart, entryEnd === -1 ? undefined : entryEnd);
}

function isDesignPreviewPath(path: string): boolean {
  return previewNames.includes(basename(path));
}

describe("Bildrichtlinie", () => {
  it("belegt jedes veröffentlichte Bild mit Methode, Zweck, Kennzeichnung und Freigabe", () => {
    expect(existsSync(evidencePath)).toBe(true);

    const evidence = readFileSync(evidencePath, "utf8");

    for (const path of publishedVisuals()) {
      const entry = evidenceEntry(evidence, path);

      expect(entry).toMatch(/Erstellungsdatum:/);
      expect(entry).toMatch(/Generierungs-\/Quellmethode:/);
      expect(entry).toMatch(/Prompt oder Herkunft:/);
      expect(entry).toMatch(/Bearbeitungsschritte:/);
      expect(entry).toMatch(/Verwendungszweck:/);
      expect(entry).toMatch(/Kennzeichnung:/);
      expect(entry).toMatch(/Freigabestatus:/);
      expect(entry).toMatch(/Lösch-\/Austauschentscheidung:/);
    }
  });

  it("hält die exakten Vorgaben für die Home-Assets ein", () => {
    const evidence = readFileSync(evidencePath, "utf8");

    for (const image of prescribedHomeImages) {
      expect(evidenceEntry(evidence, image.path)).toContain(image.label);
      expect(existsSync(join(root, image.path))).toBe(true);
    }
  });

  it("liefert WebP-Bilder mit vereinbarten Hero-Abmessungen und Größenbudget", () => {
    for (const image of prescribedHomeImages.filter((image) =>
      image.path.endsWith(".webp"),
    )) {
      const file = readFileSync(join(root, image.path));
      const dimensions = webpDimensions(file);

      if (image.width && image.height) {
        expect(dimensions).toEqual({ width: image.width, height: image.height });
      }

      if (image.hero) {
        expect(statSync(join(root, image.path)).size).toBeLessThanOrEqual(300 * 1024);
      }
    }
  });

  it("erkennt verschachtelte Designvorschau-Pfade", () => {
    expect(isDesignPreviewPath("images/review/startseite-2-designvorschau.png")).toBe(
      true,
    );
  });

  it("veröffentlicht keine Designvorschau unter public", () => {
    const publishedNames = filesBelow(publicRoot).map((path) =>
      path.slice(publicRoot.length + 1),
    );

    expect(publishedNames.some(isDesignPreviewPath)).toBe(false);
  });
});
