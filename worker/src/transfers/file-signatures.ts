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

const majorBrandTypes: Readonly<Record<string, AllowedMediaType>> = {
  isom: "video/mp4",
  iso2: "video/mp4",
  mp41: "video/mp4",
  mp42: "video/mp4",
  avc1: "video/mp4",
  "M4V ": "video/mp4",
  "qt  ": "video/quicktime",
  heic: "image/heic",
  heix: "image/heic",
  hevc: "image/heic",
  hevx: "image/heic",
  mif1: "image/heif",
  msf1: "image/heif",
  miaf: "image/heif",
};

const safeCompatibleBrands = new Set(Object.keys(majorBrandTypes));

function isoBmffType(prefix: Uint8Array): AllowedMediaType | null {
  const length = ftypLength(prefix);
  if (length === null || prefix.byteLength < length) return null;
  const major = ascii(prefix, 8, 4);
  const mediaType = majorBrandTypes[major];
  if (!mediaType) return null;
  for (let offset = 16; offset < length; offset += 4) {
    const compatible = ascii(prefix, offset, 4);
    if (
      compatible === "avif" ||
      compatible === "avis" ||
      !safeCompatibleBrands.has(compatible)
    ) {
      return null;
    }
  }
  return mediaType;
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
  if (
    prefix.length >= 12 &&
    ascii(prefix, 0, 4) === "RIFF" &&
    ascii(prefix, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }
  if (hasPrefix(prefix, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  return isoBmffType(prefix);
}
