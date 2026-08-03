import { resolveTurnstileSiteKey } from "../src/config/turnstile";

try {
  resolveTurnstileSiteKey(process.env.PUBLIC_TURNSTILE_SITE_KEY, {
    allowTestKeys: false,
  });
  console.log("Öffentliches Turnstile-Sitekey ist gesetzt und zulässig.");
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "PUBLIC_TURNSTILE_SITE_KEY ist ungültig.",
  );
  process.exit(1);
}
