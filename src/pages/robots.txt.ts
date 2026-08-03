import type { APIRoute } from "astro";
import { siteConfig } from "../config/site";

export const prerender = true;

export const GET: APIRoute = () => {
  const body = siteConfig.isDevelopment
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /\nSitemap: ${siteConfig.canonicalUrl}/sitemap-index.xml\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
