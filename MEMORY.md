# MEMORY.md — Project Knowledge Map

> **Purpose.** Durable, version-verified knowledge for this repository. Read this before
> planning work. It records *verified* facts (checked against `node_modules` and the CLI),
> not assumptions. When reality contradicts this file, reality wins — fix this file.
>
> **Last verified:** 2026-09-30 (third pass: Phase 0 baseline for `PHASES.md`, plus proof that the
> archived 20-model contract is valid and reproducible) · Next.js 16.3.6 · Prisma 8.0.0-rc.17 ·
> Node 26.8.1 · pnpm 12.6.0 · OpenCode 1.18.33
>
> All gates re-run green this pass: `pnpm typecheck`, `pnpm lint`, `pnpm test` (5/5),
> `pnpm build`, `pnpm migration:check`, `pnpm db:verify`
> (connects; `Marker missing` as expected). `pnpm test:e2e` **fails** (`Error: No tests found`)
> — no Playwright tests exist yet. Current phase state: **§17**.
>
> **Schema status: the contract has been intentionally wiped to empty** for an architecture
> rebuild. There are no models and no migrations. See §1 and §5.

---

## 1. Project state

**Status: scaffold / pre-architecture.** The app renders an empty home page. There are no
feature routes, no auth, no API routes, no server actions, and no database queries.
`src/components/ui/**` is a shadcn component library that nothing imports yet.

**The data layer has been reset for the rebuild:** `src/prisma/contract.prisma` holds no
models, `contract.json` / `contract.d.ts` are regenerated with no models, `migrations/` is
removed, and the dedicated database is empty and unsigned. The previous 20-model design is
archived in a checksummed backup — see §5. Everything below is ready for schema work to
begin, but no schema work should start until asked.

**The architecture is being rebuilt from scratch.** Treat the docs (`PRD.md`,
`ARCHITECTURE.md`, `RULES.md`, `SOPs.md`, `DESIGN.md`, …) as *intent*, and this file plus
`src/` as *reality*. Where they disagree, `src/` wins — but raise the conflict rather than
silently picking one.

`git log` has a single commit (`a7f608e Initial commit from Create Next App`). Only four
files are tracked under `src/` (`app/globals.css`, `app/layout.tsx`, `app/page.tsx`,
`app/favicon.ico`). **Everything else in `src/` is untracked** — a deletion is unrecoverable
via git. See §13 (Repository traps).

---

## 2. Verified dependency versions

Read from `node_modules/*/package.json`, not from range specifiers in `package.json`.

| Package | Installed | Declared |
|---|---|---|
| `next` | **16.3.6** | `16.3.6` |
| `react` / `react-dom` | **19.2.8** | `19.2.8` |
| `typescript` | **5.9.3** | `^5` |
| `prisma` (CLI) | **8.0.0-rc.17** | `8.0.0-rc.17` |
| `@prisma/orm-postgres` | **8.0.0-rc.12** | `8.0.0-rc.12` |
| `@prisma/cli-engine` | **0.6.1** | `0.6.1` |
| `@prisma/client` | **not installed** | **removed** — see trap 1 |
| `@base-ui/react` | **1.8.0** | `^1.8.0` |
| `class-variance-authority` | **0.7.1** | `^0.7.1` |
| `shadcn` | **4.21.0** | `^4.21.0` (build-time: `globals.css` imports `shadcn/tailwind.css`) |
| `tw-animate-css` | **1.4.0** | `^1.4.0` (build-time: imported by `globals.css`) |
| `cn` | **0.4.0** | `^0.4.0` (shadcn's own class-merge package, not `clsx`+`tailwind-merge`) |
| `zod` | **4.6.5** | `^4.6.5` |
| `react-hook-form` | **7.89.0** | `^7.89.0` |
| `@tanstack/react-table` | **9.2.4** | `^9.2.4` |
| `zustand` | **5.0.15** | `^5.0.15` |
| `tailwindcss` | **4.3.3** | `^4` |
| `vitest` | **5.0.2** | `^5.0.2` |
| `@playwright/test` | **1.63.0** | `^1.63.0` |
| `@phosphor-icons/react` | **2.1.10** | `2.1.10` (pinned) |

Several packages are **declared ahead of use** because the stack is pre-installed per
`TECH-STACK.md` / `.opencode/ai-workflow.json` (`zod`, `react-hook-form`, `zustand`,
`@tanstack/react-table`, `recharts`, `date-fns`, `cmdk`, `next-themes`, `react-day-picker`,
`sonner`, `@hookform/resolvers`). That is intentional, not drift.

**Three traps:**

1. **`@prisma/client` was removed (2026-09-30).** It was Prisma 7, declared, and completely
   unused. The 8.x runtime is `@prisma/orm-postgres`, used as
   `postgres<Contract>({ contractJson, url })` from `src/prisma/db.ts`. Nothing under `src/`
   imports `@prisma/client`. Do not re-add it, and do not use `new PrismaClient()`. The
   dependency was approved for removal and is no longer installed.
2. **Icons are Phosphor, not Lucide.** `lucide-react` is *not installed*.
   `components.json` sets `iconLibrary: "phosphor"`, and 12 files under `src/components/ui/`
   import `@phosphor-icons/react`. shadcn components here use `Icon` suffixed exports
   (`ListIcon`, `BellIcon`, `CheckIcon`) — that is the `@phosphor-icons/react` v2 API.
3. **Class merging is the `cn` package, not `clsx` + `tailwind-merge`.** Neither of those is
   installed. `src/lib/utils.ts` is a one-line re-export: `export { cn } from "cn"`.


**UI primitive library is Base UI, not Radix.** `components.json` uses `style: "base-lyra"`;
components import from `@base-ui/react/*`. Do not reach for `@radix-ui/*` unless the style is
migrated deliberately.

---

## 3. Prisma 8 — contract-based workflow (highest-risk area)

This project is on **Prisma 8 release candidates**, which replaced `schema.prisma` + generated
client with an authored **contract** and emitted artifacts. Prisma 7 knowledge is actively
misleading here.

### Mental model

```
src/prisma/contract.prisma   ← AUTHORED source (PSL). The only file you edit.
        │  prisma contract emit
        ▼
src/prisma/contract.json     ← GENERATED. Never hand-edit.
src/prisma/contract.d.ts     ← GENERATED. Never hand-edit.
        │  prisma migration new / plan
        ▼
migrations/<contractHash>/   ← snapshot + ops.json + migration.ts
                                    (NONE currently exist)
        │  prisma db init | update | migrate   (live database)
        ▼
   signed database
```

`src/prisma/db.ts` is the runtime accessor:

```ts
// src/prisma/db.ts — actual source
import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

export const db = postgres<Contract>({
  contractJson,
  url: process.env["DATABASE_URL"]!,
});
```

Note it imports from `./contract.d` (not `./contract`) **and** loads `contract.json` at
runtime. Both are generated artifacts, so both must exist and stay in sync with the source.
Three easy-to-miss details: `postgres` is a **default** import from
`@prisma/orm-postgres/runtime` (not a named one), and it takes an **options object**
`{ contractJson, url }` — not a bare URL string.

### The query API is a fluent builder — NOT `findMany`/`findUnique`

**This is the single most common way to get Prisma 8 wrong.** There is no `db.user.findMany()`,
no `db.user.findUnique()`, no `$queryRaw` shortcut via a generated client, and no
`new PrismaClient()`. Verified by reading the installed type definitions in
`@prisma/orm-family-sql/dist/orm-client.d.mts`.

Models live under a **namespace**, and the default one is `public`:

```ts
import { db } from "@/prisma/db";

const users = await db.orm.public.User.all();          // read terminal
const alice = await db.orm.public.User.first({ email: "a@b.com" });
const active = await db.orm.public.User
  .where((u) => u.active.eq(true))                     // callback form
  .orderBy((u) => u.createdAt.desc())
  .limit(20)
  .all();
```

Shape of the builder:

| Category | Methods |
|---|---|
| **Builders** (chainable) | `where` · `select` · `include` · `orderBy` · `groupBy` · `limit` · `offset` · `cursor` · `distinct` · `distinctOn` · `variant` |
| **Read terminals** | `all()` · `first()` · `aggregate()` |
| **Write terminals** | `create` · `createAll` · `createAndCount` · `upsert` · `update` · `updateAll` · `updateAndCount` · `delete` · `deleteAll` · `deleteAndCount` |

Four rules that are **compile errors** if broken, so let TypeScript catch them:

1. **`update()`, `delete()`, `updateAll()`, `deleteAll()` and friends REQUIRE a prior
   `.where(...)`.** An unfiltered collection makes the call a type error — this is deliberate,
   so you can never accidentally mutate a whole table.
2. `limit()` / `offset()` on a `groupBy` require a prior `orderBy()`; `cursor()` and
   `distinctOn()` likewise require a sort order to be defined.
3. `distinctOn()` additionally requires the `postgres.distinctOn` capability. The **current
   emitted contract declares it** (`contract.json → capabilities.postgres.distinctOn === true`).
4. `upsert` and `distinctOn` are **not supported on MTI variants**; use `createAll` there.

`.all()` returns a value that is **both awaitable and async-iterable** — `await` collects an
array, `for await` streams. Consume it only once.

Full annotated examples (including nested relation create/connect, `include` refinements, and
`groupBy` aggregates) live in the installed
`node_modules/@prisma/orm-family-sql/dist/orm-client.d.mts` doc comments. Read them there
rather than guessing.

**Namespaces are real.** `contract.json → domain.namespaces.public` and
`contract.d.ts → models.public` both exist today with **zero models**, which is why
`db.orm.public.User` is a type error *right now* — there is no `User`. It becomes valid the
moment you add the model to the contract and re-emit.

`prisma.config.ts` wires `dotenv/config`, points `contract` at
`./src/prisma/contract.prisma`, and takes the connection from `process.env.DATABASE_URL`.

### Commands that exist (verified against `prisma --help`)

| Task | Command |
|---|---|
| Emit artifacts after editing the contract | `pnpm contract:emit` |
| Normalize the contract source | `pnpm contract:format` |
| Derive a contract from an existing DB | `pnpm contract:infer` |
| Integrity check (no DB needed) | `pnpm migration:check` |
| List / inspect migrations | `pnpm migration:list`, `pnpm migration:status` |
| Scaffold / plan a migration | `pnpm migration:new`, `pnpm migration:plan` |
| Bootstrap a DB to match the contract + sign | `pnpm db:init` |
| Advance schema / apply migrations | `pnpm db:update`, `pnpm db:migrate` |
| Verify live DB matches contract | `pnpm db:verify` |
| Sign the database | `pnpm db:sign` |
| Inspect live schema | `pnpm db:schema` |

### Commands that DO NOT exist — never suggest them

`prisma generate` · `prisma migrate` · `prisma migrate dev` · `prisma db push` ·
`prisma studio` · `prisma db seed`

Note `prisma migration` is **singular**, and `prisma db migrate` is its own subcommand.

### Invariants

- **Always run `pnpm contract:emit` after editing `contract.prisma`.** Skipping it leaves the
  emitted artifacts describing a different model than the source, and TypeScript will silently
  type-check against the stale artifact. **This is now enforced automatically:**
  `src/lib/contract-integrity.test.ts` emits to a temp directory and compares `storageHash`
  against the committed `contract.json`, so drift fails `pnpm verify`.
- The emitted `storageHash` for the **current empty contract** is
  `0c0734babd6eeb868fee1f281ca96963022475611560e9f170f465daa35f8599`. It changes as soon as
  the first model is added, and migration directories are named after it.
- **There are currently no migrations.** `migrations/` was removed during the wipe. The old
  `20260928T2054_init` migration declared no operations (`ops.json` was `[]`), so nothing was
  lost. `pnpm migration:check` passes with zero models and zero migrations.
- `contract.json` is currently 1.2 KB and `contract.d.ts` ~15 KB — both contain **no models**
  but both still export `type Contract`, which is why `src/prisma/db.ts` still type-checks.
- Prisma manages its own agent skills via `pnpm prisma:skills` (`prisma skills sync`).
  These are copied into `.claude/skills`, `.cursor/skills`, `.agents/skills`, `.devin/skills`.
  That four-way duplication is **intended by Prisma**, not drift — do not prune it.

---

---

## 4. Next.js 16.3.6 — version-specific behavior

`next`, `eslint-config-next`, and `react`/`react-dom` are all pinned to exact versions
(`16.3.6` / `19.2.8`). **This major version has breaking changes relative to most training
data.** Everything below was read from the bundled guide at
`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — read it directly
before writing App Router code rather than relying on recall.

### Breaking changes that will bite

| Area | In 16.3.6 |
|---|---|
| **Request APIs are async-only** | `cookies()`, `headers()`, `draftMode()`, and `params` / `searchParams` in `page`/`layout`/`route`/`default` must be `await`ed. The temporary sync compatibility from v15 is **removed** — `const { cookies } = await ...`. |
| **`middleware` → `proxy`** | `middleware.ts` and the exported `middleware` name are deprecated in favour of `proxy.ts` / `proxy()`. Config keys follow (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`). This project has no middleware yet. |
| **`next lint` removed** | `next lint` no longer exists and **`next build` no longer runs ESLint**. This is why `package.json` has a standalone `lint` script and why `pnpm verify` must call it explicitly. |
| **Caching** | `revalidateTag()` now **requires a second argument** naming a `cacheLife` profile; the 1-arg form is deprecated and is a TypeScript error. `updateTag()` and `refresh()` exist. `cacheLife` / `cacheTag` are **stable** — drop any `unstable_` prefix. |
| **Removed config** | `serverRuntimeConfig` / `publicRuntimeConfig` are gone (use env vars). The `eslint` key in `next.config.ts` is removed. `experimental.dynamicIO` and `experimental.useCache` are removed. |
| **`next/image`** | `images.domains` and `next/legacy/image` are deprecated. `imageSizes` no longer includes `16`; `minimumCacheTTL`, `qualities` defaults changed; local images with query strings and local-IP restriction are breaking. |
| **Turbopack is default** | Both `next dev` and `next build` use Turbopack. Opt out per-command if needed. `next.config.ts` here sets `reactCompiler: true` and `babel-plugin-react-compiler@1.0.0` is installed, so React Compiler support is active. |
| **Removed features** | All AMP APIs removed. Partial Prerendering is available. Concurrent `dev` and `build` is supported. `unstable_rootParams` removed → use `next/root-params`. |
| **Node floor** | Node.js **20.9+** (Node 18 unsupported). |

### Conventions for this repo

- **App Router only.** `src/app/` holds `layout.tsx`, `page.tsx`, `globals.css`. There are no
  `route.ts` handlers and no Server Actions yet — do not assume either exists.
- `components.json` sets `"rsc": true`, so UI components are Server Components by default.
  Add `"use client"` only where interactivity requires it.
- `.next/dev/types/**/*.ts` is included in `tsconfig.json`, so route types are generated.
  Stale validator types have broken `tsc` before (a deleted page left a dangling import) —
  fix with `rm -rf .next`.
- `next typegen` can generate `PageProps` / `LayoutProps` helpers once dynamic routes exist.
- **`public/` is empty** and **`src/app/favicon.ico` has been deleted** (staged for deletion in
  git). `src/app/` now holds only `globals.css`, `layout.tsx`, and `page.tsx`. There is no
  favicon and no static asset of any kind.

---

## 5. Domain model — CURRENTLY EMPTY

`src/prisma/contract.prisma` contains only the directive line and **no models**:

```prisma
// use prisma-8
```

There is no `generator` or `datasource` block — Prisma 8 contracts do not need one, and the
connection comes from `prisma.config.ts` / `process.env.DATABASE_URL`.

This was done deliberately, to start the architecture rebuild from a clean contract, clean
generated types, and an empty database. **`pnpm migration:check` passes in this state.**

### The previous 20-model design is archived, not lost

The contract previously defined 20 models. A checksummed backup of the source, both generated
artifacts, and the old migration tree is at:

```
/tmp/opencode/contract-backup-20260930-144738/
  contract.prisma   contract.json   contract.d.ts   migrations.tar   SHA256SUMS
```

The design it encoded:

```
Institution
  └── AcademicSession        (isCurrent marks the active session)
        └── Class             (gradeLevel)
              └── Group       ← Group is ABOVE Section
                    └── Section  (capacity)
```

Models: `Institution`, `AcademicSession`, `Class`, `Group`, `Section`, `Student`,
`ParentGuardian`, `GuardianLink`, `User`, `Role`, `Permission`, `Attendance`, `Subject`,
`Examination`, `StudentResult`, `FeeStructure`, `StudentFee`, `Payment`, `Notice`,
`Notification`.

**Reuse that shape when rebuilding.** `RULES.md` and `.opencode/ai-workflow.json` mandate the
`Class → Group → Section` wording, so the rebuild must preserve that three-level chain or the
docs will need revising. Two gaps worth fixing in the rebuild: the old design used free-form
strings for every `status`/`type` field instead of enums or boundary validation, and money was
stored without a shared value type.

### The archive is verified good (2026-09-30)

The backup was **not** corrupt and the contract **does** parse. Emitting
`contract-backup-20260930-144738/contract.prisma` from the repo's own Prisma CLI reproduces
`storageHash a1aaf73d1151957ef8c8efe0d9a2e6f08ad8a5ab444d260bbba87b4c9c291909` and a
**byte-identical `contract.json`** (`d0437d85…`, matching `SHA256SUMS`). Treat it as a usable
starting point, not a sketch. `contract.d.ts` is not byte-identical — it is not covered by
`storageHash`, so ignore that difference. To reproduce it, copy `prisma.config.ts` from the repo
into a scratch dir and symlink `node_modules`; running bare `npx prisma` outside the repo tries
to download the CLI and hangs.

One silent defect found: `Attendance` declares
`@@ unique([studentId, date, academicSessionId, classId, groupId, sectionId])` intending to
prevent duplicates, but the emitted model has **no** `uniques` and no `keys` — the constraint
does not reach the database. (Prisma 8 PSL does accept the whitespace in `@@ unique`; that is
not the cause.) Any rebuilt attendance design needs this uniqueness expressed differently and
verified in the emitted JSON.

Note: `/tmp` is not durable. Move the backup somewhere permanent before relying on it.

---

## 6. Commands that actually work

```
pnpm install          # pnpm only — see §13
pnpm dev              # next dev
pnpm build            # next build (Turbopack)
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # vitest run
pnpm test:e2e         # playwright test (needs a browser install + dev server)
pnpm verify           # typecheck + lint + test
pnpm contract:emit    # regenerate Prisma artifacts
pnpm migration:check  # migration integrity (no DB required)
```

### Database: available, and deliberately empty

A dedicated container is running:

| | |
|---|---|
| Container | `scholars-postgres` (`postgres:17-alpine`, restart `unless-stopped`) |
| Host port | **5433** (5432 is already taken by `aims-postgres`, a different project) |
| Database | `scholars_sms_database` |
| Role | `user` (from `.env`) |
| URL | `postgresql://user:***@localhost:5433/scholars_sms_database?schema=public` |

`pnpm db:verify` reaches it and reports **`Marker missing`** — correct and expected: the
database is unsigned and contains **0 tables**, because the contract was wiped and the schema
was deliberately not applied.

**A committed `compose.yaml` now exists** (`postgres:17-alpine`, host port **5433**, named volume
`scholars_pgdata`, `pg_isready` health check). It makes the environment reproducible and
`docker compose config` validates. It was deliberately **not started**: the ad hoc container
`scholars-postgres` already owns that container name and port, and has an **anonymous** volume,
so starting Compose alongside it would conflict and orphan that data. Migrating to Compose
requires explicit approval and a volume copy first.

**Do not confuse it with `aims-postgres`**, which occupies port 5432 and holds another
project's `aims_school` database. That container is not this project's and must not be
migrated, reset, or "clean".

Start the existing container with `docker start scholars-postgres`.

---

---

## 7. Database (PostgreSQL)

- **Provider:** PostgreSQL ≥ 15. In `contract.json` this is split across two fields, and the
  distinction matters: **`targetFamily` is `"sql"`** (the ORM family Prisma targets) while
  **`target` is `"postgres"`** (the concrete database). Do not read `targetFamily` as the
  database name. The CLI never connects without explicit consent; `--probe-db` opts `init`
  into a version check.
- **Connection:** `prisma.config.ts` → `process.env.DATABASE_URL`, loaded via `import 'dotenv/config'`.
  `.env` is git-ignored; `.env.example` is the tracked template. **Never commit `.env`.**
- **Declared capabilities** (from `contract.json → capabilities`) — these gate which query
  builders type-check:
  - `postgres`: `distinctOn`, `jsonAgg`, `lateral`, `limit`, `orderBy`, `returning`
  - `sql`: `checkConstraint`, `enums`, `insertOnConflictSkip`, `insertOnConflictWithoutTarget`,
    `scalarList`, `returning`, `lateral`, `defaultInInsert`
  A builder requiring an absent capability becomes a **type error**, so these are the contract's
  own guardrails — not style preferences.
- **Naming:** snake_case tables/columns are conventional. `AcademicSession.isCurrent` marked the
  active session in the archived design — there is no automatic "current session" lookup, so
  queries must filter on it explicitly.
- **Multi-tenancy:** the archived design keyed everything under `Institution`, but there is no
  enforced RLS, no tenant-scoped session, and no `Institution` table today. Treat
  tenancy as **unimplemented**.
- **Money and enums:** the previous design stored money without a shared value type and used
  free-form strings for every `status`/`type`. **Fix both in the rebuild** — prefer a
  `Decimal`-based money type and real `enum`s over unvalidated strings.

**Migration rules**

1. Edit **only** `src/prisma/contract.prisma`.
2. Run `pnpm contract:emit` — the drift test in `src/lib/contract-integrity.test.ts` fails the
   build if you skip it.
3. `pnpm migration:check` must pass before any DB-touching command.
4. Migration directories are named after `contract.storageHash`
   (currently `0c0734ba…f8599` for the empty contract).
5. **There are no migrations yet.** Do not hand-create a `migrations/` tree.

---

## 8. UI conventions

- **shadcn with Base UI, not Radix.** `components.json` uses `style: "base-lyra"`; components
  import from `@base-ui/react/*`. **Do not introduce `@radix-ui/*`.**
- **Icons are `@phosphor-icons/react`** (pinned `2.1.10`) with `Icon`-suffixed exports
  (`ListIcon`, `BellIcon`). `lucide-react` is **not installed**.
- **`cn` comes from the `cn` package** (`src/lib/utils.ts` re-exports it). Neither `clsx` nor
  `tailwind-merge` is installed — do not import them.
- **Tailwind v4**, driven by `@tailwindcss/postcss`. There is **no `tailwind.config.js`**; the
  config lives in `components.json` + CSS. Tokens are CSS variables in `src/app/globals.css`.
- 31 components exist in `src/components/ui/` and **nothing imports them yet** — they are a
  pre-built library, not proof of existing UI. `header.tsx` and `user-menu.tsx` were deleted
  ahead of the rebuild and are not to be treated as expected files.
- Root layout already mounts `TooltipProvider` (Base UI) and `Toaster` (sonner) — extend the
  layout rather than re-wrapping.
- `DESIGN.md`, `MOBILE-FIRST-DESIGN-AND-PRINCIPLE-GUIDE.md`, and `PERFORMANCE.md` are the
  design authorities; read them before building UI rather than inventing patterns.

---

## 9. Authentication and authorization — NOT IMPLEMENTED

Stated plainly because inventing a design here would be the worst outcome:

- **No auth library is installed** — nothing in `package.json` (no `next-auth`/`auth.js`,
  `better-auth`, Clerk, Lucia, or Supabase auth) and **no auth import anywhere in `src/`**.
- **No middleware, no `proxy.ts`, no session handling, no RBAC.**
- `AGENTS.md` fact 4 and `.opencode/ai-workflow.json` both state: **do not add an auth package
  without explicit approval.**
- The archived data model had `User`, `Role`, `Permission` — **those tables no longer exist.**
  Their relationships are recorded in §5 as design intent, not as live schema.

**Consequence for future agents:** there is no authenticated route to protect, no "current user"
to read, and no permission helper to reuse. Choosing an auth solution is an **open decision**
(§16) that requires the user. When it is resolved, the archived `User`/`Role`/`Permission` shape
and `SECURITY.md` are the starting points.

---

## 10. Testing conventions

| Kind | Tool | Where | Command |
|---|---|---|---|
| Unit | Vitest 5.0.2 | `src/**/*.test.ts`, `environment: "node"` | `pnpm test` |
| E2E | Playwright 1.63.0 | `./e2e` (**does not exist yet**) | `pnpm test:e2e` |

- `vitest.config.ts` excludes `src/prisma/**` because it holds generated artifacts. The
  contract-integrity test therefore lives in `src/lib/`, not `src/prisma/`.
- `--passWithNoTests` / `--pass-with-no-tests` were **removed from both** `pnpm test` and
  `pnpm test:e2e`, so neither command can pass vacuously again.
  **`pnpm test:e2e` still fails** until `e2e/` exists — that is the intended signal, not a
  regression. Use `pnpm test` as the gate until E2E specs are written.
- Playwright's `testDir` is `./e2e`, deliberately **outside** `src/app` so the App Router never
  treats a spec as a route segment. Keep it there.
- `pnpm verify` = typecheck → lint → test. **`next build` no longer runs ESLint** (Next 16
  removed `next lint`), so lint must be invoked explicitly.
- Current baseline: **5 tests across 2 files.** There are no integration or E2E tests, and no
  coverage tooling is configured.

---

## 11. Agent workflow (how to work in this repo)

1. **Read `MEMORY.md` first** (this file). It is the verified-reality source of truth; the
   other docs (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `SOPs.md`, `DESIGN.md`, `PHASES.md`)
   are *intent*. **Where they disagree, `src/` wins — and say so rather than silently picking.**
2. **Skills:** two project skills are on disk but may not appear in the registry. Read
   `.opencode/skills/scholars-project/SKILL.md` and `.opencode/skills/prisma-8-workflow/SKILL.md`
   **by path**. Never load the archived Prisma 7 skills (`prisma-cli`, `prisma-client-api`,
   `prisma-database-setup`) — including their copies in `~/.agents/skills/`, which are **not**
   banner-marked.
3. **Never guess Prisma or Next.js APIs** — consult §3 (Prisma) and §4 (Next.js), then the installed type
   definitions under `node_modules/`.
4. **Verify before claiming done** (`pnpm verify`, `pnpm build`, and `pnpm contract:emit` after
   any `contract.prisma` edit). Evidence before assertions.
5. **`src/` is untracked** — copy a file to `/tmp` before overwriting it.
6. **Update this file** when reality changes. If you find a contradiction, fix the doc or raise
   it; never leave a stale claim behind, because the next agent will trust it.

### Superpowers — deliberately NOT installed

`obra/superpowers` is **not** installed (verified 2026-09-30: absent from `node_modules`, from
every skill root, and from `opencode.json`). The decision is intentional, and the reason is
**workflow conflict, not quality**:

- Its skills (`brainstorming`, `writing-plans`, `subagent-driven-development`) inject a second,
  competing methodology on top of `PHASES.md` and `.opencode/ai-workflow.json`, which already
  define the execution protocol this project is audited against. Two authorities = the exact
  ambiguity `PHASES.md:106` forbids.
- It assumes Git worktrees and a clean tracked tree are safe preconditions. **This repo's `src/`
  is untracked** — the worktree-based flow would silently "protect" nothing.
- Its useful parts are **already installed individually and better adapted**: TDD
  (`test-driven-development`), verification-before-claiming (`verification-before-completion`),
  systematic debugging, and code review are all present as standalone skills.

**Residual artifact of that removal:** two skills still referenced `superpowers:`-namespaced
skill IDs that resolve nowhere in this setup. Those references were repointed to the local
un-namespaced skills on 2026-09-30 — `systematic-debugging/SKILL.md` and
`test-driven-development/writing-good-tests.md`. Do not reintroduce the prefix.

---

## 12. Seeding — there is none

**There is no `scripts/` directory and no `scripts/seed.ts`.** An earlier revision of this file
(and of the `scholars-project` and `prisma-8-workflow` skills) described a broken seed file
with an infinite loop; that file has been deleted. Do not go looking for it and do not treat its
absence as a regression to restore.

There is also **no `prisma db seed` hook** — Prisma 8 does not discover or run a seed file for
you, and `prisma db --help` lists only `init`, `schema`, `sign`, `update`, `verify`, `migrate`.
If seed data is needed, author it against the contract runtime (`db` from
`src/prisma/db.ts`) and add an explicit `package.json` script yourself.

**`.next/dev/types/validator.ts` can hold stale route references.** A deleted page left a
dangling import that broke `tsc` even though the source was gone. Fix: `rm -rf .next`.

---

## 13. Repository traps

**`package-lock.json` was deleted (2026-09-30).** It was an npm lockfile describing an older
dependency set and it misled `node_modules` about what was declared. The project convention is
**pnpm** (`pnpm-workspace.yaml` + `packageManager: pnpm@12.6.0`). `pnpm-lock.yaml` is now the
only lockfile. The deletion is staged in the working tree but **not yet committed**.

**`pnpm-lock.yaml` contains two YAML documents, and that is correct.** Document 1 is a pnpm
bootstrap stub recording `packageManagerDependencies: pnpm@12.6.0`; document 2 (after the `---`
separator) holds the real `settings` / `importers` / `packages` / `snapshots`. pnpm 12.6.0
writes and reads this form and `pnpm install --frozen-lockfile` passes. **Do not "fix" it by
deleting the first document** — that removes `packageManagerDependencies` and makes pnpm fail
with `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE`. When checking whether a package is
locked, look in the **second** document's `importers` block.

**Undeclared dependencies broke clean installs — now fixed.** Four packages the build
genuinely needs were present in `node_modules` but in neither `package.json` nor
`pnpm-lock.yaml`: `@base-ui/react` (imported by 21 UI components), `class-variance-authority`
(6 components), and `shadcn` + `tw-animate-css` (both imported by `src/app/globals.css`).
They existed only in the stale `package-lock.json`, so a `--frozen-lockfile` install on any
other machine would have produced a broken build. **All four are now declared and locked.**
The general rule: `node_modules` is not a source of truth — it still holds ~490 hoisted
packages, including leftovers from the shadcn CLI that nothing imports. **When you add an
import, declare the package in the same change.**

**`tsconfig.json` used to compile 1,700 vendored skill files.** `include: ["**/*.ts"]` with
only `node_modules` excluded pulled in `.opencode/`, `.agents/`, `.claude/`, `.cursor/`,
`.devin/` and `.agency-agents/` — 1,588 of those `.ts`/`.tsx` files are in `.opencode/skills/`
alone, against 37 project-owned files. All six directories are now in `exclude`. Cold
`pnpm typecheck` is ~11s and passing.

**`src/` is untracked.** Deleting a file there is unrecoverable via git. This already cost one
incident: `src/prisma/contract.prisma` was truncated to 0 bytes by an editor saving an empty
buffer, and only an out-of-band backup saved it. Until `src/` is committed, **copy
`src/prisma/` before touching it**, and prefer `git add src/` early.

**Tests now exist and are enforced.** `vitest.config.ts` includes `src/**/*.test.ts` and the
`--passWithNoTests` escape hatch has been **removed**, so an empty suite is now a failure rather
than a false green. Five tests run across two files: `src/lib/utils.test.ts` (3, for `cn`) and
`src/lib/contract-integrity.test.ts` (2, for contract/artifact drift).

`playwright.config.ts` still points `testDir` at `./e2e`, which **does not exist** — so
`pnpm test:e2e` proves nothing yet. Vitest is currently fast and deterministic (~3s); the
contract test shells out to `pnpm prisma contract emit`, so it costs a subprocess per run.

**ESLint and Playwright gaps that are now closed:** `eslint.config.mjs` ignores generated
artifacts under `src/prisma/**` and `migrations/**`; Playwright's `testDir` is `./e2e`, not
`./src/app/e2e` — specs inside `src/app/` would be picked up by the App Router as a route
segment. `playwright-report/`, `test-results/`, `coverage/` and `*.tsbuildinfo` are already in
`.gitignore`; an older revision of this file listed the first two as unignored, which is stale.

**Two peer warnings from `pnpm peers check` (not blocking, both understood).**
`@types/node@20.19.43` is below Vitest's `^22.0.0 || >=24.0.0`; the fix is to raise it, which is a
dependency decision rather than a silent edit. `@hookform/resolvers` wants `effect@^3.14` and
resolves to `^3.17`, but nothing imports `@hookform/resolvers` yet, so the mismatch is dormant.

**No Node version pin exists.** There is no `engines` field in `package.json` and no `.nvmrc`
or `.node-version`. Anything running `pnpm install` can land on a different Node major. Pinning
was raised and deliberately deferred.


---

## 14. Agent + skills landscape

**Instruction precedence** (highest first):

1. `~/.config/opencode/AGENTS.md` — global engineering constitution
2. `AGENTS.md` (repo root) — generated Next.js rules; `CLAUDE.md` just does `@AGENTS.md`
3. `.opencode/ai-workflow.json` — project execution workflow and change-safety rules
4. `MEMORY.md` (this file) — verified reality
5. `src/` — actual code
6. `PRD.md` / `ARCHITECTURE.md` / `RULES.md` / `SOPs.md` / … — intent and rationale

**This list is the project's documented precedence order.** `PHASES.md:106` says to follow
"the project's documented precedence rules" and never invent one, but **neither `PHASES.md` nor
`.opencode/ai-workflow.json` defines an ordered list of its own**, and neither references
`MEMORY.md`. So §14 is the only place that order is written down — treat it as canonical rather
than re-deriving one. Verified 2026-09-30.

**Known tension to state rather than resolve silently:** step 4 ranks `MEMORY.md` *above*
step 5 `src/`. That is deliberate — `MEMORY.md` is verified reality, so it agrees with `src/`
in every audited case — but if they ever disagree, `src/` is the running system and the
difference is a `MEMORY.md` bug to fix, not a reason to override the code.

`AGENTS.md` instructs agents to read the bundled Next.js docs at
`node_modules/next/dist/docs/` before writing code — **this version of Next.js has breaking
changes relative to most training data. Read the docs, do not assume.**

**Skill directories.**

| Location | Owner | Notes |
|---|---|---|
| `.opencode/skills/` | project | The only project skill root OpenCode reads |
| `.claude/`, `.cursor/`, `.agents/`, `.devin/skills/` | Prisma | Generated by `prisma skills sync` |
| `~/.config/opencode/skills/` | personal | ~34 skills, global scope |
| `~/.agents/skills/` | agent-bundled | ~36 skills |

**Two project skills are valid on disk but missing from the registry.** `scholars-project` and
`prisma-8-workflow` both fail `skill({ name: ... })` with *"Skill not found"*. **Root cause
established 2026-09-30 by reading the discovery code out of the OpenCode 1.18.33 binary:** the
registry is a snapshot computed at session start and is not re-scanned. The session in which
this was observed was created at **14:10:27Z**; every loadable `.opencode/skills/` directory is
dated `Sep 29 13:20`, while only these two are dated `Sep 30 14:18`/`14:19` — i.e. created
*after* the snapshot. Their frontmatter is valid and their directory names match, so this is
**not** a malformed file. A session restart is the fix; there is no way to force a rescan
mid-session.

`AGENTS.md` therefore routes to them by **file path**, and that is the correct behaviour until a
restart happens. Do not "repair" them by renaming or rewriting to chase the error.

**Durable hardening added 2026-09-30:** the project `opencode.json` now declares

```json
"skills": { "paths": [".opencode/skills"] }
```

`skills.paths` is a real OpenCode config key ("Additional paths to skill folders") scanned with
`**/SKILL.md`, merged across config scopes. It makes the project skill root an **explicit,
discoverable input** rather than an implicit convention, and it is inherited by any machine or
worktree that clones this repo. It does not defeat the snapshot — a restart is still required
for the current session — but it removes the reliance on directory-name convention and is the
correct declaration of intent.

**The snapshot is of CONTENT, not just the skill list — verified 2026-09-30.** After fixing a
`superpowers:` reference inside `systematic-debugging/SKILL.md`, `skill({ name:
"systematic-debugging" })` still returned the **pre-edit text**. So editing a `SKILL.md` has
**no effect until OpenCode restarts**; `Read`ing the file is the only way to see the truth.
This also means **a loaded skill can contradict the file on disk** — when auditing a skill,
`Read` it, do not trust `skill()` output as current.

**Full skill audit (2026-09-30, re-verified by parsing all 119 files).** All **119** `SKILL.md`
files across all seven roots have valid YAML frontmatter, every `name` matches its directory,
and every one has a `description`. **Zero invalid skills, 102 distinct names, 11 duplicated.**

Duplicate resolution **is** deterministic, and I confirmed the mechanism from the OpenCode 1.18.33
binary: same-named skills are inserted into a map in scan order and the **last write wins** (a
`duplicate skill name` warning is logged for the loser). Scan order puts external roots
(`~/.claude`, `~/.agents`, then the project equivalents) **before** the config skill roots, so
`.opencode/skills/` always wins over `~/.agents/skills/`.

| Duplicated name | Copies | Note |
|---|---|---|
| `prisma-8` | ×4 | `.agents`, `.claude`, `.cursor`, `.devin` — all Prisma-generated, byte-identical, harmless |
| `prisma-composer-core-concepts` | ×4 | same |
| `prisma-platform-core-concepts` | ×4 | same |
| `prisma-cli` / `prisma-client-api` / `prisma-database-setup` | ×2 each | **banner wins — see below** |
| `design-system`, `motion`, `ui-ux-pro-max` | ×2 each | `.opencode` vs `.agents`, differing content |
| `shadcn`, `find-skills` | ×2 each | byte-identical mirrors, no risk |

**Prisma 7 hazard — contained, not eliminated (corrected 2026-09-30).** The three `prisma-*`
skills carry "archived, do not follow" banners **only in their `.opencode/skills/` copies**. The
duplicates in `~/.agents/skills/` are not banner-marked and do teach `prisma generate` /
`prisma migrate`. Because `.opencode` is scanned last and wins, **`skill({ name: "prisma-cli" })`
resolves to the banner-marked project copy** — confirmed in the live skill list. So the hazard
is currently *shadowed*, not live. It would become live only if the `.opencode` copies were
deleted or renamed. Pruning a user's home directory is outside project scope, so the mitigation
is documentation: §11 tells agents to read the two project skills by path and never follow those
three from either copy.

**Superpowers: deliberately NOT installed.** `obra/superpowers` is OpenCode-compatible
(`"plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]`), but installing it
would inject a second, competing top-level methodology, because this repo already has its own
governance stack (`AGENTS.md` constitution + `ai-workflow.json` + `RULES.md`/`SOPs.md`) *and*
already vendors Superpowers' three most important skills:

- `.opencode/skills/systematic-debugging/` (it explicitly references `superpowers:*` siblings)
- `.opencode/skills/test-driven-development/`
- `.opencode/skills/verification-before-completion/`

The remaining Superpowers value — brainstorming, planning, subagent dispatch, code review,
worktrees — is already covered by `master-plan-architect`, `code-reviewer`, `code-review`,
`git-engineering`, and `planning` in the agent roster. Its rigid "write a failing test first,
delete pre-test code" bootstrap would also be actively harmful here, since the project had no
test infrastructure at all. **Do not add the plugin.** Revisit only if `RULES.md` is retired.

**Agent roster is very large** — `.opencode/agents/` holds ~300 files and `.agency-agents/`
~26. Most are irrelevant to this stack. Prefer the explicitly-listed agents; do not treat the
directory listing as a work queue.

**MCP servers, as of 2026-09-30.** Project `opencode.json` has SonarQube **disabled** (approved;
not needed for a Next.js/Prisma project). Motion and Motion Plus remain enabled. The **global**
Playwright MCP command was corrected to `npx -y @playwright/mcp@latest` and its `--help` exits 0.
The **global PostgreSQL MCP is still wrong** — it launches `npx -y postgresql`, which is not the
Postgres MCP server; it was left untouched because it lives in the user's global config and
repairing it needs a decision on which server to use. `MCP-HEALTH-REPORT.md` predates these
changes and is stale.

---

## 15. File map

```
prisma.config.ts              Prisma 8 contract + connection config
prisma-8.md                   Prisma's own generated README for this install (accurate;
                              documents the db.orm.<ns>.<Model> builder API)
.env / .env.example           DATABASE_URL (env is git-ignored; example is tracked)
compose.yaml                  postgres:17-alpine, port 5433, named volume, healthcheck
src/prisma/
  contract.prisma             AUTHORED data contract (PSL) — edit this
  contract.json               GENERATED — do not edit (storage.storageHash)
  contract.d.ts               GENERATED — do not edit
  db.ts                       runtime accessor: postgres<Contract>({ contractJson, url })
migrations/                   ABSENT — removed during the wipe; §3
src/app/
  layout.tsx                  root layout; TooltipProvider + Toaster mounted
  page.tsx                    empty home page (scaffold)
  globals.css                 Tailwind v4 + design tokens; imports shadcn/tailwind.css
                              and tw-animate-css
                              (favicon.ico was deleted — src/app/ has only these 3 files)
src/components/ui/            31 shadcn (Base UI + Phosphor) components — currently unused
src/hooks/use-mobile.ts       the only project-authored hook
src/lib/utils.ts              one line: re-exports `cn` from the "cn" package
src/lib/utils.test.ts         3 tests for `cn`
src/lib/contract-integrity.test.ts  2 tests: contract source vs emitted artifact hash
public/                       EMPTY — no static assets
components.json               shadcn config: base-lyra style, phosphor icons, rsc:true
package.json                  pinned exact versions; prisma scripts; test = `vitest run`
tsconfig.json                 exclude: .opencode .agents .claude .cursor .devin .agency-agents
pnpm-lock.yaml                TWO YAML docs by design — bootstrap stub, then real resolutions
AGENTS.md                     auto-loaded bridge → this file + skills + workflow
CLAUDE.md                     one line: `@AGENTS.md`
opencode.json                 project MCP config (SonarQube disabled) + skills.paths
                              declares `.opencode/skills` as an explicit skill root
MCP-HEALTH-REPORT.md          dated before the MCP fixes; superseded by §14
.opencode/ai-workflow.json    execution workflow, change-safety rules, approved stack
.opencode/skills/
  scholars-project/           project conventions, terminology, verify commands, traps
  prisma-8-workflow/          this repo's Prisma 8 contract pipeline + no-seed note
  prisma-cli/                 ARCHIVED Prisma 7 — blocking banner in body; do not follow
  prisma-client-api/          ARCHIVED Prisma 7 — blocking banner in body; do not follow
  prisma-database-setup/      ARCHIVED Prisma 7 — blocking banner in body; do not follow
```

**No CI configuration exists** — no `.github/`, no `.gitlab-ci.yml`, no CI provider of any kind.
Every gate in §6 is therefore local and manual. Nothing enforces them remotely.

Skill inventory: **119 `SKILL.md` files** across `.opencode/`, `.agents/`, `.claude/`,
`.cursor/`, `.devin/` and two personal roots (`~/.config/opencode/skills`, `~/.agents/skills`).
Re-verified 2026-09-30 by parsing all 119 frontmatter blocks: **119 valid, 0 invalid, 0 missing
a `description`, 0 with a `name` that disagrees with its directory** — so 102 distinct skill
names, with 11 names duplicated across roots. (An earlier revision of this file said "117 parse";
that was wrong.) See `skills-inventory.md` for precedence and the duplicate-name collisions
(notably `prisma-8` × 4, all Prisma-generated copies).


---

## 16. Open questions

**Still open:**

4. **Should Node be pinned?** Not decided. No `engines` field or `.nvmrc` exists; CI would
   float. See §13.
5. **What replaces the deleted UI components?** `header.tsx` and `user-menu.tsx` were removed
   ahead of the architecture rebuild.

**Resolved 2026-09-30** (decided and applied, not silently changed):

- ~~Should `package-lock.json` be deleted?~~ **Yes — deleted.** `pnpm-lock.yaml` is the sole
  lockfile and `--frozen-lockfile` passes. See §13.
- ~~Should `@prisma/client` be dropped?~~ **Yes — removed.** See §2, trap 1.
- ~~Should the DB get a compose file?~~ **Yes — `compose.yaml` added**, not started because the
  ad hoc container owns the name/port. See §6.
- ~~Should tests be written before features?~~ **Yes — a 5-test foundation now exists** and
  `--passWithNoTests` is gone, so CI cannot go green on an empty suite. See §13.

**Decided 2026-09-30 by the user:**

1. ~~What auth solution?~~ **Deferred to Phase 4**, but the *authorization model* must be derived
   and written up as an ADR during Phase 1, because it determines the Phase 3 schema. The
   archived design's competing `User.role` string **and** `Role`/`Permission` tables must be
   replaced by one coherent model.
2. ~~Where should the schema backup live?~~ **Keep in `/tmp`, re-verify each session.** Treat it
   as disposable: check `SHA256SUMS` and re-prove it emits before relying on it. Do not commit it.
3. ~~Is `src/` going to be committed?~~ **Yes — done.** Committed as `2b520ad` (44 files).
   `src/` is now fully tracked; deletions are recoverable.
6. ~~Does the rebuild keep `Class → Group → Section`?~~ **Yes — resolved 2026-09-30.**
   Unanimous across `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `.opencode/ai-workflow.json` and the
   archived contract: `Institution → AcademicSession → Class → Group → Section → Student`, with
   **Group above Section** (a Group holds Sections; e.g. Computer Science holds Alpha/Beta).
   Not a blocker.

---

## 17. Development state (PHASES.md §6)

Persistent resume state required by `PHASES.md` §6. Kept here because `MEMORY.md` is the
project's existing memory mechanism, not a separate file.

**Current phase:** Phase 2 — Architecture and Backend Foundation
**Current step:** Step 2.4 — Error Model (implemented and tested)
**Current sub-step:** Step 2.1/2.2 boundaries recorded in `src/modules/README.md`; error model
shipped; remaining 2.3, 2.5, 2.6, 2.7

| Item | State |
|---|---|
| Completed | **Phase 0 entirely**; **Phase 1.1–1.5** + ADR-0001; Phase 2.1, 2.2 (documented), 2.4 (error model, 15 new tests) |
| In progress | Phase 2 — Steps 2.3, 2.5, 2.6, 2.7 |
| Remaining | Phase 2 Steps 2.3, 2.5, 2.6, 2.7, then Phase 3 (schema) |
| Files modified | `MEMORY.md`, `DOMAIN-MODEL.md`, `adr/0001-authorization-model.md`, `src/modules/README.md`, **new `src/shared/errors/{app-error.ts,index.ts,app-error.test.ts}`** |
| Database changes | none |
| Migration status | no `migrations/` directory exists |
| Tests passing | 3 files / **20 tests** (`pnpm test`) — up from 5 |
| Tests failing | `pnpm test:e2e` → `Error: No tests found` (no Playwright tests exist yet) |
| Known issues | `db:verify` returns `CONTRACT.MARKER_MISSING` (intentional — DB unsigned); ESLint import-boundary enforcement for `src/modules/**` is documented but **not yet configured** |
| Gates | `pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` 20/20 |
| Architectural decisions | D-1 authorization = capability RBAC + explicit scope (ADR-0001); D-2 per-session placement; D-3 admission separate from student; D-4 lifecycle vs archival split; D-5 actors split into assigned roles and derived bindings; **D-6 layer boundaries recorded in `src/modules/README.md`** |
| Blockers | Phase 3 schema blocked on 3 open decisions: Teacher-vs-User shape, money representation, guardian account model (`DOMAIN-MODEL.md` §7) |
| Required user actions | decide the 3 open questions, or approve the agent to derive them as ADR-0002..0004 |
| Last verified state | 2026-09-30, `pnpm verify` equivalent run manually (typecheck + lint + test) |
| Exact next action | Phase 2.6 shared utilities (validation, auth helpers, db helpers) with tests, then 2.5 logging, 2.3 database infrastructure, 2.7 infrastructure tests |

### Environment snapshot

`scholars-postgres` (`postgres:17-alpine`) is up on host port **5433**. `migrations/`, `e2e/`,
`scripts/`, `src/modules/`, `src/shared/` and `src/tests/` do **not** exist. `public/` is empty.

Safety copy taken before any further work:
`/tmp/opencode/scholars-src-backup-20260930-194647/` (42 files).

