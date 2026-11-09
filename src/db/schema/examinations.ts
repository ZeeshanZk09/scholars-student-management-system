/**
 * Examinations, marks and results.
 *
 * `PRD.md` MODULE 20, `ARCHITECTURE.md` §15/§23. `RULES.md` §43 is the constraint that shapes everything
 * here: a student's academic records must not disappear when they change class, section, group or year.
 *
 * ## The historical-record problem, and the shape that solves it
 *
 * Marks depend on a subject, a class, a section, a teacher and an academic session. Denormalise them onto
 * the mark row and a promotion silently rewrites last year's result — the exact defect
 * `DOMAIN-MODEL.md` records for the archived design. Resolve them through a chain on every read and every
 * report becomes an N+1 across four joins.
 *
 * The answer used here is the same one `students.placements` uses: **denormalise the identifiers onto the
 * row, and treat them as the historical truth that is written once.** `examination_marks` carries
 * `classId`, `sectionId` and `subjectId` as the values that were true when the paper was sat, plus
 * `academicSessionId`. Nothing re-derives them later, so a promotion cannot rewrite them.
 *
 * ## What is computed and what is stored
 *
 * Obtained marks and total marks are facts about a paper — stored. Percentage, grade and result status
 * are *rules*, and they differ between institutions (a 40% pass, a 33% pass, a relative curve). Those live
 * in `grading_schemes` as configuration and are evaluated at read time. Storing a percentage here would
 * mean a policy change silently invalidating every historical row.
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

import { createdAt, description, primaryId, updatedAt, version } from "./_conventions";
import { examinationTypeEnum, publicationStatusEnum } from "./_enums";
import { academicSessions, institutions } from "./institution";
import { classes, sections, subjects, timeSlots } from "./academic";
import { students } from "./student";
import { users } from "./identity";

/**
 * `examinations` — one sitting of one paper for one group of students.
 *
 * ## Scope is a scope, not a flag
 *
 * `classId` and `sectionId` are nullable because "the whole college sits Physics" is a real examination
 * and "only Section Alpha sits it" is also a real examination. The check requires at least one of them, so
 * an examination can never be *nobody's*. `groupId` is deliberately absent: groups are a teaching
 * subdivision inside a section, so a section-scoped examination already covers its groups, and adding a
 * group column would create a third combination to keep consistent.
 *
 * ## `status` is publication state, and it has a timestamp
 *
 * `publicationStatusEnum` plus `publishedAt` (`RULES.md` §44): a mark entered before publication and a
 * mark entered after it are different acts, and the second one needs `attendance.corrections`-style
 * provenance. `lockedAt` is the terminal state — a past paper's marks are history.
 */
export const examinations = pgTable(
  "examinations",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    /** Restricts an examination to one academic session. Cannot be open-ended. */
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    examinationType: examinationTypeEnum("examination_type").notNull(),
    /** Who may sit it. `classId` covers a class; `sectionId` narrows it. At least one is required. */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    /** For a class-wide paper: how many marks the paper is out of. Denormalised onto the mark as well. */
    totalMarks: numeric("total_marks", { precision: 8, scale: 2 }).notNull(),
    passMarks: numeric("pass_marks", { precision: 8, scale: 2 }),
    /** The time slot the paper was scheduled in, when it was scheduled. */
    timeSlotId: uuid("time_slot_id").references(() => timeSlots.id, { onDelete: "set null" }),
    examDate: date("exam_date").notNull(),
    /** `draft`, `published`, `locked`. */
    status: publicationStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
    lockedAt: timestamp("locked_at", { withTimezone: true, precision: 3 }),
    /** The teacher who set the paper (`PRD.md` MODULE 14: teachers submit examination papers). */
    setByTeacherUserId: uuid("set_by_teacher_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** The paper itself. A storage key, never bytes — `ARCHITECTURE.md` §51. */
    questionPaperStorageKey: varchar("question_paper_storage_key", { length: 512 }),
    /** When the submission window closes. */
    submissionDeadline: timestamp("submission_deadline", { withTimezone: true, precision: 3 }),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("examinations_institution_date_idx").on(t.institutionId, t.examDate),
    index("examinations_subject_idx").on(t.subjectId, t.academicSessionId),
    index("examinations_class_idx").on(t.classId, t.sectionId, t.status),
    check("examinations_total_marks_positive", sql`${t.totalMarks} > 0`),
    check("examinations_scope_check", sql`${t.classId} is not null or ${t.sectionId} is not null`),
    // A pass mark above the total is not a hard paper, it is a bug.
    check(
      "examinations_pass_marks_check",
      sql`${t.passMarks} is null or (${t.passMarks} >= 0 and ${t.passMarks} <= ${t.totalMarks})`,
    ),
    check(
      "examinations_publication_pair",
      sql`${t.status} = 'draft' or ${t.publishedAt} is not null`,
    ),
    check("examinations_lock_pair", sql`${t.status} <> 'locked' or ${t.lockedAt} is not null`),
  ],
);

/**
 * `grading_schemes` — how marks become a grade, per institution.
 *
 * `PRD.md` MODULE 20 says "grade where applicable". "Where applicable" is the operative phrase: a school
 * wants A/B/C/D, a college wants a percentage plus a credit count, and an institution may want none. A
 * `grade` column on the mark would have to be nullable-ish and would then be wrong for one of them.
 *
 * So grades are **configuration rows against an ordered scale**, and a mark stores only the marks. The
 * scale is an ordered list of bands, each with a lower bound; evaluation is "the highest band whose
 * `minPercentage` the mark's percentage reaches". That is one indexed range scan per report rather than a
 * chain of `CASE` expressions baked into the schema.
 */
export const gradingSchemes = pgTable(
  "grading_schemes",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Optional applicability: null = the scheme may be used by any examination in the institution. */
    academicSessionId: uuid("academic_session_id").references(() => academicSessions.id, {
      onDelete: "cascade",
    }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
    /** `percentage` or `absolute`. Absolute bands compare obtained marks, percentage bands compare ratios. */
    basis: varchar("basis", { length: 16 }).notNull().default("percentage"),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("grading_schemes_institution_idx").on(t.institutionId, t.isActive, t.isDefault),
    index("grading_schemes_subject_idx").on(t.subjectId),
    check("grading_schemes_basis_check", sql`${t.basis} in ('percentage', 'absolute')`),
  ],
);

/**
 * `grading_bands` — one band of a scheme, ordered by its lower bound.
 *
 * `minPercentage` and `minMarks` coexist because `grading_schemes.basis` decides which one is meaningful;
 * the check enforces that the unused one is null, so a half-configured band cannot exist.
 *
 * `gradePoint` is what makes the scale usable for a GPA. Without it, "grade where applicable" would need a
 * separate mapping table per institution and every transcript query would join twice.
 */
export const gradingBands = pgTable(
  "grading_bands",
  {
    id: primaryId(),
    gradingSchemeId: uuid("grading_scheme_id")
      .notNull()
      .references(() => gradingSchemes.id, { onDelete: "cascade" }),
    /** The letter or label shown to a human. `A+`, `B`, `Pass`, `Distinction`. */
    grade: varchar("grade", { length: 16 }).notNull(),
    /** Lower bound, inclusive, as a percentage. Null when `basis = 'absolute'`. */
    minPercentage: numeric("min_percentage", { precision: 5, scale: 2 }),
    /** Lower bound, inclusive, in marks. Null when `basis = 'percentage'`. */
    minMarks: numeric("min_marks", { precision: 8, scale: 2 }),
    /** For a GPA. Null when the scheme does not compute one. */
    gradePoint: numeric("grade_point", { precision: 4, scale: 2 }),
    /** An ordered scale renders in `displayOrder`; a percentage scale does not need one but may set it. */
    displayOrder: integer("display_order").notNull().default(0),
    /** True for a band that counts as a pass. Mirrors `examinations.passMarks` for scheme-driven exams. */
    isPass: boolean("is_pass").notNull().default(false),
  },
  (t) => [
    // Bands are looked up by "highest band at or below this percentage", so this is the read path.
    index("grading_bands_scheme_percentage_idx").on(t.gradingSchemeId, t.minPercentage),
    index("grading_bands_scheme_marks_idx").on(t.gradingSchemeId, t.minMarks),
    // Two bands may not start at the same point: the lookup would be ambiguous.
    uniqueIndex("grading_bands_percentage_unique")
      .on(t.gradingSchemeId, t.minPercentage)
      .where(sql`${t.minPercentage} is not null`),
    uniqueIndex("grading_bands_marks_unique")
      .on(t.gradingSchemeId, t.minMarks)
      .where(sql`${t.minMarks} is not null`),
    check(
      "grading_bands_basis_match_check",
      sql`num_nonnulls(${t.minPercentage}, ${t.minMarks}) = 1`,
    ),
    check(
      "grading_bands_percentage_range_check",
      sql`${t.minPercentage} is null or (${t.minPercentage} >= 0 and ${t.minPercentage} <= 100)`,
    ),
    check("grading_bands_marks_range_check", sql`${t.minMarks} is null or ${t.minMarks} >= 0`),
  ],
);

/**
 * `examination_registrations` — who is expected to sit, and therefore who is *missing* a mark.
 *
 * This table exists because of one specific question: "who did not submit?" Without a roster, the answer
 * is "every student without a row", which also includes students who were never registered, students who
 * dropped the subject, and students whose registration failed silently. A registration row makes
 * non-submission a state of a known participant.
 *
 * `attendanceStatus` at exam time is usually `absent` rather than "did not sit"; keeping it here rather
 * than in `student_attendance` avoids a second meaning for one word.
 */
export const examinationRegistrations = pgTable(
  "examination_registrations",
  {
    id: primaryId(),
    examinationId: uuid("examination_id")
      .notNull()
      .references(() => examinations.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /** `registered`, `withdrawn`, `debarred`, `absent`, `submitted`. */
    status: varchar("status", { length: 16 }).notNull().default("registered"),
    /** Seat number for the exam hall, when the institution allocates them. */
    seatNumber: varchar("seat_number", { length: 16 }),
    registeredAt: createdAt(),
    /** Who withdrew or debarred them, and why. */
    withdrawnByUserId: uuid("withdrawn_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    withdrawalReason: text("withdrawal_reason"),
  },
  (t) => [
    uniqueIndex("examination_registrations_unique").on(t.examinationId, t.studentId),
    index("examination_registrations_student_idx").on(t.studentId, t.status),
    check(
      "examination_registrations_status_check",
      sql`${t.status} in ('registered', 'withdrawn', 'debarred', 'absent', 'submitted')`,
    ),
    check(
      "examination_registrations_withdrawal_pair",
      sql`${t.status} not in ('withdrawn', 'debarred') or ${t.withdrawalReason} is not null`,
    ),
    // A seat number is unique within a hall, so a student's own seat is their identity in that paper.
    uniqueIndex("examination_registrations_seat_key")
      .on(t.examinationId, t.seatNumber)
      .where(sql`${t.seatNumber} is not null`),
  ],
);

/**
 * `examination_marks` — one student's result in one paper.
 *
 * ## Marks are entered once and then frozen
 *
 * `obtainedMarks` is the number the teacher entered. `RULES.md` §43 requires historical context and §41
 * (in spirit, for academic data) requires correction workflows rather than silent mutation, so a
 * post-publication change is not an `UPDATE` — it is either `exam_marks_corrections` or a re-open of the
 * paper, both of which leave a trail.
 *
 * `status` covers the states that are genuinely different to a report: `pending` (registered, not entered),
 * `absent` (sat nothing, and that is a fact), `submitted` (entered), `malpractice` (entered but
 * invalidated). `malpractice` is separate from a zero because a zero is a performance and malpractice is a
 * process event — collapsing them loses the reason a result was withheld.
 *
 * ## Denormalised identifiers
 *
 * `classId`/`sectionId`/`subjectId`/`academicSessionId` are copied from the examination at entry time and
 * are the historical truth. They are also why `RULES.md` §43 holds: nothing re-derives them, so a
 * promotion cannot change what last year's paper says this student sat.
 */
export const examinationMarks = pgTable(
  "examination_marks",
  {
    id: primaryId(),
    examinationId: uuid("examination_id")
      .notNull()
      .references(() => examinations.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /**
     * The academic context as it was when the paper was sat. Written once, never re-derived — see the
     * note above.
     */
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    /** `pending`, `absent`, `submitted`, `malpractice`, `withheld`. */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    obtainedMarks: numeric("obtained_marks", { precision: 8, scale: 2 }),
    /** The paper's total, copied for the same reason as the ids above. */
    totalMarks: numeric("total_marks", { precision: 8, scale: 2 }).notNull(),
    enteredByUserId: uuid("entered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    enteredAt: timestamp("entered_at", { withTimezone: true, precision: 3 }),
    /** The script image, if the institution photographs papers. A storage key, never bytes. */
    scriptStorageKey: varchar("script_storage_key", { length: 512 }),
    /** `malpractice` and `withheld` need a reason; a mark without one is not reviewable. */
    statusReason: text("status_reason"),
    notes: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("examination_marks_unique").on(t.examinationId, t.studentId),
    // The three report axes `PRD.md` MODULE 20 requires: student-wise, class-wise, section-wise.
    index("examination_marks_student_idx").on(t.studentId, t.academicSessionId),
    index("examination_marks_class_idx").on(t.classId, t.sectionId, t.examinationId),
    index("examination_marks_subject_session_idx").on(t.subjectId, t.academicSessionId, t.status),
    check("examination_marks_total_positive", sql`${t.totalMarks} > 0`),
    // A mark above the paper's total is the single most common data-entry error; refuse it here.
    check(
      "examination_marks_range_check",
      sql`${t.obtainedMarks} is null or (${t.obtainedMarks} >= 0 and ${t.obtainedMarks} <= ${t.totalMarks})`,
    ),
    check(
      "examination_marks_status_check",
      sql`${t.status} in ('pending', 'absent', 'submitted', 'malpractice', 'withheld')`,
    ),
    // Only a submitted mark has obtained marks; an absent student has no 0.
    check(
      "examination_marks_marks_status_pair",
      sql`(${t.status} = 'submitted' and ${t.obtainedMarks} is not null) or (${t.status} <> 'submitted' and ${t.obtainedMarks} is null)`,
    ),
    check(
      "examination_marks_reason_required",
      sql`${t.status} not in ('malpractice', 'withheld') or ${t.statusReason} is not null`,
    ),
    check(
      "examination_marks_entry_pair",
      sql`${t.obtainedMarks} is null or ${t.enteredByUserId} is not null`,
    ),
  ],
);

/**
 * `exam_marks_corrections` — a change to a mark after publication.
 *
 * `RULES.md` §43 and §44 together: history is preserved, and a closed record is changed only through a
 * controlled act. Both the previous and the new value are stored — a correction that does not say what it
 * replaced cannot be audited, and "who raised this student's Physics mark by 4?" is a question a school
 * gets asked.
 *
 * `previousMarks` is captured on the row rather than by a trigger or by reading the mark's history, because
 * the point of the audit is what the value *was at the time of the correction*, not what it happens to be
 * now.
 */
export const examMarksCorrections = pgTable(
  "exam_marks_corrections",
  {
    id: primaryId(),
    examinationMarkId: uuid("examination_mark_id")
      .notNull()
      .references(() => examinationMarks.id, { onDelete: "restrict" }),
    previousMarks: numeric("previous_marks", { precision: 8, scale: 2 }),
    correctedMarks: numeric("corrected_marks", { precision: 8, scale: 2 }).notNull(),
    /** Why the original was wrong. Mandatory — an unattributed correction is not a correction. */
    reason: text("reason").notNull(),
    correctedByUserId: uuid("corrected_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    correctedAt: timestamp("corrected_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /** Second-level approval, for a correction after the paper was published to students. */
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [
    index("exam_marks_corrections_mark_idx").on(t.examinationMarkId, t.correctedAt),
    index("exam_marks_corrections_actor_idx").on(t.correctedByUserId, t.correctedAt),
    check(
      "exam_marks_corrections_change_check",
      sql`${t.previousMarks} is null or ${t.previousMarks} <> ${t.correctedMarks}`,
    ),
    check("exam_marks_corrections_corrected_range_check", sql`${t.correctedMarks} >= 0`),
    check(
      "exam_marks_corrections_approval_pair",
      sql`num_nonnulls(${t.approvedByUserId}, ${t.approvedAt}) in (0, 2)`,
    ),
  ],
);

/**
 * `student_results` — one student's consolidated outcome for one academic session.
 *
 * ## Why this is not a view
 *
 * A session-level result ("Class 9, session 2026: 78%, Grade B, Pass") is read by parents, printed on
 * report cards, and used for promotion decisions — often long after the underlying marks stop changing. It
 * is recomputed from marks whenever a correction lands, and once it has been *published* it is an issued
 * document: a parent saw "78%", and a later recalculation must not silently change what they saw.
 *
 * So this table stores the published figure with the timestamp it was computed and published, alongside
 * the inputs it was derived from (`totalObtainedMarks`, `totalMaximumMarks`). The derivation is
 * reproducible from those two numbers and the grading scheme; the *publication* is the fact.
 *
 * `resultStatus` (`pass`, `fail`, `compartment`, `withheld`) is a stored classification for the same
 * reason as the percentage: the rule set that produced it may change, but what was told to the family did
 * not.
 */
export const studentResults = pgTable(
  "student_results",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    /** The class/section the result belongs to, captured at publication. */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    /** The scheme that produced the grade, so a re-evaluation knows which rules applied. */
    gradingSchemeId: uuid("grading_scheme_id").references(() => gradingSchemes.id, {
      onDelete: "set null",
    }),
    totalObtainedMarks: numeric("total_obtained_marks", { precision: 12, scale: 2 }),
    totalMaximumMarks: numeric("total_maximum_marks", { precision: 12, scale: 2 }),
    /** Derived from the two totals above. Stored because it was published — see the note. */
    percentage: numeric("percentage", { precision: 5, scale: 2 }),
    /** The overall grade from the scheme. */
    grade: varchar("grade", { length: 16 }),
    gradePoint: numeric("grade_point", { precision: 4, scale: 2 }),
    /** `pass`, `fail`, `compartment`, `withheld`. */
    resultStatus: varchar("result_status", { length: 16 }).notNull(),
    /** Number of subjects passed / total subjects considered. Two integers, not a ratio. */
    subjectsPassed: integer("subjects_passed"),
    subjectsConsidered: integer("subjects_considered"),
    /** Per-subject breakdown as published. Opaque to the database. */
    subjectBreakdown:
      jsonb("subject_breakdown").$type<
        Record<string, { obtained: number; total: number; grade: string | null }>
      >(),
    status: publicationStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
    /** The computation's inputs, so a later recalculation can explain a difference. */
    computedFrom: jsonb("computed_from").$type<Record<string, string | number | null>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    // One result per student per session. Two rows would mean two answers to "how did this student do?".
    uniqueIndex("student_results_unique").on(t.studentId, t.academicSessionId),
    // The three report axes `PRD.md` MODULE 20 requires.
    index("student_results_class_idx").on(t.academicSessionId, t.classId, t.sectionId),
    index("student_results_session_status_idx").on(t.academicSessionId, t.resultStatus),
    check(
      "student_results_status_check",
      sql`${t.resultStatus} in ('pass', 'fail', 'compartment', 'withheld')`,
    ),
    check(
      "student_results_percentage_check",
      sql`${t.percentage} is null or (${t.percentage} >= 0 and ${t.percentage} <= 100)`,
    ),
    check(
      "student_results_marks_pair",
      sql`num_nonnulls(${t.totalObtainedMarks}, ${t.totalMaximumMarks}) in (0, 2)`,
    ),
    // Obtained marks cannot exceed the maximum. This is arithmetic, not policy, so it is a constraint.
    check(
      "student_results_marks_range_check",
      sql`${t.totalObtainedMarks} is null or (${t.totalObtainedMarks} >= 0 and ${t.totalObtainedMarks} <= ${t.totalMaximumMarks})`,
    ),
    check(
      "student_results_subjects_pair",
      sql`num_nonnulls(${t.subjectsPassed}, ${t.subjectsConsidered}) in (0, 2)`,
    ),
    check(
      "student_results_publication_pair",
      sql`${t.status} = 'draft' or ${t.publishedAt} is not null`,
    ),
  ],
);

/**
 * `result_publication_log` — who sent a result to a family, and when.
 *
 * `RULES.md` §47 requires that the same event not generate duplicate notifications. This is the record
 * that makes an idempotency key checkable after the fact: the unique key on
 * `(student_result_id, channel)` means a second send for the same channel is impossible rather than
 * merely unlikely, and a school that resends to the family that missed it does so by creating a new row
 * with an explicit `resend_reason`.
 */
export const resultPublicationLog = pgTable(
  "result_publication_log",
  {
    id: primaryId(),
    studentResultId: uuid("student_result_id")
      .notNull()
      .references(() => studentResults.id, { onDelete: "restrict" }),
    /** `in_app`, `email`, `portal`, `printed`. Mirrors `notification_channel` plus print. */
    channel: varchar("channel", { length: 16 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Required for a resend, so a duplicate is always a deliberate act. */
    resendReason: text("resend_reason"),
    /** `queued`, `sent`, `delivered`, `failed`. */
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    failureReason: text("failure_reason"),
  },
  (t) => [
    // `RULES.md` §47: one publication per channel per result.
    uniqueIndex("result_publication_log_unique").on(t.studentResultId, t.channel),
    index("result_publication_log_status_idx").on(t.status, t.publishedAt),
    check(
      "result_publication_log_status_check",
      sql`${t.status} in ('queued', 'sent', 'delivered', 'failed')`,
    ),
    check(
      "result_publication_log_failure_check",
      sql`${t.status} <> 'failed' or ${t.failureReason} is not null`,
    ),
  ],
);
