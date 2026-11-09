# DOMAIN-MODEL.md — Domain Model (PHASES.md Phase 1)

> **Status:** Steps 1.1–1.6 recorded; ADR-0001 through ADR-0004 accepted; the three decisions that
> blocked Phase 3 are resolved and Phase 3 is complete (§7).
> **Sources:** `PRD.md` (intent), `ARCHITECTURE.md` (intent), `RULES.md` (binding constraints),
> the pre-Drizzle 20-model contract (its shape, recorded in `MEMORY.md` §5 — not authority).
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

### 1.1 Actor classification (Step 1.2)

The seven actors are **not** one kind of thing. Splitting them is what makes access revocable.

| Class | Actors | Nature | Assigned or derived? |
|---|---|---|---|
| **Job-function roles** | Super Administrator, Administrator, Receptionist / Admission Staff, Teacher, Accountant | A capability bundle applied to an account | **Assigned** — a user may hold several |
| **Person-type bindings** | Parent / Guardian, Student | A consequence of a domain relationship | **Derived** from data, never assigned |

- A **Parent** is *not* a role someone holds. It exists because a `GuardianLink` row links that
  person to a student. Revoking the link revokes the access; editing a role string would not.
- A **Student** exists because a `Student` record is linked to an account. Same reasoning.
- The two classes are not exclusive. A teacher who is also a parent holds the Teacher *role* and
  simultaneously has a Guardian *binding*. This is why authorization is a many-to-many
  (`adr/0001-authorization-model.md`), not a single role column.

`PRD.md` §5.6 and §5.7 mark Parent and Student "future-facing", so the bindings are modelled now
but are lower build priority than the job-function roles.


---

## 2. Academic hierarchy (Step 1.3)

Confirmed, and unanimous across `PRD.md` §6.4/§32, `RULES.md` §31 and the pre-Drizzle schema:

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

## 5. Business rules catalogue (Step 1.5)

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

### 5.1 Entity rules (Step 1.5 — required/optional, uniqueness, deletion, archival)

| Entity | Required | Optional | Uniqueness | Deletion | Archival |
|---|---|---|---|---|---|
| Institution | name | code, email, phone, address | code (nullable-unique) | block if any records | status only |
| Academic Session | institutionId, name | startDate, endDate | (institutionId, name) | block if classes exist | `isCurrent` marks one active per institution |
| Class | institutionId, academicSessionId, name | gradeLevel | (academicSessionId, name) | block if groups exist | status |
| Group | classId, name | — | (classId, name) | block if sections exist | status |
| Section | groupId, name | capacity | (groupId, name) | block if students placed | status |
| Student | institutionId, firstName, lastName | middleName, dob, gender, contact, image | admissionNumber, (institutionId, admissionNumber) | **soft-delete / deactivate** — never hard delete | lifecycle status + archival flag, kept separate |
| Academic Placement | studentId, academicSessionId, classId, groupId, sectionId | rollNumber | (studentId, academicSessionId) | immutable once session closes | retained indefinitely |
| Admission | institutionId, applicant name, status | contact, requested class | admission/application number | block once converted | status history |
| Guardian | institutionId, firstName, lastName | relationship, contact, occupation | — | block while linked, else soft-delete | status |
| GuardianLink | guardianId, studentId | relationship, isPrimary, isEmergencyContact | (guardianId, studentId) | deletable — this *is* the access grant | none needed |
| User | email (unique) | name, image, phone | email | deactivate, do not delete (audit trail) | status |
| Attendance | studentId, date, academic context, status | markedBy | one per student per session/context — **see G-5** | corrections audited, not deleted | retained |
| Result | studentId, examinationId, subjectId, obtainedMarks | grade, remarks | (studentId, examinationId, subjectId) | draft deletable; published needs elevated permission | publication state retained |
| Fee record | studentId, amount, currency, dueDate | discount, fine | per student per structure | refunds, never delete (`RULES.md` §29) | status |
| Payment | feeRecordId, amount, method, paymentDate | transactionId, receiptNumber, notes | **receiptNumber** — see G-11 | never delete | retained |

**Deletion principle.** Financial and academic records are never hard-deleted
(`RULES.md` §29, §30, §34). Deletion means status change plus an audit entry. Only genuinely
transient configuration may be removed.


---

## 6. Confirmed defects in the archived 20-model contract

The archive at `/tmp/opencode/contract-backup-20260930-144738/` **no longer exists** — `/tmp` was
cleared and the contract was never committed to git, so it is not usable prior art (see `MEMORY.md`
§5, which supersedes any earlier claim that the archive was verified and reproducible). What remains
of the 20-model contract is its shape, listed in `MEMORY.md` §5, and the defects below — these are
confirmed against `PRD.md` / `RULES.md`, in severity order.

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
| **G-12** | P2 | Single `status` on `Student` conflates lifecycle (§3 above) with archival | §33 |
| **G-13** | P3 | No `Document` entity, though §32 requires `Student → Documents` | §32 |

---

## 7. Decisions and open questions (Step 1.6)

### Decided

| # | Decision | Record |
|---|---|---|
| D-1 | Authorization = capability RBAC + explicit resource scope; drop `User.role` string | `adr/0001-authorization-model.md` |
| D-2 | Academic placement is per-session history, never inline `Student` FKs | §2 above; fixes G-1 |
| D-3 | Admission is a separate entity from Student; conversion is a transition | §3 above; fixes G-3 |
| D-4 | Student lifecycle status and archival flag are separate axes | §3 above; fixes G-12 |
| D-5 | Actor list splits into assigned job-function roles and derived person-type bindings | §1.1 above |
| D-6 | A teacher is a `User` login + a separate `Teacher` employment profile; `TeachingAssignment` carries scope | `adr/0002-teacher-model.md`; fixes G-4 |
| D-7 | Money is `Decimal(18,2)` + explicit currency in one shared `Money` value type; balances computed, never stored | `adr/0003-money-model.md`; fixes G-10, G-11 |
| D-8 | A guardian is a `ParentGuardian` person with an optional `User` login; access follows only `GuardianLink`; `Student.guardianId` deleted | `adr/0004-guardian-model.md`; fixes G-8 |
| D-9 | Layer boundaries point inward; domain is framework-free; cross-module access via each `index.ts` | `src/modules/README.md` |

**All three schema-blocking decisions are now resolved.** D-6, D-7 and D-8 each fix a previously
logged archived-schema defect, so the domain model and the contract divergences are now closed out
rather than deferred.

**Phase 3 is complete.** Every entity named in this model is implemented in `src/db/schema/` —
145 tables across 22 domain modules, with 378 foreign keys and 364 check constraints, and a
generated `relations.ts` that maps every declared foreign key to a `one`/`many` pair. The baseline
migration `drizzle/0000_steady_johnny_blaze.sql` is generated, `db:check`-clean, and applied to the
local database (2026-10-06).

Three consequences of implementing this model are worth knowing, because they are not derivable from
the prose above:

- **Money follows the document, not the row.** `currency` sits on 14 money *roots* — fee structure,
  invoice, payment, receipt, payment plan, concession, financial account, expense, budget, salary
  structure, salary assignment, payroll run, payroll item, payroll payment — and the 8 money-bearing
  child tables inherit it by joining one hop (`fee_invoice_lines` → `fee_invoices`, `ledger_entries`
  → `financial_accounts`, and so on). ADR-0003 §3 says "every money column carries a currency code";
  the implementation satisfies its intent without letting a document's own lines disagree. Read a
  joined document, never a bare child row, to learn the currency.
- **`outstandingAmount` genuinely does not exist** anywhere in the schema. Balance is computed.
- **Not every reference is a foreign key, and every exception is now named.** Of 604 `uuid` columns,
  153 are primary keys and 356 carry a foreign key; the remaining **95 are listed by group in
  `schema-contract.test.ts`**, which asserts the list matches the schema exactly in both directions —
  a bare column cannot ship without appearing in a named group where a reviewer sees it. 61 are
  attribution columns (`approvedByUserId` and 60 siblings) recorded as bare uuids so an audit row
  outlives the user who acted. 10 are polymorphic (`notifications.audienceId` and siblings with a
  discriminator column). 2 close a module import cycle, 6 have an ambiguous target under `ADR-0002`
  (a teacher may be `users.id` or `teachers.userId`), 2 form a loop with each other
  (`jobs.scheduleId` ↔ `jobSchedules.lastJobId`), 1 has no single column to point at, and 1 is a
  concurrency marker rather than a relationship. The remaining **12 are unexplained and believed to be
  omissions** — `attendanceExceptions.institutionId`, `permissions.institutionId`,
  `schedulePublishHistory.scheduleId`, `teacherLeaveBalances.academicSessionId`,
  `teacherLeaveBalances.leaveTypeId`, `teacherWorkloadHistory.academicSessionId`,
  `teacherAbsences.leaveRequestId`, and `journalTransactions.paymentId`,
  `journalTransactions.payrollRunId`, `payments.depositedToAccountId`,
  `payrollPayments.ledgerAccountId`, `payrollRuns.journalTransactionId` (these five were once
  documented as cycle-breakers; the import graph shows no cycle) — where the same name carries a key
  on other tables and
  no comment gives a reason. The same-table supersession case is **resolved**: all eight such
  pointers now carry a self-referencing foreign key — `set null` on seven of them, `restrict` on
  `expenseHeads.parentHeadId` — and six carry a "not itself" check; `payments.reversesPaymentId` and
  `journalTransactions.reversesTransactionId` have only a check that pairs the pointer with `status`.
  `payrollAdjustments.correctsRecordId` stays bare because it is polymorphic.

### Still open

1. **Deleted UI components** (`header.tsx`, `user-menu.tsx`) — what replaces them.
2. **Node pinning** — no `engines`/`.nvmrc`, so CI would float.
3. **`TECH-STACK.md`, `SECURITY.md`, `DESIGN.md`, `PERFORMANCE.md`** were not yet read in full;
   their constraints are not yet reflected in this model. Phase 1.5/1.6 should be revisited once
   they are.
4. **Multi-currency with non-2-decimal currencies** — D-7 assumes scale 2 (correct for PKR/USD).
   KWD/BHD (3 decimals) and JPY/KRW (0) would require revisiting ADR-0003. Not currently required.


