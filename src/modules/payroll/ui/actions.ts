"use server";

/**
 * Payroll server actions (`PRD.md` MODULE 9/10, `PHASES.md` #20 Phase 12).
 *
 * Each action is the single path from `ui/` into the payroll module's use cases
 * (`src/modules/README.md`). It runs **two gates before the command** — the pattern every module
 * here uses (`../fees/ui/actions.ts`), with the payroll module's own permission keys:
 *
 * | command                  | key                 | who                                                |
 * |--------------------------|---------------------|----------------------------------------------------|
 * | open a payroll period    | `payroll.calculate` | HR/admin                                           |
 * | calculate a run          | `payroll.calculate` | HR/admin                                           |
 * | apply an adjustment      | `payroll.calculate` | HR/admin                                           |
 * | approve a run            | `payroll.approve`   | admin/HR (not the accountant)                      |
 * | lock a period            | `payroll.approve`   | admin/HR                                           |
 * | process a payment        | `payroll.process`   | accountant/admin only                              |
 *
 * The split is a requirement, not a preference: `PRD.md` MODULE 10 makes bulk salary payment an
 * accountant act, and `ARCHITECTURE.md` §20 separates configuration, calculation, adjustment and
 * the final record. No one role may do all four (`scripts/seed.ts` grants them apart), so the
 * person who prepares a payslip is not the person who settles it.
 *
 * The institution gate resolves the key *at* the institution the form names, so a forged
 * `institutionId` can never widen a grant (`SECURITY.md` §21, §87); the boundary schema then turns
 * untrusted input into the typed command the module accepts. Normalisations the schema cannot make
 * from a string happen here: `version` becomes the `expectedVersion` number the store guards on, and
 * checkboxes become real booleans (`formData.has` — an unchecked box sends nothing).
 *
 * A refusal from either gate comes back as a serialisable `FormState` for `useActionState`, so the
 * user stays on the form and reads why. `redirect()` (an expired session) is deliberately *not*
 * converted — see `gate`.
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  approvePayrollRun,
  calculatePayrollRun,
  createPayrollAdjustment,
  createPayrollRun,
  lockPayrollPeriod,
  processPayment,
  reversePayrollAdjustment,
} from "@/modules/payroll";
import type { PermissionKey, Principal } from "@/shared/authorization";
import { ConflictError, ValidationError, isAppError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

/** Anything naming a route must be a uuid — a raw form value would purge caches elsewhere. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The register, every run page, and the employee pages that read pay history. */
function revalidatePayroll(formData: FormData): void {
  revalidatePath("/finance/payroll");
  const runId = field(formData, "payrollRunId");
  if (UUID_PATTERN.test(runId)) revalidatePath(`/finance/payroll/${runId}`);
  const employeeId = field(formData, "employeeId");
  if (UUID_PATTERN.test(employeeId)) revalidatePath(`/hr/employees/${employeeId}`);
}

/** Raw `FormData` value for a key, or `""` when the part is absent. */
function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** An optimistic-concurrency token the schema wants as a number. */
function version(formData: FormData): number {
  return Number(field(formData, "version"));
}

/** An empty form control is `null`, not `""` — the schema's own decimal/date checks then pass. */
function optionalValue(formData: FormData, key: string): string | null {
  const value = field(formData, key).trim();
  return value === "" ? null : value;
}

/** Normalise a command failure into a serialisable form state. */
function stateFrom(error: unknown): FormState {
  if (isAppError(error)) {
    // A `ValidationError` carries per-field issues; the rest carry only a message, and the
    // distinction is what decides whether the form shows a field marker or a banner.
    if (error instanceof ValidationError) {
      return {
        status: "error",
        message: error.userMessage,
        issues: Object.values(error.fieldErrors).flat(),
      };
    }
    return { status: "error", message: error.userMessage };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

type Gate =
  | { readonly ok: true; readonly principal: Principal }
  | { readonly ok: false; readonly state: FormState };

/**
 * Gate: resolve `permission` at the institution the form names, returning the acting principal so
 * caller-stamped commands can use its `userId`.
 *
 * `AppError` becomes the `error` arm of `FormState` — a `ForbiddenError`, `ValidationError` or
 * `ConflictError` all carry a safe `userMessage` meant for exactly this. Anything else propagates,
 * and that includes `redirect("/login")` from an expired session: swallowing it would turn "your
 * session ended" into "something went wrong".
 */
async function gate(formData: FormData, permission: PermissionKey): Promise<Gate> {
  try {
    const principal = await requireInstitutionMutation(
      permission,
      field(formData, "institutionId"),
    );
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

/* ---- Periods and runs ----------------------------------------------------- */

/** Opens a payroll period and its run. The display label follows the dates. */
export async function createPayrollRunAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "payroll.calculate");
  if (!result.ok) return result.state;
  try {
    const created = await createPayrollRun(
      {
        institutionId: field(formData, "institutionId"),
        academicSessionId: optionalValue(formData, "academicSessionId"),
        periodStart: field(formData, "periodStart"),
        periodEnd: field(formData, "periodEnd"),
        currency: field(formData, "currency"),
        notes: optionalValue(formData, "notes"),
      },
      result.principal.userId,
    );
    revalidatePath("/finance/payroll");
    return { status: "done", message: `${created.periodLabel} opened.` };
  } catch (error) {
    return stateFrom(error);
  }
}

/** The calculation. Reads one snapshot, writes one set of lines. */
export async function calculatePayrollRunAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "payroll.calculate");
  if (!result.ok) return result.state;
  try {
    await calculatePayrollRun(
      {
        institutionId: field(formData, "institutionId"),
        payrollRunId: field(formData, "payrollRunId"),
        expectedVersion: version(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidatePayroll(formData);
    return stateFrom(error);
  }
  revalidatePayroll(formData);
  return {
    status: "done",
    message: "Payroll calculated. Adjustments already recorded are preserved.",
  };
}

/** Approves a run and, in the same act, its proposed adjustments. */
export async function approvePayrollRunAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "payroll.approve");
  if (!result.ok) return result.state;
  try {
    await approvePayrollRun(
      {
        institutionId: field(formData, "institutionId"),
        payrollRunId: field(formData, "payrollRunId"),
        expectedVersion: version(formData),
        notes: optionalValue(formData, "notes"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidatePayroll(formData);
    return stateFrom(error);
  }
  revalidatePayroll(formData);
  return { status: "done", message: "Payroll run approved." };
}

/** Closes a payroll period, so a later run for the same month is impossible. */
export async function lockPayrollPeriodAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "payroll.approve");
  if (!result.ok) return result.state;
  try {
    await lockPayrollPeriod(
      {
        institutionId: field(formData, "institutionId"),
        periodStart: field(formData, "periodStart"),
        periodEnd: field(formData, "periodEnd"),
        reason: optionalValue(formData, "reason"),
      },
      result.principal.userId,
    );
    revalidatePath("/finance/payroll");
    return { status: "done", message: "Payroll period closed." };
  } catch (error) {
    return stateFrom(error);
  }
}

/* ---- Adjustments --------------------------------------------------------- */

/**
 * A manual adjustment to one calculated line.
 *
 * The reason is mandatory and the amount is signed: `RULES.md` §37's rule is that a manual value, a
 * calculated one, the reason, the author and the moment are five separate facts, and the store
 * writes the previous figure from the row it just read rather than trusting the form.
 */
export async function createPayrollAdjustmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "payroll.calculate");
  if (!result.ok) return result.state;
  try {
    const rawAmount = field(formData, "amount").trim();
    const adjustmentType = field(formData, "adjustmentType");
    const isDeduction = adjustmentType === "deduction" || adjustmentType === "clawback";
    const amount =
      isDeduction && !rawAmount.startsWith("-") && rawAmount !== ""
        ? `-${rawAmount}`
        : rawAmount;

    await createPayrollAdjustment(
      {
        institutionId: field(formData, "institutionId"),
        payrollItemId: field(formData, "payrollItemId"),
        adjustmentType,
        amount,
        reason: field(formData, "reason"),
        correctsRecordType: optionalValue(formData, "correctsRecordType"),
        correctsRecordId: optionalValue(formData, "correctsRecordId"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidatePayroll(formData);
    return stateFrom(error);
  }
  revalidatePayroll(formData);
  return { status: "done", message: "Adjustment applied." };
}

/** Reverses an adjustment: the row is never deleted, only marked reversed with a reason. */
export async function reversePayrollAdjustmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "payroll.calculate");
  if (!result.ok) return result.state;
  try {
    await reversePayrollAdjustment(
      {
        institutionId: field(formData, "institutionId"),
        payrollAdjustmentId: field(formData, "payrollAdjustmentId"),
        reason: field(formData, "reason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidatePayroll(formData);
    return stateFrom(error);
  }
  revalidatePayroll(formData);
  return { status: "done", message: "Adjustment reversed." };
}

/* ---- Payment ------------------------------------------------------------- */

/**
 * Settles a run's payment and posts the salary-payment journal in the same transaction.
 *
 * The total is never posted by the client: the service reads the run's own `SUM(net_amount)`, so
 * the amount that reaches the ledger is the amount the calculation produced
 * (`ARCHITECTURE.md` §21, `RULES.md` §36).
 */
export async function processPayrollPaymentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "payroll.process");
  if (!result.ok) return result.state;
  try {
    await processPayment(
      {
        institutionId: field(formData, "institutionId"),
        payrollRunId: field(formData, "payrollRunId"),
        expectedVersion: version(formData),
        method: field(formData, "method"),
        ledgerAccountId: optionalValue(formData, "ledgerAccountId"),
        paymentReference: optionalValue(formData, "paymentReference"),
        notes: optionalValue(formData, "notes"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidatePayroll(formData);
    return stateFrom(error);
  }
  revalidatePayroll(formData);
  return { status: "done", message: "Salary payment posted to the ledger." };
}
