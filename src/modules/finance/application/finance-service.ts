/**
 * The finance module's use cases (`PRD.md` MODULE 7, `PHASES.md` Phase 10 tasks 1–11, 15–16).
 *
 * Every command does the same three things, in the same order — the admission module's rhythm
 * (`../README.md` §5), so a reader who knows one module knows the other:
 *
 * 1. **Validate** the raw payload against its zod boundary schema (`parseOrThrow`), so a malformed
 *    request dies before it touches the store.
 * 2. **Check policy** against current state — the transition must be an edge of the expense state
 *    machine, a reversal must name a kind this module may reverse, the date must be plausible and
 *    its accounting period open, the amount and currency must be ones this module accepts. These
 *    are pure functions in `../domain/finance-rules.ts` plus checks that need rows the service just
 *    loaded.
 * 3. **Write**, letting the store's version and unique-violation handling turn conflicts the rules
 *    cannot foresee into `ConflictError`. Store `ConflictError`/`ValidationError` are never caught
 *    here — they propagate, because a server action maps `AppError` to a user response already.
 *
 * Three invariants this file exists to protect:
 *
 * - **`RULES.md` §16: a receipt and its ledger entries are one transaction.** The service never
 *   splits a posting — it hands the store a single command and the store writes the journal, its
 *   entries and the row they belong to together. `postFeeCollection` is called from *inside* the
 *   fees store's payment transaction for the same reason, which is why it takes the payment id
 *   and is idempotent on it.
 * - **`ARCHITECTURE.md` §54: correction is reversal, never deletion.** `reverseJournal` refuses
 *   anything but a posted, reversible journal and asks for a reason, so the audit trail explains
 *   the second journal the way the first one explained itself.
 * - **`ADR-0003`: no derived balance is stored.** Nothing in this file computes a balance it
 *   could have read; `listAccounts` and `getOverview` return what the store derived from the
 *   ledger at read time.
 *
 * Authorization is the caller's: a server action checks the principal's permission before it
 * builds a `Actor`, so every write here demands a *named* actor (see `requireActorUserId`) but
 * never re-decides *whether* that actor may act.
 */
import { NotFoundError, ValidationError } from "@/shared/errors";
import { parseOrThrow } from "@/shared/validation";

import {
  assertExpenseTransition,
  assertPlausibleDate,
  assertReversalAllowed,
  assertSupportedCurrency,
  calendarDateString,
  closedPeriodError,
  positiveAmount,
  type ExpenseStatus,
} from "../domain/finance-rules";
import * as s from "./schemas";
import type {
  AccountRow,
  ExpenseDetailRow,
  ExpenseHeadRow,
  ExpenseListRow,
  ExpenseTransition,
  FinanceOverview,
  FinanceStore,
  JournalDetailRow,
  JournalListRow,
  Page,
} from "./ports";

/**
 * Who is performing a write. `userId` is `null` only where no authenticated user exists (seeds,
 * tests); a server action always supplies the session's user so a posting names a real cashier
 * or approver — and every finance write demands one (see `requireActorUserId`).
 */
export interface Actor {
  readonly userId: string | null;
}

/** Every target of an expense transition except staying put in `draft`. */
type ExpenseTarget = Exclude<ExpenseStatus, "draft">;

export interface FinanceService {
  /* ---- Posting ---------------------------------------------------------- */
  postFeeCollection(input: unknown, actor: Actor): Promise<{ readonly journalId: string }>;
  postPayrollCollection(input: unknown, actor: Actor): Promise<{ readonly journalId: string }>;
  recordIncome(input: unknown, actor: Actor): Promise<{ readonly journalId: string }>;
  reverseJournal(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly journalId: string; readonly reversesTransactionId: string }>;

  /* ---- Expenses --------------------------------------------------------- */
  createExpense(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;
  submitExpense(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;
  approveExpense(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;
  markExpensePaid(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;
  rejectExpense(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /* ---- Configuration ---------------------------------------------------- */
  createAccount(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;
  createExpenseHead(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;
  setExpenseHeadActive(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /* ---- Read models ------------------------------------------------------ */
  listAccounts(input: unknown): Promise<readonly AccountRow[]>;
  listJournals(input: unknown): Promise<Page<JournalListRow>>;
  getJournal(input: unknown): Promise<JournalDetailRow>;
  listExpenses(input: unknown): Promise<Page<ExpenseListRow>>;
  getExpense(input: unknown): Promise<ExpenseDetailRow>;
  listExpenseHeads(input: unknown): Promise<readonly ExpenseHeadRow[]>;
  getOverview(input: unknown): Promise<FinanceOverview>;
}

export function createFinanceService(store: FinanceStore): FinanceService {
  /** Every posting names a real cashier, approver or requester. */
  function requireActorUserId(actor: Actor): string {
    if (actor.userId === null) {
      throw new ValidationError("An authenticated user must perform this action.", {
        actor: ["Sign in before recording this change."],
      });
    }
    return actor.userId;
  }

  async function requireJournal(
    institutionId: string,
    journalId: string,
  ): Promise<JournalDetailRow> {
    const journal = await store.getJournal(institutionId, journalId);
    if (journal === null) {
      throw new NotFoundError("Journal does not exist.", {
        userMessage: "That transaction is no longer available. Refresh the list and try again.",
      });
    }
    return journal;
  }

  async function requireExpense(
    institutionId: string,
    expenseId: string,
  ): Promise<ExpenseDetailRow> {
    const expense = await store.getExpense(institutionId, expenseId);
    if (expense === null) {
      throw new NotFoundError("Expense does not exist.", {
        userMessage: "That expense is no longer available. Refresh the list and try again.",
      });
    }
    return expense;
  }

  async function requireExpenseHead(
    institutionId: string,
    expenseHeadId: string,
  ): Promise<ExpenseHeadRow> {
    const heads = await store.listExpenseHeads(institutionId);
    const head = heads.find((candidate) => candidate.id === expenseHeadId);
    if (head === undefined) {
      throw new NotFoundError("Expense head does not exist.", {
        userMessage: "That expense category is no longer available. Choose another one.",
      });
    }
    if (!head.isActive) {
      // `setExpenseHeadActive` promises a deactivated head "stops appearing in new expenses";
      // saying it here keeps the promise where the row has just been read.
      throw new ValidationError("This expense category is inactive.", {
        expenseHeadId: ["Choose a category that is still in use."],
      });
    }
    return head;
  }

  /**
   * Refuse a posting dated inside a closed period (`RULES.md` §36).
   *
   * The store repeats this inside its own transaction: a period can close between this check and
   * the write, and only the transaction that writes can make the promise.
   */
  async function requireOpenPeriod(institutionId: string, date: string): Promise<void> {
    if (!(await store.isPeriodOpen(institutionId, date))) {
      throw closedPeriodError(date);
    }
  }

  /** The shape half of a money posting: plain decimal, positive, a currency this module takes. */
  function assertPostingAmount(amount: string, currency: string): void {
    positiveAmount(amount, currency);
    assertSupportedCurrency(currency);
  }

  /** One step of the expense state machine, guarded by the row's current state. */
  async function moveExpense(
    input: unknown,
    actor: Actor,
    target: ExpenseTarget,
    subject: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    const userId = requireActorUserId(actor);
    const data = parseOrThrow(s.expenseTransitionSchema, input, subject);
    const expense = await requireExpense(data.institutionId, data.expenseId);
    assertExpenseTransition(expense.status, target);
    const transition: ExpenseTransition = {
      institutionId: data.institutionId,
      expenseId: data.expenseId,
      expectedVersion: data.expectedVersion,
    };
    switch (target) {
      case "submitted":
        return store.submitExpense(transition, userId);
      case "approved":
        // Approval is the write that posts the journal, dated when the money was spent — so it
        // is the period of `incurredOn` that must still be open, not today's.
        await requireOpenPeriod(data.institutionId, expense.incurredOn);
        return store.approveExpense(transition, userId);
      case "paid":
        return store.markExpensePaid(transition, userId);
      case "rejected":
        return store.rejectExpense(transition, userId);
    }
  }

  return {
    /* ---- Posting -------------------------------------------------------- */

    async postFeeCollection(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.postFeeCollectionSchema, input, "fee collection");
      assertPostingAmount(data.amount, data.currency);
      assertPlausibleDate(data.transactionOn, new Date(), "transactionOn");
      await requireOpenPeriod(data.institutionId, data.transactionOn);
      const created = await store.postFeeCollection(
        {
          institutionId: data.institutionId,
          paymentId: data.paymentId,
          amount: data.amount,
          currency: data.currency,
          transactionOn: data.transactionOn,
          method: data.method,
          accountId: data.accountId,
          feeCategory: data.feeCategory,
          description: data.description,
        },
        userId,
      );
      return { journalId: created.journalId };
    },

    async postPayrollCollection(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.postPayrollCollectionSchema, input, "payroll posting");
      assertPostingAmount(data.amount, data.currency);
      assertPlausibleDate(data.transactionOn, new Date(), "transactionOn");
      await requireOpenPeriod(data.institutionId, data.transactionOn);
      const created = await store.postPayrollCollection(
        {
          institutionId: data.institutionId,
          payrollRunId: data.payrollRunId,
          amount: data.amount,
          currency: data.currency,
          transactionOn: data.transactionOn,
          method: data.method,
          accountId: data.accountId,
          description: data.description,
        },
        userId,
      );
      return { journalId: created.journalId };
    },

    async recordIncome(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.recordIncomeSchema, input, "income");
      assertPostingAmount(data.amount, data.currency);
      assertPlausibleDate(data.transactionOn, new Date(), "transactionOn");
      await requireOpenPeriod(data.institutionId, data.transactionOn);
      const created = await store.recordIncome(
        {
          institutionId: data.institutionId,
          amount: data.amount,
          currency: data.currency,
          transactionOn: data.transactionOn,
          method: data.method,
          accountId: data.accountId,
          description: data.description,
        },
        userId,
      );
      return { journalId: created.journalId };
    },

    async reverseJournal(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.reverseJournalSchema, input, "journal reversal");
      // Shape comes from the schema (`nonEmptyText`); the length is policy — a one-character
      // reason technically satisfies "non-empty" and explains nothing to an auditor.
      if (data.reason.trim().length < 3) {
        throw new ValidationError("Reversal reason is too short.", {
          reason: ["Give a reason of at least 3 characters."],
        });
      }
      const journal = await requireJournal(data.institutionId, data.journalId);
      assertReversalAllowed(journal);
      await requireOpenPeriod(data.institutionId, calendarDateString(new Date()));
      const created = await store.reverseJournal(
        data.institutionId,
        data.journalId,
        { reason: data.reason },
        userId,
      );
      return {
        journalId: created.journalId,
        reversesTransactionId: created.reversesTransactionId,
      };
    },

    /* ---- Expenses ------------------------------------------------------- */

    async createExpense(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.createExpenseSchema, input, "expense");
      assertPostingAmount(data.amount, data.currency);
      assertPlausibleDate(data.incurredOn, new Date(), "incurredOn");
      await requireExpenseHead(data.institutionId, data.expenseHeadId);
      return store.createExpense(
        {
          institutionId: data.institutionId,
          expenseHeadId: data.expenseHeadId,
          departmentId: data.departmentId,
          amount: data.amount,
          currency: data.currency,
          description: data.description,
          incurredOn: data.incurredOn,
          method: data.method,
          receiptStorageKey: data.receiptStorageKey,
        },
        userId,
      );
    },

    submitExpense(input, actor) {
      return moveExpense(input, actor, "submitted", "expense submission");
    },

    approveExpense(input, actor) {
      return moveExpense(input, actor, "approved", "expense approval");
    },

    markExpensePaid(input, actor) {
      return moveExpense(input, actor, "paid", "expense payment");
    },

    rejectExpense(input, actor) {
      return moveExpense(input, actor, "rejected", "expense rejection");
    },

    /* ---- Configuration -------------------------------------------------- */

    async createAccount(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.createAccountSchema, input, "financial account");
      assertSupportedCurrency(data.currency);
      return store.createAccount(
        {
          institutionId: data.institutionId,
          name: data.name,
          accountType: data.accountType,
          currency: data.currency,
          bankName: data.bankName,
          accountNumber: data.accountNumber,
          iban: data.iban,
          openedOn: data.openedOn,
          isActive: data.isActive,
        },
        userId,
      );
    },

    async createExpenseHead(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.createExpenseHeadSchema, input, "expense head");
      return store.createExpenseHead(
        {
          institutionId: data.institutionId,
          name: data.name,
          category: data.category,
          parentHeadId: data.parentHeadId,
          ledgerAccountId: data.ledgerAccountId,
          description: data.description,
        },
        userId,
      );
    },

    async setExpenseHeadActive(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.setExpenseHeadActiveSchema, input, "expense head");
      return store.setExpenseHeadActive(
        {
          institutionId: data.institutionId,
          expenseHeadId: data.expenseHeadId,
          isActive: data.isActive,
          expectedVersion: data.expectedVersion,
        },
        userId,
      );
    },

    /* ---- Read models ---------------------------------------------------- */

    async listAccounts(input) {
      const data = parseOrThrow(s.listAccountsSchema, input, "account");
      return store.listAccounts(data.institutionId);
    },

    async listJournals(input) {
      const data = parseOrThrow(s.listJournalsSchema, input, "journal");
      return store.listJournals(data.institutionId, {
        kind: data.kind,
        status: data.status,
        from: data.from,
        to: data.to,
        search: data.search,
        page: data.page,
        pageSize: data.pageSize,
      });
    },

    async getJournal(input) {
      const data = parseOrThrow(s.getJournalSchema, input, "journal");
      return requireJournal(data.institutionId, data.journalId);
    },

    async listExpenses(input) {
      const data = parseOrThrow(s.listExpensesSchema, input, "expense");
      return store.listExpenses(data.institutionId, {
        status: data.status,
        from: data.from,
        to: data.to,
        expenseHeadId: data.expenseHeadId,
        page: data.page,
        pageSize: data.pageSize,
      });
    },

    async getExpense(input) {
      const data = parseOrThrow(s.getExpenseSchema, input, "expense");
      return requireExpense(data.institutionId, data.expenseId);
    },

    async listExpenseHeads(input) {
      const data = parseOrThrow(s.listExpenseHeadsSchema, input, "expense head");
      return store.listExpenseHeads(data.institutionId, data.isActive);
    },

    async getOverview(input) {
      const data = parseOrThrow(s.getOverviewSchema, input, "finance overview");
      return store.getOverview(data.institutionId, { months: data.months });
    },
  };
}
