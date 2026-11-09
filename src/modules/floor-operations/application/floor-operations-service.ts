/**
 * Floor operations application service (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 *
 * Orchestrates live period inspection snapshots, room walkthroughs, extra periods,
 * floor incident logging, teacher absences, and floor supervisor assignments.
 */

import { NotFoundError, ValidationError } from "@/shared/errors";

import {
  validateExtraPeriod,
  validateIncidentReport,
  validateLiveSnapshot,
  validateTeacherAbsence,
} from "../domain/floor-rules";
import type {
  ExtraPeriodRow,
  FloorAssignmentRow,
  FloorIncidentReportRow,
  FloorLiveSnapshotRow,
  FloorOperationsStore,
  FloorRoomWalkthroughItem,
  TeacherAbsenceRow,
} from "./ports";
import {
  ApproveExtraPeriodData,
  AssignFloorInchargeData,
  CaptureLiveSnapshotData,
  CreateExtraPeriodData,
  CreateIncidentReportData,
  EscalateIncidentReportData,
  RecordTeacherAbsenceData,
  ResolveIncidentReportData,
} from "./schemas";

export class FloorOperationsService {
  constructor(private readonly store: FloorOperationsStore) {}

  /* ---- Live Snapshots ---------------------------------------------------- */

  async captureLiveSnapshot(input: unknown): Promise<FloorLiveSnapshotRow> {
    const parsed = CaptureLiveSnapshotData.parse(input);

    validateLiveSnapshot({
      status: parsed.status,
      substituteTeacherId: parsed.substituteTeacherId,
      attendanceSubmitted: parsed.attendanceSubmitted,
    });

    return this.store.upsertLiveSnapshot(parsed);
  }

  async listLiveSnapshots(
    floorId: string,
    attendanceDate: string,
    timeSlotId?: string,
  ): Promise<readonly FloorLiveSnapshotRow[]> {
    return this.store.listLiveSnapshots(floorId, attendanceDate, timeSlotId);
  }

  async getLiveSnapshot(
    floorId: string,
    scheduleId: string,
    attendanceDate: string,
  ): Promise<FloorLiveSnapshotRow | null> {
    return this.store.getLiveSnapshot(floorId, scheduleId, attendanceDate);
  }

  /* ---- Teacher Absences -------------------------------------------------- */

  async recordTeacherAbsence(
    input: unknown,
    reportedByUserId: string,
  ): Promise<TeacherAbsenceRow> {
    const parsed = RecordTeacherAbsenceData.parse(input);

    validateTeacherAbsence({
      scope: parsed.scope,
      source: parsed.source,
      startTimeSlotId: parsed.startTimeSlotId,
      endTimeSlotId: parsed.endTimeSlotId,
      leaveRequestId: parsed.leaveRequestId,
      reportedByUserId: parsed.source === "biometric" ? null : reportedByUserId,
    });

    return this.store.recordTeacherAbsence(parsed, reportedByUserId);
  }

  async listTeacherAbsences(
    institutionId: string,
    absenceDate: string,
    employeeId?: string,
  ): Promise<readonly TeacherAbsenceRow[]> {
    return this.store.listTeacherAbsences(institutionId, absenceDate, employeeId);
  }

  /* ---- Extra Periods ----------------------------------------------------- */

  async createExtraPeriod(
    input: unknown,
    createdByUserId: string,
  ): Promise<ExtraPeriodRow> {
    const parsed = CreateExtraPeriodData.parse(input);

    validateExtraPeriod({
      reason: parsed.reason,
      resolution: parsed.resolution,
      replacesScheduleId: parsed.replacesScheduleId,
      teacherId: parsed.teacherId,
      isPayable: parsed.isPayable,
      approvedByUserId: null,
      approvedAt: null,
    });

    return this.store.createExtraPeriod(parsed, createdByUserId);
  }

  async approveExtraPeriod(
    input: unknown,
    approvedByUserId: string,
    approvedAt: Date = new Date(),
  ): Promise<ExtraPeriodRow> {
    const parsed = ApproveExtraPeriodData.parse(input);

    const existing = await this.store.getExtraPeriod(parsed.extraPeriodId);
    if (!existing) {
      throw new NotFoundError(
        `Extra period ${parsed.extraPeriodId} not found.`,
        {
          userMessage: "The specified extra period was not found.",
          details: { extraPeriodId: "Invalid extra period reference." },
        },
      );
    }

    validateExtraPeriod({
      reason: existing.reason,
      resolution: existing.resolution,
      replacesScheduleId: existing.replacesScheduleId,
      teacherId: existing.teacherId,
      isPayable: true,
      approvedByUserId,
      approvedAt,
    });

    return this.store.approveExtraPeriod(parsed.extraPeriodId, approvedByUserId, approvedAt);
  }

  async listExtraPeriods(
    institutionId: string,
    extraDate: string,
    teacherId?: string,
  ): Promise<readonly ExtraPeriodRow[]> {
    return this.store.listExtraPeriods(institutionId, extraDate, teacherId);
  }

  async getExtraPeriod(extraPeriodId: string): Promise<ExtraPeriodRow | null> {
    return this.store.getExtraPeriod(extraPeriodId);
  }

  /* ---- Incidents --------------------------------------------------------- */

  async createIncidentReport(
    input: unknown,
    reportedByUserId: string,
  ): Promise<FloorIncidentReportRow> {
    const parsed = CreateIncidentReportData.parse(input);

    validateIncidentReport({
      severity: parsed.severity,
      kind: parsed.kind,
      description: parsed.description,
      occurredAt: parsed.occurredAt,
    });

    return this.store.createIncidentReport(parsed, reportedByUserId);
  }

  async escalateIncidentReport(
    input: unknown,
    escalatedAt: Date = new Date(),
  ): Promise<FloorIncidentReportRow> {
    const parsed = EscalateIncidentReportData.parse(input);

    const existing = await this.store.getIncidentReport(parsed.incidentId);
    if (!existing) {
      throw new NotFoundError(
        `Incident report ${parsed.incidentId} not found.`,
        {
          userMessage: "The specified incident report was not found.",
          details: { incidentId: "Invalid incident report reference." },
        },
      );
    }

    validateIncidentReport({
      severity: existing.severity,
      kind: existing.kind,
      description: existing.description,
      occurredAt: existing.occurredAt,
      escalatedAt,
      escalatedToUserId: parsed.escalatedToUserId,
    });

    return this.store.escalateIncidentReport(
      parsed.incidentId,
      parsed.escalatedToUserId,
      escalatedAt,
    );
  }

  async resolveIncidentReport(
    input: unknown,
    resolvedByUserId: string,
    resolvedAt: Date = new Date(),
  ): Promise<FloorIncidentReportRow> {
    const parsed = ResolveIncidentReportData.parse(input);

    const existing = await this.store.getIncidentReport(parsed.incidentId);
    if (!existing) {
      throw new NotFoundError(
        `Incident report ${parsed.incidentId} not found.`,
        {
          userMessage: "The specified incident report was not found.",
          details: { incidentId: "Invalid incident report reference." },
        },
      );
    }

    validateIncidentReport({
      severity: existing.severity,
      kind: existing.kind,
      description: existing.description,
      occurredAt: existing.occurredAt,
      resolvedAt,
      resolvedByUserId,
      resolutionNotes: parsed.resolutionNotes,
    });

    return this.store.resolveIncidentReport(
      parsed.incidentId,
      resolvedByUserId,
      parsed.resolutionNotes,
      resolvedAt,
    );
  }

  async listIncidentReports(
    institutionId: string,
    filters?: {
      readonly floorId?: string;
      readonly resolved?: boolean;
      readonly severity?: "low" | "medium" | "high" | "critical";
    },
  ): Promise<readonly FloorIncidentReportRow[]> {
    return this.store.listIncidentReports(institutionId, filters);
  }

  async getIncidentReport(incidentId: string): Promise<FloorIncidentReportRow | null> {
    return this.store.getIncidentReport(incidentId);
  }

  /* ---- Floor Assignments ------------------------------------------------- */

  async assignFloorIncharge(input: unknown): Promise<FloorAssignmentRow> {
    const parsed = AssignFloorInchargeData.parse(input);
    return this.store.assignFloorIncharge(parsed);
  }

  async listFloorAssignments(
    institutionId: string,
    floorId?: string,
    userId?: string,
  ): Promise<readonly FloorAssignmentRow[]> {
    return this.store.listFloorAssignments(institutionId, floorId, userId);
  }

  /* ---- Walkthrough Composite Read ---------------------------------------- */

  async getFloorWalkthrough(
    floorId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<readonly FloorRoomWalkthroughItem[]> {
    if (!floorId || !timeSlotId || !attendanceDate) {
      throw new ValidationError("Missing required parameters for room walkthrough.", {
        floorId: ["Select a valid floor."],
        attendanceDate: ["Provide an attendance date."],
        timeSlotId: ["Select a valid period slot."],
      });
    }

    return this.store.getFloorWalkthrough(floorId, attendanceDate, timeSlotId);
  }
}
