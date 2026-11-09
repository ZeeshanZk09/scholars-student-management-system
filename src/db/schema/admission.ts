/**
 * Admissions — the applicant lifecycle from submission to conversion into a `students` row.
 *
 * `DOMAIN-MODEL.md` D-3 and defect G-5: the archived design folded `applicant` into the `users`
 * table and made an admission a boolean flag on a student. Both are wrong in the same way — an
 * application and an enrolment are **different facts with different lifecycles**, and an applicant is
 * frequently never a student (rejected, or admitted elsewhere). So:
 *
 * - An `admissions.admissions` row is an application, owned by the applicant.
 * - A `students.students` row is an enrolment, owned by the institution.
 * - `admission_status = 'converted'` plus `studentId` records that the first became the second,
 *   once, irreversibly.
 *
 * The application row carries **no `user_id`** for the same reason a student has none: applicants do
 * not authenticate in this system. Staff who process applications do, and are referenced as actors.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  archivedAt,
  createdAt,
  optionalPersonName,
  personName,
  phoneNumber,
  primaryId,
  slug,
  updatedAt,
  version,
} from "./_conventions";
import { admissionStatusEnum, documentStatusEnum, documentTypeEnum, genderEnum } from "./_enums";
import { academicSessions, institutions } from "./institution";
import { classes, groups } from "./academic";
import { students } from "./student";

/**
 * `admissions` — one application.
 *
 * `application_number` is the human handle (`PRD.md` MODULE 5) and is unique per institution, for the
 * same reason the student's admission number is: two institutions issue their own sequence.
 *
 * ## Why `status` and `archived_at` are separate here
 *
 * `DOMAIN-MODEL.md` D-4 again, and this table is where it bites hardest. `status = 'rejected'` is a
 * **lifecycle** state that must be preserved indefinitely — the applicant may appeal, and the
 * institution must show that an application was decided. `archived_at` is administrative: the
 * duplicate row an office accidentally created. Combining them, as the archived schema did, makes
 * "rejected" and "archived" indistinguishable and quietly loses the decision.
 *
 * ## The applied-for scope is captured, not referenced
 *
 * `applied_class_id` / `applied_group_id` are nullable rather than required, and `applied_grade_level`
 * carries the free-text grade as it was written. Applications routinely arrive before a session is
 * open ("admissions for the coming year"), so requiring a class row would force staff to invent one.
 * What is required is that the row is not empty of meaning: the check below ensures at least one of
 * the three is present, so "applied for nothing" is unrepresentable.
 */
export const admissions = pgTable(
  "admissions",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    applicationNumber: varchar("application_number", { length: 64 }).notNull(),
    /* ---- the applicant (a person, not an account) ---- */
    firstName: personName("first_name"),
    middleName: optionalPersonName("middle_name"),
    lastName: personName("last_name"),
    dateOfBirth: date("date_of_birth"),
    gender: genderEnum("gender"),
    /**
     * `nullable` + `optional`: an applicant may have no e-mail and apply in person. Deliberately
     * **not** `emailAddress()` — that helper is `.notNull()` (right for `students.email`, whose
     * address the institution issues with the account; wrong here, where no account exists yet and
     * the PRD lists e-mail only as information that "may" be collected).
     */
    email: varchar("email", { length: 320 }),
    phone: phoneNumber(),
    address: varchar("address", { length: 500 }),
    slug: slug(120),
    /* ---- the applied-for scope ---- */
    academicSessionId: uuid("academic_session_id").references(() => academicSessions.id, {
      onDelete: "set null",
    }),
    appliedClassId: uuid("applied_class_id").references(() => classes.id, { onDelete: "set null" }),
    appliedGroupId: uuid("applied_group_id").references(() => groups.id, { onDelete: "set null" }),
    /** Free text, e.g. "Nursery", "Class 9", "ICS-I". Kept even when a class row is linked. */
    appliedGradeLevel: varchar("applied_grade_level", { length: 64 }),
    /* ---- the decision ---- */
    status: admissionStatusEnum("status").notNull().default("submitted"),
    /**
     * Set when `status = 'converted'`. `NOT NULL` is enforced by `admissions_converted_pair` rather
     * than by the column: the FK is the real requirement, and making it optional keeps a partial
     * write from failing on the column before it fails on the reference.
     */
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true, precision: 3 }),
    decidedAt: timestamp("decided_at", { withTimezone: true, precision: 3 }),
    decidedByUserId: uuid("decided_by_user_id"),
    /** Staff-visible reasoning for `rejected` / `waitlisted`. Required for a rejection. */
    decisionNotes: text("decision_notes"),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    /** Admission-test score, when the institution ran one. Kept on the application, not the student. */
    testScore: numeric("test_score", { precision: 8, scale: 2 }),
    interviewScore: numeric("interview_score", { precision: 8, scale: 2 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("admissions_institution_application_number_key").on(
      t.institutionId,
      t.applicationNumber,
    ),
    uniqueIndex("admissions_institution_slug_key").on(t.institutionId, t.slug),
    // Conversion is one-way and happens once: a second conversion of the same application would
    // create a second student from one application.
    uniqueIndex("admissions_converted_student_key")
      .on(t.studentId)
      .where(sql`${t.studentId} is not null`),
    index("admissions_institution_status_idx").on(t.institutionId, t.status, t.createdAt),
    index("admissions_name_search_idx").on(t.institutionId, t.lastName, t.firstName),
    check(
      "admissions_scope_present_check",
      sql`num_nonnulls(${t.appliedClassId}, ${t.appliedGroupId}, ${t.appliedGradeLevel}) >= 1`,
    ),
    check(
      "admissions_converted_pair",
      sql`(${t.status} = 'converted' and ${t.studentId} is not null and ${t.convertedAt} is not null) or (${t.status} <> 'converted' and ${t.studentId} is null)`,
    ),
    // A rejection without a reason cannot be appealed, which `PRD.md` MODULE 5 requires it to be.
    check(
      "admissions_rejection_reason_check",
      sql`${t.status} <> 'rejected' or ${t.rejectionReason} is not null`,
    ),
    check(
      "admissions_score_range_check",
      sql`(${t.testScore} is null or ${t.testScore} >= 0) and (${t.interviewScore} is null or ${t.interviewScore} >= 0)`,
    ),
  ],
);

/**
 * `admission_status_history` — every transition an application made, with its actor.
 *
 * `DOMAIN-MODEL.md` BR-8 (`PRD.md` MODULE 5's status timeline screen) and `RULES.md` §51: a status
 * change is an auditable event, not a column overwrite. Without this, "why was this child rejected in
 * March and approved in April?" has no answer, and the audit trail required by §51 has no actor for
 * the single most consequential decision an admissions office makes.
 *
 * `fromStatus` is nullable because the initial state has no predecessor; every later row must have
 * one. The check enforces that a history is not a set of disconnected states.
 */
export const admissionStatusHistory = pgTable(
  "admission_status_history",
  {
    id: primaryId(),
    admissionId: uuid("admission_id")
      .notNull()
      .references(() => admissions.id, { onDelete: "cascade" }),
    /** Null only for the first transition, from "not yet submitted". */
    fromStatus: admissionStatusEnum("from_status"),
    toStatus: admissionStatusEnum("to_status").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    changedByUserId: uuid("changed_by_user_id").notNull(),
    notes: text("notes"),
  },
  (t) => [
    index("admission_status_history_admission_idx").on(t.admissionId, t.changedAt),
    check(
      "admission_status_history_no_self_transition",
      sql`${t.fromStatus} is null or ${t.fromStatus} <> ${t.toStatus}`,
    ),
  ],
);

/**
 * `admission_documents` — files attached to an application.
 *
 * Separate from `student_documents` even though both hold a B-Form and a birth certificate: the two
 * belong to different records with different owners and different visibility. An application's
 * documents are visible to the admissions staff reviewing it; a student's are visible to the
 * student's guardians. Merging them would require a nullable student id on one table and a nullable
 * admission id on the other, and every read would have to decide which side to follow.
 *
 * Metadata only — `ARCHITECTURE.md` §51 keeps binary data out of PostgreSQL.
 */
export const admissionDocuments = pgTable(
  "admission_documents",
  {
    id: primaryId(),
    admissionId: uuid("admission_id")
      .notNull()
      .references(() => admissions.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }),
    status: documentStatusEnum("status").notNull().default("pending_verification"),
    verifiedByUserId: uuid("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, precision: 3 }),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("admission_documents_admission_idx").on(t.admissionId, t.documentType),
    check(
      "admission_documents_verification_pair",
      sql`${t.status} <> 'verified' or ${t.verifiedByUserId} is not null`,
    ),
  ],
);

/**
 * `admission_checklists` — what an institution required, and whether the application satisfies it.
 *
 * `PRD.md` MODULE 5 requires an application to be complete before it can be decided. `items` is a JSON
 * document rather than a child table because the required set is institution-specific and changes
 * without a migration, and because the list is always read and written whole.
 *
 * `completed_at` and `completed_by_user_id` are denormalised **only** as a fast "is this complete?"
 * flag for the list screen; the authoritative per-item record is `admission_documents`. The check keeps
 * a "complete" claim attributable.
 */
export const admissionChecklists = pgTable(
  "admission_checklists",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** `[{ "key": "b_form", "label": "B-Form", "required": true }, …]`. Read and written whole. */
    items: jsonb("items").$type<readonly AdmissionChecklistItem[]>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [uniqueIndex("admission_checklists_institution_name_key").on(t.institutionId, t.name)],
);

/**
 * `admission_checklist_completions` — an application's progress against a checklist.
 *
 * The per-item truth, referenced by `admission_checklists` above for its summary. `missingItems` is a
 * `jsonb` array of the checklist item keys still outstanding, which is what the "Incomplete"
 * applications filter reads.
 */
export const admissionChecklistCompletions = pgTable(
  "admission_checklist_completions",
  {
    id: primaryId(),
    admissionId: uuid("admission_id")
      .notNull()
      .references(() => admissions.id, { onDelete: "cascade" }),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => admissionChecklists.id, { onDelete: "cascade" }),
    isComplete: boolean("is_complete").notNull().default(false),
    /** Checklist item keys still outstanding. Empty when complete. */
    missingItems: jsonb("missing_items").$type<readonly string[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true, precision: 3 }),
    completedByUserId: uuid("completed_by_user_id"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("admission_checklist_completions_unique").on(t.admissionId, t.checklistId),
    check(
      "admission_checklist_completions_pair",
      sql`${t.isComplete} = false or (${t.completedAt} is not null and ${t.completedByUserId} is not null)`,
    ),
  ],
);

/** One line of an institution's admission checklist. Owned by `admissionChecklists.items`. */
export interface AdmissionChecklistItem {
  /** Stable key, referenced by `admissionChecklistCompletions.missingItems`. */
  readonly key: string;
  readonly label: string;
  /** An optional item blocks "complete"; `required` is not checked by the database. */
  readonly required: boolean;
}

/**
 * `admission_sessions` — an intake window: which sessions, which classes, and how many seats.
 *
 * Required to make `waitlisted` meaningful (`admissionStatusEnum`). A waitlist without a seat count
 * cannot be ranked, so the capacity belongs on the window rather than only on the class row, and a
 * class may have different capacity in different intakes.
 */
export const admissionWindows = pgTable(
  "admission_windows",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    opensOn: date("opens_on").notNull(),
    closesOn: date("closes_on").notNull(),
    /** Seats available in this window. Null means uncapped. */
    capacity: integer("capacity"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("admission_windows_session_idx").on(t.academicSessionId, t.opensOn),
    check("admission_windows_date_order_check", sql`${t.closesOn} >= ${t.opensOn}`),
    check("admission_windows_capacity_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
    check(
      "admission_windows_single_scope_check",
      sql`num_nonnulls(${t.classId}, ${t.groupId}) <= 1`,
    ),
  ],
);
