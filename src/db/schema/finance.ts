/**
 * Finance: bank accounts, a double-entry ledger, expense heads and budgets.
 *
 * `PRD.md` MODULE 7, `ARCHITECTURE.md` §21 and §54. The requirement that shapes this file is
 * `RULES.md` §16: **a payment receipt and its ledger entries must be written in one transaction.** That
 * is not achievable with a "balance" table and a "log" table; it needs a real ledger.
 *
 * ## Double entry, and why it is not optional here
 *
 * Every `ledger_entries` row belongs to a `journal_transaction` and has a `direction`. A transaction's
 * entries must net to zero: an inflow of 10,000 has one `debit` (cash up) and one `credit` (fee
 * income), so `SUM(amount WHERE direction = 'in') = SUM(amount WHERE direction = 'out')` for every
 * transaction. That single invariant is what makes "where did the money go" answerable without trusting
 * anyone's arithmetic.
 *
 * This is why the fee module's `payments` table is *not* the ledger. `payments` records what a specific
 * parent paid; the ledger records the institution's position. A payment produces ledger entries
 * (`kind = 'fee_collection'`) in the same transaction (`RULES.md` §16), and the two are joined by
 * `paymentId`. Storing a balance on `financial_accounts` would be a fourth source of truth; **no
 * balance is stored anywhere in this schema.** Every balance is a `SUM()`.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  archivedAt,
  createdAt,
  currencyCode,
  currencyCodeCheck,
  description,
  moneyAmount,
  optionalMoneyAmount,
  primaryId,
  updatedAt,
  version,
} from "./_conventions";
import {
  expenseCategoryEnum,
  paymentMethodEnum,
  transactionDirectionEnum,
  transactionKindEnum,
} from "./_enums";
import { departments, institutions } from "./institution";

/**
 * `financial_accounts` — a bank account, cash box or mobile wallet.
 *
 * `PRD.md` MODULE 7 requires separate cash and bank balances, which is the reason `account_type` is an
 * enum rather than a bank name: "Cash in Hand" is an account with no bank, and a report that only
 * understood bank accounts would silently omit it.
 *
 * **No `current_balance` column.** That is the rule stated at the top of this file, and this is the table
 * where it is most tempting. A stored balance is a cached `SUM()` that nothing can invalidate
 * correctly, and every one of the three writers — a receipt, a payroll run, an expense — would have to
 * remember to update it. The balance is `SUM(ledger_entries.amount WHERE direction = …)`.
 *
 * `currency` is on the account, not on each entry, so a PKR account cannot receive a USD entry — that
 * cross-rate mixing is prevented in the transaction layer against this column.
 */
export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    /** `bank`, `cash`, `mobile_wallet`, `cheque`, `other`. */
    accountType: varchar("account_type", { length: 24 }).notNull(),
    bankName: varchar("bank_name", { length: 160 }),
    accountNumber: varchar("account_number", { length: 64 }),
    iban: varchar("iban", { length: 64 }),
    currency: currencyCode(),
    /** Operational accounts must be open; closing one hides it from pickers but keeps its history. */
    isActive: boolean("is_active").notNull().default(true),
    openedOn: date("opened_on"),
    closedOn: date("closed_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    index("financial_accounts_institution_idx").on(t.institutionId, t.isActive),
    // A bank account number identifies a real account; the same number must not appear twice.
    uniqueIndex("financial_accounts_number_key")
      .on(t.institutionId, t.accountNumber)
      .where(sql`${t.accountNumber} is not null`),
    currencyCodeCheck("financial_accounts_currency_check", t.currency),
    check(
      "financial_accounts_close_check",
      sql`${t.closedOn} is null or ${t.openedOn} is null or ${t.closedOn} >= ${t.openedOn}`,
    ),
    check(
      "financial_accounts_bank_detail_check",
      sql`${t.accountType} <> 'bank' or ${t.bankName} is not null`,
    ),
  ],
);

/**
 * `journal_transactions` — the header of one balanced set of ledger entries.
 *
 * `ARCHITECTURE.md` §21's "transactional ledger". The header exists so the balance-to-zero invariant
 * has something to be stated against: the finance module asserts it in the same transaction that
 * inserts the entries, and `posted_at` is what distinguishes an in-progress journal from a posted one.
 *
 * `status` is a `varchar` with a check rather than a `pgEnum` because `draft → posted → reversed` is a
 * workflow of this module alone and needs no other module to know its vocabulary.
 *
 * `transactionKind` is the enum from `_enums.ts` and is the reporting axis: a trial balance is grouped
 * by it, so an entry must always be classifiable even if its description is vague.
 */
export const journalTransactions = pgTable(
  "journal_transactions",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    transactionKind: transactionKindEnum("transaction_kind").notNull(),
    /** Human reference for the journal, e.g. `JV-2026-0042`. Unique per institution. */
    referenceNumber: varchar("reference_number", { length: 64 }).notNull(),
    description: text("description"),
    /**
     * The fee payment that produced this journal, when `kind = 'fee_collection'`. Bare uuid: adding
     * `finance → fees` would close no cycle, because `fees` reaches only `institution`, `academic`
     * and `student` — never `finance` — and no other reason is recorded. An unexplained gap, listed
     * in `OMISSION_CANDIDATES` in `schema-contract.test.ts`.
     */
    paymentId: uuid("payment_id"),
    /**
     * The payroll run that produced this journal, when `kind = 'salary_payment'`. Same gap as
     * `paymentId`: `payroll` never reaches `finance`, so `finance → payroll` loops nothing.
     */
    payrollRunId: uuid("payroll_run_id"),
    transactionOn: date("transaction_on").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    /** Set when posted. A posted journal is history (`RULES.md` §36). */
    postedAt: timestamp("posted_at", { withTimezone: true, precision: 3 }),
    postedByUserId: uuid("posted_by_user_id"),
    /** Set when reversed. Never a deletion — see the note above. */
    reversedAt: timestamp("reversed_at", { withTimezone: true, precision: 3 }),
    reversedByUserId: uuid("reversed_by_user_id"),
    /** The journal that reverses this one. */
    reversesTransactionId: uuid("reverses_transaction_id").references(
      (): AnyPgColumn => journalTransactions.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("journal_transactions_reference_key").on(t.institutionId, t.referenceNumber),
    index("journal_transactions_institution_date_idx").on(
      t.institutionId,
      t.transactionOn,
      t.status,
    ),
    index("journal_transactions_payment_idx").on(t.paymentId),
    check("journal_transactions_status_check", sql`${t.status} in ('draft', 'posted', 'reversed')`),
    // Posting needs an actor and an instant, or "posted" is unfalsifiable.
    check(
      "journal_transactions_post_pair",
      sql`${t.status} = 'draft' or (${t.postedAt} is not null and ${t.postedByUserId} is not null)`,
    ),
    check(
      "journal_transactions_reverse_pair",
      sql`${t.status} <> 'reversed' or ${t.reversedAt} is not null`,
    ),
  ],
);

/**
 * `ledger_entries` — one line of a journal, against one account.
 *
 * ## `direction` is explicit, and `in`/`out` are chosen from the account's side
 *
 * `transactionDirectionEnum` is `in` / `out`. For a **cash** account, `in` is money arriving. For an
 * **income** account, `out` is income recognised. The direction is stored rather than derived from the
 * account type because deriving it in SQL means a `CASE` in every report and a place for the two to
 * disagree; storing it makes the report a plain filter, and the finance module asserts consistency with
 * the account type when it writes.
 *
 * ## The zero-sum invariant
 *
 * Per `journalTransactionId`, `SUM(amount WHERE direction = 'in') = SUM(amount WHERE direction = 'out')`.
 * No constraint can express this (it is an aggregate over sibling rows), so it is enforced in the
 * inserting transaction and **verified by `finance.test.ts`**, which posts deliberately unbalanced
 * journals against the schema's own rules. An entry table without this check is how a school ends up
 * with a ledger that does not add up and nobody knows when it stopped.
 *
 * `amount` is positive in every row; the sign lives in `direction`. A signed amount plus a direction is
 * a double negative waiting to happen.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: primaryId(),
    journalTransactionId: uuid("journal_transaction_id")
      .notNull()
      .references(() => journalTransactions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),
    direction: transactionDirectionEnum("direction").notNull(),
    /** Always positive. The sign is `direction`. */
    amount: moneyAmount("amount"),
    /** The counter-account this entry balances against: an expense head, an income head, a fee. */
    category: expenseCategoryEnum("category"),
    /** For `fee_collection`: the fee category that was paid, so income is attributable by fee head. */
    feeCategory: varchar("fee_category", { length: 32 }),
    description: varchar("description", { length: 500 }),
    /** Free-form tags for a departmental or project breakdown. Opaque to the database. */
    tags: text("tags"),
    createdAt: createdAt(),
  },
  (t) => [
    // The balance path: one account, newest first.
    index("ledger_entries_account_idx").on(t.accountId, t.createdAt),
    index("ledger_entries_journal_idx").on(t.journalTransactionId),
    index("ledger_entries_category_idx").on(t.category, t.createdAt),
    check("ledger_entries_amount_positive", sql`${t.amount} > 0`),
  ],
);

/**
 * `expense_heads` — the categories an institution reports spending against.
 *
 * `PRD.md` MODULE 7 requires an expense category breakdown. Configurable rows rather than the
 * `expense_category` enum alone, because the enum is the *system-wide* vocabulary and an institution
 * needs its own numbering — "Utilities → Electricity" is one account manager's chart of accounts, not a
 * database enum.
 *
 * `parentHeadId` makes the breakdown hierarchical without a recursive CTE in every report. It is a
 * self-reference, declared with `AnyPgColumn` because the column's type is being inferred.
 */
export const expenseHeads = pgTable(
  "expense_heads",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    /** One of the system-wide `expense_category` values, so cross-institution comparison is possible. */
    category: expenseCategoryEnum("category").notNull(),
    /** A sub-head, e.g. Electricity under Utilities. Null for a top-level head. */
    parentHeadId: uuid("parent_head_id").references((): AnyPgColumn => expenseHeads.id, {
      onDelete: "restrict",
    }),
    /** The ledger account this head posts to. `onDelete: restrict` — see the check below. */
    ledgerAccountId: uuid("ledger_account_id").references(() => financialAccounts.id, {
      onDelete: "restrict",
    }),
    isActive: boolean("is_active").notNull().default(true),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    index("expense_heads_institution_idx").on(t.institutionId, t.isActive),
    index("expense_heads_parent_idx").on(t.parentHeadId),
    // A head may not be its own parent, which is the one cycle a `CHECK` can catch cheaply.
    check(
      "expense_heads_not_self_parent",
      sql`${t.parentHeadId} is null or ${t.parentHeadId} <> ${t.id}`,
    ),
  ],
);

/**
 * `expenses` — a spend recorded against a head, and paid from an account.
 *
 * `amount` is what was spent. The **ledger side** is a `journalTransaction` with two entries
 * (credit the expense head, debit the account), created in the same transaction — `RULES.md` §16. So
 * this table is the human-facing record (what, for what, approved by whom) and the ledger is the
 * arithmetic; the `journalTransactionId` is the link, and `RULES.md` §36 requires it to be present for
 * an approved expense so no spend bypasses the ledger.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    expenseHeadId: uuid("expense_head_id")
      .notNull()
      .references(() => expenseHeads.id, { onDelete: "restrict" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    amount: moneyAmount("amount"),
    currency: currencyCode(),
    description: text("description").notNull(),
    incurredOn: date("incurred_on").notNull(),
    method: paymentMethodEnum("method").notNull().default("cash"),
    /** `draft`, `submitted`, `approved`, `paid`, `rejected`. */
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    /** Required once approved: the ledger journal that posted it. See the note above. */
    journalTransactionId: uuid("journal_transaction_id").references(() => journalTransactions.id, {
      onDelete: "restrict",
    }),
    /** Storage key for the receipt image. `ARCHITECTURE.md` §51. */
    receiptStorageKey: varchar("receipt_storage_key", { length: 512 }),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("expenses_institution_status_idx").on(t.institutionId, t.status, t.incurredOn),
    index("expenses_head_idx").on(t.expenseHeadId, t.incurredOn),
    currencyCodeCheck("expenses_currency_check", t.currency),
    check("expenses_amount_positive", sql`${t.amount} > 0`),
    check(
      "expenses_status_check",
      sql`${t.status} in ('draft', 'submitted', 'approved', 'paid', 'rejected')`,
    ),
    // An approved or paid expense must have both an approver and a ledger journal. This is the check
    // that stops money leaving the institution without appearing in the ledger.
    check(
      "expenses_approval_pair",
      sql`${t.status} not in ('approved', 'paid') or (${t.approvedByUserId} is not null and ${t.approvedAt} is not null)`,
    ),
    check(
      "expenses_journal_required",
      sql`${t.status} <> 'paid' or ${t.journalTransactionId} is not null`,
    ),
  ],
);

/**
 * `budgets` — an institution's plan for a head, a department and a period.
 *
 * `PRD.md` MODULE 7 requires budget tracking. `budgetedAmount` and `actualAmount` are deliberately
 * different kinds of column: `budgeted_amount` is a **plan** (entered), and `actual_amount` is a
 * **cached sum** of the ledger. Caching it here is acceptable only because it is recomputed by the
 * finance module and is never an independent input — the ledger remains the authority, and the
 * `isRecomputedAt` timestamp tells a report when the cached figure was last true.
 *
 * **No `variance` column**, for the same reason `fees` stores no outstanding balance: variance is
 * `budgeted - actual`, and a stored variance can disagree with both.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    expenseHeadId: uuid("expense_head_id")
      .notNull()
      .references(() => expenseHeads.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "cascade" }),
    /** `2026`, `2026-Q1`, `2026-01`. Institution-formatted and validated by the module. */
    period: varchar("period", { length: 16 }).notNull(),
    budgetedAmount: moneyAmount("budgeted_amount"),
    currency: currencyCode(),
    /** Cached from the ledger. Never an input; see the note above. */
    actualAmount: optionalMoneyAmount("actual_amount"),
    isRecomputedAt: timestamp("is_recomputed_at", { withTimezone: true, precision: 3 }),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("budgets_period_key").on(
      t.institutionId,
      t.expenseHeadId,
      t.departmentId,
      t.period,
    ),
    index("budgets_institution_period_idx").on(t.institutionId, t.period),
    currencyCodeCheck("budgets_currency_check", t.currency),
    check("budgets_budgeted_positive", sql`${t.budgetedAmount} >= 0`),
    check("budgets_actual_pair", sql`${t.actualAmount} is null or ${t.isRecomputedAt} is not null`),
  ],
);

/**
 * `bank_reconciliations` — the month-end tie between the ledger and a bank statement.
 *
 * `PRD.md` MODULE 7. `statementBalance` is the bank's figure, `ledgerBalance` is ours, and
 * `difference` is stored because it is the **number a human disputes**: it is the artifact the
 * reconciliation screen sorts by, and recomputing it per row to find the three that need attention is
 * exactly the wrong use of the read path.
 *
 * This is the one place in the schema where storing a comparison of two other stored values is correct,
 * because it is a *reconciliation artifact*, not a cached balance: it records what two parties agreed at
 * a point in time and does not feed any other computation.
 */
export const bankReconciliations = pgTable(
  "bank_reconciliations",
  {
    id: primaryId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),
    /** First and last date of the statement period. */
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** The bank's closing figure, as printed. */
    statementBalance: optionalMoneyAmount("statement_balance"),
    /** Our figure from the ledger at the same instant. */
    ledgerBalance: optionalMoneyAmount("ledger_balance"),
    /** `statement - ledger`. Stored as the reconciliation artifact; see the note above. */
    difference: optionalMoneyAmount("difference"),
    /** `draft`, `in_progress`, `reconciled`, `disputed`. */
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    reconciledByUserId: uuid("reconciled_by_user_id"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true, precision: 3 }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("bank_reconciliations_period_key").on(t.accountId, t.periodStart, t.periodEnd),
    index("bank_reconciliations_status_idx").on(t.status),
    check("bank_reconciliations_period_check", sql`${t.periodEnd} >= ${t.periodStart}`),
    check(
      "bank_reconciliations_status_check",
      sql`${t.status} in ('draft', 'in_progress', 'reconciled', 'disputed')`,
    ),
    // Reconciling requires a named human; an anonymous "reconciled" defeats the purpose.
    check(
      "bank_reconciliations_reconciler_pair",
      sql`${t.status} <> 'reconciled' or (${t.reconciledByUserId} is not null and ${t.reconciledAt} is not null)`,
    ),
  ],
);

/**
 * `bank_reconciliation_items` — one ledger entry matched to a statement line.
 *
 * The per-item record behind `bankReconciliations.difference`. `statementLineReference` is the bank's
 * own reference (a cheque number, a transaction id), and its partial uniqueness per account is what
 * stops one bank line being matched twice — the classic way a reconciliation looks complete while being
 * wrong.
 */
export const bankReconciliationItems = pgTable(
  "bank_reconciliation_items",
  {
    id: primaryId(),
    reconciliationId: uuid("reconciliation_id")
      .notNull()
      .references(() => bankReconciliations.id, { onDelete: "cascade" }),
    ledgerEntryId: uuid("ledger_entry_id")
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: "restrict" }),
    statementLineReference: varchar("statement_line_reference", { length: 128 }),
    /** `matched`, `unmatched`, `bank_charge`, `missing_from_bank`. */
    status: varchar("status", { length: 24 }).notNull().default("matched"),
    notes: varchar("notes", { length: 500 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("bank_reconciliation_items_reconciliation_idx").on(t.reconciliationId, t.status),
    // One ledger entry can be reconciled once, in one account, ever.
    uniqueIndex("bank_reconciliation_items_entry_key").on(t.ledgerEntryId),
    // One bank line cannot satisfy two matches.
    uniqueIndex("bank_reconciliation_items_reference_key")
      .on(t.reconciliationId, t.statementLineReference)
      .where(sql`${t.statementLineReference} is not null`),
    check(
      "bank_reconciliation_items_status_check",
      sql`${t.status} in ('matched', 'unmatched', 'bank_charge', 'missing_from_bank')`,
    ),
    // A match without the bank's reference is not a match.
    check(
      "bank_reconciliation_items_reference_required",
      sql`${t.status} <> 'matched' or ${t.statementLineReference} is not null`,
    ),
  ],
);

/**
 * `payment_methods` — how the institution accepts and makes payments, with their ledger accounts.
 *
 * `PRD.md` MODULE 7 needs cash/bank/cheque handling to be configurable. `ledgerAccountId` is what makes
 * a method *usable*: a fee collected by "cheque" must know which bank account it lands in, or the
 * receipt and the ledger cannot be written together (`RULES.md` §16).
 *
 * `isIncoming`/`isOutgoing` are separate booleans rather than one direction enum because most methods
 * are both — a school takes fees in by cheque and pays a supplier by cheque — and a single enum would
 * make one of those two cases unrepresentable.
 */
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Mirrors `payment_method`/`transaction_kind` vocabulary so the pickers agree. */
    method: varchar("method", { length: 24 }).notNull(),
    isIncoming: boolean("is_incoming").notNull().default(true),
    isOutgoing: boolean("is_outgoing").notNull().default(true),
    /** Where money in this method lands or comes from. Required for an active method. */
    ledgerAccountId: uuid("ledger_account_id").references(() => financialAccounts.id, {
      onDelete: "restrict",
    }),
    /** An institution-defined surcharge or discount, in the smallest currency unit. */
    handlingFee: optionalMoneyAmount("handling_fee"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("payment_methods_institution_name_key").on(t.institutionId, t.name),
    index("payment_methods_institution_active_idx").on(t.institutionId, t.isActive),
    // A method that does nothing is not a method; an active one that posts nowhere cannot be used.
    check("payment_methods_direction_check", sql`${t.isIncoming} = true or ${t.isOutgoing} = true`),
    check(
      "payment_methods_account_required",
      sql`${t.isActive} = false or ${t.ledgerAccountId} is not null`,
    ),
  ],
);

/**
 * `financial_periods` — an accounting period, open or closed.
 *
 * `RULES.md` §36: a closed period is history. `closedAt` is the signal the fee, payroll and finance
 * write paths check before accepting a transaction dated inside it, and `closedByUserId` names whoever
 * closed it — a period closed by a background job with no actor is an audit hole.
 *
 * This is the finance module's answer to the same requirement `academic_sessions.closed_at` answers in
 * the academic module, and both exist for the same reason: read-only history needs a queryable marker.
 */
export const financialPeriods = pgTable(
  "financial_periods",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** `2026-01`, `2026-Q1`, `2026`. */
    name: varchar("name", { length: 16 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true, precision: 3 }),
    closedByUserId: uuid("closed_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("financial_periods_institution_name_key").on(t.institutionId, t.name),
    check("financial_periods_range_check", sql`${t.endsOn} >= ${t.startsOn}`),
    check(
      "financial_periods_close_pair",
      sql`${t.closedAt} is null or ${t.closedByUserId} is not null`,
    ),
  ],
);
