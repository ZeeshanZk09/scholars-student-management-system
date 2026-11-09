/**
 * The Drizzle implementation of {@link FinanceStore} — the only file in the finance module that
 * imports `@/db/client` or the table objects (`src/modules/README.md`: ports in, Drizzle out).
 * Its responsibilities mirror the admission and fee stores' (`RULES.md` §15: the database is the
 * source of truth for integrity), with four this module states explicitly:
 *
 * 1. **Tenant guards.** Every read and write carries `institution_id` in its own WHERE clause.
 *    There is no unscoped read or write (`SECURITY.md` §21) — an institution may not see, let
 *    alone move, another's ledger.
 * 2. **Posting is one transaction** (`RULES.md` §16): the journal header, its entries and the row
 *    it belongs to — a payment, an expense, a reversal — are written together, and the zero-sum
 *    invariant is asserted inside that transaction before the insert (`assertJournalBalanced`,
 *    because no schema constraint can express an aggregate over sibling rows).
 * 3. **Versioned writes take `expectedVersion`** and raise `ConflictError` when the row moved
 *    underneath — the same optimistic concurrency admission and fees use. The update is
 *    re-guarded in its WHERE clause so a write racing between the load and the update cannot
 *    land silently.
 * 4. **No derived balance is ever stored** (`ADR-0003`). `AccountRow.balance` and
 *    `FinanceOverview` are `SUM()`s over `ledger_entries` computed here at read time. Balances
 *    use drizzle `.as()` derived-table joins so the rollup is one query per list, not N+1.
 *
 * Two behaviours the port's method docs require the *store* to repeat inside its transaction,
 * where only it can make the promise (the service checks both too, but a round trip separates
 * the two):
 *
 * - **The open-period check** on every path that posts a journal (`postFeeCollection`,
 *   `postPayrollCollection`, `recordIncome`, `approveExpense` against `incurredOn`, and
 *   `reverseJournal` against *today*). Create/submit/reject never move money and skip it.
 * - **`assertExpenseTransition` / `assertReversalAllowed` against the row just loaded**, so a
 *   concurrent write cannot slip an illegal state through the gap.
 *
 * Unique conflicts arrive as PostgreSQL `23505` (a journal reference or account number minted
 * twice under a race the pre-read lost) and are translated to `ConflictError`; version-guarded
 * writes that touch no row are the same conflict. Everything else propagates.
 *
 * ## Currency
 *
 * `ledger_entries` has no currency column: a journal's currency is every entry's account's
 * currency, enforced equal by `assertJournalBalanced` (one currency across the journal, parsed
 * as money). Every rollup that reports a currency therefore joins `financial_accounts` and takes
 * `min(currency)` per journal — the common currency of its entries.
 */
import { and, asc, desc, eq, gte, ilike, lte, ne, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import type { DbLike } from "@/db/client";
import {
  expenseHeads,
  expenses,
  financialAccounts,
  financialPeriods,
  journalTransactions,
  ledgerEntries,
  paymentMethods,
} from "@/db/schema";
import { ConflictError, InternalError, NotFoundError, ValidationError } from "@/shared/errors";
import {
  add,
  fromDecimalText,
  negate,
  subtract,
  toDecimalText,
  zero,
  type Money,
} from "@/shared/money";

import {
  DEFAULT_ACCOUNTS,
  JOURNAL_KINDS,
  accountBalance,
  assertExpenseTransition,
  assertJournalBalanced,
  assertReversalAllowed,
  calendarDateString,
  closedPeriodError,
  defaultAccount,
  defaultAccountKeyForMethod,
  findClosedPeriod,
  monthKey,
  monthKeysEndingAt,
  overviewContribution,
  reversalEntries,
  type AccountType,
  type JournalEntryDraft,
  type TransactionKind,
} from "../domain/finance-rules";

import type {
  AccountRow,
  AccountWrite,
  ExpenseDetailRow,
  ExpenseHeadActiveSet,
  ExpenseHeadRow,
  ExpenseHeadWrite,
  ExpenseListFilters,
  ExpenseListRow,
  ExpenseTransition,
  ExpenseWrite,
  FeeCollectionPost,
  FinanceOverview,
  FinanceStore,
  IncomeWrite,
  JournalDetailRow,
  JournalListFilters,
  JournalListRow,
  LedgerEntryRow,
  Page,
  PayrollCollectionPost,
  ReversalWrite,
} from "../application/ports";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

/** A `version`-guarded update that touched no row: stale write, or the row is gone. */
async function expectVersionedRow(
  rows: readonly { readonly id: string }[],
  label: string,
): Promise<void> {
  if (rows.length > 0) return;
  throw new ConflictError(`${label} was changed by someone else.`, {
    userMessage: `This ${label.toLowerCase()} was changed by someone else. Refresh the page and try again.`,
  });
}

/* -------------------------------------------------------------------------- */
/* Narrowing helpers (varchar columns carry a DDL check, not a TS union)      */
/* -------------------------------------------------------------------------- */

function toJournalStatus(value: string): JournalListRow["status"] {
  if (value === "draft" || value === "posted" || value === "reversed") return value;
  throw new InternalError(`Unknown journal status "${value}".`);
}

function toExpenseStatus(value: string): ExpenseListRow["status"] {
  if (
    value === "draft" ||
    value === "submitted" ||
    value === "approved" ||
    value === "paid" ||
    value === "rejected"
  ) {
    return value;
  }
  throw new InternalError(`Unknown expense status "${value}".`);
}

function toAccountType(value: string): AccountType {
  if (
    value === "bank" ||
    value === "cash" ||
    value === "mobile_wallet" ||
    value === "cheque" ||
    value === "other" ||
    value === "income" ||
    value === "expense"
  ) {
    return value;
  }
  throw new InternalError(`Unknown account type "${value}".`);
}

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for the store's own unit tests — no database)       */
/* -------------------------------------------------------------------------- */

/**
 * The `page`/`pageSize` a list query actually runs with: default 1/50, `pageSize` capped at 200
 * (`schemas.ts` states the same bounds at the boundary; the store is also called directly, and a
 * caller passing `pageSize: 10_000` must not turn one page into a full-table scan).
 */
export function normalizePaging(
  page?: number,
  pageSize?: number,
): {
  readonly page: number;
  readonly pageSize: number;
} {
  const resolvedPage = page !== undefined && page >= 1 ? Math.floor(page) : 1;
  const resolvedSize =
    pageSize !== undefined && pageSize >= 1 ? Math.min(200, Math.floor(pageSize)) : 50;
  return { page: resolvedPage, pageSize: resolvedSize };
}

/**
 * The signed movement a journal contributes to the overview's `byKind` (the fake's formula,
 * restated here so the two views never disagree): positive when money came in or a spend was
 * recognised, negative for refunds and for every reversal. For the four kinds that have a
 * dashboard bucket this is the same figure `overviewContribution` reports there; for
 * `salary_payment`/`adjustment`/`opening_balance` it is the gross movement, which is why they
 * still show a figure in `byKind` while contributing to neither bucket.
 */
export function signedMovement(
  kind: TransactionKind,
  amount: string,
  currency: string,
  reversesTransactionId: string | null,
): Money {
  const parsed = fromDecimalText(amount, currency);
  const signed = reversesTransactionId === null ? parsed : negate(parsed);
  return kind === "refund" ? negate(signed) : signed;
}

/* -------------------------------------------------------------------------- */
/* Sequences and numbering                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The next free suffix of this institution's `JV-NNNNNN` series — the highest numeric suffix of
 * `reference_number` plus one, scoped to the institution so two schools never share a sequence
 * (the same shape as the fee module's `PAY-`/`RCP-` minter).
 */
async function nextJournalSequence(executor: DbLike, institutionId: string): Promise<number> {
  const rows = await executor
    .select({
      next: sql<number>`coalesce(
        max(cast(nullif(regexp_substr(${journalTransactions.referenceNumber}, '[0-9]+$'), '') as integer)),
        0
      ) + 1`,
    })
    .from(journalTransactions)
    .where(eq(journalTransactions.institutionId, institutionId));
  const row = rows[0];
  return row === undefined ? 1 : row.next;
}

/** `JV-000001`: six digits, unlike fees' four — a ledger's series is longer-lived than a receipt's. */
const formatJournalNumber = (sequence: number): string => `JV-${String(sequence).padStart(6, "0")}`;

/* -------------------------------------------------------------------------- */
/* Shared posting machinery                                                   */
/* -------------------------------------------------------------------------- */

/** The account fields every resolution path returns. */
interface ResolvedAccount {
  readonly id: string;
  readonly name: string;
  readonly accountType: AccountType;
  readonly currency: string;
  readonly isActive: boolean;
}

/**
 * Provision the five default accounts for an institution, `SELECT`-then-`INSERT` by
 * `(institutionId, name)` — the race two concurrent first postings run. A lost race on the
 * unique key is caught and the row re-read, so the second posting still finds the default.
 * All five open in PKR: a default has no bank and no foreign counter yet, so a posting in
 * another currency must name an account that actually holds it (see `DEFAULT_ACCOUNTS`).
 */
async function ensureDefaultAccounts(executor: DbLike, institutionId: string): Promise<void> {
  for (const account of DEFAULT_ACCOUNTS) {
    const existing = await executor
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.institutionId, institutionId),
          eq(financialAccounts.name, account.name),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;
    try {
      await executor.insert(financialAccounts).values({
        institutionId,
        name: account.name,
        accountType: account.accountType,
        bankName: null,
        accountNumber: null,
        iban: null,
        currency: "PKR",
        isActive: true,
        openedOn: null,
        closedOn: null,
      });
    } catch (error) {
      // A concurrent posting provisioned the same default between the SELECT and the INSERT.
      // The unique key on `(institution_id, name)` is the backstop; the row is now there.
      if (!isUniqueViolation(error)) throw error;
    }
  }
}

/** Load the provisioned default row for a key, or fail loudly — provisioning always precedes this. */
async function requireDefaultAccount(
  executor: DbLike,
  institutionId: string,
  key: Parameters<typeof defaultAccount>[0],
): Promise<ResolvedAccount> {
  await ensureDefaultAccounts(executor, institutionId);
  const wanted = defaultAccount(key);
  const rows = await executor
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      accountType: financialAccounts.accountType,
      currency: financialAccounts.currency,
      isActive: financialAccounts.isActive,
    })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.institutionId, institutionId),
        eq(financialAccounts.name, wanted.name),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new InternalError(`Default account ${wanted.name} is missing`, {
      details: { institutionId, key },
    });
  }
  return {
    id: row.id,
    name: row.name,
    accountType: toAccountType(row.accountType),
    currency: row.currency,
    isActive: row.isActive,
  };
}

/** Load one account of this institution by id, or refuse. */
async function requireAccountById(
  executor: DbLike,
  institutionId: string,
  accountId: string,
): Promise<ResolvedAccount> {
  const rows = await executor
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      accountType: financialAccounts.accountType,
      currency: financialAccounts.currency,
      isActive: financialAccounts.isActive,
    })
    .from(financialAccounts)
    .where(
      and(eq(financialAccounts.id, accountId), eq(financialAccounts.institutionId, institutionId)),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new NotFoundError("Financial account does not exist.", {
      userMessage: "That account does not exist, or belongs to another institution.",
    });
  }
  return {
    id: row.id,
    name: row.name,
    accountType: toAccountType(row.accountType),
    currency: row.currency,
    isActive: row.isActive,
  };
}

/**
 * Which account a posting settles into: an explicit choice, then the payment method's own
 * `payment_methods.ledgerAccountId`, then the method's default (`defaultAccountKeyForMethod`,
 * auto-provisioned). Whatever wins must be active and hold the posting's currency — both stated
 * as field messages rather than 500s, matching the fake's `resolveAccount`.
 */
async function resolvePostingAccount(
  executor: DbLike,
  institutionId: string,
  accountId: string | null,
  method: FeeCollectionPost["method"],
  currency: string,
): Promise<ResolvedAccount> {
  let account: ResolvedAccount;
  if (accountId !== null) {
    account = await requireAccountById(executor, institutionId, accountId);
  } else {
    const methodRows = await executor
      .select({ ledgerAccountId: paymentMethods.ledgerAccountId })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.institutionId, institutionId),
          eq(paymentMethods.method, method),
          eq(paymentMethods.isActive, true),
        ),
      )
      .limit(1);
    const ledgerAccountId = methodRows[0]?.ledgerAccountId ?? null;
    account =
      ledgerAccountId === null
        ? await requireDefaultAccount(executor, institutionId, defaultAccountKeyForMethod(method))
        : await requireAccountById(executor, institutionId, ledgerAccountId);
  }
  if (!account.isActive) {
    throw new ValidationError(`Account ${account.name} is inactive.`, {
      accountId: ["Choose an active account."],
    });
  }
  if (account.currency !== currency) {
    throw new ValidationError(
      `Account ${account.name} is held in ${account.currency}, not ${currency}.`,
      { accountId: [`Choose an account that holds ${currency}.`] },
    );
  }
  return account;
}

/**
 * Refuse when a closed `financial_periods` window covers `date`. The service checks this before
 * calling a write; the store repeats it inside the transaction because a period can close in
 * between (`RULES.md` §36: a closed period is history).
 */
async function requireOpenPeriod(
  executor: DbLike,
  institutionId: string,
  date: string,
): Promise<void> {
  const rows = await executor
    .select({
      name: financialPeriods.name,
      startsOn: financialPeriods.startsOn,
      endsOn: financialPeriods.endsOn,
      closedAt: financialPeriods.closedAt,
    })
    .from(financialPeriods)
    .where(eq(financialPeriods.institutionId, institutionId));
  if (findClosedPeriod(rows, date) !== null) {
    throw closedPeriodError(date);
  }
}

/**
 * Write a balanced journal's header and entries, minting the institution's next `JV-` reference.
 * `assertJournalBalanced` runs first — the schema cannot express the zero-sum aggregate, so this
 * is the check that closes the gap. A lost race on the reference's unique key re-mints once
 * (two postings starting from the same max suffix), then surfaces as a conflict.
 */
async function insertJournal(
  executor: DbLike,
  values: {
    readonly institutionId: string;
    readonly kind: TransactionKind;
    readonly transactionOn: string;
    readonly description: string | null;
    readonly entries: readonly JournalEntryDraft[];
    readonly actorUserId: string;
    readonly paymentId?: string | null | undefined;
    readonly payrollRunId?: string | null | undefined;
    readonly reversesTransactionId?: string | null | undefined;
  },
): Promise<{ readonly journalId: string }> {
  const totals = assertJournalBalanced(values.entries);
  void totals;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const referenceNumber = formatJournalNumber(
        await nextJournalSequence(executor, values.institutionId),
      );
      const inserted = await executor
        .insert(journalTransactions)
        .values({
          institutionId: values.institutionId,
          transactionKind: values.kind,
          referenceNumber,
          description: values.description,
          paymentId: values.paymentId ?? null,
          payrollRunId: values.payrollRunId ?? null,
          reversesTransactionId: values.reversesTransactionId ?? null,
          transactionOn: values.transactionOn,
          status: "posted",
          postedAt: new Date(),
          postedByUserId: values.actorUserId,
        })
        .returning({ id: journalTransactions.id });
      const header = inserted[0];
      if (header === undefined) throw new InternalError("Journal insert returned no row");
      await executor.insert(ledgerEntries).values(
        values.entries.map((entry) => ({
          journalTransactionId: header.id,
          accountId: entry.accountId,
          direction: entry.direction,
          amount: entry.amount,
          category: entry.category,
          feeCategory: entry.feeCategory,
          description: entry.description,
        })),
      );
      return { journalId: header.id };
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new InternalError("Journal reference could not be minted after a retry.");
}

/* -------------------------------------------------------------------------- */
/* Derived-table rollups (one query per list, never N+1)                      */
/* -------------------------------------------------------------------------- */

/**
 * Per-account `SUM(in)`/`SUM(out)` — the only input to `accountBalance`. Built with drizzle's
 * `.as()` subquery so the joined columns are typed references, not raw SQL.
 */
function accountTotalsSubquery() {
  return db
    .select({
      accountId: ledgerEntries.accountId,
      inTotal: sql<string>`coalesce(
        sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'in'),
        0
      )`.as("in_total"),
      outTotal: sql<string>`coalesce(
        sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'out'),
        0
      )`.as("out_total"),
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.accountId)
    .as("account_totals");
}

/**
 * Per-journal `SUM(in)` (the journal's amount — equal to `SUM(out)` on a balanced journal) and
 * `min(currency)` over the entries' accounts (every entry of one journal shares a currency,
 * asserted at posting).
 */
function journalTotalsSubquery() {
  return db
    .select({
      journalTransactionId: ledgerEntries.journalTransactionId,
      totalAmount: sql<string>`coalesce(
        sum(${ledgerEntries.amount}) filter (where ${ledgerEntries.direction} = 'in'),
        0
      )`.as("total_amount"),
      currency: sql<string>`min(${financialAccounts.currency})`.as("currency"),
    })
    .from(ledgerEntries)
    .innerJoin(financialAccounts, eq(financialAccounts.id, ledgerEntries.accountId))
    .groupBy(ledgerEntries.journalTransactionId)
    .as("journal_totals");
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

export function createFinanceStore(executor: DbLike): FinanceStore {
  /** The version-guarded expense transition shared by submit/approve/paid/reject. */
  async function transitionExpense(
    tx: DbLike,
    values: ExpenseTransition,
    target: Exclude<ExpenseListRow["status"], "draft">,
  ): Promise<{ readonly id: string; readonly version: number }> {
    const rows = await tx
      .select({
        id: expenses.id,
        status: expenses.status,
        version: expenses.version,
      })
      .from(expenses)
      .where(
        and(eq(expenses.id, values.expenseId), eq(expenses.institutionId, values.institutionId)),
      )
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError("Expense does not exist.", {
        userMessage: "That expense does not exist, or belongs to another institution.",
      });
    }
    if (row.version !== values.expectedVersion) {
      throw new ConflictError(
        `Finance record version mismatch (expected ${values.expectedVersion}, found ${row.version}).`,
        {
          userMessage:
            "Someone else changed this record while you had it open. Reload to see the latest state.",
        },
      );
    }
    assertExpenseTransition(toExpenseStatus(row.status), target);
    const updated = await tx
      .update(expenses)
      .set({
        status: target,
        updatedAt: new Date(),
        version: sql`${expenses.version} + 1`,
      })
      .where(
        and(
          eq(expenses.id, values.expenseId),
          eq(expenses.institutionId, values.institutionId),
          eq(expenses.version, values.expectedVersion),
        ),
      )
      .returning({ id: expenses.id, version: expenses.version });
    await expectVersionedRow(updated, "Expense");
    const result = updated[0];
    if (result === undefined) throw new InternalError("Expense update returned no row");
    return { id: result.id, version: result.version };
  }

  return {
    /* ---- Posting --------------------------------------------------------- */

    async postFeeCollection(values: FeeCollectionPost, actorUserId: string) {
      return executor.transaction(async (tx) => {
        // Idempotent on the payment: a retried receipt must not post the income twice. The
        // journal lives or dies with the payment row — the fees store calls this inside the
        // payment's own transaction, so a journal without its payment is impossible.
        const replayed = await tx
          .select({ id: journalTransactions.id })
          .from(journalTransactions)
          .where(
            and(
              eq(journalTransactions.institutionId, values.institutionId),
              eq(journalTransactions.transactionKind, "fee_collection"),
              eq(journalTransactions.paymentId, values.paymentId),
              ne(journalTransactions.status, "draft"),
            ),
          )
          .limit(1);
        const existing = replayed[0];
        if (existing !== undefined) return { journalId: existing.id };

        await requireOpenPeriod(tx, values.institutionId, values.transactionOn);
        const settled = await resolvePostingAccount(
          tx,
          values.institutionId,
          values.accountId,
          values.method,
          values.currency,
        );
        const feeIncome = await requireDefaultAccount(tx, values.institutionId, "feeIncome");
        // `feeCategory` rides on both sides so "everything posted under this fee head" is one
        // filter over `ledger_entries`, not a half of each receipt.
        const entries: readonly JournalEntryDraft[] = [
          {
            accountId: settled.id,
            direction: "in",
            amount: values.amount,
            currency: values.currency,
            category: null,
            feeCategory: values.feeCategory,
            description: values.description,
          },
          {
            accountId: feeIncome.id,
            direction: "out",
            amount: values.amount,
            currency: values.currency,
            category: null,
            feeCategory: values.feeCategory,
            description: values.description,
          },
        ];
        return insertJournal(tx, {
          institutionId: values.institutionId,
          kind: "fee_collection",
          transactionOn: values.transactionOn,
          description: values.description,
          entries,
          actorUserId,
          paymentId: values.paymentId,
        });
      });
    },

    async postPayrollCollection(values: PayrollCollectionPost, actorUserId: string) {
      return executor.transaction(async (tx) => {
        await requireOpenPeriod(tx, values.institutionId, values.transactionOn);
        const settled = await resolvePostingAccount(
          tx,
          values.institutionId,
          values.accountId,
          values.method,
          values.currency,
        );
        const operating = await requireDefaultAccount(
          tx,
          values.institutionId,
          "operatingExpenses",
        );
        const entries: readonly JournalEntryDraft[] = [
          {
            accountId: settled.id,
            direction: "in",
            amount: values.amount,
            currency: values.currency,
            category: null,
            feeCategory: null,
            description: values.description,
          },
          {
            accountId: operating.id,
            direction: "out",
            amount: values.amount,
            currency: values.currency,
            category: null,
            feeCategory: null,
            description: values.description,
          },
        ];
        const posted = await insertJournal(tx, {
          institutionId: values.institutionId,
          kind: "salary_payment",
          transactionOn: values.transactionOn,
          description: values.description,
          entries,
          actorUserId,
          payrollRunId: values.payrollRunId,
        });
        // The account the journal posted against — the payment row records this same id, so the
        // two can never name different accounts (`payroll_payments_run_account_key`).
        return { journalId: posted.journalId, accountId: settled.id };
      });
    },

    async createExpense(values: ExpenseWrite, actorUserId: string) {
      // The head must exist and belong to this institution before a spend can name it. The
      // foreign key would refuse an unknown id, but a *cross-tenant* id would pass the FK —
      // hence the institution predicate.
      const head = await executor
        .select({ id: expenseHeads.id })
        .from(expenseHeads)
        .where(
          and(
            eq(expenseHeads.id, values.expenseHeadId),
            eq(expenseHeads.institutionId, values.institutionId),
          ),
        )
        .limit(1);
      if (head[0] === undefined) {
        throw new NotFoundError("Expense head does not exist.", {
          userMessage: "That expense category does not exist, or belongs to another institution.",
        });
      }
      const inserted = await executor
        .insert(expenses)
        .values({
          institutionId: values.institutionId,
          expenseHeadId: values.expenseHeadId,
          departmentId: values.departmentId,
          amount: values.amount,
          currency: values.currency,
          description: values.description,
          incurredOn: values.incurredOn,
          method: values.method,
          status: "draft",
          approvedByUserId: null,
          approvedAt: null,
          journalTransactionId: null,
          receiptStorageKey: values.receiptStorageKey,
          requestedByUserId: actorUserId,
        })
        .returning({ id: expenses.id, version: expenses.version });
      const row = inserted[0];
      if (row === undefined) throw new InternalError("Expense insert returned no row");
      return { id: row.id, version: row.version };
    },

    async submitExpense(values: ExpenseTransition, actorUserId: string) {
      // Submitting does not move money and names no approver, so the actor only stamps the
      // row's history through `updatedAt` — the request's author stays `requestedByUserId`.
      void actorUserId;
      return executor.transaction((tx) => transitionExpense(tx, values, "submitted"));
    },

    async approveExpense(values: ExpenseTransition, actorUserId: string) {
      return executor.transaction(async (tx) => {
        // Load the full row first: the transition, the period check and the journal all read
        // from the same snapshot inside this transaction.
        const rows = await tx
          .select({
            id: expenses.id,
            institutionId: expenses.institutionId,
            expenseHeadId: expenses.expenseHeadId,
            amount: expenses.amount,
            currency: expenses.currency,
            description: expenses.description,
            incurredOn: expenses.incurredOn,
            method: expenses.method,
            status: expenses.status,
            version: expenses.version,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.id, values.expenseId),
              eq(expenses.institutionId, values.institutionId),
            ),
          )
          .limit(1);
        const record = rows[0];
        if (record === undefined) {
          throw new NotFoundError("Expense does not exist.", {
            userMessage: "That expense does not exist, or belongs to another institution.",
          });
        }
        if (record.version !== values.expectedVersion) {
          throw new ConflictError(
            `Finance record version mismatch (expected ${values.expectedVersion}, found ${record.version}).`,
            {
              userMessage:
                "Someone else changed this record while you had it open. Reload to see the latest state.",
            },
          );
        }
        assertExpenseTransition(toExpenseStatus(record.status), "approved");
        // Approval posts the journal against `incurredOn`, so that period must still be open.
        await requireOpenPeriod(tx, record.institutionId, record.incurredOn);

        const headRows = await tx
          .select({
            id: expenseHeads.id,
            name: expenseHeads.name,
            category: expenseHeads.category,
            ledgerAccountId: expenseHeads.ledgerAccountId,
          })
          .from(expenseHeads)
          .where(eq(expenseHeads.id, record.expenseHeadId))
          .limit(1);
        const head = headRows[0];
        if (head === undefined) {
          throw new InternalError(`Expense ${record.id} references an unknown head`, {
            details: { expenseHeadId: record.expenseHeadId },
          });
        }
        const expenseAccount =
          head.ledgerAccountId === null
            ? await requireDefaultAccount(tx, record.institutionId, "operatingExpenses")
            : await requireAccountById(tx, record.institutionId, head.ledgerAccountId);
        if (expenseAccount.currency !== record.currency) {
          throw new ValidationError(
            `Account ${expenseAccount.name} is held in ${expenseAccount.currency}, not ${record.currency}.`,
            { expenseHeadId: ["This category posts in another currency; fix the head first."] },
          );
        }
        const paid = await resolvePostingAccount(
          tx,
          record.institutionId,
          null,
          record.method,
          record.currency,
        );
        // The head's category rides on the expense side only, so `byExpenseCategory` sums one
        // entry per spend instead of both halves of the journal.
        const entries: readonly JournalEntryDraft[] = [
          {
            accountId: expenseAccount.id,
            direction: "in",
            amount: record.amount,
            currency: record.currency,
            category: head.category,
            feeCategory: null,
            description: record.description,
          },
          {
            accountId: paid.id,
            direction: "out",
            amount: record.amount,
            currency: record.currency,
            category: null,
            feeCategory: null,
            description: record.description,
          },
        ];
        const journal = await insertJournal(tx, {
          institutionId: record.institutionId,
          kind: "expense",
          transactionOn: record.incurredOn,
          description: record.description,
          entries,
          actorUserId,
        });
        const updated = await tx
          .update(expenses)
          .set({
            status: "approved",
            approvedByUserId: actorUserId,
            approvedAt: new Date(),
            journalTransactionId: journal.journalId,
            updatedAt: new Date(),
            version: sql`${expenses.version} + 1`,
          })
          .where(
            and(
              eq(expenses.id, values.expenseId),
              eq(expenses.institutionId, values.institutionId),
              eq(expenses.version, values.expectedVersion),
            ),
          )
          .returning({ id: expenses.id, version: expenses.version });
        await expectVersionedRow(updated, "Expense");
        const result = updated[0];
        if (result === undefined) throw new InternalError("Expense update returned no row");
        return { id: result.id, version: result.version };
      });
    },

    async markExpensePaid(values: ExpenseTransition, actorUserId: string) {
      // Paying names no new actor — approval already did — so the parameter only satisfies the
      // port's uniform write signature.
      void actorUserId;
      return executor.transaction(async (tx) => {
        const journalRows = await tx
          .select({
            journalTransactionId: expenses.journalTransactionId,
            status: expenses.status,
            version: expenses.version,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.id, values.expenseId),
              eq(expenses.institutionId, values.institutionId),
            ),
          )
          .limit(1);
        const row = journalRows[0];
        if (row === undefined) {
          throw new NotFoundError("Expense does not exist.", {
            userMessage: "That expense does not exist, or belongs to another institution.",
          });
        }
        if (row.version !== values.expectedVersion) {
          throw new ConflictError(
            `Finance record version mismatch (expected ${values.expectedVersion}, found ${row.version}).`,
            {
              userMessage:
                "Someone else changed this record while you had it open. Reload to see the latest state.",
            },
          );
        }
        assertExpenseTransition(toExpenseStatus(row.status), "paid");
        // The state machine cannot get here on its own (only approval sets a journal); this is
        // the store's own defence against a row written by another path.
        if (row.journalTransactionId === null) {
          throw new InternalError(`Approved expense ${values.expenseId} has no journal`, {
            details: { expenseId: values.expenseId },
          });
        }
        return transitionExpense(tx, values, "paid");
      });
    },

    async rejectExpense(values: ExpenseTransition, actorUserId: string) {
      void actorUserId;
      return executor.transaction((tx) => transitionExpense(tx, values, "rejected"));
    },

    async recordIncome(values: IncomeWrite, actorUserId: string) {
      return executor.transaction(async (tx) => {
        await requireOpenPeriod(tx, values.institutionId, values.transactionOn);
        const received = await resolvePostingAccount(
          tx,
          values.institutionId,
          values.accountId,
          values.method,
          values.currency,
        );
        const otherIncome = await requireDefaultAccount(tx, values.institutionId, "otherIncome");
        const entries: readonly JournalEntryDraft[] = [
          {
            accountId: received.id,
            direction: "in",
            amount: values.amount,
            currency: values.currency,
            category: null,
            feeCategory: null,
            description: values.description,
          },
          {
            accountId: otherIncome.id,
            direction: "out",
            amount: values.amount,
            currency: values.currency,
            category: null,
            feeCategory: null,
            description: values.description,
          },
        ];
        return insertJournal(tx, {
          institutionId: values.institutionId,
          kind: "income",
          transactionOn: values.transactionOn,
          description: values.description,
          entries,
          actorUserId,
        });
      });
    },

    async reverseJournal(
      institutionId: string,
      journalId: string,
      values: ReversalWrite,
      actorUserId: string,
    ) {
      return executor.transaction(async (tx) => {
        const rows = await tx
          .select({
            id: journalTransactions.id,
            kind: journalTransactions.transactionKind,
            status: journalTransactions.status,
            referenceNumber: journalTransactions.referenceNumber,
          })
          .from(journalTransactions)
          .where(
            and(
              eq(journalTransactions.id, journalId),
              eq(journalTransactions.institutionId, institutionId),
            ),
          )
          .limit(1);
        const original = rows[0];
        if (original === undefined) {
          throw new NotFoundError("Journal does not exist.", {
            userMessage: "That journal does not exist, or belongs to another institution.",
          });
        }
        // Repeated here because the service's check and this write are separated by a round
        // trip — the journal's status can have moved between the two.
        assertReversalAllowed({
          kind: original.kind,
          status: toJournalStatus(original.status),
        });
        const today = calendarDateString(new Date());
        await requireOpenPeriod(tx, institutionId, today);

        const entryRows = await tx
          .select({
            accountId: ledgerEntries.accountId,
            direction: ledgerEntries.direction,
            amount: ledgerEntries.amount,
            currency: financialAccounts.currency,
            category: ledgerEntries.category,
            feeCategory: ledgerEntries.feeCategory,
            description: ledgerEntries.description,
          })
          .from(ledgerEntries)
          .innerJoin(financialAccounts, eq(financialAccounts.id, ledgerEntries.accountId))
          .where(eq(ledgerEntries.journalTransactionId, original.id));
        if (entryRows.length === 0) {
          throw new InternalError(`Journal ${original.id} has no entries to reverse`, {
            details: { journalId: original.id },
          });
        }
        const entries: readonly JournalEntryDraft[] = entryRows.map((entry) => ({
          accountId: entry.accountId,
          direction: entry.direction,
          amount: entry.amount,
          currency: entry.currency,
          category: entry.category,
          feeCategory: entry.feeCategory,
          description: entry.description,
        }));
        // Dated today: a correction is a new fact about the ledger, never an edit of an old
        // one (`ARCHITECTURE.md` §54). The original stays where it is, now marked `reversed`.
        const journal = await insertJournal(tx, {
          institutionId,
          kind: original.kind,
          transactionOn: today,
          description: `Reversal of ${original.referenceNumber}: ${values.reason}`,
          entries: reversalEntries(entries),
          actorUserId,
          reversesTransactionId: original.id,
        });
        await tx
          .update(journalTransactions)
          .set({
            status: "reversed",
            reversedAt: new Date(),
            reversedByUserId: actorUserId,
          })
          .where(
            and(
              eq(journalTransactions.id, original.id),
              eq(journalTransactions.institutionId, institutionId),
            ),
          );
        return { journalId: journal.journalId, reversesTransactionId: original.id };
      });
    },

    /* ---- Configuration ----------------------------------------------------- */

    async createAccount(values: AccountWrite, actorUserId: string) {
      // Chart-of-accounts rows carry no actor column; the parameter satisfies the port's
      // uniform write signature.
      void actorUserId;
      try {
        const inserted = await executor
          .insert(financialAccounts)
          .values({
            institutionId: values.institutionId,
            name: values.name,
            accountType: values.accountType,
            bankName: values.bankName,
            accountNumber: values.accountNumber,
            iban: values.iban,
            currency: values.currency,
            isActive: values.isActive,
            openedOn: values.openedOn,
            closedOn: null,
          })
          .returning({ id: financialAccounts.id, version: financialAccounts.version });
        const row = inserted[0];
        if (row === undefined) throw new InternalError("Account insert returned no row");
        return { id: row.id, version: row.version };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("An account with this account number already exists.", {
            userMessage: "This institution already has an account with that account number.",
          });
        }
        throw error;
      }
    },

    async createExpenseHead(values: ExpenseHeadWrite, actorUserId: string) {
      // Heads carry no actor column (see `createAccount`).
      void actorUserId;
      if (values.parentHeadId !== null) {
        const parent = await executor
          .select({ id: expenseHeads.id })
          .from(expenseHeads)
          .where(
            and(
              eq(expenseHeads.id, values.parentHeadId),
              eq(expenseHeads.institutionId, values.institutionId),
            ),
          )
          .limit(1);
        if (parent[0] === undefined) {
          throw new NotFoundError("Parent expense head does not exist.", {
            userMessage: "The parent category does not exist, or belongs to another institution.",
          });
        }
      }
      if (values.ledgerAccountId !== null) {
        await requireAccountById(executor, values.institutionId, values.ledgerAccountId);
      }
      // No unique index exists on `(institution_id, name)` for heads, so the conflict the fake
      // raises is a pre-read here — the schema cannot be the backstop for this one.
      const nameTaken = await executor
        .select({ id: expenseHeads.id })
        .from(expenseHeads)
        .where(
          and(
            eq(expenseHeads.institutionId, values.institutionId),
            eq(expenseHeads.name, values.name),
          ),
        )
        .limit(1);
      if (nameTaken[0] !== undefined) {
        throw new ConflictError("An expense head with this name already exists.", {
          userMessage: "This institution already has an expense category with that name.",
        });
      }
      const inserted = await executor
        .insert(expenseHeads)
        .values({
          institutionId: values.institutionId,
          name: values.name,
          category: values.category,
          parentHeadId: values.parentHeadId,
          ledgerAccountId: values.ledgerAccountId,
          isActive: true,
          description: values.description,
        })
        .returning({ id: expenseHeads.id, version: expenseHeads.version });
      const row = inserted[0];
      if (row === undefined) throw new InternalError("Expense head insert returned no row");
      return { id: row.id, version: row.version };
    },

    async setExpenseHeadActive(values: ExpenseHeadActiveSet, actorUserId: string) {
      // Activation flips carry no actor column (see `createAccount`).
      void actorUserId;
      const updated = await executor
        .update(expenseHeads)
        .set({
          isActive: values.isActive,
          updatedAt: new Date(),
          version: sql`${expenseHeads.version} + 1`,
        })
        .where(
          and(
            eq(expenseHeads.id, values.expenseHeadId),
            eq(expenseHeads.institutionId, values.institutionId),
            eq(expenseHeads.version, values.expectedVersion),
          ),
        )
        .returning({ id: expenseHeads.id, version: expenseHeads.version });
      if (updated.length === 0) {
        // Distinguish "never existed / wrong tenant" from "version moved": a head the
        // institution does not own is a 404, a stale version is a conflict.
        const exists = await executor
          .select({ id: expenseHeads.id })
          .from(expenseHeads)
          .where(
            and(
              eq(expenseHeads.id, values.expenseHeadId),
              eq(expenseHeads.institutionId, values.institutionId),
            ),
          )
          .limit(1);
        if (exists[0] === undefined) {
          throw new NotFoundError("Expense head does not exist.", {
            userMessage: "That expense category does not exist, or belongs to another institution.",
          });
        }
        await expectVersionedRow(updated, "Expense head");
      }
      const row = updated[0];
      if (row === undefined) throw new InternalError("Expense head update returned no row");
      return { id: row.id, version: row.version };
    },

    /* ---- Read models ------------------------------------------------------- */

    async listAccounts(institutionId: string) {
      // No provisioning here: an institution that has never posted owns no accounts yet, and a
      // read that silently created five rows would lie about that.
      const totals = accountTotalsSubquery();
      const rows = await executor
        .select({
          id: financialAccounts.id,
          institutionId: financialAccounts.institutionId,
          name: financialAccounts.name,
          accountType: financialAccounts.accountType,
          bankName: financialAccounts.bankName,
          accountNumber: financialAccounts.accountNumber,
          iban: financialAccounts.iban,
          currency: financialAccounts.currency,
          isActive: financialAccounts.isActive,
          openedOn: financialAccounts.openedOn,
          closedOn: financialAccounts.closedOn,
          version: financialAccounts.version,
          updatedAt: financialAccounts.updatedAt,
          inTotal: totals.inTotal,
          outTotal: totals.outTotal,
        })
        .from(financialAccounts)
        .leftJoin(totals, eq(totals.accountId, financialAccounts.id))
        .where(eq(financialAccounts.institutionId, institutionId))
        .orderBy(asc(financialAccounts.name));
      return rows.map((row): AccountRow => {
        const accountType = toAccountType(row.accountType);
        return {
          id: row.id,
          institutionId: row.institutionId,
          name: row.name,
          accountType,
          bankName: row.bankName,
          accountNumber: row.accountNumber,
          iban: row.iban,
          currency: row.currency,
          isActive: row.isActive,
          openedOn: row.openedOn,
          closedOn: row.closedOn,
          balance: toDecimalText(
            accountBalance(accountType, {
              inTotal: fromDecimalText(row.inTotal ?? "0", row.currency),
              outTotal: fromDecimalText(row.outTotal ?? "0", row.currency),
            }),
          ),
          version: row.version,
          updatedAt: row.updatedAt,
        };
      });
    },

    async listJournals(institutionId: string, filters?: JournalListFilters) {
      const kind = filters?.kind ?? null;
      const status = filters?.status ?? null;
      const from = filters?.from ?? null;
      const to = filters?.to ?? null;
      const search = filters?.search?.trim() ?? "";
      const { page, pageSize } = normalizePaging(filters?.page, filters?.pageSize);

      const conditions: SQL[] = [eq(journalTransactions.institutionId, institutionId)];
      if (kind !== null) conditions.push(eq(journalTransactions.transactionKind, kind));
      if (status !== null) conditions.push(eq(journalTransactions.status, status));
      if (from !== null) conditions.push(gte(journalTransactions.transactionOn, from));
      if (to !== null) conditions.push(lte(journalTransactions.transactionOn, to));
      if (search.length > 0) {
        conditions.push(
          or(
            ilike(journalTransactions.referenceNumber, `%${search}%`),
            ilike(journalTransactions.description, `%${search}%`),
          ) ?? sql`false`,
        );
      }
      const where = and(...conditions);

      const totals = journalTotalsSubquery();
      const [countRows, rows] = await Promise.all([
        executor
          .select({ total: sql<number>`count(*)::int` })
          .from(journalTransactions)
          .where(where),
        executor
          .select({
            id: journalTransactions.id,
            institutionId: journalTransactions.institutionId,
            kind: journalTransactions.transactionKind,
            referenceNumber: journalTransactions.referenceNumber,
            description: journalTransactions.description,
            paymentId: journalTransactions.paymentId,
            payrollRunId: journalTransactions.payrollRunId,
            transactionOn: journalTransactions.transactionOn,
            status: journalTransactions.status,
            postedAt: journalTransactions.postedAt,
            reversedAt: journalTransactions.reversedAt,
            reversesTransactionId: journalTransactions.reversesTransactionId,
            createdAt: journalTransactions.createdAt,
            totalAmount: totals.totalAmount,
            currency: totals.currency,
          })
          .from(journalTransactions)
          .leftJoin(totals, eq(totals.journalTransactionId, journalTransactions.id))
          .where(where)
          .orderBy(desc(journalTransactions.transactionOn), desc(journalTransactions.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      const mapped = rows.map((row): JournalListRow => {
        const totalAmount = row.totalAmount ?? "0";
        const currency = row.currency ?? "PKR";
        return {
          id: row.id,
          institutionId: row.institutionId,
          kind: row.kind,
          referenceNumber: row.referenceNumber,
          description: row.description,
          paymentId: row.paymentId,
          payrollRunId: row.payrollRunId,
          transactionOn: row.transactionOn,
          status: toJournalStatus(row.status),
          postedAt: row.postedAt,
          reversedAt: row.reversedAt,
          reversesTransactionId: row.reversesTransactionId,
          totalAmount,
          currency,
          createdAt: row.createdAt,
        };
      });
      return {
        rows: mapped,
        total: countRows[0]?.total ?? 0,
        page,
        pageSize,
      } satisfies Page<JournalListRow>;
    },

    async getJournal(institutionId: string, journalId: string) {
      const totals = journalTotalsSubquery();
      const headerRows = await executor
        .select({
          id: journalTransactions.id,
          institutionId: journalTransactions.institutionId,
          kind: journalTransactions.transactionKind,
          referenceNumber: journalTransactions.referenceNumber,
          description: journalTransactions.description,
          paymentId: journalTransactions.paymentId,
          payrollRunId: journalTransactions.payrollRunId,
          transactionOn: journalTransactions.transactionOn,
          status: journalTransactions.status,
          postedAt: journalTransactions.postedAt,
          reversedAt: journalTransactions.reversedAt,
          reversesTransactionId: journalTransactions.reversesTransactionId,
          createdAt: journalTransactions.createdAt,
          totalAmount: totals.totalAmount,
          currency: totals.currency,
        })
        .from(journalTransactions)
        .leftJoin(totals, eq(totals.journalTransactionId, journalTransactions.id))
        .where(
          and(
            eq(journalTransactions.id, journalId),
            eq(journalTransactions.institutionId, institutionId),
          ),
        )
        .limit(1);
      const header = headerRows[0];
      if (header === undefined) return null;

      const entryRows = await executor
        .select({
          id: ledgerEntries.id,
          accountId: ledgerEntries.accountId,
          accountName: financialAccounts.name,
          direction: ledgerEntries.direction,
          amount: ledgerEntries.amount,
          currency: financialAccounts.currency,
          category: ledgerEntries.category,
          feeCategory: ledgerEntries.feeCategory,
          description: ledgerEntries.description,
        })
        .from(ledgerEntries)
        .innerJoin(financialAccounts, eq(financialAccounts.id, ledgerEntries.accountId))
        .where(eq(ledgerEntries.journalTransactionId, journalId))
        .orderBy(asc(ledgerEntries.direction), asc(financialAccounts.name));

      const entries: readonly LedgerEntryRow[] = entryRows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        accountName: row.accountName,
        direction: row.direction,
        amount: row.amount,
        currency: row.currency,
        category: row.category,
        feeCategory: row.feeCategory,
        description: row.description,
      }));
      return {
        id: header.id,
        institutionId: header.institutionId,
        kind: header.kind,
        referenceNumber: header.referenceNumber,
        description: header.description,
        paymentId: header.paymentId,
        payrollRunId: header.payrollRunId,
        transactionOn: header.transactionOn,
        status: toJournalStatus(header.status),
        postedAt: header.postedAt,
        reversedAt: header.reversedAt,
        reversesTransactionId: header.reversesTransactionId,
        totalAmount: header.totalAmount ?? "0",
        currency: header.currency ?? "PKR",
        createdAt: header.createdAt,
        entries,
      } satisfies JournalDetailRow;
    },

    async listExpenses(institutionId: string, filters?: ExpenseListFilters) {
      const status = filters?.status ?? null;
      const from = filters?.from ?? null;
      const to = filters?.to ?? null;
      const expenseHeadId = filters?.expenseHeadId ?? null;
      const { page, pageSize } = normalizePaging(filters?.page, filters?.pageSize);

      const conditions: SQL[] = [eq(expenses.institutionId, institutionId)];
      if (status !== null) conditions.push(eq(expenses.status, status));
      if (from !== null) conditions.push(gte(expenses.incurredOn, from));
      if (to !== null) conditions.push(lte(expenses.incurredOn, to));
      if (expenseHeadId !== null) conditions.push(eq(expenses.expenseHeadId, expenseHeadId));
      const where = and(...conditions);

      const [countRows, rows] = await Promise.all([
        executor
          .select({ total: sql<number>`count(*)::int` })
          .from(expenses)
          .where(where),
        executor
          .select({
            id: expenses.id,
            institutionId: expenses.institutionId,
            expenseHeadId: expenses.expenseHeadId,
            expenseHeadName: expenseHeads.name,
            departmentId: expenses.departmentId,
            amount: expenses.amount,
            currency: expenses.currency,
            description: expenses.description,
            incurredOn: expenses.incurredOn,
            method: expenses.method,
            status: expenses.status,
            approvedByUserId: expenses.approvedByUserId,
            approvedAt: expenses.approvedAt,
            journalTransactionId: expenses.journalTransactionId,
            requestedByUserId: expenses.requestedByUserId,
            createdAt: expenses.createdAt,
            updatedAt: expenses.updatedAt,
            version: expenses.version,
          })
          .from(expenses)
          .innerJoin(expenseHeads, eq(expenseHeads.id, expenses.expenseHeadId))
          .where(where)
          .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      const mapped = rows.map((row): ExpenseListRow => ({
        id: row.id,
        institutionId: row.institutionId,
        expenseHeadId: row.expenseHeadId,
        expenseHeadName: row.expenseHeadName,
        departmentId: row.departmentId,
        amount: row.amount,
        currency: row.currency,
        description: row.description,
        incurredOn: row.incurredOn,
        method: row.method,
        status: toExpenseStatus(row.status),
        approvedByUserId: row.approvedByUserId,
        approvedAt: row.approvedAt,
        journalTransactionId: row.journalTransactionId,
        requestedByUserId: row.requestedByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
      }));
      return {
        rows: mapped,
        total: countRows[0]?.total ?? 0,
        page,
        pageSize,
      } satisfies Page<ExpenseListRow>;
    },

    async getExpense(institutionId: string, expenseId: string) {
      const rows = await executor
        .select({
          id: expenses.id,
          institutionId: expenses.institutionId,
          expenseHeadId: expenses.expenseHeadId,
          expenseHeadName: expenseHeads.name,
          departmentId: expenses.departmentId,
          amount: expenses.amount,
          currency: expenses.currency,
          description: expenses.description,
          incurredOn: expenses.incurredOn,
          method: expenses.method,
          status: expenses.status,
          approvedByUserId: expenses.approvedByUserId,
          approvedAt: expenses.approvedAt,
          journalTransactionId: expenses.journalTransactionId,
          receiptStorageKey: expenses.receiptStorageKey,
          requestedByUserId: expenses.requestedByUserId,
          createdAt: expenses.createdAt,
          updatedAt: expenses.updatedAt,
          version: expenses.version,
        })
        .from(expenses)
        .innerJoin(expenseHeads, eq(expenseHeads.id, expenses.expenseHeadId))
        .where(and(eq(expenses.id, expenseId), eq(expenses.institutionId, institutionId)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        id: row.id,
        institutionId: row.institutionId,
        expenseHeadId: row.expenseHeadId,
        expenseHeadName: row.expenseHeadName,
        departmentId: row.departmentId,
        amount: row.amount,
        currency: row.currency,
        description: row.description,
        incurredOn: row.incurredOn,
        method: row.method,
        status: toExpenseStatus(row.status),
        approvedByUserId: row.approvedByUserId,
        approvedAt: row.approvedAt,
        journalTransactionId: row.journalTransactionId,
        receiptStorageKey: row.receiptStorageKey,
        requestedByUserId: row.requestedByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
      } satisfies ExpenseDetailRow;
    },

    async listExpenseHeads(institutionId: string, isActive?: boolean | null) {
      const conditions: SQL[] = [eq(expenseHeads.institutionId, institutionId)];
      if (isActive !== undefined && isActive !== null) {
        conditions.push(eq(expenseHeads.isActive, isActive));
      }
      const rows = await executor
        .select({
          id: expenseHeads.id,
          institutionId: expenseHeads.institutionId,
          name: expenseHeads.name,
          category: expenseHeads.category,
          parentHeadId: expenseHeads.parentHeadId,
          ledgerAccountId: expenseHeads.ledgerAccountId,
          isActive: expenseHeads.isActive,
          description: expenseHeads.description,
          version: expenseHeads.version,
          updatedAt: expenseHeads.updatedAt,
        })
        .from(expenseHeads)
        .where(and(...conditions))
        .orderBy(asc(expenseHeads.name));
      return rows.map((row): ExpenseHeadRow => ({
        id: row.id,
        institutionId: row.institutionId,
        name: row.name,
        category: row.category,
        parentHeadId: row.parentHeadId,
        ledgerAccountId: row.ledgerAccountId,
        isActive: row.isActive,
        description: row.description,
        version: row.version,
        updatedAt: row.updatedAt,
      }));
    },

    async getOverview(institutionId: string, options: { readonly months: number }) {
      // The reported currency is the cash account's — the account every counter posting lands
      // in. With no accounts yet there is nothing to convert from, so the report is in PKR by
      // default. FX translation is out of scope (Phase 10): journals in another currency are
      // excluded rather than converted.
      const cashRows = await executor
        .select({ currency: financialAccounts.currency })
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.institutionId, institutionId),
            eq(financialAccounts.name, defaultAccount("cash").name),
          ),
        )
        .limit(1);
      const currency = cashRows[0]?.currency ?? "PKR";

      // History is never rewritten: a reversed original stays in the aggregate (its status is
      // no longer `posted`, but it *was* posted and the ledger records that), and its reversal
      // — dated in the correcting month, with the opposite sign — cancels it there. Only a
      // draft has yet to touch the ledger.
      const totals = journalTotalsSubquery();
      const [journalRows, categoryRows] = await Promise.all([
        executor
          .select({
            id: journalTransactions.id,
            kind: journalTransactions.transactionKind,
            reversesTransactionId: journalTransactions.reversesTransactionId,
            transactionOn: journalTransactions.transactionOn,
            totalAmount: totals.totalAmount,
          })
          .from(journalTransactions)
          .innerJoin(totals, eq(totals.journalTransactionId, journalTransactions.id))
          .where(
            and(
              eq(journalTransactions.institutionId, institutionId),
              ne(journalTransactions.status, "draft"),
              eq(totals.currency, currency),
            ),
          ),
        executor
          .select({
            category: ledgerEntries.category,
            total: sql<string>`coalesce(
              sum(case
                when ${journalTransactions.reversesTransactionId} is not null
                then -${ledgerEntries.amount}
                else ${ledgerEntries.amount}
              end),
              0
            )`.as("total"),
          })
          .from(ledgerEntries)
          .innerJoin(
            journalTransactions,
            eq(journalTransactions.id, ledgerEntries.journalTransactionId),
          )
          .innerJoin(totals, eq(totals.journalTransactionId, journalTransactions.id))
          .where(
            and(
              eq(journalTransactions.institutionId, institutionId),
              ne(journalTransactions.status, "draft"),
              eq(totals.currency, currency),
              sql`${ledgerEntries.category} is not null`,
            ),
          )
          .groupBy(ledgerEntries.category),
      ]);

      let income = zero(currency);
      let expense = zero(currency);
      const byKind = new Map<TransactionKind, Money>();
      const byMonth = new Map<string, { income: Money; expense: Money }>();
      let newestMonth = calendarDateString(new Date()).slice(0, 7);

      for (const journal of journalRows) {
        const totalAmount = journal.totalAmount ?? "0";
        const contribution = overviewContribution({
          kind: journal.kind,
          reversesTransactionId: journal.reversesTransactionId,
          amount: totalAmount,
          currency,
        });
        income = add(income, contribution.income);
        expense = add(expense, contribution.expense);

        const movement = signedMovement(
          journal.kind,
          totalAmount,
          currency,
          journal.reversesTransactionId,
        );
        byKind.set(journal.kind, add(byKind.get(journal.kind) ?? zero(currency), movement));

        const key = monthKey(journal.transactionOn);
        if (key > newestMonth) newestMonth = key;
        const bucket = byMonth.get(key) ?? { income: zero(currency), expense: zero(currency) };
        bucket.income = add(bucket.income, contribution.income);
        bucket.expense = add(bucket.expense, contribution.expense);
        byMonth.set(key, bucket);
      }

      const monthly = monthKeysEndingAt(newestMonth, options.months).map((month) => {
        const bucket = byMonth.get(month);
        const monthIncome = bucket?.income ?? zero(currency);
        const monthExpense = bucket?.expense ?? zero(currency);
        return {
          month,
          income: toDecimalText(monthIncome),
          expense: toDecimalText(monthExpense),
          net: toDecimalText(subtract(monthIncome, monthExpense)),
        };
      });

      return {
        currency,
        incomeTotal: toDecimalText(income),
        expenseTotal: toDecimalText(expense),
        netPosition: toDecimalText(subtract(income, expense)),
        monthly,
        byKind: JOURNAL_KINDS.filter((kind) => byKind.has(kind)).map((kind) => ({
          kind,
          total: toDecimalText(byKind.get(kind) ?? zero(currency)),
        })),
        byExpenseCategory: categoryRows.flatMap((row) =>
          row.category === null
            ? []
            : [
                {
                  category: row.category,
                  total: toDecimalText(fromDecimalText(row.total, currency)),
                },
              ],
        ),
      } satisfies FinanceOverview;
    },

    async isPeriodOpen(institutionId: string, date: string) {
      const rows = await executor
        .select({
          name: financialPeriods.name,
          startsOn: financialPeriods.startsOn,
          endsOn: financialPeriods.endsOn,
          closedAt: financialPeriods.closedAt,
        })
        .from(financialPeriods)
        .where(eq(financialPeriods.institutionId, institutionId));
      return findClosedPeriod(rows, date) === null;
    },
  };
}

/** The pooled-client store every caller outside a transaction uses. */
export const drizzleFinanceStore: FinanceStore = createFinanceStore(db);
