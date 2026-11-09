# PHASES.md

# Scholars Student Management System

## Engineering Development Phases & Autonomous Execution Plan

---

## 0. Purpose

This document defines the complete engineering execution plan for the Scholars Student Management System.

The project must be developed as a **modular, backend-first, engineering-driven full-stack application**.

The development process must never be:

> "Build screens first and connect logic later."

Instead, every module follows:

> **Understand → Model → Validate → Authorize → Implement Backend → Implement UI → Integrate → Test → Verify → Document → Complete**

The purpose of this document is to allow an AI coding agent to autonomously understand what needs to be done, create its own detailed TODOs, execute work in the correct dependency order, verify completed work, and resume safely after interruption.

---

# 1. Authoritative Documentation Hierarchy

Before beginning development, the agent must understand the role of each project document.

| Document                                     | Authority                                      |
| -------------------------------------------- | ---------------------------------------------- |
| `PRD.md`                                     | Product requirements and business behavior     |
| `ARCHITECTURE.md`                            | System architecture and technical structure    |
| `RULES.md`                                   | Mandatory engineering rules                    |
| `SECURITY.md`                                | Security requirements                          |
| `PERFORMANCE.md`                             | Performance and reliability requirements       |
| `DESIGN.md`                                  | UI/UX requirements                             |
| `MOBILE-FIRST-DESIGN-AND-PRINCIPLE-GUIDE.md` | Mobile-first design principles                 |
| `TECH-STACK.md`                              | Technology/version baseline                    |
| `PHASES.md`                                  | Development execution order                    |
| `MEMORY.md`                                  | Durable project knowledge, decisions and traps |
| `SOPs.md`                                    | Operational procedures                         |
| `AGENTS.md` / AI workflow documents          | AI-agent operating instructions                |

### Source-of-truth rule

If a lower-level document conflicts with `PRD.md` or `ARCHITECTURE.md`, the agent must not silently follow the conflicting instruction.

The conflict must be:

1. Identified.
2. Investigated.
3. Resolved if unambiguous.
4. Otherwise recorded as an open question.

---

# 2. Development Philosophy

The application is a modular monolith/full-stack Next.js application with clear domain boundaries.

The system will be developed **backend-first**.

This does not mean the UI is postponed until the end.

It means that every feature starts by establishing its:

- Domain model
- Data ownership
- Business rules
- Validation
- Authorization
- Server-side behavior
- Error model
- Transaction boundaries
- Audit requirements
- Concurrency requirements

before the UI is built on top of it.

---

# 3. Autonomous Agent Contract

The intended normal developer instruction is:

> **Start development according to PHASES.md.**

The agent must then:

1. Read the required project documentation.
2. Inspect the current repository state.
3. Determine the current phase.
4. Determine completed work.
5. Determine incomplete work.
6. Create a detailed internal TODO/task tree.
7. Identify dependencies.
8. Implement only the appropriate phase.
9. Run required verification.
10. Update project state.
11. Continue to the next eligible task/phase when safe.

The user should not need to manually explain every implementation step.

---

# 4. Required Initial Context Load

Before development or resumption, the agent must inspect:

### Product

- `PRD.md`

### Architecture

- `ARCHITECTURE.md`

### Engineering

- `RULES.md`
- `SECURITY.md`
- `PERFORMANCE.md`
- `DESIGN.md`
- `TECH-STACK.md`

### Workflow

- `PHASES.md`
- `SOPs.md`

### AI knowledge

- `MEMORY.md`
- `AGENTS.md`
- relevant AI workflow files
- relevant project skills

### Repository

Inspect the actual:

- source tree
- package configuration
- database configuration
- migrations
- tests
- scripts
- configuration
- environment requirements

The agent must distinguish:

> **Current implementation state**

from:

> **Target architecture/specification**

---

# 5. Phase Execution Model

Every phase follows the same lifecycle.

## Step A — Discovery

Understand the phase requirements and inspect existing implementation.

## Step B — Design

Determine:

- entities
- relationships
- boundaries
- workflows
- permissions
- validations
- transactions
- errors
- audit requirements

## Step C — Backend Foundation

Implement:

- schema/model
- database access
- domain logic
- services/use cases
- validation
- authorization
- transactions

## Step D — Integration

Connect the domain to the application layer.

## Step E — UI

Build the required user-facing interfaces using the established design system.

## Step F — Verification

Run:

- type checking
- linting
- unit tests
- integration tests
- database checks
- relevant E2E tests
- build verification

## Step G — Documentation

Update relevant:

- MEMORY
- architecture notes
- rules
- phase state
- implementation notes

## Step H — Completion Gate

A phase cannot be marked complete merely because code compiles.

All acceptance criteria must pass.

---

# 6. Phase State & Resume Protocol

Every phase must have an explicit state.

Allowed states:

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `VERIFICATION`
- `COMPLETED`

The agent must maintain enough durable state that development can stop at any point.

When interrupted:

1. Preserve completed work.
2. Record current task.
3. Record incomplete tasks.
4. Record blockers.
5. Record verification status.
6. Record migration state if applicable.
7. Record important decisions.
8. Leave the repository in a recoverable state.

When resumed, the agent must inspect actual repository state instead of assuming the previous session completed everything.

---

# 7. Global Completion Gate

Every phase must satisfy all applicable requirements:

### Data

- Correct schema/model.
- Correct relationships.
- Appropriate indexes/constraints.
- Historical data behavior considered.

### Backend

- Business logic implemented.
- Domain boundaries respected.
- Transactions used where necessary.
- Duplicate operations prevented.

### Authorization

- Server-side authorization enforced.
- Correct permissions required.
- Role inheritance handled correctly.
- Direct permissions respected.

### Validation

- Input validation implemented.
- Invalid state prevented.
- Cross-field/business validation handled.

### Errors

- Expected failures handled.
- User-facing errors are understandable.
- Internal errors do not leak sensitive information.

### Concurrency

- Stale updates considered.
- Concurrent mutation risks handled.
- Appropriate optimistic/concurrency protection implemented.

### UI

- Responsive.
- Mobile-first.
- Accessible.
- Human-readable.
- Permission-aware.
- Clear loading/empty/error/success states.

### Audit

Required sensitive operations are traceable.

### Testing

Relevant tests exist and pass.

### Documentation

Important architectural/business decisions are recorded.

---

# 8. PHASE 0 — Repository Discovery & Engineering Baseline

## Objective

Establish an accurate understanding of the current codebase before implementation.

### Tasks

1. Inspect the complete repository structure.
2. Read authoritative documentation.
3. Inspect package/dependency configuration.
4. Inspect current database configuration.
5. Inspect current schema/migrations.
6. Inspect authentication implementation if present.
7. Inspect authorization implementation if present.
8. Inspect application routing.
9. Inspect existing modules.
10. Inspect existing tests.
11. Inspect scripts.
12. Inspect environment/configuration requirements.
13. Identify current-state vs target-state differences.
14. Identify obsolete implementation.
15. Identify incomplete work.
16. Identify broken builds/tests.
17. Establish a baseline verification report.

### Engineering focus

- Repository archaeology
- Dependency analysis
- Architecture analysis
- Documentation reconciliation
- Risk identification

### Required skills

- Next.js
- TypeScript
- PostgreSQL
- Drizzle
- Git
- Testing
- Security
- Clean architecture

### Completion Gate

The agent can explain:

- What currently exists.
- What is missing.
- What is obsolete.
- What the target architecture requires.
- What Phase 1 must establish.

---

# 9. PHASE 1 — Project Infrastructure & Runtime Foundation

## Objective

Establish a reliable application foundation before domain development.

### Tasks

1. Verify Next.js application structure.
2. Verify TypeScript configuration.
3. Verify linting.
4. Verify formatting.
5. Verify package manager configuration.
6. Verify environment configuration.
7. Establish safe environment variable handling.
8. Establish application configuration boundaries.
9. Establish logging infrastructure.
10. Establish structured error handling.
11. Establish server/client boundaries.
12. Establish reusable validation infrastructure.
13. Establish reusable utility conventions.
14. Establish database connection infrastructure.
15. Establish migration workflow.
16. Establish test infrastructure.
17. Establish E2E infrastructure.
18. Establish CI-compatible verification commands.

### Completion Gate

A clean environment can:

- install dependencies
- typecheck
- lint
- test
- build
- connect to the intended database
- run migrations safely

---

# 10. PHASE 2 — Database & Domain Foundation

## Objective

Establish the database engineering foundation.

### Tasks

1. Configure PostgreSQL access.
2. Configure Drizzle ORM according to the current version.
3. Establish schema organization.
4. Establish migration conventions.
5. Establish database transaction conventions.
6. Establish seed/test-data conventions.
7. Establish ID strategy.
8. Establish slug strategy.
9. Establish timestamps.
10. Establish soft-delete/archive strategy where appropriate.
11. Establish audit metadata conventions.
12. Establish uniqueness constraints.
13. Establish foreign-key strategy.
14. Establish indexing strategy.
15. Establish optimistic concurrency/version strategy where required.
16. Verify migration generation.
17. Verify migration application.
18. Verify rollback/recovery strategy where applicable.

### Completion Gate

Database infrastructure is reliable enough for domain implementation.

---

# 11. PHASE 3 — Authentication & Identity

## Objective

Implement secure application identity.

### Tasks

1. Establish user entity.
2. Establish credential handling.
3. Establish password hashing.
4. Establish session model.
5. Establish secure cookies.
6. Implement login.
7. Implement logout.
8. Implement session validation.
9. Implement email verification.
10. Implement forgot-password workflow.
11. Implement password reset.
12. Handle expired sessions.
13. Handle revoked sessions where required.
14. Establish authentication middleware/server guards.
15. Add authentication tests.

### Completion Gate

An unauthenticated user cannot access protected application functionality.

---

# 12. PHASE 4 — Roles, Permissions & Authorization

## Objective

Implement permission-first authorization.

### Required actors

- Super Admin
- Admin
- Accountant
- Floor-Incharge
- Teacher
- HR
- Student
- Guardian/Parent
- Other Staff

### Tasks

1. Model roles.
2. Model permissions.
3. Model role-permission relationships.
4. Support multiple roles per user.
5. Support direct user permissions.
6. Establish permission inheritance rules.
7. Establish authorization service.
8. Establish server-side action authorization.
9. Establish route authorization.
10. Establish permission-aware UI helpers.
11. Prevent unauthorized mutations.
12. Test role combinations.
13. Test direct permission overrides.
14. Test denied actions.

### Completion Gate

Authorization is enforced independently of UI visibility.

---

# 13. PHASE 5 — Application Shell & Admin Foundation

## Objective

Build the reusable application shell required by all portals.

### Tasks

1. Establish navigation architecture.
2. Establish authenticated layout.
3. Establish role-aware navigation.
4. Establish dashboard layout.
5. Establish reusable page headers.
6. Establish tables.
7. Establish forms.
8. Establish dialogs.
9. Establish confirmation flows.
10. Establish loading states.
11. Establish empty states.
12. Establish error states.
13. Establish notification presentation.
14. Establish responsive/mobile navigation.
15. Establish accessibility conventions.

### Completion Gate

All future modules can use a consistent application shell.

---

# 14. PHASE 6 — Institute & Academic Master Structure

## Objective

Build the academic foundation used by almost every subsequent module.

### Entities

- Institute context
- Academic Year
- Class
- Section
- Group
- Subject
- Department
- Designation
- Building
- Floor
- Time Slot
- Period

### Tasks

1. Implement institute context.
2. Implement academic years.
3. Implement academic levels.
4. Implement classes.
5. Implement sections.
6. Implement groups.
7. Implement subjects.
8. Implement departments.
9. Implement buildings/floors.
10. Implement time slots.
11. Implement historical academic-year preservation.
12. Prevent invalid relationships.
13. Build Admin management UI.
14. Add authorization.
15. Add tests.

### Completion Gate

Academic structure is stable and reusable by dependent modules.

---

# 15. PHASE 7 — Student & Guardian Domain

## Objective

Establish the complete student identity and lifecycle domain.

### Tasks

1. Student profile.
2. Student identifiers.
3. User/student relationship.
4. Guardian entity.
5. Guardian/student relationship.
6. Multiple students per guardian.
7. Personal information.
8. Contact information.
9. Address.
10. Documents.
11. Academic enrollment.
12. Historical enrollment.
13. Student status lifecycle.
14. Student slug.
15. Guardian portal identity.
16. Data privacy rules.
17. Student/guardian authorization.

### Completion Gate

A student can exist as a complete domain entity with historical academic relationships.

---

# 16. PHASE 8 — Admissions

## Objective

Implement the admission lifecycle.

### Tasks

1. Admission form.
2. Student creation.
3. Guardian creation/linking.
4. Document collection.
5. Academic assignment.
6. Admission date.
7. Previous-school information.
8. Admission validation.
9. Duplicate detection.
10. Admission status.
11. Student account provisioning.
12. Guardian account provisioning.
13. Admission audit trail.
14. Admission UI.
15. Admission workflow tests.

### Completion Gate

A complete admission can create the required student, guardian, academic and account relationships without inconsistent state.

---

# 17. PHASE 9 — Student Fee Management

## Objective

Implement the complete student-fee domain.

### Tasks

1. Fee structures.
2. Fee components.
3. Student fee assignment.
4. Monthly fee generation.
5. Due dates.
6. Paid amounts.
7. Outstanding amounts.
8. Overdue status.
9. Deferred fees.
10. Discounts/adjustments where applicable.
11. Fee collection.
12. Receipts.
13. Financial history.
14. Manual correction.
15. Manual adjustment.
16. Authorization.
17. Audit.
18. Concurrency protection.
19. Fee dashboards.
20. Student/parent fee visibility.

### Critical Rule

Automatic fee calculation must not silently destroy an authorized manual adjustment.

### Completion Gate

Fee lifecycle works from assignment through collection, adjustment and history.

---

# 18. PHASE 10 — Finance & Accounting

## Objective

Build the institute-wide finance domain.

### Tasks

1. Financial transaction model.
2. Income records.
3. Expense records.
4. Fee transaction integration.
5. Payroll transaction integration.
6. Ledger structure.
7. Financial categories.
8. Monthly summaries.
9. Income totals.
10. Expense totals.
11. Net position.
12. Outstanding balances.
13. Financial reporting.
14. Accountant permissions.
15. Financial audit.
16. Transaction integrity.

### Completion Gate

Financial records from fees and payroll can flow into a coherent institute-level financial picture.

---

# 19. PHASE 11 — HR & Employee Management

## Objective

Establish employee records independently from authentication identity.

### Employee categories

- Teacher
- Accountant
- Floor-Incharge
- HR
- Other Staff

### Tasks

1. Employee entity.
2. Employee profile.
3. Employment information.
4. Department.
5. Designation.
6. Employment type.
7. Joining date.
8. Salary configuration.
9. Employment status.
10. Employee history.
11. User/employee relationship where required.
12. HR permissions.
13. Employee management UI.

### Completion Gate

Employee information can be maintained independently while connecting securely to user accounts.

---

# 20. PHASE 12 — Payroll & Salary Engine

## Objective

Implement automated salary calculation with safe manual overrides.

### Salary types

- Fixed salary
- Unit/period-based salary

### Tasks

1. Salary configuration.
2. Salary periods.
3. Fixed salary calculation.
4. Unit-based calculation.
5. Completed-period tracking.
6. Extra-period support.
7. Salary calculation snapshot.
8. Manual override.
9. Override reason.
10. Calculated value preservation.
11. Adjusted value preservation.
12. Payroll finalization.
13. Salary history.
14. Payroll transaction integration.
15. Audit.
16. Concurrency protection.

### Critical Rule

Store enough information to distinguish:

- Calculated amount
- Manual adjusted amount
- Adjustment reason
- User
- Timestamp

### Completion Gate

Payroll is reproducible, auditable and resistant to accidental recalculation overwrites.

---

# 21. PHASE 13 — Accountant Portal

## Objective

Provide a dedicated finance-focused interface.

### Tasks

1. Accountant dashboard.
2. Fee collection.
3. Receipts.
4. Financial transactions.
5. Expenses.
6. Ledgers.
7. Financial reports.
8. Notifications.
9. Staff attendance visibility where permitted.
10. Permission restrictions.

### Completion Gate

Accountant can perform all authorized finance operations without receiving unrelated administrative privileges.

---

# 22. PHASE 14 — Teacher Domain & Teacher Portal

## Objective

Establish teacher identity, assignments and teacher-facing academic operations.

### Tasks

1. Teacher profile.
2. Teacher employment linkage.
3. Teaching assignments.
4. Class assignments.
5. Subject assignments.
6. Teacher portal.
7. Assigned-class view.
8. Assigned-subject view.
9. Teacher notifications.
10. Teacher permissions.
11. Teacher-related audit.

### Completion Gate

A teacher can see and operate only within their authorized academic scope.

---

# 23. PHASE 15 — Student & Staff Attendance

## Objective

Build attendance as a reliable domain rather than a simple checkbox UI.

### Student attendance

1. Attendance sessions.
2. Date/class/section scope.
3. Student statuses.
4. Attendance marking.
5. Finalization.
6. Corrections.
7. Authorization.
8. Historical records.

### Staff attendance

1. Employee attendance.
2. Present.
3. Absent.
4. Late.
5. Leave.
6. Regular off.
7. Attendance corrections.
8. Attendance history.

### Completion Gate

Attendance records are traceable, permission-controlled and historically reliable.

---

# 24. PHASE 16 — Parent Leave Requests

## Objective

Implement the parent-controlled student leave workflow.

### Tasks

1. Guardian creates request.
2. Student selection.
3. Leave dates.
4. Reason.
5. Submission.
6. Approval/rejection.
7. Status tracking.
8. Attendance integration.
9. Notifications.
10. Audit.

### Critical rule

Approved leave:

> `LEAVE`

Unapproved/rejected leave + absence:

> `ABSENT`

### Completion Gate

Attendance and leave cannot produce contradictory states.

---

# 25. PHASE 17 — Scheduling & Academic Period Management

## Objective

Build the scheduling engine required for classes, teachers and floor operations.

### Schedule context

> Building → Floor → Class → Section → Group → Subject → Teacher → Time Slot

### Tasks

1. Time-slot model.
2. Period model.
3. Teacher assignment.
4. Class assignment.
5. Subject assignment.
6. Group assignment.
7. Floor context.
8. Conflict detection.
9. Teacher double-booking prevention.
10. Class double-booking prevention.
11. Floor conflicts.
12. Invalid assignment prevention.
13. Schedule management UI.
14. Schedule queries optimized for operational views.

### Completion Gate

The system cannot persist known scheduling conflicts.

---

# 26. PHASE 18 — Floor-Incharge Operations

## Objective

Build operational floor management.

### Tasks

1. Floor-Incharge authorization scope.
2. Current-period view.
3. Current class.
4. Current section/group.
5. Current subject.
6. Current teacher.
7. Student attendance access.
8. Teacher absence visibility.
9. Free-period detection.
10. Replacement teacher availability.
11. Replacement assignment.
12. Alternative activity/test assignment where allowed.
13. Extra-period creation.
14. Operational audit.

### Completion Gate

A Floor-Incharge can manage operational classroom disruptions without receiving unrestricted administrative access.

---

# 27. PHASE 19 — Teacher Absence & Replacement

## Objective

Connect teacher attendance with scheduling and payroll.

### Workflow

> Teacher Absent
> ↓
> Identify affected periods
> ↓
> Identify available teachers
> ↓
> Assign replacement
> ↓
> Record Extra Period
> ↓
> Include in salary calculation

### Tasks

1. Detect affected periods.
2. Identify available teachers.
3. Prevent replacement conflicts.
4. Assign replacement.
5. Record reason.
6. Create extra-period record.
7. Prevent duplicate extra-period records.
8. Integrate with payroll.
9. Audit replacement action.

### Completion Gate

A replacement period can be traced from teacher absence to operational assignment to payroll.

---

# 28. PHASE 20 — Examinations, Marks & Results

## Objective

Build the formal examination system.

### Examination types

- Monthly Tests
- Grand Tests
- Midterm
- Annual/Final

### Tasks

1. Examination definitions.
2. Exam periods.
3. Subject configuration.
4. Student eligibility.
5. Marks entry.
6. Marks validation.
7. Marks editing permissions.
8. Marks finalization.
9. Percentage calculation.
10. Grade calculation where applicable.
11. Result status.
12. Student result view.
13. Class result view.
14. Section result view.
15. Result history.
16. Audit.

### Completion Gate

Marks and results are mathematically correct, permission-controlled and historically preserved.

---

# 29. PHASE 21 — Daily Tests

## Objective

Implement continuous subject-level testing.

### Tasks

1. Daily test creation.
2. Teacher ownership.
3. Subject scope.
4. Student scope.
5. Marks entry.
6. Validation.
7. Submission.
8. Editing rules.
9. Student aggregation.
10. Parent aggregation.
11. Test history.
12. Notifications where required.

### Critical Rule

Do not send a separate email for every daily test.

### Completion Gate

Teachers can manage only their authorized subject/test scope and students/parents can view aggregated test history.

---

# 30. PHASE 22 — Daily Diary

## Objective

Implement teacher-created academic diary workflows.

### Tasks

1. Diary entry.
2. Subject scope.
3. Student/class scope.
4. Date.
5. Content.
6. Assignment.
7. Student visibility.
8. Parent visibility.
9. Daily notification trigger.
10. Email link.
11. In-app notification.
12. Audit where appropriate.

### Completion Gate

A diary entry becomes available to the correct student/guardian scope without unauthorized exposure.

---

# 31. PHASE 23 — Complaints

## Objective

Implement controlled student complaint/reporting workflows.

### Tasks

1. Complaint creation.
2. Teacher ownership.
3. Student linkage.
4. Reason.
5. Description.
6. Status.
7. Authorized visibility.
8. Administrative handling.
9. Notifications.
10. Audit.

### Completion Gate

Complaints remain private to authorized users and cannot become an uncontrolled communication channel.

---

# 32. PHASE 24 — Notifications & Announcements

## Objective

Build centralized communication infrastructure.

### Notifications

Support targeting by:

- User
- Role
- Department
- Class
- Section
- Parent/Guardian
- Teacher
- Other authorized audiences

### Tasks

1. Notification model.
2. Targeting engine.
3. Read/unread state.
4. Notification center.
5. Notification permissions.
6. Announcement model.
7. Audience selection.
8. Broadcast mechanism.
9. Notification lifecycle.
10. Duplicate prevention.

### Completion Gate

Notification workflows are centralized rather than independently implemented inside every module.

---

# 33. PHASE 25 — SMTP Email Infrastructure

## Objective

Establish self-controlled email infrastructure.

### Tasks

1. SMTP configuration.
2. Secure environment variables.
3. Email transport.
4. Central email service.
5. Template system.
6. Verification emails.
7. Password reset emails.
8. Daily diary emails.
9. Monthly report emails.
10. Failure handling.
11. Retry strategy.
12. Logging without secrets.

### Completion Gate

Required email workflows can be triggered through a common infrastructure without requiring a paid transactional email SaaS.

---

# 34. PHASE 26 — Monthly Test Reports

## Objective

Generate monthly aggregated test reports.

### Tasks

1. Determine reporting period.
2. Aggregate daily tests.
3. Aggregate subjects.
4. Calculate report metrics.
5. Generate report state.
6. Prevent duplicate generation.
7. Store report snapshot where appropriate.
8. Expose report to student.
9. Expose report to guardian.
10. Generate parent email.
11. Add quick-link.
12. Audit generation.

### Completion Gate

Monthly report generation is repeatable and idempotent.

---

# 35. PHASE 27 — Background Jobs & Worker Infrastructure

## Objective

Move suitable long-running work outside normal request lifecycles.

### Candidate workloads

- Monthly reports
- Bulk emails
- Daily notifications
- Biometric processing
- Large report generation
- Other long-running processing

### Tasks

1. Establish worker architecture.
2. Establish queue architecture.
3. Establish job definitions.
4. Establish job payload validation.
5. Establish retry strategy.
6. Establish idempotency strategy.
7. Establish failure handling.
8. Establish dead-letter/failure visibility where required.
9. Establish job logging.
10. Establish monitoring.
11. Establish scheduled job mechanism without mandatory paid SaaS.

### Completion Gate

Background jobs can fail/retry safely without creating duplicate business records or duplicate notifications.

---

# 36. PHASE 28 — Reports & Insights

## Objective

Create centralized reporting.

### Academic

- Student performance
- Daily tests
- Monthly tests
- Examinations
- Class results
- Section results

### Attendance

- Student attendance
- Teacher attendance
- Staff attendance
- Leave
- Late
- Absence

### Finance

- Fees
- Collection
- Expenses
- Salary
- Profit/loss
- Growth
- Outstanding

### HR

- Salary
- Attendance
- Employee records
- Performance

### Tasks

1. Define report ownership.
2. Define authorization.
3. Define filters.
4. Define date ranges.
5. Implement pagination where required.
6. Implement aggregation efficiently.
7. Add export functionality only where required.
8. Add background generation for expensive reports.

---

# 37. PHASE 29 — Directory

## Objective

Build a centralized searchable directory.

### Entities

- Students
- Parents/Guardians
- Teachers
- Staff

### Tasks

1. Search.
2. Filtering.
3. Pagination.
4. Human-readable display.
5. Permission-aware fields.
6. Detail views.
7. Slug-based navigation.
8. Mobile-friendly UI.

### Completion Gate

Users can quickly find authorized records without exposing restricted information.

---

# 38. PHASE 30 — Audit Trail

## Objective

Implement centralized auditability.

### Required sensitive areas

- Student records
- Fees
- Salary
- Payroll
- Marks
- Attendance
- Permissions
- Financial transactions
- Administrative changes

### Audit record should support

- Actor
- Action
- Entity
- Timestamp
- Relevant context
- Previous value where appropriate
- New value where appropriate

### Tasks

1. Audit model.
2. Audit service.
3. Sensitive-action integration.
4. Query/filter UI for authorized users.
5. Tamper-resistant design considerations.
6. Retention strategy.
7. Audit tests.

### Completion Gate

Important business mutations can be reconstructed from audit history.

---

# 39. PHASE 31 — System Settings

## Objective

Centralize configurable system behavior.

### Areas

- Institute settings
- Academic settings
- Fee settings
- Salary settings
- Attendance settings
- Notification settings
- Email settings
- Security settings
- General settings

### Tasks

1. Define setting ownership.
2. Define defaults.
3. Define validation.
4. Define authorization.
5. Define change audit.
6. Implement settings UI.
7. Ensure modules consume settings safely.

---

# 40. PHASE 32 — Biometric Attendance Integration

## Objective

Integrate the ZKTeco K50 through an isolated integration boundary.

### Required considerations

- Fingerprint
- TCP/IP
- ADMS/Push protocol
- HTTP/HTTPS
- Cloud/server configuration
- Transaction storage
- USB where applicable
- Device battery considerations

### Tasks

1. Verify exact device/firmware capabilities.
2. Define integration contract.
3. Define device configuration.
4. Define transaction ingestion.
5. Define authentication/security.
6. Store raw device transactions where appropriate.
7. Normalize attendance transactions.
8. Prevent duplicate transactions.
9. Map device identities to employees.
10. Handle device/network failures.
11. Add reconciliation tools.
12. Integrate normalized attendance into staff attendance.

### Critical Rule

Device-specific logic must remain isolated from the core attendance domain.

### Completion Gate

Removing/changing the biometric device does not require rewriting the attendance domain.

---

# 41. PHASE 33 — Performance & Concurrency Hardening

## Objective

Harden the application for multi-user operation.

### Tasks

1. Audit expensive database queries.
2. Add appropriate indexes.
3. Verify pagination.
4. Verify cache invalidation.
5. Verify revalidation.
6. Verify mutation refresh behavior.
7. Test concurrent updates.
8. Test stale UI submission.
9. Implement optimistic concurrency where required.
10. Verify transaction boundaries.
11. Verify duplicate mutation prevention.
12. Verify background job idempotency.
13. Verify large-report performance.
14. Verify dashboard performance.

### Completion Gate

Concurrent users cannot silently overwrite each other's important updates.

---

# 42. PHASE 34 — Security Hardening

## Objective

Perform an application-wide security audit.

### Tasks

1. Authentication audit.
2. Session security audit.
3. Cookie security audit.
4. Authorization audit.
5. Permission bypass testing.
6. Input validation audit.
7. SQL/database safety audit.
8. Sensitive data exposure audit.
9. File upload security where applicable.
10. Email security.
11. Secrets audit.
12. Logging audit.
13. Audit-trail security.
14. Biometric integration security.
15. Background worker security.
16. Rate limiting where appropriate.
17. Error leakage audit.

### Completion Gate

No known critical authorization or sensitive-data exposure remains.

---

# 43. PHASE 35 — Comprehensive Testing

## Objective

Establish confidence in business-critical workflows.

Testing layers:

### Unit

Domain/business logic.

### Integration

Database + server/domain operations.

### Authorization

Permission boundaries.

### E2E

Real user workflows.

### Critical E2E workflows

At minimum verify:

1. Admin login.
2. User/role/permission management.
3. Academic structure creation.
4. Student admission.
5. Guardian linking.
6. Student fee assignment.
7. Fee collection.
8. Manual fee adjustment.
9. Employee creation.
10. Teacher assignment.
11. Fixed salary.
12. Unit-based salary.
13. Extra period.
14. Payroll.
15. Accountant operations.
16. Student portal.
17. Guardian portal.
18. Student attendance.
19. Staff attendance.
20. Leave request.
21. Teacher absence.
22. Replacement teacher.
23. Scheduling conflict.
24. Examination marks.
25. Daily tests.
26. Daily diary.
27. Notifications.
28. Monthly test report.
29. Audit trail.
30. Permission denial.

### Completion Gate

Critical workflows pass from end to end.

---

# 44. PHASE 36 — UI/UX & Accessibility Audit

## Objective

Verify the complete application against the user-friendly UI requirement.

### Audit

- Navigation clarity
- Button labels
- Form clarity
- Mobile responsiveness
- Accessibility
- Keyboard navigation
- Focus states
- Empty states
- Error states
- Success states
- Confirmation dialogs
- Table usability
- Search/filter usability
- Human-readable values
- No raw IDs
- Slug-based routes
- Role-specific navigation

### Completion Gate

A non-technical school/college staff member can understand major workflows without technical assistance.

---

# 45. PHASE 37 — Documentation & AI-Agent Knowledge Finalization

## Objective

Ensure the project can be maintained effectively by future AI agents.

### Tasks

1. Verify PRD consistency.
2. Verify architecture consistency.
3. Verify rules.
4. Verify security documentation.
5. Verify performance documentation.
6. Verify design documentation.
7. Verify technology documentation.
8. Update MEMORY.md.
9. Update skills inventory.
10. Update relevant skills.
11. Update README.
12. Verify AGENTS/AI workflow instructions.
13. Remove contradictory documentation.
14. Preserve useful historical troubleshooting knowledge.
15. Record important architectural decisions.
16. Record remaining open questions.

### Completion Gate

A new AI agent can understand the project without reconstructing its architecture from scratch.

---

# 46. PHASE 38 — Production Readiness

## Objective

Verify that the system is actually deployable and maintainable.

### Tasks

1. Production environment configuration.
2. Production database configuration.
3. Migration strategy.
4. Backup strategy.
5. Restore verification.
6. Logging.
7. Monitoring.
8. Error tracking.
9. SMTP configuration.
10. Worker deployment.
11. Queue infrastructure.
12. Security configuration.
13. HTTPS.
14. Cookie configuration.
15. Environment-secret management.
16. Health checks.
17. Database health checks.
18. Worker health checks.
19. Deployment verification.
20. Rollback procedure.

### Completion Gate

The application can be deployed with a documented operational procedure.

---

# 47. PHASE 39 — Final System Verification

## Objective

Perform final cross-module verification.

### Verify complete business chain

## Admission

Admin
→ Student
→ Guardian
→ Academic assignment
→ Accounts

## Academic

Teacher
→ Class
→ Section
→ Group
→ Subject
→ Schedule

## Attendance

Teacher absence
→ affected period
→ Floor-Incharge
→ replacement
→ Extra Period
→ Payroll

## Finance

Student
→ Fee
→ Collection
→ Finance

Employee
→ Salary
→ Payroll
→ Finance

## Academic performance

Teacher
→ Daily Test
→ Monthly aggregation
→ Report
→ Student
→ Guardian

## Diary

Teacher
→ Diary
→ Student
→ Guardian
→ Daily notification/email

## Leave

Guardian
→ Leave request
→ Approval/rejection
→ Attendance

### Final checks

- Authorization
- Concurrency
- Audit
- Notifications
- Background jobs
- Database integrity
- UI consistency
- Mobile responsiveness
- Security
- Performance
- Testing
- Documentation

---

# 48. Dependency Model

The following represents the primary dependency order.

```text
Phase 0
  ↓
Phase 1
  ↓
Phase 2
  ↓
Phase 3
  ↓
Phase 4
  ↓
Phase 5
  ↓
Phase 6
  ↓
Phase 7
  ↓
Phase 8
  ↓
Phase 9
  ↓
Phase 10
  ↓
Phase 11
  ↓
Phase 12
  ↓
Phase 13
  ↓
Phase 14
  ↓
Phase 15
  ↓
Phase 16
  ↓
Phase 17
  ↓
Phase 18
  ↓
Phase 19
  ↓
Phase 20
  ↓
Phase 21
  ↓
Phase 22
  ↓
Phase 23
  ↓
Phase 24
  ↓
Phase 25
  ↓
Phase 26
  ↓
Phase 27
  ↓
Phase 28
  ↓
Phase 29
  ↓
Phase 30
  ↓
Phase 31
  ↓
Phase 32
  ↓
Phase 33
  ↓
Phase 34
  ↓
Phase 35
  ↓
Phase 36
  ↓
Phase 37
  ↓
Phase 38
  ↓
Phase 39
```

Some phases may be developed in parallel **only when their dependency requirements are already satisfied**.

The agent must not parallelize work merely to increase coding speed.

---

# 49. Skill Mapping

The agent must select skills according to the engineering work being performed.

## Foundation

Use:

- Next.js
- TypeScript
- pnpm
- Git
- Clean Code
- Security
- Testing

## Database

Use:

- PostgreSQL
- Drizzle ORM
- Database design
- Migration engineering
- Transaction design

## Authentication

Use:

- Next.js authentication patterns
- Security
- Session management
- Cookie security
- Validation

## Authorization

Use:

- RBAC
- Authorization
- Security
- TypeScript

## Forms

Use:

- React Hook Form
- Zod
- Accessibility
- Responsive design

## Tables/Data-heavy UI

Use:

- TanStack Table
- shadcn/ui
- Accessibility
- Responsive design

## Academic modules

Use:

- Domain modeling
- PostgreSQL
- Drizzle
- Zod
- Testing

## Finance/Payroll

Use:

- Database transactions
- Financial data integrity
- Audit design
- Concurrency
- Testing

## Scheduling

Use:

- Domain modeling
- Constraint validation
- PostgreSQL
- Transaction design
- Testing

## Notifications/Email

Use:

- API/backend development
- SMTP
- Background jobs
- Testing

## Workers

Use:

- BullMQ
- Redis
- Background processing
- Idempotency
- Retry/failure handling

## Biometric integration

Use:

- API development
- Network integration
- Security
- Background processing
- Testing

## Final verification

Use:

- Playwright
- Vitest
- TypeScript
- ESLint
- Security testing
- Performance testing

The agent must inspect the actual installed project skills before development and use the most relevant available skills rather than blindly loading every skill.

---

# 50. Module Completion Template

For every feature/module, the agent should internally create a task tree similar to:

```text
MODULE
├── Discovery
├── Domain model
├── Database schema
├── Migration
├── Constraints/indexes
├── Business rules
├── Validation
├── Authorization
├── Server/domain logic
├── Transactions
├── Concurrency
├── Audit
├── UI
├── Loading states
├── Empty states
├── Error states
├── Notifications
├── Reports
├── Unit tests
├── Integration tests
├── E2E tests
├── Documentation
└── Completion verification
```

Not every item is mandatory for every module.

The agent must determine applicability rather than mechanically implementing irrelevant components.

---

# 51. Migration Safety

Database migrations must be treated as production-sensitive operations.

Before a migration:

1. Understand affected tables.
2. Understand existing data.
3. Determine whether migration is destructive.
4. Determine whether a backfill is required.
5. Determine whether application compatibility is required during transition.
6. Generate migration.
7. Review migration.
8. Test migration.
9. Verify resulting schema.
10. Record important migration knowledge.

Never destroy existing production-like data merely to make development easier.

---

# 52. No Blind Coding Rule

The agent must never start implementation without understanding the relevant:

- PRD requirement
- Architecture boundary
- Data model
- Business rules
- Authorization
- Dependencies
- Existing implementation

If something is unclear, investigate project documentation and existing code first.

If still ambiguous and the decision materially changes the system:

> Record an open question rather than inventing a requirement.

---

# 53. No Premature Abstraction Rule

Do not create generic abstractions merely because two pieces of code look superficially similar.

Abstractions must be justified by:

- Stable shared behavior
- Repeated domain responsibility
- Clear ownership
- Reduced duplication without obscuring business logic

Prefer module-local code until shared behavior is proven.

---

# 54. No Cross-Module Leakage

A module must not directly manipulate another module's internal implementation.

Preferred relationship:

```text
Module A
   ↓
Public domain/service contract
   ↓
Module B
```

Avoid:

```text
Module A
   ↓
Module B internal database/service implementation
```

This keeps future changes isolated.

---

# 55. Business Rule Preservation

The agent must preserve the following high-risk business rules:

### Salary

Automatic calculation + authorized manual override + history.

### Teacher replacement

Replacement period becomes an Extra Period where applicable.

### Leave

Approved leave is Leave.

Rejected/unapproved leave + absence is Absent.

### Fees

Automatic calculations must not silently destroy manual adjustments.

### Scheduling

Known conflicts must be prevented.

### Permissions

UI visibility is not security.

### Concurrency

Stale UI must not blindly overwrite newer data.

### Routes

User-facing routes use slugs rather than database IDs.

### Display

User-facing UI uses names/labels rather than raw IDs.

### Notifications

Daily tests do not generate separate parent emails.

### Diary

Daily diary notification workflow is separate from daily-test notification behavior.

### Monthly reports

Monthly report generation must be idempotent.

---

# 56. Safe Pause Protocol

If the user stops development:

> STOP.

The agent must immediately stop starting new work.

Before stopping, it should record:

- Current phase
- Current task
- Completed tasks
- Remaining tasks
- Current blockers
- Tests run
- Tests passing/failing
- Migration state
- Important decisions
- Files modified
- Any known risks

The repository must remain in a recoverable state.

---

# 57. Safe Resume Protocol

When the user later says:

> Continue development according to PHASES.md.

The agent must:

1. Re-read relevant documentation.
2. Inspect actual git/repository state.
3. Inspect current implementation.
4. Inspect current phase state.
5. Compare expected state against actual state.
6. Reconstruct incomplete TODOs.
7. Verify whether previous tasks really completed.
8. Continue from the first valid incomplete task.
9. Never assume that an unchecked task is complete.
10. Re-run relevant verification before advancing.

---

# 58. Phase Advancement Rule

A phase may advance only when:

```text
Requirements understood
        +
Architecture satisfied
        +
Implementation complete
        +
Authorization complete
        +
Validation complete
        +
Relevant tests passing
        +
Migration verified
        +
UI verified
        +
Audit requirements satisfied
        +
Documentation updated
        =
PHASE COMPLETE
```

A green build alone does not equal phase completion.

---

# 59. Blocked Phase Rule

If a phase is blocked:

1. Do not fake completion.
2. Do not bypass the requirement.
3. Identify exact blocker.
4. Determine whether another independent task can proceed.
5. Continue only with safe independent work.
6. Record blocker.
7. If user decision is required, present the decision clearly.
8. Resume once resolved.

---

# 60. Final Completion Criteria

The project is considered engineering-complete only when:

- All required PRD modules are implemented.
- Architecture boundaries are respected.
- Authentication is secure.
- Authorization is enforced.
- Core academic workflows work.
- Student lifecycle works.
- Fee management works.
- Finance works.
- HR/payroll works.
- Attendance works.
- Scheduling works.
- Teacher replacement works.
- Examinations work.
- Daily tests work.
- Daily diary works.
- Leave workflow works.
- Notifications work.
- Email workflows work.
- Reports work.
- Audit trail works.
- Background processing works where required.
- Biometric integration works where required.
- Concurrency protection is verified.
- Security audit passes.
- Performance checks pass.
- Critical E2E workflows pass.
- Documentation is synchronized.
- AI-agent knowledge is synchronized.
- Production readiness is verified.

---

# 61. Final Operating Instruction

The intended autonomous development workflow is:

```text
Start development according to PHASES.md.
```

The agent must then autonomously:

```text
Read
↓
Understand
↓
Inspect current state
↓
Determine phase
↓
Create TODO tree
↓
Implement
↓
Verify
↓
Document
↓
Checkpoint
↓
Advance
```

When interrupted:

```text
Checkpoint
↓
Stop safely
```

When resumed:

```text
Inspect state
↓
Verify checkpoint
↓
Reconstruct TODOs
↓
Continue from exact incomplete work
```

The objective is not maximum coding speed.

The objective is:

> **Correctness + maintainability + traceability + modularity + security + reliable autonomous development.**

The system must be developed as an engineered product, not as a collection of independently generated screens.
