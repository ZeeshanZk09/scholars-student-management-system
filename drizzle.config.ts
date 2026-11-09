import "dotenv/config";

import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit configuration.
 *
 * `schema` is a single entry point rather than a glob so that the set of exported tables is
 * explicit and reviewable, and so a table that nobody re-exports from `src/db/schema/index.ts`
 * fails loudly here instead of being silently absent from the next migration.
 *
 * `dbCredentials.url` is read defensively rather than validated, because a single config serves
 * both offline commands (`generate`, `check`, which only need the schema file) and online ones
 * (`migrate`, `push`, `studio`, which need a live server). Validating unconditionally would make
 * `db:generate` — the command a developer runs constantly, and which touches no database — fail
 * whenever `DATABASE_URL` is absent. The commands that actually connect are the ones that enforce
 * a usable URL; `src/db/env.ts` still validates the value at the application boundary, where a
 * malformed connection string should be a named error rather than a driver crash.
 *
 * Generated SQL lives in `drizzle/`, one folder per migration. It is committed.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
