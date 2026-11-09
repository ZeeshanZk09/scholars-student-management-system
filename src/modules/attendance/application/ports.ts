/**
 * What the attendance service needs from the data layer (`src/modules/README.md`: ports in,
 * Drizzle out). Nothing here imports `db`, `drizzle-orm` or a table, so the service is tested
 * against `testing/fakes.ts` without a database — the same contract the fee, admission, finance
 * and HR stores fulfil.
 *
 * Attendance marks are written per student per period, keyed on the composite
 * `(sectionId, attendanceDate, timeSlotId, studentId)`. A marking session gates the whole bulk
 * write: 40 marks in one transaction, one session row to fail as.
 */

import type { AttendanceSource, AttendanceStatus } from "../domain/attendance-rules";

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

/** One section-period marking session. */
export interface AttendanceSessionRow {
  readonly id: string;
  readonly institutionId?: string | null;
  readonly sectionId: string;
  readonly academicSessionId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly scheduleId: string | null;
  readonly status: "in_progress" | "submitted";
  readonly totalStudents: number;
  readonly markedCount: number;
  readonly openedByUserId: string;
  readonly openedAt: Date;
  readonly submittedByUserId: string | null;
  readonly submittedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** One student's mark for a period — the register row. */
export interface AttendanceRecordRow {
  readonly sectionId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly studentId: string;
  readonly status: AttendanceStatus;
  readonly source: AttendanceSource;
  readonly leaveRequestId: string | null;
  readonly biometricTransactionId: string | null;
  readonly minutesLate: number | null;
  readonly markedByUserId: string | null;
  readonly markedAt: Date | null;
  readonly remarks: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** One append-only correction to a mark. */
export interface AttendanceCorrectionRow {
  readonly id: string;
  readonly sectionId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly studentId: string;
  readonly beforeStatus: string;
  readonly afterStatus: AttendanceStatus;
  readonly reason: string;
  readonly correctedByUserId: string;
  readonly correctedAt: Date;
  readonly guardianDisputedAt: Date | null;
}

/** A student's month summary — the read model recomputed on every correction. */
export interface DailyAttendanceSummaryRow {
  readonly studentId: string;
  readonly month: string;
  readonly academicSessionId: string;
  readonly markedPeriods: number;
  readonly presentCount: number;
  readonly absentCount: number;
  readonly lateCount: number;
  readonly leaveCount: number;
  readonly isComplete: boolean;
  readonly calculatedAt: Date;
}

/** One enrolled student for the roll-call roster. */
export interface StudentSectionRosterItem {
  readonly studentId: string;
  readonly rollNumber: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly studentStatus: string;
}

/** The full sheet the register UI renders: session + marks + roster + corrections. */
export interface AttendanceSheetView {
  readonly session: AttendanceSessionRow | null;
  readonly records: readonly AttendanceRecordRow[];
  readonly roster: readonly StudentSectionRosterItem[];
  readonly corrections: readonly AttendanceCorrectionRow[];
}

/* -------------------------------------------------------------------------- */
/* Input models for port operations                                           */
/* -------------------------------------------------------------------------- */

export interface OpenAttendanceSessionPortInput {
  readonly sectionId: string;
  readonly academicSessionId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly scheduleId?: string | null;
  readonly totalStudents: number;
}

export interface SaveAttendanceMarksPortInput {
  readonly sectionId: string;
  readonly academicSessionId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly scheduleId?: string | null;
  readonly marks: readonly {
    readonly studentId: string;
    readonly status: AttendanceStatus;
    readonly source?: AttendanceSource | null;
    readonly leaveRequestId?: string | null;
    readonly minutesLate?: number | null;
    readonly remarks?: string | null;
  }[];
  readonly isSubmitting?: boolean;
}

export interface RecordAttendanceCorrectionPortInput {
  readonly sectionId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly studentId: string;
  readonly afterStatus: AttendanceStatus;
  readonly reason: string;
}

/* -------------------------------------------------------------------------- */
/* The port                                                                   */
/* -------------------------------------------------------------------------- */

/** The persistence contract the Drizzle store fulfils and the fakes mirror. */
export interface AttendanceStore {
  /* ---- Sessions ---------------------------------------------------------- */

  findSession(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<AttendanceSessionRow | null>;

  getMarkingSession(
    institutionId: string,
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<AttendanceSessionRow | null>;

  openSession(
    data: OpenAttendanceSessionPortInput,
    openedByUserId: string,
  ): Promise<AttendanceSessionRow>;

  /** Submit a session once every student is marked. */
  submitSession(write: {
    readonly institutionId: string;
    readonly sectionId: string;
    readonly attendanceDate: string;
    readonly timeSlotId: string;
    readonly submittedByUserId: string;
  }): Promise<{ readonly version: number }>;

  /* ---- Marks ------------------------------------------------------------- */

  /** Write one mark per student; a duplicate submit corrects rather than duplicates. */
  saveMarks(
    data: SaveAttendanceMarksPortInput,
    userId: string,
  ): Promise<{
    readonly session: AttendanceSessionRow;
    readonly recordsCount: number;
    readonly writtenCount?: number;
    readonly correctedCount?: number;
  }>;

  /** One section-period's register, with student names for the UI. */
  listMarks(
    institutionId: string,
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<readonly AttendanceRecordRow[]>;

  /** One student's marks across a date range (student detail page). */
  listStudentMarks(
    institutionId: string,
    studentId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly AttendanceRecordRow[]>;

  /** One mark for a student-period. */
  getAttendanceRecord(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
    studentId: string,
  ): Promise<AttendanceRecordRow | null>;

  /* ---- Corrections ------------------------------------------------------- */

  /** Append one correction to a mark, recording before/after status, reason, author and moment. */
  recordCorrection(
    data: RecordAttendanceCorrectionPortInput,
    beforeStatus: AttendanceStatus,
    correctedByUserId: string,
  ): Promise<AttendanceCorrectionRow>;

  listCorrections(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
    studentId?: string,
  ): Promise<readonly AttendanceCorrectionRow[]>;

  /* ---- Sheet / roster / summary ------------------------------------------ */

  /** Everything the register sheet needs in one call. */
  getSectionAttendanceSheet(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<AttendanceSheetView>;

  /** Enrolled students for one section. */
  listSectionRoster(sectionId: string): Promise<readonly StudentSectionRosterItem[]>;

  /** One student's month summary — recomputed on every correction. */
  getStudentMonthlySummary(
    studentId: string,
    month: string,
    academicSessionId: string,
  ): Promise<DailyAttendanceSummaryRow | null>;

  /** Daily sessions across sections (dashboard scope bar). */
  listDailySessions(
    sectionIds: readonly string[],
    date: string,
  ): Promise<readonly AttendanceSessionRow[]>;

  recomputeStudentMonthSummary(write: {
    readonly institutionId: string;
    readonly studentId: string;
    readonly month: string;
    readonly academicSessionId: string;
  }): Promise<void>;

  getStudentMonthSummary(
    institutionId: string,
    studentId: string,
    month: string,
    academicSessionId: string,
  ): Promise<DailyAttendanceSummaryRow | null>;
}
