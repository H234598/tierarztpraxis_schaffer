import type { AllowedMediaType } from "./limits";

const maximumFtypBytes = 64;

function hasPrefix(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function ftypLength(prefix: Uint8Array): number | null {
  if (prefix.byteLength < 8 || ascii(prefix, 4, 4) !== "ftyp") return null;
  const size = (prefix[0]! << 24) + (prefix[1]! << 16) + (prefix[2]! << 8) + prefix[3]!;
  return size >= 16 && size <= maximumFtypBytes && size % 4 === 0 ? size : null;
}

function isoBmffType(prefix: Uint8Array): AllowedMediaType | null {
  const length = ftypLength(prefix);
  if (length === null || prefix.byteLength < length) return null;
  const brands = [];
  for (let offset = 8; offset < length; offset += 4) brands.push(ascii(prefix, offset, 4));
  if (brands.includes("avif") || brands.includes("avis")) return null;

  const types = new Set<AllowedMediaType>();
  for (const brand of brands) {
    if (["isom", "iso2", "mp41", "mp42"].includes(brand)) types.add("video/mp4");
    if (brand === "qt  ") types.add("video/quicktime");
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) types.add("image/heic");
    if (["mif1", "msf1"].includes(brand)) types.add("image/heif");
  }
  return types.size === 1 ? [...types][0] ?? null : null;
}

export function needsMoreSignatureBytes(prefix: Uint8Array): boolean {
  const length = ftypLength(prefix);
  return length !== null && prefix.byteLength < length;
}

export function detectMediaType(prefix: Uint8Array): AllowedMediaType | null {
  if (hasPrefix(prefix, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (prefix.length >= 12 && ascii(prefix, 0, 4) === "RIFF" && ascii(prefix, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (hasPrefix(prefix, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  return isoBmffType(prefix);
}
