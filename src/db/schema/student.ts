/**
 * Students and their per-session placement.
 *
 * ## The person/scope split, and why a student is not a `users` row
 *
 * `PRD.md` MODULE 5 has guardians authenticate and view their children; students do not authenticate in
 * this system. So `students` carries no `user_id` foreign key to `users`: adding one would imply a
 * student can sign in, and every guard built on that assumption — an auth check, a session policy, a
 * password prompt on an empty profile — would be guarding an access path that does not exist.
 *
 * A student is a person **scoped to one institution**, and the scope lives on the row. That is what
 * makes the institution-level privacy scope in `ADR-0001` §2 a column comparison.
 *
 * ## `students.lifecycle` vs `archived_at`
 *
 * `DOMAIN-MODEL.md` D-4: two independent axes. A student who has graduated is `lifecycle = 'graduated'`
 * and `archived_at is null` — they are history, not deleted, and their results and fee history must
 * remain reportable. A student record that was created in error is `archived_at` set with a null
 * lifecycle. Neither state implies the other, so neither is derived from the other.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
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
  optionalPersonName,
  personName,
  phoneNumber,
  primaryId,
  slug,
  updatedAt,
  version,
} from "./_conventions";
import { genderEnum, studentLifecycleEnum } from "./_enums";
import { academicSessions, departments, institutions } from "./institution";
import { classes, sections } from "./academic";

/**
 * `students` — the enrolled person record.
 *
 * `admission_number` is the human reference (`PRD.md` MODULE 5, "Admission Number") and is unique
 * **within the institution**, not globally. Two institutions legitimately issue the same number to
 * different children, and a global unique index would make the second institution unable to enrol
 * anyone. Uniqueness is per-institution because the number is only ever looked up within one school.
 *
 * `roll_number` is a classroom label ("18" in a section of 40) and therefore deliberately **not**
 * unique: it repeats across sections every year, and enforcing uniqueness across the whole
 * institution would be a rule about a different concept.
 *
 * `dateOfBirth` is a `date`, not a timestamp — a birthday is a calendar fact, and a timestamp would
 * shift it by a day for anyone west of UTC. Age is always derived at read time from this column so that
 * it cannot go stale.
 */
export const students = pgTable(
  "students",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    admissionNumber: varchar("admission_number", { length: 64 }).notNull(),
    firstName: personName("first_name"),
    /** `null` is a real and common case for legal names, so this is not `notNull()`. */
    middleName: optionalPersonName("middle_name"),
    lastName: personName("last_name"),
    slug: slug(120),
    dateOfBirth: date("date_of_birth"),
    gender: genderEnum("gender"),
    /** Student login, where the institution issues one. Not a login for this system. */
    email: emailAddress(),
    phone: phoneNumber(),
    address: varchar("address", { length: 500 }),
    /** Institution-local image path, not a URL: `ARCHITECTURE.md` §51 keeps binary media off the database. */
    photoUrl: varchar("photo_url", { length: 512 }),
    rollNumber: varchar("roll_number", { length: 32 }),
    lifecycle: studentLifecycleEnum("lifecycle").notNull().default("admitted"),
    /** `nullable` + `optional` here, because a student is not born "active" in this system. */
    admittedAt: timestamp("admitted_at", { withTimezone: true, precision: 3 }),
    graduatedAt: timestamp("graduated_at", { withTimezone: true, precision: 3 }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("students_institution_admission_number_key").on(t.institutionId, t.admissionNumber),
    uniqueIndex("students_institution_slug_key").on(t.institutionId, t.slug),
    index("students_institution_lifecycle_idx").on(t.institutionId, t.lifecycle),
    index("students_name_search_idx").on(t.institutionId, t.lastName, t.firstName),
  ],
);

/**
 * `student_placements` — which Section a student is in, for which session.
 *
 * **This table is the fix for `DOMAIN-MODEL.md` D-2 and defect G-10.** The archived design stored
 * `students.sectionId` and overwrote it on promotion, which destroys the academic history that
 * `RULES.md` §43 and the fee/fee-history requirements depend on: after a promotion there is no way to
 * ask which section a student belonged to in the previous year.
 *
 * A placement is an append-only history. Promoting a student **inserts** a row for the new session;
 * it does not update the old one. That also means the primary key is
 * `(student_id, academic_session_id)` — one placement per student per session, enforced rather than
 * assumed, because two placements for one session would make every per-section roster ambiguous.
 *
 * `is_current` on the row mirrors `academic_sessions.is_current` for the read path; the partial unique
 * index below is what makes "at most one current placement per student" true, exactly as it does for
 * `academic_sessions_one_current_key`.
 */
export const studentPlacements = pgTable(
  "student_placements",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    /**
     * A placement without a class or group would break BR-1. Denormalised from the section on write:
     * the timetable grid and every roster query filter on `(institution, class, section)` together, and
     * resolving it through `sections → groups → classes` on each of those queries is the N+1 that
     * a real query budget forbids. Kept in step with the section inside the placement transaction.
     */
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    isCurrent: boolean("is_current").notNull().default(true),
    placedAt: timestamp("placed_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    /** The transfer or promotion decision that produced this placement. */
    placementReason: varchar("placement_reason", { length: 32 }),
    createdByUserId: uuid("created_by_user_id"),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.academicSessionId] }),
    uniqueIndex("student_placements_one_current_key")
      .on(t.studentId)
      .where(sql`${t.isCurrent} = true`),
    // The roster path: all students of a section, current session.
    index("student_placements_section_idx").on(t.sectionId, t.academicSessionId),
    index("student_placements_class_idx").on(t.classId, t.academicSessionId),
    index("student_placements_student_idx").on(t.studentId, t.placedAt),
    check(
      "student_placements_reason_check",
      sql`${t.placementReason} is null or ${t.placementReason} in ('admission', 'promotion', 'transfer', 're_admission')`,
    ),
  ],
);

/**
 * `student_previous_schools` — the previous institution(s) a transfer student came from.
 *
 * `PRD.md` MODULE 5 requires previous-school name, address and phone. Not nullable-by-default: a
 * student who never transferred has no rows, which is different from a row with an unknown school.
 */
export const studentPreviousSchools = pgTable(
  "student_previous_schools",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    address: varchar("address", { length: 500 }),
    phone: phoneNumber(),
    /** The last class/grade completed there, in the previous school's own numbering. Free text on purpose. */
    classAttended: varchar("class_attended", { length: 64 }),
    /** Where the record of that attendance actually is. Free text: it is usually another institution's system. */
    tcNumber: varchar("tc_number", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index("student_previous_schools_student_idx").on(t.studentId)],
);

/**
 * `student_documents` — B-Form, birth certificate, transfer certificate, result cards.
 *
 * `PRD.md` MODULE 5 names these explicitly. Only the **metadata** is stored: `storage_key` points at
 * an object in the storage service and `ARCHITECTURE.md` §51 forbids binary data in PostgreSQL, so the
 * row carries no `bytea`. Access is authorised through the student's institution scope, and a
 * verification workflow (`document_status`) gates what a guardian may see.
 */
export const studentDocuments = pgTable(
  "student_documents",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** One of the `document_type` values in `_enums.ts`. */
    documentType: varchar("document_type", { length: 32 }).notNull(),
    /** Storage-service object key. Never a public URL, so revocation is possible. */
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("pending_verification"),
    verifiedByUserId: uuid("verified_by_user_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, precision: 3 }),
    rejectionReason: varchar("rejection_reason", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("student_documents_student_idx").on(t.studentId, t.documentType),
    check(
      "student_documents_type_check",
      sql`${t.documentType} in ('b_form', 'birth_certificate', 'transfer_certificate', 'previous_result_card', 'national_id', 'photo', 'medical_certificate', 'other')`,
    ),
    check(
      "student_documents_status_check",
      sql`${t.status} in ('pending_verification', 'verified', 'rejected', 'expired')`,
    ),
    // A verified document needs a verifier. Otherwise "verified" is unfalsifiable and the audit
    // trail required by RULES.md §51 has no actor.
    check(
      "student_documents_verification_pair",
      sql`${t.status} <> 'verified' or ${t.verifiedByUserId} is not null`,
    ),
  ],
);

/**
 * `student_notes` — staff notes about a student, with visibility.
 *
 * Required by `PRD.md` MODULE 5's "Notes" screen. `isGuardianVisible` is on the **row** rather than on
 * a note type, because visibility is a property of the individual note (a behaviour note a parent must
 * see, a counselling note they must not) and not of its category.
 */
export const studentNotes = pgTable(
  "student_notes",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** A staff-only note is the common case, so the default is the restrictive one. */
    isGuardianVisible: boolean("is_guardian_visible").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("student_notes_student_idx").on(t.studentId, t.createdAt)],
);

/**
 * `student_enrollments` — one admission event, kept for fee and attendance history.
 *
 * Distinct from `student_placements` because these have different keys: a placement is
 * (student, session); an enrollment is (student, academic year, grade), which is how fee arrears and
 * attendance percentage are reported per *year* rather than per session. `academic_session_id` is kept
 * alongside so the two can be joined when they do coincide.
 */
export const studentEnrollments = pgTable(
  "student_enrollments",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    /** The year this enrollment was for. Indexed because reports group by year, not by session id. */
    academicYear: varchar("academic_year", { length: 32 }).notNull(),
    gradeLevel: integer("grade_level"),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    enrolledOn: date("enrolled_on").notNull(),
    description: description(),
    createdAt: createdAt(),
  },
  (t) => [
    index("student_enrollments_student_idx").on(t.studentId, t.academicYear),
    index("student_enrollments_institution_year_idx").on(t.institutionId, t.academicYear),
  ],
);
