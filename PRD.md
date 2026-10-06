# Product Requirements Document

# Scholars School & College Management System

**Version:** 2.0
**Status:** Authoritative Product Requirements Baseline
**Product:** Scholars School & College Management System
**Scope:** Nursery through Class 12
**Primary Goal:** Digitize and centralize the institute's academic, administrative, financial, HR, attendance, communication, and operational workflows.

---

# 1. Product Overview

The Scholars School & College Management System is a centralized management platform for a physical educational institute operating across School and College environments.

The system will cover the complete academic range from:

- Nursery
- Classes 1–8
- Class 9
- Class 10
- Class 11
- Class 12

The system is intended to replace fragmented manual processes with a centralized, reliable, permission-controlled, financially aware, academically structured, and highly user-friendly platform.

The product will support multiple user types, multiple operational modules, historical academic records, automated calculations, controlled manual overrides, notifications, reporting, attendance workflows, payroll, and future biometric integration.

---

# 2. Product Vision

The system should transform the institute's manual operations into a single reliable digital platform where:

- Administrative staff can manage institute operations without technical knowledge.
- Teachers can manage their academic responsibilities.
- Accountants can manage financial operations.
- HR can manage employees and payroll.
- Floor-Incharges can manage floor-level operations and attendance.
- Students can access their academic information.
- Parents/Guardians can monitor their associated students.
- Administrators can understand the overall operational and financial condition of the institute.
- Automated processes reduce repetitive work without removing authorized human control.

The system must prioritize **clarity, correctness, consistency, data integrity, and usability** over unnecessary complexity or decorative functionality.

---

# 3. Development Strategy

The product will be developed module-by-module.

The complete system will not be built as one large undifferentiated implementation.

The development approach is:

**Module → Data → Business Rules → Permissions → Backend → UI → Validation → Automation → Manual Override → Audit → Testing → Verification → Complete**

A module is not considered complete merely because its UI exists.

A module is complete only when all of its required functional and technical responsibilities have been implemented and verified.

---

# 4. Module Completion Standard

Every module must be evaluated against the following areas:

### Data

Required data structures and relationships must correctly represent the business domain.

### Backend

Business logic and workflows must be implemented correctly.

### Authorization

Every protected action must enforce appropriate server-side permissions.

### UI

The interface must be usable, responsive, consistent, and understandable.

### Validation

Invalid and incomplete input must be rejected appropriately.

### Concurrency

Concurrent users must not silently overwrite newer data.

### Error Handling

Failures must produce clear, human-readable feedback.

### Automation

Required automated calculations and workflows must work correctly.

### Manual Control

Required authorized manual corrections and overrides must be available.

### Audit

Important changes must be traceable.

### Reporting

Required information must be available through relevant reports or views.

### Notifications

Required notification workflows must operate correctly.

### Testing

Critical workflows must be tested and verified.

---

# 5. Priority System

## P0 — Critical / Core Operations

1. Core Platform & Authentication
2. Authorization / Roles / Permissions
3. Admin Portal
4. Institute & Academic Master Structure
5. Admissions & Student Records
6. Student Fee Management
7. Finance & Accounting
8. HR & Payroll
9. Accountant Portal
10. Student Portal
11. Parent/Guardian Portal

## P1 — High Priority Operational Modules

12. Teacher Management & Teacher Portal
13. Student Attendance
14. Staff Attendance & Leave
15. Floor-Incharge Operations
16. Class / Section / Group / Subject / Period Scheduling
17. Examinations / Marks / Results

## P2 — Important Supporting Modules

18. Daily Tests
19. Daily Diary
20. Student Complaints
21. Notifications & Email
22. Reports & Insights
23. Directory
24. Audit Trail
25. Advanced System Settings

## P3 — Specialized / Integration Modules

26. Biometric Attendance Integration
27. Background Jobs / Worker Infrastructure
28. Advanced Operational Analytics
29. Additional Future Integrations

---

# 6. Target User Roles

The initial system will support the following actors:

- Super Admin
- Admin
- Accountant
- Floor-Incharge
- Teacher
- HR
- Student
- Guardian / Parent
- Other Staff

A single user may have multiple roles.

Example:

**Admin + Teacher**

Permissions must be calculated from the user's assigned roles while also supporting direct user-level permissions where required.

---

# 7. Global Product Requirements

## 7.1 User-Friendly Interface

The entire system must be designed for non-technical administrative and academic staff.

The interface must be:

- Simple
- Clear
- Consistent
- Predictable
- Responsive
- Accessible
- Easy to understand

Users should never have to guess the purpose of an action.

### Requirements

- Buttons must have clear labels.
- Forms must group logically related fields.
- Tables must remain readable.
- Empty states must explain what is missing and what the user can do.
- Error messages must be human-readable.
- Success messages must clearly describe the completed action.
- Destructive actions must require appropriate confirmation.
- Similar concepts must use consistent terminology throughout the application.

---

# 8. Technology Baseline

The target application technology baseline is:

- Next.js
- TypeScript
- PostgreSQL
- Drizzle ORM
- shadcn/ui
- Tailwind CSS
- Session + Cookie-based authentication
- Role-Based Access Control
- Permission-Based Authorization

The application must use a modular architecture.

Module-specific functionality should remain isolated where practical and should not unnecessarily mix unrelated domain logic.

---

# 9. No Mandatory Paid SaaS Dependency

The system must not depend on mandatory paid SaaS infrastructure for core functionality.

The architecture should avoid mandatory dependencies such as:

- Paid managed cron services
- Paid transactional email providers
- Clerk-like paid authentication services
- Other mandatory paid third-party infrastructure

Where practical, infrastructure should be self-hosted or controlled by the institute.

### Email

Email must support configurable SMTP infrastructure.

### Authentication

Authentication must use the application's own session/cookie-based architecture.

### Scheduling

Scheduled/background operations must not require a mandatory paid managed cron provider.

---

# 10. Automation and Manual Override

Automated operations must be combined with authorized manual control.

The general principle is:

**Automatic Calculation + Authorized Manual Override + History/Audit**

This applies particularly to:

- Student fees
- Teacher salaries
- Staff salaries
- Attendance
- Marks
- Financial records
- Other automated operational records

A manual override must not be silently overwritten by a subsequent automatic recalculation.

Where appropriate, records should preserve:

- Calculated value
- Final/manual value
- Override reason
- Changed by
- Changed at

---

# 11. Multi-User Data Consistency

The system will be used simultaneously by multiple administrators and staff members.

The system must prevent stale UI data from silently overwriting newer database state.

Required behavior includes:

- Server-side latest-state validation
- Appropriate cache invalidation
- Revalidation after mutations
- Stale-data detection
- Concurrent update protection
- Transactions where required
- Optimistic concurrency/version checking where appropriate

Example:

If Admin A updates a student while Admin B has an older version of the student record open, Admin B must not be allowed to silently overwrite Admin A's changes.

The system should instead display a clear message such as:

> This record was updated by another user. Please refresh the latest data before making changes.

---

# 12. User-Facing Routes and Identifiers

Database identifiers must not be exposed as user-facing route values.

Readable slugs should be used where appropriate.

Example:

`/students/muhammad-zeeshan-khan`

rather than:

`/students/48392`

Internal database IDs may still be used internally for relationships and database operations.

---

# 13. Human-Readable Display Values

User-facing interfaces must display meaningful names rather than raw database identifiers.

Examples:

**Teacher: Muhammad Ahmed**

instead of:

**Teacher: 28493**

The same rule applies to:

- Students
- Teachers
- Classes
- Sections
- Groups
- Subjects
- Departments
- Designations
- Employees
- Roles
- Other entities

The implementation must be verified to ensure raw IDs are not accidentally rendered in user-facing interfaces.

---

# 14. Permission-First Security Model

The conceptual authorization flow is:

**Login → Session/Cookie → User → Roles → Permissions → Action**

Every meaningful protected action must require authorization.

Examples include:

- View Student
- Create Student
- Edit Student
- Delete Student
- View Fee
- Collect Fee
- Edit Fee
- Create Salary
- Edit Salary
- Approve Leave
- Mark Attendance
- Edit Attendance
- Enter Marks
- Edit Marks
- Create User
- Delete User
- Create Announcement

### Important Security Rule

Hiding a button in the UI is not security.

Every protected mutation and sensitive data operation must also be authorized on the server.

---

# 15. Module Requirements

# MODULE 1 — Core Platform & Authentication

**Priority:** P0

This module establishes the core platform and identity system.

## Requirements

- Application shell
- Database foundation
- User management foundation
- Session management
- Cookie-based authentication
- Login
- Logout
- Email verification
- Forgot password
- Password reset
- Protected routes
- Protected actions
- Permission-aware UI

Authentication must be application-controlled and must not require a paid authentication SaaS.

---

# MODULE 2 — Authorization, Roles & Permissions

**Priority:** P0

The authorization system must support:

- Multiple roles per user
- Role-based permissions
- Direct user permissions
- Server-side authorization
- Permission-aware UI
- Protected routes
- Protected mutations
- Protected sensitive data

Example:

A user may have:

**Admin + Teacher**

with the combined permissions of both roles plus any explicitly assigned direct permissions.

---

# MODULE 3 — Admin Portal & System Control

**Priority:** P0

The Admin Portal will provide centralized system management.

## Admin Dashboard

The dashboard should provide:

- System overview
- Student overview
- Finance overview
- Attendance overview
- Operational insights
- Relevant alerts
- Growth insights
- Important updates

## Teacher Attendance Overview

The current month's overview should include:

- Absent teachers
- Teachers on leave
- Late teachers

For each teacher:

- Teacher name
- Total absent
- Total leave
- Total late

Approved and regular exceptions should be represented appropriately.

Example:

**Miss Warda — Thursday regular off**

---

# MODULE 4 — Institute & Academic Master Structure

**Priority:** P0

This module provides the foundation for academic operations.

## Institutional Context

The system will support:

- Scholar School
- Scholar College

Both may share core information while maintaining separate operational contexts where required.

## Academic Levels

- Nursery
- Class 1
- Class 2
- Class 3
- Class 4
- Class 5
- Class 6
- Class 7
- Class 8
- Class 9
- Class 10
- Class 11
- Class 12

## Academic Entities

The system must manage:

- Academic Year
- Class
- Section
- Group
- Subject
- Building
- Floor
- Period / Time Slot
- Department
- Designation
- Employment Type

## Sections

Sections must support manually chosen names.

Examples:

- Alpha 1
- Alpha 2
- Usama
- Haris

## Groups

Groups are optional.

Examples:

- Pre-Medical
- Pre-Engineering
- ICS

## Academic History

Past academic years must be preserved.

Completed academic years must become read-only historical records where appropriate.

---

# MODULE 5 — Admissions & Complete Student Records

**Priority:** P0

The admission system must maintain a complete student record.

## Admission Information

Required information may include:

- Personal information
- Academic information
- Previous school
- Age
- Gender
- Mother tongue
- Phone
- Email
- Address
- Class
- Section
- Group
- Admission date
- Documents
- Parent/Guardian
- Fee information
- Account credentials

## Documents

Examples:

- B-Form
- Birth Certificate
- Other required documents

## Guardian Relationships

A guardian may be associated with multiple students.

A student may have multiple associated guardians where required.

## Historical Student Record

The system must preserve relevant historical information including:

- Previous classes
- Previous academic years
- Subjects
- Attendance
- Tests
- Examinations
- Results
- Fees
- Complaints
- Other academic records

---

# MODULE 6 — Student Fee Management

**Priority:** P0

The fee system must manage student financial obligations and collections.

## Requirements

- Fee structures
- Student fee assignment
- Monthly fees
- Paid fees
- Pending fees
- Outstanding fees
- Overdue fees
- Deferred fees
- Fee collection
- Fee history
- Receipts
- Adjustments
- Discounts where applicable
- Manual correction
- Financial status

## Automation

The system should automatically:

- Calculate due amounts
- Identify outstanding balances
- Identify delayed payments
- Generate relevant totals

## Manual Control

Authorized users may:

- Edit fees
- Apply adjustments
- Apply deferments
- Correct records

Important financial changes must be auditable.

---

# MODULE 7 — Finance & Accounting

**Priority:** P0

The finance system will manage the institute's broader financial operations rather than only student fees.

## Financial Areas

- Student fees
- Fee collections
- Payroll transactions
- Salaries
- School expenses
- Operational expenses
- Income
- Expenses
- Outstanding amounts
- Cash-flow-related records
- Ledgers
- Financial summaries

## Financial Insights

Administrators should be able to understand:

- Total income
- Total expenses
- Net position
- Loss
- Growth
- Outstanding fees
- Salary expenses
- Other expenses
- Relevant financial trends

The system should provide understandable financial information rather than merely storing transactions.

---

# MODULE 8 — HR & Payroll

**Priority:** P0

HR will manage employees and employment-related information.

## Employee Types

- Teachers
- Accountants
- Floor-Incharges
- HR
- Other Staff

## Employee Records

The system should maintain:

- Personal details
- Employment information
- Designation
- Department
- Employment type
- Joining date
- Salary configuration
- Attendance
- Leave
- Salary history

---

# MODULE 9 — Teacher Salary & Staff Salary

**Priority:** P0

The payroll system must support both fixed and unit-based salary structures.

## Fixed Salary

A fixed monthly salary amount.

## Unit-Based Salary

Salary based on completed teaching periods/units.

Example:

**80 completed units × PKR 500 = PKR 40,000**

## Extra Period

A replacement period taken because another teacher is absent must be recorded as an:

**Extra Period**

For unit-based teachers, extra periods may contribute to additional salary.

## Salary Controls

Authorized HR/Admin users must be able to:

- Configure salary
- Correct salary
- Apply manual adjustments
- Correct extra-period records
- Review salary records
- Manage payroll status

Manual modifications must be auditable.

---

# MODULE 10 — Accountant Portal

**Priority:** P0

The Accountant Portal will provide finance-focused operations.

## Responsibilities

- Fee collection
- Billing
- Financial transactions
- Expenses
- Ledgers
- Receipts
- Relevant financial operations
- Financial records

Accountant permissions must remain separate from Admin permissions.

Accountants should also receive:

- Announcements
- In-app notifications

Staff attendance must also be applicable to accountants.

---

# MODULE 11 — Student Portal

**Priority:** P0

The Student Portal will provide students with access to their academic information.

Students should be able to view:

- Personal profile
- Current class
- Section
- Group
- Subjects
- Attendance
- Daily tests
- Monthly test reports
- Examinations
- Results
- Daily diary
- Notifications
- Relevant academic records

Students must not modify restricted personal information unless explicitly authorized.

---

# MODULE 12 — Parent / Guardian Portal

**Priority:** P0

The Parent/Guardian Portal will allow parents to monitor associated students.

Parents should be able to view:

- Associated students
- Attendance
- Daily tests
- Monthly test reports
- Daily diary
- Examination results
- Relevant academic information
- Fee information
- Leave requests
- Notifications

Parents/Guardians are responsible for submitting student leave requests.

---

# MODULE 13 — Student Leave Requests

**Priority:** P1

Students will not directly submit leave requests.

The workflow is:

**Parent/Guardian submits leave request → Institute reviews → Approved or rejected**

## Rules

**Approved leave → Leave**

**Rejected/not approved + student absent → Absent**

Leave must not be granted simply because the student was absent.

Requests must maintain:

- Student
- Leave dates
- Reason
- Additional information
- Status
- Relevant approval information

---

# MODULE 14 — Teacher Management & Teacher Portal

**Priority:** P1

Teachers are first-class teaching/employment entities associated with their application identity.

## Teacher Management

Admin users should be able to manage:

- Teacher list
- Search
- Filters
- Teacher profiles
- Editing
- Salary records
- Assigned classes
- Attendance
- Performance
- Relevant actions

## Teacher Portal

Teachers should be able to:

- View assigned classes
- View assigned subjects
- Create daily tests
- Assign daily diary
- Enter test marks
- Submit examination papers
- View relevant academic data
- Record permitted attendance operations
- View notifications and announcements

---

# MODULE 15 — Student Attendance

**Priority:** P1

Student attendance will primarily be managed by Floor-Incharges.

Floor-Incharges must have access to attendance for classes within their operational floor scope.

Attendance must support:

- Date-wise records
- Class-wise records
- Section-wise records
- Student-wise records

Daily attendance should be finalized/submitted through the appropriate workflow.

Leave status must follow the leave approval rules.

---

# MODULE 16 — Staff Attendance & Leave

**Priority:** P1

Staff attendance must cover:

- Teachers
- Accountants
- Floor-Incharges
- HR
- Other Staff

The system must support attendance states such as:

- Present
- Absent
- Late
- Leave

Biometric attendance transactions may later feed into this module.

---

# MODULE 17 — Floor-Incharge Operations

**Priority:** P1

The Floor-Incharge Portal will serve as the operational control center for floor-level academic activities.

## Live Floor View

The interface should display:

- Current period
- Class
- Section
- Group
- Subject
- Teacher

The information should update as the active period changes.

## Floor Operations

Floor-Incharges should be able to manage:

- Student queries
- Teacher queries
- Attendance
- Teacher period management
- Free periods
- Replacement teachers
- Extra periods
- Floor operational issues

---

# MODULE 18 — Class, Section, Group, Subject & Period Scheduling

**Priority:** P1

The scheduling system must maintain the complete academic scheduling context:

**Building → Floor → Class → Section → Group → Subject → Teacher → Time Slot**

## Conflict Prevention

The system must prevent:

- Teacher double-booking
- Class double-booking
- Section/group conflicts
- Floor conflicts
- Building conflicts
- Invalid teacher assignments
- Replacement conflicts

---

# MODULE 19 — Teacher Absence & Replacement Periods

**Priority:** P1

When a teacher is absent, affected periods must be identified.

The Floor-Incharge should see:

- Absent teacher
- Affected class
- Affected subject
- Free periods
- Available teachers

The Floor-Incharge may:

- Assign an available teacher
- Assign an appropriate alternative academic activity/test
- Perform another valid operational action

The replacement action must be recorded.

A replacement teaching period must be recorded as an:

**Extra Period**

For applicable unit-based salary structures, the extra period must be included in salary calculation.

Duplicate counting must be prevented.

---

# MODULE 20 — Examinations, Marks & Results

**Priority:** P1

Examinations are physically conducted by the institute.

The software manages their records and academic results.

## Examination Types

- Monthly Tests
- Grand Tests
- Midterm
- Annual / Final

## Marks

Marks must be stored:

- Student-wise
- Subject-wise
- Examination-wise

## Results

The system should calculate:

- Obtained marks
- Total marks
- Percentage
- Grade where applicable
- Result status

## Views

Results should support:

- Student-wise views
- Class-wise views
- Section-wise views

---

# MODULE 21 — Daily Test Management

**Priority:** P2

Teachers must be able to enter daily test marks for their assigned subjects.

Example:

- Mathematics teacher → Mathematics tests
- English teacher → English tests
- Physics teacher → Physics tests

Teachers must only access relevant subject/student contexts according to their permissions and assignments.

Students should see aggregated records across their subjects.

Parents should also be able to access the relevant records.

## Notification Rule

A separate email must not be sent for every daily test.

Daily tests remain continuously accessible through the relevant portals.

---

# MODULE 22 — Monthly Test Reports

**Priority:** P2

Daily tests for a month should be aggregated into a monthly report.

The report should cover relevant subjects such as:

- Mathematics
- English
- Physics
- Chemistry
- Computer Science
- Other assigned subjects

Once the monthly report is finalized/generated, it must become available to:

- Student
- Parent/Guardian

## Email

The parent/guardian should receive one email after the monthly report is generated.

The email should include:

- Short summary
- Student identification
- Quick link to view the report

Daily tests must not generate separate emails.

---

# MODULE 23 — Daily Diary

**Priority:** P2

Teachers should be able to assign diary content to their relevant students.

Diary records must support:

- Subject
- Date
- Relevant students

Once assigned, diary information must be available through:

- Student Portal
- Parent/Guardian Portal

---

# MODULE 24 — Daily Diary Notifications

**Priority:** P2

Parents/Guardians should receive a daily email notification informing them that the day's diary is available.

The email should:

- Clearly indicate that today's diary should be checked.
- Include a quick link to the diary.
- Be personalized according to the associated student/students.

Relevant in-app notifications may also be used.

---

# MODULE 25 — Student Complaints

**Priority:** P2

Teachers may create student complaints/reports when there is a valid reason.

A complaint should include:

- Student
- Teacher
- Date
- Reason
- Description
- Status
- Relevant action

Complaint-related notifications must follow permissions and workflow rules.

---

# MODULE 26 — Notifications & Communication

**Priority:** P2

The primary notification system will be in-app.

Notifications must support targeting such as:

- Individual user
- Role
- Department
- Class
- Section
- Parent
- Teacher
- Other relevant audiences

## Notification Examples

- Leave approval/rejection
- Complaint
- Daily diary
- Monthly test report
- Important announcement
- Administrative update

---

# MODULE 27 — Announcements

**Priority:** P2

Admins must be able to create announcements.

Announcements may target:

- All users
- Specific roles
- Specific departments
- Other relevant audiences

Announcements should appear through the appropriate notification/announcement interface.

---

# MODULE 28 — Email Infrastructure

**Priority:** P2

Email infrastructure must be SMTP-based and configurable.

Mandatory paid transactional email SaaS is not required.

## Initial Email Workflows

- Email verification
- Forgot password
- Password reset
- Daily diary notification
- Monthly test report
- Other explicitly approved workflows

Email templates should be centrally manageable.

---

# MODULE 29 — Reports & Insights

**Priority:** P2

The system must provide comprehensive reports.

## Academic Reports

- Student performance
- Daily tests
- Monthly tests
- Annual examinations
- Class results
- Section results

## Attendance Reports

- Student attendance
- Teacher attendance
- Staff attendance
- Leave
- Late
- Absent

## Finance Reports

- Fees
- Fee collection
- Expenses
- Salaries
- Profit/loss
- Growth
- Outstanding amounts

## HR Reports

- Salary reports
- Attendance
- Employee records
- Performance

Reports must present information in a manner that supports decision-making rather than merely exposing raw records.

---

# MODULE 30 — Directory

**Priority:** P2

A searchable and filterable directory must provide access to relevant records for:

- Students
- Parents/Guardians
- Teachers
- Staff

Sensitive information must remain permission-controlled.

The directory must display human-readable information rather than internal database identifiers.

---

# MODULE 31 — Audit Trail

**Priority:** P2

Important system operations must be auditable.

Audit information may include:

- User
- Action
- Entity
- Timestamp
- Relevant change
- Previous value
- New value

Detailed auditing is particularly important for:

- Fees
- Salaries
- Marks
- Attendance
- User permissions
- Student records
- Financial records
- Manual overrides

---

# MODULE 32 — System Settings

**Priority:** P2

The system must provide centralized configuration for:

- Institute settings
- Academic settings
- Fee settings
- Salary settings
- Attendance rules
- Notification settings
- Email settings
- Security settings
- General application settings
- Permission-related configuration

---

# MODULE 33 — Biometric Attendance Integration

**Priority:** P3\*\*

Target device:

**ZKTeco K50**

The integration should support the device capabilities required by the selected unit/firmware.

Potential requirements include:

- Fingerprint
- TCP/IP
- ADMS / Push Protocol
- Cloud Server / ADMS configuration
- HTTP/HTTPS
- Custom web server integration
- Transaction storage
- USB
- Built-in battery

## Important Procurement Requirement

Before purchasing the device, the exact unit and firmware must be verified with the seller to confirm required ADMS/Push capabilities.

The biometric integration must remain isolated behind a dedicated integration boundary so that device-specific functionality does not tightly couple the rest of the attendance system to the hardware.

---

# MODULE 34 — Background Jobs & Worker Infrastructure

**Priority:** P3 / As Required

Background processing may be introduced for large or long-running operations.

Preferred direction:

**BullMQ + Worker**

Potential use cases:

- Large report generation
- Monthly report generation
- Bulk email
- Daily notification dispatch
- Biometric transaction processing
- Large data processing
- Other long-running tasks

Paid managed cron services must not be mandatory.

Application-controlled or self-hosted scheduling/worker infrastructure should be used where practical.

## Job Requirements

Jobs must support, where applicable:

- Idempotency
- Retry strategy
- Failure handling
- Job status
- Logging
- Duplicate prevention
- Dead-letter/failure handling

Repeated execution must not create duplicate:

- Emails
- Reports
- Financial transactions
- Attendance transactions
- Other important records

Long-running operations should not unnecessarily block user-facing requests.

---

# 16. Core Business Flows

## 16.1 Student Admission Flow

**Admin**

→ Admission

→ Student Created

→ Parent/Guardian Linked

→ Class/Section/Group Assigned

→ Student Fee Assigned

→ Student Portal Activated

→ Parent Portal Activated

---

## 16.2 Teacher Academic Flow

**Teacher**

→ Assigned Class

→ Assigned Subject

→ Daily Test

→ Diary

→ Marks

→ Academic Operations

---

## 16.3 Finance Flow

**Finance / Accountant**

→ Fee Collection

→ Expenses

→ Payroll

→ Financial Records

→ Financial Overview

---

## 16.4 HR Flow

**HR**

→ Employee

→ Employment Configuration

→ Salary Configuration

→ Payroll

→ Salary Records

---

## 16.5 Floor-Incharge Flow

**Floor-Incharge**

→ Current Period

→ Attendance

→ Absent Teacher

→ Affected Period

→ Free Period

→ Replacement Teacher

→ Extra Period

→ Extra Salary

---

# 17. Financial Automation Rules

## Student Fees

The system should automatically:

- Calculate monthly fee obligations.
- Identify due amounts.
- Calculate outstanding balances.
- Identify overdue amounts.

Authorized users may perform:

- Discounts
- Adjustments
- Deferments
- Corrections

---

## Teacher Salary

The system should automatically:

- Calculate fixed salary.
- Calculate unit-based salary.
- Include valid extra periods.

Authorized HR/Admin users may:

- Correct salary
- Override salary
- Correct extra-period records
- Adjust payroll

---

## Staff Salary

The system should calculate salary according to the configured salary structure.

Authorized HR/Admin users may perform controlled manual adjustments.

All important financial modifications must be auditable.

---

# 18. Data Integrity Requirements

The system must proactively prevent invalid operational states.

## Teacher Double Booking

A teacher cannot be assigned to two conflicting periods.

## Class Double Booking

The same class/section/group cannot be assigned conflicting simultaneous periods.

## Physical Conflict

The system must prevent impossible simultaneous physical assignments involving buildings and floors.

## Replacement Conflict

A teacher already occupied during a period cannot be assigned as an available replacement.

## Duplicate Extra Period

The same replacement period must not be counted multiple times for salary.

## Invalid Academic Assignment

Students, teachers, subjects, classes, groups, and sections must respect their valid academic relationships.

## Unauthorized Action

Unauthorized mutations must be rejected server-side.

## Stale Update

Old UI state must not overwrite newer data.

---

# 19. Manual Override Safety

Automated values and manual values must be distinguishable.

Example:

System-calculated salary:

**PKR 50,000**

HR-adjusted salary:

**PKR 47,500**

The system must retain the appropriate information needed to explain the adjustment.

Where applicable:

- Calculated value
- Adjusted value
- Override reason
- Changed by
- Changed at

must be preserved.

Future automatic recalculation must not silently destroy the authorized override.

---

# 20. Notification Strategy

Notifications are divided into two primary channels.

## In-App

The default notification channel.

Used for:

- Announcements
- Leave status
- Complaints
- Administrative updates
- Daily academic updates
- Other operational events

## Email

Used selectively for important workflows.

Initial examples:

- Email verification
- Password recovery
- Daily diary
- Monthly test report

The system must avoid unnecessary email spam.

In particular:

**Daily test → no individual parent email**

**Monthly report finalized → one parent email**

---

# 21. Portal Responsibilities

## Admin

Full authorized administrative control and system oversight.

## Accountant

Finance-focused operations.

## HR

Employee and payroll management.

## Floor-Incharge

Floor-level academic and attendance operations.

## Teacher

Teaching and assigned academic operations.

## Student

Personal academic information and permitted student functions.

## Parent/Guardian

Monitoring associated students and submitting leave requests.

## Other Staff

Access according to explicitly assigned permissions.

---

# 22. Historical Data Requirements

Historical academic and operational records must not be unnecessarily destroyed.

The system must preserve relevant history for:

- Academic years
- Student class history
- Student academic records
- Attendance
- Tests
- Examinations
- Results
- Fees
- Salary
- Employment
- Complaints
- Audit records

Completed academic years should become read-only historical contexts where appropriate.

---

# 23. Security Requirements

The system must enforce:

- Authentication
- Session security
- Cookie security
- Server-side authorization
- Permission-based mutations
- Sensitive-data access control
- Audit logging
- Safe password reset
- Email verification
- Protection against unauthorized mutations
- Stale-state protection
- Appropriate validation

The UI must never be treated as the sole security boundary.

---

# 24. Usability Requirements

The application must prioritize:

- Clear terminology
- Predictable navigation
- Consistent actions
- Human-readable labels
- Responsive interfaces
- Clear empty states
- Clear error states
- Clear success states
- Confirmation for dangerous actions
- Readable data tables
- Logical forms
- Minimal unnecessary complexity

The application is intended for real administrative staff, not technically trained developers.

---

# 25. Module Dependency Chain

The recommended dependency sequence is:

**1. Core Platform**

↓

**2. Authentication + RBAC**

↓

**3. Admin + System Control**

↓

**4. Institute / Academic Structure**

↓

**5. Admissions + Student Records**

↓

**6. Student Fees**

↓

**7. Finance / Accounting**

↓

**8. HR + Payroll**

↓

**9. Accountant Portal**

↓

**10. Student Portal**

↓

**11. Parent Portal**

↓

**12. Teacher Management + Teacher Portal**

↓

**13. Student Attendance**

↓

**14. Staff Attendance + Leave**

↓

**15. Floor-Incharge**

↓

**16. Scheduling / Period Management**

↓

**17. Examinations + Results**

↓

**18. Daily Tests**

↓

**19. Daily Diary**

↓

**20. Complaints**

↓

**21. Notifications + Email**

↓

**22. Reports & Insights**

↓

**23. Directory**

↓

**24. Audit Trail + Advanced Settings**

↓

**25. Biometric Integration**

↓

**26. Background Jobs / Large Task Infrastructure**

This sequence may be adjusted if engineering analysis identifies a genuine dependency requiring a different implementation order, but existing business requirements must not be silently changed.

---

# 26. Product-Level Non-Functional Requirements

## Reliability

Critical operations must fail safely and must not create partial or inconsistent records.

## Data Integrity

Financial, academic, attendance, payroll, and identity records must maintain valid relationships and state.

## Security

All sensitive operations must be authorization-controlled.

## Maintainability

The system must remain modular and avoid unnecessary cross-module coupling.

## Scalability

The system should support increasing numbers of:

- Students
- Staff
- Academic years
- Financial records
- Attendance records
- Tests
- Notifications
- Reports

without requiring fundamental redesign of the product.

## Performance

User-facing operations should remain responsive, while large operations should be moved to appropriate background processing when required.

## Auditability

Important mutations must be traceable.

## Consistency

The same concept must have the same terminology and behavior throughout the application.

---

# 27. Product Acceptance Principles

The product will not be considered complete merely because all planned screens exist.

The system must demonstrate that:

1. Users can authenticate securely.
2. Permissions are enforced server-side.
3. Academic structures are correctly represented.
4. Student admission and historical records work.
5. Fees and financial records are reliable.
6. Payroll calculations work.
7. Manual financial overrides are controlled and auditable.
8. Attendance workflows follow business rules.
9. Teacher replacement periods are correctly recorded.
10. Extra periods are not double-counted.
11. Examination results calculate correctly.
12. Daily tests aggregate correctly.
13. Monthly reports work.
14. Daily diary workflows work.
15. Notifications are correctly targeted.
16. Required emails are sent without unnecessary duplication.
17. Historical data is preserved.
18. Concurrent edits cannot silently destroy newer data.
19. Unauthorized actions are rejected.
20. Important operations are auditable.
21. Reports provide useful operational information.
22. User-facing interfaces do not expose raw database identifiers.
23. Critical workflows are tested.
24. Module dependencies remain valid.
25. The system can be operated by non-technical administrative staff.

---

# 28. Core Engineering Philosophy

The project must not follow the approach:

> Build all screens first and add business logic later.

Instead:

> **Module → Data Model → Business Rules → Permissions → Backend → UI → Validation → Automation → Manual Overrides → Audit → Testing → Complete**

The purpose of the product is not simply to digitize forms.

It is to provide a reliable operational system for a real school and college environment.

The system must therefore prioritize:

**Correctness over shortcuts.**

**Clarity over cleverness.**

**Controlled automation over uncontrolled automation.**

**Security over UI-only restrictions.**

**Data integrity over convenience.**

**Modularity over unnecessary coupling.**

**Verified functionality over apparent completion.**

---

# 29. Requirement Change Policy

New requirements may be added throughout development.

Whenever a new requirement is introduced, it must be:

1. Understood.
2. Clarified where ambiguous.
3. Assigned to the appropriate module.
4. Assigned an appropriate priority.
5. Evaluated for dependencies.
6. Evaluated for conflicts with existing requirements.
7. Integrated without silently changing existing business rules.
8. Reflected in the relevant project documentation.

If a new requirement conflicts with an existing requirement, the conflict must be explicitly identified and resolved rather than silently choosing one interpretation.

---

# 30. Authoritative Product Objective

The final objective of the Scholars School & College Management System is:

> **To convert the institute's manual school and college operations into a centralized, reliable, permission-controlled, financially aware, academically structured, auditable, and extremely user-friendly management system.**

The system must provide a dependable foundation for the institute's daily operations while preserving historical information, supporting controlled automation, allowing authorized manual correction, preventing invalid operational states, and giving administrators meaningful visibility into academic, financial, HR, attendance, and operational performance.

---

# 31. Final Product Structure

The complete product is organized into the following functional domains:

### Core Platform

Authentication, sessions, users, roles, permissions, security.

### Administration

Admin portal, dashboards, institute configuration, system control.

### Academic Management

Academic years, classes, sections, groups, subjects, scheduling, examinations, marks and results.

### Student Management

Admissions, student records, guardians, historical records, student portal.

### Finance

Fees, collections, expenses, accounting, ledgers, financial insights.

### HR & Payroll

Employees, salaries, unit-based teaching salary, extra periods, attendance and leave.

### Teacher Operations

Teacher management, assignments, teacher portal, tests, diary and academic workflows.

### Attendance

Student attendance, staff attendance, leave, biometric integration.

### Floor Operations

Live floor monitoring, absent teachers, replacements, free periods and extra periods.

### Communication

Notifications, announcements, SMTP email, diary notifications and monthly report notifications.

### Reporting

Academic, attendance, finance and HR reports.

### Governance

Audit trail, permissions, historical records and system settings.

### Infrastructure Extensions

Background jobs, worker processing, biometric integrations and future integrations.

---

# 32. Final Requirement Statement

The Scholars School & College Management System shall be developed as a modular, maintainable and reliable product in which each module is independently implemented, verified and stabilized before dependent functionality is considered complete.

No module shall be considered complete based solely on UI implementation.

The final system must combine:

**Reliable Data + Correct Business Logic + Strong Authorization + User-Friendly UI + Validation + Automation + Manual Control + Auditability + Concurrency Protection + Testing**

into one coherent platform for the institute.
