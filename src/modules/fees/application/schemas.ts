/**
 * Input contracts for every fee use case (`PRD.md` MODULE 6).
 *
 * Boundary schemas (`ARCHITECTURE.md` §29) that turn untrusted form payloads into typed command
 * inputs. Rules needing a row's current state — an allocation against this payment, an issued
 * invoice's frozen total — live in `domain/fee-rules.ts` and the service, because zod cannot
 * ask the database anything.
 *
 * Four shapes recur here, each stated at the form so the failure is a field message rather
 * than a 500 from a database check:
 *
 * - **Institution scope** on every command, so the server action can authorize before the use
 *   case runs (`SECURITY.md` §21, §87) — a claim to check, never a value to trust.
 * - **Scope consistency**: a fee structure claiming `class` must carry a `classId`, and one
 *   claiming `all` must carry none — `fee_structures_scope_consistency_check` restated.
 * - **Presence pairs**: a recurring item needs an installment count and a one-time item must
 *   not have one (`fee_structure_items_installment_check`); a non-cash payment needs a
 *   reference (`payments_reference_check`); an approval needs decision notes; a concession
 *   needs exactly one basis (`fee_concessions_one_basis_check`).
 * - **FormData emptiness**: absent fields arrive as `""`, which `.optional()` alone would not
 *   skip, so every optional field normalises to `null` via the shared helpers.
 */
import { z } from "zod";

import { compare, fromDecimalText } from "@/shared/money";
import {
  calendarDate,
  currencyCode,
  decimalAmount,
  nonEmptyText,
  nonNegativeAmount,
  optionalCalendarDate,
  optionalId,
  optionalText,
} from "@/shared/validation/fields";

import {
  CATEGORIES,
  CONCESSION_KINDS,
  FEE_FREQUENCIES,
  FEE_STATUSES,
  PAYMENT_METHODS,
} from "../domain/fee-rules";

const uuid = z.string().uuid("A valid reference is required.");

/** A decimal amount that must be greater than zero — payments and allocations settle money. */
const positiveAmount = decimalAmount.refine(
  (value) => !value.startsWith("-") && !/^0+(?:\.0+)?$/.test(value),
  "Amount must be greater than zero.",
);

/** A non-negative decimal amount, or `null` when the form left it blank. */
const optionalNonNegativeAmount = z
  .union([nonNegativeAmount, z.literal(""), z.undefined(), z.null()])
  .optional()
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));

/** A whole-number percentage arriving as `"10"`, `10`, or blank → `null`. */
const optionalPercentage = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string") return Number(value);
    return value;
  },
  z.nullable(
    z
      .number()
      .int("Percentage must be a whole number.")
      .min(0, "Percentage cannot be negative.")
      .max(100, "Percentage cannot exceed 100."),
  ),
);

/** A checkbox: absent means the default, `"on"`/`"true"` means true. */
const checkbox = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === "on" || value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value;
  }, z.boolean());

export const feeStatusEnum = z.enum(FEE_STATUSES);
export const paymentMethodEnum = z.enum(PAYMENT_METHODS);
export const feeFrequencyEnum = z.enum(FEE_FREQUENCIES);
export const feeCategoryEnum = z.enum(CATEGORIES);
export const concessionKindEnum = z.enum(CONCESSION_KINDS);
export const feeAppliesToEnum = z.enum(["all", "class", "group", "section"]);

/* -------------------------------------------------------------------------- */
/* Fee structures                                                             */
/* -------------------------------------------------------------------------- */

const feeStructureItemSchema = z
  .object({
    name: nonEmptyText("Item name", 160),
    amount: nonNegativeAmount,
    discountAmount: optionalNonNegativeAmount,
    frequency: feeFrequencyEnum.default("one_time"),
    /** A count arriving as `1`, `"1"`, or blank/absent → `null` — JSON bodies and forms both. */
    installmentCount: z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") return null;
        if (typeof value === "string") return Number(value);
        return value;
      },
      z.nullable(
        z
          .number()
          .int("Installment count must be a whole number.")
          .min(1, "Installment count must be a whole number.")
          .max(1_000_000, "Installment count is too large."),
      ),
    ),
    category: feeCategoryEnum.default("other"),
    overrideAmount: optionalNonNegativeAmount,
    isMandatory: checkbox(true),
    sortOrder: z.number().int().min(0).default(0),
    description: optionalText(500),
  })
  .superRefine((item, ctx) => {
    if (item.frequency !== "one_time" && item.installmentCount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["installmentCount"],
        message: "Recurring fees need an installment count.",
      });
    }
    if (item.frequency === "one_time" && item.installmentCount !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["installmentCount"],
        message: "One-time fees do not have installments.",
      });
    }
    if (item.discountAmount !== null) {
      const amount = fromDecimalText(item.amount, "USD");
      const discount = fromDecimalText(item.discountAmount, "USD");
      if (compare(discount, amount) > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["discountAmount"],
          message: "Discount cannot exceed the item amount.",
        });
      }
    }
  });

const feeStructureItemsSchema = z
  .array(feeStructureItemSchema)
  .min(1, "Add at least one fee item.");

const feeStructureBody = {
  institutionId: uuid,
  name: nonEmptyText("Name", 160),
  appliesTo: feeAppliesToEnum.default("all"),
  classId: optionalId,
  groupId: optionalId,
  sectionId: optionalId,
  academicSessionId: optionalId,
  currency: currencyCode,
  description: optionalText(500),
  isActive: checkbox(true),
  effectiveFrom: calendarDate("Effective from"),
  effectiveTo: optionalCalendarDate,
  items: feeStructureItemsSchema,
};

/** `fee_structures_scope_consistency_check` and `fee_structures_effective_order_check`, stated at the form. */
const refineStructure = (
  data: {
    readonly appliesTo: "all" | "class" | "group" | "section";
    readonly classId: string | null;
    readonly groupId: string | null;
    readonly sectionId: string | null;
    readonly effectiveFrom: string;
    readonly effectiveTo: string | null;
  },
  ctx: z.RefinementCtx,
): void => {
  if (data.appliesTo === "all") {
    if (data.classId !== null || data.groupId !== null || data.sectionId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["classId"],
        message: "A structure that applies to all must not name a class, group or section.",
      });
    }
  } else {
    const required: Record<"class" | "group" | "section", string | null> = {
      class: data.classId,
      group: data.groupId,
      section: data.sectionId,
    };
    if (required[data.appliesTo] === null) {
      ctx.addIssue({
        code: "custom",
        path: [`${data.appliesTo}Id`],
        message: `Choose the ${data.appliesTo} this structure applies to.`,
      });
    }
  }
  if (data.effectiveTo !== null && data.effectiveTo <= data.effectiveFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["effectiveTo"],
      message: "The end of the effective window must be after its start.",
    });
  }
};

export const feeStructureSchema = z.object(feeStructureBody).superRefine(refineStructure);

export const updateFeeStructureSchema = z
  .object({
    id: uuid,
    expectedVersion: z.number().int().positive(),
    ...feeStructureBody,
  })
  .superRefine(refineStructure);

export const listStructuresSchema = z.object({
  institutionId: uuid,
  isActive: z
    .union([z.boolean(), z.literal(""), z.undefined(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === "" ? null : value)),
});

export const getStructureSchema = z.object({
  institutionId: uuid,
  structureId: uuid,
});

/* -------------------------------------------------------------------------- */
/* Invoice generation                                                         */
/* -------------------------------------------------------------------------- */

export const generateInvoicesSchema = z.object({
  institutionId: uuid,
  academicSessionId: uuid,
  dueOn: calendarDate("Due date"),
  feeStructureId: optionalId,
  note: optionalText(500),
});

/* -------------------------------------------------------------------------- */
/* Invoices                                                                   */
/* -------------------------------------------------------------------------- */

export const listInvoicesSchema = z.object({
  institutionId: uuid,
  studentId: optionalId,
  academicSessionId: optionalId,
  status: z
    .union([feeStatusEnum, z.literal(""), z.undefined(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === "" ? null : value)),
});

export const getInvoiceSchema = z.object({
  institutionId: uuid,
  invoiceId: uuid,
});

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

const paymentAllocationSchema = z.object({
  invoiceId: uuid,
  amount: positiveAmount,
});

export const recordPaymentSchema = z
  .object({
    institutionId: uuid,
    studentId: uuid,
    academicSessionId: uuid,
    amount: positiveAmount,
    currency: currencyCode,
    method: paymentMethodEnum,
    referenceNumber: optionalText(128),
    receivedOn: calendarDate("Received on"),
    allocations: z
      .array(paymentAllocationSchema)
      .min(1, "Allocate the payment to at least one invoice."),
    notes: optionalText(1000),
  })
  .superRefine((data, ctx) => {
    if (data.method !== "cash" && data.referenceNumber === null) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceNumber"],
        message: "A reference number is required for non-cash payments.",
      });
    }
    const seen = new Set<string>();
    data.allocations.forEach((allocation, index) => {
      if (seen.has(allocation.invoiceId)) {
        ctx.addIssue({
          code: "custom",
          path: ["allocations", index, "invoiceId"],
          message: "Each invoice may appear only once.",
        });
      }
      seen.add(allocation.invoiceId);
    });
  });

/* -------------------------------------------------------------------------- */
/* Concessions                                                                */
/* -------------------------------------------------------------------------- */

export const concessionSchema = z
  .object({
    institutionId: uuid,
    studentId: uuid,
    invoiceId: optionalId,
    feeStructureId: optionalId,
    kind: concessionKindEnum,
    percentage: optionalPercentage,
    amount: optionalNonNegativeAmount,
    reason: nonEmptyText("Reason", 500),
  })
  .superRefine((data, ctx) => {
    const bases = (data.percentage === null ? 0 : 1) + (data.amount === null ? 0 : 1);
    if (bases !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["percentage"],
        message: "Give either a percentage or a fixed amount — exactly one.",
      });
    }
    const targets = (data.invoiceId === null ? 0 : 1) + (data.feeStructureId === null ? 0 : 1);
    if (targets !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["invoiceId"],
        message: "Choose either an invoice or a fee structure — exactly one.",
      });
    }
  });

/* -------------------------------------------------------------------------- */
/* Deferrals                                                                  */
/* -------------------------------------------------------------------------- */

export const deferralSchema = z
  .object({
    institutionId: uuid,
    invoiceId: uuid,
    reason: nonEmptyText("Reason", 500),
    requestedFrom: calendarDate("Requested from"),
    requestedUntil: calendarDate("Requested until"),
    /** A request may be approved the moment it is filed; a rejection leaves these blank. */
    isApproved: checkbox(false),
    decisionNotes: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    if (data.requestedUntil <= data.requestedFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["requestedUntil"],
        message: "The deferral must end after it starts.",
      });
    }
    if (data.isApproved && (data.decisionNotes === null || data.decisionNotes.trim() === "")) {
      ctx.addIssue({
        code: "custom",
        path: ["decisionNotes"],
        message: "Approval requires decision notes.",
      });
    }
  });

export const decideDeferralSchema = z
  .object({
    institutionId: uuid,
    invoiceId: uuid,
    deferralId: uuid,
    expectedVersion: z.number().int().positive(),
    isApproved: z.boolean(),
    decisionNotes: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    if (data.isApproved && (data.decisionNotes === null || data.decisionNotes.trim() === "")) {
      ctx.addIssue({
        code: "custom",
        path: ["decisionNotes"],
        message: "Approval requires decision notes.",
      });
    }
  });

/* -------------------------------------------------------------------------- */
/* Manual adjustments                                                         */
/* -------------------------------------------------------------------------- */

export const manualAdjustmentSchema = z.object({
  institutionId: uuid,
  invoiceId: uuid,
  kind: z.enum(["credit_note", "deferral_adjustment"]),
  amount: nonNegativeAmount,
  reason: nonEmptyText("Reason", 500),
});

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

export const getDashboardStatsSchema = z.object({
  institutionId: uuid,
  academicSessionId: optionalId,
});

export const listStudentFeesSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  academicSessionId: optionalId,
});
