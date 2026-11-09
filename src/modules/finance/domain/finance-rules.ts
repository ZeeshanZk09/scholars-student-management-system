/**
 * Finance domain rules (`PRD.md` MODULE 7, `src/db/schema/finance.ts`, `ARCHITECTURE.md` §21 and
 * §54).
 *
 * Pure over `@/shared/errors` and `@/shared/money` — no I/O, no Drizzle, no zod. Six concerns live
 * here rather than in SQL or in the service:
 *
 * 1. **Display vocabulary.** The database stores enum keys (`bank_transfer`); the UI shows "Bank
 *    transfer". The label maps are the single source for that projection, and the tuples feed the
 *    zod enums in `application/schemas.ts` — the same split the fee module uses, restated here
 *    because a module never imports another module's domain.
 * 2. **The zero-sum invariant.** `ledger_entries.amount` is positive in every row and the sign
 *    lives in `direction` (the `ledgerEntries` schema comment), so a journal balances when
 *    `SUM(in) = SUM(out)`. No SQL constraint can express an aggregate over sibling rows — that
 *    gap is called out in the schema itself — so {@link assertJournalBalanced} is the check the
 *    inserting transaction runs, and the one every posting path in this module shares.
 * 3. **Balances, derived.** `ADR-0003` forbids a stored balance: {@link accountBalance} reads the
 *    two direction sums and applies the account type's sign convention, so an income account is
 *    credited-positive while a cash account is debited-positive.
 * 4. **State machines the schema states only partially.** `expenses.status` has a `CHECK` on the
 *    vocabulary, not on which edges are legal, so {@link assertExpenseTransition} carries
 *    `draft → submitted → approved → paid` plus `→ rejected` from a draft or a submission.
 * 5. **Reversal, never deletion** (`ARCHITECTURE.md` §54). A posted journal is history; the only
 *    correction is a second journal whose entries are swapped, linked by
 *    `reversesTransactionId`. {@link reversalEntries} is that swap, and
 *    {@link assertReversalAllowed} refuses the kinds whose reversal would desynchronize this
 *    module from the table that owns them.
 * 6. **Reporting arithmetic.** {@link overviewContribution} is the signed contribution one posted
 *    journal makes to the income and expense buckets, so the dashboard, the fake store and the
 *    SQL store all agree on how a reversal undoes a prior month's income.
 */
import { BusinessRuleError, InternalError, ValidationError } from "@/shared/errors";
import {
  compare,
  fromDecimalText,
  isNegative,
  isZero,
  negate,
  subtract,
  sum,
  zero,
  type Money,
} from "@/shared/money";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The sign of a ledger entry (`transaction_direction`). `in` is a debit and `out` is a credit,
 * universally: cash arriving is `in`, income being recognised is `out` on the income account.
 * The direction is stored rather than derived from the account type so a report is a plain
 * filter, not a `CASE` that can disagree with the row it reads.
 */
export const DIRECTIONS = ["in", "out"] as const;

export type TransactionDirection = (typeof DIRECTIONS)[number];

export const DIRECTION_LABELS: Readonly<Record<TransactionDirection, string>> = {
  in: "In",
  out: "Out",
};

/**
 * The vocabulary of `financial_accounts.account_type`.
 *
 * `bank`, `cash`, `mobile_wallet`, `cheque` and `other` are asset accounts — money the
 * institution holds. `income` and `expense` are nominal accounts (`Fee Income`, `Other Income`,
 * `Operating Expenses`) that exist so a journal can post against a counter-account instead of a
 * second cash account. The column is a `varchar` with no `CHECK` on its vocabulary, so this tuple
 * is the only place the full set is stated; the one type-level constraint the schema *does*
 * enforce is that `bank` requires a `bankName`.
 */
export const ACCOUNT_TYPES = [
  "bank",
  "cash",
  "mobile_wallet",
  "cheque",
  "other",
  "income",
  "expense",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Readonly<Record<AccountType, string>> = {
  bank: "Bank account",
  cash: "Cash",
  mobile_wallet: "Mobile wallet",
  cheque: "Cheque",
  other: "Other account",
  income: "Income account",
  expense: "Expense account",
};

/** An account that holds money, as opposed to one that only records where it came from or went. */
export function isAssetAccount(accountType: AccountType): boolean {
  return accountType !== "income" && accountType !== "expense";
}

/** `journal_transactions.transaction_kind` — the reporting axis a trial balance groups by. */
export const JOURNAL_KINDS = [
  "fee_collection",
  "salary_payment",
  "refund",
  "expense",
  "income",
  "adjustment",
  "opening_balance",
] as const;

export type TransactionKind = (typeof JOURNAL_KINDS)[number];

export const JOURNAL_KIND_LABELS: Readonly<Record<TransactionKind, string>> = {
  fee_collection: "Fee collection",
  salary_payment: "Salary payment",
  refund: "Refund",
  expense: "Expense",
  income: "Income",
  adjustment: "Adjustment",
  opening_balance: "Opening balance",
};

/** `journal_transactions.status`: `draft → posted → reversed`, never a deletion. */
export const JOURNAL_STATUSES = ["draft", "posted", "reversed"] as const;

export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const JOURNAL_STATUS_LABELS: Readonly<Record<JournalStatus, string>> = {
  draft: "Draft",
  posted: "Posted",
  reversed: "Reversed",
};

/** `expenses.status`, with the edges between them in {@link EXPENSE_TRANSITIONS}. */
export const EXPENSE_STATUSES = ["draft", "submitted", "approved", "paid", "rejected"] as const;

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Readonly<Record<ExpenseStatus, string>> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

/** `expense_category` — the system-wide vocabulary an institution's expense heads report on. */
export const EXPENSE_CATEGORIES = [
  "salary",
  "utilities",
  "maintenance",
  "supplies",
  "transport",
  "events",
  "marketing",
  "tax",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Readonly<Record<ExpenseCategory, string>> = {
  salary: "Salary",
  utilities: "Utilities",
  maintenance: "Maintenance",
  supplies: "Supplies",
  transport: "Transport",
  events: "Events",
  marketing: "Marketing",
  tax: "Tax",
  other: "Other",
};

/** `payment_method` — how money arrives or leaves, restated because modules do not reach across. */
export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "cheque",
  "online_gateway",
  "card",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  online_gateway: "Online gateway",
  card: "Card",
  other: "Other",
};

/**
 * Currencies this module accepts on an income or expense posting.
 *
 * `shared/validation` validates only the *shape* of an ISO 4217 code — a three-letter alphabet,
 * because a module owns its own policy (`fields.ts` header) — so the supported set is stated
 * here and asserted by the service. Any account can hold any of these; converting between them
 * (`FX translation`) is out of scope for Phase 10.
 */
export const SUPPORTED_CURRENCIES = ["PKR", "USD", "GBP", "EUR", "AED", "SAR"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Reject a currency outside {@link SUPPORTED_CURRENCIES}, as a field message rather than a 500. */
export function assertSupportedCurrency(currency: string, field = "currency"): void {
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    throw new ValidationError(`Unsupported currency: ${currency}`, {
      [field]: [`Choose one of ${SUPPORTED_CURRENCIES.join(", ")}.`],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Chart of accounts                                                          */
/* -------------------------------------------------------------------------- */

export type DefaultAccountKey = "cash" | "bank" | "feeIncome" | "otherIncome" | "operatingExpenses";

export interface DefaultAccount {
  readonly key: DefaultAccountKey;
  readonly name: string;
  readonly accountType: AccountType;
  /** Why the row exists, for the chart-of-accounts screen. Never read by a rule. */
  readonly purpose: string;
}

/**
 * The chart of accounts every institution starts with, matched by `(institutionId, name)`.
 *
 * The store provisions these `SELECT`-then-`INSERT` inside the caller's transaction — the same
 * pattern `scripts/seed.ts` uses for a shared row — so two concurrent first postings race on the
 * unique key rather than on the insert.
 *
 * **`Bank Account` is typed `other`, not `bank`.** The schema's
 * `financial_accounts_bank_detail_check` requires a `bankName` for every `bank` row, and a
 * default has no bank yet: naming one would be a lie the institution has to find and correct.
 * When a real account is added it arrives as `bank` with its bank name, and this placeholder
 * simply stops being the fallback for bank-like methods.
 */
export const DEFAULT_ACCOUNTS = [
  {
    key: "cash",
    name: "Cash in Hand",
    accountType: "cash",
    purpose: "Money kept on site: fees collected over the counter and cash expenses paid out.",
  },
  {
    key: "bank",
    name: "Bank Account",
    accountType: "other",
    purpose: "Fallback landing account for transfers, cheques, cards and gateway settlements.",
  },
  {
    key: "feeIncome",
    name: "Fee Income",
    accountType: "income",
    purpose: "Credits every fee payment posted by the fees module.",
  },
  {
    key: "otherIncome",
    name: "Other Income",
    accountType: "income",
    purpose: "Credits income recorded outside fee collection: donations, rentals, sale of scrap.",
  },
  {
    key: "operatingExpenses",
    name: "Operating Expenses",
    accountType: "expense",
    purpose: "Debits approved expenses whose head has no ledger account of its own.",
  },
] as const satisfies readonly DefaultAccount[];

/** The default row for a key. Unreachable with a valid key — hence an internal failure. */
export function defaultAccount(key: DefaultAccountKey): DefaultAccount {
  const found = DEFAULT_ACCOUNTS.find((account) => account.key === key);
  if (found === undefined) {
    throw new InternalError(`No default account for key ${key}`, {
      details: { key },
    });
  }
  return found;
}

/**
 * Which default account a payment method settles into when no account was named and the method
 * carries no `payment_methods.ledgerAccountId`.
 *
 * Cash and the catch-all method land in `Cash in Hand`; anything that moves through a bank —
 * transfers, cheques, card acquirers and gateway payouts — lands in `Bank Account`.
 */
export function defaultAccountKeyForMethod(method: PaymentMethod): DefaultAccountKey {
  switch (method) {
    case "bank_transfer":
    case "cheque":
    case "card":
    case "online_gateway":
      return "bank";
    case "cash":
    case "other":
      return "cash";
  }
}

/* -------------------------------------------------------------------------- */
/* Journals: the zero-sum invariant                                           */
/* -------------------------------------------------------------------------- */

/**
 * One `ledger_entries` row before it is inserted.
 *
 * `amount` is decimal text and always positive — the sign is `direction`, never the amount, or a
 * signed amount plus a direction is a double negative waiting to happen. `category` carries the
 * expense head's category on an expense journal and is null elsewhere; `feeCategory` is set only
 * on `fee_collection`, so income stays attributable by fee head.
 */
export interface JournalEntryDraft {
  readonly accountId: string;
  readonly direction: TransactionDirection;
  readonly amount: string;
  readonly currency: string;
  readonly category: ExpenseCategory | null;
  readonly feeCategory: string | null;
  readonly description: string | null;
}

export interface JournalTotals {
  readonly inTotal: Money;
  readonly outTotal: Money;
}

/**
 * Sum each side of a journal.
 *
 * Amounts are parsed rather than added as text, so a malformed or out-of-range figure fails as a
 * `ValidationError` and a mixed-currency journal fails loudly as a `BusinessRuleError` — never a
 * silently wrong total (`shared/money`'s contract).
 */
export function journalTotals(entries: readonly JournalEntryDraft[]): JournalTotals {
  const first = entries[0];
  if (first === undefined) {
    throw new ValidationError("A journal has no entries.", {
      entries: ["A journal must contain at least one entry."],
    });
  }
  const debitTotals: Money[] = [];
  const creditTotals: Money[] = [];
  for (const entry of entries) {
    const amount = positiveAmount(entry.amount, entry.currency, "entries");
    if (entry.direction === "in") {
      debitTotals.push(amount);
    } else {
      creditTotals.push(amount);
    }
  }
  return {
    inTotal: sum(debitTotals, first.currency),
    outTotal: sum(creditTotals, first.currency),
  };
}

/**
 * Assert that a journal balances: at least two entries, every amount positive, one currency
 * across the journal, and `SUM(in) = SUM(out)`.
 *
 * Returns the totals so a posting path can stamp the journal's amount without summing twice.
 * This runs before any insert — in the service, in the store's transaction, and in the fake —
 * because the gap in the schema (`ledger_entries` comment: no constraint can express an
 * aggregate over sibling rows) is exactly the gap this function closes.
 */
export function assertJournalBalanced(entries: readonly JournalEntryDraft[]): JournalTotals {
  if (entries.length < 2) {
    throw new BusinessRuleError(
      `A journal needs at least two entries; received ${entries.length}.`,
      {
        userMessage: "Every journal needs a matching counter-entry before it can be posted.",
        details: { entries: entries.length },
      },
    );
  }
  const totals = journalTotals(entries);
  if (compare(totals.inTotal, totals.outTotal) !== 0) {
    throw new BusinessRuleError(
      `Journal is out of balance: in ${totals.inTotal.amountMinor} vs out ${totals.outTotal.amountMinor}.`,
      {
        userMessage: "The two sides of this transaction do not add up. Nothing was posted.",
        details: {
          inMinor: String(totals.inTotal.amountMinor),
          outMinor: String(totals.outTotal.amountMinor),
        },
      },
    );
  }
  return totals;
}

/**
 * The balance of one account from its two direction sums — never a stored column (`ADR-0003`).
 *
 * The sign convention follows the account's side: an asset account (bank, cash, wallet, cheque,
 * other) grows with money coming in, an expense account grows with the debits charged to it, and
 * an income account grows with the credits recognised against it. A negative result is a real
 * answer, not an error — an overdrawn cash box or a refund that exceeded recorded income — so it
 * is returned rather than floored at zero.
 */
export function accountBalance(accountType: AccountType, totals: Readonly<JournalTotals>): Money {
  return accountType === "income"
    ? subtract(totals.outTotal, totals.inTotal)
    : subtract(totals.inTotal, totals.outTotal);
}

/**
 * Parse an amount and refuse anything that is not strictly positive.
 *
 * `shared/money` guarantees the shape (plain decimal, at most two places); this adds the policy
 * half — `ledger_entries.amount` and `expenses.amount` both carry `> 0` checks, and a zero or
 * negative amount reaching the ledger would be a journal that cannot balance.
 */
export function positiveAmount(amount: string, currency: string, field = "amount"): Money {
  const money = fromDecimalText(amount, currency);
  if (isZero(money) || isNegative(money)) {
    throw new ValidationError("Amount must be greater than zero.", {
      [field]: ["Enter an amount greater than zero."],
    });
  }
  return money;
}

/* -------------------------------------------------------------------------- */
/* Expense state machine                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The legal edges of `expenses.status`.
 *
 * `draft → submitted → approved → paid` is the happy path; `draft|submitted → rejected` is how a
 * request dies before money moves. There is no jump from a draft straight to approval — an
 * expense exists to be reviewed — and `paid` and `rejected` are terminal. The schema's
 * `expenses_status_check` states which values exist; only this table states which moves are
 * allowed.
 */
export const EXPENSE_TRANSITIONS: Readonly<Record<ExpenseStatus, readonly ExpenseStatus[]>> = {
  draft: ["submitted", "rejected"],
  submitted: ["approved", "rejected"],
  approved: ["paid"],
  paid: [],
  rejected: [],
};

export function canTransitionExpense(from: ExpenseStatus, to: ExpenseStatus): boolean {
  return EXPENSE_TRANSITIONS[from].includes(to);
}

/**
 * Refuse an illegal move with a message naming both states.
 *
 * The service calls this against the row it just loaded; the store repeats it inside its
 * transaction, because between the two the row may have moved (optimistic concurrency is a
 * separate guard — see `expectedVersion` on every write).
 */
export function assertExpenseTransition(from: ExpenseStatus, to: ExpenseStatus): void {
  if (from === to) {
    throw new BusinessRuleError(`Expense is already ${from}.`, {
      userMessage: `This expense is already ${EXPENSE_STATUS_LABELS[to].toLowerCase()}.`,
      details: { from, to },
    });
  }
  if (!canTransitionExpense(from, to)) {
    throw new BusinessRuleError(`Cannot move an expense from ${from} to ${to}.`, {
      userMessage: `An expense that is ${EXPENSE_STATUS_LABELS[from].toLowerCase()} cannot become ${EXPENSE_STATUS_LABELS[to].toLowerCase()}.`,
      details: { from, to },
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Reversal                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The journal kinds this module may reverse.
 *
 * A `fee_collection` is not one of them: its entries mirror a `payments` row, and reversing the
 * ledger without reversing the payment would leave the fees module reporting money the ledger
 * has already undone. That correction belongs to `fees.refund`, which writes both sides in one
 * transaction. `salary_payment` and `opening_balance` stay out for the same structural reason —
 * nothing in this module owns their counterpart record yet.
 */
export const REVERSIBLE_JOURNAL_KINDS = ["expense", "income", "adjustment"] as const;

export type ReversibleJournalKind = (typeof REVERSIBLE_JOURNAL_KINDS)[number];

export interface ReversalCandidate {
  readonly kind: TransactionKind;
  readonly status: JournalStatus;
}

/** Refuse a reversal the ledger must not perform, naming the command that can. */
export function assertReversalAllowed(journal: ReversalCandidate): void {
  if (journal.kind === "fee_collection") {
    throw new BusinessRuleError("A fee collection journal cannot be reversed.", {
      userMessage:
        "A fee payment is corrected by refunding it, not by reversing the ledger. Issue the refund from the payment — it updates both records together.",
      details: { kind: journal.kind },
    });
  }
  if (!REVERSIBLE_JOURNAL_KINDS.some((kind) => kind === journal.kind)) {
    throw new BusinessRuleError(`A ${journal.kind} journal cannot be reversed.`, {
      userMessage: `A ${JOURNAL_KIND_LABELS[journal.kind].toLowerCase()} journal has no reversal in this module.`,
      details: { kind: journal.kind },
    });
  }
  if (journal.status !== "posted") {
    throw new BusinessRuleError(`A ${journal.status} journal cannot be reversed.`, {
      userMessage: `Only a posted journal can be reversed; this one is ${journal.status}.`,
      details: { status: journal.status },
    });
  }
}

/**
 * The entries of a reversal: every direction swapped, everything else identical.
 *
 * Amounts stay positive and `assertJournalBalanced` runs on the result, because a swap of a
 * balanced journal is balanced — and a journal that was not is a defect this should surface
 * rather than propagate.
 */
export function reversalEntries(
  entries: readonly JournalEntryDraft[],
): readonly JournalEntryDraft[] {
  const reversed: JournalEntryDraft[] = entries.map((entry) => ({
    ...entry,
    direction: entry.direction === "in" ? ("out" as const) : ("in" as const),
  }));
  assertJournalBalanced(reversed);
  return reversed;
}

/* -------------------------------------------------------------------------- */
/* Closed periods and dates                                                   */
/* -------------------------------------------------------------------------- */

/** The window `financial_periods` states; `closedAt` set means the window is history. */
export interface FinancialPeriodWindow {
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly closedAt: Date | null;
}

/** The closed period covering `date`, if any — the row a posting path must refuse on. */
export function findClosedPeriod(
  periods: readonly FinancialPeriodWindow[],
  date: string,
): FinancialPeriodWindow | null {
  for (const period of periods) {
    if (period.closedAt !== null && date >= period.startsOn && date <= period.endsOn) {
      return period;
    }
  }
  return null;
}

/**
 * The error a posting path raises for a date inside a closed period (`RULES.md` §36: a closed
 * period is history).
 *
 * Shared by the service and the store so both name the same fix: reopen the period, or date the
 * transaction inside an open one.
 */
export function closedPeriodError(date: string): BusinessRuleError {
  return new BusinessRuleError(`A closed financial period covers ${date}.`, {
    userMessage: `The accounting period covering ${date} has been closed. Reopen it, or date this transaction inside an open period.`,
    details: { date },
  });
}

/** Earliest date this module will accept — before the school's own records begin. */
const EARLIEST_DATE = "2000-01-01";

/**
 * Local calendar date as `YYYY-MM-DD` — the `date` column format of `src/db/schema`.
 *
 * Exported for the service, which needs "today" for the reversal period check; duplicating the
 * fees helper is deliberate (application layer may not import another module).
 */
export function calendarDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function oneYearAfter(date: Date): Date {
  const horizon = new Date(date.getTime());
  horizon.setFullYear(horizon.getFullYear() + 1);
  return horizon;
}

/**
 * Refuse a transaction date that is obviously wrong: before 2000-01-01, or more than a year past
 * `today`.
 *
 * The window is a year rather than "not in the future" because back-dating into an open period
 * is a normal accountant's task (posting last week's cheque today) while a typo'd year is not.
 * `today` is a parameter rather than a clock read so the rule is testable without freezing time.
 */
export function assertPlausibleDate(date: string, today: Date, field = "date"): void {
  if (date < EARLIEST_DATE) {
    throw new ValidationError(`${field} is before ${EARLIEST_DATE}.`, {
      [field]: [`Enter a date on or after ${EARLIEST_DATE}.`],
    });
  }
  if (date > calendarDateString(oneYearAfter(today))) {
    throw new ValidationError(`${field} is more than a year ahead.`, {
      [field]: ["Enter a date no more than one year from today."],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Reporting arithmetic                                                       */
/* -------------------------------------------------------------------------- */

/** The `yyyy-mm` bucket a `yyyy-mm-dd` date reports into. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * The `count` month keys ending at `anchorMonth`, oldest first — the zero-fill a monthly chart
 * needs so a month with no activity shows `0.00` rather than a hole.
 */
export function monthKeysEndingAt(anchorMonth: string, count: number): readonly string[] {
  if (!/^\d{4}-\d{2}$/.test(anchorMonth)) {
    throw new ValidationError(`Invalid month: ${anchorMonth}`, {
      months: ["Expected a month in YYYY-MM form."],
    });
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new ValidationError(`Cannot build ${count} months`, {
      months: ["Must be a positive whole number."],
    });
  }
  let year = Number(anchorMonth.slice(0, 4));
  let month = Number(anchorMonth.slice(5, 7));
  const keys: string[] = [];
  for (let index = 0; index < count; index += 1) {
    keys.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return keys;
}

/** One posted journal as the overview needs it: its kind, its amount, and whether it is a reversal. */
export interface OverviewJournal {
  readonly kind: TransactionKind;
  /** Set on a reversal journal; its sign cancels the journal it reverses. */
  readonly reversesTransactionId: string | null;
  /** The journal's own total — `SUM(in)`, which equals `SUM(out)` on a balanced journal. */
  readonly amount: string;
  readonly currency: string;
}

export interface OverviewContribution {
  readonly income: Money;
  readonly expense: Money;
}

/**
 * What one posted, non-reversed journal adds to the dashboard's income and expense buckets.
 *
 * - `fee_collection` and `income` are income; `refund` is income with the sign flipped, because
 *   a refund gives money back and the fees module posts it as its own journal.
 * - `expense` is the only expense bucket today. `salary_payment` deliberately is not: payroll
 *   lands in this ledger as its own kind (Phase 12), and whether that counts as an expense is a
 *   decision for that phase — a `kind` nobody has posted yet must not silently reshape a report.
 * - `adjustment`, `opening_balance` and `salary_payment` contribute to neither bucket; they still
 *   appear in `byKind`.
 * - A journal whose `reversesTransactionId` is set contributes with the opposite sign, so a
 *   reversal undoes the month it lands in rather than adding a second, equal figure. The journal
 *   it reverses has already left the aggregate: its status is `reversed`, not `posted`.
 */
export function overviewContribution(journal: OverviewJournal): OverviewContribution {
  const amount = fromDecimalText(journal.amount, journal.currency);
  const signed = journal.reversesTransactionId === null ? amount : negate(amount);
  const none = zero(journal.currency);
  switch (journal.kind) {
    case "fee_collection":
    case "income":
      return { income: signed, expense: none };
    case "refund":
      return { income: negate(signed), expense: none };
    case "expense":
      return { income: none, expense: signed };
    case "salary_payment":
    case "adjustment":
    case "opening_balance":
      return { income: none, expense: none };
  }
}
