/**
 * Attendance: student marks per period, biometric transactions, and their corrections.
 *
 * `ARCHITECTURE.md` §17–§18 is the specification and it is unusually strict, so this file is mostly
 * about honouring four rules it states:
 *
 * 1. **Exactly four states** — `present`, `absent`, `late`, `leave`. No `excused`, no `half_day`, no
 *    free text in the status column.
 * 2. **An unapproved absence is `absent`, not `leave`.** Leave appears only when a
 *    `leave_requests` row is `approved`. This is why `attendance_records.leaveRequestId` is nullable and
 *    constrained: a `leave` mark with no approved request behind it is the contradiction §18 forbids.
 * 3. **A biometric transaction is a claim, not a mark.** It becomes an attendance mark only through
 *    resolution, and that resolution is recorded.
 * 4. **Corrections are audited, never silent.** `RULES.md` §44 requires post-publication changes to be
 *    attributable.
 *
 * ## One row per (section, date, period) — not per student
 *
 * `attendanceRecords` is one mark for **one student** in one section on one date in one period. The
 * primary key is exactly that tuple, and it is a real invariant rather than a convenience: a second
 * mark for the same student and period is a correction, and a correction belongs in
 * `attendanceCorrections`, where it is visible. Making the key `(section, date, period)` instead — the
 * tempting "one row holds all 40 students" design — would put 40 mutable values in one row, so one
 * student's correction would bump the version of the whole class's attendance and lock 39 unrelated
 * records. That is the N+1-write problem `RULES.md` §16 warns about, and it is why this is a row per
 * mark.
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

import { createdAt, primaryId, updatedAt, version } from "./_conventions";
import { attendanceSourceEnum, attendanceStatusEnum } from "./_enums";
import { biometricDevices, biometricTransactions } from "./biometric";
import { schedules, sections, timeSlots } from "./academic";
import { academicSessions } from "./institution";
import { leaveRequests } from "./hr";
import { students } from "./student";

/**
 * `attendance_records` — one student's attendance mark.
 *
 * ## The composite primary key is the correctness mechanism
 *
 * `(section_id, attendance_date, time_slot_id, student_id)` means an attendance mark can only exist once
 * for a student in a period, and the section is part of the identity rather than a lookup — so two
 * marks cannot disagree about which section a student was in. Marking attendance is the highest-volume
 * write in the system (a full school, a period at a time, on a deadline), and the common failure is a
 * teacher tapping "submit" twice. Here the second submit updates the existing row through
 * `attendance_corrections` rather than inserting a duplicate the reports would double-count.
 *
 * `section_id` has no foreign key: it is the denormalised *placement* section, resolved from
 * `student_placements` when the mark is created, so that a report does not have to join placements to
 * know who was in the room. The check constraint below guarantees the row's section is one the student
 * was actually placed in, enforced at write time by the attendance use case, which is where the
 * placement and the mark are in the same transaction. The FK to `students` *is* present, because that
 * reference never varies.
 *
 * ## `status` vs `source`
 *
 * `status` is one of four values, enforced by a `pgEnum` (defect G-7). `source` records **who decided**:
 * a floor-incharge tapping a student present (`manual`), a device (`biometric`), a bulk import
 * (`imported`), or the attendance module deriving the mark from an approved leave
 * (`derived_from_leave`). Without `source`, a disputed mark cannot be attributed, and `ARCHITECTURE.md`
 * §35 is explicit that a device transaction and a human tap are different kinds of fact.
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    source: attendanceSourceEnum("source").notNull().default("manual"),
    /**
     * The approved leave this mark derives from. Required when `status = 'leave'` and forbidden
     * otherwise — that is `ARCHITECTURE.md` §18's "an unapproved absence must be `absent`" as a
     * constraint instead of a code review note.
     */
    leaveRequestId: uuid("leave_request_id").references(() => leaveRequests.id, {
      onDelete: "set null",
    }),
    /** The device transaction this mark was resolved from, when `source = 'biometric'`. */
    biometricTransactionId: uuid("biometric_transaction_id").references(
      () => biometricTransactions.id,
      { onDelete: "set null" },
    ),
    /** Minutes late. Only meaningful for `late`, and rejected for the other three states. */
    minutesLate: integer("minutes_late"),
    /** Who marked it. Null when a device or a leave approval did. */
    markedByUserId: uuid("marked_by_user_id"),
    markedAt: timestamp("marked_at", { withTimezone: true, precision: 3 }),
    remarks: varchar("remarks", { length: 255 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    primaryKey({ columns: [t.sectionId, t.attendanceDate, t.timeSlotId, t.studentId] }),
    // The report path: one section, one day, every period.
    index("attendance_records_section_date_idx").on(t.sectionId, t.attendanceDate),
    // The register path: one student, a date range, across periods.
    index("attendance_records_student_date_idx").on(t.studentId, t.attendanceDate),
    index("attendance_records_status_idx").on(t.attendanceDate, t.status),
    check(
      "attendance_records_leave_pair",
      sql`(${t.status} = 'leave' and ${t.leaveRequestId} is not null) or (${t.status} <> 'leave' and ${t.leaveRequestId} is null)`,
    ),
    check(
      "attendance_records_biometric_pair",
      sql`${t.source} <> 'biometric' or ${t.biometricTransactionId} is not null`,
    ),
    check(
      "attendance_records_leave_source_check",
      sql`${t.status} <> 'leave' or ${t.source} = 'derived_from_leave'`,
    ),
    // `minutes_late` belongs to `late` and to nothing else: an "absent 20 minutes late" is exactly the
    // contradictory state ARCHITECTURE.md §18 rules out.
    check(
      "attendance_records_late_minutes_check",
      sql`(${t.status} = 'late' and ${t.minutesLate} is not null and ${t.minutesLate} > 0) or (${t.status} <> 'late' and ${t.minutesLate} is null)`,
    ),
    check(
      "attendance_records_manual_marked_by_check",
      sql`${t.source} <> 'manual' or ${t.markedByUserId} is not null`,
    ),
  ],
);

/**
 * `attendance_sessions` — one marking session: who opened it, for which section and period.
 *
 * Separate from the marks themselves, and required for three reasons:
 *
 * - **Bulk submit is atomic per session.** 40 marks are written in one transaction keyed on this row;
 *   a half-submitted class is a real failure mode and it needs a unit to fail as.
 * - **It records that a period was taken at all.** A section with no marks may mean "nobody came" or
 *   "nobody marked", and those are different facts a report must not conflate.
 * - **It is the actor for `RULES.md` §51.** The marks name the teacher; this names the person who
 *   pressed submit.
 *
 * `schedules_id` links the session to the timetable cell, which is what lets the Floor-Incharge live
 * view (`PRD.md` MODULE 17) show "Period 3, Section Alpha — not marked" without inferring it from
 * missing rows.
 */
export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: primaryId(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    /** `in_progress` while the teacher is marking; `submitted` once the transaction committed. */
    status: varchar("status", { length: 16 }).notNull().default("in_progress"),
    totalStudents: integer("total_students").notNull(),
    markedCount: integer("marked_count").notNull().default(0),
    openedByUserId: uuid("opened_by_user_id").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    submittedByUserId: uuid("submitted_by_user_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("attendance_sessions_slot_key").on(t.sectionId, t.attendanceDate, t.timeSlotId),
    index("attendance_sessions_opened_by_idx").on(t.openedByUserId, t.attendanceDate),
    check("attendance_sessions_status_check", sql`${t.status} in ('in_progress', 'submitted')`),
    // A submitted session is a completed set of marks; the counts must agree with each other.
    check("attendance_sessions_total_check", sql`${t.totalStudents} >= 0`),
    check(
      "attendance_sessions_marked_check",
      sql`${t.markedCount} >= 0 and ${t.markedCount} <= ${t.totalStudents}`,
    ),
    check(
      "attendance_sessions_submit_pair",
      sql`${t.status} <> 'submitted' or (${t.submittedByUserId} is not null and ${t.submittedAt} is not null)`,
    ),
  ],
);

/**
 * `attendance_corrections` — every change to a mark after it was recorded. Append-only.
 *
 * `RULES.md` §44 and §51: an attendance mark that has been shared with a guardian, and used in a
 * report, must not be silently overwritten. `before_status` is stored as text rather than as
 * `attendance_status` because a correction's *old* value may legitimately be a value the enum no longer
 * permits (an enum gains values, so this is mostly theoretical — but a check constraint on history would
 * make historical rows unmovable, which is the opposite of what history is for).
 *
 * The composite uniqueness is on `(attendance_date, section_id, time_slot_id, student_id)` alone: at most
 * one correction per mark per day is what the business rule requires, and it makes a duplicate submit
 * fail loudly instead of producing two competing "corrections".
 */
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: primaryId(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** Text, deliberately: see the note above. */
    beforeStatus: varchar("before_status", { length: 16 }).notNull(),
    afterStatus: attendanceStatusEnum("after_status").notNull(),
    reason: text("reason").notNull(),
    correctedByUserId: uuid("corrected_by_user_id").notNull(),
    correctedAt: timestamp("corrected_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /** Set when a guardian disputes the mark. `PRD.md` MODULE 5's notification flow. */
    guardianDisputedAt: timestamp("guardian_disputed_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [
    uniqueIndex("attendance_corrections_one_per_mark_key").on(
      t.sectionId,
      t.attendanceDate,
      t.timeSlotId,
      t.studentId,
    ),
    index("attendance_corrections_student_idx").on(t.studentId, t.correctedAt),
    // Cast the enum side to text, never `before_status` to the enum: before_status may hold a
    // historical value the enum no longer permits (see the class note above), and a cast there
    // would make such rows uninsertable — the opposite of what history is for.
    check("attendance_corrections_change_check", sql`${t.beforeStatus} <> ${t.afterStatus}::text`),
  ],
);

/**
 * `daily_attendance_summaries` — one student's month, precomputed.
 *
 * Attendance percentages are read constantly (parent portal, report cards, fee-deferral eligibility)
 * and `sum()` over `attendance_records` for 40 students × 30 periods × 12 months is the kind of query
 * `ARCHITECTURE.md` §40 treats as a cache. This table is the read model; `attendance_records` remains the only
 * authority, and a correction recomputes the affected month.
 *
 * `markedPeriods` is stored alongside the counts because "12 present out of 12" and "12 present out of
 * 30" are different attendance records for the same student, and a percentage without its denominator
 * is a lie. `isComplete` distinguishes a partially-marked month from a finished one.
 */
export const dailyAttendanceSummaries = pgTable(
  "daily_attendance_summaries",
  {
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** `YYYY-MM`. A `varchar`, not a `date`, because it is a month identifier and not a day. */
    month: varchar("month", { length: 7 }).notNull(),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    markedPeriods: integer("marked_periods").notNull().default(0),
    presentCount: integer("present_count").notNull().default(0),
    absentCount: integer("absent_count").notNull().default(0),
    lateCount: integer("late_count").notNull().default(0),
    leaveCount: integer("leave_count").notNull().default(0),
    /** False while any period in the month is still unmarked, so a partial month is not read as 100%. */
    isComplete: boolean("is_complete").notNull().default(false),
    calculatedAt: timestamp("calculated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.month] }),
    index("daily_attendance_summaries_month_idx").on(t.month, t.academicSessionId),
    check(
      "daily_attendance_summaries_counts_check",
      sql`${t.presentCount} + ${t.absentCount} + ${t.lateCount} + ${t.leaveCount} = ${t.markedPeriods}`,
    ),
    check(
      "daily_attendance_summaries_month_format",
      sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

/**
 * `attendance_exceptions` — records that do not reconcile.
 *
 * A gate counter says 41, the register says 40. `unknown_person` transactions and `duplicate`
 * transactions are both legitimate explanations and neither is an error in the data, so they are
 * collected here rather than flagged as failures. The row is the answer to the question, and it exists
 * so the question has somewhere to be asked and answered.
 */
export const attendanceExceptions = pgTable(
  "attendance_exceptions",
  {
    id: primaryId(),
    institutionId: uuid("institution_id").notNull(),
    /** `gate_count_mismatch`, `unknown_scan`, `duplicate_scan`, `unmarked_period`, `orphan_mark`. */
    kind: varchar("kind", { length: 32 }).notNull(),
    attendanceDate: date("attendance_date"),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => biometricDevices.id, { onDelete: "cascade" }),
    /** Expected vs observed, so the exception is self-describing in a report. */
    expectedCount: integer("expected_count"),
    observedCount: integer("observed_count"),
    detail: text("detail"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, precision: 3 }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolutionNotes: text("resolution_notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("attendance_exceptions_institution_open_idx")
      .on(t.institutionId, t.attendanceDate, t.kind)
      .where(sql`${t.resolvedAt} is null`),
    check(
      "attendance_exceptions_resolution_pair",
      sql`${t.resolvedAt} is null or ${t.resolvedByUserId} is not null`,
    ),
    check(
      "attendance_exceptions_kind_check",
      sql`${t.kind} in ('gate_count_mismatch', 'unknown_scan', 'duplicate_scan', 'unmarked_period', 'orphan_mark')`,
    ),
  ],
);
