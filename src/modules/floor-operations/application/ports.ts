/**
 * Floor operations persistence and boundary ports (`ARCHITECTURE.md` §19, `PRD.md` MODULE 15/17/18/19).
 */

import type {
  ExtraPeriodReason,
  FloorLiveSnapshotStatus,
  IncidentKind,
  IncidentSeverity,
  ReplacementResolution,
  TeacherAbsenceScope,
  TeacherAbsenceSource,
} from "../domain/floor-rules";
import type {
  AssignFloorInchargeInput,
  CaptureLiveSnapshotInput,
  CreateExtraPeriodInput,
  CreateIncidentReportInput,
  RecordTeacherAbsenceInput,
} from "./schemas";

/* -------------------------------------------------------------------------- */
/* Read Models                                                                */
/* -------------------------------------------------------------------------- */

export interface FloorLiveSnapshotRow {
  readonly id: string;
  readonly floorId: string;
  readonly scheduleId: string;
  readonly attendanceDate: string;
  readonly timeSlotId: string;
  readonly sectionId: string | null;
  readonly subjectId: string | null;
  readonly teacherId: string | null;
  readonly substituteTeacherId: string | null;
  readonly status: FloorLiveSnapshotStatus;
  readonly attendanceSubmitted: boolean | null;
  readonly asAt: Date;
}

export interface TeacherAbsenceRow {
  readonly id: string;
  readonly institutionId: string;
  readonly employeeId: string;
  readonly absenceDate: string;
  readonly scope: TeacherAbsenceScope;
  readonly startTimeSlotId: string | null;
  readonly endTimeSlotId: string | null;
  readonly reason: string | null;
  readonly source: TeacherAbsenceSource;
  readonly leaveRequestId: string | null;
  readonly reportedByUserId: string | null;
  readonly reportedAt: Date;
  readonly createdAt: Date;
}

export interface ExtraPeriodRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly replacesScheduleId: string | null;
  readonly teacherId: string | null;
  readonly sectionId: string | null;
  readonly timeSlotId: string;
  readonly extraDate: string;
  readonly reason: ExtraPeriodReason;
  readonly resolution: ReplacementResolution | null;
  readonly isPayable: boolean;
  readonly approvedByUserId: string | null;
  readonly approvedAt: Date | null;
  readonly absenceId: string | null;
  readonly consumedByPayLineId: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface FloorIncidentReportRow {
  readonly id: string;
  readonly institutionId: string;
  readonly campusId: string | null;
  readonly floorId: string | null;
  readonly sectionId: string | null;
  readonly reportedByUserId: string;
  readonly severity: IncidentSeverity;
  readonly kind: IncidentKind;
  readonly description: string;
  readonly occurredAt: Date;
  readonly reportedAt: Date;
  readonly escalatedAt: Date | null;
  readonly escalatedToUserId: string | null;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly resolutionNotes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FloorAssignmentRow {
  readonly id: string;
  readonly institutionId: string;
  readonly floorId: string;
  readonly userId: string;
  readonly assignedFrom: Date;
  readonly assignedUntil: Date | null;
  readonly createdAt: Date;
}

/**
 * Item for the tablet walk-through view showing room, timetable, teacher, attendance, and incident state.
 */
export interface FloorRoomWalkthroughItem {
  readonly scheduleId: string;
  readonly floorId: string;
  readonly floorName: string;
  readonly timeSlotId: string;
  readonly timeSlotName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly sectionId: string | null;
  readonly sectionName: string | null;
  readonly className: string | null;
  readonly gradeLevel: number | null;
  readonly subjectId: string | null;
  readonly subjectName: string | null;
  readonly teacherId: string | null;
  readonly teacherName: string | null;
  readonly substituteTeacherId: string | null;
  readonly substituteTeacherName: string | null;
  readonly status: FloorLiveSnapshotStatus;
  readonly attendanceSubmitted: boolean | null;
  readonly markedCount: number | null;
  readonly totalStudents: number | null;
  readonly openIncidentsCount: number;
  readonly asAt: Date | null;
}

/* -------------------------------------------------------------------------- */
/* Persistence Port                                                           */
/* -------------------------------------------------------------------------- */

export interface FloorOperationsStore {
  /* ---- Live Snapshots ---------------------------------------------------- */
  upsertLiveSnapshot(data: CaptureLiveSnapshotInput): Promise<FloorLiveSnapshotRow>;
  listLiveSnapshots(
    floorId: string,
    attendanceDate: string,
    timeSlotId?: string,
  ): Promise<readonly FloorLiveSnapshotRow[]>;
  getLiveSnapshot(
    floorId: string,
    scheduleId: string,
    attendanceDate: string,
  ): Promise<FloorLiveSnapshotRow | null>;

  /* ---- Teacher Absences -------------------------------------------------- */
  recordTeacherAbsence(
    data: RecordTeacherAbsenceInput,
    reportedByUserId: string,
  ): Promise<TeacherAbsenceRow>;
  listTeacherAbsences(
    institutionId: string,
    absenceDate: string,
    employeeId?: string,
  ): Promise<readonly TeacherAbsenceRow[]>;

  /* ---- Extra Periods ----------------------------------------------------- */
  createExtraPeriod(
    data: CreateExtraPeriodInput,
    createdByUserId: string,
  ): Promise<ExtraPeriodRow>;
  getExtraPeriod(extraPeriodId: string): Promise<ExtraPeriodRow | null>;
  approveExtraPeriod(
    extraPeriodId: string,
    approvedByUserId: string,
    approvedAt: Date,
  ): Promise<ExtraPeriodRow>;
  listExtraPeriods(
    institutionId: string,
    extraDate: string,
    teacherId?: string,
  ): Promise<readonly ExtraPeriodRow[]>;

  /* ---- Incidents --------------------------------------------------------- */
  createIncidentReport(
    data: CreateIncidentReportInput,
    reportedByUserId: string,
  ): Promise<FloorIncidentReportRow>;
  escalateIncidentReport(
    incidentId: string,
    escalatedToUserId: string,
    escalatedAt: Date,
  ): Promise<FloorIncidentReportRow>;
  resolveIncidentReport(
    incidentId: string,
    resolvedByUserId: string,
    resolutionNotes: string,
    resolvedAt: Date,
  ): Promise<FloorIncidentReportRow>;
  listIncidentReports(
    institutionId: string,
    filters?: {
      readonly floorId?: string;
      readonly resolved?: boolean;
      readonly severity?: IncidentSeverity;
    },
  ): Promise<readonly FloorIncidentReportRow[]>;
  getIncidentReport(incidentId: string): Promise<FloorIncidentReportRow | null>;

  /* ---- Floor Assignments ------------------------------------------------- */
  assignFloorIncharge(data: AssignFloorInchargeInput): Promise<FloorAssignmentRow>;
  listFloorAssignments(
    institutionId: string,
    floorId?: string,
    userId?: string,
  ): Promise<readonly FloorAssignmentRow[]>;

  /* ---- Walkthrough Composite Read ---------------------------------------- */
  getFloorWalkthrough(
    floorId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<readonly FloorRoomWalkthroughItem[]>;
}
