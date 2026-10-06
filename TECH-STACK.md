# SCHOLARS STUDENT MANAGEMENT SYSTEM

# Technology Stack, Libraries, Dependencies & UI Component Specification

**Project:** Scholars Student Management System
**Organization:** Zebotix Web & Business Automation Solutions
**Document Type:** Technology Stack & Dependency Specification
**Version:** 1.0
**Status:** Technical Baseline
**Purpose:** Pre-Development Technology Installation & Configuration
**Primary Application:** Full-Stack Web Application + Mobile Wrapper
**Future Direction:** School Management / School ERP Platform

---

# 1. Document Purpose

This document defines the approved technology stack, frameworks, libraries, packages, dependencies, UI components, shadcn/ui components, shadcn blocks, development tools, and supporting infrastructure for the Scholars Student Management System.

The primary purpose is to establish the technology baseline **before feature implementation begins**.

The development team or AI coding agent must use this document to:

1. Initialize the project.
2. Install required dependencies.
3. Configure development tooling.
4. Configure UI libraries.
5. Configure database tooling.
6. Configure validation.
7. Configure authentication.
8. Configure forms.
9. Configure tables and data presentation.
10. Configure charts and reports.
11. Configure mobile-wrapper requirements.
12. Prevent unnecessary package installation.
13. Maintain a consistent technology ecosystem throughout the project.

---

# 2. Technology Baseline

The project will use a modern TypeScript-first full-stack architecture.

## Core Stack

| Layer            | Technology                                             |
| ---------------- | ------------------------------------------------------ |
| Language         | TypeScript                                             |
| Web Framework    | Next.js                                                |
| UI Framework     | React                                                  |
| Styling          | Tailwind CSS                                           |
| Component System | shadcn/ui                                              |
| Icons            | @phosphor-icons/react                                  |
| Form Management  | React Hook Form                                        |
| Validation       | Zod                                                    |
| Database         | PostgreSQL                                             |
| ORM              | Drizzle ORM (`drizzle-orm` + `drizzle-kit` + `pg`)      |
| Authentication   | Auth.js / NextAuth-compatible architecture             |
| Charts           | Recharts                                               |
| Tables           | TanStack Table                                         |
| Server State     | Server Components / Server Actions primarily           |
| Client State     | Zustand only where genuinely required                  |
| Package Manager  | pnpm                                                   |
| Code Quality     | ESLint                                                 |
| Formatting       | Prettier                                               |
| Testing          | Vitest + Playwright                                    |
| E2E Testing      | Playwright                                             |
| Containerization | Docker                                                 |
| Version Control  | Git                                                    |
| CI/CD            | GitHub Actions                                         |
| Mobile Wrapper   | Capacitor                                              |
| Date Handling    | date-fns                                               |
| UUID/Identifiers | Project/database-defined ID strategy                   |
| Deployment       | Production provider defined by deployment architecture |
| Database Hosting | PostgreSQL-compatible managed provider                 |

---

# 3. Technology Selection Principles

The project follows these dependency principles.

## Rule 3.1 — TypeScript First

All application code must use TypeScript unless a specific technical requirement requires otherwise.

## Rule 3.2 — Minimal Dependencies

A package must not be installed merely because it is popular.

Each dependency must solve a real problem.

## Rule 3.3 — Existing Stack Before New Package

Before installing a new package, check whether:

- Next.js
- React
- Tailwind
- shadcn/ui
- Zod
- React Hook Form
- Drizzle ORM
- native browser APIs

already provide the required capability.

## Rule 3.4 — Avoid Duplicate Libraries

Do not install multiple libraries for the same responsibility without an explicit architectural reason.

For example, do not use:

- multiple form libraries
- multiple validation libraries
- multiple icon libraries
- multiple date libraries
- multiple table libraries

for the same application purpose.

---

# 4. Package Manager

## Approved Package Manager

**pnpm**

pnpm will be the standard package manager for this project.

### Reasons

- Efficient disk usage
- Fast installation
- Strong dependency management
- Workspace support
- Good monorepo compatibility
- Reproducible lockfile behavior

The repository must include:

```text
pnpm-lock.yaml
```

The lockfile must be committed.

---

# 5. Runtime Requirements

The project should use a current stable Node.js LTS release compatible with the selected Next.js version.

The exact Node.js version must be pinned in project configuration.

Recommended files:

```text
.nvmrc
package.json
```

The team must not casually switch Node.js versions between environments.

---

# 6. Core Framework

## 6.1 Next.js

**Purpose:**

Primary full-stack web framework.

Responsibilities include:

- Routing
- Server rendering
- Server Components
- Client Components
- Server Actions
- API endpoints where required
- Metadata
- Asset handling
- Application bundling
- Web application deployment

The project should use the current stable Next.js version selected at initialization.

---

# 7. React

React is the primary UI framework.

Use:

- Functional components
- Hooks
- Server Components where appropriate
- Client Components only when required

Avoid unnecessary client-side rendering.

---

# 8. TypeScript

TypeScript will be used throughout the application.

Recommended configuration:

```text
strict: true
```

Type safety must not be weakened simply to make development easier.

---

# 9. Tailwind CSS

Tailwind CSS will be the primary styling system.

Use Tailwind for:

- Layout
- Spacing
- Responsive behavior
- Typography
- Colors
- Borders
- Shadows
- Responsive states
- Component styling

Do not introduce another utility CSS framework.

---

# 10. shadcn/ui

shadcn/ui will be the primary UI component foundation.

The project will use shadcn/ui components as the base for:

- Forms
- Dialogs
- Dropdowns
- Tables
- Navigation
- Alerts
- Cards
- Buttons
- Inputs
- Selectors
- Tabs
- Sheets
- Tooltips
- Menus
- Data presentation

Components should be added through the shadcn CLI rather than manually copying random component implementations.

---

# 11. Phosphor Icons

**Package:**

```text
@phosphoricons/react
```

Purpose:

- UI icons
- Navigation icons
- Action icons
- Status icons
- Form icons

No additional icon library should be installed unless a specific requirement exists.

---

# 12. Class Utility Packages

The standard shadcn utility stack will be retained:

```text
clsx
tailwind-merge
class-variance-authority
```

These support:

- conditional classes
- class merging
- component variants

---

# 13. Form Management

## React Hook Form

Package:

```text
react-hook-form
```

Purpose:

- Form state
- Field registration
- Submission state
- Validation integration
- Performance-friendly form handling

---

# 14. Validation

## Zod

Package:

```text
zod
```

Purpose:

- Form validation
- Server-side validation
- API validation
- Data parsing
- Type-safe schemas
- Import validation

Zod schemas must be reused appropriately between client and server boundaries where practical.

---

# 15. React Hook Form + Zod Integration

Package:

```text
@hookform/resolvers
```

Primary integration:

```text
React Hook Form
        ↓
Zod Resolver
        ↓
Zod Schema
        ↓
Validated Data
```

---

# 16. Database

## PostgreSQL

PostgreSQL will be the primary relational database.

It will store:

- Users
- Roles
- Permissions
- Students
- Academic sessions
- Classes
- Groups
- Sections
- Attendance
- Fees
- Payments
- Results
- Reports metadata
- Audit records
- System configuration
- Other application entities

---

# 17. ORM

## Drizzle ORM

Packages:

```text
drizzle-orm      runtime + pg-core schema builders
drizzle-kit      migration generation and schema tooling (build-time CLI)
pg               node-postgres driver
```

The schema is **hand-written TypeScript** in `src/db/schema/index.ts`. There is no
schema DSL file and no generated client, so `tsc` reads tables directly. Queries go
through `db` from `src/db/client.ts`. See `AGENTS.md` and `MEMORY.md` §3.

Drizzle is responsible for:

- Database schema
- Migrations
- Queries
- Relations
- Transactions
- Type-safe database access

---

# 18. Drizzle Rules

The project must use:

```text
src/db/schema/index.ts
```

and controlled migrations. After any schema edit, run `pnpm db:generate` and commit
the resulting `drizzle/` migration in the same commit. Never hand-edit anything under
`drizzle/` — it is generated output.

Never modify production schema manually without the approved migration process. Only
`pnpm db:migrate` may be applied to a real database; `pnpm db:push` bypasses migration
history and is for local throwaway experiments only.

---

# 19. Authentication

The project will use an Auth.js / NextAuth-compatible authentication architecture.

Authentication responsibilities include:

- Login
- Logout
- Session management
- Password authentication where applicable
- OAuth providers where required
- Session expiration
- Authentication callbacks
- Protected routes
- User identity

Authentication implementation must remain compatible with the project's authorization architecture.

---

# 20. Authorization

Authorization will be application-level RBAC.

Example roles:

```text
Admin
Teacher
Accountant
Receptionist
Parent
Student
```

Permissions should be granular where required.

Examples:

```text
students.view
students.create
students.update
students.delete

attendance.view
attendance.mark
attendance.update

fees.view
fees.record
fees.update

results.view
results.enter
results.update
results.publish
```

Authorization must always be enforced server-side.

---

# 21. State Management Strategy

The application should prefer server state over unnecessary global client state.

Priority:

```text
Server Components
        ↓
Server Actions
        ↓
URL State
        ↓
Local React State
        ↓
Zustand
```

Zustand should only be installed/used where shared client state is genuinely required.

---

# 22. Zustand

Package:

```text
zustand
```

Purpose:

Only for client-side state that cannot reasonably be handled through:

- URL state
- React state
- Server Components
- Server Actions
- form state

Examples may include:

- complex client-only UI state
- temporary multi-step workflow state
- persistent UI preferences where appropriate

Do not use Zustand as a default replacement for server state.

---

# 23. Data Tables

## TanStack Table

Packages:

```text
@tanstack/react-table
```

Purpose:

- Student tables
- Attendance tables
- Fee records
- Result records
- User management
- Reports
- Sorting
- Filtering
- Pagination
- Column visibility

The table UI itself should be built using shadcn/ui styling/components.

---

# 24. Charts

## Recharts

Package:

```text
recharts
```

Purpose:

- Attendance statistics
- Student statistics
- Fee summaries
- Result statistics
- Dashboard analytics

Charts must remain secondary to understandable numerical information.

---

# 25. Date Handling

## date-fns

Package:

```text
date-fns
```

Purpose:

- Date formatting
- Date comparison
- Date calculations
- Academic session date handling
- Attendance dates
- Report date ranges

Avoid installing multiple date libraries.

---

# 26. File Handling

The application may require:

- student documents
- profile images
- report files
- imports
- exports

File storage should be abstracted so the application is not tightly coupled to one storage provider.

The storage implementation must be selected according to deployment architecture.

---

# 27. CSV/Data Import

CSV imports should initially use a lightweight, actively maintained parser appropriate for the project.

The exact package must be selected only if CSV import is required by the approved product scope.

Do not install an import library before the feature requires it.

---

# 28. PDF Generation

PDF generation must be introduced only when reports or documents require it.

The selected PDF library must be evaluated based on:

- Server compatibility
- Font support
- Urdu/English requirements if applicable
- Memory usage
- Output quality
- Maintenance status

Do not install PDF generation packages during initial setup unless the current implementation requires them.

---

# 29. Email

Email functionality should use an abstraction layer.

The application should not hardcode business logic to one email provider.

Provider selection belongs to deployment/integration configuration.

---

# 30. Notifications

Notification architecture should support:

```text
In-app
Email
SMS
Push
```

where required.

Only providers actually needed by the current product scope should be installed.

---

# 31. API Communication

Internal server-side communication should prefer direct application/service calls where architecture permits.

Do not create an HTTP request to the application's own backend merely because an API endpoint exists.

Use API routes when there is a genuine external/client integration requirement.

---

# 32. Data Fetching

The default data-fetching approach should use:

- Server Components
- Server Actions
- Direct server-side data access

Client-side fetching libraries should not be added automatically.

A library such as TanStack Query may be introduced later only if the application demonstrates a genuine requirement for:

- complex client-side server-state caching
- polling
- optimistic updates
- offline synchronization
- advanced client-side query orchestration

It is **not part of the mandatory initial dependency set**.

---

# 33. Toast Notifications

Use shadcn/ui's toast/sonner-based notification pattern selected by the current shadcn implementation.

Purpose:

- Save success
- Update success
- Delete success
- Error notification
- Background operation feedback

Do not use multiple toast libraries.

---

# 34. UI Component Baseline

The following shadcn/ui components are approved for the project.

## Core Components

```text
Button
Badge
Card
Separator
Skeleton
Alert
Alert Dialog
Dialog
Sheet
Tooltip
Popover
```

---

# 35. Form Components

Approved components:

```text
Input
Textarea
Label
Checkbox
Radio Group
Switch
Select
Combobox
Calendar
Date Picker
Form
Input OTP
```

Only components actually required by the feature should be rendered.

---

# 36. Navigation Components

Approved:

```text
Sidebar
Navigation Menu
Breadcrumb
Tabs
Dropdown Menu
Menubar
Sheet
Command
```

The primary application dashboard navigation will use the shadcn Sidebar pattern where appropriate.

---

# 37. Data Components

Approved:

```text
Table
Data Table pattern
Pagination
Badge
Card
Accordion
Collapsible
```

TanStack Table will provide advanced table logic where required.

---

# 38. Feedback Components

Approved:

```text
Alert
Alert Dialog
Dialog
Toast / Sonner
Skeleton
Progress
Spinner/loading indicators where required
```

---

# 39. Overlay Components

Approved:

```text
Dialog
Alert Dialog
Sheet
Drawer
Popover
Tooltip
Dropdown Menu
Context Menu
```

Use the least intrusive appropriate component.

---

# 40. Selection Components

Approved:

```text
Select
Combobox
Command
Checkbox
Radio Group
Switch
```

For long lists such as:

```text
Students
Teachers
Classes
Sections
Users
```

prefer searchable selection where appropriate.

---

# 41. Calendar Components

Use shadcn calendar/date-picker patterns for:

- Attendance date
- Fee date
- Result date
- Academic session dates
- Report date range

---

# 42. Student Management UI Components

Student management may use:

```text
Card
Table
Data Table
Avatar
Badge
Button
Dialog
Sheet
Form
Input
Select
Combobox
Tabs
Dropdown Menu
Alert Dialog
```

Typical student workflow:

```text
Students
    ↓
Search / Filter
    ↓
Student List
    ↓
Student Details
    ↓
Edit / Actions
```

---

# 43. Attendance UI Components

Attendance should use:

```text
Card
Select
Combobox
Calendar
Table
Checkbox
Badge
Button
Alert Dialog
Sheet
```

The interface must clearly display:

```text
Academic Session
Class
Group
Section
Date
Students
Attendance Status
```

---

# 44. Fees UI Components

Fees/payment functionality may use:

```text
Card
Table
Data Table
Form
Input
Select
Combobox
Calendar
Badge
Dialog
Alert Dialog
Button
Tabs
```

Financial operations must have explicit actions and confirmation where appropriate.

---

# 45. Results UI Components

Results may use:

```text
Table
Data Table
Input
Select
Combobox
Tabs
Badge
Dialog
Alert Dialog
Card
Button
```

Publishing results should use a clear confirmation workflow.

---

# 46. Reports UI Components

Reports may use:

```text
Card
Tabs
Select
Combobox
Calendar
Date Range Picker
Table
Data Table
Button
Dropdown Menu
Dialog
Progress
```

Report generation must clearly communicate:

- selected criteria
- generated output
- errors
- loading state

---

# 47. User Management UI Components

Use:

```text
Table
Data Table
Avatar
Badge
Dropdown Menu
Dialog
Alert Dialog
Form
Input
Select
Checkbox
Tabs
```

---

# 48. Settings UI Components

Use:

```text
Tabs
Card
Form
Input
Select
Switch
Checkbox
Radio Group
Button
Alert Dialog
```

Settings should be grouped by purpose.

---

# 49. Dashboard Components

Dashboard may use:

```text
Card
Badge
Tabs
Chart
Table
Progress
Skeleton
Alert
```

Dashboard blocks must not become visually overloaded.

---

# 50. Approved shadcn/ui Blocks

The project may use shadcn blocks as starting points for common layouts.

Approved categories include:

## Authentication

- Login page
- Sign-up page where applicable
- Forgot password
- Authentication forms

## Dashboard

- Dashboard shell
- Sidebar dashboard
- Header
- Statistics cards
- Dashboard overview

## Data Management

- Data tables
- Filterable tables
- Search interfaces
- CRUD forms

## Settings

- Settings sidebar
- Profile settings
- Account settings
- Notification settings

## User Management

- User lists
- User profiles
- User forms

## Forms

- Multi-field forms
- Validation forms
- Combobox forms
- Date-selection forms

Blocks are starting patterns, not permission to copy an entire unrelated application.

---

# 51. shadcn Block Usage Rule

A shadcn block must be adapted to the project's:

- Design system
- Typography
- Spacing
- Navigation
- Naming
- Business requirements
- Mobile-first rules

Do not blindly paste blocks into the application.

---

# 52. shadcn Component Installation Strategy

Components should be installed individually or in controlled groups.

Initial recommended installation:

```text
button
badge
card
input
label
textarea
select
checkbox
radio-group
switch
form
table
dialog
alert-dialog
sheet
drawer
dropdown-menu
popover
tooltip
tabs
accordion
collapsible
separator
skeleton
alert
avatar
calendar
command
breadcrumb
sidebar
pagination
progress
```

Additional components should be added only when required.

---

# 53. Initial UI Installation Objective

The initial installation should establish the complete base UI system without creating unnecessary application features.

The objective is:

```text
shadcn/ui
   ↓
Design Tokens
   ↓
Base Components
   ↓
Reusable Patterns
   ↓
Feature Components
```

---

# 54. Tailwind Design Tokens

The application must define centralized design tokens for:

- Primary color
- Secondary color
- Background
- Foreground
- Muted
- Border
- Destructive
- Success
- Warning
- Radius
- Typography
- Spacing

Components must use tokens rather than random one-off values wherever practical.

---

# 55. Theme Rules

The project should support a consistent theme architecture.

Light/dark mode may be supported if required by the product.

Do not introduce multiple unrelated themes.

---

# 56. Dark Mode

If dark mode is implemented:

- Every component must remain readable.
- Charts must remain understandable.
- Form fields must remain accessible.
- Status colors must remain distinguishable.
- Tables must remain readable.

Dark mode must not be treated as a simple background-color inversion.

---

# 57. Typography

The project must use a controlled font system.

Do not import numerous font families.

Typography should define:

```text
Display
Heading
Subheading
Body
Label
Caption
Table
Code
```

where appropriate.

---

# 58. Icon System

Only:

```text
@phosphoricons/react
```

should be used for standard application icons unless an explicit exception exists.

---

# 59. Animation

No animation library is required initially.

Use CSS/Tailwind and existing shadcn behavior for normal interface transitions.

A dedicated animation library may only be introduced if a real product requirement exists.

---

# 60. Drag and Drop

No drag-and-drop package should be installed initially.

If a future feature requires drag-and-drop, select a maintained library after evaluating:

- Accessibility
- Mobile support
- React/Next.js compatibility
- Performance
- Maintenance

---

# 61. Rich Text Editor

No rich text editor should be installed initially.

Install one only if a feature explicitly requires rich text content.

---

# 62. Maps

No mapping library should be installed initially.

Maps are not part of the core student management baseline.

---

# 63. Internationalization

No i18n package should be installed unless multilingual UI becomes an approved requirement.

If multilingual support is required, the selected solution must be compatible with Next.js routing and server rendering.

---

# 64. Testing Stack

## Unit / Integration

Recommended:

```text
Vitest
```

## Component Testing

Use Testing Library where component-level testing provides value:

```text
@testing-library/react
@testing-library/jest-dom
```

## E2E

```text
Playwright
```

---

# 65. Testing Dependency Baseline

Recommended development dependencies:

```text
vitest
@vitejs/plugin-react
@testing-library/react
@testing-library/jest-dom
@testing-library/user-event
playwright
```

Exact package requirements must be validated against the selected framework/tool versions during installation.

---

# 66. ESLint

ESLint is mandatory.

Purpose:

- Code quality
- Error detection
- Consistency
- React/Next.js rules
- Prevention of common mistakes

---

# 67. Prettier

Prettier should be used for consistent formatting.

Recommended configuration:

```text
.prettierrc
.prettierignore
```

Do not use multiple formatters for the same source files.

---

# 68. Git Hooks

Git hooks may be implemented using an appropriate lightweight tool if the project requires local pre-commit validation.

The hook should not make development unnecessarily slow.

CI remains authoritative.

---

# 69. Docker

Docker is part of the deployment baseline where the chosen hosting architecture requires containerization.

Typical services may include:

```text
Application
PostgreSQL
```

Additional infrastructure such as Redis should only be added when required.

---

# 70. Docker Compose

Docker Compose may be used for local development when multiple services are required.

Example:

```text
web
postgres
```

Additional services should not be added without a requirement.

---

# 71. Redis

Redis is **not mandatory for initial installation**.

It should be introduced only when the project requires:

- caching
- rate limiting
- queues
- distributed locks
- background jobs

Do not install Redis merely because it is common in scalable systems.

---

# 72. Queue System

Kafka is **not part of the initial dependency stack**.

The Scholars Student Management System does not require distributed event streaming merely for normal CRUD operations.

If asynchronous jobs become necessary, a simpler queue/background-job solution should be evaluated first.

---

# 73. Microservices

The initial application should not install infrastructure for microservices unless the architecture explicitly requires it.

The system should remain internally modular while avoiding unnecessary distributed-system complexity.

---

# 74. API Gateway

An API Gateway such as Kong is **not required for the initial application**.

Next.js/server infrastructure can provide the required application boundary unless an external architecture requires a dedicated gateway.

---

# 75. Monitoring

Application observability should initially use the deployment platform's available logging/monitoring capabilities plus application-level structured logging where appropriate.

Prometheus/Grafana should not be installed automatically for a small deployment.

They may be introduced when infrastructure complexity justifies them.

---

# 76. Package Classification

Dependencies must be classified as:

## Mandatory

Required for the core application.

## Feature-Required

Installed only when a feature requires them.

## Infrastructure-Required

Installed only when the deployment architecture requires them.

## Prohibited Without Approval

Technologies that add significant complexity and require architectural justification.

---

# 77. Mandatory Initial Dependencies

The initial application baseline should include the following categories.

### Runtime

```text
next
react
react-dom
```

### Database

```text
drizzle-orm
pg
```

### Validation

```text
zod
```

### Forms

```text
react-hook-form
@hookform/resolvers
```

### UI

```text
@phosphoricons/react
clsx
tailwind-merge
class-variance-authority
```

### Table

```text
@tanstack/react-table
```

### Charts

```text
recharts
```

### Date

```text
date-fns
```

### Client State

```text
zustand
```

Only if actual shared client state is required.

### Authentication

Auth.js / NextAuth-compatible packages according to the selected authentication implementation.

---

# 78. Development Dependencies

Expected development tooling includes:

```text
typescript
eslint
prettier
prettier-related configuration/plugins as required
vitest
@testing-library/react
@testing-library/jest-dom
@testing-library/user-event
playwright
```

The exact version set must be generated from the current stable compatible releases at project initialization.

---

# 79. Database Development Tools

Required:

```text
drizzle-kit
```

Recommended workflow:

```text
pnpm db:generate    # schema -> SQL migration; never touches the database
pnpm db:check       # migration-file consistency; never touches the database
pnpm db:migrate     # apply pending migrations; WRITES to the database
pnpm db:push        # sync schema directly; WRITES, local experiments only
```

The project pins these as `pnpm` scripts. `db:generate` and `db:check` are the safe
default verification path because neither connects. There is no drift-detection command:
Drizzle cannot verify a live database against the schema, so shipping a generated
migration alongside every schema edit is the control.

Commands must follow the project's pinned Drizzle version and deployment process.

---

# 80. Environment Variables

Initial environment categories may include:

```text
DATABASE_URL
AUTH_SECRET
AUTH_URL / application URL where required
```

Additional provider-specific variables should be added only when those integrations are enabled.

---

# 81. Environment Variable Rules

Every environment variable must have:

- Clear name
- Purpose
- Required/optional classification
- Example value where safe
- Environment-specific handling

`.env.example` must not contain production secrets.

---

# 82. Dependency Installation Order

The project should be initialized in the following order:

```text
1. Node.js
2. pnpm
3. Next.js
4. TypeScript
5. Tailwind CSS
6. shadcn/ui
7. Lucide
8. React Hook Form
9. Zod
10. Drizzle ORM
11. TanStack Table
12. Recharts
13. date-fns
14. Authentication
15. Zustand only if required
16. Testing tools
17. ESLint / Prettier
18. Docker configuration
19. CI configuration
```

---

# 83. shadcn Initialization

After project initialization:

```text
Initialize shadcn/ui
        ↓
Configure theme
        ↓
Configure aliases
        ↓
Install base components
        ↓
Verify rendering
        ↓
Create application-specific patterns
```

---

# 84. Import Alias

The project should use a consistent TypeScript import alias.

Recommended:

```text
@/*
```

Example:

```ts
import { Button } from "@/components/ui/button";
```

---

# 85. Component Directory

Recommended structure:

```text
src/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── shared/
│   └── features/
```

`components/ui` contains shadcn-based primitives.

Feature-specific components belong to their relevant feature/module.

---

# 86. Feature UI Rule

Do not place all components in:

```text
components/
```

without categorization.

Example:

```text
components/
├── ui/
├── layout/
├── shared/
└── features/
    ├── students/
    ├── attendance/
    ├── fees/
    ├── results/
    └── reports/
```

---

# 87. Server/Client Component Rule

Components should remain server-side by default where possible.

Use:

```text
"use client"
```

only when client-side functionality requires it.

---

# 88. UI Blocks Rule

Approved shadcn blocks should serve as:

- layout references
- starting structures
- reusable patterns

They must not determine product requirements.

Product requirements remain authoritative.

---

# 89. No UI Library Mixing Rule

Do not introduce:

```text
Material UI
Ant Design
Chakra UI
Mantine
Bootstrap
Semantic UI
```

alongside shadcn/ui unless an explicit architectural exception is approved.

The project should maintain one primary component system.

---

# 90. No Icon Library Mixing Rule

Do not add:

```text
Font Awesome
Heroicons
React Icons
Material Icons
```

merely because a particular icon is inconvenient.

Use Lucide first.

---

# 91. No CSS Framework Mixing Rule

Do not introduce another CSS framework alongside Tailwind.

---

# 92. No ORM Mixing Rule

Drizzle ORM is the approved ORM.

Do not introduce a second ORM alongside it:

```text
Sequelize
TypeORM
Knex
```

simultaneously for the same PostgreSQL database without a documented reason.

---

# 93. No Validation Library Mixing Rule

Zod is the primary validation library.

Do not introduce Yup/Joi/etc. for ordinary application validation.

---

# 94. No Form Library Mixing Rule

React Hook Form is the primary form management library.

Do not introduce Formik or another form-management library for ordinary application forms.

---

# 95. No State Library Mixing Rule

Zustand is the optional client-state solution.

Do not add Redux, MobX, Jotai, Recoil, etc. without an architectural reason.

---

# 96. Initial UI Block Inventory

The project should initially establish reusable patterns for:

```text
1. Dashboard Shell
2. Sidebar Navigation
3. Top Header
4. Page Header
5. Search Bar
6. Filter Bar
7. Data Table
8. Empty State
9. Loading State
10. Error State
11. Confirmation Dialog
12. Form Layout
13. Student Form
14. Student Detail Header
15. Statistics Card
16. Status Badge
17. Date Picker
18. Combobox
19. Pagination
20. Report Filter
```

These are patterns, not necessarily all separate components on day one.

---

# 97. Student Management UI Baseline

Required component ecosystem:

```text
Page Header
Search
Filters
Data Table
Pagination
Student Avatar
Status Badge
Dropdown Menu
Student Form
Dialog
Student Detail
Tabs
Alert Dialog
```

---

# 98. Attendance UI Baseline

Required ecosystem:

```text
Academic Context Selector
Date Picker
Student List/Table
Attendance Status Control
Bulk Action
Save Button
Success/Error Feedback
Review State
Confirmation
```

The attendance workflow must remain simple.

---

# 99. Fees UI Baseline

Required ecosystem:

```text
Student Search
Payment Form
Amount Input
Payment Method Select
Date Picker
Payment History Table
Status Badge
Receipt Action
Confirmation Dialog
```

---

# 100. Results UI Baseline

Required ecosystem:

```text
Academic Context
Student Selection
Subject/Assessment Selection
Marks Input
Validation Feedback
Results Table
Draft Status
Publish Action
Publish Confirmation
```

---

# 101. Reports UI Baseline

Required ecosystem:

```text
Report Type
Filters
Date Range
Academic Context
Generate Button
Loading State
Results Preview
Export Action
```

---

# 102. Admin UI Baseline

Administrative functionality should use:

```text
Sidebar
Breadcrumb
Page Header
Data Table
Filters
Dialog
Alert Dialog
Forms
Tabs
Badges
Dropdowns
```

---

# 103. Mobile Wrapper Technology

The web application is intended to be wrapped as a mobile application.

The preferred wrapper technology is:

```text
Capacitor
```

The web application remains the primary application codebase.

The mobile wrapper should provide native capabilities only where required.

---

# 104. Capacitor Installation Timing

Capacitor should be configured when the web application is sufficiently stable for mobile packaging.

The core web technology stack must not become dependent on native APIs unnecessarily.

---

# 105. Mobile Dependencies

Native/mobile-specific packages must only be installed when the corresponding capability is required.

Examples:

- Camera
- File system
- Push notifications
- Share
- Deep links
- Secure storage

Do not install all native plugins preemptively.

---

# 106. Dependency Approval Rule

Before introducing a new package, document:

```text
Package:
Purpose:
Why existing stack cannot solve it:
Impact:
Security considerations:
Performance considerations:
Maintenance considerations:
```

---

# 107. Version Management

Dependency versions must be controlled.

Major dependency upgrades must be evaluated for:

- breaking changes
- API changes
- security
- build compatibility
- UI changes
- database compatibility

---

# 108. Lockfile Rule

The package lockfile must be committed.

Developers must not routinely delete the lockfile to solve dependency problems.

Dependency problems must be diagnosed properly.

---

# 109. Build Verification

After the initial stack installation, the project must successfully pass:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

where those scripts are configured.

---

# 110. Initial Setup Acceptance Criteria

The technology baseline is considered initialized only when:

```text
[ ] Next.js runs
[ ] TypeScript works
[ ] Tailwind works
[ ] shadcn/ui works
[ ] Phosphor Icons works
[ ] Drizzle connects
[ ] Database migration works
[ ] Zod works
[ ] React Hook Form works
[ ] TanStack Table works
[ ] Recharts works
[ ] date-fns works
[ ] Authentication foundation is configured
[ ] ESLint passes
[ ] Prettier works
[ ] Tests execute
[ ] Production build succeeds
```

---

# 111. Final Approved Technology Stack

## Application

```text
Next.js
React
TypeScript
```

## Styling

```text
Tailwind CSS
shadcn/ui
@phosphoricons/react
```

## Forms & Validation

```text
React Hook Form
Zod
@hookform/resolvers
```

## Database

```text
PostgreSQL
Drizzle ORM
```

## Tables

```text
TanStack Table
```

## Charts

```text
Recharts
```

## Dates

```text
date-fns
```

## Client State

```text
Zustand
```

only where required.

## Authentication

```text
Auth.js / NextAuth-compatible solution
```

## Testing

```text
Vitest
Testing Library
Playwright
```

## Code Quality

```text
ESLint
Prettier
TypeScript
```

## Package Management

```text
pnpm
```

## Containerization

```text
Docker
Docker Compose
```

where required.

## Mobile Wrapper

```text
Capacitor
```

---

# 112. Explicitly Not Installed Initially

The following technologies are **not part of the mandatory initial setup**:

```text
Redux
React Query / TanStack Query
Material UI
Ant Design
Chakra UI
Bootstrap
Formik
Yup
Joi
Font Awesome
Heroicons
Drizzle
Sequelize
TypeORM
Kafka
RabbitMQ
Kong
Prometheus
Grafana
Redis
Kubernetes
Terraform
Framer Motion
Three.js
Map libraries
Rich text editors
Drag-and-drop libraries
PDF libraries
SMS provider SDKs
Push notification SDKs
```

They may be introduced later only when an actual requirement justifies them.

---

# 113. Important Clarification

"Not installed initially" does **not** mean these technologies are prohibited forever.

It means they must not become unnecessary baseline dependencies.

The project follows:

```text
Requirement
    ↓
Need identified
    ↓
Existing stack evaluated
    ↓
New dependency justified
    ↓
Dependency approved
    ↓
Installed
    ↓
Documented
```

---

# 114. Final Dependency Philosophy

The Scholars Student Management System must not become a collection of unrelated libraries.

The intended ecosystem is:

```text
                 Next.js
                    │
             ┌──────┴──────┐
             │             │
           React       Server Logic
             │             │
        shadcn/ui       Drizzle
             │             │
        Tailwind       PostgreSQL
             │
        React Hook Form
             │
            Zod
             │
     TanStack Table / Recharts
```

This provides a coherent TypeScript-first ecosystem without unnecessary infrastructure.

---

# 115. AI Coding Agent Rule

The AI coding agent must treat this document as the technology dependency baseline.

Before installing any new package, it must check:

1. Whether the package is already installed.
2. Whether the existing stack can solve the requirement.
3. Whether the package is explicitly approved.
4. Whether introducing it creates duplication.
5. Whether it affects architecture.
6. Whether it affects bundle size/performance.
7. Whether it creates security or maintenance concerns.

The AI must not install a package simply because it is familiar with it.

---

# 116. Final Rule

The project should follow:

> **One primary solution per responsibility unless a documented technical requirement demands otherwise.**

Therefore:

```text
UI       → shadcn/ui
Styling  → Tailwind
Icons    → @phosphoricons/react
Forms    → React Hook Form
Validation → Zod
Database → PostgreSQL
ORM      → Drizzle
Tables   → TanStack Table
Charts   → Recharts
Dates    → date-fns
Auth     → Auth.js / NextAuth-compatible solution
Testing  → Vitest + Playwright
Package  → pnpm
Web      → Next.js + React + TypeScript
Mobile   → Capacitor
```

This technology baseline is intended to be established **before feature implementation begins**, so that the project starts from a consistent, controlled, and reproducible development environment.

# End of Document
