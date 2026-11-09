/**
 * Input contracts for floor operations use cases (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 */

import { z } from "zod";

import { calendarDate } from "@/shared/validation/fields";

import {
  EXTRA_PERIOD_REASONS,
  FLOOR_SNAPSHOT_STATUSES,
  INCIDENT_KINDS,
  INCIDENT_SEVERITIES,
  REPLACEMENT_RESOLUTIONS,
  TEACHER_ABSENCE_SCOPES,
  TEACHER_ABSENCE_SOURCES,
} from "../domain/floor-rules";

const uuid = z.string().uuid("A valid UUID reference is required.");

/* -------------------------------------------------------------------------- */
/* Live Snapshot Captures                                                     */
/* -------------------------------------------------------------------------- */

export const CaptureLiveSnapshotData = z.object({
  floorId: uuid,
  scheduleId: uuid,
  attendanceDate: calendarDate("Attendance date"),
  timeSlotId: uuid,
  sectionId: uuid.nullish(),
  subjectId: uuid.nullish(),
  teacherId: uuid.nullish(),
  substituteTeacherId: uuid.nullish(),
  status: z.enum(FLOOR_SNAPSHOT_STATUSES),
  attendanceSubmitted: z.boolean().nullish(),
});

export type CaptureLiveSnapshotInput = z.infer<typeof CaptureLiveSnapshotData>;

/* -------------------------------------------------------------------------- */
/* Teacher Absences                                                           */
/* -------------------------------------------------------------------------- */

export const RecordTeacherAbsenceData = z.object({
  institutionId: uuid,
  employeeId: uuid,
  absenceDate: calendarDate("Absence date"),
  scope: z.enum(TEACHER_ABSENCE_SCOPES).default("day"),
  startTimeSlotId: uuid.nullish(),
  endTimeSlotId: uuid.nullish(),
  reason: z.string().trim().max(500).nullish(),
  source: z.enum(TEACHER_ABSENCE_SOURCES).default("manual"),
  leaveRequestId: uuid.nullish(),
});

export type RecordTeacherAbsenceInput = z.infer<typeof RecordTeacherAbsenceData>;

/* -------------------------------------------------------------------------- */
/* Extra Periods & Substitutions                                              */
/* -------------------------------------------------------------------------- */

export const CreateExtraPeriodData = z.object({
  institutionId: uuid,
  academicSessionId: uuid,
  replacesScheduleId: uuid.nullish(),
  teacherId: uuid.nullish(),
  sectionId: uuid.nullish(),
  timeSlotId: uuid,
  extraDate: calendarDate("Extra date"),
  reason: z.enum(EXTRA_PERIOD_REASONS),
  resolution: z.enum(REPLACEMENT_RESOLUTIONS).nullish(),
  isPayable: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullish(),
});

export type CreateExtraPeriodInput = z.infer<typeof CreateExtraPeriodData>;

export const ApproveExtraPeriodData = z.object({
  extraPeriodId: uuid,
});

export type ApproveExtraPeriodInput = z.infer<typeof ApproveExtraPeriodData>;

/* -------------------------------------------------------------------------- */
/* Floor Incident Reports                                                     */
/* -------------------------------------------------------------------------- */

export const CreateIncidentReportData = z.object({
  institutionId: uuid,
  campusId: uuid.nullish(),
  floorId: uuid.nullish(),
  sectionId: uuid.nullish(),
  severity: z.enum(INCIDENT_SEVERITIES),
  kind: z.enum(INCIDENT_KINDS),
  description: z.string().trim().min(3, "Incident description must be at least 3 characters.").max(2000),
  occurredAt: z.coerce.date().default(() => new Date()),
});

export type CreateIncidentReportInput = z.infer<typeof CreateIncidentReportData>;

export const EscalateIncidentReportData = z.object({
  incidentId: uuid,
  escalatedToUserId: uuid,
});

export type EscalateIncidentReportInput = z.infer<typeof EscalateIncidentReportData>;

export const ResolveIncidentReportData = z.object({
  incidentId: uuid,
  resolutionNotes: z.string().trim().min(2, "Resolution notes are required.").max(2000),
});

export type ResolveIncidentReportInput = z.infer<typeof ResolveIncidentReportData>;

/* -------------------------------------------------------------------------- */
/* Floor Assignments                                                          */
/* -------------------------------------------------------------------------- */

export const AssignFloorInchargeData = z.object({
  institutionId: uuid,
  floorId: uuid,
  userId: uuid,
  assignedFrom: z.coerce.date().nullish(),
  assignedUntil: z.coerce.date().nullish(),
});

export type AssignFloorInchargeInput = z.infer<typeof AssignFloorInchargeData>;
