/**
 * Floor operations domain rules (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19, `PHASES.md` §26).
 *
 * Pure business rules for floor walk-through observations, period snapshots, teacher absence
 * management, extra periods, and incident reports. Knows nothing of Next.js, Drizzle or PostgreSQL.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Vocabulary & Types                                                         */
/* -------------------------------------------------------------------------- */

export const FLOOR_SNAPSHOT_STATUSES = [
  "as_scheduled",
  "substitute",
  "free",
  "unmarked",
  "cancelled",
] as const;

export type FloorLiveSnapshotStatus = (typeof FLOOR_SNAPSHOT_STATUSES)[number];

export const EXTRA_PERIOD_REASONS = [
  "replacement",
  "substitution",
  "additional_class",
  "exam_duty",
  "invigilation",
  "other",
] as const;

export type ExtraPeriodReason = (typeof EXTRA_PERIOD_REASONS)[number];

export const REPLACEMENT_RESOLUTIONS = [
  "replacement_teacher",
  "alternative_activity",
  "test",
  "self_study",
  "period_cancelled",
] as const;

export type ReplacementResolution = (typeof REPLACEMENT_RESOLUTIONS)[number];

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_KINDS = [
  "behaviour",
  "injury",
  "absence",
  "device_failure",
  "security",
  "other",
] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const TEACHER_ABSENCE_SCOPES = ["day", "period", "partial"] as const;

export type TeacherAbsenceScope = (typeof TEACHER_ABSENCE_SCOPES)[number];

export const TEACHER_ABSENCE_SOURCES = ["manual", "biometric", "leave_request"] as const;

export type TeacherAbsenceSource = (typeof TEACHER_ABSENCE_SOURCES)[number];

/* -------------------------------------------------------------------------- */
/* Snapshot computation & validation                                          */
/* -------------------------------------------------------------------------- */

/**
 * Determine a cell's operational status from its timetable and observation parameters.
 */
export function computeLiveSnapshotStatus(params: {
  readonly isCancelled?: boolean | null;
  readonly isFreePeriod?: boolean | null;
  readonly substituteTeacherId?: string | null;
  readonly teacherAbsent?: boolean | null;
  readonly attendanceSubmitted?: boolean | null;
  readonly periodIsActiveOrPast?: boolean | null;
}): FloorLiveSnapshotStatus {
  if (params.isCancelled) {
    return "cancelled";
  }

  if (params.isFreePeriod) {
    return "free";
  }

  if (params.substituteTeacherId && params.substituteTeacherId.trim() !== "") {
    return "substitute";
  }

  // If teacher is absent and no substitute was provided yet
  if (params.teacherAbsent) {
    return "unmarked";
  }

  // If period has started/past and attendance has not been submitted yet
  if (params.periodIsActiveOrPast && params.attendanceSubmitted === false) {
    return "unmarked";
  }

  return "as_scheduled";
}

/**
 * Validate live snapshot invariants matching the database constraints.
 */
export function validateLiveSnapshot(snapshot: {
  readonly status: string;
  readonly substituteTeacherId?: string | null | undefined;
  readonly attendanceSubmitted?: boolean | null | undefined;
}): void {
  if (!FLOOR_SNAPSHOT_STATUSES.includes(snapshot.status as FloorLiveSnapshotStatus)) {
    throw new ValidationError(`Unknown floor live snapshot status "${snapshot.status}".`, {
      status: [`Use ${FLOOR_SNAPSHOT_STATUSES.join(", ")}.`],
    });
  }

  // Check substitute pair: status <> 'substitute' or substituteTeacherId is not null
  if (snapshot.status === "substitute") {
    if (!snapshot.substituteTeacherId || snapshot.substituteTeacherId.trim() === "") {
      throw new BusinessRuleError(
        "A substitution cell must identify the substitute teacher.",
        {
          userMessage: "Select the replacement or substitute teacher assigned to this room.",
          details: { substituteTeacherId: "Substitute teacher is required for substitution status." },
        },
      );
    }
  }

  // Check attendance pair: attendanceSubmitted is null or status not in ('free', 'cancelled')
  if (
    (snapshot.status === "free" || snapshot.status === "cancelled") &&
    snapshot.attendanceSubmitted === true
  ) {
    throw new BusinessRuleError(
      `Attendance cannot be marked as submitted for a ${snapshot.status} period.`,
      {
        userMessage: `A ${snapshot.status} period cannot have submitted student attendance.`,
        details: { attendanceSubmitted: "Attendance must not be submitted for free or cancelled periods." },
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Extra Period validation                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Validates extra period business rules and database invariants.
 *
 * NOTE: Floor operations records the operational fact and payable flag;
 * it NEVER calculates money or unit rates (`PRD.md` MODULE 19, `ARCHITECTURE.md` §19).
 */
export function validateExtraPeriod(period: {
  readonly reason: string;
  readonly resolution?: string | null | undefined;
  readonly replacesScheduleId?: string | null | undefined;
  readonly teacherId?: string | null | undefined;
  readonly isPayable?: boolean | undefined;
  readonly approvedByUserId?: string | null | undefined;
  readonly approvedAt?: Date | null | undefined;
}): void {
  if (!EXTRA_PERIOD_REASONS.includes(period.reason as ExtraPeriodReason)) {
    throw new ValidationError(`Unknown extra period reason "${period.reason}".`, {
      reason: [`Use ${EXTRA_PERIOD_REASONS.join(", ")}.`],
    });
  }

  if (
    period.resolution !== undefined &&
    period.resolution !== null &&
    !REPLACEMENT_RESOLUTIONS.includes(period.resolution as ReplacementResolution)
  ) {
    throw new ValidationError(`Unknown replacement resolution "${period.resolution}".`, {
      resolution: [`Use ${REPLACEMENT_RESOLUTIONS.join(", ")}.`],
    });
  }

  // replacement/substitution requires replacesScheduleId
  if (
    (period.reason === "replacement" || period.reason === "substitution") &&
    (!period.replacesScheduleId || period.replacesScheduleId.trim() === "")
  ) {
    throw new BusinessRuleError(
      "A replacement extra period must reference the original timetable schedule it covers.",
      {
        userMessage: "Select the scheduled class period being covered.",
        details: { replacesScheduleId: "Original timetable schedule reference is required." },
      },
    );
  }

  // Check resolution teacher pair:
  // resolution in ('test', 'self_study', 'alternative_activity', 'period_cancelled') needs no teacher.
  // Other resolutions (like 'replacement_teacher') require a teacher.
  if (period.resolution === "replacement_teacher") {
    if (!period.teacherId || period.teacherId.trim() === "") {
      throw new BusinessRuleError("A replacement teacher resolution must specify the teacher.", {
        userMessage: "Select the teacher conducting this period.",
        details: { teacherId: "Teacher is required when resolution is replacement_teacher." },
      });
    }
  }

  // Payable check: isPayable = false or teacherId is not null
  if (period.isPayable) {
    if (!period.teacherId || period.teacherId.trim() === "") {
      throw new BusinessRuleError("A payable extra period must identify the teacher who taught it.", {
        userMessage: "Specify the teacher entitled to pay for this extra period.",
        details: { teacherId: "Teacher is required for payable extra periods." },
      });
    }

    // Payable approval pair: approvedByUserId and approvedAt must both be set
    if (!period.approvedByUserId || !period.approvedAt) {
      throw new BusinessRuleError(
        "A payable extra period must be approved by an authorized user with a timestamp.",
        {
          userMessage: "Payable extra periods require approval before being recorded as payable.",
          details: {
            approvedByUserId: "Approver user id is required for payable extra periods.",
            approvedAt: "Approval timestamp is required for payable extra periods.",
          },
        },
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Incident report validation                                                 */
/* -------------------------------------------------------------------------- */

export function validateIncidentReport(incident: {
  readonly severity: string;
  readonly kind: string;
  readonly description: string;
  readonly occurredAt: Date;
  readonly escalatedAt?: Date | null;
  readonly escalatedToUserId?: string | null;
  readonly resolvedAt?: Date | null;
  readonly resolvedByUserId?: string | null;
  readonly resolutionNotes?: string | null;
}): void {
  if (!INCIDENT_SEVERITIES.includes(incident.severity as IncidentSeverity)) {
    throw new ValidationError(`Unknown incident severity "${incident.severity}".`, {
      severity: [`Use ${INCIDENT_SEVERITIES.join(", ")}.`],
    });
  }

  if (!INCIDENT_KINDS.includes(incident.kind as IncidentKind)) {
    throw new ValidationError(`Unknown incident kind "${incident.kind}".`, {
      kind: [`Use ${INCIDENT_KINDS.join(", ")}.`],
    });
  }

  if (!incident.description || incident.description.trim().length < 3) {
    throw new ValidationError("Incident description must be at least 3 characters.", {
      description: ["Provide a clear description of the observed event."],
    });
  }

  if (!(incident.occurredAt instanceof Date) || Number.isNaN(incident.occurredAt.getTime())) {
    throw new ValidationError("A valid incident occurrence timestamp is required.", {
      occurredAt: ["Provide a valid occurrence date and time."],
    });
  }

  // Escalation pair: escalatedAt is null or escalatedToUserId is not null
  if (incident.escalatedAt && !incident.escalatedToUserId) {
    throw new BusinessRuleError("An escalated incident must identify who it was escalated to.", {
      userMessage: "Select the supervisor or administrator this incident is escalated to.",
      details: { escalatedToUserId: "Supervisor user ID is required when escalating." },
    });
  }

  // Resolution pair: resolvedAt is null or (resolvedByUserId is not null and resolutionNotes is not null)
  if (incident.resolvedAt) {
    if (!incident.resolvedByUserId) {
      throw new BusinessRuleError("A resolved incident must identify the resolving user.", {
        userMessage: "Resolver user identity is required.",
        details: { resolvedByUserId: "User who resolved the incident is required." },
      });
    }
    if (!incident.resolutionNotes || incident.resolutionNotes.trim() === "") {
      throw new BusinessRuleError("Resolution notes are required when marking an incident resolved.", {
        userMessage: "Please enter the resolution notes describing the action taken.",
        details: { resolutionNotes: "Resolution notes are required." },
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Teacher absence validation                                                 */
/* -------------------------------------------------------------------------- */

export function validateTeacherAbsence(absence: {
  readonly scope: string;
  readonly source: string;
  readonly startTimeSlotId?: string | null | undefined;
  readonly endTimeSlotId?: string | null | undefined;
  readonly leaveRequestId?: string | null | undefined;
  readonly reportedByUserId?: string | null | undefined;
}): void {
  if (!TEACHER_ABSENCE_SCOPES.includes(absence.scope as TeacherAbsenceScope)) {
    throw new ValidationError(`Unknown teacher absence scope "${absence.scope}".`, {
      scope: [`Use ${TEACHER_ABSENCE_SCOPES.join(", ")}.`],
    });
  }

  if (!TEACHER_ABSENCE_SOURCES.includes(absence.source as TeacherAbsenceSource)) {
    throw new ValidationError(`Unknown teacher absence source "${absence.source}".`, {
      source: [`Use ${TEACHER_ABSENCE_SOURCES.join(", ")}.`],
    });
  }

  // scope = 'day' -> startTimeSlotId is null and endTimeSlotId is null
  if (absence.scope === "day") {
    if (absence.startTimeSlotId || absence.endTimeSlotId) {
      throw new BusinessRuleError("A full day absence cannot specify start or end period slots.", {
        userMessage: "Full day absence applies to all periods; clear specific time slots.",
        details: { scope: "Day scope requires null start and end time slots." },
      });
    }
  }

  // scope = 'period' -> both start and end time slot are required
  if (absence.scope === "period") {
    if (!absence.startTimeSlotId || !absence.endTimeSlotId) {
      throw new BusinessRuleError("A period absence must specify both start and end period slots.", {
        userMessage: "Select both starting and ending period slots.",
        details: {
          startTimeSlotId: "Start time slot is required for period scope.",
          endTimeSlotId: "End time slot is required for period scope.",
        },
      });
    }
  }

  // scope = 'partial' -> start time slot is required
  if (absence.scope === "partial") {
    if (!absence.startTimeSlotId) {
      throw new BusinessRuleError("A partial absence must specify the start time slot.", {
        userMessage: "Select the starting period slot for the partial absence.",
        details: { startTimeSlotId: "Start time slot is required for partial scope." },
      });
    }
  }

  // source = 'leave_request' -> leaveRequestId is required
  if (absence.source === "leave_request" && !absence.leaveRequestId) {
    throw new BusinessRuleError("Absence derived from leave request must reference the approved leave request.", {
      userMessage: "Select the approved leave request.",
      details: { leaveRequestId: "Leave request ID is required when source is leave_request." },
    });
  }

  // source <> 'biometric' -> reportedByUserId is required
  if (absence.source !== "biometric" && !absence.reportedByUserId) {
    throw new BusinessRuleError("A manual absence report must identify the reporting user.", {
      userMessage: "Reporting user is required.",
      details: { reportedByUserId: "Reporter user ID is required for non-biometric absences." },
    });
  }
}
