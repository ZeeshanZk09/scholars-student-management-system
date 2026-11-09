# ADR-0004 — Guardian is a person record with a link-based access path, not a field on Student

- **Status:** Accepted
- **Date:** 2026-09-30
- **Phase:** `PHASES.md` Phase 1, Step 1.6
- **Resolves:** `DOMAIN-MODEL.md` defect G-8, open question 3
- **Depends on:** `adr/0001-authorization-model.md`, decision D-5 (parents are a *derived*
  person-type binding, not an assigned role)

---

## Context

`PRD.md` §32 says `Student → Parent/Guardian(s)` — plural, and one guardian may relate to several
students. §5.6 scopes a parent to view *linked* students, so access must follow an explicit link.

The archived contract modelled this three ways at once:

- `GuardianLink(guardianId, studentId, relationship, isPrimary, isEmergencyContact)`;
- `ParentGuardian` as a person, and separately `User`;
- **`Student.guardianId`** — a single nullable column directly on `Student`.

That third column is the defect (G-8). It duplicates the `GuardianLink` fact, contradicts the
plural in `PRD.md` §32, has nowhere to record relationship or emergency-contact status, and — with
`onDelete: Cascade` from `Student` — deletes a real person because a student record was removed.
Two sources of truth for one fact is the same failure class as defect G-4's `Subject.teacherId`.

## Decision

Separate the **person**, the **login**, and the **link**, and let access follow only the link.

```text
User (login) ──0..1── ParentGuardian (person) ──1:N── GuardianLink ──N:1── Student
```

| Entity | Holds | Cardinality note |
|---|---|---|
| `User` | email, credential, status, roles (ADR-0001) | at most one login per person |
| `ParentGuardian` | fullName, relationship-to-family, occupation, phone, address | the *person*; exists with or without a login |
| `GuardianLink` | parentGuardianId, studentId, relationship, isPrimary, isEmergencyContact | **the only access path** |

Rules that follow:

1. **`Student.guardianId` is deleted.** `GuardianLink` is the single source of truth. A student may
   have zero, one, or many guardians.
2. **One account serves all of a guardian's children.** A `User` links to one `ParentGuardian`, and
   that person links to every student they are guardian of. A parent with three children gets one
   login, not three.
3. **Access is derived from the link, never from a role.** Holding a Parent role grants nothing on
   its own. A guardian sees exactly the students reachable through their `GuardianLink` rows.
   This is `ADR-0001`'s scope layer expressed for the student/guardian case.
4. **Revocation is link-scoped.** Removing one `GuardianLink` ends access to that child
   immediately and leaves the guardian's other children untouched. Deactivating the `User` ends
   all of it.
5. **The person record outlives both.** `ParentGuardian` is never cascade-deleted from `Student`.
   Retained for the audit trail (`RULES.md` §34), consistent with the archive's soft-delete rule
   for people (`archivedAt`).
6. **`relationship` lives on the link, not the person.** The same person can be a father to one
   child and an uncle to another in the same family; the relation is a property of the pairing.
7. **Multiple guardians per student are expected** — `PRD.md` §32's plural — with at most one
   primary per student enforced as a partial unique index, so "the main contact" is never ambiguous.

## Consequences

**Positive**

- Fixes G-8 by deleting the duplicate column rather than reconciling two sources of truth.
- One login per guardian regardless of child count — the operational cost the plural model implies.
- Per-child revocation, which a single `Student.guardianId` cannot express.
- `relationship` and `isEmergencyContact` finally have a home, on the entity that can actually vary
  them.
- Emergency contact, which `PRD.md` treats as a guardian function, is the same entity as a guardian.

**Negative / accepted costs**

- Answering "who is this student's guardian?" costs a join instead of one indexed column read.
  That query is not on a hot path, and the correctness gain is worth more than the read.
- A guardian with no login and no children is possible; it is a legitimate record, but enrollment
  flows should treat a guardian without a reachable link as incomplete.
- Authorization for student data now has two inputs — role *and* link — so a reviewer must check
  both. This is `ADR-0001` working as intended, not added complexity.

**Follow-on obligations**

- Phase 3 deletes `Student.guardianId` and creates the partial unique index for one primary
  guardian per student.
- Guardian-facing queries resolve students exclusively via `GuardianLink`.
- Emergency contact is expressed as a `GuardianLink` flag, not a separate entity.

---

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Keep `Student.guardianId` alongside `GuardianLink` | Two sources of truth for one fact (the G-8 defect), and a single column cannot express a guardian with more than one child. |
| One `User` per `ParentGuardian`-per-child | Forces a guardian with two children to hold duplicate logins — the exact situation `PRD.md` §32's plural creates. |
| Guardian as a `User` with a Parent role only, no `ParentGuardian` | Loses the person record: relationship, occupation, address, and the per-child emergency-contact distinction all become role attributes. |
| A user with the Student role being a legal guardian | Explicitly forbidden by `RULES.md` §4; role is not relationship. |
| `ParentGuardian` fully separate from `User` | Duplicates identity data and turns login provisioning into a parallel problem (the rejected shape in ADR-0002). |
