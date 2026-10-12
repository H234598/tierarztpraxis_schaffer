export type AllowedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm";

export const imageMediaTypes = new Set<AllowedMediaType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const inlineSafeMediaTypes = new Set<AllowedMediaType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

export function isAllowedMediaType(value: string): value is AllowedMediaType {
  return (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp" ||
    value === "image/heic" ||
    value === "image/heif" ||
    value === "video/mp4" ||
    value === "video/quicktime" ||
    value === "video/webm"
  );
}

export function maximumMediaBytes(mediaType: AllowedMediaType): number {
  return imageMediaTypes.has(mediaType) ? 12 * 1_024 * 1_024 : 50 * 1_024 * 1_024;
}
