import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ext": fileURLToPath(new URL("./extensions", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup/env.ts"],
    environment: "node",
    // Database tests each build a schema; a busy CI runner needs more than 5 seconds.
    testTimeout: 20_000,
  },
});
