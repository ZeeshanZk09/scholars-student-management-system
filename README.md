# Scholars Student Management System

School management system for academic administration — students, staff, attendance,
examinations, fees, and notices, organised per institution.

> **Status: scaffold, no features yet.** The architecture is being rebuilt. There is no
> working feature set yet — no routes, no auth, no database queries. The data layer *is* complete:
> 145 tables are authored in `src/db/schema/` and the baseline migration is applied to the local
> dev database (145 tables, 45 enums) — but no application code issues queries yet. Do not assume
> any feature is implemented because it is described in `PRD.md`.

## Read this first

**[`MEMORY.md`](./MEMORY.md)** is the verified knowledge map: exact installed versions, the
Drizzle workflow, the domain model, the traps, and the open questions. Read it
before planning any work. When it disagrees with the docs, `MEMORY.md` and `src/` are correct.

## Stack

| | |
|---|---|
| Framework | Next.js 16.3.6 (App Router, Turbopack) |
| UI | React 19.2.8, Tailwind CSS v4, shadcn/ui (`base-lyra` style, Base UI primitives) |
| Icons | `@phosphor-icons/react` (not Lucide) |
| Data | Drizzle ORM (`drizzle-orm` + `drizzle-kit` + `pg`) — hand-written schema, PostgreSQL |
| Forms | React Hook Form 7.89.0 + Zod 4.6.5 |
| Tables / charts | TanStack Table 9.2.4 / Recharts 3.10.1 |
| State | Server Components primary; Zustand only where required |
| Tests | Vitest 5.0.2 + Playwright 1.63.0 |
| Toolchain | TypeScript 5.9.3, Node 26.8.1, **pnpm** 12.6.0 |

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

A dedicated PostgreSQL container is configured through `DATABASE_URL`:

```bash
docker start scholars-postgres     # host port 5433
```

A committed `compose.yaml` also defines this database, but it is **not started**: the ad hoc
`scholars-postgres` container already owns that name and port and holds an anonymous volume.
Migrating to Compose needs an explicit decision plus a volume copy first.

Database `scholars_sms_database`, role `user`, holds the **applied baseline** — 145 tables and 45
enums from `drizzle/0000_steady_johnny_blaze.sql` (applied 2026-10-06 via `pnpm db:migrate`, row
recorded in `drizzle.__drizzle_migrations`). No application code issues queries yet. Port 5432 is
used by an unrelated container; this project must not touch it.

## Commands

```bash
pnpm dev            # dev server
pnpm build          # production build
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest — 124 tests, 8 files (shared/* + db/* + lib/utils)
pnpm test:e2e       # playwright — 1 smoke test in e2e/smoke.spec.ts
pnpm verify         # typecheck + lint + test + db:check
```

### Database (Drizzle ORM)

The data layer is **Drizzle ORM** with `drizzle-kit` and the `pg` driver. The schema is
**hand-written TypeScript** across `src/db/schema/*.ts` (22 domain modules re-exported by the
`index.ts` barrel) — there is no schema DSL file and no
generated client, so `tsc` reads your tables directly and there is no emit step to forget.

```bash
pnpm db:generate      # schema -> SQL migration in drizzle/   <- after ANY schema edit
pnpm db:check         # migration-file consistency (no database required)
pnpm db:migrate       # apply pending migrations               <- WRITES to the database
pnpm db:push          # sync schema directly, no migration files <- WRITES, local only
pnpm db:introspect    # derive a schema from an existing database
pnpm db:studio        # browse data
```

`db:generate` and `db:check` never touch the database. `db:migrate` and `db:push` do — use them
deliberately, and prefer `db:migrate` so migration history stays authoritative.

Full details, including the commands that no longer exist, are in
[`MEMORY.md` §3](./MEMORY.md) and the `drizzle-workflow` skill.

## Domain model — 145 tables

`src/db/schema/` holds 22 domain modules plus shared conventions, enums and a generated
`relations.ts`. `index.ts` re-exports all of them, so `db.query` is available. The baseline
migration creates 145 tables, 378 foreign keys and 364 check constraints; `pnpm db:check` passes
and `src/db/schema/schema-contract.test.ts` asserts the invariants that would otherwise only fail
at `CREATE TABLE` time — a nullable column in a primary key, a foreign key targeting a non-unique
column, a money column that is not `numeric(18,2)`, or a money row that cannot reach a currency.

There are **no feature queries yet**: nothing calls `db.query.*`, so the relation map has never been
exercised against a live database.

The previous design had 20 models around this spine, and `RULES.md` + `.opencode/ai-workflow.json`
still mandate its terminology — so the rebuild should preserve it:

```
Institution → AcademicSession → Class → Group → Section
```

`Group` sits **above** `Section`. The previous 20-model source is **gone** — its `/tmp` backup was
lost when `/tmp` was cleared and the contract was never committed, so only its shape is recorded.
Summary in [`MEMORY.md` §5](./MEMORY.md).

## Agent instructions

Agents working in this repo should read, in order:

1. `AGENTS.md` — generated Next.js rules. **It requires reading `node_modules/next/dist/docs/`
   before writing Next.js code.** This Next.js version has breaking changes.
2. `.opencode/ai-workflow.json` — execution workflow, change-safety rules, approved stack.
3. `MEMORY.md` — verified reality.
4. `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `SOPs.md`, `DESIGN.md` — intent.

Project skills live in `.opencode/skills/`; the most relevant are `scholars-project` and
`drizzle-workflow`.

## Known issues

- **No seed script exists.** There is no `scripts/` directory, and `drizzle-kit` has no `seed`
  subcommand. If you need seed data, author it against `db` from `src/db/client.ts` and wire an
  explicit `package.json` script.
- **There is no schema-drift gate.** Drizzle has no way to prove a live database matches the
  schema — `db:check` only validates migration files. Every table change must ship its generated
  migration in the same commit. See `MEMORY.md` §3.
- `src/` is committed to git, so deletions there are recoverable. Copy a file to `/tmp` before a
  large overwrite anyway — but note `/tmp` is **not** durable; the two backups taken during the
  rebuild were both lost when it was cleared.
- `compose.yaml` exists and validates, but `scholars-postgres` still runs ad hoc, because the
  container already owns that name and port with an anonymous volume. Migrating to Compose needs
  approval and a volume copy.
- `pnpm-lock.yaml` intentionally contains **two YAML documents** (a pnpm bootstrap stub, then
  the real project resolutions). `--frozen-lockfile` passes. Do not "fix" it.
- `pnpm test` runs **124 tests across 8 files**, and `--passWithNoTests` is not set anywhere, so an
  empty suite cannot go green. `pnpm test:e2e` passes — 1 smoke test in `e2e/smoke.spec.ts`.


## License

Private.
