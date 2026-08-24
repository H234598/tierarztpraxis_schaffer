import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    // Several validator tests intentionally spawn Astro/build processes. Running
    // those files in parallel exhausts the small local CI container and creates
    // false timeout failures rather than useful signal.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
