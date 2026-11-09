/**
 * Input contracts for every payroll use case (`PRD.md` MODULE 9/10, `ARCHITECTURE.md` §20/§22).
 *
 * Each shape is the boundary (`ARCHITECTURE.md` §29) between a form and the calculation, and it
 * says three things the domain deliberately does not, because they are about *input* and not about
 * *payroll*:
 *
 * - **Money as decimal text.** `numeric(18,2)` columns store money as text, so the same text the
 *   column will hold is what the form validates, and `@/shared/money` is the only place it is
 *   converted.
 * - **`yyyy-mm-dd` dates.** `calendarDate` refuses anything a browser date input would not send,
 *   and a period's dates are compared to the period's *range*, never to a label (see the
 *   `payroll.ts` header).
 * - **Optimistic concurrency.** Every versioned write carries `expectedVersion`; a stale one is a
 *   `ConflictError`. `payroll_payments` has `updatedAt` rather than a version, so its settle write
 *   is guarded on that stamp, which is the only monotonic guard it has.
 *
 * What the schema *cannot* say — the state machine's next edge, whether the period is locked,
 * whether a recalculation would overwrite a manual adjustment — is checked by the service against
 * state it reads. That split is why nothing here needs a database.
 */
import { z } from "zod";

import { calendarDate, currencyCode, nonEmptyText, optionalId } from "@/shared/validation/fields";

import { ADJUSTMENT_TYPES, isEligibleForPayroll } from "../domain/payroll-rules";

const uuid = z.uuid("A valid reference is required.");

/** A signed decimal amount, required. */
const signedAmount = z
  .string()
  .trim()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "Enter an amount with at most 2 decimal places.");

const currency = currencyCode;

/* -------------------------------------------------------------------------- */
/* Periods and runs                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Opening a payroll period.
 *
 * `periodLabel` is absent on purpose: it is derived from `periodStart` (`periodLabelFor`), so a
 * label can never disagree with the dates the calculation filters by.
 */
export const createPayrollRunSchema = z.object({
  institutionId: uuid,
  academicSessionId: optionalId,
  periodStart: calendarDate("Period start"),
  periodEnd: calendarDate("Period end"),
  currency,
  notes: z.string().trim().max(2000).nullish(),
});

/** Ending a period for payroll: the write that makes "March is closed" a fact about March. */
export const lockPayrollPeriodSchema = z.object({
  institutionId: uuid,
  periodStart: calendarDate("Period start"),
  periodEnd: calendarDate("Period end"),
  reason: z.string().trim().max(500).nullish(),
});

/**
 * Recalculating an open run.
 *
 * `expectedVersion` guards the run row; the *manual* work on its lines is not a field here because
 * the service preserves it (see `ports.ts`, `preservedAdjustments`) — a recalculation moves
 * figures the calculation owns, and nothing else.
 */
export const calculatePayrollRunSchema = z.object({
  institutionId: uuid,
  payrollRunId: uuid,
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
});

export const approvePayrollRunSchema = z.object({
  institutionId: uuid,
  payrollRunId: uuid,
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
  /** Approving also approves the proposed adjustments in the same act (`payroll.ts`). */
  notes: z.string().trim().max(2000).nullish(),
});

export const rejectPayrollRunSchema = z.object({
  institutionId: uuid,
  payrollRunId: uuid,
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
  reason: nonEmptyText("Reason", 500),
});

/* -------------------------------------------------------------------------- */
/* Adjustments                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A manual adjustment to one calculated line.
 *
 * `RULES.md` §37: the calculated value, the adjusted value, the reason, the author and the moment
 * are five separate facts, so `amount` is signed, `reason` is mandatory and the *previous* figure is
 * written by the store from the row it just read — never supplied by the caller.
 */
export const createPayrollAdjustmentSchema = z.object({
  institutionId: uuid,
  payrollItemId: uuid,
  adjustmentType: z.enum(ADJUSTMENT_TYPES),
  amount: signedAmount,
  reason: nonEmptyText("Reason", 1000),
  correctsRecordType: z
    .enum(["attendance", "leave", "extra_period", "schedule", "salary_assignment"])
    .nullish(),
  correctsRecordId: optionalId,
});

export const reversePayrollAdjustmentSchema = z.object({
  institutionId: uuid,
  payrollAdjustmentId: uuid,
  reason: nonEmptyText("Reason", 1000),
});

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Processing a run's payment.
 *
 * `ledgerAccountId` is optional in the same sense the finance income form's is: the store resolves
 * the method's `payment_methods.ledgerAccountId`, then the institution's default, so a form that
 * names nothing is not a payment with nowhere to go. `paymentReference` is the bank's own reference
 * and is unique per institution (`payroll_payments_reference_key`), which is what makes a
 * reconciliation match possible (`RULES.md` §36).
 */
export const processPayrollPaymentSchema = z.object({
  institutionId: uuid,
  payrollRunId: uuid,
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
  method: z.enum(["cash", "bank_transfer", "cheque", "online_gateway", "card", "other"]),
  ledgerAccountId: optionalId,
  paymentReference: z.string().trim().max(128).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export const listPayrollRunsSchema = z.object({
  institutionId: uuid,
});

export const payRunDetailSchema = z.object({
  institutionId: uuid,
  payrollRunId: uuid,
});

/** One payslip line, for the provenance the payslip detail page renders. */
export const payrollItemDetailSchema = z.object({
  institutionId: uuid,
  payrollItemId: uuid,
});

export const employeePayrollHistorySchema = z.object({
  institutionId: uuid,
  employeeId: uuid,
});

/**
 * Which employees a run may include: the domain's `employee_status` filter.
 *
 * The rule itself lives in `../domain/payroll-rules.ts` (`isEligibleForPayroll`) so the fakes and
 * the store cannot disagree about who is payable. A payroll line for a departed employee is a
 * payment decision, not a data-access decision, which is why the store reads it from `employees`.
 */
export const EMPLOYEE_STATUS_FOR_PAYROLL = isEligibleForPayroll;
