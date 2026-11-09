import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Nothing under `src/db/**` needs excluding: unlike a generated-artifact directory, every file
    // there is hand-written source or a test. Excluding the whole directory would silently disable
    // every test in the database layer — a test file there passes CI vacuously because it never
    // runs. Only ignore real noise.
    exclude: ["node_modules/**", ".next/**"],
  },
});
