# Scholars School & College Management System

# System Architecture

**Document:** `ARCHITECTURE.md`
**Status:** Authoritative Architecture Baseline
**Version:** 2.0
**Product:** Scholars School & College Management System

---

# 1. Purpose

This document defines the technical architecture of the Scholars School & College Management System.

It translates the product requirements defined in `PRD.md` into an implementable engineering structure.

This document defines:

- Application architecture
- Domain/module boundaries
- Backend architecture
- Database architecture
- Authentication architecture
- Authorization architecture
- Request and mutation flow
- Data ownership
- Concurrency strategy
- Validation strategy
- Error handling
- Audit architecture
- Notification architecture
- Email architecture
- Background job architecture
- Biometric integration boundary
- Frontend architecture
- Reporting architecture
- Testing architecture
- Deployment boundaries
- Security boundaries
- Dependency rules

This document does **not** replace the PRD.

The PRD defines **what the system must do**.

This document defines **how the system should be structured to implement those requirements safely and maintainably**.

---

# 2. Architectural Principles

The architecture follows these principles.

## 2.1 Modular by Domain

The system must be organized around business domains rather than around arbitrary technical file types.

A domain owns:

- Its business rules
- Its schemas
- Its validation
- Its services
- Its authorization requirements
- Its persistence operations
- Its workflows
- Its domain-specific types
- Its tests

Unrelated modules must not directly manipulate another module's internal implementation.

---

# 2.2 Backend-First Engineering

Business-critical functionality must be established from the backend/domain layer outward.

Preferred implementation sequence:

**Domain Model → Database → Validation → Authorization → Service Logic → Server Boundary → UI**

UI must not become the source of business rules.

---

# 2.3 Explicit over Clever

The architecture must favor:

- Explicit dependencies
- Explicit permissions
- Explicit workflows
- Explicit validation
- Explicit transaction boundaries
- Explicit state transitions
- Explicit module ownership

over implicit magic or hidden cross-module behavior.

---

# 2.4 Server Is the Security Boundary

The frontend is never trusted for:

- Authorization
- Financial calculations
- Permission checks
- Identity
- Sensitive data access
- Mutation validation
- Audit decisions

All security-sensitive logic must be enforced server-side.

---

# 2.5 Database Integrity Is Part of the Architecture

Important business invariants must be enforced at multiple appropriate layers:

1. UI validation
2. Server validation
3. Business/domain validation
4. Database constraints where possible
5. Transaction boundaries where required

The database must not be treated as a passive data store.

---

# 2.6 Automation Must Remain Correctable

Automated calculations must support authorized manual correction.

The architecture must distinguish between:

- System-calculated value
- Manually adjusted value
- Adjustment reason
- Adjustment actor
- Adjustment timestamp

Automated recalculation must not silently destroy an existing authorized override.

---

# 2.7 Concurrency Is a First-Class Requirement

The system is a multi-user application.

Concurrent modification must therefore be treated as an architectural concern rather than a frontend problem.

Important mutable entities should support appropriate optimistic concurrency/version protection.

---

# 2.8 Integration Isolation

External infrastructure must be isolated behind internal interfaces.

Examples:

- SMTP
- ZKTeco K50
- Background workers
- Future integrations

Domain modules must not depend directly on vendor-specific implementation details.

---

# 2.9 Human-Readable Application

Technical identifiers remain internal.

The application should expose:

- Names
- Slugs
- Labels
- Human-readable statuses

to users instead of raw database IDs.

---

# 3. High-Level Architecture

The system follows a modular full-stack architecture within a Next.js application.

```text
┌──────────────────────────────────────────────┐
│                User Interfaces               │
│                                              │
│ Admin │ HR │ Accountant │ Teacher │ Student │
│ Parent │ Floor-Incharge │ Other Staff       │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│          Next.js Application Boundary        │
│                                              │
│ Routes / Server Components / Server Actions │
│ API Boundaries / Request Context             │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│          Application / Domain Layer          │
│                                              │
│ Auth │ Students │ Academics │ Fees │ Finance│
│ HR │ Payroll │ Attendance │ Scheduling       │
│ Exams │ Tests │ Diary │ Notifications        │
│ Reports │ Audit │ etc.                       │
└──────────────────────┬───────────────────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
┌─────────────────────┐ ┌─────────────────────┐
│ Persistence Layer   │ │ Infrastructure      │
│                     │ │                     │
│ Drizzle ORM        │ │ SMTP                │
│ PostgreSQL         │ │ Worker / BullMQ      │
│ Transactions       │ │ Biometric Adapter    │
│ Repositories       │ │ Logging              │
└─────────────────────┘ └─────────────────────┘
```

---

# 4. Technology Architecture

## 4.1 Application

- Next.js
- TypeScript
- React

Next.js provides:

- Routing
- Server Components
- Server Actions where appropriate
- API route handlers where appropriate
- Application rendering
- Server-side request boundaries

---

# 4.2 Database

Primary database:

**PostgreSQL**

Database access:

**Drizzle ORM**

Database migrations:

**Drizzle migration tooling**

The database is the authoritative source of persisted application state.

---

# 4.3 UI

UI stack:

- React
- shadcn/ui
- Tailwind CSS

The UI must consume server-authorized application data and must not duplicate authoritative business logic.

---

# 4.4 Validation

Application input validation should use a centralized schema-validation approach.

Zod may be used where appropriate for:

- Request validation
- Form validation
- Server action inputs
- API payloads
- Environment configuration
- External integration payloads

Validation schemas should be owned by their relevant domain.

---

# 5. Repository Structure

The architecture should favor domain-oriented organization.

Recommended structure:

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── admin/
│   ├── accountant/
│   ├── hr/
│   ├── teacher/
│   ├── student/
│   ├── parent/
│   ├── floor-incharge/
│   └── api/
│
├── modules/
│   ├── auth/
│   ├── authorization/
│   ├── users/
│   ├── institutions/
│   ├── academics/
│   ├── students/
│   ├── guardians/
│   ├── admissions/
│   ├── fees/
│   ├── finance/
│   ├── hr/
│   ├── payroll/
│   ├── teachers/
│   ├── attendance/
│   ├── floor-operations/
│   ├── scheduling/
│   ├── examinations/
│   ├── daily-tests/
│   ├── diary/
│   ├── complaints/
│   ├── notifications/
│   ├── announcements/
│   ├── email/
│   ├── reports/
│   ├── directory/
│   ├── audit/
│   └── settings/
│
├── infrastructure/
│   ├── db/
│   ├── auth/
│   ├── email/
│   ├── jobs/
│   ├── biometric/
│   ├── logging/
│   └── config/
│
├── components/
│   ├── ui/
│   └── shared/
│
├── lib/
│   ├── errors/
│   ├── security/
│   ├── dates/
│   └── utils/
│
└── types/
```

The exact physical folder structure may evolve during implementation, but domain ownership and dependency rules must remain intact.

---

# 6. Domain Module Structure

A mature domain module should generally follow:

```text
modules/<domain>/
├── domain/
│   ├── types.ts
│   ├── rules.ts
│   └── policies.ts
│
├── application/
│   ├── commands/
│   ├── queries/
│   └── services/
│
├── infrastructure/
│   ├── repositories/
│   └── mappers/
│
├── validation/
│   └── schemas.ts
│
├── permissions.ts
├── errors.ts
└── index.ts
```

Not every module must contain every directory from day one.

The structure must reflect actual complexity rather than create unnecessary ceremony.

---

# 7. Module Boundaries

The system is divided into bounded business domains.

## Core Domains

### Identity

Owns:

- Users
- Credentials
- Sessions
- Verification
- Password reset

### Authorization

Owns:

- Roles
- Permissions
- Role assignments
- Direct permissions
- Permission evaluation

### Institution

Owns:

- School
- College
- Institutional configuration
- Buildings
- Floors
- Departments
- Designations

### Academic Structure

Owns:

- Academic years
- Classes
- Sections
- Groups
- Subjects
- Time slots
- Academic relationships

### Student

Owns:

- Student profile
- Student lifecycle
- Academic placement
- Historical student relationships

### Guardian

Owns:

- Guardian profile
- Guardian/student relationships
- Guardian portal scope

### Admissions

Owns:

- Admission workflow
- Admission data
- Documents
- Initial academic assignment

### Finance

Owns:

- Financial accounts
- Transactions
- Expenses
- Income
- Ledgers
- Financial summaries

### Fees

Owns:

- Fee structures
- Student fee assignments
- Fee obligations
- Collections
- Receipts
- Adjustments
- Outstanding balances

### HR

Owns:

- Employees
- Employment records
- Departments
- Designations
- Employment types
- Staff lifecycle

### Payroll

Owns:

- Salary configurations
- Payroll periods
- Salary calculations
- Manual adjustments
- Salary records
- Extra periods

### Teachers

Owns:

- Teacher profile
- Teaching assignments
- Teacher academic scope
- Teacher-specific workflows

### Attendance

Owns:

- Student attendance
- Staff attendance
- Leave
- Attendance status
- Attendance corrections

### Floor Operations

Owns:

- Floor operational scope
- Live period state
- Teacher absence handling
- Replacement operations
- Extra-period creation

### Scheduling

Owns:

- Period schedules
- Teacher assignments
- Class assignments
- Room/floor assignments
- Conflict detection

### Examinations

Owns:

- Examination definitions
- Marks
- Results
- Result calculations

### Daily Tests

Owns:

- Daily tests
- Test marks
- Monthly aggregation

### Diary

Owns:

- Daily diary
- Diary assignments
- Diary visibility

### Complaints

Owns:

- Student complaints
- Complaint status
- Complaint workflow

### Notifications

Owns:

- In-app notifications
- Targeting
- Read/unread state
- Delivery state

### Announcements

Owns:

- Broadcast announcements
- Audience targeting

### Email

Owns:

- Email templates
- Email composition
- Email delivery requests
- SMTP abstraction

### Reports

Owns:

- Report definitions
- Read models
- Aggregation
- Export workflows where required

### Directory

Owns:

- Search
- Filtering
- Cross-domain directory views

### Audit

Owns:

- Audit events
- Change history
- Actor information

### Settings

Owns:

- System settings
- Academic settings
- Fee settings
- Salary settings
- Notification settings
- Email settings
- Security configuration

---

# 8. Dependency Direction

Dependencies should generally flow toward stable domain/application abstractions.

Preferred:

```text
UI
 ↓
Application Services
 ↓
Domain Rules
 ↓
Repositories
 ↓
Drizzle
 ↓
PostgreSQL
```

Infrastructure integrations sit behind interfaces:

```text
Domain/Application
       ↓
Internal Interface
       ↓
Infrastructure Adapter
       ↓
SMTP / Worker / Biometric / External System
```

A domain must not directly instantiate vendor-specific infrastructure where an abstraction is appropriate.

---

# 9. Cross-Domain Communication

Modules should communicate through explicit application services or domain contracts.

Avoid:

```text
Module A
   ↓
directly modifies
Module B's internal tables
```

Prefer:

```text
Module A
   ↓
Module B application service
   ↓
Module B owns mutation
```

Example:

A Floor-Incharge replacement operation should not directly modify payroll internals.

Instead:

```text
Floor Operations
      ↓
Create Replacement Period
      ↓
Payroll recognizes valid Extra Period
```

Payroll remains responsible for salary calculation.

---

# 10. Authentication Architecture

Authentication flow:

```text
User
 ↓
Login
 ↓
Credential Verification
 ↓
Session Creation
 ↓
Secure Cookie
 ↓
Request Context
 ↓
Authenticated User
```

Sessions must be securely managed server-side.

The authentication layer should expose a stable application abstraction such as:

```text
getCurrentUser()
getCurrentSession()
requireAuthenticatedUser()
```

Domain modules should not directly manipulate authentication cookies.

---

# 11. Authorization Architecture

Authorization flow:

```text
Authenticated User
        ↓
Assigned Roles
        ↓
Inherited Permissions
        +
Direct Permissions
        ↓
Effective Permissions
        ↓
Policy Evaluation
        ↓
Action Allowed / Denied
```

Authorization must happen before protected business mutations.

Example:

```text
request
  ↓
authenticate
  ↓
authorize("student:update")
  ↓
validate input
  ↓
check business rules
  ↓
perform mutation
  ↓
audit
  ↓
return result
```

The exact ordering may vary where validation is needed before authorization for safe information handling, but authorization must never be omitted.

---

# 12. Permission Model

Permissions should be action-oriented.

Examples:

```text
student:view
student:create
student:update
student:delete

fee:view
fee:create
fee:collect
fee:update
fee:adjust

salary:view
salary:calculate
salary:update
salary:override

attendance:view
attendance:mark
attendance:update

marks:view
marks:enter
marks:update

user:create
user:update
user:delete

announcement:create
announcement:publish
```

Permissions should be stable identifiers rather than UI-specific labels.

---

# 13. Teacher Identity Architecture

Teacher identity must separate application identity from employment/teaching information.

Recommended conceptual model:

```text
User
 │
 └── Teacher Profile
       │
       ├── Employment Information
       └── Teaching Assignments
```

### User

Owns:

- Authentication
- Login identity
- Account state
- Roles
- Permissions

### Teacher Profile

Owns:

- Employee number
- Qualification
- Employment status
- Teacher-specific information

### Teaching Assignment

Owns:

- Academic scope
- Class
- Section
- Group
- Subject
- Academic year
- Relevant scheduling information

This preserves a clean separation between:

**Who can log in**

and:

**What the person is employed/assigned to teach.**

---

# 14. Student and Guardian Architecture

Conceptually:

```text
Guardian
   │
   ├── Student A
   ├── Student B
   └── Student C
```

A student may also have multiple guardians where required.

The relationship must be explicit and must support:

- Relationship type
- Primary/secondary guardian where required
- Contact information
- Portal access
- Student visibility scope

Guardian authorization must be based on actual guardian-student relationships.

---

# 15. Academic Architecture

Core relationship:

```text
Institution
    ↓
Academic Year
    ↓
Class
    ↓
Section
    ↓
Group
    ↓
Subjects
```

Not every academic level requires a group.

The architecture must support optional groups.

Historical academic placement must be represented without destroying previous records.

A student's current placement and historical placement must be distinguishable.

---

# 16. Scheduling Architecture

A schedule entry represents:

```text
Building
  ↓
Floor
  ↓
Class
  ↓
Section
  ↓
Group
  ↓
Subject
  ↓
Teacher
  ↓
Time Slot
```

The scheduling domain owns conflict detection.

It must detect:

- Teacher conflict
- Class conflict
- Section conflict
- Group conflict
- Floor conflict
- Building conflict
- Invalid academic assignment

Scheduling conflicts must be checked server-side.

---

# 17. Attendance Architecture

Attendance is a domain with multiple subject types.

Conceptually:

```text
Attendance
 ├── Student Attendance
 └── Staff Attendance
       ├── Teacher
       ├── Accountant
       ├── Floor-Incharge
       ├── HR
       └── Other Staff
```

Attendance must support:

- Present
- Absent
- Late
- Leave

The exact state model must prevent contradictory states.

---

# 18. Leave Architecture

Leave should be modeled independently from raw absence.

For students:

```text
Parent
 ↓
Leave Request
 ↓
Approval Decision
 ↓
Approved
    ↓
Leave
```

If rejected/not approved:

```text
Student absent
 ↓
Absent
```

An unapproved absence must not automatically become Leave.

---

# 19. Floor-Incharge Architecture

The Floor-Incharge domain coordinates operational events but does not own every domain's underlying data.

Example:

```text
Scheduling
    ↓
Current Period
    ↓
Floor Operations
    ↓
Teacher Absence
    ↓
Replacement Assignment
    ↓
Extra Period
    ↓
Payroll
```

Floor Operations creates the operational event.

Payroll determines its financial consequence.

This prevents tight coupling between operational and payroll internals.

---

# 20. Payroll Architecture

Payroll must distinguish:

### Salary Configuration

What the employee is supposed to earn.

### Calculation

What the system calculates for the payroll period.

### Adjustment

Authorized manual change.

### Final Payroll Record

The final approved/payable result.

Conceptually:

```text
Salary Configuration
        ↓
Payroll Calculation
        ↓
Calculated Amount
        ↓
Manual Adjustment (optional)
        ↓
Final Amount
        ↓
Payroll Record
```

For unit-based teachers:

```text
Completed Units
+
Valid Extra Periods
×
Per-Unit Rate
=
Calculated Salary
```

---

# 21. Financial Architecture

Financial mutations must be transaction-safe.

Examples:

Fee collection may involve:

```text
Fee Obligation
      ↓
Collection
      ↓
Receipt
      ↓
Financial Transaction
      ↓
Audit Event
```

Where multiple records must remain consistent, they must be committed within an appropriate database transaction.

Financial logic must not depend on client-side calculations.

---

# 22. Manual Override Architecture

For automatable values:

```text
System Calculation
        ↓
Calculated Value
        ↓
Manual Override?
      /     \
    No       Yes
    ↓         ↓
Calculated   Adjusted
Value        Value
              ↓
          Audit Record
```

The final value must have a clear provenance.

The architecture must allow future users to understand:

- What the system originally calculated
- What was manually changed
- Why it was changed
- Who changed it
- When it changed

---

# 23. Concurrency Architecture

Important mutable records should include a concurrency mechanism appropriate to their use case.

Possible mechanism:

```text
version
```

or an equivalent updated-state comparison.

Example mutation:

```text
Client reads record version 8

Server currently has version 9

Client attempts update using version 8

        ↓

Reject mutation

        ↓

"Record was updated by another user."
```

The server must never trust the client merely because the form was loaded successfully.

---

# 24. Transaction Boundaries

Database transactions must be used whenever multiple related writes must succeed or fail together.

Examples:

### Admission

```text
Create Student
+
Create Guardian Relationship
+
Create Academic Placement
+
Create Initial Fee Assignment
```

### Fee Collection

```text
Create Collection
+
Create Receipt
+
Update Outstanding Balance
+
Create Financial Record
```

### Replacement Period

```text
Create Replacement Assignment
+
Create Extra Period Record
```

### Manual Salary Override

```text
Update Payroll
+
Create Adjustment Record
+
Create Audit Event
```

The exact transaction composition must be determined by domain requirements during implementation.

---

# 25. Database Architecture

PostgreSQL is the authoritative persistent data store.

Drizzle ORM is the application's database access and schema layer.

Database responsibilities include:

- Relational integrity
- Foreign keys
- Unique constraints
- Check constraints where appropriate
- Indexes
- Transactions
- Migration management
- Query execution

Business logic must not rely exclusively on application-level validation where the invariant can safely be reinforced by the database.

---

# 26. Database Schema Organization

The schema should be organized around domains.

Conceptual groups:

```text
Identity
├── users
├── sessions
├── verification
└── password_reset

Authorization
├── roles
├── permissions
├── user_roles
├── role_permissions
└── user_permissions

Institution
├── institutions
├── campuses/context
├── buildings
├── floors
├── departments
└── designations

Academic
├── academic_years
├── classes
├── sections
├── groups
├── subjects
├── time_slots
└── schedules

Students
├── students
├── student_documents
├── student_academic_history
└── guardian_relationships

Finance
├── fee_structures
├── student_fees
├── fee_collections
├── receipts
├── financial_transactions
├── expenses
└── ledger_records

HR
├── employees
├── employment_records
└── leave_records

Payroll
├── salary_configurations
├── payroll_periods
├── payroll_records
├── salary_adjustments
└── extra_periods

Attendance
├── student_attendance
├── staff_attendance
└── attendance_corrections

Academic Operations
├── examinations
├── marks
├── daily_tests
├── daily_test_marks
└── diary_entries

Communication
├── notifications
├── announcements
├── email_templates
└── email_jobs

Governance
├── audit_events
└── system_settings
```

Exact table names and normalization must be finalized during database architecture implementation.

---

# 27. Slug Architecture

User-facing entities that require readable URLs should support stable slugs.

Examples:

```text
student slug
teacher slug
class slug
subject slug
announcement slug
```

Slugs must be:

- Human-readable
- Stable
- Unambiguous within their scope
- Unrelated to internal security identifiers

Database IDs may remain the authoritative relational keys.

---

# 28. Validation Architecture

Validation occurs at multiple layers.

```text
UI
 ↓
Input Schema
 ↓
Server
 ↓
Authorization
 ↓
Domain Rules
 ↓
Database Constraints
```

Validation categories:

### Structural Validation

Is the input correctly shaped?

### Business Validation

Is the requested operation logically valid?

### Authorization Validation

Is the actor allowed to perform it?

### Relational Validation

Do referenced entities belong to the correct context?

### Concurrency Validation

Is the client operating against current state?

---

# 29. Error Architecture

Errors must be structured and categorized.

Recommended conceptual categories:

```text
ValidationError
AuthorizationError
AuthenticationError
NotFoundError
ConflictError
BusinessRuleError
DatabaseError
IntegrationError
InternalError
```

User-facing messages must remain understandable.

Technical stack traces must never be exposed to normal users.

Conflict errors should be used for situations such as:

- Stale updates
- Scheduling conflicts
- Duplicate operations
- Already processed records

---

# 30. Audit Architecture

Audit events should be generated by the server/application layer.

An audit event should support:

- Actor
- Action
- Entity type
- Entity identifier
- Timestamp
- Relevant previous state
- Relevant new state
- Request/context information where appropriate

High-value audit targets include:

- Financial changes
- Fee adjustments
- Salary overrides
- Marks
- Attendance corrections
- Permission changes
- Student record changes
- Important configuration changes

Audit implementation must avoid storing sensitive secrets.

---

# 31. Notification Architecture

Notifications should be treated as a separate application domain.

Conceptual flow:

```text
Domain Event
    ↓
Notification Decision
    ↓
Audience Resolution
    ↓
Notification Creation
    ↓
In-App Delivery
```

Examples:

```text
Leave Approved
    ↓
Student/Guardian Notification

Complaint Created
    ↓
Authorized Recipient Notification

Announcement Published
    ↓
Target Audience Notification
```

Notification targeting must be permission-aware.

---

# 32. Email Architecture

Email must use an internal abstraction.

Example:

```text
Application Domain
       ↓
Email Service
       ↓
Email Template
       ↓
SMTP Adapter
       ↓
SMTP Server
```

Domain modules must not directly implement SMTP transport.

Example workflows:

```text
Email Verification
Password Reset
Daily Diary
Monthly Test Report
```

Email delivery should be idempotent where duplicate sending could be harmful.

---

# 33. Background Job Architecture

Background jobs are isolated from request/response processing.

Conceptual architecture:

```text
Next.js Application
        ↓
Create Job
        ↓
Queue
        ↓
Worker
        ↓
Process Job
        ↓
Persist Result
        ↓
Audit / Notification
```

Potential stack:

**BullMQ + Worker + Redis**

Redis is only required if the selected worker implementation uses it.

Background processing should be introduced when justified by actual workload or long-running operations.

Do not introduce worker infrastructure merely for architectural fashion.

---

# 34. Job Idempotency

Every important background job must have a safe retry model.

Examples:

```text
Monthly Report Job
Diary Notification Job
Email Job
Biometric Import Job
```

Repeated execution must not create duplicate business effects.

A job may use:

- Idempotency keys
- Unique database constraints
- Processing state
- Job metadata

depending on the use case.

---

# 35. Biometric Integration Architecture

Biometric hardware must be isolated behind an adapter.

Preferred architecture:

```text
ZKTeco K50
      ↓
Biometric Protocol
      ↓
Biometric Adapter
      ↓
Integration Service
      ↓
Attendance Import
      ↓
Attendance Domain
```

The Attendance domain must not contain device-specific protocol code.

The exact K50 integration method must be verified against the purchased device and firmware.

Potential protocols include:

- TCP/IP
- ADMS
- Push
- HTTP/HTTPS
- USB-based transfer

The architecture must support replacing the device later without redesigning attendance.

---

# 36. Reporting Architecture

Reports should not unnecessarily execute expensive aggregation queries against transactional tables on every page request.

The architecture should support:

```text
Transactional Data
       ↓
Domain Queries
       ↓
Read Model / Aggregation
       ↓
Report
```

For small reports, direct optimized queries may be sufficient.

For large reports, background generation and cached/read-model approaches may be introduced.

Reports must respect authorization.

A user must only receive data they are permitted to access.

---

# 37. Dashboard Architecture

Dashboards should be composed from authorized read models.

Example:

```text
Admin Dashboard
 ├── Student Metrics
 ├── Attendance Metrics
 ├── Finance Metrics
 ├── Payroll Metrics
 ├── Alerts
 └── Operational Insights
```

Dashboard components should not independently bypass domain authorization.

---

# 38. Portal Architecture

The application may expose role-oriented portal areas:

```text
/admin
/accountant
/hr
/teacher
/student
/parent
/floor-incharge
```

Route structure is an organizational boundary, not the security boundary.

Permissions must still be enforced on every protected operation.

A user with multiple roles may have access to multiple portal areas according to permissions.

---

# 39. Server Actions vs API Routes

The application may use:

### Server Actions

For internal application mutations where direct server integration is appropriate.

Examples:

- Create student
- Update fee
- Submit attendance
- Enter marks

### Route Handlers / API

For:

- External integrations
- Biometric endpoints
- Webhooks
- Public machine-to-machine interfaces
- External clients
- Cases requiring explicit HTTP APIs

The choice must be based on the boundary being implemented rather than personal preference.

---

# 40. Caching and Revalidation

Caching must never create unsafe stale mutations.

After mutations, affected read models must be appropriately invalidated or revalidated.

Examples:

```text
Update Student
 ↓
Invalidate Student Detail
 ↓
Invalidate Relevant Student Lists
 ↓
Invalidate Related Dashboard Data
```

Financial and authorization-sensitive data must receive especially careful cache treatment.

Never cache sensitive information without considering:

- User scope
- Permission scope
- Data freshness
- Invalidation
- Cross-user leakage

---

# 41. Search Architecture

Search must be domain-aware.

Examples:

- Student search
- Teacher search
- Guardian search
- Staff search
- Directory search

Search results must:

- Respect permissions
- Use human-readable values
- Avoid exposing restricted information
- Support relevant filtering
- Avoid raw ID-centric UI

---

# 42. Security Architecture

Security boundaries include:

```text
Browser
 ↓
Next.js Server
 ↓
Authentication
 ↓
Authorization
 ↓
Validation
 ↓
Business Rules
 ↓
Database
```

Security-sensitive operations must never depend exclusively on browser behavior.

Required controls include:

- Secure sessions
- Secure cookies
- Password hashing
- Password reset protection
- Email verification
- Server-side authorization
- Input validation
- Sensitive-data access control
- Audit logging
- Database constraints
- Transaction safety
- Concurrency protection

Secrets must remain server-side.

---

# 43. Configuration Architecture

Environment-dependent configuration should be centralized.

Examples:

```text
DATABASE_URL
SESSION_SECRET
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
REDIS_URL
BIOMETRIC configuration
APPLICATION_URL
```

Secrets must not be committed to source control.

Configuration should be validated at application startup.

---

# 44. Observability Architecture

The system should support structured application logging.

Logs should provide enough context to investigate:

- Authentication failures
- Authorization failures
- Database failures
- Background job failures
- Integration failures
- Important application errors

Logs must not expose:

- Passwords
- Session secrets
- API tokens
- SMTP passwords
- Sensitive personal information unnecessarily

---

# 45. Deployment Architecture

The application should be deployable as:

```text
┌─────────────────────┐
│ Next.js Application │
└─────────┬───────────┘
          │
    ┌─────┴──────┐
    ▼            ▼
PostgreSQL     Worker
                  │
                 Redis
```

Optional:

```text
Next.js
  │
  ├── SMTP
  │
  └── Biometric Integration
```

The exact hosting platform is not fixed by this architecture.

The architecture should remain portable across suitable self-managed or managed infrastructure.

Mandatory dependence on a specific paid SaaS provider must be avoided.

---

# 46. Database Migration Strategy

Database schema changes must be migration-driven.

Rules:

- Never manually modify production schema without a migration.
- Migrations must be reviewed.
- Destructive migrations require explicit approval.
- Existing historical data must be considered before schema changes.
- Migration order must remain deterministic.
- Schema changes must be tested before deployment.
- Data migrations must be separated conceptually from simple schema changes when complexity warrants it.

Drizzle migration tooling is the authoritative migration mechanism for the application.

---

# 47. Testing Architecture

Testing must exist at multiple levels.

## Unit Tests

Use for:

- Business rules
- Permission evaluation
- Validation
- Salary calculations
- Fee calculations
- Result calculations
- Scheduling conflict detection
- Pure transformations

## Integration Tests

Use for:

- Database repositories
- Transactions
- Services
- Authorization + mutation boundaries
- Financial workflows
- Attendance workflows

## E2E Tests

Use for critical user journeys.

Initial high-value workflows include:

```text
Login
→ Admission
→ Student creation
→ Guardian linking
→ Fee assignment
```

and:

```text
Teacher
→ Daily test
→ Marks
→ Student/Parent visibility
```

and:

```text
Floor-Incharge
→ Teacher absence
→ Replacement
→ Extra period
→ Payroll effect
```

and:

```text
Accountant
→ Fee collection
→ Receipt
→ Financial record
```

Testing must focus on business value rather than artificially maximizing test count.

---

# 48. Test Data Architecture

Test data should be deterministic.

Test fixtures should support:

- Users
- Roles
- Permissions
- Academic structure
- Students
- Guardians
- Teachers
- Fees
- Payroll
- Attendance

Test environments must not use uncontrolled production data.

---

# 49. Module Isolation Rules

A module must not:

- Import another module's private implementation.
- Directly manipulate another module's repository without authorization.
- Duplicate another module's business rules.
- Bypass authorization.
- Bypass audit requirements.
- Depend on UI behavior for correctness.

A module may consume another module's public application/domain contract.

---

# 50. Shared Code Rules

Shared utilities should contain only genuinely shared behavior.

Avoid creating a large:

```text
utils/
```

directory containing unrelated business logic.

Business rules belong to their domain.

Examples:

Fee calculation → Fees

Salary calculation → Payroll

Schedule conflict → Scheduling

Permission evaluation → Authorization

Student eligibility → Student/Academic domain as appropriate

---

# 51. Data Ownership

Every important data entity must have a clear owner.

Examples:

| Entity                | Owner                         |
| --------------------- | ----------------------------- |
| User                  | Identity                      |
| Role                  | Authorization                 |
| Permission            | Authorization                 |
| Academic Year         | Academic                      |
| Class                 | Academic                      |
| Student               | Student                       |
| Guardian              | Guardian                      |
| Admission             | Admissions                    |
| Fee Structure         | Fees                          |
| Fee Collection        | Fees                          |
| Financial Transaction | Finance                       |
| Employee              | HR                            |
| Teacher Profile       | Teachers                      |
| Teaching Assignment   | Teachers/Academic integration |
| Salary Configuration  | Payroll                       |
| Payroll Record        | Payroll                       |
| Attendance            | Attendance                    |
| Schedule              | Scheduling                    |
| Examination           | Examinations                  |
| Daily Test            | Daily Tests                   |
| Diary                 | Diary                         |
| Notification          | Notifications                 |
| Announcement          | Announcements                 |
| Email Template        | Email                         |
| Audit Event           | Audit                         |
| System Setting        | Settings                      |

Ownership determines which module is responsible for the entity's business rules.

---

# 52. Critical Business Flow Architecture

## Admission

```text
Admin
 ↓
Admission
 ↓
Student
 ↓
Guardian Relationship
 ↓
Academic Placement
 ↓
Fee Assignment
 ↓
Portal Activation
```

## Teaching

```text
Teacher
 ↓
Teaching Assignment
 ↓
Class / Section / Group / Subject
 ↓
Daily Test / Diary / Marks
 ↓
Student Portal
 ↓
Parent Portal
```

## Teacher Replacement

```text
Schedule
 ↓
Teacher Absence
 ↓
Affected Period
 ↓
Floor-Incharge
 ↓
Available Teacher
 ↓
Replacement Assignment
 ↓
Extra Period
 ↓
Payroll
```

## Finance

```text
Fee Obligation
 ↓
Collection
 ↓
Receipt
 ↓
Financial Transaction
 ↓
Reports
```

## Monthly Test

```text
Daily Tests
 ↓
Monthly Aggregation
 ↓
Monthly Report
 ↓
Student/Parent Portal
 ↓
One Email Notification
```

---

# 53. Architecture for Historical Records

Historical records must remain associated with the context in which they were created.

Examples:

A student's:

```text
Class 9
Academic Year 2025–26
Section Alpha 1
```

must not be overwritten simply because the student is now:

```text
Class 10
Academic Year 2026–27
Section Alpha 2
```

Instead, the system must preserve historical placement.

The same principle applies to:

- Teacher assignments
- Salary
- Attendance
- Results
- Fees
- Employment records

---

# 54. Financial Audit Architecture

Financial operations require stronger traceability than ordinary CRUD operations.

For example:

```text
Original Fee
 ↓
Adjustment
 ↓
Reason
 ↓
Actor
 ↓
Timestamp
 ↓
Audit
```

and:

```text
Calculated Salary
 ↓
Manual Override
 ↓
Override Reason
 ↓
HR/Admin
 ↓
Audit
```

Deleting important financial records should generally be avoided in favor of controlled correction, reversal, adjustment, or archival mechanisms where appropriate.

---

# 55. API and Integration Boundary

External integrations must enter the system through controlled boundaries.

Examples:

```text
Biometric Device
      ↓
Biometric Endpoint
      ↓
Integration Validation
      ↓
Attendance Import
```

and:

```text
External Client
      ↓
API
      ↓
Authentication
      ↓
Authorization
      ↓
Validation
      ↓
Application Service
```

External payloads must never be trusted without validation.

---

# 56. Future Integration Strategy

Future integrations should follow:

```text
External System
      ↓
Adapter
      ↓
Internal Interface
      ↓
Domain/Application Service
```

This prevents vendor-specific logic from spreading through the application.

Replacing an external provider or device should ideally require replacing the adapter rather than redesigning the core domain.

---

# 57. Architecture Evolution Rules

The architecture is allowed to evolve as implementation reveals genuine requirements.

However:

- Do not introduce abstraction without a demonstrated need.
- Do not bypass domain boundaries for convenience.
- Do not create infrastructure prematurely.
- Do not introduce paid services without explicit approval.
- Do not silently change business rules.
- Do not introduce a new ORM alongside Drizzle for convenience.
- Do not duplicate database access patterns.
- Do not create parallel authentication systems.
- Do not create parallel authorization systems.

Any significant architectural change must be documented.

---

# 58. Architecture Decision Records

Important architectural decisions must be documented as ADRs.

Examples:

- Authentication strategy
- Teacher/User relationship
- Database tenancy/context strategy
- Salary calculation model
- Attendance state model
- Scheduling conflict strategy
- Worker architecture
- Biometric integration protocol
- Reporting/read-model strategy
- Concurrency strategy

ADR format should include:

```text
Context
Decision
Alternatives
Consequences
Status
```

---

# 59. Architecture Verification

Before considering an architectural area complete, verify:

### Boundaries

- Domain ownership is clear.
- Cross-module dependencies are intentional.
- No private implementation is being imported externally.

### Security

- Authentication is server-controlled.
- Authorization is server-enforced.
- Sensitive data is permission-controlled.

### Data

- Relationships are valid.
- Database constraints exist where appropriate.
- Transactions protect multi-write operations.

### Concurrency

- Important mutable records have appropriate stale-state protection.

### Financial Integrity

- Calculations are server-side.
- Manual overrides are traceable.
- Financial mutations are transactional.

### Integrations

- External systems are isolated behind adapters.

### Background Jobs

- Jobs are idempotent.
- Retries are safe.
- Duplicate business effects are prevented.

### UI

- Raw IDs are not exposed.
- Business logic is not trusted to the client.
- Permissions affect both UI visibility and server enforcement.

---

# 60. Final Architecture Principle

The Scholars School & College Management System must be implemented as a:

> **Modular, domain-oriented, server-authoritative, PostgreSQL-backed, Drizzle-based, permission-first, concurrency-aware and integration-isolated application.**

The architecture must support the product's core principle:

> **Module → Data Model → Business Rules → Permissions → Backend → UI → Validation → Automation → Manual Override → Audit → Testing → Verification**

The system must remain understandable to both human engineers and AI coding agents.

The architecture should make it possible for an engineering agent to determine:

- Which module owns a feature.
- Which data belongs to that module.
- Which permissions are required.
- Which business rules apply.
- Which services should be called.
- Which database operations are required.
- Which transaction boundary is appropriate.
- Which audit event must be generated.
- Which tests must verify the behavior.
- Which external integrations are involved.
- Which module dependencies must remain protected.

The architecture is successful when adding a new requirement does not require blindly modifying unrelated parts of the system.

---
