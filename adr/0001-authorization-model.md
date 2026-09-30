# ADR-0001 — Authorization model: capability-based RBAC with explicit resource scope

- **Status:** Accepted
- **Date:** 2026-09-30
- **Phase:** `PHASES.md` Phase 1, Step 1.6
- **Resolves:** `DOMAIN-MODEL.md` defect G-6, open question 1
- **Supersedes:** the archived 20-model contract's authorization design

---

## Context

The archived contract (`/tmp/opencode/contract-backup-20260930-144738/contract.prisma`) modelled
authorization **twice, in competition**:

```prisma
model User  { role String }   // free-form role name
model Role  { name String; isSystemRole Boolean; institutionId String? }
model Permission { name String; roleId String?; compositeKey String }
```

`User.role` and the `Role`/`Permission` tables can disagree, and neither can express the scoping
the PRD actually requires. This is logged as G-6 (P1) in `DOMAIN-MODEL.md`.

Three requirements force the shape of the decision:

1. **`PRD.md` §5.1** — the Super Administrator must "manage roles and permissions" at runtime.
   Permissions therefore cannot live only in code; they need to be data.
2. **`ARCHITECTURE.md` §24** — the conceptual chain is `User → Role → Permissions`, with
   action-oriented permission keys such as `students.view`, `attendance.mark`, `payments.create`.
3. **`RULES.md` §18** — authorization is a five-step decision: role → permission → access to *this
   resource* → allowed *in current state* → act. UI restrictions alone are never sufficient.

Requirement 3 is the one the archived design could not satisfy. A flat permission answers "may
this user mark attendance anywhere?", but the PRD requires scoped behaviour:

- a Teacher may record attendance **only for assigned students** (`PRD.md` §5.4, §32);
- a Parent may view **only linked students** (`PRD.md` §5.6);
- a Student may view **only their own** record (`PRD.md` §5.7).

Role and permission together cannot express "which instances". That needs a third concept.

---

## Decision

Adopt **capability-based RBAC with explicit resource scope**, in three independent layers.

### 1. Capability — permissions as data, seeded from code

```text
User ⇄ UserRole ⇄ Role ⇄ RolePermission ⇄ Permission
```

- `Permission.key` is a dotted, action-oriented string (`attendance.mark`, `fees.refund`), declared
  in a **TypeScript constant** so keys are type-checked and referenced by code, never written as
  free-form strings. This also closes G-7 for the authorization domain.
- The set of legal keys is seeded into the database. Roles and grants are then managed at runtime,
  satisfying `PRD.md` §5.1.
- `User.role` (the string) is **removed**. A user may hold several roles via `UserRole`.
- `Role.isSystemRole` distinguishes built-in roles from institution-defined ones. `institutionId`
  is nullable: system roles are platform-wide, institution roles are per-institution, matching the
  institution-owned data model (`PRD.md` §32).

### 2. Scope — what the capability applies to

Permissions answer *whether an action is permitted*. Scope answers *which records it applies to*.
Kept separate so a single permission set serves every role.

| Scope | Mechanism | Serves |
|---|---|---|
| Teaching assignment | `TeachingAssignment` → section/subject/teacher | Teacher sees and marks only assigned students |
| Guardian link | `GuardianLink` → student | Parent sees only linked students |
| Self | resolved from the authenticated principal | Student sees only their own record |
| Institution | `institutionId` on domain records | Administrator scoped to their institution |

### 3. State — is the action legal right now

Checked after scope, per `RULES.md` §18: e.g. editing results requires draft status, or elevated
permission plus audit once published (`RULES.md` §33).

### Enforcement

Server-side only, in the application layer (`ARCHITECTURE.md` §26), never in UI components
(`RULES.md` §18, `ARCHITECTURE.md` §45). UI hides what is not permitted; the server is what
actually refuses.

---

## Consequences

**Positive**

- Removes G-6. One coherent authorization model instead of two competing ones.
- A new role or a permission change is a data change, not a code deploy.
- Scoped access becomes expressible, satisfying the Teacher/Parent/Student requirements that the
  archived design could not represent.
- Permission keys are type-checked, so `attendance.mark` cannot drift into `attendance.mark_all`.

**Negative / accepted costs**

- More tables (`UserRole`, `RolePermission`, `TeachingAssignment`) than the archived design.
- Every protected operation performs additional lookups, so permission resolution will need
  caching later. Not in scope for this phase; the lookup shape must allow it.
- Authorization becomes data that can be misconfigured at runtime. Mitigated by seeding from code
  constants and auditing permission changes (`RULES.md` §34).

**Follow-on obligations**

- `TeachingAssignment` becomes a first-class entity, reinforcing G-4 (no `Teacher` entity in the
  archive).
- Phase 4 must implement the *mechanism* (credentials, sessions). This ADR fixes only the *model*.

---

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Pure code role enum, no permission tables | Fails `PRD.md` §5.1 — Super Administrator could not manage permissions without a code deploy. |
| `User.role` string with role-name checks | Fails `RULES.md` §19 ("avoid relying only on role-name checks") and is the direct cause of G-6. |
| Permissions only, no roles | Permits arbitrary per-user grants and loses the sane defaults `ARCHITECTURE.md` §24 implies. More rows, same expressiveness, worse operability. |
| Fold scope into permission keys (e.g. `attendance.mark.own_section`) | Multiplies the key space combinatorially and makes revocation unreliable. Scope is data, not naming. |
