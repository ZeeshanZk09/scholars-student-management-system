# ADR-0002 — A teacher is a login identity plus an employment profile

- **Status:** Accepted
- **Date:** 2026-09-30
- **Phase:** `PHASES.md` Phase 1, Step 1.6
- **Resolves:** `DOMAIN-MODEL.md` defect G-4, open question 1
- **Depends on:** `adr/0001-authorization-model.md`

---

## Context

`PRD.md` §32 requires `Teacher → Classes/Groups/Sections/Subjects`, and §5.4 scopes a teacher to
"view assigned students" and "enter or view results where authorized". The archived contract had no
`Teacher` model at all — `Subject.teacherId` pointed directly at `User` (defect G-4). That can
express *who teaches a subject*, but nothing about employment, and it cannot express the
time-bounded nature of an assignment: the same teacher may teach `Alpha 1` in the 2026 session and
`Beta 1` in 2027, and the 2026 assignment must remain on the record.

Two facts are also conflated by pointing at `User`:

- **Account lifecycle** — an email, a credential, a session, active/suspended.
- **Employment lifecycle** — employee number, qualification, joining date, employment status.

These diverge. A teacher who leaves the institution should lose access immediately while their
employment record and teaching history persist (`RULES.md` §34 requires the audit trail to
survive; deactivating, not deleting, is the archive's own rule).

## Decision

Model a teacher as a **login identity** and an **employment profile** as two linked entities, with
scope carried by an explicit assignment entity.

```text
User (login) ──0..1── Teacher (employment profile) ──1:N── TeachingAssignment ──> Section, Subject
```

| Entity | Holds | Lifecycle |
|---|---|---|
| `User` | email, credential, status, roles (ADR-0001) | suspended / reactivated |
| `Teacher` | employeeNumber, qualification, employmentStatus, joinedOn, institutionId | employed / resigned / retired |
| `TeachingAssignment` | teacherId, sectionId, subjectId, academicSessionId, active window | assigned / ended |

Consequences of the shape:

- **`Subject.teacherId` is removed.** A subject is a catalogue entry; who teaches it is a property
  of an assignment for a given session, not of the subject.
- **Assignments are time-bounded by `academicSessionId`**, which is what makes historical teaching
  load reconstructable.
- **A teacher need not log in.** A `Teacher` may exist with no `User`, so staff records are not
  hostage to account provisioning.

## Consequences

**Positive**

- Fixes G-4 with a first-class `Teacher` as `PRD.md` §32 requires.
- Employment data has a home, and its lifecycle is independent of the account.
- Teaching scope is data, so `ADR-0001`'s scope layer has something concrete to bind to.
- Assignment history survives a teacher leaving.

**Negative / accepted costs**

- One more table, and one more join when resolving "who teaches this section".
- A teacher record and a user record can disagree (an employed teacher with no login). That is
  legitimate, not a defect, but it must be a deliberate state rather than an accident.

**Follow-on obligations**

- `Subject` no longer owns teaching assignment; `TeachingAssignment` does. Any subject-listing use
  case must join through the active assignment.
- Teacher-facing queries filter by assignment, never by a role check alone.

---

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Teacher is a `User` with the Teacher role only | No home for employee number, qualification or employment status; conflates account and employment lifecycle; cannot record a teacher who has no login. |
| Teacher fully separate from `User`, no link | Duplicates identity and contact data and makes login provisioning a second, parallel problem. |
| Keep `Subject.teacherId`, add a `Teacher` table | Leaves two sources of truth for who teaches what — the exact class of defect already logged as G-8 for guardians. |
| Assignment implied by role + section membership | Role says *what a teacher may do*, not *what they teach*. `ADR-0001` requires these to stay separate. |
