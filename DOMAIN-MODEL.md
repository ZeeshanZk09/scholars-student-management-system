# DOMAIN-MODEL.md — Domain Model (PHASES.md Phase 1)

> **Status:** draft under construction — Steps 1.1, 1.3 and 1.4 recorded; Step 1.5 in progress.
> **Sources:** `PRD.md` (intent), `ARCHITECTURE.md` (intent), `RULES.md` (binding constraints),
> the archived 20-model contract (prior art, not authority).
> **Authority order:** `RULES.md` §4 rule hierarchy, then `PHASES.md`, then `PRD.md` /
> `ARCHITECTURE.md` intent, then reality in `src/`. Where they disagree this file records the
> conflict rather than silently choosing.

---

## 1. Actors

Seven user types (`PRD.md` §5). Note that §5.6 and §5.7 explicitly mark Parent and Student as
"future-facing", so they are modelled but not first in build order.

| Actor | Nature | Primary responsibilities |
|---|---|---|
| Super Administrator | System + institution | Users, roles/permissions, academic structure, all records, settings, audit review |
| Administrator | Operational | Student records, structure, guardians, attendance oversight, admissions, reports |
| Receptionist / Admission Staff | Operational | Admission records, student search/registration, contact updates, placement assignment |
| Teacher | Operational | Assigned students, record attendance, view academic data, enter results where authorized |
| Accountant | Operational | Fee records, invoices, payments, outstanding balances, fee reports |
| Parent / Guardian | External, future-facing | View linked students' attendance, fees, results, documents, notices |
| Student | External, future-facing | Own profile, attendance, timetable, results, assignments, notices |

**Open modelling question (Phase 1.2):** the actor list mixes *roles* (job function) with
*person types* (parent, student). A parent is simultaneously a role holder and a relation
(`Student → Parent/Guardian`). These must not be collapsed into one concept.

---

## 2. Academic hierarchy (Step 1.3)

Confirmed, and unanimous across `PRD.md` §6.4/§32, `RULES.md` §31 and the archived contract:

```text
Institution
    ↓
Academic Session      (e.g. 2026 — isCurrent marks the active one)
    ↓
Class                 (academic level/year — "First Year", "Grade 9")
    ↓
Group                 (stream/specialisation — "Computer Science", "Pre-Medical")
    ↓
Section               (classroom/batch within a group — "Alpha 1", "Beta 1")
    ↓
Student
```

**Terminology is binding.** `RULES.md` §31 forbids calling a Group a Section or a Class a Group.
Worked example from the PRD:

```text
2026 Academic Session → First Year → Computer Science → Alpha 1 → Students
```

### Ownership and integrity rules

| Rule | Basis | Consequence for schema |
|---|---|---|
| A Section belongs to exactly one Group | `PRD.md` §35, §32 | `Section.groupId` required, not optional |
| A Group belongs to exactly one Class | `PRD.md` §35, §32 | `Group.classId` required |
| A Class belongs to an Academic Session | `PRD.md` §32 | `Class.academicSessionId` — the archived contract made this **optional**, which lets a class exist with no session. Must be required. |
| Institution owns all sessions and students | `PRD.md` §32 | every top-level record carries `institutionId` |
| Terminology must not drift | `RULES.md` §31 | fixed vocabulary in code and UI |

### Academic placement is historical, not current-state

`PRD.md` §6.5 and §34, reinforced by `RULES.md` §30 ("important academic operations must not
silently overwrite historical records"):

```text
2026 → First Year → Computer Science → Alpha 1
2027 → Second Year → Computer Science → Alpha 2      ← previous placement must survive
```

**Conclusion:** placement is a first-class entity with one row per student per session, carrying
`academicSessionId`, `classId`, `groupId`, `sectionId`, `rollNumber`. `Student` must **not** hold
inline `classId`/`groupId`/`sectionId` columns — that shape can only ever represent one placement
and makes academic history unrepresentable.

---

## 3. Student lifecycle

From `PRD.md` §33. Distinct states, not a single active/inactive flag:

```text
Applicant → Admitted → Active → Promoted → Graduated
                       ↘ Transferred / Withdrawn / Inactive
```

Two consequences:

1. **Admission is a separate entity from Student.** An `Applicant` is not yet a student record.
   `PRD.md` §11 defines an admission status flow and a "conversion to student" step, so the
   archived contract's lack of any `Admission` model is a real gap.
2. **Lifecycle status and record status are different axes.** "Graduated" and "inactive" are
   lifecycle outcomes; "soft-deleted/archived" is a record concern. They should not share one
   free-form `status` column.

---

## 4. Domain boundaries (Step 1.4 — proposed)

Grouped per `PHASES.md` Step 1.4, with a build-order recommendation. `PHASES.md` §1.4 explicitly
says not to implement every domain immediately.

| Domain | Owns | Priority |
|---|---|---|
| Institution | institution profile, settings | Now |
| Academic Session | sessions, `isCurrent` | Now |
| Academic Structure | class, group, section | Now |
| Students | student record, identity, contact, lifecycle | Now |
| Academic Placement | per-session placement history | Now |
| Guardians | guardian persons + student links | Now |
| Admissions | applicant records, status flow, conversion | Now |
| Authentication | credentials, sessions | Phase 4 |
| Authorization | roles, permissions, enforcement | Phase 4 (model decided in 1.6) |
| Teachers | teacher entity, teaching assignments | Phase 2/3 |
| Subjects | subject catalogue, teacher assignment | Later |
| Attendance | sessions/registers, marks, corrections | Later |
| Examinations & Results | exams, marks, publication state | Later |
| Fees | fee structures, invoices, balances | Later |
| Payments | receipts, refunds | Later |
| Documents | student documents | Later |
| Communication | notices, notifications | Later |
| Reports | read models over other domains | Last |
| Audit | cross-cutting audit trail | Phase 2 (infrastructure) |

**Cross-cutting:** audit is not a feature domain — it is infrastructure that every other domain
writes to (`RULES.md` §34).

---

## 5. Business rules catalogue (Step 1.5 — in progress)

| # | Rule | Basis | Notes |
|---|---|---|---|
| BR-1 | Section → Group → Class → Session → Institution chain is mandatory | §35 | no orphan structural rows |
| BR-2 | Placement is per student **per session** and immutable once the session closes | §6.5, §34, `RULES.md` §30 | history preserved |
| BR-3 | Admission converts to Student exactly once | §11.4 | conversion is a transition, not a copy |
| BR-4 | Lifecycle transitions follow a defined state machine | §33 | invalid transitions rejected |
| BR-5 | Attendance is bound to student + date + academic context | §32, §35 | teacher must resolve class/group/section before submit |
| BR-6 | One attendance record per student per session/context | §35 | duplicates detected — **see gap G-5** |
| BR-7 | Draft results editable; published results need elevated permission; post-publication change explicit + auditable | `RULES.md` §33 | result publication is a state, not a boolean |
| BR-8 | Money uses exact decimal, never float | `RULES.md` §29 | shared money value type |
| BR-9 | Every financial mutation is authorized, validated, transactional and auditable | `RULES.md` §29 | |
| BR-10 | Audit records capture who / what / when / target / result / context | `RULES.md` §34 | no secrets in logs |
| BR-11 | Status and type fields are constrained sets, validated at the boundary | `RULES.md` §16 | not free-form strings |
| BR-12 | Search and filtering are server-side, not client-only | `PRD.md` §23 | |

---

## 6. Confirmed defects in the archived 20-model contract

The archive at `/tmp/opencode/contract-backup-20260930-144738/` is **valid and reproducible**
(verified — see `MEMORY.md` §5), so it is usable prior art. But it is not a sound target state.
These are confirmed against `PRD.md` / `RULES.md`, in severity order.

| ID | Severity | Defect | Basis |
|---|---|---|---|
| **G-1** | P0 | Inline `classId`/`groupId`/`sectionId` on `Student` — a single placement only. **Academic history is unrepresentable.** | §6.5, §34, §32, `RULES.md` §30 |
| **G-2** | P0 | No audit model at all, despite §34 mandating audit for login, permission change, user creation, student deletion, attendance/result/fee change, refunds, config change | `RULES.md` §34 |
| **G-3** | P1 | No `Admission` entity, though §11 defines an admission flow, admission status, and conversion to student | §11, §33 |
| **G-4** | P1 | No `Teacher` entity — `Subject.teacherId` points at `User`. `PRD.md` §32 requires Teacher → Classes/Groups/Sections/Subjects | §32 |
| **G-5** | P1 | `Attendance` declares `@@ unique([...])` but the emitted model has **no** `uniques` and no `keys` — the constraint silently never reaches the database | verified by emit |
| **G-6** | P1 | Two competing authorization systems: `User.role String` **and** `Role`/`Permission` tables. Must become one coherent model | `RULES.md` §18, §19 |
| **G-7** | P1 | Every `status`/`type` is a free-form `String` — no enum, no boundary validation | `RULES.md` §16 |
| **G-8** | P2 | `Student.guardianId` duplicates the `GuardianLink` join — two competing paths to the same fact | `ARCHITECTURE.md` (no competing representations) |
| **G-9** | P2 | `Class.academicSessionId` optional — permits a class with no session, breaking BR-1 | §35 |
| **G-10** | P2 | `StudentFee.outstandingAmount` is a stored computed value with nothing guaranteeing `amount − discount − paidAmount` | `RULES.md` §29 |
| **G-11** | P2 | `Payment.receiptNumber` is not unique — receipts are the audit handle for money | `RULES.md` §29 |
| **G-12** | P2 | Single `status` on `Student` conflates lifecycle (G-4 above) with archival | §33 |
| **G-13** | P3 | No `Document` entity, though §32 requires `Student → Documents` | §32 |

---

## 7. Open questions for Phase 1.6

1. **Authorization model** — one role per user with code-held capability maps, or role → permission
   strings checked server-side. To be decided and recorded as an ADR; it determines the schema.
2. **Money representation** — decimal scale and whether a single shared value type is introduced.
3. **Admission vs Student identity** — whether an applicant becomes a Student row via promotion
   (one identity, status change) or via creation (two identities, linked).
4. **Teacher vs User relationship** — whether a teacher is a `User` with a role, a separate
   entity, or both, and how teaching assignments are scoped.
5. **Deleted UI components** (`header.tsx`, `user-menu.tsx`) — what replaces them.
6. **Node pinning** — no `engines`/`.nvmrc` yet.
