/**
 * Teacher profiles and the teaching assignments that define their scope.
 *
 * `ADR-0002` is the whole story here: **a teacher is a `User` holding a `teachers` profile**, not a
 * subclass of `employees` and not a parallel person table. The archived design made
 * `Teacher extends Employee` with a foreign key to `users`, which meant a teacher row could not exist
 * without an employee row and therefore could not be created for a visiting faculty member who had no
 * employment record.
 *
 * The fix is three independent tables that reference `users` and nothing but `users`:
 *
 * | Table | Meaning | Required for a teacher to exist? |
 * |---|---|---|
 * | `employees` | Employed by the institution, on a payroll | No — visiting staff are not |
 * | `teachers` | Able to teach: subject competence, registration | Yes |
 * | `class_teacher_assignments` | Responsible for a specific set of students | No — a teacher may hold none yet |
 *
 * `users_roles` grants the *capability* to mark attendance or enter marks; `class_teacher_assignments`
 * grants the *scope* within which that capability applies. ADR-0002 is explicit that a role without a
 * teaching assignment must not see student data, and this file is where the second half of that pair
 * lives.
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
  description,
  emailAddress,
  personName,
  phoneNumber,
  primaryId,
  updatedAt,
  version,
} from "./_conventions";
import { documentStatusEnum, documentTypeEnum } from "./_enums";
import { departments, institutions } from "./institution";
import { users } from "./identity";

/**
 * `teachers` — the teaching profile.
 *
 * `userId` is `NOT NULL` and unique: one profile per account, exactly as `employees.user_id` is
 * (ADR-0002 §2). A person who both teaches and is the institution's accountant has one `users` row, one
 * `teachers` row and one `employees` row, and neither profile claims the other.
 *
 * `subjectIds` is a `jsonb` array of subject ids rather than a join table, and that is a deliberate
 * trade-off worth naming: a teacher's *competence* is a short, unordered, institution-local list that is
 * always read whole and never queried across subjects. A join table would add a second entity to keep
 * consistent for a relationship that has no attributes and no ordering. Where a subject relationship
 * gains attributes — the *teaching* of a subject to a class — it is a table, not a column, and that is
 * `class_teacher_assignments`.
 *
 * `maxPeriodsPerDay` is nullable and is a **cap, not a target**: payroll's unit-based calculation
 * (`salaryStructures`) needs a ceiling for absence deduction, and an institution that does not cap
 * periods leaves it null.
 */
export const teachers = pgTable(
  "teachers",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    employeeCode: varchar("employee_code", { length: 64 }),
    firstName: personName("first_name"),
    lastName: personName("last_name"),
    email: emailAddress(),
    phone: phoneNumber(),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    /** Subject ids this teacher is competent in. Institution-local, short, read whole. */
    subjectIds: jsonb("subject_ids").$type<readonly string[]>().notNull().default([]),
    /** Professional registration, required for college faculty in most jurisdictions. */
    registrationNumber: varchar("registration_number", { length: 64 }),
    qualification: varchar("qualification", { length: 160 }),
    /** Ceiling for unit-based salary deduction. Null = uncapped. */
    maxPeriodsPerDay: integer("max_periods_per_day"),
    bio: text("bio"),
    photoUrl: varchar("photo_url", { length: 512 }),
    hiredOn: date("hired_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    index("teachers_institution_idx").on(t.institutionId),
    index("teachers_department_idx").on(t.departmentId),
    // An employee code is a per-institution staff number, so it is unique per institution and only
    // where present — a visiting teacher may have none at all.
    uniqueIndex("teachers_institution_code_key")
      .on(t.institutionId, t.employeeCode)
      .where(sql`${t.employeeCode} is not null`),
    check(
      "teachers_max_periods_check",
      sql`${t.maxPeriodsPerDay} is null or ${t.maxPeriodsPerDay} > 0`,
    ),
  ],
);

/**
 * `teacher_documents` — qualification certificates, registration proof, medical fitness.
 *
 * `PRD.md` MODULE 8 requires HR documents; this is the teacher-specific subset. Metadata only
 * (`ARCHITECTURE.md` §51).
 */
export const teacherDocuments = pgTable(
  "teacher_documents",
  {
    id: primaryId(),
    teacherUserId: uuid("teacher_user_id")
      .notNull()
      .references(() => teachers.userId, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }),
    status: documentStatusEnum("status").notNull().default("pending_verification"),
    /** Registration certificates and medical fitness both lapse; the expiry is tracked, not just the file. */
    expiresOn: date("expires_on"),
    verifiedByUserId: uuid("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("teacher_documents_teacher_idx").on(t.teacherUserId, t.documentType),
    check(
      "teacher_documents_verification_pair",
      sql`${t.status} <> 'verified' or ${t.verifiedByUserId} is not null`,
    ),
  ],
);

/**
 * `teacher_subjects` — a teacher's competence, as a table.
 *
 * This exists **despite** `teachers.subjectIds` existing, and the difference matters:
 * `teachers.subject_ids` is a denormalised convenience list for the profile screen, while this is the
 * row that carries the facts a computation needs — when the teacher became competent, and whether the
 * competence was verified. `PRD.md` MODULE 20 requires "teacher subject mapping" as a real table, and
 * it needs `verifiedByUserId` to satisfy the `RULES.md` §51 audit requirement.
 *
 * The composite primary key `(teacher, subject)` makes a duplicate competence unrepresentable, and the
 * index on `subject_id` alone is what "who teaches Chemistry" reads.
 */
export const teacherSubjects = pgTable(
  "teacher_subjects",
  {
    teacherUserId: uuid("teacher_user_id")
      .notNull()
      .references(() => teachers.userId, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").notNull(),
    /** `verified` competences may be assigned to a class; unverified ones may not. */
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedByUserId: uuid("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, precision: 3 }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.teacherUserId, t.subjectId] }),
    index("teacher_subjects_subject_idx").on(t.subjectId, t.isVerified),
    check(
      "teacher_subjects_verification_pair",
      sql`${t.isVerified} = false or (${t.verifiedByUserId} is not null and ${t.verifiedAt} is not null)`,
    ),
    check(
      "teacher_subjects_effective_order_check",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
);

/**
 * `teacher_workload_history` — periods taught per session, kept for trend and dispute.
 *
 * `PRD.md` MODULE 9's unit-based salary is a *calculation* over this kind of count, and a teacher who
 * disputes a payslip needs the input count to be visible and dated. It is a summary row, recomputed by
 * the payroll module; the underlying facts are `schedules` and the approved extra periods in floor
 * operations. It must never be used as the input to itself.
 *
 * `periodsTaught` and `extraPeriodsTaught` are separate because `PRD.md` MODULE 19 makes an approved
 * extra period payable while an unapproved one is not — collapsing them into one number would lose the
 * distinction that payroll actually pays on.
 */
export const teacherWorkloadHistory = pgTable(
  "teacher_workload_history",
  {
    id: primaryId(),
    teacherUserId: uuid("teacher_user_id")
      .notNull()
      .references(() => teachers.userId, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id").notNull(),
    /** Periods from the published timetable. */
    periodsTaught: integer("periods_taught").notNull().default(0),
    /** Approved replacement/extra periods. The payable ones, per PRD.md MODULE 19. */
    extraPeriodsTaught: integer("extra_periods_taught").notNull().default(0),
    /** Sections the teacher was responsible for. Distinct from periods: one class, many periods. */
    sectionsTaught: integer("sections_taught").notNull().default(0),
    calculatedAt: timestamp("calculated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("teacher_workload_history_session_key").on(t.teacherUserId, t.academicSessionId),
    index("teacher_workload_history_session_idx").on(t.academicSessionId, t.periodsTaught),
    check("teacher_workload_history_periods_check", sql`${t.periodsTaught} >= 0`),
    check("teacher_workload_history_extra_check", sql`${t.extraPeriodsTaught} >= 0`),
    check("teacher_workload_history_sections_check", sql`${t.sectionsTaught} >= 0`),
  ],
);

/**
 * `teacher_leave_balances` — leave consumed and remaining per type and session.
 *
 * Denormalised from `leave_requests` for the same reason as the workload summary: a leave balance
 * screen is read constantly and the count is `sum` over a growing table. The authoritative facts are the
 * approved `leave_requests` rows; this row must be recomputed, never hand-edited, and a mismatch must
 * be resolvable in favour of the requests.
 *
 * `daysUsed` can exceed `daysEntitled` — that is an over-draw, not a data error, and the check permits
 * it deliberately. A constraint forbidding it would stop the transaction that *records* the over-draw.
 */
export const teacherLeaveBalances = pgTable(
  "teacher_leave_balances",
  {
    id: primaryId(),
    teacherUserId: uuid("teacher_user_id")
      .notNull()
      .references(() => teachers.userId, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id").notNull(),
    academicSessionId: uuid("academic_session_id").notNull(),
    daysEntitled: integer("days_entitled").notNull(),
    daysUsed: integer("days_used").notNull().default(0),
    daysCarriedOver: integer("days_carried_over").notNull().default(0),
    calculatedAt: timestamp("calculated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("teacher_leave_balances_unique").on(
      t.teacherUserId,
      t.leaveTypeId,
      t.academicSessionId,
    ),
    check("teacher_leave_balances_entitled_check", sql`${t.daysEntitled} >= 0`),
    check("teacher_leave_balances_used_check", sql`${t.daysUsed} >= 0`),
    check("teacher_leave_balances_carried_check", sql`${t.daysCarriedOver} >= 0`),
  ],
);

/**
 * `teacher_qualifications` — degrees, certifications, trainings, with dates.
 *
 * `PRD.md` MODULE 8 asks for employee qualifications, and a teacher is an employee in every sense that
 * matters here. Separate from `teacher_documents` because a qualification is a **fact with validity
 * dates and an issuing body**, and a document is a **file**; a qualification may have no file (an
 * externally verified record) and a file may have no qualification (a medical certificate).
 *
 * `expiresOn` is nullable because most qualifications do not expire, and `fieldOfStudy` is free text
 * because the set of degrees in the world is not this system's to enumerate.
 */
export const teacherQualifications = pgTable(
  "teacher_qualifications",
  {
    id: primaryId(),
    teacherUserId: uuid("teacher_user_id")
      .notNull()
      .references(() => teachers.userId, { onDelete: "cascade" }),
    /** `degree`, `certification`, `training`, `license`. Free text: institutions differ. */
    qualificationType: varchar("qualification_type", { length: 32 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    fieldOfStudy: varchar("field_of_study", { length: 160 }),
    issuingBody: varchar("issuing_body", { length: 200 }),
    obtainedOn: date("obtained_on"),
    expiresOn: date("expires_on"),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("teacher_qualifications_teacher_idx").on(t.teacherUserId, t.qualificationType),
    check(
      "teacher_qualifications_expiry_check",
      sql`${t.expiresOn} is null or ${t.obtainedOn} is null or ${t.expiresOn} > ${t.obtainedOn}`,
    ),
  ],
);
