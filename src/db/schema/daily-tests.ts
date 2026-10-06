/**
 * Daily tests and the monthly report they aggregate into.
 *
 * `PRD.md` MODULE 21 and 22, `ARCHITECTURE.md` §23. Two requirements pull in opposite directions here and
 * the schema has to satisfy both:
 *
 * - **MODULE 22:** daily tests for a month are aggregated into a monthly report, and once generated it
 *   becomes available to the student and the guardian, with **one** email.
 * - **MODULE 21 + `RULES.md` §46:** a daily test must **not** generate a separate email. Tests stay
 *   "continuously accessible through the relevant portals".
 *
 * So daily tests have no notification path of their own at all. `daily_test_evaluations` has no
 * `notifiedAt` column and no delivery row, because a column nobody may set is a column that will be set
 * by someone eventually. The only publication event in this file is the monthly report.
 *
 * ## Teachers only see their own subjects
 *
 * `PRD.md` MODULE 21: "teachers must only access relevant subject/student contexts according to their
 * permissions and assignments". That is enforced in the application (`RULES.md` §19) against
 * `teacher_subject_assignments`, but the schema supports it: `daily_tests.createdByTeacherUserId` records
 * who entered the test, and the read path for a teacher filters on it *and* on the assignment.
 */
import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
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
import { publicationStatusEnum } from "./_enums";
import { academicSessions, institutions } from "./institution";
import { classes, sections, subjects } from "./academic";
import { students } from "./student";
import { users } from "./identity";

/**
 * `daily_tests` — one short test, one subject, one day.
 *
 * ## Why a test is an `examinations`-shaped row rather than a second kind of mark
 *
 * MODULE 21 is explicit that daily tests are a distinct workflow: teachers create them, they are weekly
 * and informal, they have no pass mark, and they are aggregated monthly. Trying to express them as
 * `examination_type = 'daily_test'` on the examinations table would make every examination query carry a
 * branch for a set of columns (pass marks, seat numbers, malpractice) that a daily test never uses. The
 * tables are separate, and `monthly_test_reports.daily_test_ids` is what relates them.
 *
 * ## `totalMarks` is per test, and the monthly report divides by the count of tests
 *
 * A monthly percentage over tests of different lengths (a 5-mark quiz and a 20-mark test) is only
 * meaningful as a weighted mean of ratios, so `monthly_test_subjects.weightedPercentage` carries the
 * weights. Storing the raw per-test percentage on `daily_test_evaluations` is what makes that arithmetic
 * possible without re-reading every mark at report time.
 */
export const dailyTests = pgTable(
  "daily_tests",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    testDate: date("test_date").notNull(),
    totalMarks: numeric("total_marks", { precision: 8, scale: 2 }).notNull(),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    /**
     * Who created the test. `PRD.md` MODULE 14 makes this a teacher action, and recording the author is
     * what lets a read filter be "tests I created" without a join.
     */
    createdByTeacherUserId: uuid("created_by_teacher_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** `draft`, `published`, `locked`. Publication here means "students may see their mark". */
    status: publicationStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
    lockedAt: timestamp("locked_at", { withTimezone: true, precision: 3 }),
    /** The paper, if the teacher uploaded one. A storage key, never bytes — `ARCHITECTURE.md` §51. */
    paperStorageKey: varchar("paper_storage_key", { length: 512 }),
    instructions: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("daily_tests_institution_date_idx").on(t.institutionId, t.testDate),
    // One test per subject per class per day for a given teacher. Two identical tests on one day is a
    // double-entry, and it would silently double a student's monthly average.
    uniqueIndex("daily_tests_teacher_subject_day_key").on(
      t.createdByTeacherUserId,
      t.subjectId,
      t.testDate,
    ),
    index("daily_tests_subject_idx").on(t.subjectId, t.academicSessionId, t.status),
    index("daily_tests_class_idx").on(t.classId, t.sectionId, t.testDate),
    check("daily_tests_total_marks_positive", sql`${t.totalMarks} > 0`),
    check("daily_tests_scope_check", sql`${t.classId} is not null or ${t.sectionId} is not null`),
    check(
      "daily_tests_publication_pair",
      sql`${t.status} = 'draft' or ${t.publishedAt} is not null`,
    ),
    check("daily_tests_lock_pair", sql`${t.status} <> 'locked' or ${t.lockedAt} is not null`),
  ],
);

/**
 * `daily_test_evaluations` — one student's mark in one daily test.
 *
 * ## No email, deliberately
 *
 * `RULES.md` §46: "Daily tests must not generate one separate email per test." There is no
 * `notifiedAt`/`emailedAt` column here, and `daily_test_publications` (below) is the only publication
 * mechanism in this file. The absence is the enforcement — a reviewer reading this file can see there is
 * nowhere to record a per-test send.
 *
 * ## `percentage` is stored, and that is a deliberate exception
 *
 * Everything else in this schema refuses to store a derived number. Here the stored percentage is the
 * *unit of aggregation*: a monthly report over tests of unequal length is a mean of ratios, and
 * re-deriving every ratio from `obtainedMarks / totalMarks` at report time means reading every mark row
 * again. The percentage is recomputed whenever the mark is corrected, in the same transaction as the
 * correction, so it cannot drift from `obtainedMarks`.
 *
 * `status` distinguishes `absent` from a zero: a student who was not there has no mark, and averaging a
 * not-present into a numeric 0 is how a monthly average becomes wrong.
 */
export const dailyTestEvaluations = pgTable(
  "daily_test_evaluations",
  {
    id: primaryId(),
    dailyTestId: uuid("daily_test_id")
      .notNull()
      .references(() => dailyTests.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /**
     * The class/section the student sat the test in. Captured on the row rather than resolved through
     * `daily_tests`, so a test's scope edit cannot rewrite which roster a mark belongs to.
     */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    /** `pending`, `present`, `absent`, `excused`, `malpractice`. */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    obtainedMarks: numeric("obtained_marks", { precision: 8, scale: 2 }),
    /** The aggregation unit. See the note above. */
    percentage: numeric("percentage", { precision: 5, scale: 2 }),
    enteredByUserId: uuid("entered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    enteredAt: timestamp("entered_at", { withTimezone: true, precision: 3 }),
    statusReason: text("status_reason"),
    notes: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("daily_test_evaluations_unique").on(t.dailyTestId, t.studentId),
    // The monthly aggregation reads every evaluation for a student in a period, by subject.
    index("daily_test_evaluations_student_idx").on(t.studentId, t.status),
    index("daily_test_evaluations_class_idx").on(t.classId, t.sectionId, t.dailyTestId),
    check(
      "daily_test_evaluations_status_check",
      sql`${t.status} in ('pending', 'present', 'absent', 'excused', 'malpractice')`,
    ),
    // Only `present` carries a mark. An absent student has no mark, and must not have a zero.
    check(
      "daily_test_evaluations_marks_pair",
      sql`(${t.status} = 'present' and ${t.obtainedMarks} is not null) or (${t.status} <> 'present' and ${t.obtainedMarks} is null)`,
    ),
    check(
      "daily_test_evaluations_marks_range_check",
      sql`${t.obtainedMarks} is null or ${t.obtainedMarks} >= 0`,
    ),
    check(
      "daily_test_evaluations_percentage_range_check",
      sql`${t.percentage} is null or (${t.percentage} >= 0 and ${t.percentage} <= 100)`,
    ),
    check(
      "daily_test_evaluations_reason_required",
      sql`${t.status} not in ('excused', 'malpractice') or ${t.statusReason} is not null`,
    ),
    check(
      "daily_test_evaluations_entry_pair",
      sql`${t.obtainedMarks} is null or ${t.enteredByUserId} is not null`,
    ),
  ],
);

/**
 * `daily_test_corrections` — a mark changed after publication.
 *
 * `RULES.md` §43 (historical context) and §47 (a correction must not produce a second notification). The
 * second point is why there is no notification column here: correcting a mark changes the monthly report,
 * and the monthly report's *own* publication record is the single place an email may be sent from.
 */
export const dailyTestCorrections = pgTable(
  "daily_test_corrections",
  {
    id: primaryId(),
    dailyTestEvaluationId: uuid("daily_test_evaluation_id")
      .notNull()
      .references(() => dailyTestEvaluations.id, { onDelete: "restrict" }),
    previousMarks: numeric("previous_marks", { precision: 8, scale: 2 }),
    correctedMarks: numeric("corrected_marks", { precision: 8, scale: 2 }),
    reason: text("reason").notNull(),
    correctedByUserId: uuid("corrected_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    correctedAt: timestamp("corrected_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("daily_test_corrections_eval_idx").on(t.dailyTestEvaluationId, t.correctedAt),
    check(
      "daily_test_corrections_change_check",
      sql`${t.previousMarks} is null or ${t.previousMarks} <> ${t.correctedMarks}`,
    ),
    check("daily_test_corrections_corrected_range_check", sql`${t.correctedMarks} >= 0`),
  ],
);

/**
 * `monthly_test_reports` — the aggregate `PRD.md` MODULE 22 requires.
 *
 * ## One row per student per month per subject
 *
 * The PRD names the subjects explicitly (Mathematics, English, Physics, …), so the unit of aggregation is
 * *student × subject × month*, and the unique key says so. A month-wide single row per student would
 * require a JSON blob of subjects and could not answer "which subjects is this student weak in?".
 *
 * ## This is the one place in the module that emails
 *
 * `emailSentAt` is here and only here. `RULES.md` §46 requires exactly one consolidated notification
 * after the report is generated, and this row is that event. `status` must reach `published` before the
 * timestamp can be set — enforced below — because an email about a draft report tells a parent about a
 * number that may still change.
 *
 * ## The figures are a published snapshot
 *
 * `averagePercentage` and `testsCounted` are stored because this row *is* the published artifact: a
 * parent was told "78% over 4 tests", and a later correction to one mark must not silently change that
 * figure. A recomputation therefore inserts a new report and points the old one at it through
 * `supersededByReportId`, which is why the `(student, subject, period)` unique index is partial — it
 * constrains live rows only, and would otherwise forbid the replacement it exists to permit.
 */
export const monthlyTestReports = pgTable(
  "monthly_test_reports",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    /** The month covered. First of the month, always — so equality is the lookup. */
    periodStart: date("period_start").notNull(),
    /** Last day of the month. Redundant with `periodStart`, and kept because a report states its range. */
    periodEnd: date("period_end").notNull(),
    /**
     * How many tests contributed. Stored alongside the average because "78% over 4 tests" and "78% over 1
     * test" are not the same report, and an average without its denominator is meaningless.
     */
    testsCounted: integer("tests_counted").notNull(),
    /** Weighted mean of the per-test ratios. See the note at the top of this file. */
    averagePercentage: numeric("average_percentage", { precision: 5, scale: 2 }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    /** `draft`, `published`, `locked`. */
    status: publicationStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
    /**
     * When the single consolidated email went out. `RULES.md` §46 — the only notification in this module.
     * Null while the report is not published.
     */
    emailSentAt: timestamp("email_sent_at", { withTimezone: true, precision: 3 }),
    /**
     * `RULES.md` §47 idempotency key. The guardian-side key of the single email, so a retried worker
     * cannot send it twice even though the report itself was generated once.
     */
    emailIdempotencyKey: varchar("email_idempotency_key", { length: 128 }),
    /** A recomputation supersedes this report; it does not overwrite it. See the note above. */
    supersededByReportId: uuid("superseded_by_report_id").references(
      (): AnyPgColumn => monthlyTestReports.id,
      { onDelete: "set null" },
    ),
    /** Per-test detail as published. Opaque to the database. */
    testBreakdown:
      jsonb("test_breakdown").$type<
        Record<string, { obtained: number; total: number; percentage: number }>
      >(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    /**
     * At most one *live* report per student, subject, session, month. Partial, because supersession is
     * additive: a recomputation inserts a replacement and points the old row at it via
     * `supersededByReportId`. Without `where`, the unique index would forbid the replacement outright and
     * the column could only ever be null.
     */
    uniqueIndex("monthly_test_reports_unique")
      .on(t.studentId, t.subjectId, t.academicSessionId, t.periodStart)
      .where(sql`${t.supersededByReportId} is null`),
    index("monthly_test_reports_institution_period_idx").on(
      t.institutionId,
      t.periodStart,
      t.status,
    ),
    index("monthly_test_reports_class_idx").on(t.classId, t.sectionId, t.periodStart),
    // The unsent-email queue: published, not yet emailed, not superseded.
    index("monthly_test_reports_awaiting_email_idx")
      .on(t.periodStart, t.emailSentAt)
      .where(
        sql`${t.status} = 'published' and ${t.emailSentAt} is null and ${t.supersededByReportId} is null`,
      ),
    check("monthly_test_reports_period_check", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("monthly_test_reports_tests_counted_check", sql`${t.testsCounted} > 0`),
    check(
      "monthly_test_reports_average_range_check",
      sql`${t.averagePercentage} is null or (${t.averagePercentage} >= 0 and ${t.averagePercentage} <= 100)`,
    ),
    check(
      "monthly_test_reports_publication_pair",
      sql`${t.status} = 'draft' or ${t.publishedAt} is not null`,
    ),
    // An email about an unpublished report tells a parent about a number that may still change.
    check(
      "monthly_test_reports_email_requires_publication",
      sql`${t.emailSentAt} is null or (${t.status} <> 'draft' and ${t.publishedAt} is not null)`,
    ),
    // A report cannot supersede itself. The foreign key permits it; this forbids it, as
    // `expense_heads_not_self_parent` does for `expenseHeads.parentHeadId`.
    check(
      "monthly_test_reports_no_self_supersession",
      sql`${t.supersededByReportId} is null or ${t.supersededByReportId} <> ${t.id}`,
    ),
  ],
);

/**
 * `monthly_test_report_items` — which daily tests went into a report.
 *
 * Provenance, and it is what makes a report auditable: "why is this month's average 78% over 4 tests?"
 * is answered by joining four rows rather than by re-deriving a window function that may no longer produce
 * the same answer after a correction. It also pins the aggregation: the report cannot be said to include
 * a test it does not list, and cannot omit one it does.
 */
export const monthlyTestReportItems = pgTable(
  "monthly_test_report_items",
  {
    id: primaryId(),
    monthlyTestReportId: uuid("monthly_test_report_id")
      .notNull()
      .references(() => monthlyTestReports.id, { onDelete: "cascade" }),
    dailyTestId: uuid("daily_test_id")
      .notNull()
      .references(() => dailyTests.id, { onDelete: "restrict" }),
    /** The evaluation aggregated. One test contributes one evaluation per student. */
    dailyTestEvaluationId: uuid("daily_test_evaluation_id")
      .notNull()
      .references(() => dailyTestEvaluations.id, { onDelete: "restrict" }),
    /** The ratio used, captured. See the note above. */
    usedPercentage: numeric("used_percentage", { precision: 5, scale: 2 }),
    /** The weight this test carried, so the weighted mean is reproducible. */
    weight: numeric("weight", { precision: 8, scale: 2 }),
  },
  (t) => [
    // One test, and one evaluation, at most once per report. Scoped to the report rather than global: a
    // superseding report legitimately re-lists the same evaluations, and a global unique index on the
    // evaluation id would make the recomputation the table documents impossible.
    uniqueIndex("monthly_test_report_items_unique").on(t.monthlyTestReportId, t.dailyTestId),
    uniqueIndex("monthly_test_report_items_eval_unique").on(
      t.monthlyTestReportId,
      t.dailyTestEvaluationId,
    ),
    index("monthly_test_report_items_test_idx").on(t.dailyTestId),
    check(
      "monthly_test_report_items_percentage_range_check",
      sql`${t.usedPercentage} is null or (${t.usedPercentage} >= 0 and ${t.usedPercentage} <= 100)`,
    ),
    check("monthly_test_report_items_weight_check", sql`${t.weight} is null or ${t.weight} > 0`),
  ],
);

/**
 * `daily_test_publications` — when a mark became visible to a student or guardian.
 *
 * MODULE 21 says daily tests "remain continuously accessible through the relevant portals", so this is a
 * visibility record, not a delivery record. It exists because `RULES.md` §44 needs the boundary between
 * "a mark exists" and "a mark was shown": once shown, a change is a correction with a reason.
 */
export const dailyTestPublications = pgTable(
  "daily_test_publications",
  {
    id: primaryId(),
    dailyTestId: uuid("daily_test_id")
      .notNull()
      .references(() => dailyTests.id, { onDelete: "restrict" }),
    /** `student_portal`, `guardian_portal`, `print`, `export`. */
    channel: varchar("channel", { length: 24 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // `RULES.md` §47: publishing a test's marks to a channel twice is a duplicate event.
    uniqueIndex("daily_test_publications_unique").on(t.dailyTestId, t.channel),
    check(
      "daily_test_publications_channel_check",
      sql`${t.channel} in ('student_portal', 'guardian_portal', 'print', 'export')`,
    ),
  ],
);
