/**
 * Fee domain rules (`PRD.md` MODULE 6, `src/db/schema/fees.ts`, `ADR-0003`).
 *
 * The overdue boundary, the money rules and the two cross-row guards are asserted against the
 * enum and the schema's own comments rather than a mirror of the implementation: a relaxed
 * boundary here lets a family be chased for money on the day it is due, an over-allocated
 * payment silently settles more than was received, or an automatic path rewrite an issued
 * invoice — none of which a database constraint can catch.
 */
import { describe, expect, it } from "vitest";

import { InternalError, ValidationError } from "@/shared/errors";
import { fromDecimalText, sum, toDecimalText } from "@/shared/money";

import {
  CATEGORIES,
  CONCESSION_KINDS,
  FEE_FREQUENCIES,
  FEE_FREQUENCY_LABELS,
  FEE_STATUS_LABELS,
  FEE_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  applyConcessionToAmount,
  assertAllocationWithinPayment,
  assertIssuedInvoiceUntouched,
  calendarDateString,
  invoiceBalance,
  invoiceDisplayStatus,
  isDeferralActive,
  isEligibleForOverdue,
  splitInstallments,
} from "./fee-rules";

const TODAY = new Date(2026, 9, 8); // 2026-10-08 local

describe("fee vocabulary", () => {
  it("labels every enum member with a sentence-case label", () => {
    for (const status of FEE_STATUSES) {
      expect(FEE_STATUS_LABELS[status]).not.toBe("");
    }
    for (const method of PAYMENT_METHODS) {
      expect(PAYMENT_METHOD_LABELS[method]).not.toBe("");
    }
    for (const status of PAYMENT_STATUSES) {
      expect(PAYMENT_STATUS_LABELS[status]).not.toBe("");
    }
    for (const frequency of FEE_FREQUENCIES) {
      expect(FEE_FREQUENCY_LABELS[frequency]).not.toBe("");
    }
    expect(PAYMENT_METHOD_LABELS.bank_transfer).toBe("Bank transfer");
    expect(FEE_FREQUENCY_LABELS.one_time).toBe("One time");
    expect(FEE_STATUS_LABELS.partial).toBe("Partially paid");
  });

  it("exposes the display-status tuple as the invoice vocabulary", () => {
    expect(INVOICE_STATUSES).toEqual(FEE_STATUSES);
  });

  it("pins the category and concession vocabularies", () => {
    expect(CATEGORIES).toEqual([
      "admission",
      "tuition",
      "transport",
      "lab",
      "library",
      "exam",
      "uniform",
      "other",
    ]);
    expect(CONCESSION_KINDS).toEqual(["discount", "waiver", "scholarship", "sibling_discount"]);
  });
});

describe("invoiceDisplayStatus / isEligibleForOverdue", () => {
  it("keeps a pending invoice due today out of overdue — the family still has the day", () => {
    const dueOn = calendarDateString(TODAY);
    expect(isEligibleForOverdue("pending", dueOn, TODAY)).toBe(false);
    expect(invoiceDisplayStatus({ status: "pending", dueOn, deferredUntil: null }, TODAY)).toBe(
      "pending",
    );
  });

  it("flips pending and partial past-due invoices to overdue", () => {
    const dueOn = "2026-10-07";
    expect(isEligibleForOverdue("pending", dueOn, TODAY)).toBe(true);
    expect(isEligibleForOverdue("partial", dueOn, TODAY)).toBe(true);
    expect(invoiceDisplayStatus({ status: "pending", dueOn, deferredUntil: null }, TODAY)).toBe(
      "overdue",
    );
    expect(invoiceDisplayStatus({ status: "partial", dueOn, deferredUntil: null }, TODAY)).toBe(
      "overdue",
    );
  });

  it("never flips paid, waived, cancelled, overdue or deferred rows", () => {
    for (const status of ["paid", "waived", "cancelled", "overdue", "deferred"] as const) {
      expect(isEligibleForOverdue(status, "2020-01-01", TODAY)).toBe(false);
    }
  });

  it("never flips an invoice with no due date", () => {
    expect(isEligibleForOverdue("pending", null, TODAY)).toBe(false);
  });

  it("lets a live deferral win over the due date", () => {
    expect(isDeferralActive("2026-10-31", TODAY)).toBe(true);
    expect(isDeferralActive("2026-10-08", TODAY)).toBe(true);
    expect(isDeferralActive("2026-10-07", TODAY)).toBe(false);
    expect(isDeferralActive(null, TODAY)).toBe(false);
    expect(
      invoiceDisplayStatus(
        { status: "pending", dueOn: "2026-09-01", deferredUntil: "2026-10-31" },
        TODAY,
      ),
    ).toBe("pending");
  });

  it("re-exposes overdue once the deferral has expired", () => {
    expect(
      invoiceDisplayStatus(
        { status: "pending", dueOn: "2026-09-01", deferredUntil: "2026-10-07" },
        TODAY,
      ),
    ).toBe("overdue");
  });
});

describe("invoiceBalance", () => {
  it("returns the unallocated remainder", () => {
    const balance = invoiceBalance(
      fromDecimalText("500.00", "PKR"),
      fromDecimalText("120.50", "PKR"),
    );
    expect(toDecimalText(balance)).toBe("379.50");
  });

  it("floors at zero rather than inventing a credit", () => {
    const balance = invoiceBalance(
      fromDecimalText("100.00", "PKR"),
      fromDecimalText("150.00", "PKR"),
    );
    expect(toDecimalText(balance)).toBe("0.00");
    expect(balance.amountMinor).toBe(BigInt(0));
  });

  it("is zero when nothing is allocated against a zero invoice", () => {
    const balance = invoiceBalance(fromDecimalText("0.00", "PKR"), fromDecimalText("0.00", "PKR"));
    expect(toDecimalText(balance)).toBe("0.00");
  });

  it("subtracts live concessions before the remainder", () => {
    const balance = invoiceBalance(
      fromDecimalText("500.00", "PKR"),
      fromDecimalText("120.50", "PKR"),
      fromDecimalText("79.50", "PKR"),
    );
    expect(toDecimalText(balance)).toBe("300.00");
  });

  it("floors at zero when a concession alone clears the invoice", () => {
    const balance = invoiceBalance(
      fromDecimalText("100.00", "PKR"),
      fromDecimalText("0.00", "PKR"),
      fromDecimalText("150.00", "PKR"),
    );
    expect(toDecimalText(balance)).toBe("0.00");
    expect(balance.amountMinor).toBe(BigInt(0));
  });

  it("defaults the concession to zero so two-argument callers keep the old result", () => {
    const balance = invoiceBalance(
      fromDecimalText("500.00", "PKR"),
      fromDecimalText("120.50", "PKR"),
    );
    expect(toDecimalText(balance)).toBe("379.50");
  });
});

describe("applyConcessionToAmount", () => {
  it("nets a percentage concession, flooring the discount", () => {
    expect(toDecimalText(applyConcessionToAmount("100.00", { percentage: 10 }, "PKR"))).toBe(
      "90.00",
    );
    expect(toDecimalText(applyConcessionToAmount("10.00", { percentage: 33 }, "PKR"))).toBe("6.70");
  });

  it("treats 0% as no concession and 100% as free", () => {
    expect(toDecimalText(applyConcessionToAmount("250.00", { percentage: 0 }, "PKR"))).toBe(
      "250.00",
    );
    expect(toDecimalText(applyConcessionToAmount("250.00", { percentage: 100 }, "PKR"))).toBe(
      "0.00",
    );
  });

  it("clamps a fixed concession larger than the amount at zero", () => {
    expect(toDecimalText(applyConcessionToAmount("50.00", { amount: "80.00" }, "PKR"))).toBe(
      "0.00",
    );
  });

  it("nets a fixed concession and floors its own negativity", () => {
    expect(toDecimalText(applyConcessionToAmount("50.00", { amount: "12.50" }, "PKR"))).toBe(
      "37.50",
    );
    expect(() => applyConcessionToAmount("50.00", { amount: "-1.00" }, "PKR")).toThrow(
      ValidationError,
    );
  });

  it("refuses a percentage outside 0–100", () => {
    expect(() => applyConcessionToAmount("50.00", { percentage: 101 }, "PKR")).toThrow(
      ValidationError,
    );
    expect(() => applyConcessionToAmount("50.00", { percentage: -1 }, "PKR")).toThrow(
      ValidationError,
    );
    expect(() => applyConcessionToAmount("50.00", { percentage: 12.5 }, "PKR")).toThrow(
      ValidationError,
    );
  });

  it("refuses both bases and no basis", () => {
    expect(() =>
      applyConcessionToAmount("50.00", { percentage: 10, amount: "5.00" }, "PKR"),
    ).toThrow(ValidationError);
    expect(() => applyConcessionToAmount("50.00", {}, "PKR")).toThrow(ValidationError);
    expect(() =>
      applyConcessionToAmount("50.00", { percentage: null, amount: null }, "PKR"),
    ).toThrow(ValidationError);
  });
});

describe("splitInstallments", () => {
  it("gives the remainder to the last part and sums exactly (100.00 / 3)", () => {
    const parts = splitInstallments("100.00", 3, "PKR").map(toDecimalText);
    expect(parts).toEqual(["33.33", "33.33", "33.34"]);
    const total = sum(splitInstallments("100.00", 3, "PKR"), "PKR");
    expect(toDecimalText(total)).toBe("100.00");
  });

  it("splits evenly when the total divides", () => {
    expect(splitInstallments("90.00", 3, "PKR").map(toDecimalText)).toEqual([
      "30.00",
      "30.00",
      "30.00",
    ]);
  });

  it("handles a single part and an indivisible total", () => {
    expect(splitInstallments("75.07", 1, "PKR").map(toDecimalText)).toEqual(["75.07"]);
    expect(splitInstallments("0.01", 3, "PKR").map(toDecimalText)).toEqual([
      "0.00",
      "0.00",
      "0.01",
    ]);
  });

  it("refuses a non-positive or fractional count", () => {
    expect(() => splitInstallments("10.00", 0, "PKR")).toThrow(ValidationError);
    expect(() => splitInstallments("10.00", -2, "PKR")).toThrow(ValidationError);
    expect(() => splitInstallments("10.00", 2.5, "PKR")).toThrow(ValidationError);
  });
});

describe("assertAllocationWithinPayment", () => {
  it("allows partial and exactly-equal allocations", () => {
    expect(() => assertAllocationWithinPayment("100.00", "0.00", "40.00", "PKR")).not.toThrow();
    expect(() => assertAllocationWithinPayment("100.00", "60.00", "40.00", "PKR")).not.toThrow();
  });

  it("refuses an allocation past the payment amount", () => {
    try {
      assertAllocationWithinPayment("100.00", "60.00", "40.01", "PKR");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toBe("Allocation exceeds the payment amount.");
    }
  });

  it("refuses negative allocation amounts", () => {
    expect(() => assertAllocationWithinPayment("100.00", "0.00", "-0.01", "PKR")).toThrow(
      ValidationError,
    );
  });
});

describe("assertIssuedInvoiceUntouched", () => {
  const snapshot = {
    totalAmount: "100.00",
    lineIds: ["line-a", "line-b"],
    lineAmounts: { "line-a": "60.00", "line-b": "40.00" },
  };

  it("passes an identical snapshot regardless of line order", () => {
    expect(() =>
      assertIssuedInvoiceUntouched(snapshot, {
        totalAmount: "100.00",
        lineIds: ["line-b", "line-a"],
        lineAmounts: { "line-b": "40.00", "line-a": "60.00" },
      }),
    ).not.toThrow();
  });

  it("rejects a changed frozen total", () => {
    expect(() =>
      assertIssuedInvoiceUntouched(snapshot, { ...snapshot, totalAmount: "90.00" }),
    ).toThrow(InternalError);
  });

  it("rejects a removed or added line", () => {
    expect(() =>
      assertIssuedInvoiceUntouched(snapshot, {
        ...snapshot,
        lineIds: ["line-a"],
        lineAmounts: { "line-a": "60.00" },
      }),
    ).toThrow(InternalError);
    expect(() =>
      assertIssuedInvoiceUntouched(snapshot, {
        ...snapshot,
        lineIds: ["line-a", "line-b", "line-c"],
        lineAmounts: { ...snapshot.lineAmounts, "line-c": "0.00" },
      }),
    ).toThrow(InternalError);
  });

  it("rejects a rewritten line amount", () => {
    expect(() =>
      assertIssuedInvoiceUntouched(snapshot, {
        ...snapshot,
        lineAmounts: { "line-a": "50.00", "line-b": "40.00" },
      }),
    ).toThrow(InternalError);
  });
});
