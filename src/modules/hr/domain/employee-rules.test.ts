/**
 * HR domain rules (`PRD.md` MODULE 8, `src/db/schema/hr.ts`).
 *
 * The employment state machine, the leaving-date pairing, the staff-number format and the
 * employee-type→role bundle are asserted here: a status edge that should be impossible, or a
 * resignation stored without the date it happened, is data corruption no SQL check on this table
 * states in full.
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";

import {
  EMPLOYEE_STATUS_TRANSITIONS,
  EMPLOYEE_STATUSES,
  EMPLOYEE_TYPE_TO_ROLE_SLUG,
  EMPLOYEE_TYPES,
  EMPLOYMENT_TYPES,
  SALARY_STRUCTURES,
  assertEmployeeStatusTransition,
  assertLeavingDatePair,
  assertPlausibleJoiningDate,
  canTransitionEmployeeStatus,
  calendarDateString,
  isTerminalEmployeeStatus,
  nextEmployeeCode,
} from "./employee-rules";

/** Every unordered pair of statuses, so the transition table is asserted exhaustively. */
function pairs(): ReadonlyArray<readonly [string, string]> {
  const all: Array<readonly [string, string]> = [];
  for (const from of EMPLOYEE_STATUSES) {
    for (const to of EMPLOYEE_STATUSES) {
      all.push([from, to]);
    }
  }
  return all;
}

describe("HR vocabulary", () => {
  it("labels every enum member", () => {
    expect(EMPLOYEE_TYPES).toEqual([
      "teacher",
      "accountant",
      "floor_incharge",
      "hr",
      "admin",
      "other_staff",
    ]);
    expect(EMPLOYMENT_TYPES).toEqual(["full_time", "part_time", "contract", "visiting"]);
    expect(SALARY_STRUCTURES).toEqual(["fixed", "unit_based"]);
  });

  it("maps every employee type to exactly one system role bundle", () => {
    for (const type of EMPLOYEE_TYPES) {
      const slug = EMPLOYEE_TYPE_TO_ROLE_SLUG[type];
      expect(typeof slug).toBe("string");
      expect(slug.length).toBeGreaterThan(0);
    }
    // ADR-0002: the type decides the role, and the role identifiers are the platform slugs the
    // seed creates — no free-form bundle may appear here.
    expect(EMPLOYEE_TYPE_TO_ROLE_SLUG.floor_incharge).toBe("floor-incharge");
    expect(EMPLOYEE_TYPE_TO_ROLE_SLUG.other_staff).toBe("other-staff");
  });
});

describe("employment status transitions", () => {
  it("allows an active employee to go on leave or to leave for a reason", () => {
    expect(canTransitionEmployeeStatus("active", "on_leave")).toBe(true);
    expect(canTransitionEmployeeStatus("active", "resigned")).toBe(true);
    expect(canTransitionEmployeeStatus("active", "terminated")).toBe(true);
    expect(canTransitionEmployeeStatus("active", "retired")).toBe(true);
  });

  it("allows an employee on leave to return to active", () => {
    expect(canTransitionEmployeeStatus("on_leave", "active")).toBe(true);
    expect(canTransitionEmployeeStatus("on_leave", "resigned")).toBe(true);
  });

  it("refuses every departure as a no-op, and every departure as reversible", () => {
    for (const status of ["resigned", "terminated", "retired"] as const) {
      expect(EMPLOYEE_STATUS_TRANSITIONS[status]).toEqual([]);
      expect(canTransitionEmployeeStatus(status, "active")).toBe(false);
      expect(canTransitionEmployeeStatus(status, status)).toBe(false);
      expect(isTerminalEmployeeStatus(status)).toBe(true);
    }
  });

  it("treats every status left out of the table as impossible", () => {
    for (const [from, to] of pairs()) {
      const legal = canTransitionEmployeeStatus(from as never, to as never);
      const listed = (
        EMPLOYEE_STATUS_TRANSITIONS[
          from as keyof typeof EMPLOYEE_STATUS_TRANSITIONS
        ] as readonly string[]
      ).includes(to);
      expect(legal).toBe(listed);
      if (from === to) expect(legal).toBe(false);
    }
  });

  it("explains an illegal transition as a business rule", () => {
    expect(() => assertEmployeeStatusTransition("resigned", "active")).toThrow(BusinessRuleError);
    expect(() => assertEmployeeStatusTransition("on_leave", "active")).not.toThrow();
  });
});

describe("the leaving-date pairing", () => {
  it("requires a leaving date for a departure", () => {
    expect(() => assertLeavingDatePair("resigned", null)).toThrow(ValidationError);
    expect(() => assertLeavingDatePair("terminated", null)).toThrow(ValidationError);
    expect(() => assertLeavingDatePair("retired", null)).toThrow(ValidationError);
  });

  it("forbids a leaving date for an employee who has not left", () => {
    expect(() => assertLeavingDatePair("active", "2026-08-31")).toThrow(ValidationError);
    expect(() => assertLeavingDatePair("on_leave", "2026-08-31")).toThrow(ValidationError);
    expect(() => assertLeavingDatePair("active", null)).not.toThrow();
    expect(() => assertLeavingDatePair("on_leave", null)).not.toThrow();
  });

  it("accepts a dated departure", () => {
    expect(() => assertLeavingDatePair("resigned", "2026-08-31")).not.toThrow();
  });
});

describe("staff numbers", () => {
  it("pads to six digits, the institution's own sequence", () => {
    expect(nextEmployeeCode(1)).toBe("EP-000001");
    expect(nextEmployeeCode(7)).toBe("EP-000007");
    expect(nextEmployeeCode(123_456)).toBe("EP-123456");
  });
});

describe("a plausible joining date", () => {
  const today = new Date("2026-10-11T09:00:00");

  it("accepts a recent or back-dated hire", () => {
    expect(() => assertPlausibleJoiningDate("2026-08-01", today)).not.toThrow();
    expect(() => assertPlausibleJoiningDate("2000-01-01", today)).not.toThrow();
  });

  it("refuses a typo'd year in either direction", () => {
    expect(() => assertPlausibleJoiningDate("1999-12-31", today)).toThrow(ValidationError);
    expect(() => assertPlausibleJoiningDate("2027-10-12", today)).toThrow(ValidationError);
  });
});

describe("calendar dates", () => {
  it("renders a local date, never shifting to UTC", () => {
    expect(calendarDateString(new Date(2026, 9, 11))).toBe("2026-10-11");
    expect(calendarDateString(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});
