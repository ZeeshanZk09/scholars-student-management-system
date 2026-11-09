/**
 * Tests for leave domain rules (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  areLeaveRangesOverlapping,
  assertLeaveStatusTransition,
  calculateLeaveDays,
  canTransitionLeaveStatus,
  determineAttendanceStatusForAbsence,
  isDateWithinLeaveRange,
  LEAVE_STATUSES,
  validateLeaveDates,
  validateLeaveReview,
  validateLeaveSubject,
} from "./leave-rules";

describe("Leave status and state machine", () => {
  it("defines the 4 required statuses", () => {
    expect(LEAVE_STATUSES).toEqual(["pending", "approved", "rejected", "cancelled"]);
  });

  it("permits legal state transitions", () => {
    expect(canTransitionLeaveStatus("pending", "approved")).toBe(true);
    expect(canTransitionLeaveStatus("pending", "rejected")).toBe(true);
    expect(canTransitionLeaveStatus("pending", "cancelled")).toBe(true);
    expect(canTransitionLeaveStatus("approved", "cancelled")).toBe(true);
  });

  it("forbids illegal state transitions", () => {
    expect(canTransitionLeaveStatus("rejected", "approved")).toBe(false);
    expect(canTransitionLeaveStatus("cancelled", "approved")).toBe(false);
    expect(canTransitionLeaveStatus("approved", "pending")).toBe(false);
    expect(canTransitionLeaveStatus("pending", "pending")).toBe(false);
  });

  it("assertLeaveStatusTransition throws on illegal transitions", () => {
    expect(() => assertLeaveStatusTransition("pending", "approved")).not.toThrow();
    expect(() => assertLeaveStatusTransition("rejected", "approved")).toThrow(BusinessRuleError);
  });
});

describe("Leave days calculation and range validation", () => {
  it("calculates single-day leave correctly (inclusive)", () => {
    expect(calculateLeaveDays("2026-11-05", "2026-11-05")).toBe(1);
  });

  it("calculates multi-day leave correctly (inclusive)", () => {
    expect(calculateLeaveDays("2026-11-05", "2026-11-08")).toBe(4);
  });

  it("refuses end date earlier than start date", () => {
    expect(() => calculateLeaveDays("2026-11-08", "2026-11-05")).toThrow(BusinessRuleError);
  });

  it("refuses malformed dates", () => {
    expect(() => calculateLeaveDays("not-a-date", "2026-11-05")).toThrow(ValidationError);
    expect(() => calculateLeaveDays("2026-11-05", "invalid")).toThrow(ValidationError);
  });

  it("enforces consecutive days cap if specified", () => {
    expect(() => validateLeaveDates("2026-11-01", "2026-11-10", 7)).toThrow(BusinessRuleError);
    expect(validateLeaveDates("2026-11-01", "2026-11-05", 7).totalDays).toBe(5);
  });

  it("checks range overlap correctly", () => {
    const a = { fromDate: "2026-11-05", toDate: "2026-11-10" };
    expect(areLeaveRangesOverlapping(a, { fromDate: "2026-11-08", toDate: "2026-11-12" })).toBe(true);
    expect(areLeaveRangesOverlapping(a, { fromDate: "2026-11-01", toDate: "2026-11-04" })).toBe(false);
    expect(areLeaveRangesOverlapping(a, { fromDate: "2026-11-11", toDate: "2026-11-15" })).toBe(false);
  });

  it("checks date within range correctly", () => {
    expect(isDateWithinLeaveRange("2026-11-07", "2026-11-05", "2026-11-10")).toBe(true);
    expect(isDateWithinLeaveRange("2026-11-05", "2026-11-05", "2026-11-10")).toBe(true);
    expect(isDateWithinLeaveRange("2026-11-10", "2026-11-05", "2026-11-10")).toBe(true);
    expect(isDateWithinLeaveRange("2026-11-04", "2026-11-05", "2026-11-10")).toBe(false);
  });
});

describe("Leave subject validation", () => {
  it("accepts a student-only leave request", () => {
    expect(() => validateLeaveSubject({ studentId: "std-1", employeeId: null })).not.toThrow();
  });

  it("accepts an employee-only leave request", () => {
    expect(() => validateLeaveSubject({ studentId: null, employeeId: "emp-1" })).not.toThrow();
  });

  it("refuses a request naming neither student nor employee", () => {
    expect(() => validateLeaveSubject({ studentId: null, employeeId: null })).toThrow(BusinessRuleError);
  });

  it("refuses a request naming both student and employee", () => {
    expect(() => validateLeaveSubject({ studentId: "std-1", employeeId: "emp-1" })).toThrow(BusinessRuleError);
  });
});

describe("Leave review validation", () => {
  it("accepts approved review with decidedByUserId", () => {
    expect(() =>
      validateLeaveReview({
        status: "approved",
        decidedByUserId: "admin-1",
      }),
    ).not.toThrow();
  });

  it("refuses review without decidedByUserId", () => {
    expect(() =>
      validateLeaveReview({
        status: "approved",
        decidedByUserId: "",
      }),
    ).toThrow(BusinessRuleError);
  });

  it("requires decisionNotes when rejecting", () => {
    expect(() =>
      validateLeaveReview({
        status: "rejected",
        decidedByUserId: "admin-1",
        decisionNotes: "Exceeds allowed quota.",
      }),
    ).not.toThrow();

    expect(() =>
      validateLeaveReview({
        status: "rejected",
        decidedByUserId: "admin-1",
        decisionNotes: "",
      }),
    ).toThrow(BusinessRuleError);
  });
});

describe("Attendance integration rule", () => {
  it("determines present when student is not absent", () => {
    const res = determineAttendanceStatusForAbsence({
      isAbsent: false,
      hasApprovedLeave: false,
    });
    expect(res.status).toBe("present");
    expect(res.leaveRequestId).toBeNull();
    expect(res.source).toBe("manual");
  });

  it("determines leave when student is absent with approved leave", () => {
    const res = determineAttendanceStatusForAbsence({
      isAbsent: true,
      hasApprovedLeave: true,
      leaveRequestId: "leave-req-1",
    });
    expect(res.status).toBe("leave");
    expect(res.leaveRequestId).toBe("leave-req-1");
    expect(res.source).toBe("derived_from_leave");
  });

  it("determines absent when student is absent without approved leave", () => {
    const res = determineAttendanceStatusForAbsence({
      isAbsent: true,
      hasApprovedLeave: false,
      leaveRequestId: "leave-req-1", // Unapproved or pending
    });
    expect(res.status).toBe("absent");
    expect(res.leaveRequestId).toBeNull();
    expect(res.source).toBe("manual");
  });
});
