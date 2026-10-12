export interface SubmissionLinkInput {
  readonly url: string;
  readonly label?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateSubmissionLinks(
  value: unknown,
): readonly SubmissionLinkInput[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new TypeError("Invalid submission links");
  }

  return value.map((candidate) => {
    if (!isObject(candidate)) throw new TypeError("Invalid submission link");
    const keys = Object.keys(candidate);
    if (
      keys.some((key) => key !== "url" && key !== "label") ||
      typeof candidate.url !== "string" ||
      candidate.url.length < 8 ||
      candidate.url.length > 2_048 ||
      (candidate.label !== undefined &&
        (typeof candidate.label !== "string" || candidate.label.length > 160))
    ) {
      throw new TypeError("Invalid submission link");
    }

    let url: URL;
    try {
      url = new URL(candidate.url);
    } catch {
      throw new TypeError("Invalid submission link");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new TypeError("Invalid submission link");
    }

    return candidate.label === undefined
      ? { url: candidate.url }
      : { url: candidate.url, label: candidate.label };
  });
}
