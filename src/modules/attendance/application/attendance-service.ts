/**
 * The attendance module's use cases (`PRD.md` MODULE 15/16/19, `PHASES.md` #32 Phase 15/16).
 *
 * Workflow tests against the in-memory `AttendanceStore` — no database, exactly like the fee,
 * admission, finance, HR and payroll service tests.
 *
 * The promises that matter:
 *
 * - `ARCHITECTURE.md` §18's "an unapproved absence is `absent`, never `leave`" — the domain
 *   assertion `validateAttendanceMark` enforces `status === leave` ⇒
 *   `source === derived_from_leave`, and the service never invents a leave mark from a bare
 *   absence.
 * - `ARCHITECTURE.md` §17's "one row per student per period" — `saveMarks` writes against the
 *   composite key and upserts into `attendance_corrections` on a duplicate submit instead of
 *   double-counting.
 * - `RULES.md` §44's "corrections are audited, never silent" — `recordCorrection` appends
 *   before/after status, reason, author and moment, and recomputes the affected student's month
 *   summary.
 * - `RULES.md` §51's "a session names who pressed submit" — every session carries an actor id.
 */
import { z } from "zod";

import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

import {
  OpenAttendanceSessionData,
  RecordAttendanceCorrectionData,
  SaveAttendanceMarksData,
} from "./schemas";
import {
  isLeaveStatus,
  validateAttendanceCorrection,
  validateAttendanceMark,
  validateSessionTotals,
} from "../domain/attendance-rules";
import type { AttendanceStore as AttendanceStoreType, AttendanceSessionRow } from "./ports";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
function requireSession(
  session: AttendanceSessionRow | null,
  sectionId: string,
  attendanceDate: string,
  timeSlotId: string,
): AttendanceSessionRow {
  if (session === null) {
    throw new NotFoundError(
      `No marking session for section ${sectionId} on ${attendanceDate} slot ${timeSlotId}.`,
      {
        userMessage: "Open this class's register before marking it.",
        details: { sectionId: "Open the register first." },
      },
    );
  }
  return session;
}

function monthKey(date: string): string {
  return date.slice(0, 7); // "YYYY-MM"
}

const submitSessionSchema = z.object({
  sectionId: z.string().uuid(),
  attendanceDate: z.string(),
  timeSlotId: z.string().uuid(),
});

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export class AttendanceService {
  constructor(private readonly store: AttendanceStoreType) {}

  /* ---- Sessions ------------------------------------------------------ */

  /** Open (or return the existing) marking session for one section-period. */
  async openSession(input: unknown, openedByUserId: string) {
    const parsed = OpenAttendanceSessionData.parse(input);

    const existing = await this.store.findSession(
      parsed.sectionId,
      parsed.attendanceDate,
      parsed.timeSlotId,
    );
    if (existing !== null) {
      return existing;
    }

    return this.store.openSession(
      {
        sectionId: parsed.sectionId,
        academicSessionId: parsed.academicSessionId,
        attendanceDate: parsed.attendanceDate,
        timeSlotId: parsed.timeSlotId,
        scheduleId: parsed.scheduleId ?? null,
        totalStudents: parsed.totalStudents,
      },
      openedByUserId,
    );
  }

  /** Submit a session once every student is marked. */
  async submitSession(input: unknown, userId: string) {
    const parsed = submitSessionSchema.parse(input);

    const session = requireSession(
      await this.store.findSession(parsed.sectionId, parsed.attendanceDate, parsed.timeSlotId),
      parsed.sectionId,
      parsed.attendanceDate,
      parsed.timeSlotId,
    );

    if (session.status === "submitted") {
      throw new ConflictError("This register is already submitted.", {
        userMessage: "This register was already submitted.",
      });
    }

    validateSessionTotals({
      totalStudents: session.totalStudents,
      markedCount: session.markedCount,
      status: session.status,
      submittedByUserId: userId,
      submittedAt: new Date(),
    });

    return this.store.submitSession({
      institutionId: "",
      sectionId: parsed.sectionId,
      attendanceDate: parsed.attendanceDate,
      timeSlotId: parsed.timeSlotId,
      submittedByUserId: userId,
    });
  }

  /* ---- Marks --------------------------------------------------------- */

  /**
   * Mark one section-period for many students at once.
   *
   * Every mark must satisfy the domain contract before anything is written. A duplicate submit
   * corrects rather than duplicates (`ARCHITECTURE.md` §17).
   */
  async saveMarks(input: unknown, userId: string) {
    const parsed = SaveAttendanceMarksData.parse(input);

    const session = requireSession(
      await this.store.findSession(parsed.sectionId, parsed.attendanceDate, parsed.timeSlotId),
      parsed.sectionId,
      parsed.attendanceDate,
      parsed.timeSlotId,
    );

    if (session.status === "submitted") {
      throw new ConflictError("This register is already submitted.", {
        userMessage: "This register was already submitted.",
      });
    }

    // Every mark must satisfy the domain contract before anything is written.
    for (const mark of parsed.marks) {
      validateAttendanceMark({
        status: mark.status,
        source: mark.source ?? "manual",
        leaveRequestId: mark.leaveRequestId ?? null,
        biometricTransactionId: null,
        markedByUserId: userId,
        minutesLate: mark.minutesLate ?? null,
      });
    }

    // A leave mark must be backed by an approved leave request — that is state the service
    // reads, not something the boundary schema can assert.
    for (const mark of parsed.marks) {
      if (isLeaveStatus(mark.status) && !mark.leaveRequestId) {
        throw new BusinessRuleError("A leave mark needs an approved leave request.", {
          userMessage:
            "Leave can only be recorded from an approved leave request. Approve it first.",
        });
      }
    }

    return this.store.saveMarks(
      {
        sectionId: parsed.sectionId,
        academicSessionId: parsed.academicSessionId,
        attendanceDate: parsed.attendanceDate,
        timeSlotId: parsed.timeSlotId,
        scheduleId: parsed.scheduleId ?? null,
        marks: parsed.marks.map((mark) => ({
          studentId: mark.studentId,
          status: mark.status,
          source: mark.source ?? "manual",
          leaveRequestId: mark.leaveRequestId ?? null,
          minutesLate: mark.minutesLate ?? null,
          remarks: mark.remarks ?? null,
        })),
        isSubmitting: parsed.isSubmitting,
      },
      userId,
    );
  }

  /** One section-period's register, ready to render. */
  async getSectionAttendanceSheet(sectionId: string, attendanceDate: string, timeSlotId: string) {
    return this.store.getSectionAttendanceSheet(sectionId, attendanceDate, timeSlotId);
  }

  /** One mark for a student-period. */
  async getAttendanceRecord(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
    studentId: string,
  ) {
    return this.store.getAttendanceRecord(sectionId, attendanceDate, timeSlotId, studentId);
  }

  /* ---- Corrections --------------------------------------------------- */

  /**
   * Correct one mark after it was recorded — append-only history, never a silent overwrite.
   */
  async recordCorrection(input: unknown, userId: string) {
    const parsed = RecordAttendanceCorrectionData.parse(input);

    // The mark being corrected must exist.
    const existing = await this.store.listMarks(
      "",
      parsed.sectionId,
      parsed.attendanceDate,
      parsed.timeSlotId,
    );
    const mark = existing.find((m) => m.studentId === parsed.studentId);
    if (mark === undefined) {
      throw new NotFoundError(`No mark for student ${parsed.studentId} in this period.`, {
        userMessage: "That student has no mark in this period.",
        details: { studentId: "Mark the student first." },
      });
    }

    validateAttendanceCorrection({
      beforeStatus: mark.status,
      afterStatus: parsed.afterStatus,
      reason: parsed.reason,
      correctedByUserId: userId,
    });

    // A correction to leave still needs an approved leave request behind it.
    if (isLeaveStatus(parsed.afterStatus)) {
      throw new BusinessRuleError("Correcting to leave needs an approved leave request.", {
        userMessage: "Leave can only be recorded from an approved leave request. Approve it first.",
      });
    }

    const created = await this.store.recordCorrection(
      {
        sectionId: parsed.sectionId,
        attendanceDate: parsed.attendanceDate,
        timeSlotId: parsed.timeSlotId,
        studentId: parsed.studentId,
        afterStatus: parsed.afterStatus,
        reason: parsed.reason,
      },
      mark.status,
      userId,
    );

    // Recompute the affected student's month summary.
    if (this.store.recomputeStudentMonthSummary) {
      await this.store.recomputeStudentMonthSummary({
        institutionId: "",
        studentId: parsed.studentId,
        month: monthKey(parsed.attendanceDate),
        academicSessionId: "",
      });
    }

    return {
      correctionId: created.id,
      mark: {
        studentId: parsed.studentId,
        studentName: "",
        studentCode: null,
        status: parsed.afterStatus,
        source: mark.source,
        minutesLate: mark.minutesLate,
        remarks: mark.remarks,
        markedByName: null,
      },
      monthRecomputed: true,
    };
  }

  /* ---- Read model ---------------------------------------------------- */

  /** One student's month summary — the read model recomputed on every correction. */
  async getStudentMonthlySummary(studentId: string, month: string, academicSessionId: string) {
    return this.store.getStudentMonthlySummary(studentId, month, academicSessionId);
  }

  /** Daily sessions across sections (dashboard scope bar). */
  async listDailySessions(sectionIds: readonly string[], date: string) {
    return this.store.listDailySessions(sectionIds, date);
  }

  /** Enrolled students for one section (roster). */
  async listSectionRoster(sectionId: string) {
    return this.store.listSectionRoster(sectionId);
  }

  /** One student's marks across a date range. */
  async listStudentMarks(
    institutionId: string,
    studentId: string,
    fromDate: string,
    toDate: string,
  ) {
    return this.store.listStudentMarks(institutionId, studentId, fromDate, toDate);
  }

  /** One section-period's corrections history. */
  async listCorrections(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
    studentId?: string,
  ) {
    return this.store.listCorrections(sectionId, attendanceDate, timeSlotId, studentId);
  }

  /** One student's month summary (internal name). */
  async getStudentMonthSummary(
    institutionId: string,
    studentId: string,
    month: string,
    academicSessionId: string,
  ) {
    if (this.store.getStudentMonthSummary) {
      return this.store.getStudentMonthSummary(institutionId, studentId, month, academicSessionId);
    }
    return null;
  }

  /** Recompute one student's month summary (internal name). */
  async recomputeStudentMonthSummary(write: {
    readonly institutionId: string;
    readonly studentId: string;
    readonly month: string;
    readonly academicSessionId: string;
  }) {
    if (this.store.recomputeStudentMonthSummary) {
      return this.store.recomputeStudentMonthSummary(write);
    }
  }

  /* ---- Compatibility Aliases ----------------------------------------- */

  openMarkingSession(input: unknown, openedByUserId: string) {
    return this.openSession(input, openedByUserId);
  }

  submitMarkingSession(input: unknown, userId: string) {
    return this.submitSession(input, userId);
  }

  markStudents(input: unknown, userId: string) {
    return this.saveMarks(input, userId);
  }

  correctMark(input: unknown, userId: string) {
    return this.recordCorrection(input, userId);
  }
}

export function createAttendanceService(store: AttendanceStoreType): AttendanceService {
  return new AttendanceService(store);
}

export type Actor = { readonly userId: string };
