/**
 * Attendance domain rules asserted in isolation (`PHASES.md` #32 Phase 15/16).
 *
 * These are pure functions with no database — exactly the contract `src/modules/README.md`
 * requires: "Test domain rules before building use cases on top."
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";

import {
  ATTENDANCE_SOURCES,
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
  isAbsentStatus,
  isBiometricSource,
  isDerivedFromLeaveSource,
  isLeaveStatus,
  isLateStatus,
  isManualSource,
  isSessionSubmitted,
  validateAttendanceCorrection,
  validateAttendanceMark,
  validateSessionTotals,
} from "./attendance-rules";

const baseMark = {
  status: "present" as AttendanceStatus,
  source: "manual",
  leaveRequestId: null as string | null,
  biometricTransactionId: null as string | null,
  markedByUserId: "user-1",
  minutesLate: null as number | null,
};

describe("attendance statuses", () => {
  it("is exactly four statuses — nothing else is a mark", () => {
    expect(ATTENDANCE_STATUSES).toEqual(["present", "absent", "late", "leave"]);
    for (const status of ATTENDANCE_STATUSES) {
      expect(isLeaveStatus(status === "leave" ? status : "present")).toBe(status === "leave");
      expect(isAbsentStatus(status)).toBe(status === "absent");
      expect(isLateStatus(status)).toBe(status === "late");
    }
  });
});

describe("attendance sources", () => {
  it("is exactly four sources — nothing else decides a mark", () => {
    expect(ATTENDANCE_SOURCES).toEqual(["manual", "biometric", "imported", "derived_from_leave"]);
    expect(isManualSource("manual")).toBe(true);
    expect(isManualSource("biometric")).toBe(false);
    expect(isBiometricSource("biometric")).toBe(true);
    expect(isDerivedFromLeaveSource("derived_from_leave")).toBe(true);
  });
});

describe("marking a student", () => {
  it("accepts a complete present mark", () => {
    expect(() => validateAttendanceMark({ ...baseMark, status: "present" })).not.toThrow();
  });

  it("accepts a complete late mark with positive minutes", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        status: "late",
        minutesLate: 12,
      }),
    ).not.toThrow();
  });

  it("accepts a leave mark derived from an approved leave", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        status: "leave",
        source: "derived_from_leave",
        leaveRequestId: "leave-1",
      }),
    ).not.toThrow();
  });

  it("refuses a leave mark without an approved leave request", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        status: "leave",
        source: "derived_from_leave",
        leaveRequestId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("refuses a leave mark sourced manually", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        status: "leave",
        source: "manual",
        leaveRequestId: "leave-1",
      }),
    ).toThrow(BusinessRuleError);
  });

  it("refuses a late mark without minutes", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        status: "late",
        minutesLate: null,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses minutes on a present mark", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        status: "present",
        minutesLate: 5,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses a manual mark with no marker", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        source: "manual",
        markedByUserId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("refuses a biometric mark with no device transaction", () => {
    expect(() =>
      validateAttendanceMark({
        ...baseMark,
        source: "biometric",
        biometricTransactionId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("refuses an unknown status", () => {
    expect(() => validateAttendanceMark({ ...baseMark, status: "excused" as unknown as string })).toThrow(
      ValidationError,
    );
  });

  it("refuses an unknown source", () => {
    expect(() => validateAttendanceMark({ ...baseMark, source: "gossip" as unknown as string })).toThrow(
      ValidationError,
    );
  });
});

describe("correcting a mark", () => {
  const baseCorrection = {
    beforeStatus: "present",
    afterStatus: "absent",
    reason: "Parent called in sick.",
    correctedByUserId: "user-2",
  };

  it("accepts any-to-any transition with a reason and an author", () => {
    expect(() => validateAttendanceCorrection({ ...baseCorrection })).not.toThrow();
    expect(() =>
      validateAttendanceCorrection({
        ...baseCorrection,
        beforeStatus: "absent",
        afterStatus: "present",
      }),
    ).not.toThrow();
  });

  it("refuses a no-change correction", () => {
    expect(() =>
      validateAttendanceCorrection({
        ...baseCorrection,
        afterStatus: "present",
      }),
    ).toThrow(ValidationError);
  });

  it("refuses an unknown after status", () => {
    expect(() =>
      validateAttendanceCorrection({
        ...baseCorrection,
        afterStatus: "half_day" as unknown as AttendanceStatus,
      }),
    ).toThrow(ValidationError);
  });

  it("requires a reason when correcting to leave", () => {
    expect(() =>
      validateAttendanceCorrection({
        ...baseCorrection,
        afterStatus: "leave",
        reason: "",
      }),
    ).toThrow(BusinessRuleError);
  });

  it("requires an author", () => {
    expect(() =>
      validateAttendanceCorrection({
        ...baseCorrection,
        correctedByUserId: null,
      }),
    ).toThrow(BusinessRuleError);
  });
});

describe("session totals", () => {
  const baseSession = {
    totalStudents: 40,
    markedCount: 12,
    status: "in_progress",
    submittedByUserId: null as string | null,
    submittedAt: null as Date | null,
  };

  it("accepts a well-formed in-progress session", () => {
    expect(() => validateSessionTotals(baseSession)).not.toThrow();
  });

  it("refuses marked above total", () => {
    expect(() => validateSessionTotals({ ...baseSession, markedCount: 41 })).toThrow(
      ValidationError,
    );
  });

  it("refuses a negative total", () => {
    expect(() => validateSessionTotals({ ...baseSession, totalStudents: -1 })).toThrow(
      ValidationError,
    );
  });

  it("requires a submitter and a moment once submitted", () => {
    expect(() =>
      validateSessionTotals({
        ...baseSession,
        status: "submitted",
        submittedByUserId: null,
        submittedAt: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("accepts a fully-submitted session", () => {
    expect(() =>
      validateSessionTotals({
        ...baseSession,
        status: "submitted",
        submittedByUserId: "user-3",
        submittedAt: new Date(),
      }),
    ).not.toThrow();
  });

  it("determines if session is submitted", () => {
    expect(isSessionSubmitted("submitted")).toBe(true);
    expect(isSessionSubmitted("in_progress")).toBe(false);
  });
});
