"use client";

/**
 * Payroll form controls (`PRD.md` MODULE 9/10 UI).
 *
 * The pattern the fee, admission, finance and HR modules settled on, matched to what each command
 * *is*:
 *
 * - **Opening a payroll period** is a small dated form: a month picker, a session to scope it to,
 *   and the ledger currency. The two month endpoints are computed from the chosen month and posted
 *   as hidden fields, so the form submits exactly what it displays — the label and the dates can
 *   never disagree (`periodLabelFor`, `payroll-rules.ts`).
 * - **Calculating** is a button, not a form, because a calculation has no inputs that belong to the
 *   user — everything it reads (the timetable, the attendance, the leave, the salary assignment) is
 *   the institution's own data. Presenting fields would imply a choice the database makes.
 * - **An adjustment** is the one command that carries a human decision, so it carries the most
 *   form: a signed amount, a reason that is *required*, and a "corrects record" pair that only a
 *   correction fills — `RULES.md` §37 wants the two kinds of manual change distinguishable.
 * - **Approving** and **settling** are one-click commands the run's status gates. Settling asks for
 *   the method and a bank reference, because a reconciliation that cannot be matched to a transfer
 *   is a reconciliation that was never finished.
 *
 * `canProcess` comes from the page so a grant is not turned into a button the server will refuse —
 * courtesy only (`RULES.md` §19): every action re-checks its key server-side, and the service
 * re-checks the state machine and the row's `version`.
 *
 * Values travel as plain `FormData`. Import rule (`index.ts` header): types come from the barrel,
 * every value — labels, tuples, option builders — comes from `domain/payroll-rules` or this
 * module's `form-options`, so this file never pulls the Drizzle store into the client bundle.
 *
 * `SelectField` has no `onChange`, so the two enums the user chooses between use a native `<select>`
 * and post a hidden value: the label is derived from the server's vocabulary and the form's own
 * state, so what the user sees is what the command receives.
 */
import { useState } from "react";

import { EntityDialog } from "@/components/shared/entity-dialog";
import { useFormActionState, type FormState } from "@/components/shared/form-shell";
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { TextareaField, TextField } from "@/components/shared/text-field";
import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE } from "@/shared/forms";

import {
  approvePayrollRunAction,
  calculatePayrollRunAction,
  createPayrollAdjustmentAction,
  createPayrollRunAction,
  processPayrollPaymentAction,
  reversePayrollAdjustmentAction,
} from "./actions";
import {
  academicSessionOptions,
  ADJUSTMENT_TYPE_OPTIONS,
  PAYROLL_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
} from "./form-options";

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Opening a payroll period.
 *
 * The month is a native select; the two endpoints are computed here and posted as hidden fields,
 * so the display, the dates and the calculation's filter can never drift apart.
 */
export function CreatePayrollRunDialog({
  institutionId,
  academicSessions,
}: Readonly<{
  institutionId: string;
  academicSessions: readonly { readonly id: string | null; readonly name: string }[];
}>) {
  const sessionChoices: readonly SelectOption[] = academicSessionOptions(academicSessions);
  // The current month: the one a school opens as soon as the month turns, and the first of the
  // three the picker offers, so the select's value and its displayed option can never disagree.
  const [yearMonth, setYearMonth] = useState(monthOptions()[0]?.value ?? "");
  const [periodStart, periodEnd] = monthBounds(yearMonth);

  return (
    <EntityDialog
      triggerLabel="Open period"
      title="Open a payroll period"
      description="Opens a month for payroll: a run that can be calculated, adjusted, approved and paid. The label follows the dates."
      action={createPayrollRunAction}
      submitLabel="Open period"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="periodEnd" value={periodEnd} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Month</span>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={yearMonth}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              setYearMonth(event.target.value);
            }}
            aria-label="Month"
          >
            {monthOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Calculates {periodStart} to {periodEnd}.
          </span>
        </label>
        <TextField
          id="payroll-period-currency"
          name="currency"
          label="Currency"
          defaultValue="PKR"
          required
        />
      </div>
      <SelectField
        id="payroll-period-academicSessionId"
        name="academicSessionId"
        label="Academic session"
        options={sessionChoices}
        defaultValue=""
        hint="Optional — a run does not need a session, only a month."
      />
      <TextareaField
        id="payroll-period-notes"
        name="notes"
        label="Notes"
        hint="Optional; who the month is for."
        rows={2}
        maxLength={2000}
      />
    </EntityDialog>
  );
}

/**
 * The two month endpoints of a `YYYY-MM` string.
 *
 * Split into one function because a period is a *range*: every place that needs the month's dates
 * uses the same pair, so a future month cannot accidentally produce an end date in another one.
 */
function monthBounds(yearMonth: string): readonly [string, string] {
  const [year, month] = yearMonth.split("-");
  const startYear = Number(year);
  const startMonth = Number(month);
  if (!Number.isFinite(startYear) || !Number.isFinite(startMonth)) {
    return ["", ""];
  }
  const first = `${yearMonth}-01`;
  const lastDay = new Date(startYear, startMonth, 0).getUTCDate();
  return [first, `${yearMonth}-${String(lastDay).padStart(2, "0")}`];
}

/** The months the period picker offers: the current one and the next two. */
function monthOptions(): readonly { readonly value: string; readonly label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    options.push({
      value,
      label: `${month.toLocaleString("en-GB", { month: "long" })} ${month.getFullYear()}`,
    });
  }
  return options;
}

/* -------------------------------------------------------------------------- */
/* The calculation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Calculating a run — a one-click command.
 *
 * A calculation has no inputs of the user's; everything it reads is the institution's data. The
 * copy says that rather than implying a choice the database makes, and the outcome names the two
 * facts the user would otherwise not know: what the calculation produced and that the manual work
 * already on the lines was preserved (`RULES.md` §37).
 */
export function CalculatePayrollRunForm({
  institutionId,
  payrollRunId,
  version,
}: Readonly<{ institutionId: string; payrollRunId: string; version: number }>) {
  const [state, formAction, isPending] = useFormActionState(
    calculatePayrollRunAction,
    IDLE_FORM_STATE,
  );

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      onSubmit={(event) => {
        if (isPending) event.preventDefault();
      }}
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="payrollRunId" value={payrollRunId} />
      <input type="hidden" name="version" value={version} />
      <Button
        type="submit"
        aria-disabled={isPending}
        onClick={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        {isPending ? "Calculating…" : "Calculate payroll"}
      </Button>
      <Outcome state={state} />
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Adjustments                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A manual adjustment: how much, of which kind, why.
 *
 * The reason is required and the amount is signed, because `RULES.md` §37 makes a manual value a
 * row with a reason, an author and a moment rather than a number that happened. A **correction** is
 * a second kind, and only it names the record it fixes — the schema's
 * `payroll_adjustments_correction_target_check` is what keeps a change wearing a fix's clothes out
 * of the trail.
 */
export function AdjustPayrollLineDialog({
  institutionId,
  payrollItemId,
}: Readonly<{ institutionId: string; payrollItemId: string }>) {
  const [adjustmentType, setAdjustmentType] = useState("bonus");
  const [correctsRecord, setCorrectsRecord] = useState(false);

  return (
    <EntityDialog
      triggerLabel="Adjust"
      title="Apply a manual adjustment"
      description="Changes the figure by hand, with a reason and a signature. An adjustment never removes a calculation — it records what was decided on top of it."
      action={createPayrollAdjustmentAction}
      submitLabel="Apply adjustment"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="payrollItemId" value={payrollItemId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Kind</span>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={adjustmentType}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              setAdjustmentType(event.target.value);
            }}
            aria-label="Kind"
          >
            {ADJUSTMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="adjustmentType" value={adjustmentType} />
        <TextField
          id="payroll-adjustment-amount"
          name="amount"
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          hint={
            isDeduction(adjustmentType)
              ? "Enter a positive amount; a deduction is subtracted."
              : "Added to the payslip."
          }
          required
        />
      </div>
      <TextareaField
        id="payroll-adjustment-reason"
        name="reason"
        label="Reason"
        hint="Required. A reason that does not outlive the person who wrote it is not a reason."
        rows={2}
        maxLength={1000}
        required
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setCorrectsRecord(event.target.checked);
          }}
        />
        This corrects a specific record (an absence, an extra period, a salary assignment)
      </label>
      {correctsRecord ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="payroll-adjustment-correctsType"
            name="correctsRecordType"
            label="Record type"
            options={[
              { value: "attendance", label: "Attendance day" },
              { value: "leave", label: "Leave request" },
              { value: "extra_period", label: "Extra period" },
              { value: "schedule", label: "Timetable period" },
              { value: "salary_assignment", label: "Salary assignment" },
            ]}
            defaultValue="attendance"
          />
          <TextField
            id="payroll-adjustment-correctsId"
            name="correctsRecordId"
            label="Record reference"
            hint="The reference ID of the record this adjustment fixes."
            required
          />
        </div>
      ) : null}
    </EntityDialog>
  );
}

/** Reverses an adjustment rather than deleting it — the trail must show it happened. */
export function ReversePayrollAdjustmentForm({
  institutionId,
  payrollAdjustmentId,
}: Readonly<{ institutionId: string; payrollAdjustmentId: string }>) {
  const [state, formAction, isPending] = useFormActionState(
    reversePayrollAdjustmentAction,
    IDLE_FORM_STATE,
  );

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      onSubmit={(event) => {
        if (isPending) event.preventDefault();
      }}
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="payrollAdjustmentId" value={payrollAdjustmentId} />
      <TextareaField
        id="payroll-reversal-reason"
        name="reason"
        label="Reason"
        hint="Required. Reversing is a fact too, and the row keeps its original entry."
        rows={2}
        maxLength={1000}
        required
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="outline"
          aria-disabled={isPending}
          onClick={(event) => {
            if (isPending) event.preventDefault();
          }}
        >
          {isPending ? "Reversing…" : "Reverse"}
        </Button>
        <Outcome state={state} />
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Approval and payment                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Approving a run — a one-click command the run's own status gates.
 *
 * Approval freezes its figures, which is why the button carries its own copy and why it disappears
 * with the run's status: a figure that moves under an approved run is a rule
 * (`ARCHITECTURE.md` §20), not a convenience. It also approves the run's proposed adjustments in the
 * same act (`payroll_adjustments_approval_pair`).
 */
export function ApprovePayrollRunForm({
  institutionId,
  payrollRunId,
  version,
  status,
}: Readonly<{
  institutionId: string;
  payrollRunId: string;
  version: number;
  status: string;
}>) {
  if (status !== "calculated") return null;
  return (
    <OneClickAction
      action={approvePayrollRunAction}
      fields={[
        { name: "institutionId", value: institutionId },
        { name: "payrollRunId", value: payrollRunId },
        { name: "version", value: String(version) },
      ]}
      label="Approve run"
      pendingLabel="Approving…"
    />
  );
}

/**
 * Settling the payment.
 *
 * The total is never a field — the service reads the run's own `SUM(net_amount)`, so what reaches
 * the ledger is what the calculation produced (`ARCHITECTURE.md` §21). The bank reference is what
 * makes a transfer matchable when it arrives, which is why it is the one field a settlement needs.
 */
export function ProcessPayrollPaymentDialog({
  institutionId,
  payrollRunId,
  version,
}: Readonly<{
  institutionId: string;
  payrollRunId: string;
  version: number;
}>) {
  const [method, setMethod] = useState("bank_transfer");

  return (
    <EntityDialog
      triggerLabel="Settle payment"
      title="Settle the salary payment"
      description="Marks the run paid and posts the salary-payment journal in the same transaction, so a paid run without a ledger entry is impossible. The total is the run's own calculated sum."
      action={processPayrollPaymentAction}
      submitLabel="Settle payment"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="payrollRunId" value={payrollRunId} />
      <input type="hidden" name="version" value={version} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Method</span>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={method}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            setMethod(event.target.value);
          }}
          aria-label="Method"
        >
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="ledgerAccountId" value="" />
      <p className="text-xs text-muted-foreground">
        The ledger account is resolved from the payment method&rsquo;s configuration, then the
        institution&rsquo;s default. It is never posted by the client.
      </p>
      {method === "bank_transfer" || method === "cheque" ? (
        <TextField
          id="payroll-payment-paymentReference"
          name="paymentReference"
          label="Bank reference"
          hint="The reference the transfer will carry; it is unique per institution, so a retry cannot post it twice."
        />
      ) : null}
      <TextareaField
        id="payroll-payment-notes"
        name="notes"
        label="Notes"
        rows={2}
        maxLength={2000}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A one-click command for a state that has no inputs of its own.
 *
 * Approving takes only the run's identity and its version token, so it is a form with hidden fields
 * rather than a dialog: a modal that asks for nothing is theatre.
 */
function OneClickAction({
  action,
  fields,
  label,
  pendingLabel,
}: Readonly<{
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  fields: readonly { readonly name: string; readonly value: string }[];
  label: string;
  pendingLabel: string;
}>) {
  const [state, formAction, isPending] = useFormActionState(action, IDLE_FORM_STATE);

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      onSubmit={(event) => {
        if (isPending) event.preventDefault();
      }}
    >
      {fields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <Button
        type="submit"
        aria-disabled={isPending}
        onClick={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        {isPending ? pendingLabel : label}
      </Button>
      <Outcome state={state} />
    </form>
  );
}

/**
 * The rendered outcome of a command, beside the control that issued it — the same `role="alert"` /
 * `role="status"` contract `FormShell` renders for a dialog.
 */
function Outcome({ state }: Readonly<{ state: FormState }>) {
  if (state.status === "error") {
    return (
      <>
        <span role="alert" className="text-xs text-destructive">
          {state.message}
        </span>
        {state.issues !== undefined && state.issues.length > 0 && (
          <ul className="list-inside list-disc text-xs text-destructive">
            {state.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </>
    );
  }
  if (state.status === "done") {
    return (
      <span role="status" className="text-xs text-muted-foreground">
        {state.message}
      </span>
    );
  }
  return null;
}

/** A deduction kind subtracts a positive amount; every other kind adds one. */
function isDeduction(adjustmentType: string): boolean {
  return adjustmentType === "deduction" || adjustmentType === "clawback";
}

/** The lifecycle, for the status column the run page renders. */
export { PAYROLL_STATUS_OPTIONS };
