/**
 * HR — employees, their employment terms, documents, leave, and salary configuration.
 *
 * `PRD.md` MODULE 8/9/13. `ADR-0002` is the constraint that shapes this file: **an employee is a
 * `User` holding an `employees` profile**, not a person table of its own. So `employees.userId` is
 * `NOT NULL` and unique, and there is no employee e-mail or password — those live on `users`, and a
 * staff member's login is the same identity an administrator would use.
 *
 * Two consequences worth stating:
 *
 * - A person who is a teacher is **one** `users` row with an `employees` row *and* a `teachers` row.
 *   Neither points at the other, and nothing may treat them as alternative sources of truth.
 * - `employees.department_id` is nullable because a school of 15 often has no departments at all.
 *   `NOT NULL` would force the institution to invent organisational structure before it exists.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  archivedAt,
  createdAt,
  currencyCode,
  currencyCodeCheck,
  description,
  moneyAmount,
  optionalMoneyAmount,
  phoneNumber,
  primaryId,
  updatedAt,
  version,
} from "./_conventions";
import {
  documentStatusEnum,
  documentTypeEnum,
  employeeStatusEnum,
  employeeTypeEnum,
  employmentTypeEnum,
  leaveRequestedByEnum,
  leaveStatusEnum,
  leaveTypeEnum,
  salaryStructureEnum,
} from "./_enums";
import { designations, departments, institutions } from "./institution";
import { users } from "./identity";
import { students } from "./student";

/**
 * `employees` — the employment record.
 *
 * `employee_code` is the institution's own staff number (EP-0007). Unique **per institution**, since
 * two institutions in a group will both start from EP-0001.
 *
 * `status` (`employee_status`) and `archived_at` are independent per `DOMAIN-MODEL.md` D-4: a
 * resigned teacher is `resigned` and not archived — their attendance history and the classes they
 * taught remain valid record for `RULES.md` §43, and archiving them would be a second, unrelated
 * statement. Archival here means "this record was a mistake".
 *
 * `joining_date` is a `date`: "joined on 1 August" is a calendar fact, and a timestamp would render as
 * the previous day for anyone east of UTC.
 */
export const employees = pgTable(
  "employees",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** `ADR-0002`: the employee *is* an authenticated user. One profile per account. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeCode: varchar("employee_code", { length: 64 }).notNull(),
    employeeType: employeeTypeEnum("employee_type").notNull(),
    employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
    status: employeeStatusEnum("status").notNull().default("active"),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    designationId: uuid("designation_id").references(() => designations.id, {
      onDelete: "set null",
    }),
    joiningDate: date("joining_date").notNull(),
    /** Set on `resigned` / `terminated` / `retired`. Distinct from `archived_at`. */
    leavingDate: date("leaving_date"),
    /** Bank/branch for payroll payouts. Operational detail, not a permission. */
    bankAccountIban: varchar("bank_account_iban", { length: 64 }),
    /** Internal emergency contact, distinct from a guardian link. */
    emergencyContactName: varchar("emergency_contact_name", { length: 160 }),
    emergencyContactPhone: phoneNumber(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("employees_user_key").on(t.userId),
    uniqueIndex("employees_institution_code_key").on(t.institutionId, t.employeeCode),
    index("employees_institution_status_idx").on(t.institutionId, t.status),
    index("employees_department_idx").on(t.departmentId),
    check(
      "employees_leaving_date_check",
      sql`${t.leavingDate} is null or ${t.leavingDate} >= ${t.joiningDate}`,
    ),
    // A leaving date without a leaving status, or a leaving status without a date, is one of the two
    // halves of an unfinished offboarding. Both are rejected here rather than in the HR use case,
    // because offboarding has three participants (HR, payroll, IT) and only one of them writes this
    // row.
    check(
      "employees_status_leaving_pair",
      sql`(${t.leavingDate} is null) = (${t.status} in ('active', 'on_leave'))`,
    ),
  ],
);

/**
 * `employee_documents` — CNIC, contract, qualification letters, medical fitness.
 *
 * `PRD.md` MODULE 8. Metadata only (`ARCHITECTURE.md` §51): `storage_key` points into the storage
 * service. `document_type` is a `pgEnum` whose `other` member exists for the local document an
 * institution requires that the list does not name.
 */
export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: primaryId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }),
    status: documentStatusEnum("status").notNull().default("pending_verification"),
    /** When it lapses, so a contract expiry surfaces before it does. */
    expiresOn: date("expires_on"),
    verifiedByUserId: uuid("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("employee_documents_employee_idx").on(t.employeeId, t.documentType),
    check(
      "employee_documents_verification_pair",
      sql`${t.status} <> 'verified' or ${t.verifiedByUserId} is not null`,
    ),
  ],
);

/**
 * `salary_structures` — what a role of employee is *supposed* to earn. `PRD.md` MODULE 9 requires both
 * a fixed and a unit-based structure.
 *
 * ## Why this is dated and separate from payroll
 *
 * `ARCHITECTURE.md` §20 separates configuration from calculation. If the current salary lived on the
 * employee, then a raise would overwrite the value that last month's payslip was computed from, and
 * re-running last month's payroll would produce a different number. So the structure rows are
 * append-only with `effectiveFrom` / `effectiveTo`, and `salary_assignments` picks the one in force on
 * a date.
 *
 * `amount` is `numeric(18,2)` with an explicit `currency` (ADR-0003). A unit-based structure stores the
 * **rate per unit** in `unitRate`; what one unit costs is an institution's policy, so it is data, not a
 * constant.
 *
 * `periodsPerDay` and `workingDaysPerMonth` exist because "monthly salary" is not a number without a
 * denominator, and two institutions define it differently. They are null for `fixed`, where the
 * denominator is irrelevant.
 */
export const salaryStructures = pgTable(
  "salary_structures",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    structure: salaryStructureEnum("structure").notNull(),
    designationId: uuid("designation_id").references(() => designations.id, {
      onDelete: "cascade",
    }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "cascade" }),
    employeeType: employeeTypeEnum("employee_type"),
    amount: moneyAmount("amount"),
    currency: currencyCode(),
    /** For `unit_based`: what one teachable period is worth. */
    unitRate: optionalMoneyAmount("unit_rate"),
    /** For `unit_based`: how many periods count as a full day, for absence deduction. */
    periodsPerDay: integer("periods_per_day"),
    workingDaysPerMonth: integer("working_days_per_month"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("salary_structures_institution_effective_idx").on(t.institutionId, t.effectiveFrom),
    index("salary_structures_designation_idx").on(t.designationId),
    currencyCodeCheck("salary_structures_currency_check", t.currency),
    check(
      "salary_structures_effective_order_check",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
    // The denominators are what make the amount mean anything, and they are only meaningful for a
    // unit-based structure. Enforced here so a unit-based row can never be saved with no divisor.
    check(
      "salary_structures_unit_based_denominators_check",
      sql`${t.structure} <> 'unit_based' or (${t.unitRate} is not null and ${t.periodsPerDay} is not null and ${t.workingDaysPerMonth} is not null)`,
    ),
    check(
      "salary_structures_unit_rate_non_negative",
      sql`${t.unitRate} is null or ${t.unitRate} >= 0`,
    ),
    check("salary_structures_positive_amount", sql`${t.amount} >= 0`),
    // At least one dimension must be given, or the structure applies to the entire institution.
    check(
      "salary_structures_has_dimension_check",
      sql`num_nonnulls(${t.designationId}, ${t.departmentId}, ${t.employeeType}) >= 1`,
    ),
  ],
);

/**
 * `salary_assignments` — which employee holds which structure, and since when.
 *
 * The employee-level counterpart of `salaryStructures`, and the row payroll actually resolves. Both
 * exist because either may be true first: a structure is defined for a designation and *then*
 * assigned, or an individual negotiates a salary that overrides the designation's.
 *
 * `overridesStructure` makes that override explicit rather than implicit. Without it, a reader could
 * not tell an assignment from an override, and "what does this role normally pay?" would be
 * unanswerable.
 */
export const salaryAssignments = pgTable(
  "salary_assignments",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    salaryStructureId: uuid("salary_structure_id").references(() => salaryStructures.id, {
      onDelete: "set null",
    }),
    /** Null uses the structure's own `amount`/`unitRate`. */
    amount: optionalMoneyAmount("amount"),
    currency: currencyCode(),
    /** `true` = this row's amounts replace the structure's, `false` = it restates them. */
    overridesStructure: boolean("overrides_structure").notNull().default(false),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    approvedByUserId: uuid("approved_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("salary_assignments_employee_idx").on(t.employeeId, t.effectiveFrom),
    uniqueIndex("salary_assignments_one_current_key")
      .on(t.employeeId)
      .where(sql`${t.effectiveTo} is null`),
    check(
      "salary_assignments_effective_order_check",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
    // Overriding requires saying what is being overridden with, or a raise becomes untraceable.
    check(
      "salary_assignments_override_requires_amount",
      sql`${t.overridesStructure} = false or ${t.amount} is not null`,
    ),
  ],
);

/**
 * `leave_types` — an institution's leave catalogue with its paid-ness.
 *
 * `PRD.md` MODULE 13 and `leave_type_enum`. `isPaid` is the fact that payroll cannot derive: whether
 * unpaid leave deducts from the salary is institutional policy, and a check on the enum cannot know
 * it. `deductsFromSalary` is separate from `isPaid` because some institutions treat unpaid leave as a
 * deduction at a flat day rate and others at an hourly one.
 *
 * A separate table rather than an enum, because leave types are institutional configuration
 * (`PRD.md` MODULE 8), and an enum would need a migration per institution per term.
 */
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    /** One of the `leave_type` values, so leave reports group consistently across institutions. */
    type: leaveTypeEnum("type").notNull(),
    isPaid: boolean("is_paid").notNull().default(true),
    deductsFromSalary: boolean("deducts_from_salary").notNull().default(false),
    /** Per-request ceiling in days. Null = unlimited. */
    maxConsecutiveDays: integer("max_consecutive_days"),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("leave_types_institution_code_key").on(t.institutionId, t.code),
    check(
      "leave_types_max_days_check",
      sql`${t.maxConsecutiveDays} is null or ${t.maxConsecutiveDays} > 0`,
    ),
  ],
);

/**
 * `leave_requests` — an application for leave, and its decision.
 *
 * `ARCHITECTURE.md` §18: an **approved** leave may become `attendance_status = 'leave'`; the request
 * itself never marks anyone absent. That separation is why this table has no attendance effect and
 * why `status` has no "leave taken" member.
 *
 * `requestedBy` is `leave_requested_by`, not a user id, because a leave is usually filed *by* someone
 * on the requester's behalf — `PRD.md` MODULE 13 says students do not file their own requests. The
 * actor is still recorded, so the row says both *whose* leave and *who filed it*.
 *
 * The subject is either a student or an employee, so exactly one of the two ids is set. Two nullable
 * FKs plus `num_nonnulls = 1` is preferable to a polymorphic `(subject_type, subject_id)` pair,
 * which would lose both referential integrity and the cascade delete.
 *
 * `fromDate` / `toDate` are dates, and `totalDays` is stored rather than computed per read because a
 * half-day policy (`countPartialDays`) makes the count institution-specific and the approved figure
 * is what payroll may later dispute.
 */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** Exactly one of these is set. */
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    status: leaveStatusEnum("status").notNull().default("pending"),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    totalDays: integer("total_days").notNull(),
    /** Half of a day still counts, per institution policy. */
    countPartialDays: boolean("count_partial_days").notNull().default(true),
    reason: text("reason").notNull(),
    requestedBy: leaveRequestedByEnum("requested_by").notNull().default("guardian"),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true, precision: 3 }),
    decisionNotes: text("decision_notes"),
    /** Set once the approved leave has actually been applied to attendance. */
    appliedToAttendanceAt: timestamp("applied_to_attendance_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("leave_requests_institution_status_idx").on(t.institutionId, t.status, t.fromDate),
    index("leave_requests_student_idx").on(t.studentId, t.fromDate),
    index("leave_requests_employee_idx").on(t.employeeId, t.fromDate),
    check("leave_requests_date_order_check", sql`${t.toDate} >= ${t.fromDate}`),
    check("leave_requests_total_days_check", sql`${t.totalDays} > 0`),
    check(
      "leave_requests_single_subject_check",
      sql`num_nonnulls(${t.studentId}, ${t.employeeId}) = 1`,
    ),
    // A decision needs an actor and an instant. Without the check, "approved" could exist with no
    // record of who approved it, which is precisely the audit gap RULES.md §51 forbids. `cancelled`
    // counts as a decision too: it is a review outcome and there are no separate cancellation
    // columns, so decided_by/decided_at carry the actor for it as well.
    check(
      "leave_requests_decision_pair",
      sql`${t.status} in ('pending') or (${t.decidedByUserId} is not null and ${t.decidedAt} is not null)`,
    ),
    check(
      "leave_requests_rejection_notes_check",
      sql`${t.status} <> 'rejected' or ${t.decisionNotes} is not null`,
    ),
  ],
);

/**
 * `leave_attachments` — medical certificates and similar evidence.
 *
 * Metadata only. Not merged with `student_documents` because a leave certificate is evidence *about a
 * request* and must be deletable when the request is cancelled, without touching the student's file.
 */
export const leaveAttachments = pgTable(
  "leave_attachments",
  {
    id: primaryId(),
    leaveRequestId: uuid("leave_request_id")
      .notNull()
      .references(() => leaveRequests.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [index("leave_attachments_request_idx").on(t.leaveRequestId)],
);

/**
 * `employee_attendance` — staff attendance.
 *
 * Deliberately a **separate table** from `attendance_records`. Student attendance is per *section per
 * period* and is written by a floor-incharge; staff attendance is per *employee per day* and is written
 * by a biometric device. Merging them would force a wide nullable row (section OR employee, subject OR
 * none, time slot OR none) and every query would pay for the other's columns.
 *
 * A `pk_employee_day` primary key on `(employee_id, attendance_date)` is what makes a second scan of the
 * same device idempotent — `PRD.md` MODULE 34's duplicate-prevention requirement, applied to the one
 * event that arrives by push.
 */
export const employeeAttendance = pgTable(
  "employee_attendance",
  {
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    checkInAt: timestamp("check_in_at", { withTimezone: true, precision: 3 }),
    checkOutAt: timestamp("check_out_at", { withTimezone: true, precision: 3 }),
    /** `present`, `absent`, `late`, `leave` — the same vocabulary as students. */
    status: varchar("status", { length: 16 }).notNull().default("present"),
    /** `manual` or `biometric`. Staff attendance is the primary biometric use case. */
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    /** The approved leave this absence is derived from. Null for a plain absence. */
    leaveRequestId: uuid("leave_request_id").references(() => leaveRequests.id, {
      onDelete: "set null",
    }),
    markedByUserId: uuid("marked_by_user_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    primaryKey({ columns: [t.employeeId, t.attendanceDate] }),
    index("employee_attendance_date_idx").on(t.attendanceDate, t.status),
    check(
      "employee_attendance_status_check",
      sql`${t.status} in ('present', 'absent', 'late', 'leave')`,
    ),
    check("employee_attendance_source_check", sql`${t.source} in ('manual', 'biometric')`),
    check(
      "employee_attendance_leave_pair",
      sql`${t.status} <> 'leave' or ${t.leaveRequestId} is not null`,
    ),
    // Leave cannot be the basis of attendance while it is still pending (ARCHITECTURE.md §18).
    check(
      "employee_attendance_ordering_check",
      sql`${t.checkOutAt} is null or ${t.checkInAt} is null or ${t.checkOutAt} >= ${t.checkInAt}`,
    ),
  ],
);

/**
 * `employee_status_history` — employment lifecycle transitions.
 *
 * `RULES.md` §51 plus the need to answer "who approved this resignation, and when does their final
 * payroll period end?". Employment state changes the salary, the access and the reporting, so the
 * trail is not decorative.
 *
 * `to_status` on the first row is the initial appointment, which has no predecessor — hence the
 * nullable `from_status`.
 */
export const employeeStatusHistory = pgTable(
  "employee_status_history",
  {
    id: primaryId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    fromStatus: employeeStatusEnum("from_status"),
    toStatus: employeeStatusEnum("to_status").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    changedByUserId: uuid("changed_by_user_id").notNull(),
    notes: text("notes"),
  },
  (t) => [
    index("employee_status_history_employee_idx").on(t.employeeId, t.changedAt),
    check(
      "employee_status_history_no_self_transition",
      sql`${t.fromStatus} is null or ${t.fromStatus} <> ${t.toStatus}`,
    ),
  ],
);

/**
 * `hr_announcements` — HR notices pinned for staff.
 *
 * `PRD.md` MODULE 8. Separate from `notifications` because an announcement has a **lifetime** (it stays
 * pinned until it is retracted) and an audience that is resolved once, whereas a notification is
 * delivered once and may be read or ignored.
 */
export const hrAnnouncements = pgTable(
  "hr_announcements",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: jsonb("body").$type<string>().notNull(),
    /** `all`, `teachers`, `accountants`, `floor_incharges`, `designation:<id>`. Resolved to users at send. */
    audience: varchar("audience", { length: 64 }).notNull().default("all"),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
    retractedAt: timestamp("retracted_at", { withTimezone: true, precision: 3 }),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [index("hr_announcements_institution_idx").on(t.institutionId, t.publishedAt)],
);
