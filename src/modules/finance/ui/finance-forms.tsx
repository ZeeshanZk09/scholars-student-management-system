"use client";

/**
 * Finance form controls (PRD MODULE 7 UI).
 *
 * The pattern the fee and admission modules settled on (`fees/ui/fee-forms.tsx`), matched to
 * what each command *is*:
 *
 * - **Recording income, an expense or an expense head** is ordinary creation → `EntityDialog`,
 *   ids hidden, the service enforcing the hard rules (a positive amount, a supported currency, a
 *   reversible date) from its zod boundary. The UI restates those rules as hints so the failure is
 *   rare, not so it is silent.
 * - **Reversing a journal** is the one destructive command in the module → a `destructive` trigger
 *   that names the reference and says what a reversal *is* (a second, mirrored journal; the
 *   original is never deleted), with the reason it demands already on screen.
 * - **Expense transitions** are one-click steps of a state machine (`EXPENSE_TRANSITIONS`), so
 *   they are inline forms in the table row rather than dialogs: nothing to type, nothing to
 *   dismiss, and the outcome lands beside the button. Each posts its `expectedVersion`, so a row
 *   someone else already moved fails with a conflict instead of silently deciding twice
 *   (`DESIGN.md` §17).
 *
 * `ExpenseRowActions` shows the buttons the row's status *and* the caller's grants allow — a
 * submit-only user is not offered "Approve", an approver is not offered "Submit". That filtering
 * is courtesy (`RULES.md` §19): each action re-checks its key server-side, and the state machine
 * re-checks the move itself.
 *
 * Values travel as plain `FormData`. Import rule (`index.ts` header): types come from the
 * barrel, but every value — labels, tuples — comes from `domain/finance-rules` or this module's
 * `form-options`, so this file never pulls the Drizzle store into the client bundle.
 */
import { EntityDialog } from "@/components/shared/entity-dialog";
import { useFormActionState, type FormState } from "@/components/shared/form-shell";
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { TextareaField, TextField } from "@/components/shared/text-field";
import { Button } from "@/components/ui/button";
import type { AccountRow, ExpenseHeadRow, ExpenseStatus } from "@/modules/finance";
import { IDLE_FORM_STATE } from "@/shared/forms";

import {
  approveExpenseAction,
  createExpenseAction,
  createExpenseHeadAction,
  markExpensePaidAction,
  recordIncomeAction,
  rejectExpenseAction,
  reverseJournalAction,
  submitExpenseAction,
} from "./actions";
import { EXPENSE_CATEGORY_OPTIONS, PAYMENT_METHOD_OPTIONS, accountOptions } from "./form-options";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

/** Today as `YYYY-MM-DD` — the default for "recorded on" / "incurred on" date fields. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The rendered outcome of an inline action: success or refusal, next to the button — the same
 * `role="alert"` / `role="status"` contract `FormShell` renders for a dialog (`PHASES.md` §13).
 * Duplicated rather than imported because the shell's copy is welded to its submit button, and a
 * table cell needs the message beside its own control.
 */
function InlineOutcome({ state }: Readonly<{ state: FormState }>) {
  if (state.status === "error" && state.message.length > 0) {
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

/* -------------------------------------------------------------------------- */
/* Posting                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Money entering the ledger outside fee collection — a grant, a sale, a refund received.
 *
 * The destination account is optional because the store resolves `payment_methods.ledgerAccountId`
 * for the chosen method when the form does not name one (`ports.ts`: the same seam fee collection
 * uses), which is what the blank option means rather than "no account".
 */
export function RecordIncomeDialog({
  institutionId,
  accounts,
}: Readonly<{
  institutionId: string;
  accounts: readonly AccountRow[];
}>) {
  const accountChoices: readonly SelectOption[] = [
    { value: "", label: "Default for the method" },
    ...accountOptions(accounts),
  ];

  return (
    <EntityDialog
      triggerLabel="Record income"
      title="Record income"
      description="Posts an income journal dated today or on a date you choose. It lands in the ledger immediately — an entry that never happened is corrected by a reversal, not edited."
      action={recordIncomeAction}
      submitLabel="Record income"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="finance-income-amount"
          name="amount"
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          required
        />
        <TextField
          id="finance-income-currency"
          name="currency"
          label="Currency"
          defaultValue="PKR"
          hint="3-letter ISO code, e.g. PKR."
          required
        />
        <TextField
          id="finance-income-transactionOn"
          name="transactionOn"
          label="Received on"
          type="date"
          defaultValue={today()}
          required
        />
        <SelectField
          id="finance-income-method"
          name="method"
          label="Method"
          options={PAYMENT_METHOD_OPTIONS}
          defaultValue="cash"
          required
        />
        <SelectField
          id="finance-income-accountId"
          name="accountId"
          label="To account"
          options={accountChoices}
          defaultValue=""
          hint={
            accounts.length === 0
              ? "No accounts yet — the store provisions the default for the method."
              : "Leave as-is to post to the default account for the chosen method."
          }
          disabled={accounts.length === 0}
        />
      </div>
      <TextareaField
        id="finance-income-description"
        name="description"
        label="Description"
        hint="Optional; shown on the journal."
        rows={2}
        maxLength={500}
      />
    </EntityDialog>
  );
}

/**
 * Correct a posted journal by writing its mirror. The reason is required by the boundary *and*
 * asserted to be at least three characters by the service (`finance-service.ts`), so the hint
 * states the rule the user would otherwise learn from a field error.
 */
export function ReverseJournalDialog({
  institutionId,
  journalId,
  referenceNumber,
}: Readonly<{
  institutionId: string;
  journalId: string;
  referenceNumber: string;
}>) {
  return (
    <EntityDialog
      triggerLabel="Reverse"
      triggerVariant="destructive"
      title={`Reverse ${referenceNumber}?`}
      description="A reversal posts a second journal with every direction swapped and marks this entry reversed. The original entry is preserved so financial reports remain accurate for audit purposes, and the reason is recorded on the reversal entry."
      action={reverseJournalAction}
      submitLabel="Post reversal"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="journalId" value={journalId} />
      <TextareaField
        id="finance-reversal-reason"
        name="reason"
        label="Reason"
        hint="At least 3 characters — an auditor reads it on the reversing journal."
        required
        rows={3}
        maxLength={500}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A spend booked as a draft: it names a head, an amount, a date and a method, and moves no money
 * until someone approves it (`EXPENSE_TRANSITIONS`). Only active heads are offered — a
 * deactivated head "stops appearing in new expenses", which is what `setExpenseHeadActive`
 * promises.
 */
export function CreateExpenseDialog({
  institutionId,
  heads,
}: Readonly<{
  institutionId: string;
  heads: readonly ExpenseHeadRow[];
}>) {
  const headOptions: readonly SelectOption[] = heads.map((head) => ({
    value: head.id,
    label: head.name,
  }));

  return (
    <EntityDialog
      triggerLabel="Record expense"
      title="Record an expense"
      description="Books a draft expense for approval. Nothing leaves the ledger until it is approved — that is the step that posts the journal."
      action={createExpenseAction}
      submitLabel="Record expense"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <SelectField
        id="finance-expense-head"
        name="expenseHeadId"
        label="Expense head"
        options={headOptions}
        placeholder={heads.length === 0 ? "No expense heads yet" : "Choose an expense head"}
        disabled={heads.length === 0}
        hint={
          heads.length === 0
            ? "Create an expense head first — every expense reports under one."
            : undefined
        }
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="finance-expense-amount"
          name="amount"
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          required
        />
        <TextField
          id="finance-expense-currency"
          name="currency"
          label="Currency"
          defaultValue="PKR"
          hint="3-letter ISO code, e.g. PKR."
          required
        />
        <TextField
          id="finance-expense-incurredOn"
          name="incurredOn"
          label="Incurred on"
          type="date"
          defaultValue={today()}
          hint="The period covering this date must be open."
          required
        />
        <SelectField
          id="finance-expense-method"
          name="method"
          label="Paid by"
          options={PAYMENT_METHOD_OPTIONS}
          defaultValue="cash"
          required
        />
      </div>
      <TextareaField
        id="finance-expense-description"
        name="description"
        label="Description"
        hint="What the spend was for — required, because it is what a reviewer reads."
        required
        rows={2}
        maxLength={2000}
      />
      <TextField
        id="finance-expense-receiptStorageKey"
        name="receiptStorageKey"
        label="Receipt reference"
        hint="Optional; an existing storage key for the receipt image."
      />
    </EntityDialog>
  );
}

/** A new reporting head: a name and the category it files under. */
export function CreateExpenseHeadDialog({ institutionId }: Readonly<{ institutionId: string }>) {
  return (
    <EntityDialog
      triggerLabel="New expense head"
      title="Create an expense head"
      description="A head is one line in the expense report — what the spend was for. Categories are the institution's reporting vocabulary, so pick the one this head belongs to."
      action={createExpenseHeadAction}
      submitLabel="Create head"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <TextField
        id="finance-expenseHead-name"
        name="name"
        label="Name"
        placeholder="Generator fuel"
        required
      />
      <SelectField
        id="finance-expenseHead-category"
        name="category"
        label="Category"
        options={EXPENSE_CATEGORY_OPTIONS}
        required
      />
      <TextareaField
        id="finance-expenseHead-description"
        name="description"
        label="Description"
        hint="Optional; what this head covers."
        rows={2}
        maxLength={500}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Expense transitions                                                         */
/* -------------------------------------------------------------------------- */

interface TransitionFormProps {
  readonly institutionId: string;
  readonly expenseId: string;
  readonly version: number;
  readonly action: (previous: FormState, formData: FormData) => Promise<FormState>;
  readonly label: string;
  readonly pendingLabel: string;
  readonly variant?: "default" | "outline" | undefined;
}

/**
 * One step of the state machine as a table-row form.
 *
 * The outcome renders beside the button rather than above it (there is no dialog chrome to hold
 * it), and the button stays in the tab order while the command runs: a native `disabled` would
 * drop focus to `<body>` without announcing why — the reasoning `FormShell` documents, applied
 * here for the same reason.
 */
function ExpenseTransitionForm({
  institutionId,
  expenseId,
  version,
  action,
  label,
  pendingLabel,
  variant = "outline",
}: Readonly<TransitionFormProps>) {
  const [state, formAction, isPending] = useFormActionState(action, IDLE_FORM_STATE);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2"
      aria-busy={isPending}
      onSubmit={(event) => {
        if (isPending) event.preventDefault();
      }}
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Button
        type="submit"
        variant={variant}
        size="xs"
        aria-disabled={isPending}
        onClick={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        {isPending ? pendingLabel : label}
      </Button>
      <InlineOutcome state={state} />
      {/* Polite live region: pending is announced without the button leaving the tab order. */}
      <p role="status" className="sr-only">
        {isPending ? pendingLabel : ""}
      </p>
    </form>
  );
}

/**
 * The controls one expense row offers, by status:
 *
 * | status    | offered                        | key              |
 * |-----------|--------------------------------|------------------|
 * | `draft`   | Submit for approval            | `finance.record` |
 * | `submitted` | Approve, Reject              | `finance.manage` |
 * | `approved`| Mark paid                      | `finance.manage` |
 * | `paid`, `rejected` | nothing (terminal)     | —                |
 *
 * `canRecord` / `canManage` come from the page so a grant is not turned into a button the server
 * will refuse. `paid` and `rejected` are terminal in `EXPENSE_TRANSITIONS`, so no control is
 * rendered for them rather than a disabled one that says nothing about why.
 */
export function ExpenseRowActions({
  institutionId,
  expenseId,
  version,
  status,
  canRecord,
  canManage,
}: Readonly<{
  institutionId: string;
  expenseId: string;
  version: number;
  status: ExpenseStatus;
  canRecord: boolean;
  canManage: boolean;
}>) {
  const shared = { institutionId, expenseId, version };

  if (status === "draft" && canRecord) {
    return (
      <ExpenseTransitionForm
        {...shared}
        action={submitExpenseAction}
        label="Submit expense"
        pendingLabel="Submitting…"
      />
    );
  }
  if (status === "submitted" && canManage) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ExpenseTransitionForm
          {...shared}
          action={approveExpenseAction}
          label="Approve expense"
          pendingLabel="Approving…"
          variant="default"
        />
        <ExpenseTransitionForm
          {...shared}
          action={rejectExpenseAction}
          label="Reject expense"
          pendingLabel="Rejecting…"
        />
      </div>
    );
  }
  if (status === "approved" && canManage) {
    return (
      <ExpenseTransitionForm
        {...shared}
        action={markExpensePaidAction}
        label="Mark paid"
        pendingLabel="Saving…"
        variant="default"
      />
    );
  }
  return null;
}
