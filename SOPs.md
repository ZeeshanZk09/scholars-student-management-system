# Standard Operating Procedures (SOPs)

## For Software Development

**Zebotix Web & Business Automation Solutions**
_Smarter Solutions. Human Impact_

**Version:** 1.0
**Issued:** April 2025
**Maintained by:** Technical Compliance Office, Zebotix

---

# Table of Contents

1. Company Overview
2. Development SOPs
   - Project Initialization SOP
   - Frontend Development SOP

3. Frontend Coding Style Guidelines
4. Additional Backend SOPs
5. Version Control SOP
6. Code Review & Merge SOP
7. Database SOP
8. Environment Variables SOP
9. Architecture SOPs
10. Database SOP
11. Coding Style SOPs
12. Backend Directory Structure Definition
13. Deployment & CI/CD SOPs
14. Backup Management SOP
15. Disaster Recovery (DR) Management SOP
16. Team & Management SOPs
17. Monolithic System Architecture Diagram
18. Microservices System Architecture Diagram
19. Cloud Infrastructure Providers
20. Security Standards
21. Benefits of this Architecture
22. Conclusion

---

# Standard Operating Procedures (SOPs)

## Company Overview

**Industry:** Software Development

**Specialization:** Web & Mobile Development, Cloud-based Backend Systems, Microservices, Monolithic Architecture

### Tech Stack

- **Frontend:** React Native (Mobile), React + Next.js with Tailwind CSS (Web)
- **Backend:** FastAPI (Python) with Docker
- **Database:** PostgreSQL, MySQL
- **Architecture:** Monolithic & Microservices

### Purpose

The purpose of this document is to define a standardized, secure, and collaborative software development workflow at Zebotix. This SOP ensures consistency, quality, security, and scalability across projects, facilitating efficient teamwork and future maintenance.

### Scope

This SOP applies to all personnel involved in software projects, including Developers, QA Engineers, DevOps/GitOps teams, Product Designers, and Project Managers at Zebotix. It covers the full development lifecycle from project initiation to deployment and maintenance.

### Roles & Responsibilities

- **Developers:** Build and maintain code using defined guidelines and best practices.
- **QA Engineers:** Test software to ensure performance, reliability, and bug-free delivery.
- **DevOps/GitOps:** Handle deployment, environment automation, and infrastructure scalability.
- **Technical Compliance Team:** Enforce SOP adherence, perform audits, and ensure legal compliance.
- **Product & Design Teams:** Define user stories, design wireframes/UI, and ensure alignment with business goals.

---

# 1. Development SOPs

## 1. Project Initialization SOP

### Definition

This SOP explains how to begin a new software project in a clean, organized, and professional way. The goal is to make sure every project starts with the same standard steps so that any team member can understand, maintain, or contribute to the project easily—whether today or months later.

### Objective

To ensure that all teams (frontend, backend, DevOps, etc.) start their work the same way, reducing confusion and increasing efficiency. This also helps new team members get up to speed quickly.

### Sub-Definitions (Step-by-Step Process)

#### 1. Repository Setup

- **What it means:** Create a new folder (called a “repository”) on GitHub or GitLab to hold all the project code.
- **Why it matters:** It allows version tracking, team collaboration, and prevents code loss.
- **What's included:**
  - Initialize Git (the tool used to manage code changes).
  - Set up the repository structure (e.g., folders for frontend, backend, assets, etc.).
  - Add a `.gitignore` file to exclude unnecessary files from being tracked.

#### 2. Documentation

- **What it means:** Write a simple README file that explains the purpose of the project.
- **Why it matters:** Anyone new can immediately understand:
  - What the project is about
  - Which technologies are used (e.g., React, FastAPI, Docker)
  - How to install and run the project

- **Tip:** Keep this document clear, concise, and up to date.

#### 3. Configuration

- **What it means:** Set up all necessary environment and development files.
- **Why it matters:** This helps run the project locally and on production servers without confusion.
- **Tasks:**
  - Create `.env` files to store important settings like database URLs, API keys (without hardcoding them).
  - Set up Docker or Docker Compose so the app can run in a consistent environment across different systems.
  - Define any required ports, services, or volumes.

#### 4. Code Hygiene

- **What it means:** Set up automatic tools that check and format the code to follow best practices.
- **Why it matters:** Clean, well-formatted code is easier to read, understand, and maintain.
- **What to set up:**
  - Linters (like ESLint for JavaScript, Flake8 for Python) to catch code errors and enforce style rules.
  - Formatters (like Prettier or Black) to keep code formatting consistent.
  - Add pre-commit hooks (optional) to automatically run checks before code is committed.

---

## 2. Frontend Development SOP

### Definition

This SOP outlines best practices for building the user-facing parts of both mobile and web apps. The goal is to maintain consistency, performance, and quality across all frontend projects.

### Objective

To ensure a clean structure and predictable behavior in code, design, and API connections, so developers can collaborate easily and deliver a smooth user experience.

### Sub-Definitions (Platform-Specific Practices)

#### Mobile Development (React Native)

- **Coding Standards:** Follow React Native patterns using functional components and hooks.
- **State Management:** Use tools like Redux or Context API to manage app data.
- **Styling Techniques:** Use consistent styling with libraries like styled-components or tailwind-rn.

#### Web Development (Next.js + Tailwind CSS)

- **Folder Structure:** Organize files into components, pages, styles, and services.
- **Routing:** Use clean URLs and organize routes clearly in the `pages/` directory.
- **Styling:** Use Tailwind CSS for layout and design consistency.
- **API Integration:** Store all external API functions in one folder and use `.env` for secrets.

---

# Frontend Coding Style Guidelines

## 1. Variable Naming Conventions

- Use CamelCase or PascalCase to write variables.
  - Example: `userData`, `UserProfile`

- Use prefixes for clarity:

| Prefix | Meaning                | Example          |
| ------ | ---------------------- | ---------------- |
| `vg`   | Global Variable        | `vgThemeColor`   |
| `obj`  | Object (data group)    | `objUserDetails` |
| `cls`  | Class (template/model) | `clsInvoice`     |
| `ar`   | Array (list of items)  | `arProductList`  |
| `list` | List                   | `listOfUsers`    |
| `tup`  | Tuple (fixed values)   | `tupCoordinates` |

- Avoid meaningless names like `x`, `data1`, `temp`.
- Use clear names like `userEmail`, `invoiceAmount`.

## 2. Component Naming

- Always start component names with Capital letters.
- E.g., `UserCard`, `LoginModal`
- Use names that clearly describe what the component does.

## 3. Asset Management

Organize media files and styles neatly:

| Type       | File Formats                    |
| ---------- | ------------------------------- |
| Animations | `.svg`, `.gif`, `.avi`          |
| Images     | `.jpg`, `.jpeg`, `.png`, `.bmp` |
| Fonts      | `.ttf`, `.otf`                  |
| Videos     | `.mp4`, `.mkv`                  |
| Sound      | `.wav`, `.mp3`                  |
| CSS Files  | Grouped by feature or component |

### Sub-Definitions (Core Development Standards)

#### 1. Routing (API Endpoints Design)

- **What it is:** Routing defines how the backend handles requests (like login, signup, fetch data).
- **Best Practices:**
  - Use modular structure: Keep routes organized in separate files/modules for clarity.
    - **FastAPI:** Use `APIRouter` for route groups (e.g., `user_routes.py`)
    - **Laravel:** Use route groups with controllers.
    - **Express.js:** Use Router instances per feature.

  - Use RESTful naming: `/users`, `/products`, `/login` instead of `/getData`.

#### 2. Validation (Data Checking)

- **What it is:** Before saving or processing user input, it must be checked for format, type, and rules.
- **Best Practices:**
  - **Python:** Use Pydantic models to validate and define data types.
  - **Node.js:** Use Joi or Yup for schema validation.
  - **PHP:** Use Form Request classes in Laravel to define required fields.

#### 3. Configuration Management

- **What it is:** Managing sensitive data like passwords, database URLs, and API keys.
- **Best Practices:**
  - Store secrets in `.env` files, never hardcode them in your code.
  - Use secret managers or Docker secrets in production (e.g., AWS Secrets Manager, HashiCorp Vault).
  - Create a `.env.example` for developers to follow during setup.

#### 4. Containerization with Docker

- **What it is:** Packaging the app with all dependencies to run anywhere.
- **Best Practices:**
  - Use multi-stage builds to reduce image size (build in one stage, run in another).
  - Keep Dockerfile clean and readable (only install what’s needed).
  - Use `.dockerignore` to avoid copying unnecessary files (e.g., `node_modules`, `.git`).

---

# Additional Backend SOPs

## 5. Backend Testing SOP

- **Unit Tests:** Write tests for individual functions.
- **Integration Tests:** Check how different parts of the backend work together.
- **Use tools like:**
  - Pytest (Python)
  - Jest (Node.js)
  - PHPUnit (Laravel)

## 6. Logging SOP

- Use structured logging for all backends.
  - **Python:** Use logging or loguru
  - **Node.js:** Use winston or pino
  - **Laravel:** Use built-in logging channels

- Log these events:
  - Errors and exceptions
  - API requests (optional)
  - User actions (e.g., login attempts)

## 7. Authentication & Authorization SOP

- Use JWT (JSON Web Tokens) for managing secure login sessions.
- Validate tokens on each request.
- Define user roles (e.g., admin, user) and protect routes accordingly.
- Protect sensitive endpoints using middleware or decorators.

## 8. Performance Optimization SOP

- Use async code where supported (e.g., `async def` in FastAPI).
- Optimize database queries (e.g., avoid N+1 queries).
- Add caching for frequent queries using Redis or in-memory solutions.
- Monitor response times using APM tools (e.g., Datadog, New Relic).

---

# 4. Version Control SOP

### Definition

This SOP explains how to track and manage changes in the project’s source code using Git, a version control system.

### Objective

To make sure that all team members follow the same structure when working with Git, so everyone can collaborate smoothly and code can be tracked, reviewed, and rolled back if needed.

### Sub-Definitions

#### Branching Strategy

- `main`: Stable production-ready code.
- `dev`: Latest development changes; not yet finalized.
- `feature/xyz`: For new features (e.g., `feature/login-screen`).
- `bugfix/xyz`: For fixing bugs (e.g., `bugfix/image-not-loading`).

#### Commit Messages

Use a clear and descriptive format, like:

- `feat: added search functionality`
- `fix: corrected user login error`
- `docs: updated README file`

Avoid vague messages like `update` or `changed stuff`.

---

# 5. Code Review & Merge SOP

### Definition

This SOP ensures that all code is reviewed before being merged into the main branch to maintain quality and prevent bugs.

### Objective

To promote team collaboration, knowledge sharing, and error prevention through a standard review process.

### Sub-Definitions

#### Review Process

- All changes should be pushed via Pull Requests (PRs).
- PRs should contain:
  - Clear description of what was changed
  - Screenshots or test results (if applicable)

#### Approval Requirements

- At least one team member must review and approve the PR.
- For critical changes, require two reviewers.

#### Validation Before Merge

- Ensure code passes automated lint checks (code style rules).
- Run tests to make sure no new issues are introduced.

---

# 6. Database SOP

### Definition

This SOP outlines how to design, update, document, and protect databases used in our apps.

### Objective

To ensure our databases are structured properly, easily maintained, and securely backed up.

### Sub-Definitions

#### Migrations

- Use migration tools (like Alembic, Sequelize, Laravel Migrations) to apply schema changes safely.
- Never change the database manually in production.

#### Documentation

Keep a diagram or markdown document showing:

- Tables
- Relationships
- Important fields

Update this whenever the schema changes.

#### Backups

- Schedule daily automated backups.
- Store backups securely (preferably on a separate storage system or cloud).

---

# 7. Environment Variables SOP

### Definition

This SOP explains how to manage application settings and secrets, like API keys and database URLs, across different environments (local, staging, production).

### Objective

To securely separate configurations from the main code and prevent sensitive data exposure.

### Sub-Definitions

#### `.env` Management

- Use `.env` files to store environment-specific settings (e.g., `DB_URL`, `API_KEY`, `PORT`).
- Share a `.env.example` file for developers to replicate settings locally.

#### Secrets Handling

In production, use secure methods like:

- Docker secrets
- HashiCorp Vault
- AWS/GCP Secrets Manager

Never commit actual `.env` files to Git.

---

# 8. Architecture SOPs

### Definition

This SOP defines how we design and organize our application systems — whether it’s a single app or a group of apps that talk to each other.

### Sub-Definitions

#### Monolithic Architecture

- All features live in one codebase.
- Shares a single database.
- Easy to set up and deploy.
- Suitable for small to medium-sized applications.

#### Microservices Architecture

- System is split into independent services (e.g., auth, billing, analytics).
- Each service has its own database and logic.
- Services communicate through APIs or message queues (like Kafka, RabbitMQ).
- Ideal for large or growing applications needing flexibility and scale.

---

# Database SOP

## Purpose

To define the standard structure, indexing logic, and naming conventions for all databases used in Zebotix applications, ensuring data consistency, fast access, and long-term maintainability.

## Indexing & Key Standards

- Every table must include a Primary Key named as the table name followed by `_id` (e.g., `user_id`, `order_id`).
- Use Foreign Keys with naming convention `{referenced_table_name}_id` to maintain relational integrity.
- Apply Composite Keys on tables with frequent multi-field searches (e.g., `amount + date`, `description + type`).
- Identify high-frequency query columns (e.g., `user_id`, `status`, `created_at`) and create indexes on them.
- Create indexes on important filters like date, amount, status, and fields with frequent search operations.
- Use partial indexes or GIN indexes (in PostgreSQL) for full-text search and JSONB data types.

## Naming Conventions

- All table and column names must be meaningful, lowercase, and in `snake_case`.
  - Examples: `user_id`, `created_at`, `payment_amount`

- Table names should be plural (e.g., `users`, `orders`, `transactions`).
- **System Tables:** Tables saving system-related information must have prefix `sys_` (e.g., `sys_logs`, `sys_settings`).
- **Parameter Tables:** Tables storing configuration parameters must have prefix `p_` (e.g., `p_payment_modes`, `p_status_codes`).
- **User Management Tables:** Tables related to user accounts and permissions must have prefix `um_` (e.g., `um_users`, `um_roles`).
- **Settings Tables:** Tables related to system settings must have prefix `set_` (e.g., `set_preferences`, `set_notifications`).

## Data Type Guidelines

- amount / price → Use `DECIMAL(10,2)` for financial accuracy.
- timestamp fields → Use `TIMESTAMP` with `DEFAULT NOW()` for creation and update tracking.
- textual data → Use `TEXT` for long description fields.
- status / flags → Use ENUM or validated VARCHAR fields.
- Use appropriate BOOLEAN, INTEGER, UUID types based on the data model.

## Metadata Standards

Every table must include columns for auditing:

- `added_by` (user who created the record)
- `updated_by` (user who last modified the record)

## Review & Optimization

- Perform `EXPLAIN ANALYZE` on all major queries to validate performance.
- Avoid `SELECT *` in production queries to minimize overhead.
- Partition historical data in high-growth tables based on month/year.
- Schedule regular index maintenance (`REINDEX / VACUUM ANALYZE` for PostgreSQL).
- Continuously monitor slow query logs and optimize as necessary.

---

# 6. Coding Style SOPs

### Definition

Guidelines to maintain consistent code structure, naming conventions, and resource management across all projects.

## Variable Naming Conventions

- Camel Case / Pascal Case: Start variables with `v`
- Prefixes:
  - `vg` for Global Variable
  - `obj` for Objects
  - `cls` for Classes
  - `ar` for Arrays
  - `list` for Lists
  - `tup` for Tuples

- Use meaningful names for all variables.

## Component Naming (Frontend)

- Components should start with Capital letters.
- Use meaningful, self-descriptive names.

## Tech Stack

- Python (FastAPI)
- React (Next.js)
- React Native

## Asset Management

- Animations: SVG, GIF, AVI
- Images: JPG, JPEG, PNG, BMP
- Fonts: TTF, OTF
- Videos: MP4, MKV
- Sound: WAV, MP3
- CSS Files: Organized by feature or component

---

# 7. Backend Directory Structure Definition

## FastAPI (Python) Standard Directory Structure

```text
backend/
│
├── app/ # Main backend source code folder
│ ├── __init__.py # Marks directory as a Python package
│ ├── main.py # FastAPI app instance, include routers
│ ├── settings.py # Configuration via `.env` (Pydantic)
│ ├── database.py # DB connection and session handling
│ └── apis/ # Organized route modules
│ ├── common/ # Shared endpoints (e.g., /health, /logs)
│ ├── features/ # Business logic APIs (e.g., users, orders)
│ └── admin/ # Admin-specific APIs (e.g., roles, permissions)
│
├── .env # Environment configuration (DB_URL, SECRET_KEY)
├── pyproject.toml # Project dependencies (Poetry/PDM)
├── README.md # Project documentation
├── upload/ # Temporary file upload storage
└── tests/ # Unit and integration tests
```

### Additional Notes

- `upload/`: For CSVs, images, PDFs — cleaned via cron job or on file process.
- `tests/`: Should mirror `app/` for module-wise coverage.

---

## Express.js (Node.js) Directory Structure

```text
express-backend/
│
├── src/ # Main source code
│ ├── index.js # App entry point
│ ├── config/ # DB config, CORS, etc.
│ ├── routes/ # Route definitions (auth, users)
│ ├── controllers/ # Handles logic after route hit
│ ├── middlewares/ # Auth, validation, error handlers
│ ├── models/ # Mongoose/Sequelize schemas
│ └── utils/ # Utility/helper functions
│
├── .env # Environment variables
├── package.json # Node package manager
├── README.md # Documentation
├── uploads/ # Temp file storage
└── tests/ # Jest or Mocha tests (mirrors src/)
```

## Laravel (PHP) Directory Structure

```text
laravel-backend/
│
├── app/ # Application logic (Controllers, Models, Middleware)
│ ├── Http/
│ │ ├── Controllers/ # Handles API logic
│ │ └── Middleware/ # HTTP middleware (auth, verify, etc.)
│ ├── Models/ # Eloquent models
│ └── Providers/ # App service providers
│
├── bootstrap/ # Autoloading (Laravel start file)
├── config/ # Configuration files (auth, mail, database)
├── database/ # Migrations and seeders
├── public/ # Entry point (index.php), public assets
├── resources/ # Views (Blade), language files
├── routes/ # Route definitions (api.php, web.php)
├── storage/ # Logs, uploads, sessions
├── tests/ # PHPUnit-based test cases
├── .env # Environment variables
├── composer.json # Composer dependencies
└── README.md # Setup and usage
```

### Other Notes

- `routes/api.php`: Contains all API route definitions.
- `storage/`: Stores uploads, logs, compiled views.
- `tests/`: Organized for feature and unit test cases.

---

# 8. Deployment & CI/CD SOPs

## 1. Docker & Containerization SOP

### Definition

This SOP outlines how we use Docker to "containerize" our apps. Containerization means packaging an app with everything it needs so it can run the same way anywhere—on any server or developer’s machine.

### Sub-Definitions

#### Build Process

- Use multi-stage builds to keep the final Docker image light and secure.
- First stage: Install and build the app.
- Final stage: Copy only the needed files to run the app.

#### Image Optimization

- Avoid unnecessary packages in Docker images.
- Use `.dockerignore` to exclude unwanted files (e.g., logs, local cache).
- Regularly scan images for vulnerabilities.

## 2. CI/CD SOP (Continuous Integration & Continuous Deployment)

### Definition

This SOP explains how we automatically test, build, and deploy our apps whenever a team member makes a change.

### Sub-Definitions

#### Tools Used

- Use tools like GitHub Actions or GitLab CI/CD to create pipelines for automated processes.

#### Stages

- **Staging Environment:** For testing; similar to the live app but not visible to end users.
- **Production Environment:** The final live version used by customers.

## 3. Server Management SOP

### Definition

This SOP outlines how to securely manage and maintain servers that host our applications.

### Sub-Definitions

#### Security Setup

- Enable firewalls to block unwanted access.
- Use SSH key-based login (no passwords) for secure access.

#### Maintenance

- Regularly update operating systems and packages.
- Monitor disk space, memory, and CPU usage.

## 4. Monitoring & Logging SOP

### Definition

This SOP ensures we always know if our app is working well and helps us find out why something failed.

### Sub-Definitions

#### Tools

- Use tools like Grafana, Prometheus, Loki, or Datadog to monitor server health and application performance.

#### Logging Standards

- Log important events (errors, user actions).
- Use structured log formats (JSON, timestamps).
- Set up log retention policies (e.g., keep logs for 30 days).

---

# 9. Backup Management SOP

## Purpose

To ensure secure, reliable, and regular backups of all critical systems and data to protect against data loss due to hardware failure, accidental deletion, or cyber-attacks.

## Scope

Applies to all production databases, application servers, media storage, configuration files, and internal documentation repositories.

## Backup Strategy

- **Full Backups:** Performed every Sunday night for all systems.
- **Incremental Backups:** Taken daily, storing only the data changed since the last full or incremental backup.
- **Configuration Backups:** Includes `.env`, Docker volumes, API keys, FastAPI settings, etc.
- **Database Snapshots:** PostgreSQL (using `pg_dump`), MySQL (using `mysqldump` or `xtrabackup`) taken every 6 hours.

## Backup Frequency Table

| Backup Type        | Frequency       | Retention | Location(s)                       |
| ------------------ | --------------- | --------- | --------------------------------- |
| Full Backup        | Weekly (Sunday) | 4 weeks   | Encrypted local + cloud storage   |
| Incremental Backup | Daily           | 7 days    | Cloud bucket (S3/Backblaze)       |
| Config Files       | Weekly          | 2 months  | GitLab Private Repo + Cloud Vault |
| DB Snapshots       | Every 6 hours   | 3 days    | Local NAS + MinIO offsite server  |

## Tools & Technologies

- **Backup Tools:** Restic, Rclone, Rsync, Velero (K8s), pgBackRest
- **Storage Solutions:** AWS S3, Hetzner Storage Box, MinIO, Onsite NAS
- **Encryption:** AES-256 encryption applied to all backups before transmission.

## Backup Process

1. Initiate scheduled cron jobs (or GitLab CI/CD pipelines).
2. Monitor via backup status dashboard.
3. Log backup status & alerts in centralized logging tool (Grafana/Prometheus/Elastic).
4. Notify DevOps via email/Slack if failure detected.

## Testing

- Perform restore tests monthly using random data snapshots.
- Document the time taken and success rate.

---

# 10. Disaster Recovery (DR) Management SOP

## Purpose

To provide a structured plan to restore operations in case of major service interruptions or disasters (e.g., fire, hardware failure, DDoS attack, ransomware).

## Scope

Applies to all production systems, including API servers, databases, DNS, media servers, cloud assets, and internal tools.

## Objectives

- **RTO (Recovery Time Objective):** 2 hours max for core applications
- **RPO (Recovery Point Objective):** Max 6 hours of data loss accepted

## DR Triggers

- Complete data center outage
- Critical database corruption
- Loss of production DNS or API Gateway
- Security breach or ransomware attack

## DR Plan Activation

1. Incident identified by monitoring (Datadog/Prometheus/NewRelic).
2. DR Manager verifies incident severity.

## Recovery Steps

1. Restore recent backup (from cloud/offsite storage).
2. Redeploy containerized services using IaC (Terraform/Ansible).
3. Test core functionality (API, login, file access).
4. Update DNS/load balancer to point to restored cluster.
5. Inform users and log recovery timeline.

## DR Tools

- **Infrastructure-as-Code:** Terraform, Ansible
- **Version Control:** Git, GitLab backup recovery
- **Failover/Redundancy:** Load Balancers, Floating IPs
- **Cloud Snapshots:** AWS EBS, Hetzner Volume Snapshots

## Post-DR Actions

- Conduct postmortem analysis.
- Identify root cause and improve weak areas.
- Document and update SOP.

## Testing & Simulation

- Run DR simulation drills quarterly.
- Verify both manual and automated recovery workflows.
- Track drill time, RTO/RPO results, and team respons.

---

# 11. Team & Management SOPs

## 1. Task Assignment & Tracking SOP

### Definition

This SOP explains how to assign and monitor work tasks using digital tools.

### Sub-Definitions

#### Tools

- Use platforms like Jira, Notion, or ClickUp to manage tasks and track progress.

#### Linkage

Every task should be linked to:

- a branch (in Git)
- a pull request
- or a code commit

## 2. Client Communication SOP

### Definition

This SOP ensures regular and structured communication with clients throughout a project.

### Sub-Definitions

#### Update Cycle

- Conduct weekly meetings to share progress, challenges, and next steps.

#### Feedback Documentation

- Record all feedback and decisions in PM tools like Notion or ClickUp for future reference.

## 3. Internal Meeting SOP

### Definition

This SOP outlines how our team conducts internal meetings to stay aligned and organized.

### Sub-Definitions

#### Standups

- Daily 15-minute team meetings to share:
  - What was done yesterday
  - What’s being done today
  - Any blockers or issues

#### Reviews

- Monthly retrospectives to evaluate:
  - What went well
  - What can be improved
  - Team feedback.

## 4. Leave Policy SOP

### Definition

This SOP outlines how team members can request time off and how it gets approved.

### Sub-Definitions

#### Request Method

- Submit leave requests via Slack, Google Sheets, or an HR portal/tool.

#### Approval Workflow

- Requests must be approved by both the Manager and the HR representative.

## 5. Onboarding SOP

### Definition

This SOP explains the process for introducing new employees to the company tools, practices, and projects.

### Sub-Definitions

#### Documentation

Provide a welcome kit including:

- Access guide to tools (GitHub, Slack, Jira)
- Coding standards
- Project overview

#### Access Provisioning

Grant access to:

- Slack channels
- GitHub repositories
- Development or staging environments.

## 6. Offboarding SOP

### Definition

This SOP outlines the steps taken when an employee is leaving the company.

### Sub-Definitions

#### Access Revocation

Remove the employee from:

- GitHub
- Slack
- Servers and dashboards

#### Knowledge Transfer

Ensure the employee hands over:

- Ongoing tasks
- Credentials
- Project notes

## 7. Security SOP

### Definition

This SOP outlines our policies to protect data and systems from unauthorized access or misuse.

### Sub-Definitions

#### Authentication

- Use Multi-Factor Authentication (MFA) for all critical tools.
- Encourage use of password managers (e.g., Bitwarden, LastPass).

#### Data Protection

All sensitive data must be:

- Encrypted in transit (e.g., HTTPS)
- Encrypted at rest (e.g., database encryption)
- AES-256 encryption
- 2FA for all services
- Align with GDPR, PDPL, PECA 2025.

---

# 12. Monolithic System Architecture Diagram

# Monolithic Architecture Flow – Step-by-Step Breakdown

## 1. Developer

### Role

Developers are responsible for designing, building, testing, and maintaining both frontend and backend parts of the application.

### Tools

- **Code Editors:** VSCode, WebStorm, PyCharm
- **Version Control:** Git (with GitHub, GitLab, Bitbucket)
- **Languages:** JavaScript, TypeScript, Python, PHP, Java, Go
- **Collaboration:** Slack, Notion, Jira

### Responsibility

- Write clean, testable, and maintainable code.
- Coordinate with team leads and UI/UX designers.
- Commit code regularly to Git repositories.

## 2. Define API (Using OpenAPI & Postman)

### Purpose

Before development, teams must agree on how different services will communicate via APIs. This ensures everyone works with the same assumptions.

### Tools

- **OpenAPI / Swagger:** Define and visualize REST APIs.
- **Postman:** Test and document APIs with example requests/responses.
- **AsyncAPI (optional):** For event-driven architecture.

### Best Practices

- Define API contracts first (endpoint names, input/output formats).
- Share API specs with frontend & backend teams.
- Use schema validators to ensure adherence.

---

## 3. Microservices

### Purpose

Break the application into small, independent services, each responsible for a specific business capability (e.g., user service, payment service).

### Technologies

- **FastAPI (Python):** Lightweight, async-ready REST API framework.
- **Node.js + Express / NestJS:** Modular backend JavaScript frameworks.
- **Laravel (PHP):** MVC framework with built-in routing, migrations, etc.
- **Spring Boot (Java):** Robust framework for enterprise-scale APIs.

### Characteristics

- Each service can be developed, deployed, and scaled independently.
- Services communicate via REST APIs or message queues (Kafka, RabbitMQ).
- Each microservice can use its own database.

---

## 4. Develop UI

### Objective

Build interfaces for end-users to interact with the backend system through web or mobile platforms.

### Web Stack

- **React + Next.js:** For server-side rendering, static generation, routing
- **Tailwind CSS:** Utility-first styling framework
- **Redux / Zustand:** State management

### Mobile Stack

- **React Native:** Write once, deploy on both iOS and Android
- **Expo:** Toolchain for React Native development

### Notes

- UI interacts with APIs defined earlier.
- Ensure responsive design & accessibility.

---

## 5. API Gateway

### Purpose

Central entry point for all microservices. It routes, secures, and monitors all incoming requests.

### Tools

- **Kong:** Open-source API gateway
- **AWS API Gateway:** Managed gateway for serverless apps
- **Nginx / Traefik:** Lightweight reverse proxy and load balancer

### Features

- Authentication (e.g., JWT tokens, OAuth)
- Rate limiting, request validation
- Logging and analytics

## 6. Testing

### Objective

Ensure that services and UI behave as expected in all conditions.

### Types of Testing

- **Unit Testing:** Validate logic in functions/classes
- **Integration Testing:** Ensure modules communicate correctly
- **End-to-End (E2E) Testing:** Test full user flow (e.g., login to checkout)

### Tools

- Jest / Mocha / Chai (Node.js)
- Pytest / unittest (Python)
- PHPUnit (Laravel)
- Cypress / Selenium (UI automation)

## 7. Jenkins – CI/CD Pipeline

### Purpose

Automate build, test, and deploy processes for every code change.

### CI/CD Stack

- Jenkins: Open-source automation tool
- GitHub Actions / GitLab CI: Integrated with code hosting
- SonarQube: Code quality checks
- Docker Build & Push: Integrated with Jenkins pipeline

### Workflow

1. Developer pushes code → Triggers Jenkins pipeline.
2. Jenkins runs tests and builds Docker image.
3. Deploys to staging or production if tests pass.

---

## 8. Docker – Containerization

### Purpose

Package code + dependencies into containers to ensure the "it works on my machine" problem is eliminated.

### Tools

- Docker CLI / Docker Compose
- Dockerfile: Defines build instructions
- Docker Hub / GitHub Container Registry: Store and retrieve images

### Benefits

- Run anywhere: dev, staging, prod
- Isolated environments
- Faster deployments

## 9. Deploy

### Final Goal

Push the Dockerized app into a live environment where users can interact with it.

### Environments

- **Staging:** For internal QA/testing
- **Production:** For end-users

### Cloud Platforms

- AWS ECS / EKS, Azure AKS, GCP GKE
- Heroku / Vercel / Netlify (frontend apps)
- Kubernetes for advanced orchestration (if scaling is required).

---

# 13. Microservices System Architecture Diagram

# Microservices Architecture Flow – Step-by-Step Breakdown

## Step 1: API Gateway & CDN Integration

### Component Involved

- API Gateway
- Cloudflare CDN
- Client App (Web + Mobile)

### Details

- All requests from users go through the API Gateway, which acts as the unified entry point for the system.
- It performs authentication, request validation, and routing to internal services.
- Cloudflare CDN is placed in front of the gateway for:
  - DDoS protection
  - Intelligent routing and caching
  - Improved response time through edge servers

- Supported clients include mobile apps, web dashboards, and admin panels.

## Step 2: Load Balancer & Service Discovery

### Component Involved

- Load Balancer (Nginx)
- Service Registry
- Admin Panel

### Details

- Requests are forwarded to the internal Load Balancer, which routes traffic to the appropriate microservice instances.
- Nginx acts as the HTTP reverse proxy for managing SSL, compression, and routing rules.
- Services are dynamically registered and discovered through the Service Registry, allowing auto-scaling and fault tolerance.
- The Admin system can manage service lifecycle, logs, and perform scaling or health check tasks.

---

## Step 3: Microservices / Service Layer

### Component Involved

- Service A (e.g., User/Authentication Service)
- Service B (e.g., Business Logic/Processing)
- Third-Party API Integrations

### Details

- All business logic is encapsulated into stateless microservices.
- Service A handles core functionalities like user authentication, registration, session management.
- Service B handles processing-heavy business logic, workflow orchestration, or transaction pipelines.
- Integration with third-party APIs is isolated to a dedicated service boundary for security and maintenance.
- These services can be containerized and deployed across different environments (AWS/GCP).

## Step 4: Authorization Server

### Component Involved

- OAuth2 / JWT Authorization Server
- Admin Identity Management

### Details

- A dedicated Authorization Server manages token generation, validation, role-based access control (RBAC), and session lifecycle.
- Users (Admin and Clients) must pass token validation before accessing internal APIs.
- Supports integration with identity providers like Google, Microsoft Azure AD, and internal SSO systems.

## Step 5: Redis Caching Layer

### Component Involved

- Redis Cache Server

### Details

- To reduce response time and database load, frequently accessed data is cached in Redis.

### Use Cases

- Caching user sessions and tokens
- Storing temporary computations (e.g., OTPs)
- Queueing short-term data before Kafka publishing
- Redis supports automatic TTL and replication for fault tolerance.

## Step 6: Database Layer (With Replication)

### Component Involved

- Primary and Replica Databases
- Database Replication

### Details

- Application data is stored in relational or NoSQL databases, depending on the use case.
- Replication is enabled to:
  - Ensure high availability
  - Provide a fallback in case of primary DB failure
  - Enable read/write separation for performance

- Multiple database nodes operate under automatic failover mechanisms.

## Step 7: Distributed Messaging with Kafka

### Component Involved

- Apache Kafka

### Details

- All event-driven tasks and asynchronous jobs are processed via Kafka distributed messaging.
- Examples include:
  - Order processing
  - Notification systems
  - Logging and audit trails

- Kafka ensures message durability, event ordering, and high throughput for streaming pipelines.

## Step 8: Monitoring, Alerts & Visualization

### Component Involved

- Prometheus
- Grafana
- Metrics Exporters

### Details

- Prometheus scrapes metrics from all services, infrastructure, and API layers.
- Grafana Dashboards visualize:
  - CPU, memory, disk utilization
  - Request per second (RPS)
  - Latency, error rates, service health

- Alerts are set up for threshold breaches, errors, and outages using Slack/Email integrations.

---

# 13. Cloud Infrastructure Providers

- Primary deployments occur across AWS and Google Cloud Platform, giving access to global regions, auto-scaling, VPCs, and managed services.
- Kubernetes (K8s) clusters manage container orchestration.
- Static assets are served using Cloudflare CDN for faster load times worldwide.

# 14. Security Standards

- JWT for secure user sessions
- HTTPS enforced end-to-end
- Firewall rules and access lists
- OAuth2.0-based access flows
- Audit logs stored and monitored

# 15. Benefits of this Architecture

- Horizontal Scalability
- Fault Tolerance
- Independent Deployability
- Secure & Performant
- Observable & Maintainable

# 16. Conclusion

The proposed architecture empowers Zebotix to build and deploy scalable, cloud-native applications that are both modular and high-performing. By embracing this approach, we ensure faster feature rollouts, enhanced system reliability, and a seamless user experience—all while upholding the highest standards of security, performance, and maintainability in enterprise environments.
