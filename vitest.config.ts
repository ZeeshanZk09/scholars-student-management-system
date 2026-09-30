import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // `src/prisma/**` also holds generated contract artifacts (`contract.json`, `contract.d.ts`),
    // but `include` above already keeps them out: neither can match `*.test.ts`. Excluding the whole
    // directory therefore bought nothing and silently disabled every test in the database layer —
    // a test file there passes CI vacuously because it never runs. Only ignore real noise.
    exclude: ["node_modules/**", ".next/**"],
  },
})
