/**
 * Tests for floor operations domain rules (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 */

import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";

import {
  computeLiveSnapshotStatus,
  validateExtraPeriod,
  validateIncidentReport,
  validateLiveSnapshot,
  validateTeacherAbsence,
} from "./floor-rules";

describe("computeLiveSnapshotStatus", () => {
  it("prioritizes cancelled status over other conditions", () => {
    const status = computeLiveSnapshotStatus({
      isCancelled: true,
      substituteTeacherId: "sub-1",
      attendanceSubmitted: true,
    });
    expect(status).toBe("cancelled");
  });

  it("identifies free periods", () => {
    const status = computeLiveSnapshotStatus({
      isFreePeriod: true,
      periodIsActiveOrPast: true,
      attendanceSubmitted: false,
    });
    expect(status).toBe("free");
  });

  it("identifies substitution when substitute teacher is assigned", () => {
    const status = computeLiveSnapshotStatus({
      substituteTeacherId: "teacher-sub-1",
      teacherAbsent: true,
      periodIsActiveOrPast: true,
      attendanceSubmitted: false,
    });
    expect(status).toBe("substitute");
  });

  it("marks as unmarked when regular teacher is absent without replacement", () => {
    const status = computeLiveSnapshotStatus({
      teacherAbsent: true,
      periodIsActiveOrPast: true,
      attendanceSubmitted: false,
    });
    expect(status).toBe("unmarked");
  });

  it("marks as unmarked when period has started and attendance is unsubmitted", () => {
    const status = computeLiveSnapshotStatus({
      periodIsActiveOrPast: true,
      attendanceSubmitted: false,
    });
    expect(status).toBe("unmarked");
  });

  it("marks as as_scheduled when timetable period is normal or submitted", () => {
    const status = computeLiveSnapshotStatus({
      periodIsActiveOrPast: true,
      attendanceSubmitted: true,
    });
    expect(status).toBe("as_scheduled");
  });
});

describe("validateLiveSnapshot", () => {
  it("passes for valid as_scheduled snapshot", () => {
    expect(() =>
      validateLiveSnapshot({
        status: "as_scheduled",
        attendanceSubmitted: true,
      }),
    ).not.toThrow();
  });

  it("passes for valid substitute snapshot with teacher", () => {
    expect(() =>
      validateLiveSnapshot({
        status: "substitute",
        substituteTeacherId: "t-sub-1",
        attendanceSubmitted: false,
      }),
    ).not.toThrow();
  });

  it("rejects unknown status", () => {
    expect(() =>
      validateLiveSnapshot({
        status: "unknown_status",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects substitution status without substitute teacher id", () => {
    expect(() =>
      validateLiveSnapshot({
        status: "substitute",
        substituteTeacherId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects free period claiming submitted attendance", () => {
    expect(() =>
      validateLiveSnapshot({
        status: "free",
        attendanceSubmitted: true,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects cancelled period claiming submitted attendance", () => {
    expect(() =>
      validateLiveSnapshot({
        status: "cancelled",
        attendanceSubmitted: true,
      }),
    ).toThrow(BusinessRuleError);
  });
});

describe("validateExtraPeriod", () => {
  const validScheduleId = "sch-123";
  const validTeacherId = "tch-456";
  const approverId = "usr-789";
  const approvalDate = new Date();

  it("passes for valid replacement with original schedule reference", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "replacement",
        replacesScheduleId: validScheduleId,
        resolution: "replacement_teacher",
        teacherId: validTeacherId,
      }),
    ).not.toThrow();
  });

  it("passes for self_study resolution without teacher", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "replacement",
        replacesScheduleId: validScheduleId,
        resolution: "self_study",
      }),
    ).not.toThrow();
  });

  it("rejects unknown extra period reason", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "random_reason",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects unknown replacement resolution", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "replacement",
        replacesScheduleId: validScheduleId,
        resolution: "random_resolution",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects replacement without schedule reference", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "replacement",
        replacesScheduleId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects substitution without schedule reference", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "substitution",
        replacesScheduleId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects replacement_teacher resolution without teacher", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "replacement",
        replacesScheduleId: validScheduleId,
        resolution: "replacement_teacher",
        teacherId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects payable extra period without teacher", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "additional_class",
        isPayable: true,
        teacherId: null,
        approvedByUserId: approverId,
        approvedAt: approvalDate,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects payable extra period without approval user and timestamp", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "additional_class",
        isPayable: true,
        teacherId: validTeacherId,
        approvedByUserId: null,
        approvedAt: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("passes for payable extra period with teacher and full approval", () => {
    expect(() =>
      validateExtraPeriod({
        reason: "additional_class",
        isPayable: true,
        teacherId: validTeacherId,
        approvedByUserId: approverId,
        approvedAt: approvalDate,
      }),
    ).not.toThrow();
  });
});

describe("validateIncidentReport", () => {
  const validDate = new Date("2026-10-30T10:00:00Z");

  it("passes for valid incident report", () => {
    expect(() =>
      validateIncidentReport({
        severity: "medium",
        kind: "behaviour",
        description: "Student altercation in corridor outside room 102",
        occurredAt: validDate,
      }),
    ).not.toThrow();
  });

  it("rejects unknown severity", () => {
    expect(() =>
      validateIncidentReport({
        severity: "urgent",
        kind: "behaviour",
        description: "Valid description",
        occurredAt: validDate,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects unknown kind", () => {
    expect(() =>
      validateIncidentReport({
        severity: "low",
        kind: "weather",
        description: "Valid description",
        occurredAt: validDate,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects short or empty description", () => {
    expect(() =>
      validateIncidentReport({
        severity: "low",
        kind: "other",
        description: "no",
        occurredAt: validDate,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects escalated incident without target supervisor", () => {
    expect(() =>
      validateIncidentReport({
        severity: "critical",
        kind: "security",
        description: "Unauthorized visitor entered back entrance",
        occurredAt: validDate,
        escalatedAt: new Date(),
        escalatedToUserId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects resolved incident without resolver or notes", () => {
    expect(() =>
      validateIncidentReport({
        severity: "low",
        kind: "device_failure",
        description: "Projector bulb flickering in room 204",
        occurredAt: validDate,
        resolvedAt: new Date(),
        resolvedByUserId: null,
        resolutionNotes: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("passes for resolved incident with resolver and notes", () => {
    expect(() =>
      validateIncidentReport({
        severity: "low",
        kind: "device_failure",
        description: "Projector bulb flickering in room 204",
        occurredAt: validDate,
        resolvedAt: new Date(),
        resolvedByUserId: "user-admin",
        resolutionNotes: "Replaced bulb with spare from IT storage",
      }),
    ).not.toThrow();
  });
});

describe("validateTeacherAbsence", () => {
  it("passes for full day absence without time slots", () => {
    expect(() =>
      validateTeacherAbsence({
        scope: "day",
        source: "manual",
        reportedByUserId: "incharge-1",
      }),
    ).not.toThrow();
  });

  it("rejects full day absence specifying time slots", () => {
    expect(() =>
      validateTeacherAbsence({
        scope: "day",
        source: "manual",
        reportedByUserId: "incharge-1",
        startTimeSlotId: "slot-1",
      }),
    ).toThrow(BusinessRuleError);
  });

  it("passes for period absence with both start and end time slots", () => {
    expect(() =>
      validateTeacherAbsence({
        scope: "period",
        source: "manual",
        reportedByUserId: "incharge-1",
        startTimeSlotId: "slot-1",
        endTimeSlotId: "slot-2",
      }),
    ).not.toThrow();
  });

  it("rejects period absence missing end time slot", () => {
    expect(() =>
      validateTeacherAbsence({
        scope: "period",
        source: "manual",
        reportedByUserId: "incharge-1",
        startTimeSlotId: "slot-1",
        endTimeSlotId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects leave_request source without leaveRequestId", () => {
    expect(() =>
      validateTeacherAbsence({
        scope: "day",
        source: "leave_request",
        leaveRequestId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("rejects manual absence without reportedByUserId", () => {
    expect(() =>
      validateTeacherAbsence({
        scope: "day",
        source: "manual",
        reportedByUserId: null,
      }),
    ).toThrow(BusinessRuleError);
  });
});
