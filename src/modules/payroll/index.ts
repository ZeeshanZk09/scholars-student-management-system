/**
 * The payroll module's public surface (`src/modules/README.md`): wires the Drizzle store into the
 * service, then exports one-call functions. Nothing outside the module reaches into
 * `application/`, `domain/` or `infrastructure/`.
 *
 * **Callers own the gates.** Every institution-targeted command below is authorized by its caller
 * *before* it arrives — the same contract every module in `src/modules/` states, and the one that
 * matters most here, because a payroll command moves money and employment status. A server action
 * checks the principal's `payroll.*` permission and then hands the action a named `userId`; the
 * service owns policy (the zod boundary, the state machine, the formula, the adjustment rules) and
 * the store owns integrity (tenant guards, the version predicates, the extra-period stamp, the
 * ledger journal inside the payment's transaction). Raw `input: unknown` is by design — the
 * boundary schema runs inside the service, so no caller can bypass it.
 *
 * **The finance seam is the only cross-module edge.** `processPayrollCollection` posts the
 * salary-payment journal through `@/modules/finance` inside the payment's own transaction, exactly
 * as the fees store does for a fee collection. `RULES.md` §16 is the reason: the payslip and the
 * ledger entry must commit together, so a run marked `paid` without a journal is a state the
 * database refuses (`payroll_runs_journal_required`) rather than one the application mitigates.
 *
 * **`"use client"` files**: import *types* from this barrel; import value tuples and labels
 * (`PAYROLL_STATUSES`, `ADJUSTMENT_TYPE_LABELS`, …) from `@/modules/payroll/domain/payroll-rules`
 * instead. This barrel re-exports the store (`drizzle` → `pg`, none of which exist in a browser),
 * and a **value** import drags the whole graph into the client bundle — a type import is erased,
 * so it does not.
 */
import { createPayrollService } from "./application/payroll-service";
import type { Actor, PayrollService } from "./application/payroll-service";
import { createPayrollStore, drizzlePayrollStore } from "./infrastructure/drizzle-store";

const payroll: PayrollService = createPayrollService(drizzlePayrollStore);

/* ---- Periods and runs ---------------------------------------------------- */

/** Opens a payroll period and its run. Derives the display label from the dates. */
export function createPayrollRun(input: unknown, userId: string) {
  return payroll.createPayrollRun(input, { userId });
}

export function listPayrollRuns(input: unknown) {
  return payroll.listPayrollRuns(input);
}

export function getPayrollRun(input: unknown) {
  return payroll.getPayrollRun(input);
}

/** The calculation: one snapshot in, one set of lines out. */
export function calculatePayrollRun(input: unknown, userId: string) {
  return payroll.calculatePayrollRun(input, { userId });
}

export function approvePayrollRun(input: unknown, userId: string) {
  return payroll.approvePayrollRun(input, { userId });
}

/** Closing a period for payroll, so a later run for the same month is impossible. */
export function lockPayrollPeriod(input: unknown, userId: string) {
  return payroll.lockPayrollPeriod(input, { userId });
}

/* ---- Adjustments --------------------------------------------------------- */

export function createPayrollAdjustment(input: unknown, userId: string) {
  return payroll.createPayrollAdjustment(input, { userId });
}

export function reversePayrollAdjustment(input: unknown, userId: string) {
  return payroll.reversePayrollAdjustment(input, { userId });
}

/* ---- Payment ------------------------------------------------------------- */

export function processPayment(input: unknown, userId: string) {
  return payroll.processPayment(input, { userId });
}

/* ---- Read models --------------------------------------------------------- */

export function getPayrollItem(input: unknown) {
  return payroll.getPayrollItem(input);
}

export function listPayrollAdjustments(input: unknown) {
  return payroll.listPayrollAdjustments(input);
}

export function employeePayrollHistory(input: unknown) {
  return payroll.employeePayrollHistory(input);
}

/* ---- Value re-exports (domain — pure; see the "use client" note above) --- */

export {
  ADJUSTMENT_TYPES,
  ADJUSTMENT_TYPE_LABELS,
  PAYROLL_STATUSES,
  PAYROLL_STATUS_LABELS,
  PAYROLL_STATUS_TONES,
  PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES,
} from "./domain/payroll-rules";

export type { AdjustmentType, PayrollStatus } from "./domain/payroll-rules";

/* ---- Types (erased at runtime — safe for `"use client"` imports) -------- */

export type { Actor };

export type {
  EmployeePayrollHistoryRow,
  PayrollAdjustmentRow,
  PayrollCalculationInputs,
  PayrollCalculationResult,
  PayrollItemRow,
  PayrollLineWrite,
  PayrollPaymentRow,
  PayrollRunDetailRow,
  PayrollRunListRow,
  PayrollStore,
} from "./application/ports";

/**
 * A store bound to a caller's transaction, the seam a later phase uses when a write spans the
 * payroll module and another one — the same shape `createHrStore` and the finance store expose.
 */
export { createPayrollStore };
