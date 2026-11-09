/**
 * Tests for FloorOperationsService (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 */

import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";

import { FloorOperationsService } from "./floor-operations-service";
import { FakeFloorOperationsStore } from "./testing/fakes";

describe("FloorOperationsService", () => {
  let store: FakeFloorOperationsStore;
  let service: FloorOperationsService;

  const institutionId = "11111111-1111-4111-8111-111111111111";
  const academicSessionId = "22222222-2222-4222-8222-222222222222";
  const floorId = "33333333-3333-4333-8333-333333333333";
  const scheduleId = "44444444-4444-4444-8444-444444444444";
  const timeSlotId = "55555555-5555-4555-8555-555555555555";
  const sectionId = "66666666-6666-4666-8666-666666666666";
  const teacherId = "77777777-7777-4777-8777-777777777777";
  const substituteTeacherId = "88888888-8888-4888-8888-888888888888";
  const supervisorId = "99999999-9999-4999-8999-999999999999";
  const attendanceDate = "2026-10-31";
  const absenceDate = "2026-10-31";

  beforeEach(() => {
    store = new FakeFloorOperationsStore();
    service = new FloorOperationsService(store);
  });

  /* -------------------------------------------------------------------------- */
  /* Live Period Inspection Snapshots                                           */
  /* -------------------------------------------------------------------------- */

  describe("Live Period Inspection Snapshots", () => {
    it("captures an as_scheduled snapshot successfully", async () => {
      const snapshot = await service.captureLiveSnapshot({
        floorId,
        scheduleId,
        attendanceDate,
        timeSlotId,
        sectionId,
        teacherId,
        status: "as_scheduled",
        attendanceSubmitted: true,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.status).toBe("as_scheduled");
      expect(snapshot.attendanceSubmitted).toBe(true);

      const retrieved = await service.getLiveSnapshot(floorId, scheduleId, attendanceDate);
      expect(retrieved?.id).toBe(snapshot.id);
    });

    it("captures a substitute snapshot with substitute teacher", async () => {
      const snapshot = await service.captureLiveSnapshot({
        floorId,
        scheduleId,
        attendanceDate,
        timeSlotId,
        sectionId,
        teacherId,
        substituteTeacherId,
        status: "substitute",
        attendanceSubmitted: false,
      });

      expect(snapshot.status).toBe("substitute");
      expect(snapshot.substituteTeacherId).toBe(substituteTeacherId);
    });

    it("rejects a substitute snapshot without substitute teacher", async () => {
      await expect(
        service.captureLiveSnapshot({
          floorId,
          scheduleId,
          attendanceDate,
          timeSlotId,
          sectionId,
          teacherId,
          status: "substitute",
          substituteTeacherId: null,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("rejects a free period claiming submitted attendance", async () => {
      await expect(
        service.captureLiveSnapshot({
          floorId,
          scheduleId,
          attendanceDate,
          timeSlotId,
          sectionId,
          status: "free",
          attendanceSubmitted: true,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("lists live snapshots for a floor and date", async () => {
      await service.captureLiveSnapshot({
        floorId,
        scheduleId,
        attendanceDate,
        timeSlotId,
        status: "as_scheduled",
        attendanceSubmitted: true,
      });

      const list = await service.listLiveSnapshots(floorId, attendanceDate);
      expect(list).toHaveLength(1);
      expect(list[0]?.scheduleId).toBe(scheduleId);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Teacher Absences                                                           */
  /* -------------------------------------------------------------------------- */

  describe("Teacher Absences", () => {
    it("records a full day absence", async () => {
      const absence = await service.recordTeacherAbsence(
        {
          institutionId,
          employeeId: teacherId,
          absenceDate,
          scope: "day",
          reason: "Medical leave",
          source: "manual",
        },
        supervisorId,
      );

      expect(absence.id).toBeDefined();
      expect(absence.scope).toBe("day");
      expect(absence.reportedByUserId).toBe(supervisorId);

      const list = await service.listTeacherAbsences(institutionId, attendanceDate);
      expect(list).toHaveLength(1);
    });

    it("records a period absence with time slots", async () => {
      const absence = await service.recordTeacherAbsence(
        {
          institutionId,
          employeeId: teacherId,
          absenceDate,
          scope: "period",
          startTimeSlotId: timeSlotId,
          endTimeSlotId: timeSlotId,
          reason: "Dentist appointment",
          source: "manual",
        },
        supervisorId,
      );

      expect(absence.scope).toBe("period");
      expect(absence.startTimeSlotId).toBe(timeSlotId);
      expect(absence.endTimeSlotId).toBe(timeSlotId);
    });

    it("rejects a full day absence with time slots", async () => {
      await expect(
        service.recordTeacherAbsence(
          {
            institutionId,
            employeeId: teacherId,
            absenceDate,
            scope: "day",
            startTimeSlotId: timeSlotId,
          },
          supervisorId,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("records biometric absence without reporter", async () => {
      const absence = await service.recordTeacherAbsence(
        {
          institutionId,
          employeeId: teacherId,
          absenceDate,
          scope: "day",
          source: "biometric",
        },
        supervisorId,
      );

      expect(absence.source).toBe("biometric");
      expect(absence.reportedByUserId).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Extra Periods & Approvals                                                  */
  /* -------------------------------------------------------------------------- */

  describe("Extra Periods & Approvals", () => {
    it("creates a replacement extra period linked to original schedule", async () => {
      const extraPeriod = await service.createExtraPeriod(
        {
          institutionId,
          academicSessionId,
          replacesScheduleId: scheduleId,
          teacherId: substituteTeacherId,
          sectionId,
          timeSlotId,
          extraDate: attendanceDate,
          reason: "replacement",
          resolution: "replacement_teacher",
          isPayable: false,
          notes: "Covering for absent teacher",
        },
        supervisorId,
      );

      expect(extraPeriod.id).toBeDefined();
      expect(extraPeriod.reason).toBe("replacement");
      expect(extraPeriod.replacesScheduleId).toBe(scheduleId);
      expect(extraPeriod.isPayable).toBe(false);
    });

    it("rejects replacement extra period without original schedule reference", async () => {
      await expect(
        service.createExtraPeriod(
          {
            institutionId,
            academicSessionId,
            teacherId: substituteTeacherId,
            sectionId,
            timeSlotId,
            extraDate: attendanceDate,
            reason: "replacement",
            resolution: "replacement_teacher",
          },
          supervisorId,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("approves an extra period making it payable with an auditable approver", async () => {
      const created = await service.createExtraPeriod(
        {
          institutionId,
          academicSessionId,
          replacesScheduleId: scheduleId,
          teacherId: substituteTeacherId,
          sectionId,
          timeSlotId,
          extraDate: attendanceDate,
          reason: "replacement",
          resolution: "replacement_teacher",
          isPayable: false,
        },
        supervisorId,
      );

      const approvalTime = new Date("2026-10-31T12:00:00Z");
      const approved = await service.approveExtraPeriod(
        { extraPeriodId: created.id },
        supervisorId,
        approvalTime,
      );

      expect(approved.isPayable).toBe(true);
      expect(approved.approvedByUserId).toBe(supervisorId);
      expect(approved.approvedAt).toEqual(approvalTime);
    });

    it("rejects approval for non-existent extra period with friendly message", async () => {
      const missingId = "00000000-0000-4000-8000-000000000000";
      await expect(
        service.approveExtraPeriod({ extraPeriodId: missingId }, supervisorId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Floor Incident Reports                                                     */
  /* -------------------------------------------------------------------------- */

  describe("Floor Incident Reports", () => {
    it("logs a new incident report", async () => {
      const incident = await service.createIncidentReport(
        {
          institutionId,
          floorId,
          sectionId,
          severity: "high",
          kind: "injury",
          description: "Student slipped in corridor during lunch break.",
          occurredAt: new Date("2026-10-31T11:30:00Z"),
        },
        supervisorId,
      );

      expect(incident.id).toBeDefined();
      expect(incident.severity).toBe("high");
      expect(incident.reportedByUserId).toBe(supervisorId);
      expect(incident.resolvedAt).toBeNull();

      const retrieved = await service.getIncidentReport(incident.id);
      expect(retrieved?.id).toBe(incident.id);
    });

    it("escalates an incident report to a supervisor", async () => {
      const incident = await service.createIncidentReport(
        {
          institutionId,
          floorId,
          severity: "critical",
          kind: "security",
          description: "Unauthorized visitor entered east wing without pass.",
        },
        supervisorId,
      );

      const escalated = await service.escalateIncidentReport({
        incidentId: incident.id,
        escalatedToUserId: supervisorId,
      });

      expect(escalated.escalatedAt).toBeDefined();
      expect(escalated.escalatedToUserId).toBe(supervisorId);
    });

    it("resolves an incident report with resolution notes", async () => {
      const incident = await service.createIncidentReport(
        {
          institutionId,
          floorId,
          severity: "low",
          kind: "device_failure",
          description: "Air conditioner leaking water in room 103.",
        },
        supervisorId,
      );

      const resolved = await service.resolveIncidentReport(
        {
          incidentId: incident.id,
          resolutionNotes: "Maintenance turned off the unit and completed drain flush.",
        },
        supervisorId,
      );

      expect(resolved.resolvedAt).toBeDefined();
      expect(resolved.resolvedByUserId).toBe(supervisorId);
      expect(resolved.resolutionNotes).toContain("Maintenance turned off");
    });

    it("rejects resolving an incident without resolution notes", async () => {
      const incident = await service.createIncidentReport(
        {
          institutionId,
          floorId,
          severity: "medium",
          kind: "behaviour",
          description: "Noise disturbance in hallway during exam.",
        },
        supervisorId,
      );

      await expect(
        service.resolveIncidentReport(
          {
            incidentId: incident.id,
            resolutionNotes: "",
          },
          supervisorId,
        ),
      ).rejects.toThrow();
    });

    it("filters incidents by open status and severity", async () => {
      const inc1 = await service.createIncidentReport(
        {
          institutionId,
          floorId,
          severity: "low",
          kind: "device_failure",
          description: "Broken projector cable.",
        },
        supervisorId,
      );

      await service.createIncidentReport(
        {
          institutionId,
          floorId,
          severity: "high",
          kind: "injury",
          description: "First aid required for minor cut.",
        },
        supervisorId,
      );

      // Resolve inc1
      await service.resolveIncidentReport(
        { incidentId: inc1.id, resolutionNotes: "Replaced HDMI cable." },
        supervisorId,
      );

      const openIncidents = await service.listIncidentReports(institutionId, {
        resolved: false,
      });
      expect(openIncidents).toHaveLength(1);
      expect(openIncidents[0]?.severity).toBe("high");

      const resolvedIncidents = await service.listIncidentReports(institutionId, {
        resolved: true,
      });
      expect(resolvedIncidents).toHaveLength(1);
      expect(resolvedIncidents[0]?.severity).toBe("low");
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Floor Incharge Assignments                                                 */
  /* -------------------------------------------------------------------------- */

  describe("Floor Incharge Assignments", () => {
    it("assigns a floor incharge to a floor", async () => {
      const assignment = await service.assignFloorIncharge({
        institutionId,
        floorId,
        userId: supervisorId,
      });

      expect(assignment.id).toBeDefined();
      expect(assignment.floorId).toBe(floorId);
      expect(assignment.userId).toBe(supervisorId);

      const assignments = await service.listFloorAssignments(institutionId, floorId);
      expect(assignments).toHaveLength(1);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Room Walkthrough Composite Read                                            */
  /* -------------------------------------------------------------------------- */

  describe("Room Walkthrough", () => {
    it("returns walkthrough items for floor, date, and period", async () => {
      await service.captureLiveSnapshot({
        floorId,
        scheduleId,
        attendanceDate,
        timeSlotId,
        sectionId,
        teacherId,
        status: "as_scheduled",
        attendanceSubmitted: true,
      });

      const walkthrough = await service.getFloorWalkthrough(floorId, attendanceDate, timeSlotId);
      expect(walkthrough).toHaveLength(1);
      expect(walkthrough[0]?.scheduleId).toBe(scheduleId);
      expect(walkthrough[0]?.status).toBe("as_scheduled");
      expect(walkthrough[0]?.floorName).toBeDefined();
    });

    it("rejects walkthrough query with missing parameters", async () => {
      await expect(
        service.getFloorWalkthrough("", attendanceDate, timeSlotId),
      ).rejects.toThrow(ValidationError);
    });
  });
});
