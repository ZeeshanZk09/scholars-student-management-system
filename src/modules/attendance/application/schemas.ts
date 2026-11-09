/**
 * Input contracts for every attendance use case (`PRD.md` MODULE 15/16/19,
 * `ARCHITECTURE.md` §29). Each shape is the boundary between a form and the domain:
 *
 * - **`yyyy-mm-dd` dates** — `calendarDate` refuses anything a browser date input would not send.
 * - **`status`/`source` are closed vocabularies** — the domain enum is the source of truth, and
 *   this schema restricts input to exactly those values so the domain never sees a value it must
 *   reject.
 * - **Optimistic concurrency** — every versioned write carries `expectedVersion`; a stale one is
 *   a `ConflictError`.
 *
 * What the schema cannot say — whether a leave request is approved, whether a session is already
 * submitted, whether the period is locked — is checked by the service against state it reads.
 * That split is why nothing here needs a database.
 */
import { z } from "zod";

import { calendarDate, wholeNumber } from "@/shared/validation/fields";

import { ATTENDANCE_SOURCES, ATTENDANCE_STATUSES } from "../domain/attendance-rules";

const uuid = z.uuid("A valid reference is required.");

const attendanceStatus = z.enum(ATTENDANCE_STATUSES);

const attendanceSource = z.enum(ATTENDANCE_SOURCES);

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

/** Opening a marking session for one section-period on one date. */
export const OpenAttendanceSessionData = z.object({
  sectionId: uuid,
  academicSessionId: uuid,
  attendanceDate: calendarDate("Attendance date"),
  timeSlotId: uuid,
  scheduleId: uuid.nullish(),
  totalStudents: wholeNumber("Total students", 0, 10000).default(0),
});

export type OpenAttendanceSessionInput = z.infer<typeof OpenAttendanceSessionData>;

/* -------------------------------------------------------------------------- */
/* Marks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Marking one section-period for many students at once — the highest-volume write in the
 * system (`ARCHITECTURE.md` §17).
 */
export const SaveAttendanceMarksData = z.object({
  sectionId: uuid,
  academicSessionId: uuid,
  attendanceDate: calendarDate("Attendance date"),
  timeSlotId: uuid,
  scheduleId: uuid.nullish(),
  marks: z
    .array(
      z.object({
        studentId: uuid,
        status: attendanceStatus,
        source: attendanceSource.nullish(),
        leaveRequestId: uuid.nullish(),
        minutesLate: wholeNumber("Minutes late", 0, 1440).nullish(),
        remarks: z.string().trim().max(255).nullish(),
      }),
    )
    .min(1, "Mark at least one student."),
  isSubmitting: z.boolean().default(false),
});

export type SaveAttendanceMarksInput = z.infer<typeof SaveAttendanceMarksData>;

/* -------------------------------------------------------------------------- */
/* Corrections                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Correcting one mark after it was recorded — append-only, with reason and author
 * (`RULES.md` §44).
 */
export const RecordAttendanceCorrectionData = z.object({
  sectionId: uuid,
  attendanceDate: calendarDate("Attendance date"),
  timeSlotId: uuid,
  studentId: uuid,
  afterStatus: attendanceStatus,
  reason: z.string().trim().min(1, "A reason is required.").max(1000),
});

export type RecordAttendanceCorrectionInput = z.infer<typeof RecordAttendanceCorrectionData>;
