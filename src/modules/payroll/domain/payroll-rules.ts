/**
 * Payroll domain rules (`PRD.md` MODULE 9/10, `RULES.md` §36/§37/§39, `ARCHITECTURE.md` §20/§22).
 *
 * Pure over `@/shared/errors` and `@/shared/money` — no I/O, no Drizzle, no zod. Five concerns:
 *
 * 1. **The formula.** `RULES.md` §39: "**Completed units × configured per-unit amount** must form
 *    the baseline calculation", and `payroll_items` is the record of it. This file is the single
 *    place the arithmetic lives, so the service, the fakes and the store's `SQL` cannot disagree:
 *    `net = base + extra + adjustment - attendance - leave`. Two helpers do the multiplication and
 *    the pro-rata split, both exact and both documented where *rounding* is a policy.
 * 2. **Extra periods are a separate amount.** §39's "extra replacement periods must be represented
 *    distinctly and must not be counted twice" is not a discipline this module can rely on, so it
 *    is the shape of the calculation: an extra period never enters `unitCount` (see
 *    {@link PayrollLineCalculation}), and the store stamps the row it consumed so the same
 *    `extra_periods` row cannot be read twice.
 * 3. **The run's state machine.** `draft → calculated → approved → paid → locked`, monotonic.
 *    Recalculating is `calculated → calculated`, which is why a recalculation must preserve the
 *    manual work already done to a line (see `ports.ts`: `preservedAdjustments`).
 * 4. **What an adjustment is.** §37's rule is that automation must never silently destroy an
 *    authorized manual correction, so a manual value is a *row with a reason, an author and a
 *    moment* (`payroll_adjustments`), and the domain only validates what it can decide without a
 *    database: the vocabulary, the non-zero figure, the mandatory reason.
 * 5. **Dates are the query key** (`payroll.ts` on `period_start`/`period_end`). {@link
 *    overlappingDays} and {@link assertPayrollPeriod} are the two date rules: a month's leave is
 *    the intersection with the payroll period, not the leave's own length.
 */
import { BusinessRuleError, InternalError, ValidationError } from "@/shared/errors";
import { add, fromDecimalText, subtract, toDecimalText, type Money } from "@/shared/money";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/** `payroll_status_enum`, in lifecycle order. */
export const PAYROLL_STATUSES = ["draft", "calculated", "approved", "paid", "locked"] as const;

export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const PAYROLL_STATUS_LABELS: Readonly<Record<PayrollStatus, string>> = {
  draft: "Draft",
  calculated: "Calculated",
  approved: "Approved",
  paid: "Paid",
  locked: "Locked",
};

/**
 * The status tone each payroll status reads as, for `StatusBadge`.
 *
 * Exported here rather than in the UI because the mapping is part of what a status *means* in this
 * domain: a `locked` run is history, not a problem.
 */
export const PAYROLL_STATUS_TONES: Readonly<
  Record<PayrollStatus, "success" | "warning" | "danger" | "info" | "neutral">
> = {
  draft: "neutral",
  calculated: "info",
  approved: "warning",
  paid: "success",
  locked: "neutral",
};

/**
 * Every legal status edge.
 *
 * A run is **not** reversible: once approved it may only be paid, and once paid it may only be
 * locked. A `paid` run whose figures turn out to be wrong is corrected by a reversal payment and a
 * new run — `payroll.ts` records that the reversal is never a rewrite — so the machine deliberately
 * offers no edge backwards.
 */
export const PAYROLL_STATUS_TRANSITIONS: Readonly<Record<PayrollStatus, readonly PayrollStatus[]>> =
  {
    draft: ["calculated"],
    // Recalculating is a repeat of the same transition; the service is what preserves the manual work
    // already recorded on the run's lines.
    calculated: ["calculated", "approved"],
    approved: ["paid"],
    paid: ["locked"],
    locked: [],
  };

/** Whether `from` may become `to`. */
export function canTransitionPayrollStatus(from: PayrollStatus, to: PayrollStatus): boolean {
  return (PAYROLL_STATUS_TRANSITIONS[from] as readonly PayrollStatus[]).includes(to);
}

/**
 * @throws {BusinessRuleError} When the edge is not in {@link PAYROLL_STATUS_TRANSITIONS}.
 */
export function assertPayrollTransition(from: PayrollStatus, to: PayrollStatus): void {
  if (!canTransitionPayrollStatus(from, to)) {
    const why =
      from === to
        ? "The run is already in that status."
        : from === "locked"
          ? "A locked payroll is history. A correction is a new run, not a rewritten one."
          : "That transition is not allowed from the current status.";
    throw new BusinessRuleError(`Payroll run ${from} → ${to} is not a legal transition.`, {
      userMessage: why,
    });
  }
}

/** Whether a run's figures may still be written. Approval and beyond freeze them. */
export function isPayrollFrozen(status: PayrollStatus): boolean {
  return status === "approved" || status === "paid" || status === "locked";
}

/**
 * `payroll_adjustments.adjustmentType` — this module's own vocabulary, so the rule that keeps it
 * honest stays in this module (`ARCHITECTURE.md` §9).
 */
export const ADJUSTMENT_TYPES = [
  "bonus",
  "deduction",
  "overtime",
  "correction",
  "allowance",
  "clawback",
] as const;

export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_TYPE_LABELS: Readonly<Record<AdjustmentType, string>> = {
  bonus: "Bonus",
  deduction: "Deduction",
  overtime: "Overtime",
  correction: "Correction",
  allowance: "Allowance",
  clawback: "Clawback",
};

/**
 * @param amount Signed decimal text. Zero is refused: a no-op adjustment is noise in the trail.
 * @param reason Why. Mandatory — `RULES.md` §37.
 * @param corrects What the adjustment repairs, required for a `correction` and refused for anything
 * else, so "fix the payroll" and "change the payroll" are different actions
 * (`payroll_adjustments_correction_target_check`).
 */
export function assertAdjustment(
  amount: string,
  reason: string,
  adjustmentType: string,
  corrects: { readonly type: string | null; readonly id: string | null },
  fields: { readonly amount?: string; readonly reason?: string } = {},
): void {
  const amountField = fields.amount ?? "amount";
  const reasonField = fields.reason ?? "reason";
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("An adjustment needs a reason.", {
      [reasonField]: ["Write down why this adjustment was made."],
    });
  }
  const value = fromDecimalText(amount, "PKR");
  if (value.amountMinor === ZERO_MINOR) {
    throw new ValidationError("An adjustment must change the figure it applies to.", {
      [amountField]: ["Enter an amount other than zero."],
    });
  }
  if (adjustmentType === "correction") {
    if (corrects.type === null || corrects.id === null) {
      throw new ValidationError("A correction must name the record it corrects.", {
        [reasonField]: ["Name the record this corrects, or apply a different adjustment type."],
      });
    }
  } else if (corrects.type !== null || corrects.id !== null) {
    throw new ValidationError("Only a correction names a corrected record.", {
      [reasonField]: ["Choose the correction type, or clear the corrected record."],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Who may be paid                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The employment statuses a payroll run may include: active, and on leave.
 *
 * A departed employee is not excluded because a line would be wrong to compute — it is excluded
 * because *paying* them is a different act (a final settlement), and `employees.status` already
 * carries that fact (`hr.ts`: `leaving_date` is set on departure, and the run's period is compared
 * against it by the store). A `resigned` teacher paid for a month they were not employed for is the
 * error this list prevents.
 */
export const PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES = ["active", "on_leave"] as const;

/** Whether an employee's status makes them payable in a payroll run. */
export function isEligibleForPayroll(status: string): boolean {
  return (PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES as readonly string[]).includes(status);
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

/** `unitCount × rate`, exactly: 80 periods × 500.00 is 40,000.00 with no drift. */
export function scaleByUnitCount(rate: Money, unitCount: number): Money {
  return { amountMinor: rate.amountMinor * BigInt(unitCount), currency: rate.currency };
}

/** ES2017 has no bigint literals, so the zero a truncated pro-rata returns is a constant. */
const ZERO_MINOR = BigInt(0);

/**
 * `amount × days / totalDays`, rounded **toward zero**.
 *
 * The one place a payroll figure is divided, and the direction is a policy rather than an
 * arithmetic accident: truncating never credits a deduction larger than the employee's share of
 * the period, so the institution cannot overpay itself. The remainder is discarded, not carried,
 * because a payslip that says "5,000" and a ledger that says "5,000.33" is a dispute with no
 * answer.
 */
export function proRata(amount: Money, days: number, totalDays: number): Money {
  if (days === 0 || totalDays === 0) {
    return { amountMinor: ZERO_MINOR, currency: amount.currency };
  }
  if (days === totalDays) return amount;
  const truncated = (amount.amountMinor * BigInt(days)) / BigInt(totalDays);
  return { amountMinor: truncated, currency: amount.currency };
}

/** The minimum of two `yyyy-mm-dd` dates, as text — ISO dates compare lexically. */
export function laterDate(left: string, right: string): string {
  return left > right ? left : right;
}

/** The maximum of two `yyyy-mm-dd` dates, as text. */
export function earlierDate(left: string, right: string): string {
  return left < right ? left : right;
}

/**
 * Whole days of `[from, to]` that fall inside `[periodStart, periodEnd]`.
 *
 * Inclusive on both ends — a leave from 14th to 16th is three days of the month, which is what the
 * `leave_requests.total_days` column stores and what `leave_types.deducts_from_salary` prices.
 * Zero when the ranges do not overlap, so a leave for a different month prices nothing.
 */
export function overlappingDays(
  from: string,
  to: string,
  periodStart: string,
  periodEnd: string,
): number {
  const start = laterDate(from, periodStart);
  const end = earlierDate(to, periodEnd);
  if (start > end) return 0;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const ms = endDate.getTime() - startDate.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * @throws {ValidationError} When the period is empty, or longer than a calendar year — a payroll
 * period is a month, and a range that spans two is a typo rather than a policy.
 */
export function assertPayrollPeriod(
  periodStart: string,
  periodEnd: string,
  fields: { readonly start?: string; readonly end?: string } = {},
): void {
  const startField = fields.start ?? "periodStart";
  const endField = fields.end ?? "periodEnd";
  if (periodEnd < periodStart) {
    throw new ValidationError("A payroll period must end on or after it starts.", {
      [startField]: ["Choose a start date on or before the end date."],
    });
  }
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const horizon = new Date(start.getTime());
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
  if (end > horizon) {
    throw new ValidationError("A payroll period may not span more than a year.", {
      [endField]: ["Choose an end date within a year of the start."],
    });
  }
}

/** `March 2026` from a period's start — the display label, never the query key. */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function periodLabelFor(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00Z`);
  const month = MONTH_NAMES[date.getUTCMonth()];
  if (month === undefined) throw new InternalError("month index out of range");
  return `${month} ${date.getUTCFullYear()}`;
}

/* -------------------------------------------------------------------------- */
/* The calculation                                                            */
/* -------------------------------------------------------------------------- */

/** One line's inputs, before the net is derived. Money arrives as canonical decimal text. */
export interface PayrollLineCalculation {
  readonly currency: string;
  /** The fixed salary, or `unitCount × unitRate`. Must be ≥ 0. */
  readonly baseAmount: string;
  /** Pay for approved extra periods. Never part of `baseAmount`. */
  readonly extraPeriodAmount: string;
  /** Signed sum of the manual adjustments preserved from a previous calculation. */
  readonly adjustmentAmount: string;
  /** Absence deduction, positive, subtracted by the net. */
  readonly attendanceDeduction: string;
  /** Unpaid-leave deduction, positive, subtracted by the net. */
  readonly leaveDeduction: string;
}

/**
 * `base + extra + adjustment - attendance - leave`, in that order, with money rather than numbers:
 * a payslip figure that has been through binary floating point is a payslip that will not
 * reconcile (`RULES.md` §36).
 */
export function payrollNetAmount(line: PayrollLineCalculation): Money {
  const currency = line.currency;
  const base = fromDecimalText(line.baseAmount, currency);
  const extra = fromDecimalText(line.extraPeriodAmount, currency);
  const adjustment = fromDecimalText(line.adjustmentAmount, currency);
  const attendance = fromDecimalText(line.attendanceDeduction, currency);
  const leave = fromDecimalText(line.leaveDeduction, currency);
  return subtract(add(add(base, extra), adjustment), add(attendance, leave));
}

/** The stored net, as the text a `numeric` column holds. */
export function payrollNetText(line: PayrollLineCalculation): string {
  return toDecimalText(payrollNetAmount(line));
}

/**
 * The inputs, verbatim, so a recalculation can explain itself (`ARCHITECTURE.md` §22).
 *
 * Stored as `calculation_breakdown`, which is why every field is a primitive: the jsonb column is
 * what a person reads when they ask "where did this figure come from?", years later, after every
 * object that produced it has been refactored.
 */
export function calculationBreakdown(input: {
  readonly structure: "fixed" | "unit_based" | null;
  /**
   * Which figure supplied `periodsPerDay`: the published timetable, the structure's configured
   * denominator, or nothing at all. Part of the record because a unit count that disagrees with a
   * payslip has to be arguable, and the first question is always "which number did you use?".
   */
  readonly periodsPerDaySource?: "timetable" | "configuration" | "none";
  readonly periodsPerDay: number | null;
  readonly workingDaysInPeriod: number | null;
  readonly unitCount: number | null;
  readonly unitRate: string | null;
  readonly extraPeriodCount: number;
  readonly extraPeriodRate: string | null;
  readonly absenceDays: number;
  readonly unpaidLeaveDays: number;
  readonly salaryAssignmentAmount: string | null;
  readonly salaryStructureName: string | null;
  readonly preservedAdjustments: number;
}): Record<string, string | number | boolean | null> {
  return {
    structure: input.structure,
    salaryStructureName: input.salaryStructureName,
    periodsPerDay: input.periodsPerDay,
    periodsPerDaySource: input.periodsPerDaySource ?? null,
    workingDaysInPeriod: input.workingDaysInPeriod,
    unitCount: input.unitCount,
    unitRate: input.unitRate,
    extraPeriodCount: input.extraPeriodCount,
    extraPeriodRate: input.extraPeriodRate,
    absenceDays: input.absenceDays,
    unpaidLeaveDays: input.unpaidLeaveDays,
    salaryAssignmentAmount: input.salaryAssignmentAmount,
    preservedAdjustments: input.preservedAdjustments,
  };
}
