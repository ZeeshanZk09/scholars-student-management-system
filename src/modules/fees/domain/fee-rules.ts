/**
 * Fee lifecycle rules (`PRD.md` MODULE 6, `src/db/schema/fees.ts`, `ADR-0003`).
 *
 * Pure over `@/shared/errors` and `@/shared/money` — no I/O, no Drizzle, no zod. Three concerns
 * live here rather than in SQL or the service:
 *
 * 1. **Display vocabulary.** The database stores enum keys (`bank_transfer`); the UI shows
 *    "Bank transfer". The label maps are the single source for that projection, and the status
 *    tuples feed the zod enums in `application/schemas.ts`.
 * 2. **Money rules.** `ADR-0003` forbids storing a derived balance, so `invoiceBalance` computes
 *    it at read time and never returns a negative figure; concessions clamp at zero (a 200%
 *    concession does not create a credit out of thin air — that is a credit note, an audited
 *    document); `splitInstallments` guarantees `sum(parts) === total` to the minor unit, with
 *    the last part absorbing the remainder (100.00 / 3 = 33.33 + 33.33 + 33.34).
 * 3. **Guards the database cannot state.** `SUM(allocations) <= payment.amount` is a cross-row
 *    rule (`payment_allocations` comment, schema line ~388) and the Critical Rule — an issued
 *    invoice's frozen total and lines are immutable (`RULES.md` §36) — is an invariant across
 *    any automatic write path. Both are asserted here so the service, the store, and any future
 *    batch job can share one implementation.
 *
 * `invoiceDisplayStatus` exists because `overdue` is stored *and* derived: the store flips a row
 * when a scheduled job runs (`isEligibleForOverdue`), but a list rendered tomorrow must say
 * "overdue" for a row the job has not touched yet. A deferral wins over the date — that is the
 * entire reason `deferred` is a stored decision and not a date comparison.
 */
import { InternalError, ValidationError } from "@/shared/errors";
import {
  add,
  fromDecimalText,
  isNegative,
  negate,
  subtract,
  toDecimalText,
  zero,
  type Money,
} from "@/shared/money";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

export const FEE_STATUSES = [
  "pending",
  "partial",
  "paid",
  "overdue",
  "deferred",
  "waived",
  "cancelled",
] as const;

export type FeeStatus = (typeof FEE_STATUSES)[number];

/**
 * The statuses a rendered invoice may show. The same set as the stored enum — `overdue` is
 * both a stored state (written by the store's transition job) and a display-time derivation
 * for rows the job has not caught up with.
 */
export const INVOICE_STATUSES = FEE_STATUSES;

export type InvoiceStatus = FeeStatus;

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "cheque",
  "online_gateway",
  "card",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["pending", "completed", "failed", "reversed", "refunded"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FEE_FREQUENCIES = ["one_time", "monthly", "quarterly", "annual", "term"] as const;

export type FeeFrequency = (typeof FEE_FREQUENCIES)[number];

export const CATEGORIES = [
  "admission",
  "tuition",
  "transport",
  "lab",
  "library",
  "exam",
  "uniform",
  "other",
] as const;

export type FeeCategory = (typeof CATEGORIES)[number];

export const CONCESSION_KINDS = ["discount", "waiver", "scholarship", "sibling_discount"] as const;

export type ConcessionKind = (typeof CONCESSION_KINDS)[number];

/** Human labels for the stored keys — the database keeps the key, the UI shows this. */
export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  pending: "Pending",
  partial: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  deferred: "Deferred",
  waived: "Waived",
  cancelled: "Cancelled",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  online_gateway: "Online gateway",
  card: "Card",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
  reversed: "Reversed",
  refunded: "Refunded",
};

export const FEE_FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  one_time: "One time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  term: "Term",
};

/* -------------------------------------------------------------------------- */
/* Overdue derivation                                                        */
/* -------------------------------------------------------------------------- */

/** `YYYY-MM-DD` in the server's local zone — same shaping as `mintApplicationNumber`. */
export function calendarDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A deferral suspends collection through `deferredUntil` inclusive; after that it has expired. */
export function isDeferralActive(deferredUntil: string | null, today: Date): boolean {
  if (deferredUntil === null) return false;
  return deferredUntil >= calendarDateString(today);
}

/**
 * The stored overdue transition's eligibility, for the store's scheduled job. `dueOn` equal to
 * today is **not** overdue — the family still has the day — and a live deferral suspends the
 * transition no matter how far past due the invoice is.
 */
export function isEligibleForOverdue(
  status: FeeStatus,
  dueOn: string | null,
  today: Date,
): boolean {
  if (status !== "pending" && status !== "partial") return false;
  if (dueOn === null) return false;
  return dueOn < calendarDateString(today);
}

/**
 * What a rendered invoice should say. Returns the stored status, except a `pending`/`partial`
 * invoice past its due date with no live deferral displays as `overdue` even before the store's
 * job flips the row.
 */
export function invoiceDisplayStatus(
  invoice: {
    readonly status: FeeStatus;
    readonly dueOn: string | null;
    readonly deferredUntil: string | null;
  },
  today: Date,
): InvoiceStatus {
  if (
    isEligibleForOverdue(invoice.status, invoice.dueOn, today) &&
    !isDeferralActive(invoice.deferredUntil, today)
  ) {
    return "overdue";
  }
  return invoice.status;
}

/* -------------------------------------------------------------------------- */
/* Money rules                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What is still owed: the billed total less everything allocated to it and less every live
 * concession against it, floored at zero.
 *
 * The floor is deliberate. `payment_allocations` is guarded by `assertAllocationWithinPayment`,
 * so a negative balance would mean a bug upstream — surfacing it as a credit on an invoice
 * screen would invent money (`ADR-0003`: a credit is a credit note, an audited document).
 *
 * `concessionsSoFar` defaults to zero so existing two-argument callers keep their meaning; a
 * call site that knows the granted concessions must pass them, or the invoice would read as
 * more outstanding than it is.
 */
export function invoiceBalance(
  total: Money,
  allocatedSoFar: Money,
  concessionsSoFar: Money = zero(total.currency),
): Money {
  const outstanding = subtract(subtract(total, allocatedSoFar), concessionsSoFar);
  return isNegative(outstanding) ? zero(total.currency) : outstanding;
}

export interface ConcessionBasis {
  readonly percentage?: number | null | undefined;
  readonly amount?: string | null | undefined;
}

/**
 * Net a catalogue or granted concession off an amount, clamped at zero.
 *
 * Exactly one basis: "10% off" and "500 off" are both real, neither can be stored as the
 * other, and offering both at once is a form bug this refuses. A percentage discount floors
 * the discount (33% of 99.99 removes 32.99, never 33.00), so the student is never over-
 * credited; a concession larger than the amount simply zeroes it.
 */
export function applyConcessionToAmount(
  amount: string,
  concession: ConcessionBasis,
  currency: string,
): Money {
  const gross = fromDecimalText(amount, currency);
  const { percentage, amount: basisAmount } = concession;
  const hasPercentage = percentage !== null && percentage !== undefined;
  const hasAmount = basisAmount !== null && basisAmount !== undefined && basisAmount !== "";

  if (hasPercentage && hasAmount) {
    throw new ValidationError("A concession needs exactly one basis.", {
      concession: ["Give either a percentage or a fixed amount, not both."],
    });
  }
  if (!hasPercentage && !hasAmount) {
    throw new ValidationError("A concession needs exactly one basis.", {
      concession: ["Give either a percentage or a fixed amount."],
    });
  }

  let discount: Money;
  if (hasPercentage) {
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      throw new ValidationError("Invalid concession percentage.", {
        percentage: ["Must be a whole number between 0 and 100."],
      });
    }
    const discountMinor = (gross.amountMinor * BigInt(percentage)) / BigInt(100);
    discount = { amountMinor: discountMinor, currency: gross.currency };
  } else {
    if (basisAmount === null || basisAmount === undefined || basisAmount === "") {
      throw new ValidationError("A concession needs exactly one basis.", {
        concession: ["Give either a percentage or a fixed amount."],
      });
    }
    discount = fromDecimalText(basisAmount, currency);
  }

  if (isNegative(discount)) {
    throw new ValidationError("Concession amount cannot be negative.", {
      amount: ["Enter a positive concession amount."],
    });
  }

  const net = subtract(gross, discount);
  return isNegative(net) ? zero(currency) : net;
}

/**
 * Split a total into `count` parts that sum exactly back to it — no minor unit lost or
 * invented. The last part absorbs the remainder (100.00 / 3 is 33.33 + 33.33 + **33.34**),
 * matching the `fee_payment_plans` comment: "the final instalment is not assumed to be equal".
 */
export function splitInstallments(total: string, count: number, currency: string): Money[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new ValidationError(`Cannot split into ${count} parts`, {
      count: ["Must be a positive whole number of parts."],
    });
  }
  const money = fromDecimalText(total, currency);
  const negative = isNegative(money);
  const absolute = negative ? negate(money) : money;
  const base = absolute.amountMinor / BigInt(count);
  const parts: Money[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    parts.push({ amountMinor: base, currency: absolute.currency });
  }
  const lastMinor = absolute.amountMinor - base * BigInt(count - 1);
  parts.push({ amountMinor: lastMinor, currency: absolute.currency });
  return negative ? parts.map((part) => negate(part)) : parts;
}

/* -------------------------------------------------------------------------- */
/* Scope matching                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The shape of a fee structure's scope, stated structurally rather than by importing the
 * application ports: the domain owns the *rule* ("a class-scoped plan covers a student in that
 * class"), and any row with these fields satisfies it. `FeeStructureDetailRow` and
 * `ApplicableStudent` both do.
 */
export interface ScopedStructure {
  readonly appliesTo: "all" | "class" | "group" | "section";
  readonly classId: string | null;
  readonly groupId: string | null;
  readonly sectionId: string | null;
}

export interface StudentPlacement {
  readonly classId: string | null;
  readonly groupId: string | null;
  readonly sectionId: string | null;
}

/**
 * Does this structure's scope cover this student's placement? `fee-service` calls it both when
 * generating invoices and when previewing who a structure would bill, and it is the guard that
 * keeps a class-scoped plan from billing the whole school. A scoped plan
 * with a null key matches nobody (the boundary schema forbids that state, so this is defence in
 * depth rather than a user-facing refusal).
 */
export function structureAppliesToStudent(
  structure: ScopedStructure,
  student: StudentPlacement,
): boolean {
  switch (structure.appliesTo) {
    case "all":
      return true;
    case "class":
      return structure.classId !== null && student.classId === structure.classId;
    case "group":
      return structure.groupId !== null && student.groupId === structure.groupId;
    case "section":
      return structure.sectionId !== null && student.sectionId === structure.sectionId;
  }
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `SUM(payment_allocations) <= payments.amount` — a cross-row rule the database cannot state
 * as a constraint (`payment_allocations` comment). Equality is allowed: a fully allocated
 * payment is the happy path, not an overflow.
 */
export function assertAllocationWithinPayment(
  paymentAmount: string,
  existingAllocated: string,
  additional: string,
  currency: string,
): void {
  const payment = fromDecimalText(paymentAmount, currency);
  const existing = fromDecimalText(existingAllocated, currency);
  const extra = fromDecimalText(additional, currency);
  if (isNegative(extra)) {
    throw new ValidationError("Allocation cannot be negative.", {
      amount: ["Enter a positive allocation amount."],
    });
  }
  if (isNegative(existing)) {
    throw new ValidationError("Existing allocation cannot be negative.", {
      amount: ["Existing allocation cannot be negative."],
    });
  }
  const total = add(existing, extra);
  if (total.amountMinor > payment.amountMinor) {
    throw new ValidationError("Allocation exceeds the payment amount.", {
      allocations: [
        `The allocated ${toDecimalText(total)} is more than the payment of ${toDecimalText(payment)}.`,
      ],
    });
  }
}

export interface InvoiceSnapshot {
  readonly totalAmount: string;
  readonly lineIds: readonly string[];
  readonly lineAmounts: Readonly<Record<string, string>>;
}

/**
 * The Critical Rule (`RULES.md` §36, `fee_invoices` comment): an issued invoice's frozen total
 * and its existing lines are immutable. A credit note or a new invoice is the only legal
 * correction — a silent edit would rewrite what a parent was billed. Any automatic path
 * (generation, a batch re-run, a payment side-effect) may assert this before and after its
 * work; a mismatch is a bug in *our* code, never a user error, hence `InternalError`.
 */
export function assertIssuedInvoiceUntouched(
  before: InvoiceSnapshot,
  after: InvoiceSnapshot,
): void {
  if (before.totalAmount !== after.totalAmount) {
    throw new InternalError("An issued invoice's frozen total was modified by an automatic path.");
  }
  const beforeIds = [...before.lineIds].sort();
  const afterIds = [...after.lineIds].sort();
  if (beforeIds.length !== afterIds.length) {
    throw new InternalError("An issued invoice's lines were modified by an automatic path.");
  }
  for (let index = 0; index < beforeIds.length; index += 1) {
    const id = beforeIds[index];
    const otherId = afterIds[index];
    if (id === undefined || otherId === undefined || id !== otherId) {
      throw new InternalError("An issued invoice's lines were modified by an automatic path.");
    }
    const beforeAmount = before.lineAmounts[id];
    const afterAmount = after.lineAmounts[id];
    if (beforeAmount === undefined || afterAmount === undefined || beforeAmount !== afterAmount) {
      throw new InternalError("An issued invoice's lines were modified by an automatic path.");
    }
  }
}
