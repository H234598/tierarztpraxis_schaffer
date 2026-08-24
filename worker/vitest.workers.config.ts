import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-07-16",
        r2Buckets: ["TRANSFER_FILES"],
      },
    }),
  ],
  test: { include: ["test-runtime/**/*.test.ts"], restoreMocks: true },
});
