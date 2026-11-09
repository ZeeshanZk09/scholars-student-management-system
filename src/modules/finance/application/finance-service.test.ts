/**
 * Use-case tests for the finance service, run against an in-memory {@link FakeFinanceStore}.
 *
 * These cover the decisions that live in the service layer (`PRD.md` MODULE 7, `PHASES.md`
 * Phase 10): boundary validation on every command, the actor gate every write demands, the
 * state machine asserted against the row just loaded, the closed-period refusal, the reversal's
 * rules (kind, status, reason), the supported-currency policy, and the dashboard arithmetic
 * derived at read time (`ADR-0003`: never stored). Store-level integrity — tenant guards,
 * unique-violation translation, the real transaction — belongs to the Drizzle store and is out
 * of scope here.
 *
 * Dates are fixed *past* values wherever a rule is being tested, so the suite cannot rot as the
 * calendar moves; only the two assertions that must sit next to "today" (the plausibility
 * horizon and the monthly chart) compute their dates from the clock, and they assert derived
 * keys rather than hard-coded months.
 */
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";

import { calendarDateString, monthKeysEndingAt } from "../domain/finance-rules";
import { createFinanceService, type FinanceService } from "./finance-service";
import { FakeFinanceStore } from "./testing/fakes";

const ACTOR = { userId: randomUUID() };
const SIGNED_OUT = { userId: null };
const GHOST = randomUUID();

let INST: string;
let store: FakeFinanceStore;
let svc: FinanceService;

beforeEach(() => {
  INST = randomUUID();
  store = new FakeFinanceStore();
  svc = createFinanceService(store);
});

const feeInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  paymentId: randomUUID(),
  amount: "1500.00",
  currency: "PKR",
  transactionOn: "2026-07-02",
  method: "cash",
  accountId: null,
  feeCategory: "tuition",
  description: "July tuition",
  ...overrides,
});

const incomeInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  amount: "1000.00",
  currency: "PKR",
  transactionOn: "2026-07-01",
  method: "cash",
  accountId: null,
  description: "Donation",
  ...overrides,
});

const payrollInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  payrollRunId: randomUUID(),
  amount: "800.00",
  currency: "PKR",
  transactionOn: "2026-07-05",
  method: "bank_transfer",
  accountId: null,
  description: "Salaries",
  ...overrides,
});

const headInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  name: "Stationery",
  category: "supplies",
  parentHeadId: null,
  ledgerAccountId: null,
  description: null,
  ...overrides,
});

const expenseInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  expenseHeadId: GHOST,
  departmentId: null,
  amount: "450.00",
  currency: "PKR",
  description: "Printer paper",
  incurredOn: "2026-07-03",
  method: "cash",
  receiptStorageKey: null,
  ...overrides,
});

const transitionInput = (expenseId: string, expectedVersion: number) => ({
  institutionId: INST,
  expenseId,
  expectedVersion,
});

/** Walk an expense to `submitted`, returning its id and current version. */
async function draftExpense(
  overrides: Record<string, unknown> = {},
): Promise<{ readonly id: string; readonly version: number }> {
  const head = await svc.createExpenseHead(headInput(), ACTOR);
  const created = await svc.createExpense(
    expenseInput({ expenseHeadId: head.id, ...overrides }),
    ACTOR,
  );
  const submitted = await svc.submitExpense(transitionInput(created.id, created.version), ACTOR);
  return { id: created.id, version: submitted.version };
}

describe("postFeeCollection", () => {
  it("writes one balanced fee journal: cash in, fee income out, a JV reference", async () => {
    const { journalId } = await svc.postFeeCollection(feeInput(), ACTOR);
    const journal = store.journal(journalId);
    expect(journal).not.toBeNull();
    expect(journal?.kind).toBe("fee_collection");
    expect(journal?.status).toBe("posted");
    expect(journal?.referenceNumber).toBe("JV-000001");
    expect(journal?.totalAmount).toBe("1500.00");
    expect(journal?.currency).toBe("PKR");
    expect(journal?.paymentId).not.toBeNull();

    expect(journal?.entries).toHaveLength(2);
    const settled = journal?.entries.find((entry) => entry.direction === "in");
    const income = journal?.entries.find((entry) => entry.direction === "out");
    expect(settled?.accountName).toBe("Cash in Hand");
    expect(settled?.amount).toBe("1500.00");
    expect(income?.accountName).toBe("Fee Income");
    // The fee head rides on both sides so one filter over `ledger_entries` sees the whole receipt.
    expect(settled?.feeCategory).toBe("tuition");
    expect(income?.feeCategory).toBe("tuition");
  });

  it("replays the same payment instead of posting the income twice", async () => {
    const input = feeInput();
    const first = await svc.postFeeCollection(input, ACTOR);
    const second = await svc.postFeeCollection(input, ACTOR);
    expect(second.journalId).toBe(first.journalId);
    expect(store.journalsOf(INST)).toHaveLength(1);
  });

  it("refuses a currency outside this module's supported set", async () => {
    await expect(
      svc.postFeeCollection(feeInput({ currency: "XXX" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.journalsOf(INST)).toHaveLength(0);
  });

  it("refuses a posting no account of this institution can hold", async () => {
    // USD is supported, but every default account opens in PKR and none was named — so the
    // money would land somewhere it cannot be kept.
    const failure = await svc
      .postFeeCollection(feeInput({ currency: "USD" }), ACTOR)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).fieldErrors.accountId).toBeDefined();
    expect(store.journalsOf(INST)).toHaveLength(0);
  });

  it("settles into the account seeded for the payment method when none is named", async () => {
    const pettyCash = await svc.createAccount(
      {
        institutionId: INST,
        name: "Petty Cash",
        accountType: "cash",
        currency: "PKR",
        bankName: null,
        accountNumber: null,
        iban: null,
        openedOn: null,
        isActive: true,
      },
      ACTOR,
    );
    store.seedPaymentMethodAccount("cash", pettyCash.id);

    const { journalId } = await svc.postFeeCollection(feeInput(), ACTOR);
    const journal = store.journal(journalId);
    const settled = journal?.entries.find((entry) => entry.direction === "in");
    expect(settled?.accountId).toBe(pettyCash.id);
    expect(settled?.accountName).toBe("Petty Cash");
  });

  it("refuses a date inside a closed period and accepts one inside an open period", async () => {
    store.seedPeriod({
      institutionId: INST,
      name: "FY2026",
      startsOn: "2026-04-01",
      endsOn: "2026-06-30",
      closedAt: new Date("2026-07-01T00:00:00Z"),
    });
    store.seedPeriod({
      institutionId: INST,
      name: "FY2027",
      startsOn: "2026-07-01",
      endsOn: "2027-06-30",
    });

    await expect(
      svc.postFeeCollection(feeInput({ transactionOn: "2026-06-15" }), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store.journalsOf(INST)).toHaveLength(0);

    await expect(
      svc.postFeeCollection(feeInput({ transactionOn: "2026-07-15" }), ACTOR),
    ).resolves.toEqual({ journalId: expect.any(String) });
    expect(store.journalsOf(INST)).toHaveLength(1);
  });

  it("demands a named actor", async () => {
    await expect(svc.postFeeCollection(feeInput(), SIGNED_OUT)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("recordIncome and payroll", () => {
  it("records income against Other Income", async () => {
    const { journalId } = await svc.recordIncome(incomeInput(), ACTOR);
    const journal = store.journal(journalId);
    expect(journal?.kind).toBe("income");
    expect(journal?.entries.find((entry) => entry.direction === "out")?.accountName).toBe(
      "Other Income",
    );
    expect(journal?.entries.find((entry) => entry.direction === "in")?.accountName).toBe(
      "Cash in Hand",
    );
  });

  it("posts payroll as its own kind, which today counts toward no dashboard bucket", async () => {
    const { journalId } = await svc.postPayrollCollection(payrollInput(), ACTOR);
    const journal = store.journal(journalId);
    expect(journal?.kind).toBe("salary_payment");
    expect(journal?.payrollRunId).not.toBeNull();

    const overview = await svc.getOverview({ institutionId: INST });
    expect(overview.expenseTotal).toBe("0.00");
    expect(overview.byKind.find((row) => row.kind === "salary_payment")?.total).toBe("800.00");
  });

  it("refuses an unsupported currency before the ledger is touched", async () => {
    await expect(svc.recordIncome(incomeInput({ currency: "XXX" }), ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.journalsOf(INST)).toHaveLength(0);
  });
});

describe("expense lifecycle", () => {
  it("walks draft → submitted → approved → paid, posting the journal on approval", async () => {
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    const created = await svc.createExpense(expenseInput({ expenseHeadId: head.id }), ACTOR);
    expect(created.version).toBe(1);
    expect(store.expense(created.id)?.status).toBe("draft");
    expect(store.expense(created.id)?.journalTransactionId).toBeNull();

    const submitted = await svc.submitExpense(transitionInput(created.id, 1), ACTOR);
    expect(submitted.version).toBe(2);

    const approved = await svc.approveExpense(transitionInput(created.id, 2), ACTOR);
    expect(approved.version).toBe(3);

    const afterApproval = store.expense(created.id);
    expect(afterApproval?.status).toBe("approved");
    expect(afterApproval?.approvedByUserId).toBe(ACTOR.userId);
    expect(afterApproval?.approvedAt).toBeInstanceOf(Date);
    expect(afterApproval?.journalTransactionId).not.toBeNull();

    // The journal money will leave on: the head's category debited, cash credited.
    const journal = store.journal(afterApproval?.journalTransactionId ?? "");
    expect(journal?.kind).toBe("expense");
    expect(journal?.totalAmount).toBe("450.00");
    const debit = journal?.entries.find((entry) => entry.direction === "in");
    const credit = journal?.entries.find((entry) => entry.direction === "out");
    expect(debit?.accountName).toBe("Operating Expenses");
    expect(debit?.category).toBe("supplies");
    expect(credit?.accountName).toBe("Cash in Hand");
    expect(credit?.category).toBeNull();

    const paid = await svc.markExpensePaid(transitionInput(created.id, 3), ACTOR);
    expect(paid.version).toBe(4);
    expect(store.expense(created.id)?.status).toBe("paid");
  });

  it("refuses to approve an expense that was never submitted", async () => {
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    const created = await svc.createExpense(expenseInput({ expenseHeadId: head.id }), ACTOR);
    await expect(
      svc.approveExpense(transitionInput(created.id, created.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store.expense(created.id)?.journalTransactionId).toBeNull();
  });

  it("refuses a repeated move, an out-of-order move, and every move out of a terminal state", async () => {
    const submitted = await draftExpense();
    // Repeated: it is already submitted.
    await expect(
      svc.submitExpense(transitionInput(submitted.id, submitted.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    // Out of order: money cannot leave before approval.
    await expect(
      svc.markExpensePaid(transitionInput(submitted.id, submitted.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    const approved = await svc.approveExpense(
      transitionInput(submitted.id, submitted.version),
      ACTOR,
    );
    const paid = await svc.markExpensePaid(transitionInput(submitted.id, approved.version), ACTOR);
    expect(store.expense(submitted.id)?.status).toBe("paid");

    // `paid` is terminal: nothing moves it, not even back to approval.
    await expect(
      svc.submitExpense(transitionInput(submitted.id, paid.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      svc.approveExpense(transitionInput(submitted.id, paid.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      svc.rejectExpense(transitionInput(submitted.id, paid.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    // `rejected` is terminal too.
    const head = await svc.createExpenseHead(headInput({ name: "Transport" }), ACTOR);
    const draft = await svc.createExpense(expenseInput({ expenseHeadId: head.id }), ACTOR);
    const rejected = await svc.rejectExpense(transitionInput(draft.id, 1), ACTOR);
    expect(store.expense(draft.id)?.status).toBe("rejected");
    await expect(
      svc.submitExpense(transitionInput(draft.id, rejected.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      svc.approveExpense(transitionInput(draft.id, rejected.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses a write carrying a stale version", async () => {
    const { id, version } = await draftExpense();
    // The transition itself is legal (submitted → approved); only the row has moved on.
    const stale = version - 1;
    await expect(svc.approveExpense(transitionInput(id, stale), ACTOR)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(store.expense(id)?.status).toBe("submitted");
  });

  it("refuses an approval whose incurred date sits in a closed period", async () => {
    store.seedPeriod({
      institutionId: INST,
      name: "FY2026",
      startsOn: "2026-04-01",
      endsOn: "2026-06-30",
      closedAt: new Date("2026-07-01T00:00:00Z"),
    });
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    // A draft may be raised against any date — no money has moved yet.
    const created = await svc.createExpense(
      expenseInput({ expenseHeadId: head.id, incurredOn: "2026-06-15" }),
      ACTOR,
    );
    const submitted = await svc.submitExpense(transitionInput(created.id, 1), ACTOR);
    await expect(
      svc.approveExpense(transitionInput(created.id, submitted.version), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store.expense(created.id)?.journalTransactionId).toBeNull();
  });

  it("refuses an expense against a deactivated head", async () => {
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    await svc.setExpenseHeadActive(
      { institutionId: INST, expenseHeadId: head.id, isActive: false, expectedVersion: 1 },
      ACTOR,
    );
    await expect(
      svc.createExpense(expenseInput({ expenseHeadId: head.id }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses implausible dates and a non-positive amount at the boundary", async () => {
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    await expect(
      svc.createExpense(expenseInput({ expenseHeadId: head.id, incurredOn: "1999-12-31" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.createExpense(expenseInput({ expenseHeadId: head.id, incurredOn: "2999-01-01" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.createExpense(expenseInput({ expenseHeadId: head.id, amount: "0.00" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.createExpense(expenseInput({ expenseHeadId: head.id, amount: "-5.00" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.journalsOf(INST)).toHaveLength(0);
  });

  it("demands a named actor on every write", async () => {
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    const created = await svc.createExpense(expenseInput({ expenseHeadId: head.id }), ACTOR);
    const submitted = await svc.submitExpense(transitionInput(created.id, 1), ACTOR);
    const { journalId } = await svc.recordIncome(incomeInput(), ACTOR);

    const writes: readonly (readonly [string, () => Promise<unknown>])[] = [
      ["postFeeCollection", () => svc.postFeeCollection(feeInput(), SIGNED_OUT)],
      ["postPayrollCollection", () => svc.postPayrollCollection(payrollInput(), SIGNED_OUT)],
      ["recordIncome", () => svc.recordIncome(incomeInput(), SIGNED_OUT)],
      [
        "reverseJournal",
        () =>
          svc.reverseJournal({ institutionId: INST, journalId, reason: "Wrong date" }, SIGNED_OUT),
      ],
      [
        "createExpense",
        () => svc.createExpense(expenseInput({ expenseHeadId: head.id }), SIGNED_OUT),
      ],
      ["submitExpense", () => svc.submitExpense(transitionInput(created.id, 1), SIGNED_OUT)],
      [
        "approveExpense",
        () => svc.approveExpense(transitionInput(created.id, submitted.version), SIGNED_OUT),
      ],
      ["markExpensePaid", () => svc.markExpensePaid(transitionInput(created.id, 2), SIGNED_OUT)],
      ["rejectExpense", () => svc.rejectExpense(transitionInput(created.id, 1), SIGNED_OUT)],
      [
        "createExpenseHead",
        () => svc.createExpenseHead(headInput({ name: "Transport" }), SIGNED_OUT),
      ],
      [
        "setExpenseHeadActive",
        () =>
          svc.setExpenseHeadActive(
            { institutionId: INST, expenseHeadId: head.id, isActive: false, expectedVersion: 1 },
            SIGNED_OUT,
          ),
      ],
      [
        "createAccount",
        () =>
          svc.createAccount(
            {
              institutionId: INST,
              name: "Petty Cash",
              accountType: "cash",
              currency: "PKR",
              bankName: null,
              accountNumber: null,
              iban: null,
              openedOn: null,
              isActive: true,
            },
            SIGNED_OUT,
          ),
      ],
    ];

    for (const [subject, write] of writes) {
      await expect(write(), `every write must demand an actor: ${subject}`).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    // Nothing slipped through: only the one income journal this test prepared exists.
    expect(store.journalsOf(INST)).toHaveLength(1);
    expect(store.expense(created.id)?.status).toBe("submitted");
  });
});

describe("reverseJournal", () => {
  it("writes the mirror and marks the original reversed, without deleting anything", async () => {
    const { journalId } = await svc.recordIncome(incomeInput(), ACTOR);
    const original = store.journal(journalId);
    expect(original?.status).toBe("posted");

    const result = await svc.reverseJournal(
      { institutionId: INST, journalId, reason: "Recorded in error" },
      ACTOR,
    );
    expect(result.reversesTransactionId).toBe(journalId);

    const reversal = store.journal(result.journalId);
    expect(reversal?.kind).toBe("income");
    expect(reversal?.reversesTransactionId).toBe(journalId);
    expect(reversal?.referenceNumber).toBe("JV-000002");
    expect(reversal?.totalAmount).toBe("1000.00");
    expect(reversal?.description).toContain("Recorded in error");

    // Entries swapped, nothing removed: the original still reads exactly as it was written.
    const originalAfter = store.journal(journalId);
    expect(originalAfter?.status).toBe("reversed");
    expect(originalAfter?.reversedAt).toBeInstanceOf(Date);
    expect(originalAfter?.entries.map((entry) => entry.direction)).toEqual(
      reversal?.entries
        .map((entry) => entry.direction)
        .map((direction) => (direction === "in" ? "out" : "in")),
    );
    expect(store.journalsOf(INST)).toHaveLength(2);
  });

  it("refuses a fee collection, naming the refund that can correct it", async () => {
    const { journalId } = await svc.postFeeCollection(feeInput(), ACTOR);
    const failure = await svc
      .reverseJournal({ institutionId: INST, journalId, reason: "Wrong student" }, ACTOR)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BusinessRuleError);
    expect((failure as BusinessRuleError).userMessage).toContain("refund");
    expect(store.journal(journalId)?.status).toBe("posted");
  });

  it("refuses a reason too short to explain the correction", async () => {
    const { journalId } = await svc.recordIncome(incomeInput(), ACTOR);
    await expect(
      svc.reverseJournal({ institutionId: INST, journalId, reason: "ok" }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.journal(journalId)?.status).toBe("posted");
  });

  it("refuses a journal this institution does not own", async () => {
    await expect(
      svc.reverseJournal({ institutionId: INST, journalId: GHOST, reason: "Missing" }, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("configuration", () => {
  const accountInput = (overrides: Record<string, unknown> = {}) => ({
    institutionId: INST,
    name: "Petty Cash",
    accountType: "cash",
    currency: "PKR",
    bankName: null,
    accountNumber: null,
    iban: null,
    openedOn: null,
    isActive: true,
    ...overrides,
  });

  it("owns no accounts until the first posting provisions the defaults", async () => {
    expect(await svc.listAccounts({ institutionId: INST })).toEqual([]);
    await svc.postFeeCollection(feeInput(), ACTOR);

    const accounts = await svc.listAccounts({ institutionId: INST });
    expect(accounts.map((account) => account.name)).toEqual([
      "Bank Account",
      "Cash in Hand",
      "Fee Income",
      "Operating Expenses",
      "Other Income",
    ]);
    // Derived, not stored: the fee moved money into cash and recognised it as income.
    expect(accounts.find((account) => account.name === "Cash in Hand")?.balance).toBe("1500.00");
    expect(accounts.find((account) => account.name === "Fee Income")?.balance).toBe("1500.00");
    expect(accounts.find((account) => account.name === "Operating Expenses")?.balance).toBe("0.00");
  });

  it("refuses a duplicate account name or number", async () => {
    await svc.createAccount(accountInput(), ACTOR);
    await expect(svc.createAccount(accountInput(), ACTOR)).rejects.toBeInstanceOf(ConflictError);
    await svc.createAccount(accountInput({ name: "Bank Draft", accountNumber: "1234" }), ACTOR);
    await expect(
      svc.createAccount(accountInput({ name: "Bank Draft", accountNumber: "1234" }), ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      svc.createAccount(accountInput({ name: "Another", accountNumber: "1234" }), ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a bank account without its bank name, and an unsupported currency", async () => {
    await expect(
      svc.createAccount(accountInput({ name: "HBL", accountType: "bank" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.createAccount(accountInput({ name: "Foreign", currency: "XXX" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a duplicate expense head and a stale activation write", async () => {
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    await expect(svc.createExpenseHead(headInput(), ACTOR)).rejects.toBeInstanceOf(ConflictError);
    await expect(
      svc.setExpenseHeadActive(
        { institutionId: INST, expenseHeadId: head.id, isActive: false, expectedVersion: 99 },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("reads", () => {
  it("lists journals newest first, filtered and paginated", async () => {
    await svc.recordIncome(incomeInput({ amount: "100.00", transactionOn: "2026-07-01" }), ACTOR);
    await svc.recordIncome(incomeInput({ amount: "200.00", transactionOn: "2026-08-01" }), ACTOR);
    await svc.postFeeCollection(feeInput({ transactionOn: "2026-09-01" }), ACTOR);

    const page1 = await svc.listJournals({ institutionId: INST, page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page1.rows[0]?.transactionOn).toBe("2026-09-01");

    const page2 = await svc.listJournals({ institutionId: INST, page: 2, pageSize: 2 });
    expect(page2.rows).toHaveLength(1);
    expect(page2.total).toBe(3);

    const incomeOnly = await svc.listJournals({ institutionId: INST, kind: "income" });
    expect(incomeOnly.total).toBe(2);

    const searched = await svc.listJournals({ institutionId: INST, search: "JV-000003" });
    expect(searched.total).toBe(1);
    expect(searched.rows[0]?.kind).toBe("fee_collection");
  });

  it("scopes every read to its institution", async () => {
    const { journalId } = await svc.recordIncome(incomeInput(), ACTOR);
    const head = await svc.createExpenseHead(headInput(), ACTOR);
    const created = await svc.createExpense(expenseInput({ expenseHeadId: head.id }), ACTOR);

    await expect(svc.getJournal({ institutionId: randomUUID(), journalId })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      svc.getExpense({ institutionId: randomUUID(), expenseId: created.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await svc.listJournals({ institutionId: randomUUID() })).toMatchObject({ total: 0 });
    expect(store.journal(journalId)).not.toBeNull();
  });

  it("lists expenses by status and heads by activation", async () => {
    const activeHead = await svc.createExpenseHead(headInput({ name: "Transport" }), ACTOR);
    const dormantHead = await svc.createExpenseHead(
      headInput({ name: "Marketing", category: "marketing" }),
      ACTOR,
    );
    await svc.createExpense(expenseInput({ expenseHeadId: activeHead.id }), ACTOR);

    const drafts = await svc.listExpenses({ institutionId: INST, status: "draft" });
    expect(drafts.total).toBe(1);
    expect(drafts.rows[0]?.expenseHeadName).toBe("Transport");

    const submitted = await svc.listExpenses({ institutionId: INST, status: "submitted" });
    expect(submitted.total).toBe(0);

    expect(await svc.listExpenseHeads({ institutionId: INST, isActive: true })).toHaveLength(2);
    await svc.setExpenseHeadActive(
      { institutionId: INST, expenseHeadId: dormantHead.id, isActive: false, expectedVersion: 1 },
      ACTOR,
    );
    expect(await svc.listExpenseHeads({ institutionId: INST, isActive: true })).toHaveLength(1);
    expect(await svc.listExpenseHeads({ institutionId: INST, isActive: false })).toHaveLength(1);
  });

  it("defaults pagination to the first page of fifty", async () => {
    await svc.recordIncome(incomeInput(), ACTOR);
    const page = await svc.listJournals({ institutionId: INST, page: "2" });
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(50);
  });
});

describe("getOverview", () => {
  const now = new Date();
  const thisMonth = calendarDateString(now).slice(0, 7);
  const lastMonthOn = calendarDateString(new Date(now.getFullYear(), now.getMonth() - 1, 5));
  const lastMonth = lastMonthOn.slice(0, 7);

  it("sums income and expense, bucketed by month, kind and expense category", async () => {
    await svc.recordIncome(incomeInput({ amount: "1000.00", transactionOn: lastMonthOn }), ACTOR);

    const head = await svc.createExpenseHead(headInput(), ACTOR);
    const created = await svc.createExpense(
      expenseInput({ expenseHeadId: head.id, amount: "450.00", incurredOn: lastMonthOn }),
      ACTOR,
    );
    const submitted = await svc.submitExpense(transitionInput(created.id, 1), ACTOR);
    await svc.approveExpense(transitionInput(created.id, submitted.version), ACTOR);

    const overview = await svc.getOverview({ institutionId: INST });
    expect(overview.currency).toBe("PKR");
    expect(overview.incomeTotal).toBe("1000.00");
    expect(overview.expenseTotal).toBe("450.00");
    expect(overview.netPosition).toBe("550.00");

    // Six trailing months, oldest first, ending at the current month.
    const window = monthKeysEndingAt(thisMonth, 6);
    expect(overview.monthly.map((row) => row.month)).toEqual([...window]);
    const prior = overview.monthly.find((row) => row.month === lastMonth);
    expect(prior).toEqual({
      month: lastMonth,
      income: "1000.00",
      expense: "450.00",
      net: "550.00",
    });
    expect(overview.monthly.find((row) => row.month === thisMonth)).toEqual({
      month: thisMonth,
      income: "0.00",
      expense: "0.00",
      net: "0.00",
    });

    expect(overview.byKind).toEqual([
      { kind: "expense", total: "450.00" },
      { kind: "income", total: "1000.00" },
    ]);
    expect(overview.byExpenseCategory).toEqual([{ category: "supplies", total: "450.00" }]);
  });

  it("cancels a reversal without rewriting the month that was already reported", async () => {
    const { journalId } = await svc.recordIncome(
      incomeInput({ transactionOn: lastMonthOn }),
      ACTOR,
    );

    const before = await svc.getOverview({ institutionId: INST });
    expect(before.incomeTotal).toBe("1000.00");

    const reversal = await svc.reverseJournal(
      { institutionId: INST, journalId, reason: "Wrong payer" },
      ACTOR,
    );
    const after = await svc.getOverview({ institutionId: INST });

    // All-time figures net to zero: the correction has undone the income.
    expect(after.incomeTotal).toBe("0.00");
    expect(after.netPosition).toBe("0.00");
    expect(after.byKind.find((row) => row.kind === "income")?.total).toBe("0.00");

    // History is not rewritten — the prior month keeps its figure and the month that carried
    // the correction shows the cancellation, which is what a reversal means in a ledger.
    expect(after.monthly.find((row) => row.month === lastMonth)?.income).toBe("1000.00");
    expect(after.monthly.find((row) => row.month === thisMonth)?.income).toBe("-1000.00");
    expect(reversal.reversesTransactionId).toBe(journalId);
  });

  it("keeps another institution's journals out of the figures", async () => {
    await svc.recordIncome(incomeInput({ transactionOn: lastMonthOn }), ACTOR);
    const other = createFinanceService(store);
    const overview = await other.getOverview({ institutionId: randomUUID() });
    expect(overview.incomeTotal).toBe("0.00");
    expect(overview.expenseTotal).toBe("0.00");
    expect(overview.currency).toBe("PKR");
  });
});
