# Agent Skills Inventory — Scholars Student Management System

Source of truth for all OpenCode agent skills available to this project.

## Skill-discovery convention

Whenever a specific capability/knowledge gap arises for this project:

1. Use the `find-skills` skill (skills.sh / vercel-labs/skills) to search the skills.sh directory.
2. Find the most relevant existing skill on skills.sh (official repos > vendor > well-maintained OSS > established collections > trusted community).
3. Security-review the full skill contents (SKILL.md + scripts + references) before installing.
4. Install into `.opencode/skills/` (project) unless global availability is clearly warranted.
5. Never invent/fabricate skills — only find and install existing ones; document gaps instead.

Note: `find-skills` is installed at `.agents/skills/find-skills/SKILL.md` (agent-compatible path, also scanned by OpenCode; mirrored globally at `~/.agents/skills/find-skills`). Use it as the entry point for skill discovery.

## Loading rules

- Skills are loaded at OpenCode session start from `.opencode/skills/<name>/SKILL.md` (project) plus global locations. Restart OpenCode after installing/editing skills.
- **Verified 2026-09-30:** the registry is a *snapshot taken at session start*. Skill
  directories created after that snapshot are invisible until restart — `scholars-project` and
  `drizzle-workflow` are the confirmed cases. Their files are valid; do not edit or rename them to
  chase the error.
- **The snapshot covers CONTENT too, not just the list (verified 2026-09-30).** `skill()` returned
  pre-edit text for a `SKILL.md` that had already been fixed on disk. Consequences: skill edits
  need a restart to take effect, and **`Read` is the only source of truth for what a skill
  currently says — `skill()` output may be stale.**
- Skill `name` (frontmatter) must match its directory name and match `^[a-z0-9]+(-[a-z0-9]+)*$`.
- A skill is only advertised to the agent if it has both `name` and `description`.
- If a skill ID exists in both project and global scope, the later/precedence source wins (project overrides global).

## Installed skills

### Design / Brand / UI (in place before this task; global + project mirror)

| Skill | Scope | Purpose |
| --- | --- | --- |
| `banner-design` | global + project | Social/ads/hero/print banner design with AI visuals |
| `brand` | global + project | Brand voice, visual identity, messaging, brand compliance |
| `design` | global + project | Comprehensive design (logo, CIP, presentations, banners, icons, social photos) |
| `design-system` | global + project | Design tokens, component specs, brand-compliant presentations |
| `slides` | global + project | Strategic HTML presentations with Chart.js |
| `ui-styling` | global + project | shadcn/ui + Tailwind UI implementation, accessible components |
| `ui-ux-pro-max` | global + project | UI/UX design intelligence (searchable local database) |
| `codebase-memory` | global (`~/.config/opencode/skills`) | Codebase knowledge-graph usage for structural queries |
| `motion` | project (`.opencode/skills/`) | Motion / Framer Motion + CSS animation: best practices, docs & example search, spring generation, MotionScore perf audits, transition editor |
| `vercel-composition-patterns` | project + global | React composition patterns that scale (compound components, render props, context) |
| `vercel-react-best-practices` | project + global | Vercel React/Next.js performance guidelines |
| `verification-before-completion` | project + global | Evidence-before-claims gate; run verification before claiming work is done |
| `systematic-debugging` | project + global | Reproduce → isolate → root-cause before proposing fixes |
| `test-driven-development` | project + global | Red/green/refactor discipline |
| `webapp-testing` | project + global | Playwright driver for local web apps (localhost-only server lifecycle) |
| `seo-audit` | project | Technical SEO diagnosis and remediation |
| `domain-modeling` | project + global | Ubiquitous language, bounded contexts, ADRs |

### Added by skills task (project `.opencode/skills/`, all security-reviewed)

| Skill | Source (repo) | Domain gap | Phase relevance |
| --- | --- | --- | --- |
| `vercel-react-best-practices` | vercel-labs/agent-skills | Next.js/React performance | 10, 11, 12, 28 |
| `vercel-composition-patterns` | vercel-labs/agent-skills | React component architecture | 10, 11, 12 |
| `supabase-postgres-best-practices` | supabase/agent-skills | PostgreSQL best practices | 04, 28 |
| `seo-audit` | coreyhaines31/marketingskills | Technical SEO audit | 26 |
| `webapp-testing` | anthropics/skills | Playwright web-app E2E testing | 30 |
| `test-driven-development` | obra/superpowers | TDD red/green/refactor | 30 |
| `systematic-debugging` | obra/superpowers | Root-cause debugging discipline | all |
| `verification-before-completion` | obra/superpowers | Evidence-before-claims, DoD gate | 33, 34, all |
| `domain-modeling` | mattpocock/skills | Domain model + shared vocabulary | 03, 04, PRD alignment |

Sources (all MIT-licensed unless noted):
- `vercel-labs/agent-skills` (official Vercel)
- `supabase/agent-skills` (official Supabase)
- `anthropics/skills` (official Anthropic; `webapp-testing` license: LICENSE.txt)
- `coreyhaines31/marketingskills` (trusted community)
- `obra/superpowers` (superpowers by Jesse Vincent, community)
- `mattpocock/skills` (Matt Pocock, community)

### Project-specific skills (this repo, written for scholars-student-managment-system)

| Skill | Source | Purpose |
| --- | --- | --- |
| `scholars-project` | authored in-repo | Project conventions, terminology (`Class → Group → Section`), verify commands, repository traps |
| `drizzle-workflow` | authored in-repo | Drizzle pipeline, `pgTable` conventions, `db:generate`/`db:check` vs the DB-writing commands, current empty-schema state, "no seed script exists" |

Drizzle is the only ORM in this project. One vendored Drizzle skill is installed — see the ORM row
below — and current API behaviour is still checked against Context7
(`/drizzle-team/drizzle-orm-docs`). Every ORM skill that is not Drizzle has been removed from this
repo and from the global skill roots, and no other ORM CLI is installed.

### Vendored Drizzle skill (third-party, reference only)

| Skill | Source | Purpose |
| --- | --- | --- |
| `drizzle-orm` | `oakoss/agent-skills` (MIT, v1.1, sourced from official Drizzle docs) | Generic multi-dialect API reference: relations, views, filters/operators, advanced queries, mutations |

Installed to `.agents/skills/drizzle-orm` and symlinked into `.claude/skills/drizzle-orm`.
Installer risk scan: Gen **Safe**, Socket **0 alerts**, Snyk **Low Risk**. Reviewed by hand: pure
markdown, no `scripts/`, no executable code, no network calls, no credential handling.

**It is subordinate to the project skill `drizzle-workflow`**, which overrides it. Known conflicts,
documented in both `drizzle-workflow` and this file:

- It advertises `drizzle-kit push` as routine; here `db:push` is **approval-gated** because it
  bypasses migration history.
- It is driver-agnostic and multi-dialect (PostgreSQL/MySQL/SQLite); this repo is **node-postgres**
  (`pg`) only.
- It carries one incidental Prisma mention in prose. No Prisma dependency, tool, or codepath exists
  here, and nothing may import it.

There is **no** official Drizzle skills package on npm and **no** `drizzle-kit mcp` in the installed
`0.31.11`; the MCP adapter and Drizzle's own skills catalog ship only in `1.0.0-rc.*`, which
requires a matching `drizzle-orm` 1.x. Not adopted — that is a major data-layer upgrade, not a
config change.

## Evaluated and NOT installed (with reason)

- **`defrex/drizzle-mcp` — installed, verified broken, removed. Do not re-add.** A community MCP
  server exposing `drizzle_generate_migration`, `drizzle_introspect_schema`,
  `drizzle_run_migrations`, `execute_query`, and `initialize_database`. It was installed globally,
  then found **non-functional**: it resolves `pg` via `createRequire(projectRoot)` and then
  `await import(absolutePath)`, which against `pg`'s CommonJS entry returns
  `{ default, 'module.exports', native }` with no named `Pool`. `const { Pool } = pgModule` is
  therefore `undefined` and startup dies with `Pool is not a constructor`. Unconditional for every
  `node-postgres` project. Contributing factors: `pg` is an *optional* peer so npm never installs
  it and a global install cannot see the project's `node_modules`; and npm's `github:` install path
  corrupted the global tree (the package has no `build`/`prepare` script, so the cloned `dist/` is
  the only build output — the symlink pointed at a `dist/cli.js` that did not exist). Even if
  patched, `execute_query` + `drizzle_run_migrations` would hand an agent raw SQL and unapproved
  migration execution, defeating the approval gate in `drizzle-workflow` hard rule 3. **Coverage
  gap accepted:** AI-assisted schema work stays with the vendored `drizzle-orm` reference skill +
  the project `drizzle-workflow` skill + Context7 `/drizzle-team/drizzle-orm-docs`.
- **Official `drizzle-kit mcp` — not adopted.** It exists but only in `1.0.0-rc.*` prereleases,
  which require a matching `drizzle-orm` 1.x and replace the CLI with `@drizzle-team/brocli`. That
  is a major data-layer upgrade needing explicit approval, not a config change. Latest stable
  (`0.31.11`, pinned here) has no `mcp` verb.

- `vercel-react-view-transitions` — React View Transition API; Next 16.2+ required, only useful if routing transitions are adopted (deferred).
- `vercel-optimize` / `deploy-to-vercel` / `vercel-cli-with-tokens` — deployment-phase operator tools; not needed during build phases. `deploy-to-vercel` also uploads the repo to a remote deploy service (accepted only when the user opts in).
- `vercel-react-native-skills` — React Native/Expo; N/A for web.
- `web-design-guidelines` — duplicates existing UI/UX skills (`ui-ux-pro-max`, `ui-styling`, `design-system`).
- `writing-guidelines` — docs/prose voice review; not a front-end gap.
- Postgres skills target **local development via Docker PostgreSQL image** and **Vercel-managed PostgreSQL in production** — there is NO local PostgreSQL install; the local dev DB is the `scholars-postgres` container on host port 5433. Production is set up manually by the owner.
- `supabase` (full) — the full Supabase platform skill duplicates; only the Postgres best-practices skill was installed.
- `frontend-design`, `canvas-design`, `brand-guidelines`, `skill-creator` (anthropics) — `frontend-design`/`canvas-design` duplicate existing design skills; `brand-guidelines` is Anthropic-specific (N/A); `skill-creator` is Claude-Code-`claude -p`-specific and incompatible with OpenCode runtime. No gap filled.
- mattpocock skills NOT installed: `tdd` (covered by `test-driven-development`), `diagnosing-bugs` (covered by `systematic-debugging`), `code-review`, `to-spec`, `to-tickets`, `wayfinder`, `triage`, `implement`, `wizard`, `resolving-merge-conflicts`, `setup-pre-commit`, `codebase-design`, `grilling`, `grill-with-docs`, `research`, `improve-codebase-architecture` — all security-clean but deferred to avoid skill duplication / preserve quality-over-quantity; `domain-modeling` was the single highest-value pick.
- **obra/superpowers NOT installed at all** — a full re-evaluation concluded the repo already
  enforces the same governance via `AGENTS.md`, `RULES.md`, `.opencode/ai-workflow.json`, and
  the three highest-value standalone skills that *were* installed from it
  (`test-driven-development`, `systematic-debugging`, `verification-before-completion`).
  Installing the plugin would add session bootstrap + hooks that duplicate existing rules and
  conflict with the project's change-safety workflow. The earlier three-skill install stands;
  the plugin does not.

## Verified audit — 2026-09-30 (supersedes assumptions above)

**All 119 `SKILL.md` files across all seven roots parse with valid YAML frontmatter, and every
`name` matches its directory name. Zero invalid skills.** Coverage by stack:

| Capability | Available skills |
|---|---|
| Next.js / React | `nextjs-engineering`, `vercel-react-best-practices`, `ui-react-best-practices`, `vercel-composition-patterns`, `vercel-react-view-transitions`, `react-engineering`, `frontend-engineering`, `frontend-ui`, `fullstack-engineering` |
| TypeScript | `typescript-engineering` |
| Tailwind / UI / design | `ui-styling`, `ui-ux-pro-max`, `design-system`, `design`, `brand`, `ui-ux-engineer` |
| shadcn / Base UI | `shadcn`, `migrate-radix-to-base`, `designing-beautiful-websites` |
| Forms / validation | `zod` + `react-hook-form` present in deps; `frontend-ui` and `api-engineering` cover the patterns |
| State | `zustand` in deps; `react-engineering` covers store patterns |
| **Drizzle ORM (correct)** | `drizzle-workflow` (**project**, read by path) is authoritative. `drizzle-orm` (vendored, `.agents/skills/`) is a generic API reference and is **overridden** by the project skill. Current docs via Context7 `/drizzle-team/drizzle-orm-docs`. |
| PostgreSQL | `postgresql-engineering`, `supabase-postgres-best-practices`, `database-engineer`, `database-optimizer` |
| Testing | `webapp-testing` (Playwright), `qa-engineer`, `testing-engineering`, `api-tester`, `test-driven-development` |
| Debugging | `systematic-debugging`, `debugging-engineering` |
| Security | `security-engineering`, `application-security-engineer`, `penetration-tester`, `secrets-hygiene` |
| Accessibility | `accessibility-engineering`, `accessible-motion`, `accessibility-auditor`, `section-508` |
| Performance | `performance-engineering`, `performance-engineer`, `motion`, `optimize-web-animations`, `fixing-motion-performance` |
| Git / CI | `git-engineering`, `github-engineering`, `cicd-engineering`, `devops-engineering`, `docker-engineering` |
| Domain modeling | `domain-modeling`, `codebase-memory` (+ graph MCP), `master-plan-architect` |
| Code review / verification | `code-review`, `code-reviewer`, `code-quality-engineering`, `verification-before-completion` |
| Agent workflow | `prompts/architect`, `prompts/backend-engineer`, `prompts/code-reviewer` (full agent roster in `.opencode/agents/`) |

**The two "open gaps" listed previously are now CLOSED.** Accessibility and application
security are both covered by global skills (`accessibility-engineering`,
`security-engineering`, and specialist auditors). The earlier gap list predates those
installations.

**Duplicated names.** The 2026-09-30 baseline counted 11; the 7 ORM-related copies have since
been deleted. Treat these remaining as a single logical skill: `design-system`, `motion`, `shadcn`,
`ui-ux-pro-max`, `find-skills` ×2 each. Re-count before quoting a total.

**The stale-ORM skill hazard is now ELIMINATED.** It used to be *shadowed, not live*: some skills
carried ARCHIVED banners only in their `.opencode/skills/` copies, while unmarked duplicates in
`~/.agents/skills/` still taught commands that do not exist here, and the hazard was only neutral
because `.opencode/skills/` is scanned last and wins. Every such directory has now been deleted
from both the repo and the global skill roots, so the hazard can no longer reappear by
precedence.

**Two project skills are absent from the current registry.** `scholars-project` and
`drizzle-workflow` fail `skill({name})` with "Skill not found" despite valid metadata. Root
cause: the registry is a **snapshot computed at session start** (decoded from the 1.18.33
binary), and these two directories were created after it. Read them **by file path**. A restart is
the fix; no mid-session rescan exists.

**Durable hardening (2026-09-30).** Project `opencode.json` now declares:

```json
"skills": { "paths": [".opencode/skills"] }
```

`skills.paths` is a real config key ("Additional paths to skill folders"), scanned with
`**/SKILL.md` and merged across config scopes. It registers the project skill root as an
**explicit input** rather than an implicit `.opencode/` convention, and travels with the repo to
any machine or worktree. It does not defeat the session snapshot — a restart is still required
for the running session — but it removes reliance on directory-name convention.

## Remaining domain gaps still open (no skill installed)

- **Admissions / school-operations logic** — no skill models this domain. Covered indirectly by
  `domain-modeling` plus the project's own `SCHOLARS` docs. This is the largest genuine gap and
  should stay project-specific rather than be filled with a generic skill.
- **Media/3D/Three.js/R3F** (Phases 13, 16, 18) — 3D domain generally lacks a mature, secure, installable skill; must rely on `design` / `ui-ux-pro-max` skills and agent knowledge (the referenced AIMS 3D
  guide does not exist in this repo).
- **Schema modeling** beyond basic setup — covered by `drizzle-workflow` (project) + `domain-modeling`; no CMS-build skill.
- **Admissions/CRM logic** — covered only indirectly by `domain-modeling`; no dedicated skill found.
- **Animation** — no dedicated animation skill installed (`ui-ux-pro-max` includes GSAP presets; `design` covers motion).

## Security review record

Every installed skill's `SKILL.md` body and all bundled `scripts/` / `references/` were reviewed for: credential harvesting, network exfiltration, obfuscated code, unsafe `curl | bash`, env-var theft, and unknown-host calls. All installed skills are **SAFE** (no executable code with exfiltration surfaces; pure-markdown skills for React/Postgres/SEO). `webapp-testing` uses a localhost-only server lifecycle wrapper (`subprocess.Popen` executes only the user-supplied server command). For ongoing hygiene, re-review any skill downloaded in the future before installing.