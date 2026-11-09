/**
 * An in-memory {@link FinanceStore} for service tests.
 *
 * It mirrors the Drizzle store's *observable* behaviour for what the service and its tests care
 * about — default accounts auto-provisioned per institution, a `JV-NNNNNN` reference from a
 * per-institution sequence, a fee payment's idempotent replay, version-guarded writes, the
 * expense's journal written on approval, the reversal's swapped entries — and nothing more.
 * Where a rule lives in the *service* (plausible dates, supported currencies, the reversal
 * reason's length, the state machine as an argument) the fake deliberately does not repeat it: a
 * test that passed because the fake was lenient would be worse than no test.
 *
 * Two rules it *does* repeat, because `FinanceStore`'s method docs require the real store to
 * repeat them inside its transaction, where only it can make the promise:
 *
 * - `assertJournalBalanced` before every journal insert — the schema cannot express a zero-sum
 *   aggregate over sibling rows (`src/db/schema/finance.ts`), so this is the check that closes
 *   the gap.
 * - The open-period check, and `assertExpenseTransition`/`assertReversalAllowed` against the row
 *   just loaded — a period can close, or an expense can move, between the service's check and
 *   the write.
 *
 * Two promises belong to the real store and are only *shaped* here: transactional atomicity
 * (every fake write is single-step by construction, so nothing needs rolling back) and
 * unique-violation mapping, raised as `ConflictError` only where a test needs it — a duplicate
 * account or expense-head name, and a stale `expectedVersion`.
 *
 * What the ledger *arithmetic* is real, not shaped: balances, the overview and the monthly chart
 * are derived from the stored entries with the same domain functions
 * (`accountBalance`, `overviewContribution`) the Drizzle store's SQL must reproduce, so a formula
 * error shows up here first.
 */
import { randomUUID } from "node:crypto";

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
  EXPENSE_CATEGORIES,
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
} from "../../domain/finance-rules";

import type {
  DefaultAccountKey,
  ExpenseCategory,
  ExpenseStatus,
  JournalEntryDraft,
  PaymentMethod,
  TransactionKind,
} from "../../domain/finance-rules";

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
  Page,
  PayrollCollectionPost,
  ReversalWrite,
} from "../ports";

function nextId(): string {
  return randomUUID();
}

/** Read-model rows are `readonly`; the fake stores mutable copies behind the same shape. */
type AccountRecord = Omit<AccountRow, "balance">;
type JournalRecord = { -readonly [K in keyof JournalDetailRow]: JournalDetailRow[K] };
type ExpenseRecord = { -readonly [K in keyof ExpenseDetailRow]: ExpenseDetailRow[K] };
type ExpenseHeadRecord = { -readonly [K in keyof ExpenseHeadRow]: ExpenseHeadRow[K] };

interface PeriodRecord {
  readonly institutionId: string;
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly closedAt: Date | null;
}

/** A page of rows plus the unpaged count, sliced defensively (a store may be called directly). */
function paginate<T>(rows: readonly T[], page = 1, pageSize = 50): Page<T> {
  const start = Math.max(0, (page - 1) * pageSize);
  return { rows: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}

export class FakeFinanceStore implements FinanceStore {
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly journals = new Map<string, JournalRecord>();
  private readonly expenses = new Map<string, ExpenseRecord>();
  private readonly expenseHeads = new Map<string, ExpenseHeadRecord>();
  private readonly periods: PeriodRecord[] = [];
  /** `payment_methods.ledgerAccountId` overrides, standing in for that table's rows. */
  private readonly paymentMethodAccounts = new Map<PaymentMethod, string>();
  /** Next `JV-` number per institution — sequences are never shared across institutions. */
  private readonly sequences = new Map<string, number>();

  /* ---- Test seams -------------------------------------------------------- */

  /**
   * Seed a `financial_periods` row. An open period (the default) documents the window without
   * closing it; `closedAt` set is what `isPeriodOpen` must refuse on.
   */
  seedPeriod(values: {
    readonly institutionId: string;
    readonly name: string;
    readonly startsOn: string;
    readonly endsOn: string;
    readonly closedAt?: Date | null;
  }): void {
    this.periods.push({ ...values, closedAt: values.closedAt ?? null });
  }

  /**
   * Stand in for a `payment_methods` row whose `ledgerAccountId` is set: a posting with no
   * explicit `accountId` lands here before any default-account fallback.
   */
  seedPaymentMethodAccount(method: PaymentMethod, accountId: string): void {
    this.paymentMethodAccounts.set(method, accountId);
  }

  /** Read back one journal as the store wrote it — the only handle a posting command returns. */
  journal(journalId: string): JournalDetailRow | null {
    return this.journals.get(journalId) ?? null;
  }

  /** Every journal of an institution, newest write last. */
  journalsOf(institutionId: string): readonly JournalDetailRow[] {
    return [...this.journals.values()].filter((row) => row.institutionId === institutionId);
  }

  /** Read back one expense, including fields the transition commands do not return. */
  expense(expenseId: string): ExpenseDetailRow | null {
    return this.expenses.get(expenseId) ?? null;
  }

  /* ---- Posting ----------------------------------------------------------- */

  async postFeeCollection(
    values: FeeCollectionPost,
    actorUserId: string,
  ): Promise<{ readonly journalId: string }> {
    // The receipt already names the cashier who received the money; a journal has no actor
    // column of its own (`journal_transactions` records who reversed it, not who posted it).
    void actorUserId;
    // Idempotent on the payment: a retried receipt must not post the income twice.
    const replayed = [...this.journals.values()].find(
      (journal) =>
        journal.institutionId === values.institutionId &&
        journal.kind === "fee_collection" &&
        journal.paymentId === values.paymentId,
    );
    if (replayed !== undefined) return { journalId: replayed.id };

    await this.requireOpenPeriodOrThrow(values.institutionId, values.transactionOn);
    const settled = this.resolveAccount(
      values.institutionId,
      values.accountId,
      values.method,
      values.currency,
    );
    const feeIncome = this.defaultAccountRow(values.institutionId, "feeIncome");
    const entries: readonly JournalEntryDraft[] = [
      // `feeCategory` rides on both sides so "everything posted under this fee head" is one
      // filter over `ledger_entries`, not a half of each receipt.
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
    const journal = this.insertJournal({
      institutionId: values.institutionId,
      kind: "fee_collection",
      transactionOn: values.transactionOn,
      description: values.description,
      entries,
      paymentId: values.paymentId,
    });
    return { journalId: journal.id };
  }

  async postPayrollCollection(
    values: PayrollCollectionPost,
    actorUserId: string,
  ): Promise<{ readonly journalId: string; readonly accountId: string }> {
    // Phase 12 owns the payroll run; the journal carries no actor column (see `postFeeCollection`).
    void actorUserId;
    await this.requireOpenPeriodOrThrow(values.institutionId, values.transactionOn);
    const settled = this.resolveAccount(
      values.institutionId,
      values.accountId,
      values.method,
      values.currency,
    );
    const expenses = this.defaultAccountRow(values.institutionId, "operatingExpenses");
    const journal = this.insertJournal({
      institutionId: values.institutionId,
      kind: "salary_payment",
      transactionOn: values.transactionOn,
      description: values.description,
      entries: [
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
          accountId: expenses.id,
          direction: "out",
          amount: values.amount,
          currency: values.currency,
          category: null,
          feeCategory: null,
          description: values.description,
        },
      ],
      payrollRunId: values.payrollRunId,
    });
    return { journalId: journal.id, accountId: settled.id };
  }

  async createExpense(
    values: ExpenseWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    const head = this.expenseHeads.get(values.expenseHeadId);
    if (head === undefined || head.institutionId !== values.institutionId) {
      throw new NotFoundError("Expense head does not exist.");
    }
    const id = nextId();
    const now = new Date();
    const record: ExpenseRecord = {
      id,
      institutionId: values.institutionId,
      expenseHeadId: head.id,
      expenseHeadName: head.name,
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
      requestedByUserId: actorUserId,
      receiptStorageKey: values.receiptStorageKey,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.expenses.set(id, record);
    return { id, version: record.version };
  }

  async submitExpense(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    // Submitting does not move money and names no approver, so the actor only stamps the row's
    // history through `updatedAt` — the request's author stays `requestedByUserId`.
    void actorUserId;
    const record = this.loadExpenseForWrite(values, "submitted");
    record.status = "submitted";
    return this.commitExpense(record);
  }

  async approveExpense(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    const record = this.loadExpenseForWrite(values, "approved");
    // Approval posts the journal, so the period of the date it is written against must still be
    // open — checked here as well as in the service, exactly as the real store must.
    await this.requireOpenPeriodOrThrow(record.institutionId, record.incurredOn);

    const head = this.expenseHeads.get(record.expenseHeadId);
    if (head === undefined) {
      throw new InternalError(`Expense ${record.id} references an unknown head`, {
        details: { expenseHeadId: record.expenseHeadId },
      });
    }
    const expenseAccount =
      head.ledgerAccountId === null
        ? this.defaultAccountRow(record.institutionId, "operatingExpenses")
        : this.requireAccount(head.ledgerAccountId, record.institutionId);
    if (expenseAccount.currency !== record.currency) {
      throw new ValidationError(
        `Account ${expenseAccount.name} is held in ${expenseAccount.currency}, not ${record.currency}.`,
        { expenseHeadId: ["This category posts in another currency; fix the head first."] },
      );
    }
    const paid = this.resolveAccount(record.institutionId, null, record.method, record.currency);
    const journal = this.insertJournal({
      institutionId: record.institutionId,
      kind: "expense",
      transactionOn: record.incurredOn,
      description: record.description,
      entries: [
        // The head's category rides on the expense side only, so `byExpenseCategory` sums one
        // entry per spend instead of both halves of the journal.
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
      ],
    });
    record.status = "approved";
    record.approvedByUserId = actorUserId;
    record.approvedAt = new Date();
    record.journalTransactionId = journal.id;
    return this.commitExpense(record);
  }

  async markExpensePaid(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    void actorUserId;
    const record = this.loadExpenseForWrite(values, "paid");
    if (record.journalTransactionId === null) {
      // The state machine cannot get here on its own (only approval sets a journal); this is the
      // store's own defence against a row written by another path.
      throw new InternalError(`Approved expense ${record.id} has no journal`, {
        details: { expenseId: record.id },
      });
    }
    record.status = "paid";
    return this.commitExpense(record);
  }

  async rejectExpense(
    values: ExpenseTransition,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    void actorUserId;
    const record = this.loadExpenseForWrite(values, "rejected");
    record.status = "rejected";
    return this.commitExpense(record);
  }

  async recordIncome(
    values: IncomeWrite,
    actorUserId: string,
  ): Promise<{ readonly journalId: string }> {
    void actorUserId;
    await this.requireOpenPeriodOrThrow(values.institutionId, values.transactionOn);
    const received = this.resolveAccount(
      values.institutionId,
      values.accountId,
      values.method,
      values.currency,
    );
    const otherIncome = this.defaultAccountRow(values.institutionId, "otherIncome");
    const journal = this.insertJournal({
      institutionId: values.institutionId,
      kind: "income",
      transactionOn: values.transactionOn,
      description: values.description,
      entries: [
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
      ],
    });
    return { journalId: journal.id };
  }

  async reverseJournal(
    institutionId: string,
    journalId: string,
    values: ReversalWrite,
    actorUserId: string,
  ): Promise<{ readonly journalId: string; readonly reversesTransactionId: string }> {
    void actorUserId;
    const original = this.journals.get(journalId);
    if (original === undefined || original.institutionId !== institutionId) {
      throw new NotFoundError("Journal does not exist.");
    }
    // Repeated here because the service's check and this write are separated by a round trip.
    assertReversalAllowed(original);
    const today = calendarDateString(new Date());
    await this.requireOpenPeriodOrThrow(institutionId, today);

    const journal = this.insertJournal({
      institutionId,
      kind: original.kind,
      // Dated today: a correction is a new fact about the ledger, never an edit of an old one
      // (`ARCHITECTURE.md` §54). The original stays where it is, now marked `reversed`.
      transactionOn: today,
      description: `Reversal of ${original.referenceNumber}: ${values.reason}`,
      entries: reversalEntries(original.entries),
      reversesTransactionId: original.id,
    });
    original.status = "reversed";
    original.reversedAt = new Date();
    return { journalId: journal.id, reversesTransactionId: original.id };
  }

  /* ---- Configuration ----------------------------------------------------- */

  async createAccount(
    values: AccountWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    void actorUserId;
    this.ensureDefaults(values.institutionId);
    // Mapped here rather than awaited from a driver: the schema's two unique keys are what a
    // second attempt at the same chart row must collide on.
    const nameTaken = [...this.accounts.values()].some(
      (account) => account.institutionId === values.institutionId && account.name === values.name,
    );
    if (nameTaken) {
      throw new ConflictError("An account with this name already exists.", {
        userMessage: "This institution already has an account with that name.",
      });
    }
    const numberTaken =
      values.accountNumber !== null &&
      [...this.accounts.values()].some(
        (account) =>
          account.institutionId === values.institutionId &&
          account.accountNumber === values.accountNumber,
      );
    if (numberTaken) {
      throw new ConflictError("An account with this account number already exists.", {
        userMessage: "This institution already has an account with that account number.",
      });
    }
    const id = nextId();
    this.accounts.set(id, {
      id,
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
      version: 1,
      updatedAt: new Date(),
    });
    return { id, version: 1 };
  }

  async createExpenseHead(
    values: ExpenseHeadWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    void actorUserId;
    if (values.parentHeadId !== null) {
      const parent = this.expenseHeads.get(values.parentHeadId);
      if (parent === undefined || parent.institutionId !== values.institutionId) {
        throw new NotFoundError("Parent expense head does not exist.");
      }
    }
    if (values.ledgerAccountId !== null) {
      this.requireAccount(values.ledgerAccountId, values.institutionId);
    }
    const nameTaken = [...this.expenseHeads.values()].some(
      (head) => head.institutionId === values.institutionId && head.name === values.name,
    );
    if (nameTaken) {
      throw new ConflictError("An expense head with this name already exists.", {
        userMessage: "This institution already has an expense category with that name.",
      });
    }
    const id = nextId();
    this.expenseHeads.set(id, {
      id,
      institutionId: values.institutionId,
      name: values.name,
      category: values.category,
      parentHeadId: values.parentHeadId,
      ledgerAccountId: values.ledgerAccountId,
      isActive: true,
      description: values.description,
      version: 1,
      updatedAt: new Date(),
    });
    return { id, version: 1 };
  }

  async setExpenseHeadActive(
    values: ExpenseHeadActiveSet,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    void actorUserId;
    const record = this.expenseHeads.get(values.expenseHeadId);
    if (record === undefined || record.institutionId !== values.institutionId) {
      throw new NotFoundError("Expense head does not exist.");
    }
    this.assertVersion(record, values.expectedVersion);
    record.isActive = values.isActive;
    record.updatedAt = new Date();
    record.version += 1;
    return { id: record.id, version: record.version };
  }

  /* ---- Read models ------------------------------------------------------- */

  async listAccounts(institutionId: string): Promise<readonly AccountRow[]> {
    // No provisioning here: an institution that has never posted owns no accounts yet, and a
    // read that silently created five rows would lie about that.
    return [...this.accounts.values()]
      .filter((account) => account.institutionId === institutionId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((account) => ({
        ...account,
        balance: toDecimalText(accountBalance(account.accountType, this.totalsFor(account.id))),
      }));
  }

  async listJournals(
    institutionId: string,
    filters?: JournalListFilters,
  ): Promise<Page<JournalListRow>> {
    const search = filters?.search?.trim().toLowerCase() ?? "";
    const matched = [...this.journals.values()]
      .filter(
        (journal) =>
          journal.institutionId === institutionId &&
          (filters?.kind == null || journal.kind === filters.kind) &&
          (filters?.status == null || journal.status === filters.status) &&
          (filters?.from == null || journal.transactionOn >= filters.from) &&
          (filters?.to == null || journal.transactionOn <= filters.to) &&
          (search.length === 0 ||
            journal.referenceNumber.toLowerCase().includes(search) ||
            (journal.description ?? "").toLowerCase().includes(search)),
      )
      .sort(
        (left, right) =>
          right.transactionOn.localeCompare(left.transactionOn) ||
          right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map(toJournalListRow);
    return paginate(matched, filters?.page, filters?.pageSize);
  }

  async getJournal(institutionId: string, journalId: string): Promise<JournalDetailRow | null> {
    const journal = this.journals.get(journalId);
    if (journal === undefined || journal.institutionId !== institutionId) return null;
    return journal;
  }

  async listExpenses(
    institutionId: string,
    filters?: ExpenseListFilters,
  ): Promise<Page<ExpenseListRow>> {
    const matched = [...this.expenses.values()]
      .filter(
        (expense) =>
          expense.institutionId === institutionId &&
          (filters?.status == null || expense.status === filters.status) &&
          (filters?.from == null || expense.incurredOn >= filters.from) &&
          (filters?.to == null || expense.incurredOn <= filters.to) &&
          (filters?.expenseHeadId == null || expense.expenseHeadId === filters.expenseHeadId),
      )
      .sort(
        (left, right) =>
          right.incurredOn.localeCompare(left.incurredOn) ||
          right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .map(toExpenseListRow);
    return paginate(matched, filters?.page, filters?.pageSize);
  }

  async getExpense(institutionId: string, expenseId: string): Promise<ExpenseDetailRow | null> {
    const expense = this.expenses.get(expenseId);
    if (expense === undefined || expense.institutionId !== institutionId) return null;
    return expense;
  }

  async listExpenseHeads(
    institutionId: string,
    isActive?: boolean | null,
  ): Promise<readonly ExpenseHeadRow[]> {
    return [...this.expenseHeads.values()]
      .filter(
        (head) =>
          head.institutionId === institutionId && (isActive == null || head.isActive === isActive),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getOverview(
    institutionId: string,
    options: { readonly months: number },
  ): Promise<FinanceOverview> {
    // The reported currency is the cash account's — the account every counter posting lands in.
    // With no accounts yet there is nothing to convert from, so the report is in PKR by default.
    const cash = [...this.accounts.values()].find(
      (account) =>
        account.institutionId === institutionId && account.name === defaultAccount("cash").name,
    );
    const currency = cash?.currency ?? "PKR";
    // History is never rewritten: a reversed original stays in the aggregate (its status is no
    // longer `posted`, but it was posted and the ledger records that), and its reversal — dated
    // in the correcting month, with the opposite sign — cancels it there. Only a draft has yet
    // to touch the ledger, and no posting path creates one.
    const posts = [...this.journals.values()].filter(
      (journal) =>
        journal.institutionId === institutionId &&
        journal.status !== "draft" &&
        journal.currency === currency,
    );

    let income = zero(currency);
    let expense = zero(currency);
    const byKind = new Map<TransactionKind, Money>();
    const byCategory = new Map<ExpenseCategory, Money>();
    const byMonth = new Map<string, { income: Money; expense: Money }>();
    let newestMonth = calendarDateString(new Date()).slice(0, 7);

    for (const journal of posts) {
      const contribution = overviewContribution({
        kind: journal.kind,
        reversesTransactionId: journal.reversesTransactionId,
        amount: journal.totalAmount,
        currency: journal.currency,
      });
      income = add(income, contribution.income);
      expense = add(expense, contribution.expense);

      const movement = signedMovement(journal);
      byKind.set(journal.kind, add(byKind.get(journal.kind) ?? zero(currency), movement));

      for (const entry of journal.entries) {
        if (entry.category === null) continue;
        const amount = fromDecimalText(entry.amount, currency);
        const signed = journal.reversesTransactionId === null ? amount : negate(amount);
        byCategory.set(
          entry.category,
          add(byCategory.get(entry.category) ?? zero(currency), signed),
        );
      }

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
      byExpenseCategory: EXPENSE_CATEGORIES.filter((category) => byCategory.has(category)).map(
        (category) => ({
          category,
          total: toDecimalText(byCategory.get(category) ?? zero(currency)),
        }),
      ),
    };
  }

  async isPeriodOpen(institutionId: string, date: string): Promise<boolean> {
    const windows = this.periods
      .filter((period) => period.institutionId === institutionId)
      .map(({ name, startsOn, endsOn, closedAt }) => ({ name, startsOn, endsOn, closedAt }));
    return findClosedPeriod(windows, date) === null;
  }

  /* ---- Internals --------------------------------------------------------- */

  /** Every entry touching an account, summed per direction — the balance's only input. */
  private totalsFor(accountId: string): { readonly inTotal: Money; readonly outTotal: Money } {
    let inTotal = zero("PKR");
    let outTotal = zero("PKR");
    let seen = false;
    for (const journal of this.journals.values()) {
      for (const entry of journal.entries) {
        if (entry.accountId !== accountId) continue;
        const amount = fromDecimalText(entry.amount, entry.currency);
        if (!seen) {
          inTotal = zero(entry.currency);
          outTotal = zero(entry.currency);
          seen = true;
        }
        if (entry.direction === "in") {
          inTotal = add(inTotal, amount);
        } else {
          outTotal = add(outTotal, amount);
        }
      }
    }
    return { inTotal, outTotal };
  }

  /** Load an expense for a guarded write: institution, version, then the state machine. */
  private loadExpenseForWrite(
    values: ExpenseTransition,
    target: Exclude<ExpenseStatus, "draft">,
  ): ExpenseRecord {
    const record = this.expenses.get(values.expenseId);
    if (record === undefined || record.institutionId !== values.institutionId) {
      throw new NotFoundError("Expense does not exist.");
    }
    this.assertVersion(record, values.expectedVersion);
    assertExpenseTransition(record.status, target);
    return record;
  }

  private commitExpense(record: ExpenseRecord): { readonly id: string; readonly version: number } {
    record.updatedAt = new Date();
    record.version += 1;
    return { id: record.id, version: record.version };
  }

  private assertVersion(record: { readonly version: number }, expected: number): void {
    if (record.version !== expected) {
      throw new ConflictError(
        `Finance record version mismatch (expected ${expected}, found ${record.version}).`,
        {
          userMessage:
            "Someone else changed this record while you had it open. Reload to see the latest state.",
        },
      );
    }
  }

  /**
   * Provision the five default accounts for an institution, SELECT-then-INSERT by
   * `(institutionId, name)` — the race two concurrent first postings run in the real store.
   * All five open in PKR: a default has no bank and no foreign counter yet, so a posting in
   * another currency must name an account that actually holds it.
   */
  private ensureDefaults(institutionId: string): void {
    for (const account of DEFAULT_ACCOUNTS) {
      const exists = [...this.accounts.values()].some(
        (row) => row.institutionId === institutionId && row.name === account.name,
      );
      if (exists) continue;
      const id = nextId();
      this.accounts.set(id, {
        id,
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
        version: 1,
        updatedAt: new Date(),
      });
    }
  }

  /** The provisioned default row for a key. */
  private defaultAccountRow(institutionId: string, key: DefaultAccountKey): AccountRecord {
    this.ensureDefaults(institutionId);
    const wanted = defaultAccount(key);
    const found = [...this.accounts.values()].find(
      (row) => row.institutionId === institutionId && row.name === wanted.name,
    );
    if (found === undefined) {
      throw new InternalError(`Default account ${wanted.name} is missing`, {
        details: { institutionId, key },
      });
    }
    return found;
  }

  private requireAccount(accountId: string, institutionId: string): AccountRecord {
    const account = this.accounts.get(accountId);
    if (account === undefined || account.institutionId !== institutionId) {
      throw new NotFoundError("Financial account does not exist.");
    }
    return account;
  }

  /**
   * Which account a posting settles into: an explicit choice, then the payment method's own
   * `payment_methods.ledgerAccountId`, then the method's default. Whatever wins must be active
   * and hold the posting's currency — both stated as field messages rather than 500s.
   */
  private resolveAccount(
    institutionId: string,
    accountId: string | null,
    method: PaymentMethod,
    currency: string,
  ): AccountRecord {
    let account: AccountRecord | undefined;
    if (accountId !== null) {
      account = this.accounts.get(accountId);
      if (account === undefined || account.institutionId !== institutionId) {
        throw new NotFoundError("Financial account does not exist.");
      }
    } else {
      const seededId = this.paymentMethodAccounts.get(method);
      if (seededId !== undefined) {
        account = this.accounts.get(seededId);
        if (account === undefined || account.institutionId !== institutionId) {
          throw new NotFoundError("Financial account does not exist.");
        }
      } else {
        account = this.defaultAccountRow(institutionId, defaultAccountKeyForMethod(method));
      }
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

  private async requireOpenPeriodOrThrow(institutionId: string, date: string): Promise<void> {
    if (!(await this.isPeriodOpen(institutionId, date))) {
      throw closedPeriodError(date);
    }
  }

  /** Write a journal header and its entries, zero-sum asserted before anything is stored. */
  private insertJournal(values: {
    readonly institutionId: string;
    readonly kind: TransactionKind;
    readonly transactionOn: string;
    readonly description: string | null;
    readonly entries: readonly JournalEntryDraft[];
    readonly paymentId?: string | null;
    readonly payrollRunId?: string | null;
    readonly reversesTransactionId?: string | null;
  }): JournalRecord {
    const totals = assertJournalBalanced(values.entries);
    const sequence = (this.sequences.get(values.institutionId) ?? 0) + 1;
    this.sequences.set(values.institutionId, sequence);
    const record: JournalRecord = {
      id: nextId(),
      institutionId: values.institutionId,
      kind: values.kind,
      referenceNumber: `JV-${String(sequence).padStart(6, "0")}`,
      description: values.description,
      paymentId: values.paymentId ?? null,
      payrollRunId: values.payrollRunId ?? null,
      transactionOn: values.transactionOn,
      status: "posted",
      postedAt: new Date(),
      reversedAt: null,
      reversesTransactionId: values.reversesTransactionId ?? null,
      totalAmount: toDecimalText(totals.inTotal),
      currency: totals.inTotal.currency,
      createdAt: new Date(),
      entries: values.entries.map((entry) => ({
        ...entry,
        id: nextId(),
        accountName: this.accountNameOf(entry.accountId),
      })),
    };
    this.journals.set(record.id, record);
    return record;
  }

  private accountNameOf(accountId: string): string {
    const account = this.accounts.get(accountId);
    if (account === undefined) {
      throw new InternalError(`Journal references an unknown account ${accountId}`, {
        details: { accountId },
      });
    }
    return account.name;
  }
}

/**
 * The signed movement a journal contributes to `byKind`: positive when money came in or a spend
 * was recognised, negative for refunds and for every reversal.
 *
 * For the four kinds that have a bucket this is the same figure `overviewContribution` reports
 * there, so the two views never disagree. For `salary_payment`, `adjustment` and
 * `opening_balance` — which touch neither bucket — it is the gross movement, which is why they
 * still show a figure (their effect on the dashboard totals is Phase 12's open question, see
 * `overviewContribution`).
 */
function signedMovement(journal: JournalRecord): Money {
  const amount = fromDecimalText(journal.totalAmount, journal.currency);
  const signed = journal.reversesTransactionId === null ? amount : negate(amount);
  return journal.kind === "refund" ? negate(signed) : signed;
}

/** Strip the entries a list row does not carry. */
function toJournalListRow(journal: JournalRecord): JournalListRow {
  const { entries, ...row } = journal;
  void entries;
  return row;
}

/** Attach the joined head name, without which the expenses table cannot render a row. */
function toExpenseListRow(expense: ExpenseRecord): ExpenseListRow {
  const { receiptStorageKey, ...row } = expense;
  void receiptStorageKey;
  return row;
}
