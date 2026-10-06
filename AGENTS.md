<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:scholars-project-bridge -->
## Read `MEMORY.md` before planning any work in this repo

Everything below is a router. The verified knowledge lives in one place.

| You need | Read |
|---|---|
| Versions, architecture, traps, open questions | **`MEMORY.md`** (repo root) — the source of truth |
| Any work in this repo | `.opencode/skills/scholars-project/SKILL.md` |
| Anything database (schema, migrations, queries) | `.opencode/skills/drizzle-workflow/SKILL.md` — read it before touching `src/db/` |
| UI work | `components.json` + `src/app/globals.css` tokens |
| Executable workflow, change-safety, approved stack | `.opencode/ai-workflow.json` |
| Full skill catalogue and how to add one | `skills-inventory.md` |

**Read those two `SKILL.md` files directly by path.** They are currently absent from the
OpenCode skill registry — `skill({ name: "scholars-project" })` and
`skill({ name: "drizzle-workflow" })` both fail with *"Skill not found"*, so do **not** rely
on loading them as skills. Verified 2026-10-01: both files have valid YAML frontmatter and
matching directory names. This is a registry-staleness issue, not a file defect — a session
restart should fix it. Until then, `Read` the paths above; their content is current and verified.

Four facts that invalidate most training data. Verify against `node_modules` before relying on them:

1. **The data layer is Drizzle ORM.** Schema is hand-written TypeScript in
   `src/db/schema/index.ts` — there is no schema DSL file and no generated client. Change a table,
   run `pnpm db:generate`, commit the migration in `drizzle/`. Access via `db` from
   `src/db/client.ts`. The schema is **complete**: 145 tables across 22 modules under
   `src/db/schema/`, baseline migration in `drizzle/` — applied to the local dev database on
   2026-10-06 (145 tables, 45 enums). Future `pnpm db:migrate` runs require explicit approval.
2. **UI primitives are Base UI (`@base-ui/react`), not Radix.** `components.json` uses
   `style: "base-lyra"`. Do not introduce `@radix-ui/*`.
3. **Icons are `@phosphor-icons/react`, not Lucide.** `lucide-react` is not installed. Use the
   `Icon` suffix (`ListIcon`, `BellIcon`).
4. **No auth is installed; Auth.js (NextAuth v5) is the approved mechanism** (user decision
   2026-10-06 — installing `next-auth` + its Drizzle adapter is approved; no other auth package
   is).

**There is no schema-drift gate.** Drizzle cannot detect a database that has drifted away from
`src/db/schema` without a migration, so every schema change must ship a generated migration file.
`db:check` only validates migration files — it does not compare a live database to the schema.
Do not write code that assumes a drift-verification command exists.

Verify before claiming done — `pnpm verify` (typecheck + lint + test + `db:check`), `pnpm build`,
and `pnpm db:generate` after any `src/db/schema` edit. See `MEMORY.md` for full command lists.

`src/` **is** committed to git. A large edit is still worth copying to `/tmp` first, but a deletion
is recoverable from history.
<!-- END:scholars-project-bridge -->
