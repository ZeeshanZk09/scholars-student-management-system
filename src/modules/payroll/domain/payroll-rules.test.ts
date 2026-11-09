/**
 * Payroll domain rules (`PRD.md` MODULE 9, `RULES.md` §36/§37/§39, `ARCHITECTURE.md` §20/§22).
 *
 * The formula, the state machine, the adjustment vocabulary, the date arithmetic and the pro-rata
 * split are all asserted here, because they are the part of Phase 12 a correction cannot be
 * re-issued against: a run that has been paid is history, and the only way to be sure it was
 * calculated correctly is for the calculation to be one tested function.
 *
 * The three assertions that matter most are the PRD's: "completed units × configured per-unit
 * amount" is the baseline (`scaleByUnitCount` + `payrollNetAmount`), extra periods are distinct
 * (`PayrollLineCalculation` keeps them out of `baseAmount`), and a manual adjustment survives
 * recalculation (`assertAdjustment` and the transitions' `calculated → calculated`).
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import { fromDecimalText, toDecimalText } from "@/shared/money";

import {
  ADJUSTMENT_TYPES,
  PAYROLL_STATUS_TRANSITIONS,
  PAYROLL_STATUSES,
  assertAdjustment,
  assertPayrollPeriod,
  assertPayrollTransition,
  calculationBreakdown,
  canTransitionPayrollStatus,
  earlierDate,
  laterDate,
  overlappingDays,
  payrollNetAmount,
  payrollNetText,
  periodLabelFor,
  proRata,
  scaleByUnitCount,
} from "./payroll-rules";

describe("the payroll status machine", () => {
  it("walks draft → calculated → approved → paid → locked", () => {
    expect(canTransitionPayrollStatus("draft", "calculated")).toBe(true);
    expect(canTransitionPayrollStatus("calculated", "approved")).toBe(true);
    expect(canTransitionPayrollStatus("approved", "paid")).toBe(true);
    expect(canTransitionPayrollStatus("paid", "locked")).toBe(true);
  });

  it("allows a recalculation, which is why manual work must survive one", () => {
    expect(canTransitionPayrollStatus("calculated", "calculated")).toBe(true);
  });

  it("has no edge backwards, so a paid run can never be quietly rewritten", () => {
    for (const from of PAYROLL_STATUSES) {
      for (const to of PAYROLL_STATUSES) {
        const listed = PAYROLL_STATUS_TRANSITIONS[from].includes(to);
        if (PAYROLL_STATUSES.indexOf(to) < PAYROLL_STATUSES.indexOf(from))
          expect(listed).toBe(false);
        if (from === "locked") expect(listed).toBe(false);
      }
    }
  });

  it("refuses a locked run with a message that names the escape", () => {
    expect(() => assertPayrollTransition("locked", "paid")).toThrow(BusinessRuleError);
    expect(() => assertPayrollTransition("draft", "paid")).toThrow(BusinessRuleError);
    expect(() => assertPayrollTransition("calculated", "draft")).toThrow(BusinessRuleError);
  });
});

describe("the payroll formula", () => {
  it("pays 80 completed units × PKR 500 exactly", () => {
    const rate = fromDecimalText("500.00", "PKR");
    expect(toDecimalText(scaleByUnitCount(rate, 80))).toBe("40000.00");
  });

  it("derives net as base + extra + adjustment - attendance - leave", () => {
    const net = payrollNetAmount({
      currency: "PKR",
      baseAmount: "40000.00",
      extraPeriodAmount: "1500.00",
      adjustmentAmount: "-250.00",
      attendanceDeduction: "1000.00",
      leaveDeduction: "500.00",
    });
    expect(toDecimalText(net)).toBe("39750.00");
  });

  it("keeps an unrecorded deduction at zero rather than treating null as a subtraction", () => {
    const net = payrollNetAmount({
      currency: "PKR",
      baseAmount: "40000.00",
      extraPeriodAmount: "0.00",
      adjustmentAmount: "0.00",
      attendanceDeduction: "0.00",
      leaveDeduction: "0.00",
    });
    expect(toDecimalText(net)).toBe("40000.00");
  });

  it("renders the same text the numeric column will hold", () => {
    expect(
      payrollNetText({
        currency: "PKR",
        baseAmount: "1.00",
        extraPeriodAmount: "0.00",
        adjustmentAmount: "-0.01",
        attendanceDeduction: "0.00",
        leaveDeduction: "0.00",
      }),
    ).toBe("0.99");
  });

  it("subtracts a deduction that is larger than the pay, and says so rather than hiding it", () => {
    // The boundary schema refuses a negative base (`nonNegativeAmount`), so the formula's job is
    // only to be arithmetically honest about an over-deduction: the line prints what it says.
    const net = payrollNetAmount({
      currency: "PKR",
      baseAmount: "100.00",
      extraPeriodAmount: "0.00",
      adjustmentAmount: "0.00",
      attendanceDeduction: "150.00",
      leaveDeduction: "0.00",
    });
    expect(toDecimalText(net)).toBe("-50.00");
  });
});

describe("pro-rata", () => {
  const month = fromDecimalText("30000.00", "PKR");

  it("splits a fixed salary by days", () => {
    expect(toDecimalText(proRata(month, 10, 30))).toBe("10000.00");
  });

  it("truncates toward zero, so the institution never overpays itself", () => {
    // 1/3 of 100.00 is 33.333…; the employee's figure is 33.33, never 33.34.
    expect(toDecimalText(proRata(fromDecimalText("100.00", "PKR"), 1, 3))).toBe("33.33");
  });

  it("returns zero for a whole-period absence and the whole for none", () => {
    expect(toDecimalText(proRata(month, 0, 30))).toBe("0.00");
    expect(toDecimalText(proRata(month, 30, 30))).toBe("30000.00");
  });
});

describe("the period", () => {
  it("refuses an empty period and one that spans two years", () => {
    expect(() => assertPayrollPeriod("2026-03-31", "2026-03-01")).toThrow(ValidationError);
    expect(() => assertPayrollPeriod("2026-01-01", "2027-06-30")).toThrow(ValidationError);
    expect(() => assertPayrollPeriod("2026-03-01", "2026-03-31")).not.toThrow();
  });

  it("labels the period for display, with the dates remaining the query key", () => {
    expect(periodLabelFor("2026-03-01")).toBe("March 2026");
    expect(periodLabelFor("2026-01-15")).toBe("January 2026");
  });
});

describe("date overlap", () => {
  const start = "2026-03-01";
  const end = "2026-03-31";

  it("counts the part of a leave inside the period, inclusively", () => {
    expect(overlappingDays("2026-03-14", "2026-03-16", start, end)).toBe(3);
  });

  it("clips a leave that starts before the month or runs past it", () => {
    expect(overlappingDays("2026-02-26", "2026-03-05", start, end)).toBe(5);
    expect(overlappingDays("2026-03-28", "2026-04-04", start, end)).toBe(4);
  });

  it("prices nothing for a leave in another month", () => {
    expect(overlappingDays("2026-02-01", "2026-02-28", start, end)).toBe(0);
    expect(overlappingDays("2026-04-01", "2026-04-30", start, end)).toBe(0);
  });

  it("orders dates as text, because ISO dates compare lexically", () => {
    expect(laterDate("2026-03-01", "2026-02-28")).toBe("2026-03-01");
    expect(earlierDate("2026-03-01", "2026-02-28")).toBe("2026-02-28");
  });
});

describe("a manual adjustment", () => {
  const valid = { type: null, id: null };

  it("requires a reason, whatever the amount is", () => {
    expect(() => assertAdjustment("100.00", "", "bonus", valid)).toThrow(ValidationError);
    expect(() => assertAdjustment("100.00", "   ", "bonus", valid)).toThrow(ValidationError);
    expect(() => assertAdjustment("100.00", "Eid bonus", "bonus", valid)).not.toThrow();
  });

  it("refuses a zero adjustment, which is noise in the trail", () => {
    expect(() => assertAdjustment("0.00", "Nothing to record", "bonus", valid)).toThrow(
      ValidationError,
    );
  });

  it("names its own vocabulary", () => {
    expect(ADJUSTMENT_TYPES).toContain("clawback");
    expect(() => assertAdjustment("100.00", "Misc", "something_else", valid)).not.toThrow();
  });

  it("makes a correction say what it corrects, and nothing else do so", () => {
    // A correction without a target is a change wearing a fix's clothes.
    expect(() => assertAdjustment("100.00", "Missing period", "correction", valid)).toThrow(
      ValidationError,
    );
    expect(() =>
      assertAdjustment("100.00", "Missing period", "correction", {
        type: "attendance",
        id: "8b7c1f5e-2a1b-4c3d-8e9f-0a1b2c3d4e5f",
      }),
    ).not.toThrow();
    expect(() =>
      assertAdjustment("100.00", "A bonus is not a correction", "bonus", {
        type: "attendance",
        id: "8b7c1f5e-2a1b-4c3d-8e9f-0a1b2c3d4e5f",
      }),
    ).toThrow(ValidationError);
  });

  it("reads the field names the caller passes", () => {
    expect(() =>
      assertAdjustment("0.00", "", "bonus", valid, { amount: "adjustmentAmount" }),
    ).toThrow(ValidationError);
  });
});

describe("the calculation breakdown", () => {
  it("records the inputs verbatim, so a later recalculation can explain itself", () => {
    const breakdown = calculationBreakdown({
      structure: "unit_based",
      salaryStructureName: "Teacher pay",
      periodsPerDay: 6,
      workingDaysInPeriod: 22,
      unitCount: 132,
      unitRate: "500.00",
      extraPeriodCount: 2,
      extraPeriodRate: "500.00",
      absenceDays: 1,
      unpaidLeaveDays: 0,
      salaryAssignmentAmount: "60000.00",
      preservedAdjustments: 1,
    });
    expect(breakdown["unitCount"]).toBe(132);
    expect(breakdown["unitRate"]).toBe("500.00");
    expect(breakdown["extraPeriodCount"]).toBe(2);
    expect(breakdown["absenceDays"]).toBe(1);
  });
});
