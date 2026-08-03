import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const mode = process.env.SITE_DEPLOYMENT_MODE ?? "development";
const production = mode === "production";
const site =
  process.env.PUBLIC_SITE_URL ??
  (production
    ? "https://tierarztpraxis-schaffer.telacore.org"
    : "https://h234598.github.io");
const base =
  process.env.PUBLIC_BASE_PATH ??
  (production ? "/" : "/tierarztpraxis_schaffer");

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  integrations: [sitemap()],
  build: {
    assets: "_assets",
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      // Unsere CSP erlaubt bewusst keine Inline-Skripte. Astro würde kleine
      // Client-Skripte sonst automatisch in das HTML einbetten.
      assetsInlineLimit: 0,
    },
  },
});
