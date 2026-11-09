# SCHOLARS SCHOOL & COLLEGE MANAGEMENT SYSTEM

# DESIGN SYSTEM & UI/UX SPECIFICATION

**Document:** `DESIGN.md`
**Status:** Authoritative Design Specification
**Scope:** Entire Application
**Applies To:** Admin, Accountant, HR, Teacher, Floor-Incharge, Student, Parent/Guardian, and supporting system interfaces

---

# 1. Purpose

This document defines the visual design system, interaction patterns, information architecture, responsive behavior, navigation patterns, accessibility expectations, component behavior, and user-experience standards for the Scholars School & College Management System.

The design must remain consistent with:

- `PRD.md`
- `ARCHITECTURE.md`
- `PHASES.md`
- `RULES.md`
- `SECURITY.md`
- `PERFORMANCE.md`
- `MOBILE-FIRST-DESIGN-AND-PRINCIPLE-GUIDE.md`

This document defines **how the system should look, behave, and feel**.

It does not replace business requirements or backend architecture.

---

# 2. Core Design Philosophy

The system is an operational application for real school and college staff.

It must prioritize:

1. Clarity
2. Speed
3. Predictability
4. Low cognitive load
5. Data readability
6. Safe operations
7. Mobile responsiveness
8. Accessibility
9. Consistency
10. Professional appearance

The interface must never require users to understand technical implementation details.

The design principle is:

> **Users should understand what they can do, what happened, what needs attention, and what will happen next without having to guess.**

---

# 3. Primary UX Principle

The application must not be designed as a collection of attractive screens.

Every interface must answer:

- What is this page?
- What information is important?
- What can I do here?
- What needs my attention?
- What happened recently?
- What happens after I perform this action?

A visually polished interface with unclear workflows is considered a design failure.

---

# 4. User Personas

The design must account for the different responsibilities of each actor.

## 4.1 Super Admin

Needs:

- Complete system control
- Configuration
- User management
- Permissions
- Institute management
- Financial overview
- Academic overview
- Audit visibility

UI priority:

**Control + visibility + configuration**

---

## 4.2 Admin

Needs:

- Student management
- Academic management
- Finance overview
- HR operations
- Attendance overview
- Reports
- Announcements
- Operational monitoring

UI priority:

**Operational overview + fast actions**

---

## 4.3 Accountant

Needs:

- Fee collection
- Receipts
- Expenses
- Financial transactions
- Ledgers
- Financial reports

UI priority:

**Financial accuracy + transaction speed**

---

## 4.4 HR

Needs:

- Employee records
- Teacher/staff records
- Attendance
- Leave
- Salary configuration
- Payroll
- Salary adjustments

UI priority:

**Employee lifecycle + payroll control**

---

## 4.5 Teacher

Needs:

- Assigned classes
- Assigned subjects
- Attendance
- Daily tests
- Diary
- Examination marks
- Announcements
- Notifications

UI priority:

**Fast academic operations**

---

## 4.6 Floor-Incharge

Needs:

- Current floor state
- Current period
- Attendance
- Absent teachers
- Free teachers
- Replacement periods
- Extra periods
- Operational issues

UI priority:

**Real-time operational decisions**

---

## 4.7 Student

Needs:

- Profile
- Class
- Subjects
- Attendance
- Tests
- Diary
- Examinations
- Results
- Notifications

UI priority:

**Simple academic visibility**

---

## 4.8 Parent/Guardian

Needs:

- Multiple associated students
- Attendance
- Tests
- Monthly reports
- Diary
- Results
- Fees
- Leave requests
- Notifications

UI priority:

**Child monitoring + communication**

---

# 5. Application Shell

The application uses a consistent shell across authenticated portals.

The shell consists of:

```text
┌───────────────────────────────────────────────┐
│ Header                                        │
├──────────────┬────────────────────────────────┤
│              │                                │
│ Sidebar      │ Main Content                   │
│              │                                │
│ Navigation   │ Page Header                    │
│              │                                │
│              │ Content                        │
│              │                                │
└──────────────┴────────────────────────────────┘
```

On smaller screens:

```text
┌───────────────────────────────┐
│ Header                        │
├───────────────────────────────┤
│ Main Content                  │
│                               │
│                               │
├───────────────────────────────┤
│ Mobile Navigation             │
└───────────────────────────────┘
```

The shell must adapt according to viewport size and user role.

---

# 6. Navigation Architecture

Navigation must be role-aware.

Users must only see navigation items relevant to their permissions.

However:

**Hiding a navigation item is not an authorization mechanism.**

Server-side authorization remains mandatory.

---

# 7. Desktop Navigation

Desktop authenticated layout should use:

- Persistent sidebar
- Header
- Breadcrumbs where useful
- Main content area

Sidebar groups should organize functionality logically.

Example Admin structure:

```text
Dashboard

Academic
  Students
  Classes
  Sections
  Groups
  Subjects
  Academic Years
  Scheduling

Finance
  Fees
  Transactions
  Expenses
  Payroll
  Reports

HR
  Employees
  Teachers
  Attendance
  Leave

Operations
  Attendance
  Floor Operations
  Replacements

Academics
  Tests
  Diary
  Examinations
  Results

Communication
  Notifications
  Announcements

Reports
  Academic
  Attendance
  Finance
  HR

Administration
  Users
  Roles
  Permissions
  Settings
  Audit Trail
```

Actual navigation must be permission-driven.

---

# 8. Mobile Navigation

Mobile navigation must not simply shrink the desktop sidebar.

It should provide a purpose-built mobile experience.

Recommended structure:

- Top header
- Context-aware page title
- Bottom navigation for primary actions
- Drawer/sheet for secondary navigation

The most frequently used actions should remain easily accessible.

---

# 9. Page Structure

Every major page should follow a predictable hierarchy.

```text
Page Header
 ├── Title
 ├── Description
 ├── Breadcrumb/context
 └── Primary Action

Filters / Controls

Main Content

Secondary Information

Pagination / Footer Controls
```

Example:

```text
Students
Manage enrolled students and their academic records.

[Add Student]

[Search] [Class] [Section] [Status] [More Filters]

Student Table
```

---

# 10. Page Header Standards

Every major page must clearly communicate:

- Page title
- Purpose
- Primary action
- Relevant context

Avoid vague titles.

Bad:

> Management

Good:

> Student Management

Bad:

> Records

Good:

> Student Records

Bad:

> Finance

Good:

> Fee Collection

---

# 11. Primary Actions

Each page should have one visually dominant primary action where appropriate.

Examples:

- Add Student
- Collect Fee
- Add Employee
- Create Test
- Enter Marks
- Submit Attendance
- Create Announcement

Avoid multiple visually competing primary buttons.

---

# 12. Button Naming

Buttons must describe the action.

Preferred:

- Add Student
- Save Changes
- Submit Attendance
- Collect Payment
- Approve Leave
- Reject Request
- Generate Report
- Assign Teacher

Avoid:

- Submit
- Proceed
- Continue
- Action
- Manage
- Process

unless the surrounding context makes the meaning unambiguous.

---

# 13. Destructive Actions

Destructive actions require additional friction.

Examples:

- Delete Student
- Delete User
- Remove Role
- Delete Financial Record
- Cancel Transaction

Required behavior:

1. Clear action label
2. Confirmation dialog
3. Explain consequence
4. Identify affected entity
5. Explicit confirmation
6. Server-side authorization
7. Audit where applicable

Example:

> Delete Student Record?

> This action will remove the student from the active system. Related historical records may be affected according to system retention rules.

Buttons:

**Cancel**
**Delete Student**

---

# 14. Forms

Forms must be designed around user workflows rather than database models.

Do not expose internal database structure unnecessarily.

Fields should be grouped logically.

Example student form:

```text
Personal Information
─────────────────────
First Name
Last Name
Date of Birth
Gender

Contact Information
─────────────────────
Phone
Email
Address

Academic Information
─────────────────────
Academic Year
Class
Section
Group

Guardian Information
─────────────────────
Guardian
Relationship
Contact Information

Documents
─────────────────────
B-Form
Birth Certificate
Other Documents
```

---

# 15. Form Validation

Validation should happen as close to the user interaction as practical.

Validation must be:

- Specific
- Human-readable
- Actionable

Bad:

> Invalid input.

Good:

> Phone number must contain 11 digits.

Bad:

> Required.

Good:

> Student name is required.

Server-side validation remains authoritative.

---

# 16. Form Submission

During submission:

- Disable duplicate submission
- Show loading state
- Preserve user-entered values
- Show success/error state
- Refresh relevant data
- Handle stale-data conflicts

Never silently discard user input.

---

# 17. Stale Data / Concurrent Editing UX

The application must explicitly handle concurrent updates.

Example:

User A opens Student X.

User B modifies Student X.

User A attempts to save an older version.

The system must not silently overwrite User B's changes.

Show:

> **This record was updated by another user.**

> The information you are viewing is no longer the latest version. Refresh the record before making further changes.

Actions:

**Refresh Record**

Optionally:

**Review Changes**

where technically appropriate.

---

# 18. Tables

Tables are a core component of this system because many modules contain operational records.

Tables must support, where relevant:

- Search
- Filtering
- Sorting
- Pagination
- Column visibility
- Responsive behavior
- Row actions
- Bulk actions
- Empty states
- Loading states
- Error states

---

# 19. Table Information Hierarchy

Important information should appear first.

Example Student table:

| Student | Class | Section | Guardian | Status | Actions |
| ------- | ----- | ------- | -------- | ------ | ------- |

The student name should be the primary visual anchor.

Internal database IDs should not be displayed unless explicitly required for an administrative technical purpose.

---

# 20. Human-Readable Data

Never display raw database identifiers to ordinary users.

Bad:

```text
Student: 9c9c6f0e-...
Class ID: 18
Teacher ID: 42
```

Good:

```text
Student: Muhammad Ahmed
Class: Class 10
Section: Alpha 1
Teacher: Ahmed Khan
```

---

# 21. Responsive Tables

Large tables must not force the entire application into horizontal overflow.

Use appropriate strategies:

- Responsive columns
- Priority columns
- Row expansion
- Horizontal table scrolling where necessary
- Mobile card transformation for suitable datasets

Critical information must remain accessible on mobile.

---

# 22. Data Grid

Complex administrative grids may use advanced data-grid capabilities.

Potential capabilities:

- Sorting
- Filtering
- Column visibility
- Row selection
- Keyboard navigation
- Row density
- Bulk actions
- Export where required

The implementation must remain consistent with the project's approved component ecosystem.

---

# 23. Cards

Cards should represent meaningful information groups.

Examples:

### Dashboard KPI

```text
Total Students
1,284

+4.2% this month
```

### Operational Status

```text
Teacher Attendance

Absent      8
Late        12
On Leave    4
```

Cards must not be used merely to decorate pages.

---

# 24. Dashboard Design

Dashboards must prioritize decisions rather than visual decoration.

A dashboard should answer:

- What is happening?
- What requires attention?
- What changed?
- What needs action?

Example Admin dashboard:

```text
┌────────────┬────────────┬────────────┬────────────┐
│ Students   │ Revenue    │ Expenses   │ Outstanding│
├────────────┼────────────┼────────────┼────────────┤
│ 1,284      │ PKR ...    │ PKR ...    │ PKR ...    │
└────────────┴────────────┴────────────┴────────────┘

Attendance Overview

Finance Overview

Operational Alerts

Recent Activities
```

---

# 25. KPI Design

KPI cards should contain:

- Clear metric name
- Current value
- Relevant comparison
- Optional trend
- Appropriate contextual explanation

Avoid meaningless decorative percentages.

---

# 26. Status Design

Statuses must be visually distinguishable but must not rely solely on color.

Examples:

- Active
- Inactive
- Pending
- Approved
- Rejected
- Paid
- Unpaid
- Overdue
- Present
- Absent
- Late
- On Leave

Use:

- Text
- Icon where useful
- Semantic styling

rather than color alone.

---

# 27. Attendance UX

Attendance is an operational workflow and must be extremely fast.

Recommended layout:

```text
Class 10 — Alpha 1
Date: 05 Oct 2026

Present: 32
Absent: 3
Leave: 1

Student                Status

Muhammad Ahmed         Present
Ali Raza               Present
Ahmed Khan             Absent
...
```

Controls should minimize repetitive interaction.

Bulk actions may be provided where safe.

---

# 28. Attendance Status Hierarchy

Attendance states must remain semantically distinct.

Examples:

- Present
- Absent
- Approved Leave
- Late
- Excused/other configured state where applicable

The UI must not allow users to accidentally treat approved leave as absence or vice versa.

---

# 29. Fee Collection UX

Fee collection should optimize for transaction speed and accuracy.

Typical workflow:

```text
Search Student
      ↓
Select Student
      ↓
Review Outstanding Fees
      ↓
Select Amount / Items
      ↓
Apply Authorized Adjustment
      ↓
Review Transaction
      ↓
Confirm Payment
      ↓
Generate Receipt
```

The confirmation screen must clearly show:

- Student
- Fee period
- Amount due
- Adjustment
- Amount paid
- Remaining balance
- Payment method
- Transaction date

---

# 30. Financial Amount Display

All financial values must be explicit.

Use:

**PKR 50,000**

rather than:

**50,000**

where ambiguity is possible.

Financial summaries should distinguish:

- Calculated amount
- Adjusted amount
- Paid amount
- Outstanding amount

---

# 31. Manual Override UX

When a user manually changes an automatically calculated value, the UI should make the distinction obvious.

Example:

```text
Calculated Salary
PKR 50,000

Manual Adjustment
PKR -2,500

Final Salary
PKR 47,500
```

If a reason is required:

```text
Adjustment Reason
[________________________]
```

The user should understand why the final amount differs from the calculated amount.

---

# 32. Salary UX

Salary screens must distinguish:

- Base salary
- Unit-based calculation
- Completed units
- Extra periods
- Adjustments
- Final amount

Example:

```text
Teacher Salary

Base Calculation
80 units × PKR 500
PKR 40,000

Extra Periods
4 × PKR 500
PKR 2,000

Manual Adjustment
- PKR 500

Final Salary
PKR 41,500
```

---

# 33. Scheduling UX

Scheduling is a high-conflict operational area.

The UI must make conflicts obvious before submission.

A scheduling form should clearly display:

```text
Class
Section
Group
Subject
Teacher
Building
Floor
Time Slot
```

Before assignment:

- Validate teacher availability
- Validate class availability
- Validate physical assignment
- Detect conflicts

---

# 34. Floor-Incharge Live View

The Floor-Incharge interface should prioritize current operational state.

Example:

```text
Current Period
10:00 — 10:45

Floor: 2

Class 9 — Alpha 1
Mathematics
Teacher: Ahmed Khan
Status: Active

Class 10 — Alpha 2
Physics
Teacher: Absent

Action Required
[Assign Replacement]
```

The current period must update according to the scheduling system.

---

# 35. Replacement Teacher UX

When a teacher is absent:

```text
Absent Teacher
Ahmed Khan

Affected Period
10:00 — 10:45

Class
Class 10 — Alpha 2

Available Teachers

Muhammad Ali
Free

Sara Ahmed
Free

[Assign Replacement]
```

Only valid available teachers should be presented as selectable options.

---

# 36. Extra Period UX

When a replacement period is assigned, the interface must explicitly communicate that it is an extra period.

Example:

> **Extra Period**

> This replacement period will be recorded as an extra period and may affect unit-based salary calculations.

This prevents accidental misunderstanding.

---

# 37. Examination UX

Examination entry should minimize errors.

Teacher should clearly see:

- Examination
- Class
- Section
- Subject
- Maximum marks
- Student
- Existing marks

Marks input must validate the allowed range.

Example:

```text
Maximum Marks: 100

Student                 Marks

Muhammad Ahmed          [82]
Ali Raza                [74]
Ahmed Khan              [91]
```

---

# 38. Daily Test UX

Daily test creation should be fast.

Workflow:

```text
Select Class
→ Select Section/Group
→ Select Subject
→ Enter Test Details
→ Enter Marks
→ Review
→ Submit
```

Teachers should only access appropriate academic contexts according to their permissions and assignments.

---

# 39. Monthly Test Report UX

Monthly reports should provide both summary and detail.

Example:

```text
October 2026
Muhammad Ahmed

Mathematics       82%
English           76%
Physics           88%
Chemistry         79%
Computer Science  91%

Overall Performance
83.2%
```

The parent/student should not need to open multiple pages to understand the month's overall academic performance.

---

# 40. Daily Diary UX

Diary should be date-oriented.

Example:

```text
Today's Diary

05 October 2026

Mathematics
Complete exercises 4–6.

English
Read chapter 5.

Physics
Prepare numerical problems.
```

Students and parents should be able to access today's diary quickly.

---

# 41. Leave Request UX

Parent workflow:

```text
Select Student
→ Select Dates
→ Enter Reason
→ Review
→ Submit Request
```

Request status should be clearly visible:

- Pending
- Approved
- Rejected

Rejected requests must display the relevant reason when available.

---

# 42. Notifications

Notifications should be actionable.

Bad:

> New notification.

Good:

> Monthly test report for Muhammad Ahmed is available.

Action:

**View Report**

Notification design should communicate:

- What happened
- Who/what it concerns
- When it happened
- What the user can do

---

# 43. Notification Center

The notification center should support:

- Unread/read state
- Timestamp
- Category
- Target entity
- Quick action
- Mark as read
- Mark all as read

Unread notifications should be visually distinguishable without relying only on color.

---

# 44. Announcements

Announcements should have:

- Title
- Content
- Audience
- Publication date
- Author
- Status

Important announcements may use stronger visual emphasis.

---

# 45. Email UX

Email is a communication channel, not the primary application interface.

Emails should be concise and action-oriented.

Examples:

- Verify Email
- Reset Password
- Check Today's Diary
- Monthly Test Report Available

Emails should contain a clear action link leading to the appropriate application page.

---

# 46. Search

Search must be available wherever datasets become large enough to require it.

Search should prioritize human-readable values.

Examples:

Student search:

- Name
- Admission number where relevant
- Guardian name
- Phone where permitted

Teacher search:

- Name
- Employee identifier where appropriate
- Subject
- Department

---

# 47. Filtering

Filters should reflect domain concepts.

Student filters:

- Academic year
- Class
- Section
- Group
- Status

Attendance filters:

- Date
- Class
- Section
- Status

Financial filters:

- Date
- Transaction type
- Student
- Status
- Payment method

Avoid exposing raw database fields as filters.

---

# 48. Empty States

Empty states must explain what happened and what the user can do next.

Bad:

> No data.

Good:

> No students found for Class 10 — Alpha 1.

If applicable:

**Add Student**

or:

**Clear Filters**

---

# 49. Loading States

Loading states must communicate that the system is working.

Use:

- Skeletons
- Inline loading indicators
- Button loading states
- Table loading states

Avoid unnecessary full-screen loading.

---

# 50. Error States

Errors must be human-readable.

Example:

> We couldn't save this student record.

Then provide useful context:

> Another user may have updated this record. Refresh the record and try again.

Where possible provide:

**Try Again**

or:

**Refresh**

---

# 51. Success Feedback

Success messages must identify the completed operation.

Good:

> Student record created successfully.

Good:

> Fee payment recorded successfully.

Good:

> Attendance submitted successfully.

Avoid generic:

> Success.

---

# 52. Toasts

Toasts are appropriate for lightweight feedback.

Use them for:

- Successful save
- Successful update
- Minor operational confirmation

Do not put critical information only inside a temporary toast.

---

# 53. Dialogs

Dialogs should be used for:

- Confirmation
- Short focused forms
- Secondary actions

Do not place complex multi-step workflows inside unnecessarily small dialogs.

Complex workflows should use full pages or dedicated sheets where appropriate.

---

# 54. Drawers / Sheets

Sheets are useful for:

- Quick record preview
- Filters
- Secondary information
- Mobile-friendly actions

Example:

Click student → open student preview sheet.

For complex editing, navigate to a dedicated page.

---

# 55. Detail Pages

Important entities should have dedicated detail views.

Example:

```text
Student Profile

Muhammad Ahmed
Class 10 — Alpha 1

[Edit Student]

Overview
Academic
Attendance
Fees
Tests
Examinations
Diary
Complaints
Documents
History
```

Tabs should represent meaningful domain areas.

---

# 56. Profile Design

Entity profiles should emphasize identity first.

Example:

```text
Muhammad Ahmed
Class 10 · Alpha 1
Active Student

Guardian: Ahmed Raza
Admission Date: ...

[Edit]
```

Do not overload the header with excessive metadata.

---

# 57. Role-Based Dashboard Design

Different roles must not receive the same dashboard with irrelevant widgets hidden randomly.

Dashboards should be intentionally designed around the role.

### Admin

Operations + finance + academic overview.

### Accountant

Financial operations + outstanding fees + recent transactions.

### HR

Employees + attendance + payroll.

### Teacher

Assigned classes + tests + diary + attendance.

### Floor-Incharge

Current floor + attendance + replacement operations.

### Student

Academic progress + attendance + diary + tests.

### Parent

Children + attendance + diary + reports + fees.

---

# 58. Permission-Aware UI

Actions should be rendered according to permissions.

Example:

If user has:

`student.update`

show:

**Edit Student**

If user does not have it:

- Do not show the action where appropriate.
- Never rely on this for security.
- Server-side authorization remains mandatory.

---

# 59. Accessibility

Accessibility is a first-class design requirement.

Required:

- Keyboard navigation
- Visible focus states
- Semantic HTML
- Proper labels
- Accessible form errors
- Sufficient contrast
- Screen-reader-friendly controls
- Accessible dialogs
- Accessible dropdowns
- Accessible tables
- No color-only status indicators

Interactive elements must have understandable accessible names.

---

# 60. Keyboard Navigation

Administrative users often work heavily with keyboards.

Important interfaces should support:

- Tab navigation
- Enter
- Escape
- Arrow keys where appropriate
- Search shortcuts where appropriate

Data-entry workflows should avoid unnecessary mouse-only interactions.

---

# 61. Mobile-First Requirement

Every module must be designed mobile-first.

The application must remain usable on:

- Mobile phones
- Tablets
- Laptops
- Desktop monitors

Do not design desktop first and merely compress it for mobile.

---

# 62. Touch Interaction

Touch targets must be sufficiently large.

Avoid tightly packed actions.

Destructive and secondary actions should not be accidentally triggered by touch.

---

# 63. Responsive Breakpoints

The exact breakpoints should follow the project's Tailwind configuration and design system rather than arbitrary per-component values.

Components should respond based on available space.

Avoid unnecessary breakpoint proliferation.

---

# 64. Typography

Typography must prioritize readability.

Hierarchy:

```text
Page Title
Section Heading
Subheading
Body
Secondary Text
Caption
```

Avoid excessive font sizes and decorative typography.

Numbers in financial and statistical contexts should remain highly legible.

---

# 65. Color System

The application should use semantic color tokens rather than hard-coded colors.

Primary semantic categories:

- Primary
- Secondary
- Success
- Warning
- Destructive
- Informational
- Muted

Status colors must be accompanied by textual labels or icons where appropriate.

---

# 66. Design Tokens

Components should use centralized design tokens for:

- Colors
- Radius
- Spacing
- Typography
- Shadows
- Borders
- Focus states

Do not introduce arbitrary one-off visual values throughout the application.

---

# 67. shadcn/ui

The application should use shadcn/ui as the primary UI component foundation.

Components should be:

- Composable
- Accessible
- Consistent
- Customizable

Advanced component blocks may be integrated when they fit the design system.

Imported components must be adapted to project conventions rather than blindly copied.

---

# 68. Icons

The project uses the configured icon library consistently.

Icons must support meaning rather than decoration.

Do not use ambiguous icons for important actions without labels.

Examples:

Good:

**Edit Student** + edit icon

Bad:

Only an unexplained pencil icon in a critical workflow.

---

# 69. Data Visualization

Charts should be used only when they improve understanding.

Useful examples:

- Revenue trend
- Expense trend
- Attendance trend
- Student performance trend
- Fee collection trend

Avoid charts that simply duplicate table data.

Every chart should communicate:

- What is being measured
- Time period
- Relevant unit
- Meaningful comparison

---

# 70. Financial Charts

Financial charts must clearly distinguish:

- Income
- Expenses
- Net position
- Outstanding amounts

Use explicit labels and units.

---

# 71. Academic Charts

Academic charts may represent:

- Subject performance
- Class performance
- Attendance
- Test trends
- Examination results

Do not overcomplicate charts for students or parents.

---

# 72. Reports

Reports should be designed for both:

- On-screen consumption
- Printing/export where required

Important report pages should have:

- Report title
- Date range
- Relevant filters
- Entity/context
- Data
- Summary
- Generated timestamp where useful

---

# 73. Print-Friendly Interfaces

Where physical reports are operationally useful, print styles should remove unnecessary application chrome.

Print output should prioritize:

- Institute identity
- Report title
- Relevant records
- Dates
- Summary
- Page readability

---

# 74. Audit Trail UX

Audit records are primarily administrative.

Example:

```text
Salary Updated

User:
HR Admin

Entity:
Muhammad Ahmed — October Salary

Previous:
PKR 50,000

New:
PKR 47,500

Reason:
Manual correction

Date:
05 Oct 2026
```

Audit information should be readable without exposing unnecessary technical implementation details.

---

# 75. Security-Sensitive UX

Sensitive actions should clearly communicate authorization and consequences.

Examples:

- Permission changes
- Salary changes
- Financial corrections
- User deletion
- Account disabling

Do not expose sensitive information to unauthorized users even if the UI layout exists.

---

# 76. Sensitive Data Presentation

Sensitive data should only be displayed when the current user has appropriate permission.

Examples:

- Personal documents
- Financial records
- Salary
- Contact information
- Account/security information

---

# 77. Breadcrumbs

Breadcrumbs should be used where navigation depth becomes significant.

Example:

```text
Students / Class 10 / Alpha 1 / Muhammad Ahmed
```

Avoid breadcrumbs on simple top-level pages.

---

# 78. URL Design

User-facing routes should use readable slugs.

Example:

```text
/students/muhammad-ahmed
```

rather than:

```text
/students/8f34b8c2-...
```

The UI must not expose internal database identifiers unnecessarily.

---

# 79. State Persistence

Where useful, users should not lose their operational context.

Examples:

- Selected filters
- Search query
- Table page
- Tab
- Relevant academic context

However, state persistence must never cause stale or unsafe data to be submitted.

---

# 80. Unsaved Changes

Forms with meaningful amounts of user input should warn users before leaving when unsaved changes would be lost.

Example:

> You have unsaved changes.

> Are you sure you want to leave this page?

Actions:

**Stay**

**Leave**

---

# 81. Confirmation Design

Confirmation should communicate the actual consequence.

Bad:

> Are you sure?

Good:

> Mark attendance as submitted?

> After submission, changes may require authorized correction.

---

# 82. Progressive Disclosure

Do not overwhelm users with every possible option at once.

Primary workflow first.

Advanced options should be available through:

- More filters
- Advanced settings
- Secondary actions
- Expandable sections

---

# 83. Avoid Technical Terminology

The user-facing application should avoid terms such as:

- UUID
- Database ID
- ORM
- API
- Migration
- Cache
- Server action
- Transaction

unless the user is an authorized technical administrator and the information is genuinely relevant.

---

# 84. Consistency Rules

The same concept must look and behave the same everywhere.

Examples:

If **Save Changes** is used for editing a student, it should not become:

- Update
- Apply
- Confirm

on another unrelated edit form unless there is a meaningful difference.

---

# 85. Entity Action Consistency

Common actions should follow a consistent order.

Recommended:

```text
View
Edit
More
```

Destructive actions should be separated from common actions.

---

# 86. List → Detail → Edit Pattern

Most major entities should follow:

```text
List
 ↓
Detail
 ↓
Edit
```

Example:

```text
Students
 ↓
Muhammad Ahmed
 ↓
Edit Student
```

This creates predictable navigation.

---

# 87. Bulk Operations

Bulk operations should be provided where they materially improve administrative efficiency.

Examples:

- Bulk attendance
- Bulk notification
- Bulk status update
- Bulk assignment where safe

Bulk destructive actions require stronger confirmation.

---

# 88. Feedback During Long Operations

Long-running operations must provide progress/status where possible.

Examples:

- Report generation
- Bulk email
- Large data processing
- Biometric synchronization

Users should not be left wondering whether the operation succeeded.

---

# 89. Background Job UX

When an operation is processed asynchronously:

```text
Request Submitted
      ↓
Processing
      ↓
Completed
```

The UI should provide status where appropriate.

For example:

> Monthly report generation started.

> You can continue using the application. The report will appear when processing is complete.

---

# 90. Biometric Integration UX

Biometric functionality should be presented as an operational integration rather than exposing device-level technical complexity to ordinary users.

Admin configuration may expose:

- Device
- Connection status
- Last synchronization
- Last transaction
- Errors
- Integration health

Normal staff should primarily see attendance outcomes.

---

# 91. Integration Health

Technical integration pages should provide understandable status:

```text
Biometric Device

Status: Connected

Last Sync:
05 Oct 2026 — 09:42 AM

Transactions:
1,284

Warnings:
0
```

If disconnected:

> Device connection unavailable.

> Attendance transactions may not be synchronized until the connection is restored.

---

# 92. Notification Priority

Notifications should have meaningful priority.

Possible levels:

- Informational
- Important
- Warning
- Critical

Critical notifications should not be visually confused with routine updates.

---

# 93. Responsive Modal Behavior

On mobile:

- Dialogs may become full-height sheets where appropriate.
- Forms should remain comfortable to interact with.
- Buttons should remain reachable.
- Important actions should not be hidden below inaccessible content.

---

# 94. Error Recovery

Whenever an error occurs, the design should answer:

1. What failed?
2. Why might it have failed?
3. Can the user retry?
4. Will their data be lost?
5. What should they do next?

---

# 95. Offline / Connectivity Considerations

The application should gracefully handle temporary network failures.

Do not falsely show successful mutations when the server has not confirmed them.

Example:

> We couldn't confirm this payment.

> Please verify the transaction status before trying again.

This is particularly important for financial operations.

---

# 96. Financial Transaction Safety

Financial mutations require stronger confirmation than ordinary profile edits.

Before final confirmation:

```text
Student
Fee Period
Amount Due
Adjustment
Amount Paid
Remaining Balance
Payment Method
```

must be clearly visible.

---

# 97. Data Integrity UX

The UI should prevent invalid combinations rather than relying exclusively on backend rejection.

Example:

If a teacher is unavailable:

Do not present that teacher as a valid replacement option.

If a class already has a period:

Do not allow a conflicting schedule assignment without explicit handling.

---

# 98. Design and Business Rules

The UI must never invent business rules.

If a business rule is not defined in the PRD or architecture:

- Do not silently assume it.
- Do not create arbitrary behavior.
- Identify the ambiguity.
- Follow the project's documented decision process.

---

# 99. Design Implementation Rules

When implementing a page/component:

1. Identify the relevant module.
2. Read its PRD requirements.
3. Read relevant architecture constraints.
4. Identify required permissions.
5. Identify required states.
6. Design the primary workflow.
7. Implement responsive behavior.
8. Implement validation feedback.
9. Implement loading state.
10. Implement empty state.
11. Implement error state.
12. Implement success feedback.
13. Handle stale/concurrent data.
14. Verify accessibility.
15. Verify mobile behavior.
16. Verify authorization-aware UI.
17. Verify consistency with existing components.

---

# 100. Component Reuse

Before creating a new component:

1. Search the existing component system.
2. Reuse an existing component when appropriate.
3. Extend an existing component when the behavior is related.
4. Create a new component only when necessary.

Avoid duplicate UI primitives.

---

# 101. Module-Local UI Components

Module-specific components should remain close to their module unless they are genuinely reusable.

Examples:

A student fee-specific payment summary should remain within the finance/fee domain.

A generic confirmation dialog belongs to shared UI.

This prevents the shared component layer from becoming a dumping ground.

---

# 102. Design Quality Gate

A UI implementation is not complete merely because it renders.

Every feature should pass:

### Visual

- Consistent
- Responsive
- Readable
- Professional

### UX

- Clear workflow
- Clear actions
- Clear feedback
- Predictable navigation

### Accessibility

- Keyboard accessible
- Proper labels
- Focus management
- Semantic controls

### Data

- Human-readable values
- Correct states
- No raw IDs

### Security

- Permission-aware UI
- No sensitive data leakage

### Reliability

- Loading states
- Error states
- Empty states
- Concurrent-update handling

---

# 103. Definition of Design Complete

A design implementation is considered complete only when:

- The intended workflow is understandable.
- All relevant states are designed.
- Mobile behavior is verified.
- Desktop behavior is verified.
- Accessibility requirements are met.
- Permission-dependent actions are handled.
- Human-readable values are displayed.
- Loading/error/empty/success states exist.
- Destructive actions are protected.
- Concurrent updates are handled.
- Financial operations have appropriate confirmation.
- Components follow the established design system.
- No unnecessary duplication exists.

---

# 104. Design Evolution

The design system must evolve incrementally.

New requirements must:

1. Be mapped to the appropriate module.
2. Reuse existing patterns where possible.
3. Introduce new patterns only when justified.
4. Preserve existing usability.
5. Avoid breaking established workflows.
6. Update the design specification when a reusable pattern is introduced.

---

# 105. Final Design Principle

The Scholars School & College Management System must feel like a **professional operational platform**, not a collection of disconnected CRUD pages.

The user should experience a consistent system where:

**Navigation is predictable.**

**Data is understandable.**

**Actions are obvious.**

**Errors are recoverable.**

**Permissions are respected.**

**Financial operations are safe.**

**Academic workflows are fast.**

**Mobile usage is practical.**

**Complex operations remain manageable.**

**Automation is visible and controllable.**

**Manual corrections are traceable.**

**Every module follows the same design language.**

The final design objective is:

> **Make complex school and college operations simple enough for everyday staff to perform correctly, quickly, and confidently.**
