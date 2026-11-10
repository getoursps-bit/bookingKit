import { defineConfig } from "tsup";

// The worker and the release scripts (migrate, seed, Dibs import) each ship as one
// self-contained file, so the runtime image needs no node_modules for them.
export default defineConfig({
  entry: { main: "worker/main.ts", migrate: "scripts/migrate.ts", seed: "db/seed/seed.ts", "import-dibs": "extensions/dibs-import/script.ts", "staff-create": "scripts/staff-create.ts" },
  outDir: "worker/dist",
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  splitting: false,
  // Native modules cannot be bundled. pg-native is optional and never loaded;
  // sharp and argon2 come from the web app's traced node_modules in the image.
  // They are left out of noExternal itself: a match there wins over external.
  noExternal: [/^(?!(?:pg-native|sharp|argon2)(?:\/|$))/],
  external: ["pg-native", "sharp", "argon2"],
  banner: {
    // Bundled CommonJS dependencies still call require().
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
