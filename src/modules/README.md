# Module structure

Backend foundation for `PHASES.md` Phase 2. Implements the layering prescribed by
`ARCHITECTURE.md` §26–28 and the ownership rules in `RULES.md` §7.1–7.3.

## Layout

```text
src/
  modules/<domain>/            business domains — owns its own logic (RULES.md 7.1)
    domain/                    business rules, value objects, types. Pure.
    application/               use cases. Orchestrates; no framework, no SQL.
    infrastructure/            data access and external adapters
    ui/                        domain-specific components, if any
    index.ts                   the module's only public surface
  shared/                      genuinely shared code only (RULES.md 7.3)
    errors/                    AppError model
    validation/                boundary validation helpers
    auth/                      authorization helpers (ADR-0001)
    db/                        database helpers
    logging/                   structured logging
  components/ui/               generic, domain-agnostic UI primitives
```

A module is self-contained. `students/` owns student types, schemas, validation, business
logic and components. Nothing student-specific belongs in `shared/`.

## Layer rules

Dependencies point inward. Nothing may import "up".

| Layer | May import | Must not import |
|---|---|---|
| `domain/` | `shared/` only | `application/`, `infrastructure/`, `ui/`, Next.js, Prisma, `postgres` |
| `application/` | `domain/`, `shared/` | `infrastructure/`, `ui/` |
| `infrastructure/` | `domain/`, `shared/` | `ui/` |
| `ui/` | `application/` via server actions, `components/ui/`, `shared/` | `infrastructure/`, `domain/` internals, `db` directly |

Three rules carry the most weight:

1. **The domain layer is pure.** It knows what makes an attendance record valid. It must not
   know whether attendance was submitted from mobile, desktop, or a web wrapper
   (`ARCHITECTURE.md` §27). No imports of Next.js, Prisma, or `postgres` may appear in `domain/`.
2. **UI never touches the database.** UI calls application use cases; those call infrastructure.
   `RULES.md`: "UI restrictions alone are never sufficient authorization" — and equally, the UI is
   never the place data is read.
3. **Cross-module access goes through `index.ts`.** A module reaches another module only via that
   module's public surface, so internal refactors do not cascade. No uncontrolled cross-module
   imports (`PHASES.md` Step 2.2).

## Where a rule goes

Validation exists at every boundary, each with a different job (`ARCHITECTURE.md` §29):

```text
UI validation            → responsiveness only; never authoritative
application input        → authoritative shape/type validation (server-side)
domain validation        → invariants and state transitions
database constraints     → integrity, as a last line of defence
```

Business rules live in `domain/`. Authorization lives in `shared/auth/` and is enforced in
`application/`, server-side, per ADR-0001.

## Errors

Throw `AppError` subclasses from `shared/errors`. Never throw a bare `Error` across a layer
boundary, and never let an internal message reach a user — `toClientError()` is the only
sanctioned projection.

## Adding a module

1. Create `src/modules/<domain>/` with the four layer directories and an `index.ts`.
2. Put the domain's types and rules in `domain/`, with no framework imports.
3. Add use cases in `application/`. Validate, authorize, then act, in that order.
4. Put queries in `infrastructure/`, never in a use case.
5. Test domain rules in `domain/*.test.ts` before building use cases on top.

Enforce the import rules with an ESLint boundaries plugin rather than convention alone. That is
tracked as a Phase 2 follow-up, not yet configured.
