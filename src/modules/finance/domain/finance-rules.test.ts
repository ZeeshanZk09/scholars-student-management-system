/**
 * Finance domain rules (`PRD.md` MODULE 7, `src/db/schema/finance.ts`, `ARCHITECTURE.md` §21/§54).
 *
 * The zero-sum invariant, the derived balance, the expense state machine, the reversal rules and
 * the reporting arithmetic are asserted against the schema's own comments rather than against a
 * mirror of the implementation: a relaxed invariant here lets an unbalanced journal reach the
 * ledger, an expense skip review before money leaves, or a reversed month still count as income
 * — none of which a `CHECK` constraint can catch, because they are all aggregates or edges.
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, InternalError, ValidationError } from "@/shared/errors";
import { fromDecimalText, toDecimalText } from "@/shared/money";

import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  DEFAULT_ACCOUNTS,
  DIRECTIONS,
  DIRECTION_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  EXPENSE_TRANSITIONS,
  JOURNAL_KINDS,
  JOURNAL_KIND_LABELS,
  JOURNAL_STATUSES,
  JOURNAL_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  REVERSIBLE_JOURNAL_KINDS,
  SUPPORTED_CURRENCIES,
  accountBalance,
  assertExpenseTransition,
  assertJournalBalanced,
  assertPlausibleDate,
  assertReversalAllowed,
  assertSupportedCurrency,
  canTransitionExpense,
  closedPeriodError,
  defaultAccount,
  defaultAccountKeyForMethod,
  findClosedPeriod,
  journalTotals,
  monthKey,
  monthKeysEndingAt,
  overviewContribution,
  positiveAmount,
  reversalEntries,
  type AccountType,
  type JournalEntryDraft,
  type TransactionDirection,
} from "./finance-rules";

const entry = (
  direction: TransactionDirection,
  amount: string,
  overrides: Partial<JournalEntryDraft> = {},
): JournalEntryDraft => ({
  accountId: "account-1",
  direction,
  amount,
  currency: "PKR",
  category: null,
  feeCategory: null,
  description: null,
  ...overrides,
});

/** A balanced pair — the smallest journal the ledger can hold. */
const balanced = (): readonly JournalEntryDraft[] => [
  entry("in", "10000.00"),
  entry("out", "10000.00", { accountId: "account-2" }),
];

describe("finance vocabulary", () => {
  it("labels every enum member", () => {
    for (const direction of DIRECTIONS) expect(DIRECTION_LABELS[direction]).not.toBe("");
    for (const type of ACCOUNT_TYPES) expect(ACCOUNT_TYPE_LABELS[type]).not.toBe("");
    for (const kind of JOURNAL_KINDS) expect(JOURNAL_KIND_LABELS[kind]).not.toBe("");
    for (const status of JOURNAL_STATUSES) expect(JOURNAL_STATUS_LABELS[status]).not.toBe("");
    for (const status of EXPENSE_STATUSES) expect(EXPENSE_STATUS_LABELS[status]).not.toBe("");
    for (const category of EXPENSE_CATEGORIES) {
      expect(EXPENSE_CATEGORY_LABELS[category]).not.toBe("");
    }
    for (const method of PAYMENT_METHODS) expect(PAYMENT_METHOD_LABELS[method]).not.toBe("");
    expect(ACCOUNT_TYPE_LABELS.mobile_wallet).toBe("Mobile wallet");
    expect(JOURNAL_KIND_LABELS.fee_collection).toBe("Fee collection");
    expect(PAYMENT_METHOD_LABELS.bank_transfer).toBe("Bank transfer");
    expect(EXPENSE_CATEGORY_LABELS.utilities).toBe("Utilities");
  });

  it("pins the account-type vocabulary, including the nominal accounts", () => {
    expect(ACCOUNT_TYPES).toEqual([
      "bank",
      "cash",
      "mobile_wallet",
      "cheque",
      "other",
      "income",
      "expense",
    ]);
  });

  it("pins the supported currency set", () => {
    expect(SUPPORTED_CURRENCIES).toEqual(["PKR", "USD", "GBP", "EUR", "AED", "SAR"]);
    expect(() => assertSupportedCurrency("PKR")).not.toThrow();
    expect(() => assertSupportedCurrency("PK")).toThrow(ValidationError);
    expect(() => assertSupportedCurrency("XXX")).toThrow(ValidationError);
  });

  it("reports an unsupported currency as a field message", () => {
    try {
      assertSupportedCurrency("XXX");
      expect.unreachable("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.currency).toBeDefined();
    }
  });
});

describe("default chart of accounts", () => {
  it("offers exactly the five provisioned rows, keyed uniquely", () => {
    expect(DEFAULT_ACCOUNTS.map((account) => account.key)).toEqual([
      "cash",
      "bank",
      "feeIncome",
      "otherIncome",
      "operatingExpenses",
    ]);
    const names = DEFAULT_ACCOUNTS.map((account) => account.name);
    expect(new Set(names).size).toBe(names.length);
    expect(defaultAccount("cash").name).toBe("Cash in Hand");
    expect(defaultAccount("feeIncome").accountType).toBe("income");
    expect(defaultAccount("operatingExpenses").accountType).toBe("expense");
  });

  it("types the bank placeholder as `other` so it needs no bank name", () => {
    // `financial_accounts_bank_detail_check` requires a `bankName` for every `bank` row; a
    // default has none, so it must not claim to be one.
    expect(defaultAccount("bank").accountType).toBe("other");
    expect(defaultAccount("bank").name).toBe("Bank Account");
  });

  it("refuses an unknown key as an internal failure rather than a user message", () => {
    // Unreachable through the type system; asserted so a future key added to the union without a
    // row fails here rather than in a posting path.
    expect(() => defaultAccount("nope" as never)).toThrow(InternalError);
  });

  it("routes each payment method to a plausible default account", () => {
    expect(defaultAccountKeyForMethod("cash")).toBe("cash");
    expect(defaultAccountKeyForMethod("other")).toBe("cash");
    expect(defaultAccountKeyForMethod("bank_transfer")).toBe("bank");
    expect(defaultAccountKeyForMethod("cheque")).toBe("bank");
    expect(defaultAccountKeyForMethod("card")).toBe("bank");
    expect(defaultAccountKeyForMethod("online_gateway")).toBe("bank");
  });
});

describe("the zero-sum invariant", () => {
  it("accepts a balanced journal and returns its totals", () => {
    const totals = assertJournalBalanced(balanced());
    expect(toDecimalText(totals.inTotal)).toBe("10000.00");
    expect(toDecimalText(totals.outTotal)).toBe("10000.00");
  });

  it("rejects an unbalanced journal", () => {
    expect(() => assertJournalBalanced([entry("in", "10000.00"), entry("out", "9000.00")])).toThrow(
      BusinessRuleError,
    );
  });

  it("rejects a single-entry journal", () => {
    expect(() => assertJournalBalanced([entry("in", "10000.00")])).toThrow(BusinessRuleError);
  });

  it("rejects an empty journal", () => {
    expect(() => assertJournalBalanced([])).toThrow(BusinessRuleError);
    expect(() => journalTotals([])).toThrow(ValidationError);
  });

  it("rejects a mixed-currency journal instead of adding across currencies", () => {
    expect(() =>
      assertJournalBalanced([
        entry("in", "100.00", { currency: "PKR" }),
        entry("out", "100.00", { currency: "USD" }),
      ]),
    ).toThrow(BusinessRuleError);
  });

  it("rejects a zero or negative amount — the sign lives in `direction`", () => {
    expect(() => assertJournalBalanced([entry("in", "0.00"), entry("out", "0.00")])).toThrow(
      ValidationError,
    );
    expect(() => assertJournalBalanced([entry("in", "-100.00"), entry("out", "-100.00")])).toThrow(
      ValidationError,
    );
  });

  it("rejects an amount that is not plain decimal text", () => {
    expect(() => assertJournalBalanced([entry("in", "1e3"), entry("out", "1e3")])).toThrow(
      ValidationError,
    );
  });

  it("rejects a one-sided journal even when the sides are equal in size", () => {
    // Two entries on the same side: `SUM(in) = 200` vs `SUM(out) = 0`.
    expect(() => assertJournalBalanced([entry("in", "100.00"), entry("in", "100.00")])).toThrow(
      BusinessRuleError,
    );
  });
});

describe("account balances are derived, never stored", () => {
  const totals = {
    inTotal: fromDecimalText("500.00", "PKR"),
    outTotal: fromDecimalText("200.00", "PKR"),
  };

  it("adds money in for asset and expense accounts", () => {
    const assetTypes: readonly AccountType[] = ["bank", "cash", "mobile_wallet", "cheque", "other"];
    for (const type of assetTypes) {
      expect(toDecimalText(accountBalance(type, totals))).toBe("300.00");
    }
    expect(toDecimalText(accountBalance("expense", totals))).toBe("300.00");
  });

  it("recognises income on the credit side", () => {
    expect(toDecimalText(accountBalance("income", totals))).toBe("-300.00");
  });

  it("returns a negative balance rather than flooring it at zero", () => {
    const overdrawn = {
      inTotal: fromDecimalText("100.00", "PKR"),
      outTotal: fromDecimalText("400.00", "PKR"),
    };
    expect(toDecimalText(accountBalance("cash", overdrawn))).toBe("-300.00");
  });

  it("parses a strictly positive amount", () => {
    expect(toDecimalText(positiveAmount("10.00", "PKR"))).toBe("10.00");
    expect(() => positiveAmount("0.00", "PKR")).toThrow(ValidationError);
    expect(() => positiveAmount("-1.00", "PKR")).toThrow(ValidationError);
  });
});

describe("expense state machine", () => {
  it("walks the happy path", () => {
    expect(canTransitionExpense("draft", "submitted")).toBe(true);
    expect(canTransitionExpense("submitted", "approved")).toBe(true);
    expect(canTransitionExpense("approved", "paid")).toBe(true);
    for (const [from, to] of [
      ["draft", "submitted"],
      ["submitted", "approved"],
      ["approved", "paid"],
      ["draft", "rejected"],
      ["submitted", "rejected"],
    ] as const) {
      expect(() => assertExpenseTransition(from, to)).not.toThrow();
    }
  });

  it("refuses a jump from draft straight to approval", () => {
    expect(() => assertExpenseTransition("draft", "approved")).toThrow(BusinessRuleError);
    expect(() => assertExpenseTransition("draft", "paid")).toThrow(BusinessRuleError);
  });

  it("treats `paid` and `rejected` as terminal", () => {
    expect(EXPENSE_TRANSITIONS.paid).toEqual([]);
    expect(EXPENSE_TRANSITIONS.rejected).toEqual([]);
    for (const status of EXPENSE_STATUSES) {
      expect(canTransitionExpense("paid", status)).toBe(false);
      expect(canTransitionExpense("rejected", status)).toBe(false);
    }
    expect(() => assertExpenseTransition("paid", "approved")).toThrow(BusinessRuleError);
  });

  it("refuses a self-transition with a distinct message", () => {
    try {
      assertExpenseTransition("approved", "approved");
      expect.unreachable("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).details).toMatchObject({ from: "approved" });
      expect((error as BusinessRuleError).userMessage).toContain("already approved");
    }
  });
});

describe("reversal instead of deletion", () => {
  it("pins the reversible kinds", () => {
    expect(REVERSIBLE_JOURNAL_KINDS).toEqual(["expense", "income", "adjustment"]);
  });

  it("permits a posted expense, income or adjustment", () => {
    for (const kind of REVERSIBLE_JOURNAL_KINDS) {
      expect(() => assertReversalAllowed({ kind, status: "posted" })).not.toThrow();
    }
  });

  it("sends a fee-collection reversal to the refund command", () => {
    try {
      assertReversalAllowed({ kind: "fee_collection", status: "posted" });
      expect.unreachable("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect((error as BusinessRuleError).userMessage.toLowerCase()).toContain("refund");
    }
  });

  it("refuses the kinds this module does not own a counterpart for", () => {
    expect(() => assertReversalAllowed({ kind: "salary_payment", status: "posted" })).toThrow(
      BusinessRuleError,
    );
    expect(() => assertReversalAllowed({ kind: "refund", status: "posted" })).toThrow(
      BusinessRuleError,
    );
  });

  it("refuses a journal that is not posted", () => {
    expect(() => assertReversalAllowed({ kind: "expense", status: "draft" })).toThrow(
      BusinessRuleError,
    );
    expect(() => assertReversalAllowed({ kind: "income", status: "reversed" })).toThrow(
      BusinessRuleError,
    );
  });

  it("swaps every direction and keeps the journal balanced", () => {
    const reversed = reversalEntries(balanced());
    expect(reversed.map((line) => line.direction)).toEqual(["out", "in"]);
    expect(reversed.map((line) => line.amount)).toEqual(["10000.00", "10000.00"]);
    expect(reversed.map((line) => line.accountId)).toEqual(["account-1", "account-2"]);
    const totals = assertJournalBalanced(reversed);
    expect(toDecimalText(totals.inTotal)).toBe("10000.00");
  });

  it("refuses to reverse an unbalanced journal", () => {
    expect(() => reversalEntries([entry("in", "100.00"), entry("out", "90.00")])).toThrow(
      BusinessRuleError,
    );
  });
});

describe("closed periods", () => {
  const periods = [
    {
      name: "2026-08",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      closedAt: new Date("2026-09-05T00:00:00Z"),
    },
    { name: "2026-09", startsOn: "2026-09-01", endsOn: "2026-09-30", closedAt: null },
  ];

  it("finds a closed period covering the date", () => {
    expect(findClosedPeriod(periods, "2026-08-15")?.name).toBe("2026-08");
    expect(findClosedPeriod(periods, "2026-08-31")?.name).toBe("2026-08");
  });

  it("ignores an open period and dates outside every window", () => {
    expect(findClosedPeriod(periods, "2026-09-15")).toBeNull();
    expect(findClosedPeriod(periods, "2026-07-31")).toBeNull();
    expect(findClosedPeriod([], "2026-08-15")).toBeNull();
  });

  it("names the fix in its user-facing message", () => {
    expect(closedPeriodError("2026-08-15").userMessage).toContain("Reopen");
  });
});

describe("transaction dates", () => {
  const today = new Date(2026, 9, 9); // 2026-10-09 local

  it("accepts a plausible date, including back-dating", () => {
    expect(() => assertPlausibleDate("2026-10-09", today, "incurredOn")).not.toThrow();
    expect(() => assertPlausibleDate("2026-09-01", today, "incurredOn")).not.toThrow();
    expect(() => assertPlausibleDate("2027-10-09", today, "incurredOn")).not.toThrow();
  });

  it("refuses a date before 2000 or more than a year ahead", () => {
    expect(() => assertPlausibleDate("1999-12-31", today, "incurredOn")).toThrow(ValidationError);
    expect(() => assertPlausibleDate("2027-10-10", today, "incurredOn")).toThrow(ValidationError);
    expect(() => assertPlausibleDate("2999-01-01", today, "incurredOn")).toThrow(ValidationError);
  });

  it("reports the offending field", () => {
    try {
      assertPlausibleDate("1999-12-31", today, "incurredOn");
      expect.unreachable("expected a rejection");
    } catch (error) {
      expect((error as ValidationError).fieldErrors.incurredOn).toBeDefined();
    }
  });
});

describe("monthly buckets", () => {
  it("takes the yyyy-mm prefix of a date", () => {
    expect(monthKey("2026-10-09")).toBe("2026-10");
  });

  it("zero-fills a trailing window, oldest first", () => {
    expect(monthKeysEndingAt("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(monthKeysEndingAt("2026-10", 1)).toEqual(["2026-10"]);
    expect(monthKeysEndingAt("2026-10", 13).slice(0, 2)).toEqual(["2025-10", "2025-11"]);
  });

  it("refuses a malformed anchor or a non-positive count", () => {
    expect(() => monthKeysEndingAt("2026", 3)).toThrow(ValidationError);
    expect(() => monthKeysEndingAt("2026-10", 0)).toThrow(ValidationError);
  });
});

describe("overview arithmetic", () => {
  it("counts fee collection and income as income, expenses as expense", () => {
    const fee = overviewContribution({
      kind: "fee_collection",
      reversesTransactionId: null,
      amount: "10000.00",
      currency: "PKR",
    });
    expect(toDecimalText(fee.income)).toBe("10000.00");
    expect(toDecimalText(fee.expense)).toBe("0.00");

    const expense = overviewContribution({
      kind: "expense",
      reversesTransactionId: null,
      amount: "2500.00",
      currency: "PKR",
    });
    expect(toDecimalText(expense.income)).toBe("0.00");
    expect(toDecimalText(expense.expense)).toBe("2500.00");
  });

  it("subtracts a refund from income", () => {
    const refund = overviewContribution({
      kind: "refund",
      reversesTransactionId: null,
      amount: "1000.00",
      currency: "PKR",
    });
    expect(toDecimalText(refund.income)).toBe("-1000.00");
  });

  it("nets a reversal against the month it lands in", () => {
    const reversal = overviewContribution({
      kind: "income",
      reversesTransactionId: "journal-original",
      amount: "4000.00",
      currency: "PKR",
    });
    expect(toDecimalText(reversal.income)).toBe("-4000.00");

    const refundReversal = overviewContribution({
      kind: "refund",
      reversesTransactionId: "journal-refund",
      amount: "500.00",
      currency: "PKR",
    });
    expect(toDecimalText(refundReversal.income)).toBe("500.00");
  });

  it("keeps adjustment, opening balance and salary payment out of both buckets", () => {
    for (const kind of ["adjustment", "opening_balance", "salary_payment"] as const) {
      const contribution = overviewContribution({
        kind,
        reversesTransactionId: null,
        amount: "900.00",
        currency: "PKR",
      });
      expect(toDecimalText(contribution.income)).toBe("0.00");
      expect(toDecimalText(contribution.expense)).toBe("0.00");
    }
  });
});
