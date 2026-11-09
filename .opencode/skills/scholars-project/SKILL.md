---
name: scholars-project
description: Use when working anywhere in the Scholars Student Management System - before planning features, adding routes, touching src/components/ui, or deciding on stack questions. Records verified versions, the Class-Group-Section terminology, UI conventions (Base UI + Phosphor, not Radix + Lucide), and the exact verify commands. Read this first on any non-trivial task in this repo.
---

# Scholars Student Management System — Project Conventions

The single source of truth is **`MEMORY.md` at the repo root**. This skill is the compressed,
task-oriented version. If they disagree, `MEMORY.md` wins.

## Current state: Phases 0–3 complete, features not started

The app renders an empty home page. No feature routes, no auth, no API, no server actions, no
database queries. `src/components/ui/**` (31 shadcn components) is currently imported by
nothing. `header.tsx` and `user-menu.tsx` were deliberately removed ahead of the rebuild.

Work follows **`PHASES.md` phase order** (resume state in `MEMORY.md` §17: Phases 0–3 done,
Phase 4 next). **Do not skip ahead to later-phase features while the current phase is
incomplete** — Phase 4's auth mechanism is an open decision that needs user approval.

## Verified stack (read from `node_modules`, not from ranges)

Next.js **16.3.6** (App Router, Turbopack) · React **19.2.8** · TypeScript **5.9.3** ·
Tailwind **4.3.3** · Drizzle ORM **0.45.3** + `drizzle-kit` **0.31.11** + `pg` **8.23.1** ·
Zod **4.6.5** · React Hook Form **7.89.0** · TanStack Table **9.2.4** · Zustand **5.0.15** ·
Vitest **5.0.2** · Playwright **1.63.0** · `@phosphor-icons/react` **2.1.10** ·
`@base-ui/react` **1.8.0** · Node **26.8.1** · pnpm **12.6.0**

Node is pinned: `.nvmrc` = `26.8.1` and `package.json` has `engines.node: ">=26.8.1"`.

### Next.js 16 has breaking changes

`AGENTS.md` is auto-generated and instructs: **read the bundled docs at
`node_modules/next/dist/docs/` before writing any Next.js code.** Do not assume App Router
behaviour matches training data. The file is rewritten by `next dev`; leave it in diffs.

## Terminology — schema complete, database migrated, no queries yet

`src/db/schema/` holds **145 tables across 22 domain modules**, re-exported by the
`src/db/schema/index.ts` barrel (Phase 3 is done). The baseline migration
`drizzle/0000_steady_johnny_blaze.sql` is generated, `db:check`-clean, and **applied** (2026-10-06:
145 tables, 45 enums, one `drizzle.__drizzle_migrations` row) — but no code issues queries yet.

The hierarchy is mandated by `RULES.md` + `.opencode/ai-workflow.json` and modelled as
required FKs in `src/db/schema/academic.ts` (`academic_groups.class_id` and
`academic_sections.group_id` are both non-nullable):

```
Institution
  └── AcademicSession        (isCurrent marks the active session)
        └── Class             (gradeLevel)
              └── Group       ← Group is ABOVE Section
                    └── Section  (capacity)
```

`Class → Group → Section` is a hard three-level chain — do not flatten, merge, or rename these
levels. Confirm the shape before modelling. The old 20-model contract backup at
`/tmp/opencode/contract-backup-20260930-144738/` is **gone** (`/tmp` was cleared; that design
was never committed) — only the shape above survives. For current code see the `src/` trap
below: most of `src/` is in git, but the newest database files are not yet tracked.

## UI conventions

- **Icons: `@phosphor-icons/react`, not Lucide.** `lucide-react` is not installed.
  Use the `Icon` suffix: `ListIcon`, `BellIcon`, `CheckIcon`. That is the v2 API.
- **Primitives: Base UI, not Radix.** `components.json` uses `style: "base-lyra"`; components
  import `@base-ui/react/*`. Do not introduce `@radix-ui/*` without migrating the style
  deliberately.
- Class merging is the **`cn` package** (v0.4.0), not `clsx` + `tailwind-merge` — neither of
  those is installed. **30 of 31 UI components import `import { cn } from "cn"` directly.**
  `src/lib/utils.ts` is a one-line re-export (`export { cn } from "cn"`) that only its own test
  imports today. Follow the existing convention — bare `"cn"` — when adding a component.
- Server Components by default; `"use client"` only for interactivity/state/effects.
- Mobile-first: 44–48px touch targets, vertical form layout, tables need a stated responsive
  strategy.

## Verify before claiming done

```
pnpm verify         # typecheck + lint + test + db:check   (no database needed)
pnpm build          # next build
pnpm db:generate    # after any src/db/schema edit
pnpm format         # Prettier --write; pnpm format:check verifies only
```

`pnpm verify` is the gate but it does **not** check formatting — that is `pnpm format:check`
(Prettier, `.prettierrc`); `eslint-config-prettier` is wired into `eslint.config.mjs` so lint
and format never fight.

E2E specs live in `e2e/` (Playwright `testDir: ./e2e`, outside `src/app` so the App Router
never picks up a spec as a route; the config starts `pnpm dev` itself). As of this reading
`e2e/` exists with a single spec, `e2e/smoke.spec.ts` (home-page smoke test) — written by
concurrent work, **not verified green by this document**. Run `pnpm test:e2e` yourself (it
needs a browser install) before claiming it passes; use `pnpm test` as the gate until then.

Note that `db:generate` and `db:check` never connect to a database, so verification is safe
offline. `db:migrate` and `db:push` do write — never run them without explicit approval.

## Traps

- **Schema exists and is migrated; no code queries the database, and there is no seed script.**
  145 tables are authored under `src/db/schema/` and **all exist in the live database** (baseline
  applied 2026-10-06; 45 enums; recorded in `drizzle.__drizzle_migrations`) but no code queries
  them. `scripts/` does not
  exist. `drizzle-kit` has no `seed` subcommand. Port 5432 belongs to `aims-postgres`, a
  different project — never touch it; `scholars-postgres` is on host port **5433**. A
  committed `compose.yaml` exists but is deliberately **not started**, because the ad hoc
  `scholars-postgres` container already owns that name/port.
- **There is no schema-drift gate.** Drizzle cannot verify a live database against the schema —
  nothing equivalent to a signed contract exists. A schema edit with no committed migration is
  therefore the realistic failure mode, and **nothing will fail the build to catch it**. Ship the
  `drizzle/` migration in the same commit as the schema change.
- **Most of `src/` is committed, but the newest database files are NOT (checked 2026-10-06).**
  59 files under `src/` are tracked, so ordinary deletions are recoverable — but
  `src/db/schema/`, `src/db/client.ts`, `drizzle/` and `drizzle.config.ts` were **untracked**,
  meaning the whole 145-table schema exists only in the working tree. Run `git status` before a
  large edit and commit those paths first. `/tmp` is not a fallback: both rebuild backups are
  gone, and `/tmp` has been cleared before.
- **Undeclared dependencies break clean installs.** Four packages that the build genuinely
  needs were missing from `package.json` and the lockfile: `@base-ui/react` (21 UI
  components), `class-variance-authority` (6), `shadcn` and `tw-animate-css` (both imported
  by `src/app/globals.css`). They are now declared. **When you add an import, declare the
  package in the same change** — `node_modules` is not a source of truth, and it currently
  also holds leftover shadcn-CLI packages that nothing imports.
- **`package-lock.json` has been DELETED (2026-09-30).** It was an npm lockfile describing an
  older dependency set and it misled `node_modules` about what was declared. pnpm is canonical:
  `pnpm-lock.yaml` + `packageManager: pnpm@12.6.0`. If you see `package-lock.json` reappear,
  it is a regression — delete it again.
- **`pnpm-lock.yaml` has two YAML documents and that is correct.** Document 1 is a pnpm
  bootstrap stub (`packageManagerDependencies: pnpm`); document 2 holds the real project
  resolutions. pnpm writes it this way and reads it fine — `pnpm install --frozen-lockfile`
  passes. Do not "fix" it by deleting the first document; that breaks
  `packageManagerDependencies`. Read the second document when checking whether a package is
  locked.
- **`.next/dev/types/validator.ts` can hold stale route references** after deleting a page.
  `rm -rf .next` fixes it.
- **Tests exist and are enforced.** `pnpm test` runs **124 tests across 8 files** (ran and
  verified 2026-10-06) covering `src/shared/**`, `src/db/env.test.ts`,
  `src/db/schema/schema-contract.test.ts` and `src/lib/utils.test.ts`. `--passWithNoTests` was
  **removed**, so an empty suite now fails rather than passing vacuously.
- **`src/app/favicon.ico` no longer exists** (deleted; the deletion is committed).
  `src/app/` holds only `globals.css`, `layout.tsx`, `page.tsx`. `public/` is empty.
- **Drizzle is the only data layer.** No other ORM is installed or approved. See
  `drizzle-workflow/SKILL.md`.

## Instruction precedence

1. `~/.config/opencode/AGENTS.md` — global engineering constitution
2. `AGENTS.md` (repo root) — generated Next.js rules; `CLAUDE.md` only does `@AGENTS.md`
3. `.opencode/ai-workflow.json` — execution workflow, change-safety rules, approved stack
4. `MEMORY.md` — verified reality
5. `src/` — actual code
6. `PRD.md` / `ARCHITECTURE.md` / `RULES.md` / `SOPs.md` / `DESIGN.md` — intent and rationale

When intent docs and `src/` disagree, `src/` wins — but surface the conflict rather than
silently choosing.

## Superpowers is intentionally not installed

`obra/superpowers` is OpenCode-compatible but would inject a second competing methodology over
this repo's existing governance (`AGENTS.md` constitution + `ai-workflow.json` + `RULES.md`).
Its three key skills are already vendored here (`systematic-debugging`,
`test-driven-development`, `verification-before-completion`). Do not add the plugin unless
`RULES.md` is retired.
