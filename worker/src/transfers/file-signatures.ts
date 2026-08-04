import type { AllowedMediaType } from "./limits";

function hasPrefix(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
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
  if (prefix.length < 12 || ascii(prefix, 4, 4) !== "ftyp") return null;

  switch (ascii(prefix, 8, 4)) {
    case "isom":
    case "iso2":
    case "mp41":
    case "mp42":
      return "video/mp4";
    case "qt  ":
      return "video/quicktime";
    case "heic":
    case "heix":
    case "hevc":
    case "hevx":
      return "image/heic";
    case "mif1":
    case "msf1":
      return "image/heif";
    default:
      return null;
  }
}
