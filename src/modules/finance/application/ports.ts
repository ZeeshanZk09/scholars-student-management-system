/**
 * What the application layer needs from the data layer (`src/modules/README.md`: ports in,
 * Drizzle out). Nothing here imports `db`, `drizzle-orm` or a table — the service is tested
 * against `testing/fakes.ts` without a database, exactly like the fee module's port.
 *
 * Four seams deserve naming, because they are what a store implementation has to get right:
 *
 * - **Every method is institution-scoped.** There is no unscoped read or write; `institutionId`
 *   is a claim the server action checks, not a value the caller may move a record out of
 *   (`SECURITY.md` §21). A store that ignores it leaks one institution's ledger to another.
 * - **No balance is ever stored** (`ADR-0003`). `AccountRow.balance` is the store's `SUM()`
 *   computed per direction at read time, and `FinanceOverview` is the same over the journal
 *   table. A column that cached either would become a fourth source of truth next to the
 *   entries it was derived from.
 * - **Posting is one transaction** (`RULES.md` §16): the journal header, its entries and the row
 *   it belongs to — a payment, an expense, a reversal — are written together, and the zero-sum
 *   invariant is asserted inside that transaction before the insert (see
 *   `assertJournalBalanced`).
 * - **Versioned writes take `expectedVersion`** and raise `ConflictError` when the row moved
 *   underneath, the same optimistic concurrency admission and fees use.
 *
 * ## The two formulas a store must reproduce exactly
 *
 * **Account balance** (`accountBalance`, domain): for `income`, `SUM(out) − SUM(in)`;
 * for `expense` and every asset type, `SUM(in) − SUM(out)`. Negative is a real answer.
 *
 * **Overview** (`getOverview`): over journals of the institution that have touched the ledger —
 * every status except `draft`, so a *reversed original stays in the aggregate* (it was posted,
 * and the ledger does not rewrite the month it landed in) — whose entries are in the reported
 * currency —
 *
 * - contribution per journal = `overviewContribution(journal)`: `fee_collection` and `income`
 *   are income, `refund` is income with the sign flipped, `expense` is expense, everything else
 *   contributes to neither bucket;
 * - a journal with `reversesTransactionId` set contributes with the opposite sign, dated in the
 *   correcting month: the month that was wrong keeps its original figure, the new month carries
 *   the cancellation, and the all-time totals net to zero;
 * - `incomeTotal` / `expenseTotal` are all-time; `netPosition = income − expense`;
 * - `monthly` groups the same contributions by `monthKey(transactionOn)` over the trailing
 *   `months` window ending at the current month, zero-filled through `monthKeysEndingAt`,
 *   oldest first;
 * - `byKind` sums each journal's signed *movement* (positive for income and spend recognised,
 *   negative for refunds and for every reversal) — the same figure as its bucket for the four
 *   bucketed kinds, the gross figure for `salary_payment`/`adjustment`/`opening_balance`, so a
 *   corrected kind nets toward zero and an unbucketed one still shows a number;
 * - `byExpenseCategory` sums the entries carrying a `ledger_entries.category` (one per journal,
 *   on the expense side) under the same reversal sign.
 *
 * The reported `currency` is the institution's `Cash in Hand` currency — the account the first
 * posting auto-provisions — or `PKR` before anything has been posted. Journals in any other
 * currency are excluded from the aggregates rather than converted: FX translation is out of
 * scope for Phase 10, and silently adding PKR to USD would be worse than leaving them out.
 */
import type {
  AccountType,
  ExpenseCategory,
  ExpenseStatus,
  JournalStatus,
  PaymentMethod,
  TransactionDirection,
  TransactionKind,
} from "../domain/finance-rules";

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One financial account with its derived balance.
 *
 * `openedOn`/`closedOn` are calendar dates (`yyyy-mm-dd`); `balance` is decimal text, signed
 * according to the account type — never a column (`ADR-0003`).
 */
export interface AccountRow {
  readonly id: string;
  readonly institutionId: string;
  readonly name: string;
  readonly accountType: AccountType;
  readonly bankName: string | null;
  readonly accountNumber: string | null;
  readonly iban: string | null;
  readonly currency: string;
  readonly isActive: boolean;
  readonly openedOn: string | null;
  readonly closedOn: string | null;
  /** Derived from the ledger: `SUM(in) − SUM(out)`, except on `income` accounts. */
  readonly balance: string;
  readonly version: number;
  readonly updatedAt: Date;
}

/** One `journal_transactions` header, rolled up for the journals list. */
export interface JournalListRow {
  readonly id: string;
  readonly institutionId: string;
  readonly kind: TransactionKind;
  readonly referenceNumber: string;
  readonly description: string | null;
  readonly paymentId: string | null;
  readonly payrollRunId: string | null;
  readonly transactionOn: string;
  readonly status: JournalStatus;
  readonly postedAt: Date | null;
  readonly reversedAt: Date | null;
  /** The journal that reverses this one, once corrected. */
  readonly reversesTransactionId: string | null;
  /** `SUM(in)` — the journal's amount. A balanced journal's `SUM(out)` is the same figure. */
  readonly totalAmount: string;
  /** From the entries: every journal has exactly one currency (`assertJournalBalanced`). */
  readonly currency: string;
  readonly createdAt: Date;
}

/** One `ledger_entries` line with its account's display name, for the journal detail page. */
export interface LedgerEntryRow {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly direction: TransactionDirection;
  readonly amount: string;
  readonly currency: string;
  readonly category: ExpenseCategory | null;
  readonly feeCategory: string | null;
  readonly description: string | null;
}

/** The header plus its entries — one read, so the detail page issues no second query (no N+1). */
export interface JournalDetailRow extends JournalListRow {
  readonly entries: readonly LedgerEntryRow[];
}

/** One row of the expenses list, with the head's name joined for display. */
export interface ExpenseListRow {
  readonly id: string;
  readonly institutionId: string;
  readonly expenseHeadId: string;
  readonly expenseHeadName: string;
  readonly departmentId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly description: string;
  readonly incurredOn: string;
  readonly method: PaymentMethod;
  readonly status: ExpenseStatus;
  readonly approvedByUserId: string | null;
  readonly approvedAt: Date | null;
  /** Set when the expense is approved — the journal that posted it. */
  readonly journalTransactionId: string | null;
  readonly requestedByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ExpenseDetailRow extends ExpenseListRow {
  readonly receiptStorageKey: string | null;
}

/** One configured expense head, including the ledger account it posts to. */
export interface ExpenseHeadRow {
  readonly id: string;
  readonly institutionId: string;
  readonly name: string;
  readonly category: ExpenseCategory;
  readonly parentHeadId: string | null;
  readonly ledgerAccountId: string | null;
  readonly isActive: boolean;
  readonly description: string | null;
  readonly version: number;
  readonly updatedAt: Date;
}

/** One month of the trailing income/expense chart. */
export interface OverviewMonth {
  /** `yyyy-mm`. */
  readonly month: string;
  readonly income: string;
  readonly expense: string;
  readonly net: string;
}

export interface OverviewKindTotal {
  readonly kind: TransactionKind;
  readonly total: string;
}

export interface OverviewCategoryTotal {
  readonly category: ExpenseCategory;
  readonly total: string;
}

/** The dashboard's headline figures (`PHASES.md` Phase 10 tasks 8–11). */
export interface FinanceOverview {
  readonly currency: string;
  readonly incomeTotal: string;
  readonly expenseTotal: string;
  readonly netPosition: string;
  readonly monthly: readonly OverviewMonth[];
  readonly byKind: readonly OverviewKindTotal[];
  readonly byExpenseCategory: readonly OverviewCategoryTotal[];
}

/** A page of rows plus the unpaged count, so a table can render "1–20 of 137". */
export interface Page<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface JournalListFilters {
  readonly kind?: TransactionKind | null | undefined;
  readonly status?: JournalStatus | null | undefined;
  /** Inclusive `yyyy-mm-dd` bounds on `transactionOn`. */
  readonly from?: string | null | undefined;
  readonly to?: string | null | undefined;
  /** Case-insensitive match on `referenceNumber` or `description`. */
  readonly search?: string | null | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface ExpenseListFilters {
  readonly status?: ExpenseStatus | null | undefined;
  readonly from?: string | null | undefined;
  readonly to?: string | null | undefined;
  readonly expenseHeadId?: string | null | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A fee payment arriving in the ledger, called by the fees store *inside the payment's own
 * transaction* so receipt and ledger are one write (`RULES.md` §16).
 *
 * `accountId` is the caller's explicit choice when it has one; otherwise the store resolves
 * `payment_methods.ledgerAccountId` for `method`, and failing that auto-provisions the default
 * account for the method (see `defaultAccountKeyForMethod`). Whatever is resolved must be an
 * active account of this institution in `currency`, or the post fails.
 */
export interface FeeCollectionPost {
  readonly institutionId: string;
  readonly paymentId: string;
  readonly amount: string;
  readonly currency: string;
  readonly transactionOn: string;
  readonly method: PaymentMethod;
  readonly accountId: string | null;
  readonly feeCategory: string | null;
  readonly description: string | null;
}

/** A payroll run landing in the ledger. No caller yet — Phase 12 integrates against this. */
export interface PayrollCollectionPost {
  readonly institutionId: string;
  readonly payrollRunId: string;
  readonly amount: string;
  readonly currency: string;
  readonly transactionOn: string;
  readonly method: PaymentMethod;
  readonly accountId: string | null;
  readonly description: string | null;
}

export interface ExpenseWrite {
  readonly institutionId: string;
  readonly expenseHeadId: string;
  readonly departmentId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly description: string;
  readonly incurredOn: string;
  readonly method: PaymentMethod;
  readonly receiptStorageKey: string | null;
}

/** One step of the expense state machine, guarded by optimistic concurrency. */
export interface ExpenseTransition {
  readonly institutionId: string;
  readonly expenseId: string;
  readonly expectedVersion: number;
}

export interface IncomeWrite {
  readonly institutionId: string;
  readonly amount: string;
  readonly currency: string;
  readonly transactionOn: string;
  readonly method: PaymentMethod;
  readonly accountId: string | null;
  readonly description: string | null;
}

export interface ReversalWrite {
  readonly institutionId: string;
  readonly journalId: string;
  readonly reason: string;
}

export interface ExpenseHeadWrite {
  readonly institutionId: string;
  readonly name: string;
  readonly category: ExpenseCategory;
  readonly parentHeadId: string | null;
  readonly ledgerAccountId: string | null;
  readonly description: string | null;
}

export interface ExpenseHeadActiveSet {
  readonly institutionId: string;
  readonly expenseHeadId: string;
  readonly isActive: boolean;
  readonly expectedVersion: number;
}

export interface AccountWrite {
  readonly institutionId: string;
  readonly name: string;
  readonly accountType: AccountType;
  readonly currency: string;
  readonly bankName: string | null;
  readonly accountNumber: string | null;
  readonly iban: string | null;
  readonly openedOn: string | null;
  readonly isActive: boolean;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

export interface FinanceStore {
  /* ---- Posting ----------------------------------------------------------- */

  /**
   * Write a fee payment into the ledger: two entries (the resolved account `in`, `Fee Income`
   * `out`, carrying `feeCategory`), a `fee_collection` journal stamped `posted`, and a
   * `JV-NNNNNN` reference from this institution's own sequence — all in the caller's
   * transaction, alongside the payment row itself.
   *
   * **Idempotent on `paymentId`**: a posted journal already carrying this payment is returned
   * unchanged. The fees store may call this twice on a retried receipt; double-posting would
   * double the institution's income.
   *
   * The store must also assert the period is open (`isPeriodOpen`) inside that transaction, and
   * must `assertJournalBalanced` before inserting the entries.
   */
  postFeeCollection(
    values: FeeCollectionPost,
    actorUserId: string,
  ): Promise<{ readonly journalId: string }>;

  /**
   * Write a payroll run into the ledger — `salary_payment` kind, the resolved account `in` and
   * an expense counter-account `out`.
   *
   * **Phase 12 calls this** from the payroll store's own transaction. The resolved account comes
   * back with the journal id, so the payment row can record the same account the journal posted
   * against (the client never names one — see `ProcessPayrollPaymentDialog`). Whether
   * `salary_payment` joins the overview's expense bucket is the overview's decision (see
   * `overviewContribution`).
   */
  postPayrollCollection(
    values: PayrollCollectionPost,
    actorUserId: string,
  ): Promise<{ readonly journalId: string; readonly accountId: string }>;

  /** Record a spend as a `draft`. No journal yet: money has not moved until approval. */
  createExpense(
    values: ExpenseWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /** `draft → submitted`. */
  submitExpense(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /**
   * `submitted → approved`, posting the expense's journal **in the same transaction**: the
   * expense head's account (or `Operating Expenses` when the head names none) `in`, the resolved
   * paying account `out`, `category` taken from the head. The row takes `approvedByUserId`,
   * `approvedAt` and `journalTransactionId` together, which is what `RULES.md` §36 requires
   * before money can leave. The period covering `incurredOn` must be open.
   */
  approveExpense(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /** `approved → paid`. Refuses an expense with no journal — money cannot leave unledgered. */
  markExpensePaid(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /** `draft|submitted → rejected`. No journal is written; nothing was ever posted. */
  rejectExpense(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /** Post `Other Income`: the resolved account `in`, `Other Income` `out`. */
  recordIncome(values: IncomeWrite, actorUserId: string): Promise<{ readonly journalId: string }>;

  /**
   * Correct a posted journal by writing its mirror: entries with swapped directions, same
   * amounts, `reversesTransactionId` pointing at the original, which flips to `reversed` with
   * `reversedAt`/`reversedByUserId` — all in one transaction (`ARCHITECTURE.md` §54: a reversal,
   * never a deletion).
   *
   * The store must re-check `assertReversalAllowed` and the open period, because the service's
   * check and this write are separated by a round trip.
   */
  reverseJournal(
    institutionId: string,
    journalId: string,
    values: { readonly reason: string },
    actorUserId: string,
  ): Promise<{ readonly journalId: string; readonly reversesTransactionId: string }>;

  /* ---- Configuration ----------------------------------------------------- */

  /**
   * Insert a chart-of-accounts row for this institution. A `bank` account must carry a
   * `bankName` (schema check); an `accountNumber` already in use for the institution collides
   * on its unique index and surfaces as `ConflictError`.
   */
  createAccount(
    values: AccountWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /** A new reporting head for expenses, optionally posting to its own ledger account. */
  createExpenseHead(
    values: ExpenseHeadWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /** Deactivate (or reactivate) a head so it stops appearing in new expenses. */
  setExpenseHeadActive(
    values: ExpenseHeadActiveSet,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /* ---- Read models ------------------------------------------------------- */

  /** Every account, active and archived, each with its derived balance. */
  listAccounts(institutionId: string): Promise<readonly AccountRow[]>;

  /**
   * A page of journals, newest first by `transactionOn`, filtered as given. `page`/`pageSize`
   * default to 1/50 when absent; `total` is the unpaged match count.
   */
  listJournals(institutionId: string, filters?: JournalListFilters): Promise<Page<JournalListRow>>;

  /** A journal with its entries, or `null` when it is not this institution's. */
  getJournal(institutionId: string, journalId: string): Promise<JournalDetailRow | null>;

  /** A page of expenses, newest first by `incurredOn`; `total` is the unpaged match count. */
  listExpenses(institutionId: string, filters?: ExpenseListFilters): Promise<Page<ExpenseListRow>>;

  getExpense(institutionId: string, expenseId: string): Promise<ExpenseDetailRow | null>;

  listExpenseHeads(
    institutionId: string,
    isActive?: boolean | null,
  ): Promise<readonly ExpenseHeadRow[]>;

  /** The dashboard figures, per the formula in this file's header. */
  getOverview(
    institutionId: string,
    options: { readonly months: number },
  ): Promise<FinanceOverview>;

  /**
   * `false` when a `financial_periods` row covering `date` has `closedAt` set.
   *
   * Posting paths treat `false` as a refusal and raise `closedPeriodError(date)` — the service
   * does so before calling a write, and the store must do so again inside its transaction, since
   * a period can close in between.
   */
  isPeriodOpen(institutionId: string, date: string): Promise<boolean>;
}
