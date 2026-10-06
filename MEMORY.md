# MEMORY.md — Project Knowledge Map

> **Purpose.** Durable, version-verified knowledge for this repository. Read this before
> planning work. It records *verified* facts (checked against `node_modules` and the CLI),
> not assumptions. When reality contradicts this file, reality wins — fix this file.
>
> **Last verified:** 2026-10-06 (fifth pass: **schema complete — 145 tables**) · Next.js 16.3.6 ·
> drizzle-orm 0.45.3 · drizzle-kit 0.31.11 · pg 8.23.1 · Node 26.8.1 · pnpm 12.6.0 ·
> OpenCode 1.18.33
>
> Drizzle ORM, `drizzle-kit` and `pg` are the data layer; **no ORM skill is vendored** — use
> Context7 (`/drizzle-team/drizzle-orm-docs`) and the project `drizzle-workflow` skill.
> `pnpm verify` and `pnpm build` pass as of this pass. Current phase state: **§17**.
>
> **Status: Phases 0–4 are done — schema complete and applied (`drizzle/0000_*.sql` checked),
> auth (Phase 3, ADR-0005) and capability RBAC (Phase 4, ADR-0001).** See §1 and §3.

---

## 1. Project state

**Status: Phases 0–4 complete.** The full database schema is authored, migrated and
contract-tested; **authentication and authorization are implemented**. There are no feature
routes yet — the authenticated surface is a single permission-aware home page and the shell
layout — but the foundation the features sit on is real and tested: auth (sign-in/sign-out,
sessions, revocation), capability RBAC end-to-end, `src/shared/{errors,money,logging,validation,
authorization}`, `src/db/{client,env}.ts`, `src/db/schema/**` (22 domain modules + `relations.ts`),
and `src/modules/README.md` recording the layer boundaries. 207 tests + 4 e2e cover it. Phase
decisions (ADR-0001…0005, D-1…D-11) are recorded.

**The data layer is Drizzle ORM** and the schema is complete: `src/db/schema/index.ts` re-exports
22 table modules and the generated `relations.ts`, `drizzle/0000_steady_johnny_blaze.sql` creates all
145 tables, and `db:check` passes. The baseline is **applied** to the local database (145 tables,
45 enums, recorded in `drizzle.__drizzle_migrations`, 2026-10-06). There are **no feature queries** and no relational query builder
*consumers* yet — `relations.ts` is generated and typechecked but nothing calls `db.query.*` — so
nothing has yet proven the relation map at runtime.

**The architecture is being rebuilt from scratch.** Treat the docs (`PRD.md`,
`ARCHITECTURE.md`, `RULES.md`, `SOPs.md`, `DESIGN.md`, …) as *intent*, and this file plus
`src/` as *reality*. Where they disagree, `src/` wins — but raise the conflict rather than
silently picking one.

`src/` is fully tracked, so a deletion there is recoverable from git — still worth copying a large
edit to `/tmp` first, but do not treat the old `/tmp/opencode/scholars-src-backup-*` copies as a
safety net: both were lost when `/tmp` was cleared. Note the repo also carries a large pre-existing
set of unrelated working-tree changes that predate this work: inspect diffs and never bulk-reset.
See §13 (Repository traps).

---

## 2. Verified dependency versions

Read from `node_modules/*/package.json`, not from range specifiers in `package.json`.

| Package | Installed | Declared |
|---|---|---|
| `next` | **16.3.6** | `16.3.6` |
| `react` / `react-dom` | **19.2.8** | `19.2.8` |
| `typescript` | **5.9.3** | `^5` |
| `drizzle-orm` | **0.45.3** | `^0.45.3` |
| `drizzle-kit` | **0.31.11** | `^0.31.11` (build-time CLI only) |
| `pg` | **8.23.1** | `^8.23.1` |
| `@types/pg` | **8.23.1** | `^8.23.1` |
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

1. **The data layer is Drizzle ORM.** `drizzle-orm` + `drizzle-kit` + the
   node-postgres driver `pg`. Schema is hand-written TypeScript across the 22 modules under
   `src/db/schema/`, re-exported by the `src/db/schema/index.ts` barrel;
   there is no schema DSL file and no generated client. Access is `db` from `src/db/client.ts`.
   Do not introduce a second ORM, and do not write `db.<model>.<verb>()` style calls — Drizzle has
   no model proxies, so those are always wrong here. See §3.
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

## 3. Drizzle ORM — hand-written schema, no codegen (highest-risk area)

Drizzle ORM was adopted on 2026-10-05. No other ORM is installed or approved, and no ORM skill is
vendored here. The biggest specific trap is inverted against most training data: **there is no
generated client and no emit step to forget.** The schema
is ordinary TypeScript, `tsc` reads it directly, and the only thing between a table edit and a
migrated database is discipline plus `pnpm db:generate`.

### Mental model

```
src/db/schema/<module>.ts     ← AUTHORED pgTable modules (22 of them); index.ts re-exports all
        │  pnpm db:generate        (no DB connection required)
        ▼
drizzle/0000_<name>.sql       ← GENERATED migration SQL                  (committed)
drizzle/meta/                 ← GENERATED snapshot + _journal            (committed)
        │  pnpm db:migrate         (WRITES to the database)
        ▼
   PostgreSQL
```

`src/db/client.ts` is the runtime accessor — actual source:

```ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { readDatabaseUrl } from "./env";
import * as schema from "./schema";

export const db = drizzle(readDatabaseUrl(), { schema });
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

Three easy-to-miss details: the driver entry is `drizzle-orm/node-postgres` (**not**
`drizzle-orm/postgres-js` or `drizzle-orm/better-sqlite3`), `drizzle()` takes the connection string
**directly** (no options object, no generated contract import), and `DbTransaction` is *derived* from
the driver because `PgTransaction` is not a type you want to import by name.

`drizzle.config.ts` sets `dialect: "postgresql"`, points `schema` at `./src/db/schema/index.ts`,
and reads `process.env.DATABASE_URL` **defensively** (`?? ""`) so `db:generate` and `db:check`
work with no database configured. Runtime access still goes through `src/db/env.ts`, which validates
with Zod at import.

### The query API — SQL-shaped, not ORM-shaped

This is the single most common way to get Drizzle wrong: there is no `db.user.findMany()` and no
proxy-style `db.user`. `db.select().from(t)` returns the same objects a raw SQL client would, and
`db.user` only exists for tables explicitly re-exported from the schema.

```ts
import { db } from "@/db/client";
import { student } from "@/db/schema";

const all = await db.select().from(student);
const one = await db.select().from(student).where(eq(student.id, id)).limit(1);
const page = await db.select().from(student).orderBy(asc(student.admissionNumber)).limit(20);
```

| Intent | API |
|---|---|
| Select | `db.select({ cols }).from(t)` · `db.query.<table>.findMany({ where, orderBy, limit })` |
| Insert | `db.insert(t).values(v)` · `.onConflictDoUpdate({ target, set })` for upsert |
| Update | `db.update(t).set(v).where(…)` |
| Delete | `db.delete(t).where(…)` |
| Transaction | `db.transaction(async (tx) => …)` — `tx` is `DbTransaction` |

Two rules that **are not** compile errors, so they are on you:

1. **`update` / `delete` without a `where` silently affects every row.** Drizzle allows
   `db.delete(t)` as-is — an unfiltered mutation is not a type error. If you see a mutation with no
   `.where(…)`, treat it as a bug until proven otherwise.
2. **`numeric` comes back as a `string`, not a number.** That is the default and it is deliberate.
   Do not pass `{ mode: "number" }` — see `src/shared/money/money.ts` and ADR-0003.

### Commands that exist (verified against `drizzle-kit --help`)

| Task | Command | Writes DB? |
|---|---|---|
| Turn schema changes into SQL migrations | `pnpm db:generate` | No |
| Apply pending migrations | `pnpm db:migrate` | **Yes** |
| Sync DB to schema without migration files | `pnpm db:push` | **Yes** |
| Check migration-file consistency (no DB needed) | `pnpm db:check` | No |
| Derive a schema from an existing DB | `pnpm db:introspect` | No |
| Browse data | `pnpm db:studio` | No |

`pnpm verify` runs `typecheck`, `lint`, `test`, **and** `db:check`.

### Commands that DO NOT exist — never suggest them

`db:verify` · `db:sign` · `db:init` · `db:update` · `db:schema` · `migration:new` ·
`migration:plan` · `migration:list` · `migration:status` · `contract:emit` · `contract:infer` ·
`contract:format` · `db:sign`

`pnpm db:push` bypasses migration history entirely — local throwaway experiments only, never the way
to deploy a schema change.

### Why there is no drift gate, and what replaces it

**Drizzle has no way to prove a live database matches the schema, and no equivalent exists.** Nothing
here prevents a database from drifting away from `src/db/schema` without a migration file.

`pnpm db:check` is the nearest substitute and it is much weaker: it verifies that the generated
migration history is *internally* consistent, **not** that any live database matches. Discipline is
the actual control:

- Every table change ships `src/db/schema` **and** a generated `drizzle/` migration in the same commit.
- Only `db:migrate` (which replays those files) is ever applied to a real database — never `db:push`.
- Do not write code, tests, or docs that assume a drift-verification command exists.

### Invariants

- **Never hand-edit anything under `drizzle/`.** It is `drizzle-kit` output, committed to history.
  Edit `src/db/schema` and re-run `pnpm db:generate`.
- **A table does not exist until `src/db/schema/index.ts` re-exports it.** `db.query.<table>` and the
  relational API depend on that export.
- **`src/db/` must never be imported from `src/modules/domain/`** — see `src/modules/README.md`.
  Drizzle and `pg` are infrastructure.
- **The schema has 145 tables across 22 domain modules.** `pnpm db:generate` writes
  `drizzle/0000_*.sql`; `pnpm db:check` passes. `src/db/schema/schema-contract.test.ts` asserts the
  invariants PostgreSQL would otherwise only catch at `CREATE TABLE` time (see §5).
- `drizzle.config.ts`, `src/db/client.ts`, and `src/db/schema/index.ts` were all new on 2026-10-05.
  There is no ORM skill duplication to reconcile — no ORM skill is vendored.


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

## 5. Domain model — 145 tables, authored

`src/db/schema/` holds 22 domain modules plus `_conventions.ts`, `_enums.ts`, `relations.ts` and the
`index.ts` barrel. `index.ts` re-exports every table **and** spreads `relations` into the `schema`
object, so `db.query` is available. The generated baseline migration creates all 145 tables,
378 foreign keys and 364 check constraints.

| Module | Owns |
|---|---|
| `identity`, `authorization` | `users`, credentials, sessions, security events; roles, permissions, scopes, user grants |
| `institution`, `academic` | institutions, campuses, buildings, floors, departments, designations, academic sessions, classes, groups, sections, subjects, time slots, schedules |
| `student`, `guardian`, `admission` | students, placements, enrollments, documents, notes, previous schools; guardians, links, authorizations, emergency contacts; applications, checklists, windows, status history |
| `hr`, `teacher` | employees, salary structures and assignments, leave, employee attendance, status history; teacher profiles, subjects, workload history, qualifications, leave balances |
| `attendance`, `biometric`, `floor-operations` | attendance records, sessions, corrections, summaries, exceptions; devices, enrollments, transactions; floor assignments, live snapshots, absences, extra periods, incident reports |
| `examinations`, `daily-tests` | examinations, registrations, marks, corrections, grading schemes and bands, results, publication log; daily tests, evaluations, corrections, monthly reports and items, publications |
| `diary`, `complaints`, `communication` | diaries, assignments, attachments, reads, notifications and preferences; complaints, actions, visibility, attachments, comments; notifications, deliveries, preferences, announcements, audiences, receipts, email templates, messages, delivery events |
| `fees`, `finance`, `payroll` | fee structures and items, invoices, lines, payments, allocations, receipts, deferrals, concessions, plans, installments; accounts, journal transactions, ledger entries, expense heads, expenses, budgets, reconciliations, payment methods, financial periods; payroll runs, items, adjustments, payments, payslips, period locks, calculation sources |
| `governance`, `jobs` | audit events, system settings, setting changes; jobs, job definitions, runs, schedules, dead letters |

**The three decisions that used to block Phase 3 are now resolved, recorded and implemented** — do
not re-open them without cause:

| Decision | Resolution | Where |
|---|---|---|
| Teacher vs User | `User` 0..1 `Teacher` employment profile; access via `TeachingAssignment` (session + subject + section). No `Subject.teacherId` | ADR-0002, D-8 |
| Money representation | `numeric(18,2)` + explicit currency; outstanding balance **computed**, not stored; unique receipt per institution. Drizzle maps `numeric` to a canonical decimal **string** by default, so no decimal dependency is needed | ADR-0003, D-7 |
| Guardian account model | `ParentGuardian` is a person with an optional `User`; access follows **only** `GuardianLink`; `Student.guardianId` is removed | ADR-0004, D-9 |

Authorization is settled too: capability RBAC with explicit scope, `User.role` removed in favour of
`User.roleId`-free `UserRole` / `Role` / `Permission` / `RolePermission` (ADR-0001, D-1).

### Constraints that need care, and are now test-enforced

Four schema shapes look wrong at a glance and are deliberate. `src/db/schema/schema-contract.test.ts`
exists so none of them can silently regress:

- **No nullable column is ever in a primary key.** `announcement_audiences` once had `audience_id` in
  a composite key; a PK column is implicitly `NOT NULL`, so the constraint rejected the `everyone`
  row the neighbouring check constraint permitted. Uniqueness is now two partial indexes instead.
- **`monthly_test_reports` uniqueness is partial on live rows.** A recomputation inserts a replacement
  report and points the old one at it via `superseded_by_report_id`; a plain unique index on
  `(student, subject, session, period)` would forbid the replacement it exists to permit.
- **Every money column is `numeric(18,2)` and every money row reaches a currency in one hop.** 14
  tables carry `currency` directly — `salary_structures`, `salary_assignments`, `fee_structures`,
  `fee_invoices`, `payments`, `receipts`, `fee_payment_plans`, `fee_concessions`, `financial_accounts`,
  `expenses`, `budgets`, `payroll_runs`, `payroll_items`, `payroll_payments`. The 8 money-bearing tables
  that do **not** carry it inherit it from their parent: `fee_structure_items` → `fee_structures`,
  `fee_invoice_lines` → `fee_invoices`, `payment_allocations` → `payments`, `fee_installments` →
  `fee_payment_plans`, `ledger_entries` → `financial_accounts`, `payroll_adjustments` →
  `payroll_items`, `bank_reconciliations` → `financial_accounts`, `payment_methods` →
  `financial_accounts`. Repeating the column on every amount row would let a document's own lines
  disagree about the currency, which is the failure ADR-0003 §3 exists to prevent.
- `floor_live_snapshots` carries an `id` primary key even though its natural key
  `(floor, schedule, date)` is what an upsert uses, so no table is keyless.

The three shared layers that constrain how the schema must be written are already built and
tested, so read them before designing tables: `src/shared/money/money.ts` (money is a `Money`
value in `bigint` minor units, never a JS number), `src/shared/authorization/permissions.ts` (the
`Permission.key` values are a typed constant — the schema must use exactly these), and
`src/db/env.ts` (the connection is validated at import).

### `relations.ts` is generated, not hand-written

`src/db/schema/relations.ts` is produced from Drizzle's own `getTableConfig()` metadata, not typed by
hand — hand-maintaining 145 relation objects drifted and produced a file that did not compile. Every
declared foreign key gets an explicit `relationName`. Two constraints on the generator:

- `one` and `many` are **callback destructured helpers**, not root exports of `drizzle-orm`. Calling
  `one(...)` imported from the package root is a type error in 0.45.3.
  - **Not every reference is a foreign key, so `relations.ts` cannot reach some of them.** Verified
    from Drizzle's own `getTableConfig` metadata: 145 tables, **604 `uuid` columns**, **378 foreign
    keys** (376 column-level `.references()` plus 2 composite `foreignKey({})` in `diary.ts`, which
    matches the 378 `REFERENCES` in the generated migration exactly). Of the uuid columns, **153 are
    primary keys**, **356 sit on the local side of a foreign key**, and **95 are non-primary uuid
    columns with no foreign key at all**. Those 95 are partitioned into eight named groups by
    `schema-contract.test.ts`, which asserts the partition matches the schema exactly — in **both**
    directions, so a new bare column cannot ship without appearing in a named group where a reviewer
    will see it, and a column that gains a key must be removed from the list:
    - **61 are actor columns** — `approvedByUserId`, `markedByUserId`, `verifiedByUserId`, and so on.
      Attribution is stored as a bare uuid so an audit row survives deletion of the user who acted.
    - **10 are polymorphic** — each has a sibling discriminator (`scope_type`, `audience_type`,
      `viewer_kind`, `corrects_record_type`, `source_type`, `eventKey`) or a documented multi-target
      meaning, so one foreign key would name a single table and lie about the rest.
    - **2 close a module import cycle** — `identity` imports `institution`, so
      `departments.headUserId` cannot point at `users` without looping, and `floor-operations`
      imports `academic`, so `schedules.replacementAssignmentId` cannot point at `extra_periods`.
      Five columns used to be listed here as cycles too; the import graph was checked edge by edge
      and they do not close one (`finance` imports only `institution`), so they moved to the omission
      list below. Each reason is written at the column's own definition.
    - **6 have an ambiguous target** — `ADR-0002` defines a teacher as a `User` holding a `Teacher`
      profile, so `schedules.teacherId` could key either `users.id` or `teachers.userId`. One
      decision, then the key.
    - **2 form a loop with each other** — `jobs.scheduleId` → `jobSchedules` and
      `jobSchedules.lastJobId` → `jobs`; either alone is fine, together they cycle.
    - **1 has no single column to point at** (`biometricTransactions.resolvedAttendanceStudentId`,
      a four-column attendance key owned by another module) and **1 is a concurrency marker rather
      than a relationship** (`extraPeriods.consumedByPayLineId`, written once by payroll so a
      period cannot be paid twice, never read back as a join).
    - **12 are unexplained and believed to be omissions, not decisions** — the same column name
      carries a foreign key on 66 other tables (`institution_id`) or 26 (`academic_session_id`), the
      target module is already imported by this one, and the source comment gives no reason for the
      gap: `attendanceExceptions.institutionId`, `permissions.institutionId`,
      `schedulePublishHistory.scheduleId`, `teacherLeaveBalances.academicSessionId`,
      `teacherLeaveBalances.leaveTypeId`, `teacherWorkloadHistory.academicSessionId`,
      `teacherAbsences.leaveRequestId`, plus the five moved out of the cycle group after the import
      graph was checked — `journalTransactions.paymentId`, `journalTransactions.payrollRunId`,
      `payments.depositedToAccountId`, `payrollPayments.ledgerAccountId`,
      `payrollRuns.journalTransactionId`. Listed so a reviewer can see them; **not** a decision to
      add them.
    - **The same-table inconsistency is resolved.** Five same-table supersession pointers now carry
      a real self-referencing foreign key with `onDelete: "set null"` — `monthlyTestReports
      .supersededByReportId`, `payrollPayslips.supersededBySlipId`,
      `complaintAttachments.supersedesAttachmentId`, `complaintComments.parentCommentId`,
      `receipts.supersededById` — matching the three that already had one
      (`payments.reversesPaymentId`, `journalTransactions.reversesTransactionId`,
      `expenseHeads.parentHeadId`, the last on `onDelete: "restrict"` rather than `set null`). All
      eight therefore carry a self-FK, and **six** carry a "not itself" check —
      `payments.reversesPaymentId` and `journalTransactions.reversesTransactionId` do not: their
      only related constraints are `payments_reversal_check` and
      `journal_transactions_reverse_pair`, which pair the pointer with `status`, not with the row's
      own id. `payrollAdjustments.correctsRecordId`
      stays bare on purpose: it is polymorphic.
    - **`relations.ts` is generated from `references()`, so a bare column has no relation either.**
      Older comments claiming `relations.ts` declares these joins were wrong and were corrected —
      join them with `eq()` in the query.

### The previous 20-model design — shape remembered, source LOST

The schema deleted on 2026-10-05 defined 20 models. **There is no surviving copy:**
the checksummed `/tmp/opencode/contract-backup-20260930-144738/` archive and the
`/tmp/opencode/scholars-src-backup-20260930-194647/` source copy were both gone when `/tmp` was
cleared, and the contract was never committed to git (no dangling git objects contain it either).

Treat any earlier claim in this file that the archive was "verified good and reproducible" as
**superseded**. What survives is only the *shape*, which is what matters for the rebuild:

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
`Class → Group → Section` wording, so the rebuild must preserve that three-level chain or the docs
will need revising. Two gaps worth fixing in the rebuild: the old design used free-form strings for
every `status`/`type` field instead of `pgEnum` or boundary validation, and money was stored without
a shared value type.

One silent defect from the old design is worth carrying forward as a lesson: `Attendance` declared
a compound unique intending to prevent duplicates, but the emitted model had **no** uniques and no
keys — the constraint never reached the database. Under Drizzle there is no emit step that can
silently drop it, but the equivalent risk is declaring an index/constraint and forgetting to
re-export the table, or running `db:push` and never shipping the migration. Express attendance
uniqueness as a real `uniqueIndex` and confirm it in the generated `drizzle/*.sql`.

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
pnpm format           # prettier --write .
pnpm format:check     # prettier --check .
pnpm verify           # typecheck + lint + test + db:check
pnpm db:generate      # schema -> SQL migration (no DB required)
pnpm db:check         # migration-file consistency (no DB required)
pnpm db:migrate       # apply pending migrations (WRITES to the DB - needs approval)
```

`pnpm format` / `pnpm format:check` (Prettier 3.9.9 + `eslint-config-prettier`, added
2026-10-06) are **not** part of `pnpm verify` — verify is still only typecheck + lint + test +
db:check. `pnpm format:check` passed over the whole repo on 2026-10-06; `.prettierignore` skips
`*.md`, `drizzle/`, lockfiles, `.next/` and the agent/tooling roots.

### Database: available, baseline applied

A dedicated container is running:

| | |
|---|---|
| Container | `scholars-postgres` (`postgres:17-alpine`, restart `unless-stopped`) |
| Host port | **5433** (5432 is already taken by `aims-postgres`, a different project) |
| Database | `scholars_sms_database` |
| Role | `user` (from `.env`) |
| URL | `postgresql://user:***@localhost:5433/scholars_sms_database?schema=public` |

The database holds the **applied baseline**: **145 tables** and **45 enum types** in `public`,
one row in `drizzle.__drizzle_migrations` (applied 2026-10-06 via `pnpm db:migrate` on
`drizzle/0000_steady_johnny_blaze.sql`). Note Drizzle has no signing concept at all, so there is no `Marker missing`
to look for and no `db:verify` to run — reachability is checked with `pg_isready` or a plain
connection instead. A failing `pnpm db:migrate` prints only a terse spinner plus
`[ELIFECYCLE] Command failed with exit code 1` — **no error detail ever surfaces from the kit
migrate path**; validate the SQL with the psql loop in §13 instead.

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

- **Provider:** PostgreSQL ≥ 15, accessed through the **`pg` (node-postgres) driver**. This is a
  single choice made once: `drizzle-orm/node-postgres` + `drizzle-orm/pg-core` builders. Do not mix
  in `postgres-js` or a SQLite builder.
- **Connection:** `src/db/client.ts` → `readDatabaseUrl()` from `src/db/env.ts`, which validates
  `DATABASE_URL` with Zod at import. `drizzle.config.ts` reads `process.env.DATABASE_URL` directly
  (defensively, so Kit works offline) and loads it via `import 'dotenv/config'`. `.env` is
  git-ignored; `.env.example` is the tracked template. **Never commit `.env`.**
- **There is no capability manifest.** Drizzle declares no per-driver capabilities, so the query
  builders are always available and an unsupported combination fails at *runtime* with a Postgres
  error instead of at compile time. Be correspondingly careful reviewing SQL that touches
  dialect-specific features (`distinctOn`, `lateral`, `jsonAgg`).
- **Naming:** pass snake_case table and column names **explicitly** — Drizzle does not derive them
  from the property name. `AcademicSession.isCurrent` marked the active session in the archived
  design; there is no automatic "current session" lookup, so queries must filter on it explicitly.
- **Multi-tenancy:** the archived design keyed everything under `Institution`, but there is no
  enforced RLS, no tenant-scoped session, and no `Institution` table today. Treat
  tenancy as **unimplemented**.
- **Money and enums:** the previous design stored money without a shared value type and used
  free-form strings for every `status`/`type`. **Fix both in the rebuild** — use `numeric(18,2)`
  read back as text through `Money`, and real `pgEnum`s over unvalidated strings.

**Migration rules**

1. Edit the relevant `src/db/schema/<module>.ts` file to change a table (22 modules; `index.ts` is
   only the barrel that re-exports them).
2. Run `pnpm db:generate` and **commit the resulting `drizzle/` directory in the same commit** as
   the schema change. **No test catches its absence** — there is no codegen step and no drift gate,
   so this is discipline, not something the build enforces.
3. `pnpm db:check` must pass before any DB-touching command. It is part of `pnpm verify`.
4. **Only `pnpm db:migrate` may be applied to a real database.** `db:push` skips migration history.
5. **One migration exists so far** — the baseline `drizzle/0000_steady_johnny_blaze.sql`, generated,
   `db:check`-clean and **applied** to the local database (2026-10-06; 145 tables, 45 enums, one
   `drizzle.__drizzle_migrations` row). Do not hand-edit it or hand-write SQL into `drizzle/`;
   generate the next one with `pnpm db:generate`.

### Rollback / recovery strategy (PHASES Phase 2 task 18)

**Drizzle in this workflow is forward-fix only.** There are no down migrations: `drizzle-kit`
generates no `--down`/revert output and provides no rollback subcommand (verified against
`drizzle-kit --help`), and nothing under `drizzle/` may be edited by hand (§3 invariants). A bad
migration is remediated by **authoring a new corrective migration** with `pnpm db:generate` that
undoes the damage — never by editing or deleting files under `drizzle/`.

**Before applying a migration to any database holding data that matters, take a logical backup
(`pg_dump`).** The two Postgres volumes are not equivalent safety nets: the committed
`compose.yaml` declares a **named** volume (`scholars_pgdata`), but the actually-running ad hoc
container `scholars-postgres` mounts an **anonymous** volume (verified by `docker inspect` —
a generated hash name, not `scholars_pgdata`). An anonymous volume cannot be located by name later,
so `pg_dump` is the real recovery mechanism for anything non-disposable.

**Recovery paths:**

- **Fresh dev database / full replay:** `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
  **and `DROP SCHEMA IF EXISTS drizzle CASCADE;`** — the bookkeeping row lives in the `drizzle`
  schema; if you leave it behind, `pnpm db:migrate` thinks the baseline is applied and writes
  nothing. Then re-run `pnpm db:migrate` to replay `drizzle/` from scratch.
- **Database with data:** restore from the `pg_dump` taken beforehand, then forward-fix with a
  corrective migration.

**`pnpm db:migrate` has been run once (2026-10-06 — baseline applied, 145 tables + 45 enums).**
Future migration applications still require explicit user approval (§6, §17).

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

## 9. Authentication and authorization — NOT IMPLEMENTED (mechanism decided)

Stated plainly because inventing a design here would be the worst outcome:

- **No auth library is installed** — nothing in `package.json` (no `next-auth`/`auth.js`,
  `better-auth`, Clerk, Lucia, or Supabase auth) and **no auth import anywhere in `src/`**.
- **No middleware, no `proxy.ts`, no session handling, no RBAC.**
- **Decision (2026-10-06, user-approved): Auth.js / NextAuth v5** with the Drizzle adapter is the
  mechanism for PHASES Phase 3. Installing `next-auth` and its adapter is approved; no other auth
  package is. The previous rule — "do not add an auth package without explicit approval" — still
  holds for everything except Auth.js.
- The previous data model had `User`, `Role`, `Permission`, which **no longer exist as three tables**.
  The authorization tables that replaced them are `users`, `roles`, `permissions`,
  `role_permissions`, `user_roles`, `user_permissions`, `permission_scopes` and `user_institutions`
  — see §5. No auth package is installed and no row has been written.

**Consequence for future agents:** there is no authenticated route to protect, no "current user"
to read, and no permission helper to reuse. The mechanism is settled (Auth.js v5, approved);
implementation is PHASES Phase 3 — start from `SECURITY.md` and the archived
`User`/`Role`/`Permission` shape.

---

## 10. Testing conventions

| Kind | Tool | Where | Command |
|---|---|---|---|
| Unit | Vitest 5.0.2 | `src/**/*.test.ts`, `environment: "node"` | `pnpm test` |
| E2E | Playwright 1.63.0 | `./e2e` (exists since 2026-10-06) | `pnpm test:e2e` |

- `vitest.config.ts` excludes **nothing** under `src/db/**`. That directory is hand-written source,
  not generated artifacts, so a test placed there runs — see the §13 trap about `vitest.config.ts`
  silently excluding the database layer, which is the bug this fixed.
- `--passWithNoTests` / `--pass-with-no-tests` were **removed from both** `pnpm test` and
  `pnpm test:e2e`, so neither command can pass vacuously again.
  `e2e/` came into existence on 2026-10-06 (concurrent work: `e2e/smoke.spec.ts`), so the
  "no tests found" failure mode is over — but **`pnpm test:e2e` results were not verified by this
  pass** (it still needs a browser install and a dev server). Use `pnpm test` as the gate.
- Playwright's `testDir` is `./e2e`, deliberately **outside** `src/app` so the App Router never
  treats a spec as a route segment. Keep it there.
- `pnpm verify` = typecheck → lint → test → `db:check`. **`next build` no longer runs ESLint**
  (Next 16 removed `next lint`), so lint must be invoked explicitly.
- Current baseline: **124 tests across 8 files**, including 13 schema-contract tests in
  `src/db/schema/schema-contract.test.ts`. No integration tests exist; one **E2E smoke spec**
  (`e2e/smoke.spec.ts`, added 2026-10-06, results not verified here); no coverage tooling is
  configured.

---

## 11. Agent workflow (how to work in this repo)

1. **Read `MEMORY.md` first** (this file). It is the verified-reality source of truth; the
   other docs (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `SOPs.md`, `DESIGN.md`, `PHASES.md`)
   are *intent*. **Where they disagree, `src/` wins — and say so rather than silently picking.**
2. **Skills:** two project skills are on disk but may not appear in the registry. Read
   `.opencode/skills/scholars-project/SKILL.md` and `.opencode/skills/drizzle-workflow/SKILL.md`
   **by path**. No ORM skill is vendored — Drizzle docs come from Context7
   (`/drizzle-team/drizzle-orm-docs`). If a skill ever teaches a different ORM, it is stale; the
   data layer is Drizzle and nothing else.
3. **Never guess Drizzle or Next.js APIs** — consult §3 (Drizzle) and §4 (Next.js), then the
   installed type definitions under `node_modules/`, or fetch current docs via Context7
   (`/drizzle-team/drizzle-orm-docs`). Both move faster than training data.
4. **Verify before claiming done** (`pnpm verify`, `pnpm build`, and `pnpm db:generate` after any
   `src/db/schema` edit). Evidence before assertions.
5. **`src/` is tracked**, so a deletion is recoverable — but copy a file to `/tmp` before a large
   overwrite anyway. Do not rely on `/tmp` as a long-term backup; it has been cleared before.
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
- It assumes Git worktrees and a clean tracked tree are safe preconditions. **`src/` was untracked
  when this was decided**, so the worktree-based flow would silently "protect" nothing. (`src/` has
  since been committed, but the reason for the decision stands.)
- Its useful parts are **already installed individually and better adapted**: TDD
  (`test-driven-development`), verification-before-claiming (`verification-before-completion`),
  systematic debugging, and code review are all present as standalone skills.

**Residual artifact of that removal:** two skills still referenced `superpowers:`-namespaced
skill IDs that resolve nowhere in this setup. Those references were repointed to the local
un-namespaced skills on 2026-09-30 — `systematic-debugging/SKILL.md` and
`test-driven-development/writing-good-tests.md`. Do not reintroduce the prefix.

---

## 12. Seeding — conventions established (no seed content yet)

**There is no `scripts/` directory and no `scripts/seed.ts` today, and this pass did not create
one.** The conventions below are the settled answer to PHASES Phase 2 task 6 ("Establish
seed/test-data conventions") — they exist so the first seed has a home, not because seeding has
happened. An earlier revision of this file (and of the `scholars-project` skill) described a broken
seed file with an infinite loop; that file was deleted. Do not go looking for it and do not treat
its absence as a regression to restore.

**The conventions:**

1. **Location:** seeds live in `scripts/seed.ts` (create `scripts/` when the first seed is
   written; do not scatter seed logic across `src/`).
2. **Client:** authored against `db` imported from `src/db/client.ts` — never a second client or a
   hand-rolled pool.
3. **Entry point:** exposed via an explicit `package.json` script **`db:seed`**, added in the same
   change as the first seed. `db:seed` does not exist yet, so it stays on §3's
   "Commands that DO NOT exist" list until then.
4. **Idempotent:** upsert on natural keys (`onConflictDoUpdate`), never a blind insert — re-running
   a seed must be safe.
5. **Target discipline:** never run a seed against a database you cannot positively identify from
   `DATABASE_URL` (§7 — `aims-postgres` on 5432 is another project's).

**Drizzle has no seed hook** — `drizzle-kit` has no `seed` subcommand (verified against
`drizzle-kit --help`: only `generate`, `migrate`, `introspect`, `push`, `studio`, `up`, `check`,
`drop`, `export`) and will not discover or run a seed file for you. That warning stands.

**Current state: one seed exists — the Phase 3 authentication super-admin plus the Phase 4
authorization data.** `scripts/seed.ts` requires `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL` is
optional (default `superadmin@scholars.local`), and it is exposed as `pnpm db:seed`, run via
**`tsx`** (added as a devDependency 2026-10-06: Node's native type stripping cannot resolve the
extensionless imports used throughout `src/`). It is idempotent (upserts on the case-insensitive
email natural key and on `user_credentials.user_id`), refuses to target anything but a localhost
PostgreSQL (§12 rule 5), prints its exact host/port/db before writing, and hashes through the
module's own `hashPassword` — so a seeded account is byte-for-byte compatible with what login
verifies against. Two runs verified 2026-10-06 (idempotent, same row updated in place).

The authorization part (added 2026-10-06, Phase 4): inserts **one row per key in
`PERMISSION_KEYS`** (27) with human-readable `describe`, the **nine system roles**
(`super-admin`, `admin`, `accountant`, `floor-incharge`, `teacher`, `hr`, `student`, `guardian`,
`other-staff`) as platform roles (`institution_id null`, kernel-verified bundles traced to
`PRD.md` §21), their `role_permissions` grants (72 rows), and the live platform-wide
Super Admin `user_roles` grant for the seeded account. All of it select-then-insert on natural
keys (`permissions.key`, platform `roles.slug`, the `role_permissions` PK, the live
`user_roles` grant) inside one transaction — re-running makes no new rows (verified: second run
unchanged, 27/9/72/1). `other-staff` carries zero defaults by design (`PRD.md` §21). The
`e2e/auth.spec.ts` suite is hermetic and does **not** rely on the seed; it creates and deletes
its own account.

**`.next/dev/types/validator.ts` can hold stale route references.** A deleted page left a
dangling import that broke `tsc` even though the source was gone. Fix: `rm -rf .next`.

---

## 13. Repository traps

### `db.transaction(fn)` already exists — do not hand-roll a transaction helper

`db.transaction(fn)` on the Drizzle client handles the whole lifecycle — acquire, `BEGIN`, commit,
`ROLLBACK`, release — including nested savepoints. A hand-rolled helper duplicated every one of
those behaviours with a worse error taxonomy; it was written, found redundant, and deleted.

```ts
const result = await db.transaction(async (tx) => {
  // tx has the same query surface as db: tx.select() / tx.insert() / tx.update() / tx.execute()
  return something;
});
```

`PgTransaction` is **not** re-exported as a usable named type, so do not import it by name.
`src/db/client.ts` derives it instead:

```ts
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

Deriving means the type cannot drift from the driver, and no transitive package is depended on.
Use `DbTransaction` in any function that must run inside a caller's transaction.

### `vitest.config.ts` used to exclude the entire database layer — a test there never ran

The exclusion existed to keep generated artifacts out of the run, but `include` is already
`src/**/*.test.ts`, which generated JSON/`.d.ts` output can never match. So the directory
exclusion bought nothing and suppressed every `*.test.ts` in the database layer instead.
A `src/db/env.test.ts` was written, `pnpm test` reported green, and it had never executed.
Narrowed to `["node_modules/**", ".next/**"]`, and the same trap has **not** been reintroduced for
`src/db/**` (there is nothing generated there — `drizzle/**` is the generated directory and ESLint
ignores that instead). **If a new test file seems to not run, check this first** — a green run
that silently skipped the file is worse than a failure.

### Zod 4 differences that produce wrong-but-plausible results

| Behaviour | Detail |
|---|---|
| **Single-character TLD is rejected** | `z.string().email()` rejects `a@b.c`; Zod 3 accepted it. Realistic addresses are unaffected, but test data written from Zod 3 habits fails. |
| **`trim()` / `toLowerCase()` do apply before `.email()`** | Checks run in chain order, so normalizing first is correct. |
| **Type failures need `error`** | `z.string()` on `undefined` reports `Invalid input: expected string, received undefined`. Pass `.string({ error: "DATABASE_URL is required." })` to name the variable an operator must set — the Zod 3 `required_error` / `invalid_type_error` pair is gone. |

**`pnpm db:generate` writes files even though it never touches the database.** It creates
`drizzle/<tag>_<name>.sql` plus a snapshot under `drizzle/meta/` and updates `drizzle/meta/_journal.json`,
so the working tree changes even though nothing is applied. That is correct and desirable — those
files are the deliverable and they are committed. Just do not run it to "see what would happen" and
then forget to review or commit the result.

**Migrations are plain `.sql` files, not TypeScript.** The generated tree is flat — a SQL file
beside `meta/`, not a directory per migration:

```text
drizzle/
  0000_steady_johnny_blaze.sql  the actual DDL — this is what you read in review
  meta/
    0000_snapshot.json       the schema state after this migration
    _journal.json            ordered list of migrations (tags the file above)
```

So reviewing a migration means reading that `.sql` file — a real, diffable SQL file, which is a
genuine improvement over the previous `migration.ts` class-based format. There is **no
`storageHash` and no contract hash**; the journal orders migrations by its `when` timestamp instead.
Verified database facts: PostgreSQL **17.11**, `public` schema already exists, **145 tables**,
**45 enums** (baseline applied 2026-10-06), role `user`.

### Regenerating migrations: kit swallows errors — validate with psql (2026-10-06)

`pnpm db:migrate` / a failed `db:generate` cycle exits 1 with **no error output** — the spinner
renderer swallows the exception (even a TTY `script` capture shows nothing). Debug the SQL, not
the spinner:

```bash
PGPASSWORD=*** psql -h localhost -p 5433 -U user -d scholars_sms_database \
  -v ON_ERROR_STOP=1 -1 -f drizzle/0000_*.sql   # single transaction; rolls back on first error
```

Loop: fix schema → `rm -rf drizzle && pnpm db:generate` → `pnpm db:check` → psql validate →
repeat until exit 0. **A successful full-file run applies the DDL for real** (it commits); reset
with `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` before the official `pnpm db:migrate`
so the `drizzle.__drizzle_migrations` bookkeeping row gets written. Four real defects this loop
found, all fixed in the baseline:

1. **`src/db/schema/index.ts` must re-export `./_enums`.** It did not, so kit emitted **0
   `CREATE TYPE`** while 145 tables referenced the enums (`user_status` fails first). Any new
   helper module (`_*.ts`) whose tables depend on its types needs a barrel export or its DDL is
   silently omitted.
2. **Dangling comma in a CHECK array literal** — `hr.ts` had `in ('pending',)`; fails at CREATE
   TABLE. After regenerating, grep the SQL for every CHECK you touched.
3. **CHECK comparing text to enum** — `${t.a} <> ${t.b}` errors when `a` is `text`/`varchar` and
   `b` is an enum: cast the enum to text (`${t.b}::text`), never the reverse (Postgres will not
   implicitly cast enum → varchar).
4. **An FK target must be a unique *constraint*, not a unique index** — kit emits
   `CREATE UNIQUE INDEX` *after* every `ALTER TABLE ... ADD FOREIGN KEY`, so a `uniqueIndex()`
   FK target fails with `there is no unique constraint matching given keys`. Use `unique()`
   (inline in CREATE TABLE). `job_definitions.job_type` had exactly this. The contract test was
   blind to it — it counted unique indexes as valid keys — and now collects
   `getTableConfig().uniqueConstraints` instead.

**LSP diagnostics on schema files are unreliable.** The IDE reported errors `npx tsc --noEmit`
never saw (stale ambiguity on `biometricDevices`, a nonexistent `currencyCodeCheck` export).
`tsc` is the only authority; run it before "fixing" a squiggle.

**`drizzle-kit` does not mask credentials** — there is no equivalent of a redacting schema-print
command, so neither `drizzle.config.ts` nor `src/db/env.ts` may ever echo `DATABASE_URL`.
Keep the URL in `.env` and out of logs, error messages, and committed files.

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

**`src/` is now tracked**, so a deletion there is recoverable from git — that incident (a schema
file truncated to 0 bytes by an editor saving an empty buffer, saved only by an out-of-band `/tmp`
copy) is what prompted committing it. Copy a directory to `/tmp` before a
large edit anyway, but understand that `/tmp` is **not** durable: both backup directories from that
incident are now gone. Do not treat a `/tmp` copy as the safety net it once was.

**Tests now exist and are enforced.** `vitest.config.ts` includes `src/**/*.test.ts` and the
`--passWithNoTests` escape hatch has been **removed**, so an empty suite is now a failure rather
than a false green. **124 tests run across 8 files** covering `shared/errors`, `shared/money`,
`shared/logging`, `shared/validation`, `shared/authorization`, `db/env`, `db/schema` (contract
invariants), and `lib/utils`.

`playwright.config.ts` points `testDir` at `./e2e`, which **now exists** (since 2026-10-06, with
`e2e/smoke.spec.ts`) — earlier revisions of this paragraph said it did not. `pnpm test:e2e` results
were not verified by this pass. Vitest is fast and deterministic; the suite spawns no
subprocesses.

**No test catches a missing migration.** `pnpm db:generate` is idempotent against a correct schema,
so a test based on it cannot detect the real failure mode — a schema edit with no migration
committed. **That check is a manual review responsibility** (see §3, "Why there is no drift gate").

**ESLint and Playwright gaps that are now closed:** `eslint.config.mjs` ignores the generated
`drizzle/**` tree — note it deliberately does **not** ignore `src/db/**`, because under Drizzle
that is hand-written source, and ignoring it would hide real code from lint; Playwright's
`testDir` is `./e2e`, not `./src/app/e2e` — specs inside `src/app/` would be picked up by the App
Router as a route segment. `playwright-report/`, `test-results/`, `coverage/` and
`*.tsbuildinfo` are already in `.gitignore`; an older revision of this file listed the first two
as unignored, which is stale.

**Two peer warnings from `pnpm peers check` (not blocking, both understood).**
`@types/node@20.19.43` is below Vitest's `^22.0.0 || >=24.0.0`; the fix is to raise it, which is a
dependency decision rather than a silent edit. `@hookform/resolvers` wants `effect@^3.14` and
resolves to `^3.17`, but nothing imports `@hookform/resolvers` yet, so the mismatch is dormant.

**Node is pinned as of 2026-10-06** (previously this paragraph read "No Node version pin exists").
`.nvmrc` holds `26.8.1` and `package.json` declares `engines.node: ">=26.8.1"`, per `TECH-STACK.md`
§5. Open question 4 in §16 is resolved on that basis.


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
| `.claude/`, `.cursor/`, `.agents/`, `.devin/skills/` | agent-bundled | Remaining non-project skills |
| `~/.config/opencode/skills/` | personal | ~34 skills, global scope |
| `~/.agents/skills/` | agent-bundled | ~36 skills |

**Two project skills are valid on disk but missing from the registry.** `scholars-project` and
`drizzle-workflow` both fail `skill({ name: ... })` with *"Skill not found"*. **Root cause
established 2026-09-30 by reading the discovery code out of the OpenCode 1.18.33 binary:** the
registry is a snapshot computed at session start and is not re-scanned. The session in which
this was observed was created at **14:10:27Z**; every loadable `.opencode/skills/` directory is
dated `Sep 29 13:20`, while only these two were created *after* the snapshot. Their frontmatter is valid and their
directory names match, so this is **not** a malformed file. A session restart is the fix; there is no way to force a rescan
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

**Full skill audit (2026-09-30 baseline).** All `SKILL.md` files across all roots had valid YAML
frontmatter, every `name` matched its directory, and every one had a `description`. **Zero invalid
skills.** The counts below are the 2026-09-30 baseline; the totals are now lower after the 2026-10-05
ORM cleanup removed 16 skill directories (≈290 files) from the repo and 6 more from the global
skill roots. Re-audit before quoting a total.

Duplicate resolution **is** deterministic, and I confirmed the mechanism from the OpenCode 1.18.33
binary: same-named skills are inserted into a map in scan order and the **last write wins** (a
`duplicate skill name` warning is logged for the loser). Scan order puts external roots
(`~/.claude`, `~/.agents`, then the project equivalents) **before** the config skill roots, so
`.opencode/skills/` always wins over `~/.agents/skills/`.

| Duplicated name | Copies | Note |
|---|---|---|
| `design-system`, `motion`, `ui-ux-pro-max` | ×2 each | `.opencode` vs `.agents`, differing content |
| `shadcn`, `find-skills` | ×2 each | byte-identical mirrors, no risk |

**The stale-ORM skill hazard is now ELIMINATED (2026-10-05).** It used to be *shadowed, not live*:
some skills carried "archived, do not follow" banners only in their `.opencode/skills/` copies,
while unmarked duplicates in `~/.agents/skills/` still taught commands that do not exist here. The
mitigation was load-bearing — a precedence accident away from being live.

It is no longer load-bearing because **every such directory has been deleted**, from the repo *and*
from `~/.agents/skills/` and `~/.config/opencode/skills/`. No ORM other than Drizzle has a skill
installed anywhere, and no other ORM CLI is installed.

**Caveat:** another checkout on this machine could reintroduce a copy. If a skill ever teaches a
different ORM, it is stale — the data layer is Drizzle (§3).

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
not needed for a Next.js/TypeScript project). Motion and Motion Plus remain enabled. The **global**
Playwright MCP command was corrected to `npx -y @playwright/mcp@latest` and its `--help` exits 0.
The **global PostgreSQL MCP is still wrong** — it launches `npx -y postgresql`, which is not the
Postgres MCP server; it was left untouched because it lives in the user's global config and
repairing it needs a decision on which server to use. `MCP-HEALTH-REPORT.md` predates these
changes and is stale.

---

## 15. File map

```
.env / .env.example           DATABASE_URL (env is git-ignored; example is tracked)
.nvmrc                        26.8.1 — Node pin (matches engines.node, added 2026-10-06)
.prettierrc                   Prettier config (semi, double quotes, width 100, lf)
.prettierignore               skips *.md, drizzle/, lockfiles, .next/, agent/tooling roots
compose.yaml                  postgres:17-alpine, port 5433, named volume, healthcheck
drizzle.config.ts              dialect + schema path + DATABASE_URL (defensive)
drizzle/                       GENERATED by drizzle-kit; committed; baseline + meta/
  0000_steady_johnny_blaze.sql   the baseline migration (generated, applied 2026-10-06)
  meta/_journal.json           ordered migration journal
  meta/0000_snapshot.json      schema state after the baseline
e2e/
  smoke.spec.ts                E2E smoke spec (created 2026-10-06 by a concurrent agent;
                               test results NOT verified by this pass)
src/db/
  env.ts                       readDatabaseUrl(): Zod-validated DATABASE_URL
  env.test.ts                  env validation tests
  client.ts                    db = drizzle(url, { schema }); DbTransaction derived
  schema/index.ts              barrel: re-exports 22 modules + spreads relations (§3, §5)
src/shared/
  errors/                      BusinessRuleError / ValidationError (index.ts)
  logging/                     structured logger (index.ts, audit.ts, redact.ts)
  money/money.ts               Money = bigint minor units, scale 2, exact
  validation/fields.ts         reusable Zod field builders
  authorization/permissions.ts typed Permission.key constant (ADR-0001)
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
public/                       EMPTY — no static assets
components.json               shadcn config: base-lyra style, phosphor icons, rsc:true
package.json                  pinned exact versions; drizzle scripts; test = `vitest run`
                              verify = typecheck + lint + test + db:check
                              format / format:check = prettier --write . / --check .
                              db:seed = tsx scripts/seed.ts (see §12)
                              engines.node = ">=26.8.1"
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
  drizzle-workflow/           Drizzle pipeline, conventions, db: commands, lost-capability note
```

**No CI configuration exists** — no `.github/`, no `.gitlab-ci.yml`, no CI provider of any kind.
Every gate in §6 is therefore local and manual. Nothing enforces them remotely.

Skill inventory: was **119 `SKILL.md` files** across `.opencode/`, `.agents/`, `.claude/`,
`.cursor/`, `.devin/` and two personal roots (`~/.config/opencode/skills`, `~/.agents/skills`),
all valid as of 2026-09-30. **16 skill directories were deleted 2026-10-05** from the vendored
roots and 6 more from the personal roots, so the current count is ~285 files lower. Re-count before
quoting a total.
See `skills-inventory.md` for precedence and duplicate-name collisions.


---

## 16. Open questions

**Still open:**

5. **What replaces the deleted UI components?** `header.tsx` and `user-menu.tsx` were removed
   ahead of the architecture rebuild.

**Resolved 2026-10-06:**

- 4. ~~Should Node be pinned?~~ **Yes — pinned.** `.nvmrc` contains `26.8.1` and `package.json`
  declares `"engines": { "node": ">=26.8.1" }`, per `TECH-STACK.md` §5 ("Runtime Requirements" —
  the exact Node version must be pinned, recommended files `.nvmrc` + `package.json`). Verified
  2026-10-06; this supersedes the "No Node version pin exists" paragraph that used to sit in §13.

**Resolved 2026-09-30** (decided and applied, not silently changed):

- ~~Should `package-lock.json` be deleted?~~ **Yes — deleted.** `pnpm-lock.yaml` is the sole
  lockfile and `--frozen-lockfile` passes. See §13.
- ~~Should the ORM stay what it was in September?~~ **No — superseded.** Drizzle ORM adopted
  2026-10-05 at the user's explicit instruction. See §3. The previous ORM packages, its `src/`
  directory, its config file, its notes doc, the contract-integrity test and every vendored ORM
  skill were deleted from the repo and from the global skill roots.
- ~~Keep the schema backup in `/tmp`?~~ **Superseded — the backup is gone.** `/tmp` was cleared and
  both backup directories no longer exist; that schema was never committed, so the 20-model design
  is not recoverable as source. Only its shape is recorded (§5). Do not plan around a backup that is
  not there.
- ~~Should the DB get a compose file?~~ **Yes — `compose.yaml` added**, not started because the
  ad hoc container owns the name/port. See §6.
- ~~Should tests be written before features?~~ **Yes — a 124-test foundation now exists** and
  `--passWithNoTests` is gone, so CI cannot go green on an empty suite. See §13.

**Decided 2026-09-30 by the user:**

1. ~~What auth solution?~~ **Deferred to Phase 4**, but the *authorization model* must be derived
   and written up as an ADR during Phase 1, because it determines the Phase 3 schema. The
   archived design's competing `User.role` string **and** `Role`/`Permission` tables must be
   replaced by one coherent model.
2. ~~Where should the schema backup live?~~ **Superseded.** It lived in `/tmp` and was lost when
   `/tmp` was cleared. Nothing to keep or re-verify — the ORM that produced it is gone too.
3. ~~Is `src/` going to be committed?~~ **Yes — done.** Committed as `2b520ad` (44 files).
   `src/` is now fully tracked; deletions are recoverable.
6. ~~Does the rebuild keep `Class → Group → Section`?~~ **Yes — resolved 2026-09-30.**
   Unanimous across `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `.opencode/ai-workflow.json` and the
   since-deleted schema: `Institution → AcademicSession → Class → Group → Section → Student`, with
   **Group above Section** (a Group holds Sections; e.g. Computer Science holds Alpha/Beta).
   Not a blocker.
7. **How is schema drift caught?** **Answered
   2026-10-05: it is not, and that is accepted.** `pnpm db:check` checks migration-file consistency
   only. The compensating control is procedural — schema edit + generated migration in the same
   commit, and only `db:migrate` ever applied to a real database. See §3.

---

## 17. Development state (PHASES.md §6)

Persistent resume state required by `PHASES.md` §6. Kept here because `MEMORY.md` is the
project's existing memory mechanism, not a separate file.

Numbering follows **PHASES.md** (authoritative). Legacy internal numbering used elsewhere in
this file maps as: legacy Phase 0 = PHASES Phase 0; legacy Phase 1 (domain/ADRs) ≈ PHASES
Phase 2 tasks 1–16; legacy Phase 2 (schema) = PHASES Phase 2; legacy Phase 3 (schema shipped)
= PHASES Phase 2 complete; legacy Phase 4 (auth) = PHASES Phase 3.

**Current phase:** Phase 4 — Roles, Permissions & Authorization (`COMPLETED`)
**Current step:** Phase 5+ — feature phases (follow PHASES.md dependency order) — next
**Current sub-step:** Phase 4 closed out 2026-10-06: all 14 tasks implemented. Capability
RBAC (ADR-0001) is now enforced at three independent layers — the **application** (`resolvePrincipal`
→ `requireUserPermission`/`canUser`; denied actions throw `ForbiddenError` before any mutation runs),
the **data** (a 27-key permission registry, 9 kernel roles, direct grants/denies, platform-scoped
super-admin — seeded, seed-verified idempotent), and the **UI** (`PermissionsProvider` +
`useHasPermission`, plus server-rendered gates — hide, never authorize). Accessibility of the
resolved principal to client components cannot be disabled without changing the server guard.

### Phase states (PHASES.md §6)

| Phase | State | Notes |
|---|---|---|
| Phase 0 — Discovery & Engineering Baseline | `COMPLETED` | incl. task 17 baseline verification report: frozen install, verify, format:check, build, test:e2e all green (2026-10-06) |
| Phase 1 — Project Infrastructure & Runtime Foundation | `COMPLETED` | All 18 tasks done. This session: task 2 (constitution tsconfig flags added), task 4 (Prettier configured + repo formatted), task 17 (E2E infra: `e2e/smoke.spec.ts` + fixed Playwright webServer), task 18 (`pnpm verify` / `format:check` / `build` / `test:e2e`). Caveats → known issues below |
| Phase 2 — Database & Domain Foundation | `COMPLETED` | All 18 tasks. Task 17 done 2026-10-06: baseline `drizzle/0000_steady_johnny_blaze.sql` applied via `pnpm db:migrate` — 145 tables, 45 enums, one `drizzle.__drizzle_migrations` row; full gate re-run green. Regeneration traps documented in §13 |
| Phase 3 — Authentication & Identity | `COMPLETED` | All 15 tasks done 2026-10-06. Auth.js v5 (ADR-0005); `src/modules/auth/{domain,application,infrastructure,ui}` + `src/auth.ts` + `/api/auth/[...nextauth]` + `(auth)` pages + `(app)` guard layout + `src/proxy.ts` + DAL. `@auth/drizzle-adapter` deliberately **not** installed (documented deviation). 59 auth unit tests + 3 e2e. Seed added (§12) |
| Phase 4 — Roles, Permissions & Authorization | `COMPLETED` | All 14 tasks done 2026-10-06. `src/modules/authorization/{domain,application,infrastructure,ui}` + `src/lib/permissions.ts` + `(app)` layout/page wiring + `scripts/seed.ts` authorization part (27 permissions, 9 kernel roles, 72 grants, platform Mark-All super-admin grant — seed-verified idempotent). 24 authorization unit tests; total 207. Mask-002 (the smoke spec's stale title) fixed — anonymous `/` → login, smoke asserts `/login` now |
| Phases 5+ | `NOT_STARTED` | Follow PHASES.md dependency order |

| Item | State |
|---|---|
| Completed | **Phase 0 entirely**; **Phase 1 entirely**; **Phase 2 entirely** (schema 145 tables/378 FKs/364 checks authored; baseline migration applied 2026-10-06; ADRs 0001–0004; D-1…D-9 recorded); **Phase 3 entirely** (auth, ADR-0005); **Phase 4 entirely** (capability RBAC end-to-end) |
| In progress | none — no sub-step in flight |
| Remaining | feature phases 5+ |
| Shared foundation shipped | `src/shared/{errors,money,logging,validation,authorization}` — each with an `index.ts` public surface and tests |
| Database changes | `src/db/schema/` authored — **145 tables**, 378 FKs, 364 check constraints. **Applied to the local dev database**: 145 tables + 45 enums present in `public` |
| Migration status | `drizzle/0000_steady_johnny_blaze.sql` generated, `db:check`-clean, **applied** 2026-10-06 (one `drizzle.__drizzle_migrations` row). Future `db:migrate` runs still need §59 approval |
| Tests passing | 18 files / **207 tests** (`pnpm test`), including 59 auth-module, 24 authorization-module and 13 schema-contract tests; **E2E: 4 tests** (`pnpm test:e2e`, green — 1 smoke + 3 auth) |
| Tests failing | none |
| Verification status | 2026-10-06 full gate green (Phase 4): `pnpm verify` (typecheck + lint + 207 tests + `db:check`) · `pnpm format:check` · `pnpm build` · `pnpm test:e2e` (4) — all pass |
| Known issues | ESLint import-boundary enforcement for `src/modules/**` is documented but **not yet configured**; **no CI pipeline exists** (commands are CI-compatible); **no schema-drift gate exists** (Drizzle cannot do it) — see §3; **95 non-primary `uuid` columns carry no foreign key, and a contract test now guards every one of them by name** (see §5) — of those, 12 are unexplained and believed to be omissions (`permissions.institutionId` — its *purpose* (institution-scoped permissions, `ADR-0001`) is confirmed and exercised by Phase 4's seed, but the absent `REFERENCES institutions` is still a decision to make; `attendanceExceptions.institutionId`, `schedulePublishHistory.scheduleId`, `teacherLeaveBalances.{academicSessionId,leaveTypeId}`, `teacherWorkloadHistory.academicSessionId`, `teacherAbsences.leaveRequestId`, plus `journalTransactions.{paymentId,payrollRunId}`, `payments.depositedToAccountId`, `payrollPayments.ledgerAccountId`, `payrollRuns.journalTransactionId`) and need a decision, not an assumption. **E2E cold-compile note:** the first hit of `/api/auth/*` compiles the contacts route (zod + argon2 + drizzle) and can exceed the 5s `expect` timeout — `e2e/auth.spec.ts` warms the route in `beforeAll` |
| Gates | `pnpm verify` clean · `pnpm format:check` clean · `pnpm build` succeeds · `pnpm test:e2e` 4 passed |
| Architectural decisions | D-1 authorization = capability RBAC + explicit scope (ADR-0001); D-2 per-session placement; D-3 admission separate from student; D-4 lifecycle vs archival split; D-5 actors split into assigned roles and derived bindings; D-6 layer boundaries in `src/modules/README.md`; D-7 money = `numeric(18,2)` + explicit currency, computed balance, no decimal dep (ADR-0003); D-8 teacher = optional User + Teacher profile + TeachingAssignment (ADR-0002); D-9 guardian = ParentGuardian person + optional User, access only via GuardianLink, no `Student.guardianId` (ADR-0004); D-10 auth = Auth.js v5, Credentials + JWT strategy with server-side `sessions` rows as the authoritative revocation gate, Argon2id via `@node-rs/argon2`, no `@auth/drizzle-adapter` (ADR-0005); D-11 authorization = capability RBAC enforced in the application layer (`resolvePrincipal` → `requireUserPermission`/`canUser`, `ForbiddenError` on denied actions), with the UI (`PermissionsProvider`/`useHasPermission`) as a hide-not-authorize convenience and the DB kernel roles as defaults — super-user expressed as data (platform `super-admin` grant), not a boolean (ADR-0001) |
| Infra decisions (this session) | Prettier config (`.prettierrc`/`.prettierignore`, `eslint-config-prettier` wired); Node pinned (`.nvmrc` = 26.8.1, `engines >=26.8.1`); tsconfig hardened with constitution flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`) — 4 resulting errors fixed in `playwright.config.ts`, `src/components/ui/{scroll-area,sonner,calendar}.tsx`; Playwright `webServer.command` = `node node_modules/next/dist/bin/next dev` (pnpm-spawned `next dev` is SIGKILLed on teardown and orphans port 3000); `tsx` added for `db:seed`; `src/proxy.ts` replaces the deprecated `middleware.ts` (Next 16); authorization module mirrors the auth module's domain/application/infrastructure/ui layering; `resolvePrincipal` is `React.cache`-d on the `institutionId` primitive (per-request, one live delegation load); seed's `SELECT`-then-insert (drizzle `onConflictDoUpdate({target})` cannot express functional-index keys like `lower(email)`, and `db:generate`/`.sql` regeneration traps are unchanged — §13) |
| Blockers (§59 — user decisions required) | **All three resolved 2026-10-06.** 1. ~~Apply the baseline migration~~ → applied (`pnpm db:migrate`, 145 tables + 45 enums). 2. ~~Auth mechanism~~ → **Auth.js (NextAuth v5)** approved. 3. ~~Commit the working tree~~ → committed across 6 commits (`a058bda`…`0750f26`, on top of `f8b256d`). Standing rule: future `db:migrate` applications and any auth package outside Auth.js still need explicit approval |
| Step 2.3 verified | Connection works (PG 17, `public` exists, **145 tables, 45 enums** — baseline applied); migrations are plain `.sql` files; `db:generate` writes files but never the DB — see §13. Env validation added (`src/db/env.ts`); **no transaction helper is needed — `db.transaction(fn)` already exists**, see §13 |
| Step 2.6 authorization scope | Typed `PERMISSION_KEYS` (every key cites its PRD/RULES source), `Principal`, `requirePermission`, `requireInstitutionScope`, `requireSelfScope`. Guardian/teacher scope and the state check are deliberately left to the application and domain layers |
| Required user actions | none outstanding — standing §59 approvals only (future `db:migrate`, non-Auth.js auth packages) |
| Last verified state | 2026-10-06: frozen install, `pnpm verify` (207 tests), `pnpm format:check`, `pnpm build`, `pnpm test:e2e` — all green **after** Phase 4 completed; runtime proof: superadmin sign-in shows the permission-aware home (4/4 capabilities Granted, resolved live); working tree clean and committed |
| Exact next action | Read the next PHASES section → begin the first feature phase in dependency order (Phase 5+) → verify per task |

### Environment snapshot

`scholars-postgres` (`postgres:17-alpine`) is up on host port **5433** (verified 2026-10-06)
holding the **applied baseline**: 145 tables, 45 enums, **plus the Phase 4 authorization seed
data** (27 permissions, 9 system roles, 72 role grants, the live platform `super-admin` grant —
idempotent on re-run). `e2e/` exists (4 specs: 1 smoke + 3 auth); `scripts/seed.ts` is the seed
(`pnpm db:seed`). `drizzle/` holds the baseline migration plus `meta/`.

**Working tree committed 2026-10-06** (clean; 6 commits `a058bda`…`0750f26` on top of
`f8b256d`): tooling, schema + migrations, shared foundation, e2e, docs, and the vendored agent
roots (`.agency-agents` is vendored as plain files; 273 of its files are skipped by *its own*
upstream `.gitignore`). `/tmp` backups remain unreliable across sessions — git is now the safety
net. `.env` stays untracked by design (`.gitignore`), with `.env.example` committed.

