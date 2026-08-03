/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SITE_DEPLOYMENT_MODE?: "development" | "production";
  readonly ALLOW_PLACEHOLDERS?: "true" | "false";
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_BASE_PATH?: string;
  readonly PUBLIC_CONTACT_API_URL?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    reset(widget?: string | HTMLElement): void;
  };
}
