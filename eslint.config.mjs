import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Last: disables ESLint rules that conflict with Prettier formatting.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "public/**",
    ".agents/**",
    ".devin/**",
    ".claude/**",
    ".cursor/**",
    ".vscode/**",
    ".idea/**",
    ".opencode/**",
    "playwright-report/**",
    "test-results/**",
    // Generated drizzle-kit migration artifacts (SQL + snapshots). `src/db/**` is deliberately NOT
    // ignored: with Drizzle the schema is hand-written TypeScript, so it is real source.
    "drizzle/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
