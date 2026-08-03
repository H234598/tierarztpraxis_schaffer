export const TURNSTILE_TEST_SITEKEYS = [
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
] as const;

const defaultPassingTestSitekey = TURNSTILE_TEST_SITEKEYS[0];

export interface TurnstileSitekeyOptions {
  readonly allowTestKeys: boolean;
}

export class TurnstileConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnstileConfigurationError";
  }
}

export function resolveTurnstileSiteKey(
  value: string | undefined,
  options: TurnstileSitekeyOptions,
): string {
  if (value === undefined || value.length === 0) {
    if (options.allowTestKeys) return defaultPassingTestSitekey;

    throw new TurnstileConfigurationError(
      "PUBLIC_TURNSTILE_SITE_KEY fehlt.",
    );
  }

  if (value.trim() !== value || /\s/u.test(value)) {
    throw new TurnstileConfigurationError(
      "PUBLIC_TURNSTILE_SITE_KEY darf keine Leerzeichen enthalten.",
    );
  }

  if (
    TURNSTILE_TEST_SITEKEYS.includes(
      value as (typeof TURNSTILE_TEST_SITEKEYS)[number],
    ) &&
    !options.allowTestKeys
  ) {
    throw new TurnstileConfigurationError(
      "Cloudflare-Test-Sitekeys sind für diese Umgebung nicht erlaubt.",
    );
  }

  return value;
}
