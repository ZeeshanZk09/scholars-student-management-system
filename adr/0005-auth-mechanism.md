# ADR-0005 — Authentication is Auth.js v5 (credentials + JWT) with a database-authoritative session table

- **Status:** Accepted
- **Date:** 2026-10-06
- **Phase:** `PHASES.md` Phase 3, Step B
- **Resolves:** `MEMORY.md` §9 (auth mechanism open), §16 (unapproved auth package)
- **Depends on:** `adr/0001-authorization-model.md` (the session feeds `Principal`),
  `src/db/schema/identity.ts` (the tables this decision writes to), user approval recorded
  in `.opencode/ai-workflow.json` on 2026-10-06 ("Auth.js (NextAuth v5) + Drizzle adapter")

---

## Context

`PHASES.md` §11 lists fifteen Phase-3 tasks — user entity through authentication tests — under a
completion gate that *an unauthenticated user cannot access protected application functionality*.
The binding constraints come from three documents:

- **`PRD.md` Module 1** — cookie-based sessions, application-controlled, no paid auth SaaS.
- **`RULES.md` §23** — sessions must be server-side and **revocable**; a stateless bearer token
  that cannot be invalidated ("log out everywhere", "this device is revoked") is forbidden.
- **`SECURITY.md` §6/§8/§10/§34/§59–62** — Argon2id or bcrypt for passwords; single-use, expiring,
  cryptographically random reset tokens; session rotation after authentication (anti-fixation);
  idle timeout; `Secure`/`HttpOnly`/`SameSite` cookies; rate limits on login and reset; generic
  responses that do not reveal whether an account exists.

The user approved Auth.js (NextAuth v5) as the mechanism. Auth.js brings the login/logout
endpoints, credential flow, CSRF protection, and cookie handling — but its architecture has one
hard constraint that collides with `RULES.md` §23:

> The Credentials provider can only be used when the session strategy is **JWT**
> (`UnsupportedStrategy` is thrown otherwise). Database sessions require an adapter and a
> non-credentials provider.

JWT strategy alone would mean a cookie that cannot be revoked server-side — the exact thing
`RULES.md` §23 forbids. The `sessions` table from Phase 2 exists precisely for that reason.

## Decision

**Use Auth.js v5 (`next-auth@5.0.0-beta.32`) with a Credentials provider and the JWT strategy,
backed by an authoritative `sessions` row that is checked on every server-side `auth()` call.**

```text
login → authorize() verifies Argon2id hash → jwt callback mints sid
      → INSERT sessions (token_hash = SHA-256(sid), expires_at, issued_at)
      → cookie: Auth.js JWT (encrypted/signed, HttpOnly, SameSite=Lax, Secure in prod)
                carrying claim sid

every auth() → decode JWT → SELECT sessions BY token_hash
            → reject if row missing, revoked_at set, idle-expired, or past absolute cap
            → (throttled) sliding renewal of expires_at
```

Consequences of each sub-decision:

1. **No `@auth/drizzle-adapter`.** With credentials + JWT the adapter is never invoked (it exists
   for OAuth account linking and database-session strategies). Our callbacks talk to the Drizzle
   schema directly. This deviates from the "…+ Drizzle adapter" phrasing of the 2026-10-06
   approval only in that an unneeded package is *not* installed; the approved mechanism and the
   schema it writes are unchanged.
2. **`sid`, not the cookie string, is what gets hashed.** The JWT is re-encoded whenever its
   claims change, so hashing the cookie value would invalidate the row on an unrelated update.
   `sessions.token_hash = SHA-256(sid)` where `sid` is 32 random bytes embedded in the JWT; the
   comment on `sessions.token_hash` is updated in source to say so.
3. **The per-request `SELECT` is accepted.** The Auth.js guidance says "keep the jwt callback
   lightweight — no database queries". One indexed lookup by a unique hash is the lightweight
   version of the requirement, and it is what makes revocation *immediate* rather than
   best-effort. This is the price of `RULES.md` §23 under a credentials flow.
4. **Expiry has two clocks, no new columns.** Idle timeout = `sessions.expires_at` slides forward
   on activity (renewed at most once per 5 minutes, capped by); absolute cap = `issued_at + 7
   days`. The JWT `maxAge` matches the idle window's worst case so the cookie never outlives the
   row it points at.
5. **Argon2id via `@node-rs/argon2`**, stored in `user_credentials.password_hash` with
   `algorithm = 'argon2id'` and the parameters in `parameters` — exactly the data-not-constant
   design `identity.ts` was written for. If the native package cannot install on the project's
   Node 26.8.1, fall back to bcrypt (allowed by `SECURITY.md` §6) and record the substitution.
6. **Layout:** `src/auth.ts` is the single Auth.js config (skill requirement; no `auth.config.ts`
   split because Next-16 `proxy.ts` runs on Node.js and we deliberately do optimistic checks
   there — see 7). Domain logic lives in `src/modules/auth/{domain,application,infrastructure,ui}`
   per `src/modules/README.md`.
7. **Guards are two-layer** (`SECURITY.md` requires server-side validation): `src/proxy.ts`
   redirects unauthenticated browsers using only the cookie (optimistic, no DB — Next's own
   guidance forbids DB in proxy), while the DAL (`auth()` + session-row check) and every Server
   Action do the authoritative check. Middleware is never the only defence.
8. **Password policy** (min 12, max 128, common-password list, no local-part reuse) lives in
   `domain/` as a pure rule; throttling uses the existing `users.failed_login_count` /
   `locked_until` columns with temporary locks only (`SECURITY.md` §61 warns against permanent
   lockout) plus a small in-memory IP limiter on login/reset endpoints (§59).
9. **Email verification and password reset** write a single-use hashed token to
   `security_events` (`kind = 'email_verification' | 'password_reset'`) and queue the rendered
   message in the `email_messages` outbox with an idempotency key — never a direct SMTP call,
   never the plaintext token in a log. SMTP sending is a later phase (PRD MODULE 28 worker).
10. **A user must reach `status = 'active'` before login.** `invited` users verify their email
    first; `suspended`/`revoked`/`inactive` are rejected inside `authorize()` with the same
    generic failure as a wrong password (enumeration protection, §62).

## Alternatives considered

- **Database strategy with a non-credentials provider** — rejected: no OAuth/SSO requirement
  exists, and magic-link-only login contradicts `PRD.md` Module 1's password flows.
- **Custom session layer without Auth.js** — rejected: the user approved Auth.js; reinventing
  CSRF, cookie flags, and the login endpoint is exactly the blind coding `RULES.md` §4 forbids.
- **JWT-only with no DB row** — rejected: violates `RULES.md` §23 (no revocation).
- **Writing the full Auth.js `Adapter` interface over our tables** — rejected for now: the
  adapter only runs for database strategy, which credentials cannot use; the callback approach
  above achieves revocation with less surface. Revisit if OAuth is ever added.

## Follow-ups

- SMTP worker that drains `email_messages` (PRD MODULE 28) — later phase.
- ESLint boundaries plugin enforcing the module layer rules (`src/modules/README.md`) — Phase 2
  follow-up, still open.
- MFA (`SECURITY.md` §9) — out of Phase 3 scope.
