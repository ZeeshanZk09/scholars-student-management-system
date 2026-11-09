import { describe, expect, it } from "vitest";
import {
  assertAssignmentDateRange,
  assertAssignmentScope,
  assertMaxPeriodsPerDay,
  formatTeacherName,
  isDailyPeriodCapExceeded,
  teacherAssignmentBadgeTone,
} from "./teacher-rules";

describe("formatTeacherName", () => {
  it("formats first and last name", () => {
    expect(formatTeacherName({ firstName: "Fatima", lastName: "Khan" })).toBe("Fatima Khan");
  });

  it("formats single first name", () => {
    expect(formatTeacherName({ firstName: "Zainab" })).toBe("Zainab");
    expect(formatTeacherName({ firstName: "Zainab", lastName: "" })).toBe("Zainab");
    expect(formatTeacherName({ firstName: "Zainab", lastName: null })).toBe("Zainab");
  });

  it("trims whitespace", () => {
    expect(formatTeacherName({ firstName: "  Tariq ", lastName: "  Mehmood  " })).toBe(
      "Tariq Mehmood",
    );
  });
});

describe("assertAssignmentScope", () => {
  it("passes when exactly one scope is provided", () => {
    expect(() => assertAssignmentScope({ classId: "class-1" })).not.toThrow();
    expect(() => assertAssignmentScope({ groupId: "group-1" })).not.toThrow();
    expect(() => assertAssignmentScope({ sectionId: "section-1" })).not.toThrow();
  });

  it("throws validation error when multiple scopes are provided", () => {
    expect(() => assertAssignmentScope({ classId: "class-1", sectionId: "section-1" })).toThrow(
      "A teaching assignment must scope to exactly one target",
    );
  });

  it("throws validation error when zero scopes are provided", () => {
    expect(() => assertAssignmentScope({})).toThrow(
      "A teaching assignment must scope to exactly one target",
    );
    expect(() => assertAssignmentScope({ classId: null, groupId: undefined })).toThrow(
      "A teaching assignment must scope to exactly one target",
    );
  });
});

describe("assertAssignmentDateRange", () => {
  it("passes when until is after or equal to from", () => {
    const from = new Date("2026-01-01");
    const until = new Date("2026-06-30");
    expect(() => assertAssignmentDateRange(from, until)).not.toThrow();
    expect(() => assertAssignmentDateRange(from, from)).not.toThrow();
    expect(() => assertAssignmentDateRange(from, null)).not.toThrow();
  });

  it("throws business rule error when until is before from", () => {
    const from = new Date("2026-06-30");
    const until = new Date("2026-01-01");
    expect(() => assertAssignmentDateRange(from, until)).toThrow(
      "The assignment end date cannot precede the assignment start date.",
    );
  });
});

describe("assertMaxPeriodsPerDay", () => {
  it("passes for positive integers or null/undefined", () => {
    expect(() => assertMaxPeriodsPerDay(6)).not.toThrow();
    expect(() => assertMaxPeriodsPerDay(undefined)).not.toThrow();
    expect(() => assertMaxPeriodsPerDay(null)).not.toThrow();
  });

  it("throws for zero or negative values", () => {
    expect(() => assertMaxPeriodsPerDay(0)).toThrow("positive integer");
    expect(() => assertMaxPeriodsPerDay(-2)).toThrow("positive integer");
  });
});

describe("isDailyPeriodCapExceeded", () => {
  it("returns false if no cap set", () => {
    expect(isDailyPeriodCapExceeded(10, null)).toBe(false);
    expect(isDailyPeriodCapExceeded(10, undefined)).toBe(false);
  });

  it("returns true when current >= cap", () => {
    expect(isDailyPeriodCapExceeded(5, 5)).toBe(true);
    expect(isDailyPeriodCapExceeded(6, 5)).toBe(true);
    expect(isDailyPeriodCapExceeded(4, 5)).toBe(false);
  });
});

describe("teacherAssignmentBadgeTone", () => {
  it("maps counts to correct tones", () => {
    expect(teacherAssignmentBadgeTone(0)).toBe("neutral");
    expect(teacherAssignmentBadgeTone(1)).toBe("info");
    expect(teacherAssignmentBadgeTone(2)).toBe("info");
    expect(teacherAssignmentBadgeTone(3)).toBe("success");
    expect(teacherAssignmentBadgeTone(10)).toBe("success");
  });
});
