# SCHOOL MANAGEMENT SYSTEM

# Engineering Rules & Development Standards

> **Status:** Authoritative Engineering Rules
> **Scope:** Entire application
> **Applies to:** All modules, all code, all AI-assisted development, all future requirements
> **Primary Goal:** Maintain a modular, secure, maintainable, production-grade system without architectural drift.

---

# 1. Purpose

This document defines the non-negotiable engineering rules for the School & College Management System.

These rules apply to:

- Human developers
- AI coding agents
- Automated development workflows
- New modules
- Existing modules
- Refactors
- Bug fixes
- Database changes
- UI changes
- Integrations
- Background jobs
- Infrastructure changes

The system must be developed as a **real software product**, not as a collection of disconnected pages.

The fundamental development principle is:

> **Understand → Design → Implement → Validate → Verify → Document**

Never:

> **Guess → Code → Hope**

---

# 2. Source-of-Truth Hierarchy

When requirements conflict, use the following priority order:

1. Explicit latest user requirements
2. Approved PRD
3. Approved ARCHITECTURE
4. PHASES development plan
5. RULES defined in this document
6. DESIGN system
7. Other project documentation
8. Existing implementation

Existing code must **not** automatically be treated as correct.

If existing implementation conflicts with an approved requirement or architecture, the implementation must be corrected.

Do not preserve incorrect legacy behavior merely because it already exists.

---

# 3. Requirement Preservation Rule

Never silently change business requirements.

When a new requirement is introduced:

1. Understand the intended business behavior.
2. Determine which module owns the behavior.
3. Determine affected modules.
4. Determine dependencies.
5. Determine whether the requirement conflicts with existing rules.
6. Identify required architectural changes.
7. Update the relevant documentation when necessary.
8. Implement only after the intended behavior is understood.

If a requirement is ambiguous and the ambiguity materially affects implementation, do not invent business behavior.

Clearly identify the ambiguity and resolve it before implementing the affected behavior.

---

# 4. No Blind Coding

AI-assisted development must not begin by randomly creating components, routes, models, or database tables.

Before implementing a meaningful feature, the agent must understand:

- Relevant requirements
- Existing architecture
- Existing module boundaries
- Existing database models
- Existing authorization model
- Existing shared infrastructure
- Existing UI patterns
- Existing validation patterns
- Existing error handling
- Existing audit requirements
- Existing tests
- Relevant skills and development guidance

The agent must reuse existing infrastructure where appropriate instead of creating duplicate systems.

---

# 5. Modular Architecture Rule

The application is modular.

Each business domain must have a clear ownership boundary.

Examples include:

- Authentication
- Authorization
- Institute Structure
- Students
- Admissions
- Fees
- Finance
- HR
- Payroll
- Attendance
- Scheduling
- Examinations
- Daily Tests
- Daily Diary
- Complaints
- Notifications
- Reports
- Audit
- Integrations

Module boundaries must remain explicit.

Do not scatter business logic belonging to one module across unrelated modules.

---

# 6. Module Ownership

Every important piece of business logic must have a clear owner.

For example:

- Fee calculation belongs to the finance/fee domain.
- Salary calculation belongs to payroll.
- Student admission belongs to admissions/student management.
- Academic assignments belong to academic structure.
- Attendance rules belong to attendance.
- Notification delivery belongs to notifications.
- Audit recording belongs to the audit infrastructure.

A module may expose functionality to another module through a clearly defined service/API boundary.

Do not directly manipulate another module's internal implementation merely because it is technically possible.

---

# 7. Dependency Direction

Dependencies should flow from foundational infrastructure toward higher-level business modules.

Foundational systems may be consumed by business modules.

Examples:

- Database infrastructure → modules
- Authentication → authorization
- Authorization → protected modules
- Academic structure → students
- Students → fees
- Students/teachers → attendance
- Scheduling → floor operations
- Payroll → finance

Avoid circular dependencies.

If two modules require each other's internal implementation, stop and redesign the boundary.

---

# 8. No God Modules

Do not create giant files or modules containing unrelated business logic.

Avoid:

- One giant service
- One giant route handler
- One giant schema file
- One giant utility file
- One giant component
- One giant permission function
- One giant database abstraction

Split functionality according to domain responsibility.

---

# 9. Reuse Before Duplication

Before creating a new:

- Component
- Utility
- Validation schema
- Permission helper
- Query helper
- Service
- Hook
- Database helper
- UI pattern

search the existing codebase first.

If an appropriate implementation already exists, reuse or extend it.

Do not duplicate functionality merely because creating a new implementation appears faster.

---

# 10. Avoid Premature Abstraction

Do not create abstractions only because two pieces of code currently look similar.

Create shared abstractions when:

- The behavior is genuinely shared.
- The abstraction has a clear responsibility.
- The abstraction reduces meaningful duplication.
- The abstraction does not hide business-specific behavior.

Do not create generic "everything handlers" or overly abstract frameworks inside the application.

---

# 11. Technology Baseline

The application baseline is:

- Next.js
- TypeScript
- PostgreSQL
- Drizzle ORM
- shadcn/ui
- Tailwind CSS
- Session + Cookie authentication
- Role-Based Access Control
- Permission-Based Authorization

Do not introduce an alternative ORM, authentication framework, UI framework, or major architectural technology without an explicit architectural decision.

---

# 12. ORM Rule

Drizzle ORM is the database access and schema layer.

Do not introduce Prisma or another ORM into the application.

Do not mix ORM approaches.

Database access must remain consistent with the approved architecture and current Drizzle version.

Before implementing advanced Drizzle functionality, use the project's established documentation/skills and current installed version rather than relying on outdated knowledge.

---

# 13. Database Schema Rules

Database schema must represent real business concepts.

Avoid unnecessary duplication.

Every model/table should have a clear purpose.

Relationships must be explicit.

Important constraints should be enforced at the database level where appropriate.

Examples:

- Unique constraints
- Foreign keys
- Required fields
- Valid enum/status constraints
- Referential integrity

Do not rely exclusively on UI validation for data integrity.

---

# 14. Database Migration Rules

Database changes must be migration-driven.

Never manually modify production database structure without a corresponding controlled migration.

Every schema change must be:

1. Designed.
2. Implemented.
3. Migrated.
4. Verified.
5. Tested against affected workflows.

Destructive changes require special care.

Before removing or renaming data structures:

- Search the codebase.
- Search migrations.
- Search relevant queries.
- Search API/server logic.
- Search tests.
- Search reports.
- Search background jobs.

Do not delete a database field simply because it appears unused in one file.

---

# 15. Data Integrity

The database is the final source of truth for persistent state.

Never trust:

- Client-side values
- Hidden form fields
- URL parameters
- Browser state
- Cached state
- UI-only permission checks

for security or integrity decisions.

Server-side logic must validate important operations.

---

# 16. Transaction Rule

Use database transactions when multiple related operations must succeed or fail together.

Examples:

- Admission + required linked records
- Fee collection + financial transaction
- Payroll generation + financial records
- Replacement period + extra-period record
- Important multi-record updates

Do not leave partially completed business operations when atomicity is required.

---

# 17. Concurrency & Stale Data Rule

Multiple users may modify the same data simultaneously.

Never assume that browser state represents the latest database state.

Important mutable records must use appropriate concurrency protection.

Where appropriate use:

- Version checks
- Updated-at checks
- Optimistic concurrency
- Transactions
- Server-side latest-state validation
- Conflict detection

If stale data is detected, do not silently overwrite newer data.

The user must receive a clear message such as:

> "This record was updated by another user. Please refresh the latest data before making changes."

---

# 18. Cache Invalidation Rule

Caching must never cause incorrect business data.

After mutations:

- Invalidate affected caches.
- Revalidate relevant pages/data.
- Prevent stale UI from becoming authoritative.
- Ensure subsequent reads can obtain current state.

Do not add caching simply for perceived performance.

Correctness comes first.

---

# 19. Server-Side Authorization Rule

UI restrictions are not security.

Every protected mutation must perform server-side authorization.

Examples:

- Create student
- Edit student
- Delete student
- Collect fee
- Edit fee
- Create salary
- Edit salary
- Approve leave
- Mark attendance
- Edit attendance
- Enter marks
- Edit marks
- Create users
- Modify permissions

must be authorized on the server.

---

# 20. Permission-First Design

Authorization flow:

**Session → User → Roles → Permissions → Action**

Permissions should represent meaningful business actions.

Examples:

- `student.view`
- `student.create`
- `student.update`
- `student.delete`
- `fee.view`
- `fee.collect`
- `fee.adjust`
- `salary.view`
- `salary.adjust`
- `attendance.mark`
- `attendance.edit`
- `marks.enter`
- `marks.edit`
- `user.manage`
- `permission.manage`

Use the project's established permission naming convention consistently.

Do not create arbitrary permission names for individual pages unless the business action genuinely requires one.

---

# 21. Role Rule

A user may have multiple roles.

Effective permissions must be determined from:

- Assigned roles
- Direct permissions, where supported
- Explicit deny/restriction rules, if defined by the architecture

Never assume one user has exactly one role.

Example:

A user may be:

- Admin + Teacher

and therefore receive permissions from both roles.

---

# 22. UI Authorization

The UI should reflect the user's permissions.

Unauthorized actions should normally be:

- Hidden
- Disabled
- Or clearly restricted

depending on UX requirements.

However:

> **UI authorization is only a UX feature. Server authorization is the security boundary.**

Never rely on hidden buttons for security.

---

# 23. Authentication Rules

Authentication must use the approved session + cookie architecture.

Required principles:

- Secure password handling
- Secure session management
- Appropriate cookie flags
- Session expiration
- Logout invalidation
- Password reset protection
- Email verification where required
- Protection against session abuse
- Server-side session validation

Never store plaintext passwords.

Never expose sensitive authentication data to the client.

---

# 24. Route Identifier Rules

User-facing routes must use readable slugs where appropriate.

Preferred:

`/students/muhammad-zeeshan-khan`

Not:

`/students/48392`

Internal database IDs may still be used internally.

Never expose sensitive internal identifiers unnecessarily.

---

# 25. ID Exposure Rule

Do not render raw database IDs in normal user-facing UI.

Use:

- Names
- Slugs
- Human-readable codes
- Labels
- Descriptions

where appropriate.

Raw IDs may be displayed only when there is a legitimate administrative/debugging reason.

---

# 26. Validation Rule

Validation must exist at the appropriate boundaries.

At minimum:

### Client-side

For immediate user feedback.

### Server-side

For actual request validation.

### Database

For structural integrity.

Never assume client validation is sufficient.

---

# 27. Schema Validation

Use the project's approved schema-validation approach consistently.

Validation schemas should:

- Clearly define expected input.
- Reject invalid data.
- Normalize appropriate input.
- Produce understandable errors.
- Be reusable where appropriate.

Do not duplicate slightly different validation rules for the same business entity without justification.

---

# 28. Error Handling

Errors must be:

- Predictable
- Structured
- Logged appropriately
- Human-readable at the UI layer
- Safe from sensitive information leakage

Never expose:

- Stack traces
- Database credentials
- Internal secrets
- SQL internals
- Authentication secrets
- Environment variables

to normal users.

---

# 29. Business Error vs System Error

Distinguish between:

### Business errors

Examples:

- Fee already paid
- Teacher unavailable
- Schedule conflict
- Permission denied
- Stale record
- Invalid academic assignment

These should receive meaningful user-facing messages.

### System errors

Examples:

- Database unavailable
- Unexpected server exception
- Infrastructure failure

These should receive safe user-facing messages while detailed diagnostics remain in server logs.

---

# 30. User-Friendly UI Rule

The UI must be designed for non-technical institute staff.

Every important interface should answer:

- What am I looking at?
- What can I do here?
- What happens if I click this?
- What information is required?
- What went wrong?
- What should I do next?

Avoid ambiguous buttons such as:

- `Action`
- `Manage`
- `Process`
- `Execute`

when a more specific label is possible.

Prefer:

- `Collect Fee`
- `Approve Leave`
- `Assign Teacher`
- `Edit Student`
- `Generate Report`

---

# 31. Forms

Forms must:

- Group related fields logically.
- Clearly mark required fields.
- Show validation errors near the relevant field.
- Preserve valid input after validation failure.
- Prevent accidental duplicate submission.
- Show loading state during submission.
- Disable dangerous duplicate actions where appropriate.
- Provide clear success feedback.

Do not create unnecessarily long unstructured forms.

Use sections, steps, tabs, or progressive disclosure when appropriate.

---

# 32. Tables & Data Grids

Large operational datasets should use appropriate data-grid patterns.

Tables should support relevant combinations of:

- Search
- Filtering
- Sorting
- Pagination
- Column visibility
- Row actions
- Bulk actions where justified
- Responsive behavior

Do not add every possible feature to every table.

Only expose interactions relevant to the workflow.

---

# 33. Empty States

Every important data view must have a meaningful empty state.

Avoid:

> "No data."

Prefer:

> "No students have been admitted for this academic year yet."

Where appropriate include an action:

> `Add Student`

---

# 34. Loading States

Every asynchronous workflow must have an appropriate loading state.

Avoid:

- Frozen UI
- Duplicate submissions
- Unclear waiting states

Use:

- Skeletons
- Spinners
- Progress indicators
- Disabled action states

according to context.

---

# 35. Destructive Actions

Destructive actions must require appropriate confirmation.

Examples:

- Delete student
- Delete employee
- Delete financial record
- Revoke permissions
- Remove academic assignment

Confirmation should explain what will happen.

Where possible, prefer reversible/archive behavior over destructive deletion for historical records.

---

# 36. Financial Data Rule

Financial records are sensitive and must receive stronger integrity controls.

Financial operations must:

- Validate server-side.
- Be permission protected.
- Use transactions where required.
- Maintain history.
- Support auditability.
- Avoid silent mutation.
- Prevent duplicate transactions.

Never directly manipulate financial records from client-side code.

---

# 37. Automation + Manual Override

Automation must never silently destroy an authorized manual correction.

Important automated values should distinguish between:

- Calculated value
- Manual value
- Override status
- Override reason
- Changed by
- Changed at

Example:

Calculated salary:

**PKR 50,000**

Authorized manual adjustment:

**PKR 47,500**

The system must preserve the reason and history.

---

# 38. Fee Rules

Fee calculations must be deterministic and auditable.

The system must distinguish appropriately between:

- Due
- Paid
- Pending
- Outstanding
- Overdue
- Deferred
- Adjusted

Fee collection must not silently overwrite previous financial history.

Corrections should be represented as controlled adjustments rather than destructive rewriting wherever possible.

---

# 39. Payroll Rules

Payroll calculations must support:

- Fixed salary
- Unit-based salary
- Extra periods
- Manual adjustment
- Salary history
- Payroll status

For unit-based teachers:

> **Completed units × configured per-unit amount**

must form the baseline calculation.

Extra replacement periods must be represented distinctly and must not be counted twice.

---

# 40. Scheduling Rules

Scheduling must prevent invalid states.

At minimum detect:

- Teacher double booking
- Class double booking
- Section/group conflict
- Invalid subject assignment
- Floor conflict
- Building conflict
- Replacement conflict
- Teacher availability conflict

Do not rely solely on client-side conflict checking.

Final conflict validation must happen server-side.

---

# 41. Attendance Rules

Attendance is operational data and must be protected from unauthorized mutation.

Attendance changes should:

- Be permission controlled.
- Record who made the change where required.
- Respect approved leave rules.
- Prevent impossible states.
- Handle correction workflows explicitly.

Approved leave must not automatically be treated as absence.

---

# 42. Leave Rule

Student leave is requested by the parent/guardian.

Basic rule:

**Approved leave → Leave**

**Rejected/not approved + absent → Absent**

Do not mark an absent student as on leave merely because a request exists.

The request status must be considered.

---

# 43. Academic Record Rules

Academic records such as:

- Daily tests
- Monthly tests
- Examinations
- Marks
- Results
- Attendance

must maintain appropriate historical context.

A student's historical academic records must not disappear merely because the student changes:

- Class
- Section
- Group
- Academic year

---

# 44. Academic Year Rule

Completed academic years must remain historically accessible.

Historical records must not be accidentally rewritten when a new academic year begins.

When an academic year becomes closed/read-only, ordinary users must not modify historical data unless explicitly authorized through a controlled administrative workflow.

---

# 45. Notifications

Default application notification mechanism is in-app notifications.

Notifications must be:

- Targeted
- Permission-aware
- Context-aware
- Trackable
- Non-duplicative

Do not send unnecessary notifications.

---

# 46. Email Rules

Email is supplementary communication, not the primary authorization mechanism.

SMTP-based email infrastructure should remain configurable.

Required email workflows include, where applicable:

- Email verification
- Password reset
- Daily diary
- Monthly test report

Daily tests must not generate one separate email per test.

Monthly test reporting should generate the intended consolidated notification.

---

# 47. Notification Idempotency

The same business event must not unintentionally generate duplicate notifications or emails.

Before sending an automated message, determine whether the event has already been processed.

This is especially important for:

- Daily diary emails
- Monthly reports
- Leave notifications
- Background jobs
- Retry workflows

---

# 48. Background Job Rules

Long-running operations should not unnecessarily block normal request handling.

Background jobs may be used for:

- Bulk emails
- Report generation
- Monthly reports
- Biometric processing
- Large data processing
- Other long-running tasks

Jobs must support appropriate:

- Retry
- Failure handling
- Logging
- Status tracking
- Idempotency
- Duplicate prevention

---

# 49. No Mandatory Paid Scheduler

Do not make a paid managed cron/scheduler service a mandatory dependency.

Scheduled workflows must be capable of operating through application-controlled infrastructure.

If infrastructure requirements change, the architectural decision must be explicit.

---

# 50. Biometric Integration Boundary

Biometric attendance integration must remain isolated.

Device-specific logic must not leak throughout the attendance module.

The integration boundary should handle:

- Device communication
- Authentication/configuration
- Incoming transactions
- Device identifiers
- Mapping
- Validation
- Deduplication
- Processing status

The attendance domain should consume normalized attendance events rather than depending directly on device-specific implementation.

---

# 51. Audit Trail

Important mutations must be auditable.

Audit records should capture, where appropriate:

- Actor
- Action
- Entity
- Entity identifier
- Timestamp
- Previous state
- New state
- Reason
- Relevant context

Audit data must itself be protected from unauthorized modification.

---

# 52. Logging

Application logs should help diagnose failures without leaking sensitive information.

Never log:

- Passwords
- Authentication tokens
- API keys
- Session secrets
- Sensitive personal information unnecessarily

Use structured logging where appropriate.

---

# 53. Security Rule

Security must be considered during implementation, not added afterward.

Every feature must consider:

- Authentication
- Authorization
- Input validation
- Output safety
- CSRF/session concerns where applicable
- Rate limiting where appropriate
- Data exposure
- ID enumeration
- Injection risks
- Sensitive information leakage

---

# 54. Secrets

Never commit secrets.

Never hard-code:

- Passwords
- API keys
- Tokens
- Database credentials
- Session secrets
- SMTP credentials

Use environment configuration.

Provide safe documentation for required environment variables without committing their values.

---

# 55. API / Server Boundary

Client components must not directly perform privileged database operations.

Privileged operations must pass through the approved server-side architecture.

Never trust a client-provided:

- User ID
- Role
- Permission
- Student ID
- Employee ID
- Financial amount
- Authorization state

without server-side validation.

---

# 56. Server as Source of Authorization Truth

The client may request:

> "Collect fee for student X."

The server must independently determine:

- Is the user authenticated?
- Does the user have permission?
- Does student X exist?
- Is the fee valid?
- Is the amount valid?
- Is the operation still valid against current state?
- Has it already been processed?

Never trust the client's interpretation.

---

# 57. Next.js Rules

Use Next.js according to the current project architecture and installed version.

Prefer:

- Server Components where appropriate
- Server-side data access
- Server Actions where appropriate
- Route handlers where appropriate
- Streaming/loading states where useful
- Proper cache/revalidation strategies

Do not make every component a client component.

Use client components only when client-side interactivity/state is actually required.

---

# 58. Client Component Rule

Before adding `"use client"` ask:

> Does this component genuinely require client-side state, effects, browser APIs, or event-driven interactivity?

If not, keep it server-side.

Do not turn entire pages into client components simply because one child needs interactivity.

---

# 59. Data Fetching Rule

Fetch data at the appropriate architectural layer.

Avoid:

- Unnecessary browser fetching
- Duplicate requests
- Waterfall requests
- Fetching data only to immediately pass it through multiple layers
- Client-side fetching of data that can safely be loaded server-side

Optimize only after correctness is established.

---

# 60. UI Component Rules

Use shadcn/ui as the baseline component system.

Prefer existing project components before creating custom alternatives.

If a shadcn component needs customization:

- Extend it appropriately.
- Preserve accessibility.
- Preserve existing project conventions.
- Avoid unnecessary forks.

Do not install multiple competing UI component systems for the same purpose without architectural justification.

---

# 61. Tailwind Rules

Use the project's established Tailwind conventions.

Avoid excessive arbitrary values.

Prefer:

- Design tokens
- Existing spacing
- Existing typography
- Existing color variables
- Reusable patterns

Maintain consistency throughout the application.

---

# 62. Accessibility

Accessibility is part of correctness.

Interactive elements must have:

- Keyboard accessibility
- Appropriate semantic elements
- Accessible names
- Focus behavior
- Clear states

Forms must provide accessible labels and errors.

Do not use a `<div>` as a button when a real `<button>` is appropriate.

---

# 63. Responsive Design

The application is mobile-first.

Important workflows must remain usable on:

- Mobile
- Tablet
- Desktop

Do not design desktop-only administrative interfaces.

Complex data grids should have deliberate mobile behavior rather than simply overflowing the screen.

---

# 64. Performance

Performance matters, but correctness comes first.

Avoid:

- Unnecessary database queries
- N+1 queries
- Huge client bundles
- Unnecessary client components
- Repeated expensive calculations
- Unbounded list queries

Use pagination and filtering for large datasets.

---

# 65. Search & Filtering

Search/filter functionality must execute at the appropriate data layer.

Do not load thousands of database records into the browser simply to filter them client-side.

Large datasets should use server-side:

- Search
- Filtering
- Sorting
- Pagination

where appropriate.

---

# 66. Reports

Reports must use authoritative data sources.

Report calculations must be deterministic and reproducible.

A report must not calculate financial or academic values differently from the underlying business module.

Where possible, centralize business calculations and reuse them.

---

# 67. Testing Rule

A feature is not considered complete merely because:

- TypeScript passes.
- Lint passes.
- Build passes.

Testing must verify meaningful behavior.

At minimum, important modules should have appropriate:

- Unit tests
- Integration tests
- Database tests
- Authorization tests
- Workflow tests
- End-to-end tests

according to the module's risk.

---

# 68. No False-Green Testing

A test command that reports:

> `0 test files`

does not prove that the feature works.

A green test suite with no meaningful tests must not be treated as sufficient verification.

Critical business flows require actual test coverage.

---

# 69. Authorization Testing

Every sensitive module must test authorization.

Test at least:

- Authorized user succeeds.
- Unauthorized user fails.
- User with insufficient permission fails.
- User with multiple roles receives expected effective permissions.
- Direct permissions behave according to the architecture.

Do not test only the happy path.

---

# 70. Business Rule Testing

Critical calculations must have explicit tests.

Examples:

### Salary

- Fixed salary
- Unit-based salary
- Extra period
- Manual override
- Duplicate extra period prevention

### Fees

- Due
- Payment
- Outstanding
- Adjustment
- Deferment
- Duplicate payment protection

### Attendance

- Present
- Absent
- Approved leave
- Rejected leave
- Correction

### Scheduling

- Double booking
- Valid replacement
- Invalid replacement

---

# 71. Migration Testing

After schema changes:

- Run migrations.
- Verify schema.
- Run affected tests.
- Run typecheck.
- Run lint.
- Verify important workflows.
- Check migration consistency.

Never assume a migration is safe merely because it executes successfully.

---

# 72. Build Verification

Before declaring a significant implementation complete, verify appropriate project checks.

At minimum, where applicable:

- Typecheck
- Lint
- Tests
- Build
- Database/migration checks

A failed check must be investigated.

Do not simply suppress errors to obtain a green result.

---

# 73. No Error Suppression

Do not use:

- `any`
- `@ts-ignore`
- `@ts-expect-error`
- Disabled lint rules
- Empty catch blocks
- Swallowed exceptions

as shortcuts.

If suppression is genuinely required, document the reason and scope it as narrowly as possible.

---

# 74. TypeScript Rules

Use strict typing.

Avoid `any`.

Prefer:

- Explicit domain types
- Inferred types where safe
- Schema-derived types
- Discriminated unions
- Typed errors/results

Do not use type assertions to hide incorrect data flow.

---

# 75. Domain Types

Types belonging to a specific module should remain close to that module unless they are genuinely shared.

Do not create a giant global type file containing every domain entity.

Shared types should represent genuinely shared contracts.

---

# 76. Constants & Configuration

Do not scatter magic values throughout the codebase.

Centralize important:

- Status values
- Configuration values
- Permission identifiers
- System limits
- Feature configuration

where appropriate.

Do not turn every literal into a constant unnecessarily.

---

# 77. Status & State Machines

Business entities with meaningful lifecycle states must use explicit state transitions.

Examples:

- Leave request
- Fee
- Payroll
- Complaint
- Admission
- Academic year
- Notification
- Background job

Do not allow arbitrary status changes from any state.

Where appropriate define:

**Current State → Allowed Action → New State**

---

# 78. Historical Data

Historical records must be preserved where required by the business domain.

Do not destructively overwrite:

- Fee history
- Salary history
- Attendance history
- Academic history
- Examination results
- Audit history

Use correction/adjustment mechanisms where appropriate.

---

# 79. Soft Delete / Archival

Use archival or soft-delete behavior where historical preservation is important.

Do not permanently delete records simply to hide them from the UI.

Permanent deletion should be restricted to cases where:

- It is explicitly allowed.
- Historical implications are understood.
- Dependencies are handled.
- Authorization is sufficient.

---

# 80. Seed/Data Rules

Development seed data must never be treated as production data.

Do not put real personal information, passwords, financial information, or secrets into seed files.

Seed data should represent realistic structures without exposing sensitive information.

---

# 81. No Duplicate Infrastructure

Before adding infrastructure, check whether the project already has it.

Do not create:

- Second notification systems
- Second permission systems
- Second email systems
- Second database clients
- Second logging systems
- Second validation frameworks
- Second state-management systems

without explicit architectural justification.

---

# 82. Third-Party Dependency Rule

Before adding a dependency:

1. Determine whether it is actually necessary.
2. Check whether existing project dependencies already solve the problem.
3. Verify compatibility with the current stack.
4. Consider maintenance status.
5. Consider security implications.
6. Consider bundle/runtime impact.
7. Check whether it introduces a competing architectural pattern.

Do not add dependencies simply because an AI agent is familiar with them.

---

# 83. No Mandatory Paid SaaS

Do not introduce a mandatory paid SaaS dependency without explicit approval.

Examples:

- Paid authentication
- Paid email
- Paid scheduler
- Paid database
- Paid background worker
- Paid analytics

Self-hosted/open-source solutions should be preferred where practical.

---

# 84. MCP / AI Development Rule

AI development tools are assistants, not sources of truth.

MCPs, agents, skills, documentation tools, and external AI tools may assist development but must not override project requirements.

Before using an external tool's recommendation:

- Verify compatibility.
- Verify current version.
- Verify architecture impact.
- Verify security implications.

---

# 85. Skills Rule

Installed AI skills should be treated as development guidance.

Skills must not automatically override:

- PRD
- Architecture
- Requirements
- Security rules
- Database decisions

When a skill conflicts with project-specific rules, project rules win.

Skills should be periodically reviewed for:

- Obsolete guidance
- Duplicate guidance
- Incorrect versions
- Broken references
- Conflicting instructions

---

# 86. Documentation Synchronization

When architecture changes materially, related documentation must be reviewed.

Potentially affected documentation includes:

- PRD
- Architecture
- Phases
- Design
- Rules
- Security
- Performance
- Tech Stack
- Skills/inventory
- AI workflow documentation

Do not allow implementation and documentation to permanently diverge.

---

# 87. Development Phase Rule

Development must follow the approved `PHASES.md`.

Do not skip foundational phases merely because a later feature appears easier to implement.

A phase should be considered complete only after its defined:

- Implementation
- Verification
- Testing
- Documentation
- Integration
- Acceptance criteria

are satisfied.

---

# 88. Stop/Resume Development Rule

AI-assisted development must be resumable.

At any point, the project should make it possible to determine:

- What phase is active.
- What step is active.
- What has been completed.
- What remains.
- What changed.
- What verification passed.
- What failed.
- What decisions were made.
- What blockers exist.

Do not rely exclusively on conversation history.

Project state must be recoverable from project artifacts and source code.

---

# 89. Todo Management

When starting a phase, the agent should derive a concrete task list from the approved phase definition.

Tasks should be:

- Specific
- Ordered
- Verifiable
- Dependency-aware

Avoid vague tasks such as:

> "Implement students."

Prefer:

> "Create student domain schema and relationships."

> "Implement student creation validation."

> "Implement permission-protected student creation action."

> "Implement student list query with server-side pagination."

> "Add student creation workflow tests."

---

# 90. Phase Discipline

Do not silently start unrelated future-module work while a foundational phase is incomplete.

If a later module must be touched because of a dependency, keep the change minimal and document why.

Do not turn dependency work into uncontrolled scope expansion.

---

# 91. Change Impact Analysis

Before modifying shared infrastructure, determine:

- Which modules use it?
- Which routes use it?
- Which server actions use it?
- Which tests depend on it?
- Which permissions depend on it?
- Which UI components depend on it?
- Which background jobs depend on it?

Shared changes require broader verification.

---

# 92. Refactoring Rule

Refactoring must preserve behavior unless the purpose is explicitly to change behavior.

Before refactoring:

- Identify affected behavior.
- Identify dependencies.
- Make the change.
- Run relevant tests.
- Verify behavior.

Do not combine a large architectural refactor with unrelated feature work unless necessary.

---

# 93. Bug Fix Rule

A bug fix should address the underlying cause where practical.

Do not merely hide symptoms.

For important bugs:

1. Reproduce.
2. Identify root cause.
3. Fix root cause.
4. Add regression protection.
5. Verify affected workflows.

---

# 94. Security-Sensitive Changes

Changes involving:

- Authentication
- Authorization
- Permissions
- Financial data
- Personal information
- Session management
- Passwords
- Email credentials
- Database credentials

require additional review and testing.

Do not combine security-sensitive changes with unnecessary unrelated refactoring.

---

# 95. Personal Data

The system contains sensitive institutional and personal information.

Minimize unnecessary exposure of:

- Student information
- Parent information
- Employee information
- Financial information
- Academic information
- Authentication information

Users should only receive information required by their permissions and workflow.

---

# 96. Privacy by Default

Do not expose sensitive data simply because it is available in the database.

For every user-facing query ask:

> Does this user actually need this field?

Select only appropriate data.

Avoid returning entire database entities to clients when only a few fields are needed.

---

# 97. Financial Privacy

Financial information should receive strict authorization.

Examples:

- Student fee details
- Salary
- Payroll
- Expenses
- Financial reports

must not be exposed to users without the relevant permissions.

---

# 98. Student Privacy

Student data should be scoped appropriately.

A teacher should not automatically receive unrestricted access to every student's private information merely because the teacher can access academic records.

Permissions and academic context should both be considered where appropriate.

---

# 99. Parent Scope

Parents/guardians may access only their associated students.

Never trust a client-provided student ID.

The server must verify that the requested student is actually associated with the authenticated guardian.

---

# 100. Teacher Scope

Teachers should access academic data according to:

- Assigned subjects
- Assigned classes
- Assigned students
- Relevant permissions

Do not automatically grant institution-wide student access unless explicitly authorized.

---

# 101. Floor-Incharge Scope

Floor-Incharge operations should be constrained to the relevant operational scope.

The system should prevent Floor-Incharge users from arbitrarily modifying unrelated academic or financial data.

---

# 102. Accountant Scope

Accountants should receive finance-related permissions according to their assigned responsibilities.

Accountant access does not automatically imply:

- User administration
- Academic administration
- HR administration
- System configuration

---

# 103. Admin Scope

Administrative privileges must still follow the permission model.

Do not create arbitrary "admin bypasses" throughout application code.

If a role requires broad permissions, represent that through the authorization architecture.

---

# 104. Super Admin

Super Admin should be the highest administrative authority defined by the authorization architecture.

Even then, security-sensitive operations should remain explicit and auditable.

---

# 105. Reporting Consistency

Different portals must not calculate the same business metric differently.

For example:

If a student's monthly test percentage is defined one way, the:

- Student portal
- Parent portal
- Admin report

must use the same calculation logic.

Centralize shared business calculations.

---

# 106. Notification Consistency

If an event creates an in-app notification and an email notification, both must reference the same authoritative business event.

Do not independently recreate business logic inside email handlers.

---

# 107. Background Job Consistency

Background jobs must call established domain/business logic rather than duplicating it.

For example:

Monthly report generation should use the same report calculation logic used by the synchronous report view.

---

# 108. No Business Logic in Presentational Components

React UI components should not contain large business calculations or authorization decisions.

Keep:

- Business rules
- Database access
- Authorization
- Financial calculations

outside presentational components.

UI components should consume appropriate prepared data/actions.

---

# 109. No Database Logic in UI Components

Do not place direct database access inside React presentation components.

Database access belongs in the approved server-side architecture.

---

# 110. No Permission Logic Duplication

Do not independently implement authorization rules across:

- Buttons
- Pages
- Server actions
- API routes
- Services

Use centralized authorization primitives where appropriate.

Each protected operation must still enforce authorization at the server boundary.

---

# 111. Data Query Discipline

Queries must request only the data required for the operation.

Avoid:

- `SELECT *` style over-fetching where inappropriate.
- Loading large relation graphs unnecessarily.
- Fetching sensitive fields unnecessarily.

Use pagination for potentially large datasets.

---

# 112. N+1 Prevention

When displaying lists with related data, verify query behavior.

Do not accidentally perform one database query per row when a relational query or appropriate batching can solve the problem.

---

# 113. Pagination

Large collections must not be returned without bounds.

Examples:

- Students
- Teachers
- Staff
- Transactions
- Attendance
- Notifications
- Audit records
- Reports

Use appropriate pagination or controlled limits.

---

# 114. Bulk Operations

Bulk actions must be:

- Permission protected.
- Validated.
- Transactionally safe where appropriate.
- Auditable where required.
- Resistant to partial failure.

Do not allow unrestricted bulk mutations.

---

# 115. Import/Export

If data import/export functionality is introduced, it must:

- Validate imported data.
- Respect authorization.
- Prevent malicious content.
- Report row-level errors where appropriate.
- Avoid partial corruption.
- Maintain auditability for sensitive operations.

---

# 116. File Uploads

If document uploads are implemented:

- Validate file type.
- Validate file size.
- Avoid trusting client-provided MIME type alone.
- Store files securely.
- Prevent executable uploads.
- Enforce authorization.
- Prevent unauthorized file access.

---

# 117. API Security

All application endpoints must assume the client is untrusted.

Validate:

- Authentication
- Authorization
- Input
- Resource ownership/scope
- Current state

before mutation.

---

# 118. Rate Limiting

Rate limiting should be considered for:

- Login
- Password reset
- Verification
- Public endpoints
- Expensive operations
- Bulk operations

Do not introduce rate limiting blindly everywhere; apply it according to threat and operational risk.

---

# 119. Environment Configuration

Environment-specific configuration must remain configurable.

Do not hard-code:

- Database URLs
- SMTP credentials
- External service credentials
- Security secrets
- Deployment-specific URLs

Required environment variables must be documented.

---

# 120. Local Development

Local development must remain reproducible.

A new developer/agent should be able to determine:

- Required dependencies
- Required environment variables
- Database setup
- Migration process
- Test process
- Build process
- Development server process

from project documentation.

---

# 121. Package Manager

Use the project's established package manager consistently.

Do not switch between package managers without explicit reason.

Do not manually edit lockfiles to solve dependency problems unless the package manager workflow explicitly requires it.

Never delete valid lockfile structures merely because they look unusual.

---

# 122. Dependency Lockfile

The lockfile is generated state.

Do not hand-edit it as a normal development practice.

When dependency changes are required:

1. Update package configuration.
2. Use the approved package manager.
3. Regenerate the lockfile.
4. Verify frozen installation.

---

# 123. No Unnecessary Package Churn

Do not upgrade or downgrade large dependency groups merely to solve one unrelated problem.

Keep dependency changes focused.

---

# 124. Code Quality

Code should be:

- Readable
- Typed
- Modular
- Testable
- Explicit
- Maintainable

Prefer straightforward code over clever code.

Future developers must be able to understand why the code exists.

---

# 125. Comments

Comments should explain:

- Why something exists.
- Why an unusual decision was made.
- Important business constraints.

Do not write comments that merely restate obvious code.

---

# 126. TODOs

Do not leave vague TODOs such as:

> "Fix this later."

A TODO must explain:

- What remains.
- Why it remains.
- What dependency/blocker exists.
- What should happen next.

---

# 127. Dead Code

Do not leave obsolete implementations after replacing functionality.

Remove:

- Unused imports
- Dead components
- Dead routes
- Dead services
- Dead schemas
- Obsolete feature flags

after verifying they are genuinely unused.

---

# 128. Feature Flags

Feature flags should be used only when they provide meaningful operational value.

Do not introduce permanent feature flags for ordinary development changes.

---

# 129. Git Discipline

Changes should be logically grouped.

Avoid mixing:

- Feature implementation
- Unrelated refactoring
- Dependency upgrades
- Formatting changes
- Architecture changes

into one uncontrolled change.

---

# 130. Before Committing

Before a meaningful change is considered complete:

- Typecheck
- Lint
- Relevant tests
- Build where appropriate
- Migration verification where applicable
- Review changed files
- Review unintended changes

must be considered.

---

# 131. AI Agent Context Rule

An AI coding agent must inspect the relevant project context before implementing substantial changes.

At minimum, it should understand:

- Requirements
- Architecture
- Development phases
- Rules
- Design system
- Security constraints
- Performance constraints
- Technology stack
- Relevant module code
- Relevant skills/instructions

Do not blindly rely on the current conversation.

---

# 132. Agent Must Map Before Acting

For substantial work, the agent should determine:

- Current phase
- Current step
- Relevant module
- Dependencies
- Existing implementation
- Required files/code areas
- Required tests
- Required documentation updates

Then implement.

---

# 133. Agent Must Verify Its Own Work

An agent must not claim completion merely because code was generated.

It must verify the relevant behavior.

Verification should include the strongest applicable checks, such as:

- Typecheck
- Lint
- Unit tests
- Integration tests
- E2E tests
- Build
- Database checks
- Manual workflow verification

---

# 134. No Fake Completion

Never report:

> "Complete"

when:

- Tests were skipped.
- Required dependencies are missing.
- Database verification failed.
- Important workflows remain untested.
- Known errors remain.
- Required documentation is outdated.

Clearly distinguish:

- Completed
- Verified
- Partially verified
- Blocked
- Not yet tested

---

# 135. Documentation Must Reflect Reality

Never modify documentation merely to make it appear that work is complete.

Documentation must describe the actual implementation state.

If implementation differs from architecture intentionally, document the architectural decision.

---

# 136. Requirement Change Protocol

When requirements change:

1. Identify affected modules.
2. Identify affected dependencies.
3. Identify affected database models.
4. Identify affected permissions.
5. Identify affected workflows.
6. Identify affected tests.
7. Identify affected documentation.
8. Update implementation accordingly.

Do not patch only the visible UI.

---

# 137. Cross-Module Changes

A requirement that affects multiple modules must be implemented as a coordinated change.

Example:

Teacher absence may affect:

- Teacher attendance
- Scheduling
- Floor-Incharge
- Replacement periods
- Payroll
- Audit
- Notifications

Do not implement only the first visible part.

---

# 138. Business Workflow Completeness

A workflow is complete only when the entire lifecycle works.

Example:

**Teacher absent**

must not stop at:

> "Mark teacher absent."

It must support the relevant downstream workflow:

**Absent → affected periods → available replacement → assignment → extra period → payroll impact → audit**

where applicable.

---

# 139. Financial Workflow Completeness

Example:

**Student pays fee**

should consider:

- Authorization
- Current outstanding amount
- Payment validation
- Transaction creation
- Receipt
- Financial record
- Audit
- Updated balance
- UI refresh

Do not implement only:

> "Insert payment row."

---

# 140. Admission Workflow Completeness

Admission should consider:

- Student identity
- Parent/guardian
- Academic placement
- Documents
- Fee assignment
- Credentials where applicable
- Authorization
- Validation
- Audit
- Historical context

---

# 141. Module Completion Gate

A module may be declared complete only when all applicable categories have been addressed:

- Data model
- Relationships
- Business logic
- Server operations
- Authorization
- Validation
- UI
- Error handling
- Loading states
- Empty states
- Concurrency
- Audit
- Automation
- Manual overrides
- Notifications
- Reports
- Tests
- Documentation

Not every category is required for every module, but each must be consciously evaluated.

---

# 142. Production Readiness

Before production deployment, verify:

- Authentication
- Authorization
- Database migrations
- Environment variables
- Secrets
- Email configuration
- Error handling
- Logging
- Backup strategy
- Performance
- Security
- Data integrity
- Monitoring
- Critical workflows
- Recovery procedures

---

# 143. No Silent Architectural Drift

Do not gradually introduce a different architecture through small changes.

Examples of architectural drift:

- Introducing another ORM.
- Introducing another auth system.
- Introducing another notification system.
- Creating direct database access in random modules.
- Bypassing permission infrastructure.
- Creating parallel UI systems.
- Adding unmanaged background workers.

If a new architectural requirement appears, update the architecture intentionally.

---

# 144. Decision Documentation

Important architectural decisions should be documented with:

- Problem
- Options considered
- Decision
- Reason
- Consequences

Do not rely on an AI conversation as the permanent record.

---

# 145. Open Questions

If an important engineering/business decision remains unresolved:

- Record it.
- Do not silently guess.
- Identify affected functionality.
- Prevent premature irreversible implementation where practical.

---

# 146. Future Requirements

Future requirements must be integrated into the modular architecture.

Do not create temporary hacks simply because a feature is expected to change later.

Build appropriate extension points where the requirement genuinely justifies them.

---

# 147. "Simple" Feature Rule

A feature that looks simple at the UI level may have deeper implications.

Before implementing a feature ask:

- Does it affect the database?
- Does it affect permissions?
- Does it affect historical records?
- Does it affect finance?
- Does it affect notifications?
- Does it affect reports?
- Does it affect audit?
- Does it affect concurrency?
- Does it affect background jobs?

Do not underestimate cross-module effects.

---

# 148. Performance vs Correctness

When performance and correctness conflict:

> **Correctness wins.**

Do not introduce caching, optimistic updates, asynchronous processing, or denormalization if they create unreliable business state.

Performance optimizations must preserve business correctness.

---

# 149. Security vs Convenience

When security and convenience conflict:

> **Security wins**, unless an explicit product decision states otherwise.

Do not weaken authorization merely to make a workflow easier.

---

# 150. User Experience vs Technical Convenience

Technical implementation convenience must not dictate poor UX.

If a technically easy implementation causes:

- Confusing labels
- Raw IDs
- Unclear states
- Poor mobile experience
- Hidden errors
- Unclear workflows

it should be redesigned.

---

# 151. Final Engineering Principle

The system must continuously follow this hierarchy:

> **Business correctness → Data integrity → Security → Authorization → Maintainability → User experience → Performance optimization**

All are important, but shortcuts must never compromise the foundational guarantees of the system.

---

# 152. Final Rule for AI-Assisted Development

When an AI agent is asked to develop the project, the agent should not behave like a code generator.

It should behave like an engineering system.

It must:

1. Understand the current project state.
2. Read the relevant requirements.
3. Read the architecture.
4. Determine the current phase.
5. Map dependencies.
6. Inspect existing implementation.
7. Identify applicable rules.
8. Identify applicable skills/tooling.
9. Plan the work.
10. Implement incrementally.
11. Verify every meaningful change.
12. Update project state/documentation when required.
13. Leave the project in a resumable state.

The preferred command for continuing planned development is conceptually:

> **Start development according to PHASES.md.**

The agent must derive the required work from the approved development plan rather than requiring the user to manually explain every implementation task.

---

# 153. Definition of Engineering Done

**Engineering Done ≠ Code Written.**

Engineering Done means:

> The requirement has been understood, correctly modeled, implemented within the approved architecture, secured, validated, tested, integrated, documented, and verified.

Only then should a feature or module be considered complete.
