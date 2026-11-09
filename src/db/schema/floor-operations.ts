/**
 * Floor operations: teacher absence, replacement periods, and the live operational view.
 *
 * `PRD.md` MODULE 15/17/19 and `ARCHITECTURE.md` §19. This is the module that answers "a teacher is
 * absent, what happened to their periods?" — and the requirement that shapes it is §19's: **record
 * the operational event; let Payroll decide whether it has a financial consequence.**
 *
 * ## The decision boundary
 *
 * `ARCHITECTURE.md` §19 and `PRD.md` MODULE 19 pull in opposite directions on paper. MODULE 19 asks
 * floor operations for "extra periods approved for payroll"; §19 says floor operations does not decide
 * financial consequences. The resolution implemented here:
 *
 * - `teacher_absences` and `extra_periods` are **operational** facts, written by the floor-incharge,
 *   with no money on them at all. No rate, no amount, no currency.
 * - `extra_periods.is_payable` is a **flag, not a calculation**. Payroll reads it and applies
 *   `salaryStructures.unitRate`. Floor operations never multiplies anything by anything.
 *
 * So a payable extra period is recorded as approved and payable; the amount is computed once, in
 * payroll, from a dated rate. If the rate is corrected next month, last month's payroll is unchanged
 * because last month never stored an amount.
 *
 * ## The replacement must reference the original period
 *
 * `replacesScheduleId` is `NOT NULL` on a `kind = 'replacement'` row. This is what makes "the absent
 * teacher's period" a fact rather than a guess: a report can join the extra period back to the
 * timetable cell it covers, so a substitute's workload is attributable to the lesson it covered and
 * not merely to a section and a clock time.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt, version } from "./_conventions";
import { extraPeriodReasonEnum, replacementResolutionEnum } from "./_enums";
import { academicSessions, campuses, floors, institutions } from "./institution";
import { schedules, sections, subjects, timeSlots } from "./academic";
import { employees } from "./hr";

/**
 * `floor_live_snapshots` — the Floor-Incharge's live view of a floor, one row per period.
 *
 * `PRD.md` MODULE 17 requires a live view of every floor in the Floor-Incharge's scope showing classes,
 * teachers and their attendance status. **This is a snapshot, not a projection of `schedules`** — and
 * that distinction is the reason it exists as a table:
 *
 * A live view is read every few seconds by possibly several devices at once, and each read needs a
 * uniform "as at" time. Assembling it live from `schedules` + `teacher_absences` + `attendance_sessions`
 * would (a) take three different reads at three different instants, so two cells of one grid could
 * disagree about "now", and (b) run on the read path every refresh. Materialising it means the view is
 * written once per period by the floor module and read many times cheaply.
 *
 * `asAt` is stored on every row precisely so a stale snapshot is detectable: if `now() - as_at` exceeds
 * the period, the view must say so rather than silently showing the last known state as current.
 *
 * `status` is a compact per-cell state (`as_scheduled`, `substitute`, `free`, `unmarked`, `cancelled`)
 * derived by the floor module. It is a summary of operational state, not a business decision — no
 * money, no attendance mark.
 */
export const floorLiveSnapshots = pgTable(
  "floor_live_snapshots",
  {
    /**
     * Row identity only. The row's *meaning* is `(floor, schedule, attendanceDate)`, which is what the
     * unique index below enforces and what a re-snapshot upserts on. The `id` exists because every other
     * table has one: it gives the row a stable handle for audit and logging, and lets a future
     * complaint or incident reference the exact cell state it saw. Without it this is the one table in
     * the schema with no primary key, and a table without a key cannot be replica-identified.
     */
    id: primaryId(),
    floorId: uuid("floor_id")
      .notNull()
      .references(() => floors.id, { onDelete: "cascade" }),
    /** The timetable cell this snapshot describes. One row per (floor, period, schedule). */
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    attendanceDate: date("attendance_date").notNull(),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    /** The teacher as timetabled. Null when the period is free or the cell was cancelled. */
    teacherId: uuid("teacher_id"),
    /** The teacher actually present, when a substitution is in effect. */
    substituteTeacherId: uuid("substitute_teacher_id"),
    /**
     * `as_scheduled` | `substitute` | `free` | `unmarked` | `cancelled`.
     * `unmarked` means the period is running and attendance has not been submitted — the single most
     * useful thing this view exists to surface.
     */
    status: varchar("status", { length: 16 }).notNull(),
    /** Whether the period's attendance has been submitted. Null when the period is free or cancelled. */
    attendanceSubmitted: boolean("attendance_submitted"),
    /** When this row was computed. Staleness is visible, which is the point. */
    asAt: timestamp("as_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    // One snapshot per (floor, date, period, cell). Re-snapshotting updates the row rather than
    // appending, so the view is always one row per cell.
    uniqueIndex("floor_live_snapshots_unique").on(t.floorId, t.scheduleId, t.attendanceDate),
    index("floor_live_snapshots_floor_date_idx").on(t.floorId, t.attendanceDate, t.timeSlotId),
    index("floor_live_snapshots_teacher_idx").on(t.teacherId, t.attendanceDate),
    check(
      "floor_live_snapshots_status_check",
      sql`${t.status} in ('as_scheduled', 'substitute', 'free', 'unmarked', 'cancelled')`,
    ),
    // A cell cannot claim to be a substitution without naming the substitute. This is the check that
    // stops the live view from showing a period with nobody in it while the roster says someone is.
    check(
      "floor_live_snapshots_substitute_pair",
      sql`${t.status} <> 'substitute' or ${t.substituteTeacherId} is not null`,
    ),
    check(
      "floor_live_snapshots_attendance_pair",
      sql`${t.attendanceSubmitted} is null or ${t.status} not in ('free', 'cancelled')`,
    ),
  ],
);

/**
 * `teacher_absences` — a teacher is not present for a date or a period.
 *
 * `PRD.md` MODULE 15. **Operational, not financial:** there is no deduction, no rate, no currency here.
 * The row says a person was absent; what that costs is `employee_attendance` (a fact) and payroll (a
 * calculation, from the dated `salary_structures`).
 *
 * `absenceDate` alone would make a part-day absence unrepresentable, so `startTimeSlotId` /
 * `endTimeSlotId` bracket it. Both null means the whole day. `scope` names which of the three it is, so
 * a report need not infer it from two nulls — the same reason `floor_assignments` and
 * `leave_requests` carry explicit scopes.
 *
 * `reportedByUserId` is the Floor-Incharge or class teacher who noticed. An absence detected by a
 * biometric device (`source = 'biometric'`) has no human reporter, and that must not be forced into the
 * column as a fake actor.
 */
export const teacherAbsences = pgTable(
  "teacher_absences",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    absenceDate: date("absence_date").notNull(),
    /** `day`, `period`, `partial`. Explains the two nullable ids below. */
    scope: varchar("scope", { length: 16 }).notNull().default("day"),
    /** Both null for `day`; both set for `period`; only the first set for `partial`. */
    startTimeSlotId: uuid("start_time_slot_id").references(() => timeSlots.id, {
      onDelete: "cascade",
    }),
    endTimeSlotId: uuid("end_time_slot_id").references(() => timeSlots.id, { onDelete: "cascade" }),
    reason: text("reason"),
    /** `manual`, `biometric`, `leave_request`. The third means the absence is approved leave. */
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    /** Set when `source = 'leave_request'`, tying the absence to its approved request. */
    leaveRequestId: uuid("leave_request_id"),
    reportedByUserId: uuid("reported_by_user_id"),
    reportedAt: timestamp("reported_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("teacher_absences_employee_date_key").on(t.employeeId, t.absenceDate, t.scope),
    index("teacher_absences_date_idx").on(t.institutionId, t.absenceDate),
    index("teacher_absences_employee_idx").on(t.employeeId, t.absenceDate),
    check("teacher_absences_scope_check", sql`${t.scope} in ('day', 'period', 'partial')`),
    check(
      "teacher_absences_source_check",
      sql`${t.source} in ('manual', 'biometric', 'leave_request')`,
    ),
    check(
      "teacher_absences_day_scope_check",
      sql`${t.scope} <> 'day' or (${t.startTimeSlotId} is null and ${t.endTimeSlotId} is null)`,
    ),
    check(
      "teacher_absences_period_scope_check",
      sql`${t.scope} <> 'period' or (${t.startTimeSlotId} is not null and ${t.endTimeSlotId} is not null)`,
    ),
    check(
      "teacher_absences_partial_scope_check",
      sql`${t.scope} <> 'partial' or ${t.startTimeSlotId} is not null`,
    ),
    check(
      "teacher_absences_leave_pair",
      sql`${t.source} <> 'leave_request' or ${t.leaveRequestId} is not null`,
    ),
    check(
      "teacher_absences_reporter_pair",
      sql`${t.source} = 'biometric' or ${t.reportedByUserId} is not null`,
    ),
  ],
);

/**
 * `extra_periods` — a period created or reassigned because a teacher was absent.
 *
 * `PRD.md` MODULE 19. Three columns carry the whole design:
 *
 * - `reason` is `extra_period_reason`, whose `replacement` member is the PRD's named case: a period
 *   taken **because** a teacher is absent, which counts toward a unit-based teacher.
 * - `resolution` is what the Floor-Incharge actually did (`PRD.md` MODULE 19's list), so "the period
 *   was cancelled" and "the period ran as self-study" are distinguishable in payroll.
 * - `is_payable` is a **decision flag with an approver**, not a computed amount. `approvedByUserId`
 *   and `approvedAt` are `NOT NULL`-by-check whenever `is_payable`, because §19 says floor operations
 *   records the event and payroll consumes it — but a payable claim still needs an accountable human,
 *   or it is an unauditable financial instruction (`RULES.md` §37).
 *
 * `replacesScheduleId` is required for `kind = 'replacement'`, which is what makes the extra period
 * attributable to the lesson it covered.
 *
 * **No money columns.** Payroll joins `payroll_pay_lines` to this row and multiplies by the dated
 * `salary_structures.unitRate` at the time of calculation.
 */
export const extraPeriods = pgTable(
  "extra_periods",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    /** The timetable cell this period covers. Required for `replacement` and `substitution`. */
    replacesScheduleId: uuid("replaces_schedule_id").references(() => schedules.id, {
      onDelete: "cascade",
    }),
    /** Who taught it. Required for every resolution that put a person in a room. */
    teacherId: uuid("teacher_id"),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    extraDate: date("extra_date").notNull(),
    reason: extraPeriodReasonEnum("reason").notNull(),
    resolution: replacementResolutionEnum("resolution"),
    /**
     * Whether this period counts toward the teacher's pay. A decision, made by a person, on a date.
     * The amount is computed by payroll; see the module note above.
     */
    isPayable: boolean("is_payable").notNull().default(false),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    /** The absence that triggered it. Makes the causal chain explicit and auditable. */
    absenceId: uuid("absence_id").references(() => teacherAbsences.id, { onDelete: "set null" }),
    /** Set once payroll has consumed this period into a pay line, so it cannot be paid twice. */
    consumedByPayLineId: uuid("consumed_by_pay_line_id"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("extra_periods_teacher_idx").on(t.teacherId, t.extraDate),
    index("extra_periods_date_idx").on(t.institutionId, t.extraDate),
    index("extra_periods_payable_idx")
      .on(t.extraDate, t.teacherId)
      .where(sql`${t.isPayable} = true and ${t.consumedByPayLineId} is null`),
    // A payable extra period with no accountable approver is an unauditable payment instruction.
    check(
      "extra_periods_payable_approval_pair",
      sql`${t.isPayable} = false or (${t.approvedByUserId} is not null and ${t.approvedAt} is not null)`,
    ),
    check(
      "extra_periods_replacement_requires_schedule",
      sql`${t.reason} not in ('replacement', 'substitution') or ${t.replacesScheduleId} is not null`,
    ),
    // Only the resolutions that put a person in a room require a teacher. `test`, `self_study`,
    // `alternative_activity` and `period_cancelled` need none.
    check(
      "extra_periods_resolution_teacher_pair",
      sql`${t.resolution} is null or ${t.resolution} in ('test', 'self_study', 'alternative_activity', 'period_cancelled') or ${t.teacherId} is not null`,
    ),
    // Payable implies somebody taught it.
    check(
      "extra_periods_payable_teacher_check",
      sql`${t.isPayable} = false or ${t.teacherId} is not null`,
    ),
  ],
);

/**
 * `floor_incident_reports` — the live-view incident log.
 *
 * `PRD.md` MODULE 15 and `ARCHITECTURE.md` §19. An incident is an *operational event*: a fight, an
 * injury, a student absent from class, a device failure. It is recorded by whoever witnessed it and is
 * escalated rather than resolved here.
 *
 * Severity is a constrained `varchar` rather than a `pgEnum` because the escalation ladder is a
 * local policy: `ARCHITECTURE.md` §19 puts escalation in Floor Operations, and a hardcoded enum would
 * need a migration the first time an institution adds a level.
 *
 * `resolvedAt` requires `resolvedByUserId`, so "resolved" always names who did it.
 */
export const floorIncidentReports = pgTable(
  "floor_incident_reports",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "set null" }),
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    reportedByUserId: uuid("reported_by_user_id").notNull(),
    /** `low`, `medium`, `high`, `critical`. Institution-defined ladder; see the note above. */
    severity: varchar("severity", { length: 16 }).notNull(),
    /** `behaviour`, `injury`, `absence`, `device_failure`, `security`, `other`. */
    kind: varchar("kind", { length: 32 }).notNull(),
    description: text("description").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 }).notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    escalatedAt: timestamp("escalated_at", { withTimezone: true, precision: 3 }),
    escalatedToUserId: uuid("escalated_to_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, precision: 3 }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolutionNotes: text("resolution_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("floor_incident_reports_institution_open_idx")
      .on(t.institutionId, t.severity, t.occurredAt)
      .where(sql`${t.resolvedAt} is null`),
    index("floor_incident_reports_floor_idx").on(t.floorId, t.occurredAt),
    check(
      "floor_incident_reports_severity_check",
      sql`${t.severity} in ('low', 'medium', 'high', 'critical')`,
    ),
    check(
      "floor_incident_reports_resolution_pair",
      sql`${t.resolvedAt} is null or (${t.resolvedByUserId} is not null and ${t.resolutionNotes} is not null)`,
    ),
    check(
      "floor_incident_reports_escalation_pair",
      sql`${t.escalatedAt} is null or ${t.escalatedToUserId} is not null`,
    ),
  ],
);
