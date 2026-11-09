/**
 * The finance module's public surface (`src/modules/README.md`): wires the Drizzle store into
 * the finance service, then exports one-call functions. Nothing outside the module reaches into
 * `application/`, `domain/` or `infrastructure/`.
 *
 * **Callers own the gates.** Every institution-targeted command below is authorized by its
 * caller *before* it arrives; the service owns policy (zod boundary, plausible dates, open
 * periods, the expense state machine as an argument, reversal reasons) and the store owns
 * integrity (tenant guards, version checks, the open-period re-check inside each posting
 * transaction, unique conflicts, and the zero-sum journal invariant). Raw `input: unknown` is
 * by design — the boundary schema runs inside the service, so no caller can bypass it.
 *
 * **`postFeeCollectionWithin` is the cross-module seam**, and the only finance function another
 * module's *infrastructure* may import. The fees store calls it from inside the payment's own
 * transaction (`RULES.md` §16: a receipt and its ledger entries are one write); the finance
 * application service is not involved because splitting the payment across two transactions
 * would let a receipt exist without its journal. It is idempotent on `paymentId`, so a retried
 * receipt cannot double-post the income.
 *
 * **`"use client"` files**: import *types* from this barrel; import value tuples and labels
 * (`JOURNAL_KIND_LABELS`, `EXPENSE_CATEGORIES`, `DEFAULT_ACCOUNTS`, …) from
 * `@/modules/finance/domain/finance-rules` instead. This barrel re-exports the store
 * (`drizzle` → `pg`, none of which exist in a browser), and a **value** import drags the whole
 * graph into the client bundle — a type import is erased, so it does not. The domain module is
 * pure rules over `@/shared/errors`, which is why the presentation vocabulary lives there.
 */
import type { DbLike } from "@/db/client";

import { createFinanceService } from "./application/finance-service";
import type { FinanceService } from "./application/finance-service";
import type { FeeCollectionPost, PayrollCollectionPost } from "./application/ports";
import { createFinanceStore, drizzleFinanceStore } from "./infrastructure/drizzle-store";

const finance: FinanceService = createFinanceService(drizzleFinanceStore);

/* ---- Posting ------------------------------------------------------------ */

export function postFeeCollection(input: unknown, userId: string) {
  return finance.postFeeCollection(input, { userId });
}

export function postPayrollCollection(input: unknown, userId: string) {
  return finance.postPayrollCollection(input, { userId });
}

export function recordIncome(input: unknown, userId: string) {
  return finance.recordIncome(input, { userId });
}

export function reverseJournal(input: unknown, userId: string) {
  return finance.reverseJournal(input, { userId });
}

/* ---- Expenses ----------------------------------------------------------- */

export function createExpense(input: unknown, userId: string) {
  return finance.createExpense(input, { userId });
}

export function submitExpense(input: unknown, userId: string) {
  return finance.submitExpense(input, { userId });
}

export function approveExpense(input: unknown, userId: string) {
  return finance.approveExpense(input, { userId });
}

export function markExpensePaid(input: unknown, userId: string) {
  return finance.markExpensePaid(input, { userId });
}

export function rejectExpense(input: unknown, userId: string) {
  return finance.rejectExpense(input, { userId });
}

/* ---- Configuration ------------------------------------------------------ */

export function createAccount(input: unknown, userId: string) {
  return finance.createAccount(input, { userId });
}

export function createExpenseHead(input: unknown, userId: string) {
  return finance.createExpenseHead(input, { userId });
}

export function setExpenseHeadActive(input: unknown, userId: string) {
  return finance.setExpenseHeadActive(input, { userId });
}

/* ---- Read models -------------------------------------------------------- */

export function listAccounts(input: unknown) {
  return finance.listAccounts(input);
}

export function listJournals(input: unknown) {
  return finance.listJournals(input);
}

export function getJournal(input: unknown) {
  return finance.getJournal(input);
}

export function listExpenses(input: unknown) {
  return finance.listExpenses(input);
}

export function getExpense(input: unknown) {
  return finance.getExpense(input);
}

export function listExpenseHeads(input: unknown) {
  return finance.listExpenseHeads(input);
}

export function getOverview(input: unknown) {
  return finance.getOverview(input);
}

/* ---- Cross-module seam -------------------------------------------------- */

/**
 * Post a fee payment's ledger journal **inside the caller's transaction**.
 *
 * The fees store calls this from within `recordPayment`'s own `executor.transaction`, after the
 * payment row exists, so the receipt and its journal commit or roll back together
 * (`RULES.md` §16). The store re-created over `executor` (a `DbLike`: the pooled client *or* a
 * transaction scope) runs its own work in that scope — a nested `transaction` becomes a
 * savepoint — which is the same seam `src/modules/admission` uses for multi-module writes.
 *
 * Failing here rolls back the payment too; that is intended. A payment that reached the cash
 * box but never reached the ledger is worse than a failed request, and the journal is
 * idempotent on `paymentId` so a retry inside the same transaction is safe.
 */
export function postFeeCollectionWithin(
  executor: DbLike,
  values: FeeCollectionPost,
  actorUserId: string,
): Promise<{ readonly journalId: string }> {
  return createFinanceStore(executor).postFeeCollection(values, actorUserId);
}

/**
 * Post a payroll run's payment journal **inside the caller's transaction** (Phase 12).
 *
 * The mirror of {@link postFeeCollectionWithin}, for the payroll module: the pay batch and the
 * salary-payment journal must commit together (`RULES.md` §16, `ARCHITECTURE.md` §21 — "a paid run
 * without a ledger journal is a state the database must refuse", which `payroll_runs` enforces with
 * `payroll_runs_journal_required`). The payroll store calls this from inside its own
 * `executor.transaction`, after the run has moved to `paid`, so the payment row, the run's status
 * and the journal are one write.
 *
 * Failing here rolls the payment back too: a payslip marked paid with no ledger entry is worse
 * than a failed request, and the journal's entries are idempotent on `payrollRunId`, so a retry
 * against the same run cannot post the salaries twice.
 */
export function postPayrollCollectionWithin(
  executor: DbLike,
  values: PayrollCollectionPost,
  actorUserId: string,
): Promise<{ readonly journalId: string; readonly accountId: string }> {
  return createFinanceStore(executor).postPayrollCollection(values, actorUserId);
}

/* ---- Value re-exports (domain — pure; see the "use client" note above) --- */

export {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  DEFAULT_ACCOUNTS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  JOURNAL_KINDS,
  JOURNAL_KIND_LABELS,
  JOURNAL_STATUSES,
  JOURNAL_STATUS_LABELS,
} from "./domain/finance-rules";

export type {
  AccountType,
  ExpenseCategory,
  ExpenseStatus,
  JournalStatus,
  TransactionKind,
} from "./domain/finance-rules";

/* ---- Types (erased at runtime — safe for `"use client"` imports) -------- */

export type { Actor, FinanceService } from "./application/finance-service";
export type {
  AccountRow,
  AccountWrite,
  ExpenseDetailRow,
  ExpenseHeadRow,
  ExpenseListRow,
  ExpenseWrite,
  FeeCollectionPost,
  FinanceOverview,
  IncomeWrite,
  JournalDetailRow,
  JournalListRow,
  LedgerEntryRow,
  OverviewCategoryTotal,
  OverviewKindTotal,
  OverviewMonth,
  Page,
  PayrollCollectionPost,
} from "./application/ports";
