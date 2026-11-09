/**
 * In-memory test fake for FloorOperationsStore (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 */
import { randomUUID } from "node:crypto";

import type {
  ExtraPeriodReason,
  FloorLiveSnapshotStatus,
  IncidentKind,
  IncidentSeverity,
  ReplacementResolution,
  TeacherAbsenceScope,
  TeacherAbsenceSource,
} from "../../domain/floor-rules";
import type {
  ExtraPeriodRow,
  FloorAssignmentRow,
  FloorIncidentReportRow,
  FloorLiveSnapshotRow,
  FloorOperationsStore,
  FloorRoomWalkthroughItem,
  TeacherAbsenceRow,
} from "../ports";
import type {
  AssignFloorInchargeInput,
  CaptureLiveSnapshotInput,
  CreateExtraPeriodInput,
  CreateIncidentReportInput,
  RecordTeacherAbsenceInput,
} from "../schemas";

export class FakeFloorOperationsStore implements FloorOperationsStore {
  readonly snapshots = new Map<string, FloorLiveSnapshotRow>();
  readonly absences = new Map<string, TeacherAbsenceRow>();
  readonly extraPeriods = new Map<string, ExtraPeriodRow>();
  readonly incidents = new Map<string, FloorIncidentReportRow>();
  readonly assignments = new Map<string, FloorAssignmentRow>();
  readonly walkthroughItems: FloorRoomWalkthroughItem[] = [];

  /* ---- Live Snapshots ---------------------------------------------------- */

  async upsertLiveSnapshot(data: CaptureLiveSnapshotInput): Promise<FloorLiveSnapshotRow> {
    const key = `${data.floorId}:${data.scheduleId}:${data.attendanceDate}`;
    const existing = this.snapshots.get(key);
    const id = existing?.id ?? randomUUID();

    const row: FloorLiveSnapshotRow = {
      id,
      floorId: data.floorId,
      scheduleId: data.scheduleId,
      attendanceDate: data.attendanceDate,
      timeSlotId: data.timeSlotId,
      sectionId: data.sectionId ?? null,
      subjectId: data.subjectId ?? null,
      teacherId: data.teacherId ?? null,
      substituteTeacherId: data.substituteTeacherId ?? null,
      status: data.status as FloorLiveSnapshotStatus,
      attendanceSubmitted: data.attendanceSubmitted ?? null,
      asAt: new Date(),
    };

    this.snapshots.set(key, row);
    return row;
  }

  async listLiveSnapshots(
    floorId: string,
    attendanceDate: string,
    timeSlotId?: string,
  ): Promise<readonly FloorLiveSnapshotRow[]> {
    return Array.from(this.snapshots.values()).filter((s) => {
      if (s.floorId !== floorId || s.attendanceDate !== attendanceDate) return false;
      if (timeSlotId && s.timeSlotId !== timeSlotId) return false;
      return true;
    });
  }

  async getLiveSnapshot(
    floorId: string,
    scheduleId: string,
    attendanceDate: string,
  ): Promise<FloorLiveSnapshotRow | null> {
    const key = `${floorId}:${scheduleId}:${attendanceDate}`;
    return this.snapshots.get(key) ?? null;
  }

  /* ---- Teacher Absences -------------------------------------------------- */

  async recordTeacherAbsence(
    data: RecordTeacherAbsenceInput,
    reportedByUserId: string,
  ): Promise<TeacherAbsenceRow> {
    const id = randomUUID();
    const row: TeacherAbsenceRow = {
      id,
      institutionId: data.institutionId,
      employeeId: data.employeeId,
      absenceDate: data.absenceDate,
      scope: data.scope as TeacherAbsenceScope,
      startTimeSlotId: data.startTimeSlotId ?? null,
      endTimeSlotId: data.endTimeSlotId ?? null,
      reason: data.reason ?? null,
      source: data.source as TeacherAbsenceSource,
      leaveRequestId: data.leaveRequestId ?? null,
      reportedByUserId: data.source === "biometric" ? null : reportedByUserId,
      reportedAt: new Date(),
      createdAt: new Date(),
    };

    this.absences.set(id, row);
    return row;
  }

  async listTeacherAbsences(
    institutionId: string,
    absenceDate: string,
    employeeId?: string,
  ): Promise<readonly TeacherAbsenceRow[]> {
    return Array.from(this.absences.values()).filter((a) => {
      if (a.institutionId !== institutionId || a.absenceDate !== absenceDate) return false;
      if (employeeId && a.employeeId !== employeeId) return false;
      return true;
    });
  }

  /* ---- Extra Periods ----------------------------------------------------- */

  async createExtraPeriod(
    data: CreateExtraPeriodInput,
    createdByUserId: string,
  ): Promise<ExtraPeriodRow> {
    const id = randomUUID();
    const row: ExtraPeriodRow = {
      id,
      institutionId: data.institutionId,
      academicSessionId: data.academicSessionId,
      replacesScheduleId: data.replacesScheduleId ?? null,
      teacherId: data.teacherId ?? null,
      sectionId: data.sectionId ?? null,
      timeSlotId: data.timeSlotId,
      extraDate: data.extraDate,
      reason: data.reason as ExtraPeriodReason,
      resolution: (data.resolution as ReplacementResolution) ?? null,
      isPayable: data.isPayable ?? false,
      approvedByUserId: null,
      approvedAt: null,
      absenceId: null,
      consumedByPayLineId: null,
      notes: data.notes ?? null,
      createdByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };

    this.extraPeriods.set(id, row);
    return row;
  }

  async getExtraPeriod(extraPeriodId: string): Promise<ExtraPeriodRow | null> {
    return this.extraPeriods.get(extraPeriodId) ?? null;
  }

  async approveExtraPeriod(
    extraPeriodId: string,
    approvedByUserId: string,
    approvedAt: Date,
  ): Promise<ExtraPeriodRow> {
    const existing = this.extraPeriods.get(extraPeriodId);
    if (!existing) {
      throw new Error(`Extra period ${extraPeriodId} not found.`);
    }

    const updated: ExtraPeriodRow = {
      ...existing,
      isPayable: true,
      approvedByUserId,
      approvedAt,
      updatedAt: new Date(),
      version: existing.version + 1,
    };

    this.extraPeriods.set(extraPeriodId, updated);
    return updated;
  }

  async listExtraPeriods(
    institutionId: string,
    extraDate: string,
    teacherId?: string,
  ): Promise<readonly ExtraPeriodRow[]> {
    return Array.from(this.extraPeriods.values()).filter((p) => {
      if (p.institutionId !== institutionId || p.extraDate !== extraDate) return false;
      if (teacherId && p.teacherId !== teacherId) return false;
      return true;
    });
  }

  /* ---- Incidents --------------------------------------------------------- */

  async createIncidentReport(
    data: CreateIncidentReportInput,
    reportedByUserId: string,
  ): Promise<FloorIncidentReportRow> {
    const id = randomUUID();
    const row: FloorIncidentReportRow = {
      id,
      institutionId: data.institutionId,
      campusId: data.campusId ?? null,
      floorId: data.floorId ?? null,
      sectionId: data.sectionId ?? null,
      reportedByUserId,
      severity: data.severity as IncidentSeverity,
      kind: data.kind as IncidentKind,
      description: data.description,
      occurredAt: data.occurredAt ?? new Date(),
      reportedAt: new Date(),
      escalatedAt: null,
      escalatedToUserId: null,
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.incidents.set(id, row);
    return row;
  }

  async escalateIncidentReport(
    incidentId: string,
    escalatedToUserId: string,
    escalatedAt: Date,
  ): Promise<FloorIncidentReportRow> {
    const existing = this.incidents.get(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found.`);
    }

    const updated: FloorIncidentReportRow = {
      ...existing,
      escalatedAt,
      escalatedToUserId,
      updatedAt: new Date(),
    };

    this.incidents.set(incidentId, updated);
    return updated;
  }

  async resolveIncidentReport(
    incidentId: string,
    resolvedByUserId: string,
    resolutionNotes: string,
    resolvedAt: Date,
  ): Promise<FloorIncidentReportRow> {
    const existing = this.incidents.get(incidentId);
    if (!existing) {
      throw new Error(`Incident ${incidentId} not found.`);
    }

    const updated: FloorIncidentReportRow = {
      ...existing,
      resolvedAt,
      resolvedByUserId,
      resolutionNotes,
      updatedAt: new Date(),
    };

    this.incidents.set(incidentId, updated);
    return updated;
  }

  async listIncidentReports(
    institutionId: string,
    filters?: {
      readonly floorId?: string;
      readonly resolved?: boolean;
      readonly severity?: IncidentSeverity;
    },
  ): Promise<readonly FloorIncidentReportRow[]> {
    return Array.from(this.incidents.values()).filter((inc) => {
      if (inc.institutionId !== institutionId) return false;
      if (filters?.floorId && inc.floorId !== filters.floorId) return false;
      if (filters?.severity && inc.severity !== filters.severity) return false;
      if (filters?.resolved !== undefined) {
        const isResolved = inc.resolvedAt !== null;
        if (isResolved !== filters.resolved) return false;
      }
      return true;
    });
  }

  async getIncidentReport(incidentId: string): Promise<FloorIncidentReportRow | null> {
    return this.incidents.get(incidentId) ?? null;
  }

  /* ---- Floor Assignments ------------------------------------------------- */

  async assignFloorIncharge(data: AssignFloorInchargeInput): Promise<FloorAssignmentRow> {
    const id = randomUUID();
    const row: FloorAssignmentRow = {
      id,
      institutionId: data.institutionId,
      floorId: data.floorId,
      userId: data.userId,
      assignedFrom: data.assignedFrom ?? new Date(),
      assignedUntil: data.assignedUntil ?? null,
      createdAt: new Date(),
    };

    this.assignments.set(id, row);
    return row;
  }

  async listFloorAssignments(
    institutionId: string,
    floorId?: string,
    userId?: string,
  ): Promise<readonly FloorAssignmentRow[]> {
    return Array.from(this.assignments.values()).filter((a) => {
      if (a.institutionId !== institutionId) return false;
      if (floorId && a.floorId !== floorId) return false;
      if (userId && a.userId !== userId) return false;
      return true;
    });
  }

  /* ---- Walkthrough Composite Read ---------------------------------------- */

  async getFloorWalkthrough(
    floorId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<readonly FloorRoomWalkthroughItem[]> {
    // If walkthroughItems was explicitly configured, return matching items
    if (this.walkthroughItems.length > 0) {
      return this.walkthroughItems.filter(
        (w) => w.floorId === floorId && w.timeSlotId === timeSlotId,
      );
    }

    // Otherwise derive from live snapshots
    const snapshots = await this.listLiveSnapshots(floorId, attendanceDate, timeSlotId);
    return snapshots.map((s) => ({
      scheduleId: s.scheduleId,
      floorId: s.floorId,
      floorName: "First Floor",
      timeSlotId: s.timeSlotId,
      timeSlotName: "Period 1",
      startTime: "08:00:00",
      endTime: "08:45:00",
      sectionId: s.sectionId,
      sectionName: "Section A",
      className: "Grade 10",
      gradeLevel: 10,
      subjectId: s.subjectId,
      subjectName: "Mathematics",
      teacherId: s.teacherId,
      teacherName: "Prof. Alan Turing",
      substituteTeacherId: s.substituteTeacherId,
      substituteTeacherName: s.substituteTeacherId ? "Prof. Ada Lovelace" : null,
      status: s.status,
      attendanceSubmitted: s.attendanceSubmitted,
      markedCount: s.attendanceSubmitted ? 30 : 0,
      totalStudents: 32,
      openIncidentsCount: 0,
      asAt: s.asAt,
    }));
  }
}
