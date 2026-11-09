/**
 * Input contracts for every finance use case (`PRD.md` MODULE 7).
 *
 * Boundary schemas (`ARCHITECTURE.md` §29) that turn untrusted form payloads into typed command
 * inputs. Rules that need a row's current state — an expense's status before a transition, a
 * journal's kind before a reversal — live in `domain/finance-rules.ts` and the service, because
 * zod cannot ask the database anything.
 *
 * Four shapes recur here, each stated at the form so the failure is a field message rather than
 * a 500 from a database check:
 *
 * - **Institution scope** on every command, so the server action can authorize before the use
 *   case runs (`SECURITY.md` §21, §87) — a claim to check, never a value to trust.
 * - **Money as decimal text.** `positiveAmount` mirrors the fee module's: the same amount the
 *   `numeric` column will hold, with the `> 0` check the ledger's own `CHECK` states, so a bad
 *   figure is caught before a transaction opens.
 * - **Optimistic concurrency.** Every versioned write carries `expectedVersion`; a stale one is
 *   a `ConflictError`, not a silent overwrite.
 * - **FormData emptiness**: absent fields arrive as `""`, which `.optional()` alone would not
 *   skip, so optional fields normalise to `null` through the shared helpers, and pagination
 *   accepts both `6` and `"6"` because a query string only ever carries strings.
 *
 * Supported *values* — the currency set, the plausibility of a date, a reversal's reason length —
 * are policy rather than shape, so they are asserted by the service (`finance-service.ts`)
 * against `domain/finance-rules.ts`, where they are also tested.
 */
import { z } from "zod";

import {
  calendarDate,
  currencyCode,
  decimalAmount,
  nonEmptyText,
  optionalCalendarDate,
  optionalId,
  optionalText,
} from "@/shared/validation/fields";

import {
  ACCOUNT_TYPES,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  JOURNAL_KINDS,
  JOURNAL_STATUSES,
  PAYMENT_METHODS,
} from "../domain/finance-rules";

const uuid = z.uuid("A valid reference is required.");

/** A decimal amount that must be greater than zero — every posting settles money. */
const positiveAmount = decimalAmount.refine(
  (value) => !value.startsWith("-") && !/^0+(?:\.0+)?$/.test(value),
  "Amount must be greater than zero.",
);

/** A checkbox: absent means the default, `"on"`/`"true"` means true. */
const checkbox = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === "on" || value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value;
  }, z.boolean());

/** An optional value that arrives as `""` or `null` from a query string or an empty form field. */
const optionalValue = <T extends z.ZodType>(schema: T) =>
  z
    .union([schema, z.literal(""), z.undefined(), z.null()])
    .optional()
    .transform((value) => (value === "" || value === undefined || value === null ? null : value));

/** A whole number from a body or a query string, `defaulting` when the parameter is absent. */
const wholeNumberFrom = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") return fallback;
      if (typeof value === "string") return Number(value);
      return value;
    },
    z
      .number()
      .int("Must be a whole number.")
      .min(min, `Must be at least ${min}.`)
      .max(max, `Must be at most ${max}.`),
  );

export const accountTypeEnum = z.enum(ACCOUNT_TYPES);
export const expenseCategoryEnum = z.enum(EXPENSE_CATEGORIES);
export const expenseStatusEnum = z.enum(EXPENSE_STATUSES);
export const journalKindEnum = z.enum(JOURNAL_KINDS);
export const journalStatusEnum = z.enum(JOURNAL_STATUSES);
export const paymentMethodEnum = z.enum(PAYMENT_METHODS);

/* -------------------------------------------------------------------------- */
/* Posting                                                                    */
/* -------------------------------------------------------------------------- */

export const postFeeCollectionSchema = z.object({
  institutionId: uuid,
  paymentId: uuid,
  amount: positiveAmount,
  currency: currencyCode,
  transactionOn: calendarDate("Transaction date"),
  method: paymentMethodEnum,
  accountId: optionalId,
  feeCategory: optionalText(32),
  description: optionalText(500),
});

export const postPayrollCollectionSchema = z.object({
  institutionId: uuid,
  payrollRunId: uuid,
  amount: positiveAmount,
  currency: currencyCode,
  transactionOn: calendarDate("Transaction date"),
  method: paymentMethodEnum,
  accountId: optionalId,
  description: optionalText(500),
});

export const recordIncomeSchema = z.object({
  institutionId: uuid,
  amount: positiveAmount,
  currency: currencyCode,
  transactionOn: calendarDate("Transaction date"),
  method: paymentMethodEnum,
  accountId: optionalId,
  description: optionalText(500),
});

/* -------------------------------------------------------------------------- */
/* Expenses                                                                   */
/* -------------------------------------------------------------------------- */

export const createExpenseSchema = z.object({
  institutionId: uuid,
  expenseHeadId: uuid,
  departmentId: optionalId,
  amount: positiveAmount,
  currency: currencyCode,
  description: nonEmptyText("Description", 2000),
  incurredOn: calendarDate("Incurred on"),
  method: paymentMethodEnum,
  receiptStorageKey: optionalText(512),
});

/**
 * The shared input of `submitExpense`, `approveExpense`, `markExpensePaid` and `rejectExpense` —
 * one shape, four store calls, because what changes between them is the edge of the state
 * machine the service asserts, not the payload.
 */
export const expenseTransitionSchema = z.object({
  institutionId: uuid,
  expenseId: uuid,
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
});

export const reverseJournalSchema = z.object({
  institutionId: uuid,
  journalId: uuid,
  reason: nonEmptyText("Reason", 500),
});

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

export const createExpenseHeadSchema = z.object({
  institutionId: uuid,
  name: nonEmptyText("Name", 160),
  category: expenseCategoryEnum,
  parentHeadId: optionalId,
  ledgerAccountId: optionalId,
  description: optionalText(500),
});

export const setExpenseHeadActiveSchema = z.object({
  institutionId: uuid,
  expenseHeadId: uuid,
  isActive: checkbox(true),
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
});

export const createAccountSchema = z
  .object({
    institutionId: uuid,
    name: nonEmptyText("Name", 160),
    accountType: accountTypeEnum,
    currency: currencyCode,
    bankName: optionalText(160),
    accountNumber: optionalText(64),
    iban: optionalText(64),
    openedOn: optionalCalendarDate,
    isActive: checkbox(true),
  })
  .superRefine((data, ctx) => {
    // `financial_accounts_bank_detail_check` states the same rule; saying it at the form turns a
    // 500 from the database into a field message.
    if (data.accountType === "bank" && data.bankName === null) {
      ctx.addIssue({
        code: "custom",
        path: ["bankName"],
        message: "A bank account needs its bank name.",
      });
    }
  });

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

export const listAccountsSchema = z.object({
  institutionId: uuid,
});

export const listJournalsSchema = z.object({
  institutionId: uuid,
  kind: optionalValue(journalKindEnum),
  status: optionalValue(journalStatusEnum),
  from: optionalCalendarDate,
  to: optionalCalendarDate,
  search: optionalText(120),
  page: wholeNumberFrom(1, 1, 100_000),
  pageSize: wholeNumberFrom(50, 1, 200),
});

export const getJournalSchema = z.object({
  institutionId: uuid,
  journalId: uuid,
});

export const listExpensesSchema = z.object({
  institutionId: uuid,
  status: optionalValue(expenseStatusEnum),
  from: optionalCalendarDate,
  to: optionalCalendarDate,
  expenseHeadId: optionalId,
  page: wholeNumberFrom(1, 1, 100_000),
  pageSize: wholeNumberFrom(50, 1, 200),
});

export const getExpenseSchema = z.object({
  institutionId: uuid,
  expenseId: uuid,
});

export const listExpenseHeadsSchema = z.object({
  institutionId: uuid,
  isActive: z
    .union([z.boolean(), z.literal(""), z.undefined(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === "" ? null : value)),
});

export const getOverviewSchema = z.object({
  institutionId: uuid,
  /** Trailing months in the chart: 1–36, defaulting to a six-month view. */
  months: wholeNumberFrom(6, 1, 36),
});

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type PostFeeCollectionInput = z.infer<typeof postFeeCollectionSchema>;
export type PostPayrollCollectionInput = z.infer<typeof postPayrollCollectionSchema>;
export type RecordIncomeInput = z.infer<typeof recordIncomeSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type ExpenseTransitionInput = z.infer<typeof expenseTransitionSchema>;
export type ReverseJournalInput = z.infer<typeof reverseJournalSchema>;
export type CreateExpenseHeadInput = z.infer<typeof createExpenseHeadSchema>;
export type SetExpenseHeadActiveInput = z.infer<typeof setExpenseHeadActiveSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type ListJournalsInput = z.infer<typeof listJournalsSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesSchema>;
export type ListExpenseHeadsInput = z.infer<typeof listExpenseHeadsSchema>;
export type GetOverviewInput = z.infer<typeof getOverviewSchema>;
