---
name: drizzle-workflow
description: Use for ANY database work in this repo - schema/table changes in src/db/schema, migrations, drizzle-kit commands, or writing a query. This repo uses Drizzle ORM with drizzle-kit and the node-postgres driver; there is no generated client. Read before editing src/db/schema or adding a migration. Triggers on "drizzle", "drizzle-kit", "pgTable", "migration", "schema change", "database query", "db:generate", "db:migrate", "db:push".
---

# Drizzle Workflow (this repository)

The data layer is **Drizzle ORM** (`drizzle-orm`) with **`drizzle-kit`** and the **node-postgres**
driver (`pg`). The schema is **hand-written TypeScript** that is the single source of truth — there
is no schema DSL file, no generated client, and no code-generation step between editing a table and
running `tsc`.

## Verified versions

| Package | Version |
|---|---|
| `drizzle-orm` | 0.45.3 |
| `drizzle-kit` | 0.31.11 |
| `pg` | 8.23.1 |
| `@types/pg` | 8.23.1 |
| Node | 26.8.1 |

Query current Drizzle behaviour with Context7 (`/drizzle-team/drizzle-orm-docs`). Do not rely on
training data for API details — the column builders and the relational-query API have moved several
times.

## Verified CLI surface — and why `kit.drizzle.team` will mislead you

**`https://kit.drizzle.team/` is stale. Do not follow it.** Verified against the installed CLI:

| | `kit.drizzle.team` says | `0.31.11` actually does |
|---|---|---|
| import | `drizzle-orm-pg` | `drizzle-orm/pg-core` |
| commands | `generate:pg`, `introspect:pg`, `check:pg`, `up:pg` | bare verbs: `generate`, `introspect`, `check`, `up` |
| dialect | `--dialect pg` | `--dialect postgresql` |

The `:pg` suffixes and the `drizzle-orm-pg` package no longer exist; the commands there would fail.
Confirm with `npx drizzle-kit --help` before trusting any Drizzle command docs, including this file.

The complete command list in `0.31.11` is: `generate`, `migrate`, `introspect`, `push`, `studio`,
`up`, `check`, `drop`, `export`. We deliberately expose only six as `pnpm` scripts — `up`, `drop`,
and `export` exist in the CLI but are **not** wired up, because `drop` destroys the database and
`up`/`export` need a reason to be run deliberately. Use `pnpm db:*`, not raw `drizzle-kit`.

## AI tooling: what exists here, and what does not

- **There is no `drizzle-kit mcp` in this version.** An official MCP adapter (`drizzle-kit mcp`,
  three tools over stdio) and an installable skills catalog exist, but only in the **`1.0.0-rc.*`
  prereleases**. Latest stable is `0.31.11`, which is what this repo pins. Do not suggest installing
  the RC: it crashes without a matching `drizzle-orm` 1.x (`Cannot find module
  'drizzle-orm/_relations'`) and it replaces the CLI with `@drizzle-team/brocli`. That is a major
  data-layer upgrade requiring approval, not a config change.
- **No Drizzle skills package is published to npm** (`drizzle-skills`, `@drizzle/skills`, etc. all
  404). This skill plus Context7 is the AI-assisted path — that is deliberate, not a gap.
- **There is no `--output text|json`.** The machine-readable output envelope is 1.0-only, so
  `drizzle-kit` output here is **human text meant for a terminal, not a parser.** Read it; do not
  write a script that scrapes it. Structured access to the schema is `tsc` / reading
  `src/db/schema` directly.
- **`defrex/drizzle-mcp` was installed, found broken, and removed — do not re-add it.** Installed
  globally from GitHub, then verified non-functional against this repo. It resolves `pg` by
  `createRequire(projectRoot)` and then does `await import(absolutePath)`, which for `pg`'s CommonJS
  entry returns `{ default, 'module.exports', native }` with **no named `Pool`**. The code does
  `const { Pool } = pgModule` → `undefined` → `Pool is not a constructor`. This is unconditional for
  every `node-postgres` project, not specific to this repo. Two further problems even if it ran:
  `pg` is an *optional* peer, so npm never installs it and a global install cannot reach the
  project's `node_modules`; and npm's `github:` install path corrupted the global tree (it has no
  `build`/`prepare` script, so the cloned `dist/` is the only build output). Even working, its
  `execute_query` and `drizzle_run_migrations` tools would hand an agent raw SQL and unapproved
  migration execution, defeating hard rule 3. Use the vendored `drizzle-orm` skill instead.

## The vendored `drizzle-orm` skill — reference only, and it is overridden here

A third-party skill is installed at `.agents/skills/drizzle-orm` (symlinked into
`.claude/skills/drizzle-orm`; from `oakoss/agent-skills`, MIT, v1.1, sourced from the official
Drizzle docs; installer risk scan: Gen **Safe**, Socket **0 alerts**, Snyk **Low Risk**).

It is a genuinely good **API reference** — relations, views, filters, advanced queries — and it is
correct on the things that usually go wrong: no `{ mode: "number" }`, no `drizzle-orm-pg`, no
`generate:pg`, no `.delete(`/`.update()` anti-patterns.

**This file wins wherever the two disagree.** Specific known conflicts:

- **It presents `drizzle-kit push` as a routine command.** `SKILL.md` lists it in a command table
  and `references/migrations.md` runs `npx drizzle-kit push` twice as a normal step. Here it is
  **approval-gated** (hard rule 3) because it bypasses migration history. Do not follow it.
- **It is multi-dialect and driver-agnostic** (PostgreSQL / MySQL / SQLite). This repo is
  **node-postgres** (`pg`, `drizzle-orm/node-postgres`) only — ignore `postgres-js`, `better-sqlite3`,
  and the MySQL/SQLite sections.
- It contains one incidental Prisma mention in prose. It is not a dependency, tool, or codepath and
  nothing may import it.
- Prefer the project conventions below over its examples for anything touching money, lifecycle
  columns, archival, or deletion.

Verified before install, per `.opencode/ai-workflow.json` rules: pure markdown, no `scripts/`, no
executable code, no network calls, no credential handling.

## The pipeline

```
src/db/schema/<module>.ts     AUTHORED TypeScript — edit the module that owns the table.
src/db/schema/index.ts        The barrel; all 22 modules are re-exported here (hard rule 5).
        │ pnpm db:generate    (schema -> SQL; touches no database)
        ▼
drizzle/0000_<name>.sql       GENERATED migration SQL, one file per migration. Committed.
drizzle/meta/                 GENERATED 0000_snapshot.json + _journal.json. Committed.
        │ pnpm db:migrate     (applies pending SQL; WRITES to the database)
        ▼
PostgreSQL
```

One migration exists today: `drizzle/0000_steady_johnny_blaze.sql` (145 `CREATE TABLE`s), generated,
`db:check`-clean and **applied** to the local database (2026-10-06). See “Current state” below.

`src/db/client.ts` — the essential source (the real file adds a `globalThis` cache so Next.js dev
hot-reload does not open a fresh `pg.Pool` on every edit, plus a dev-only guard against a second
instantiation):

```ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { readDatabaseUrl } from "./env";
import * as schema from "./schema";

export const db = drizzle(readDatabaseUrl(), { schema });
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

Three details that are easy to get wrong: the driver entry is
`drizzle-orm/node-postgres` (**not** `drizzle-orm/better-sqlite3` or `…/postgres-js`), `drizzle()`
accepts the connection string **directly**, and the schema is passed as a second argument.

**`db.transaction(fn)` already exists on this client** — `await db.transaction(async (tx) => { … })`
with `tx` typed as the exported `DbTransaction`. Do not hand-roll a transaction helper.

`drizzle.config.ts` sets `dialect: "postgresql"` and points `schema` at the single file
`./src/db/schema/index.ts`.

## Commands that exist

| Intent | Command | Writes to DB? |
|---|---|---|
| Turn schema changes into SQL migrations | `pnpm db:generate` | No |
| Apply pending migrations | `pnpm db:migrate` | **Yes** |
| Sync the database to the schema, no migration files | `pnpm db:push` | **Yes** |
| Check migration-file consistency — no database needed | `pnpm db:check` | No |
| Derive a schema from an existing database | `pnpm db:introspect` | No |
| Browse data | `pnpm db:studio` | No |

`pnpm verify` runs `typecheck`, `lint`, `test`, **and** `db:check`. **No drift gate exists in this
stack.** `db:check` never touches a database — it only verifies that the generated migration
history is internally consistent, not that any live database matches `src/db/schema`.

## Capabilities that do not exist here

Do not invent equivalents for these, and do not import code that assumes them:

- **There is no signed contract, and no `db:verify` / `db:sign`.** Drizzle has no schema signature,
  so nothing prevents a database from drifting away from `src/db/schema` without a migration file.
  The substitute is discipline: every schema change goes through `db:generate` + a committed
  migration, and `db:migrate` is the only thing applied to a real database. **`db:push` bypasses
  migration history** — prefer it for throwaway local experiments only.
- **There is no `db:init`, `db:update`, `migration:new`, `migration:status`, or `migration:list`.**
- **There is no seed hook.** The repository has no `scripts/` directory. Author seed data against
  `db` from `src/db/client.ts` and wire an explicit script if it is ever needed.
- **`db.query.<table>` only exists for tables re-exported from `src/db/schema/index.ts`.** The
  schema is not empty (145 tables), but a table declared in its own module and missing from the
  barrel is invisible to `db.query` and to migrations alike.

## Conventions

Declare tables with `pgTable` and pass indexes and table-level constraints as an **array** in the
third argument — the object form from older Drizzle examples is not what the current API takes.

```ts
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, uniqueIndex, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

export const lifeCycleStatus = pgEnum("life_cycle_status", ["Active", "Graduated", "Withdrawn"]);

export const student = pgTable(
  "student",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    admissionNumber: varchar("admission_number", { length: 32 }).notNull(),
    lifecycle: lifeCycleStatus("lifecycle").notNull().default("Active"),
    guardianId: uuid("guardian_id"),
    // Self-reference or a cycle needs the explicit column type.
    linkedGuardianId: uuid("linked_guardian_id").references((): AnyPgColumn => student.id),
  },
  (t) => [
    uniqueIndex("student_admission_number_key").on(t.admissionNumber),
    index("student_lifecycle_idx").on(t.lifecycle),
    // Partial index: use .where(sql``) — this is how "at most one open row of X" is enforced.
    uniqueIndex("student_one_live_guardian_key").on(t.guardianId).where(sql`is_primary`),
    check("student_lifecycle_not_null", sql`${t.lifecycle} is not null`),
  ],
);
```

- **Table and column names are explicit snake_case strings.** Never rely on Drizzle inferring them
  from the property name.
- **Primary keys are `uuid`s** — the single-key form is `primaryId()` from `_conventions.ts`
  (uuid, `defaultRandom`). 9 tables use a composite natural key built from their uuid columns
  (plus a date or month, e.g. `student_placements (student_id, academic_session_id)`), and 3 child
  tables key directly on their `user_id uuid` foreign key. There are no autoincrement integers
  anywhere; do not add one.
- **`numeric` is read back as a JS `string`** by default, which is what keeps money exact. See
  `src/shared/money/money.ts` — money is a `bigint` count of minor units, scale 2, never a float.
  Do not pass `{ mode: "number" }`.
- **Lifecycle status and archival state are different axes** (`DOMAIN-MODEL.md` D-4). Keep a
  constrained enum for lifecycle and a separate nullable timestamp for archival; do not collapse
  them into one `status` column.
- **Never hard-delete financial or academic rows** (`RULES.md` §36 Financial Data Rule, §79 Soft
  Delete / Archival). Deletion is a status change (`archived_at` / lifecycle) plus an entry in
  `audit_events` — never a dropped row.

## Layer boundaries

`src/db/**` is infrastructure. The domain layer must not import Drizzle or `pg` — see
`src/modules/README.md`, which lists the forbidden imports. A domain module expresses what it needs;
`infrastructure/` supplies it.

## Current state: schema authored, baseline applied

The schema is **complete, not empty**: `src/db/schema/index.ts` is the barrel of **22 modules
defining 145 `pgTable`s**. `pnpm db:generate` has produced the baseline migration
`drizzle/0000_steady_johnny_blaze.sql` (145 `CREATE TABLE`s) plus its snapshot and journal under
`drizzle/meta/`, and `pnpm db:check` passes.

The baseline **has been applied** (`pnpm db:migrate`, 2026-10-06). The database
(`scholars_sms_database`) has **145 tables and 45 enums**, with one row in
`drizzle.__drizzle_migrations`. Future migrations still require explicit approval before
`pnpm db:migrate` runs (hard rule 3). Decisions D-1 through D-9 (`DOMAIN-MODEL.md`) and ADRs
`adr/0001`–`adr/0004` constrain the schema; read them before writing or altering a table.

## Database

Dedicated container `scholars-postgres` (`postgres:17-alpine`, currently running), host port
**5433** — matching the `DATABASE_URL` committed in `.env.example` and `compose.yaml`. Port 5432
is the other project's (`aims-postgres`, currently stopped and unmapped): that container must
never be migrated or reset. Database `scholars_sms_database`, role `user`. Start with
`docker start scholars-postgres`.

A committed **`compose.yaml` exists** (`postgres:17-alpine`, host port **5433**, named volume
`scholars_pgdata`, `pg_isready` health check) and was deliberately **not** used to replace the ad hoc
container: the container already owns that name and port and has an *anonymous* volume, so running
Compose beside it would conflict and orphan that data. Migrating to Compose needs explicit approval
plus a volume copy.

## Hard rules

1. **Never edit anything under `drizzle/` by hand.** It is `drizzle-kit` output, committed to
   history. Change `src/db/schema` and re-run `pnpm db:generate`.
2. **Every schema change gets a generated migration** in the same commit as the `pgTable` change.
   A table edit without a migration file is how a deployed database silently drifts.
3. **Do not run `db:migrate` or `db:push` without explicit approval.** Both write to the database.
   `db:generate`, `db:check`, and `db:introspect` are safe and are the default verification path.
4. **`src/db/` is tracked in git.** It is still worth copying to `/tmp` before a large edit, but a
   deletion is recoverable from history.
5. **A table is not part of the schema until `src/db/schema/index.ts` re-exports it.**
