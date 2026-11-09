/**
 * Fees: structures, invoices, payments, receipts and deferrals.
 *
 * `PRD.md` MODULE 6, `ARCHITECTURE.md` §21 and §54. `ADR-0003` is binding and it has one rule that
 * shapes this entire file: **no derived outstanding balance is ever stored.** Every figure here is a
 * fact someone entered or a rate someone configured; the balance is a `SUM()` computed at read time.
 *
 * ## Why the outstanding balance is not a column
 *
 * The obvious design is `invoices.outstanding_amount`, updated on every payment. It is wrong in three
 * ways that only show up in production:
 *
 * 1. It is a second source of truth. The payments say what was received; the column says what is owed.
 *    They can disagree — after a manual correction, a partial write, a concurrency race — and then no
 *    query can be trusted to say which one is lying.
 * 2. It needs its own concurrency control, and two payment paths (receipt + ledger, `RULES.md` §16)
 *    would each have to remember to bump it inside the transaction.
 * 3. A deferral must suspend collection without changing the amount owed, and a stored balance has no
 *    place to record that.
 *
 * `invoices.status` carries the *state* — including `partial`, which is genuinely derivable but is
 * stored because a deferral decision needs it and re-deriving it per row is a per-row aggregate. The
 * `invoice_status` comment in `_enums.ts` records the same decision.
 *
 * ## `RULES.md` §16, satisfied structurally
 *
 * A receipt, its allocation and its ledger entries must commit or roll back together. The FK chain
 * `payments → payment_allocations → fee_invoices` plus `payments → receipts` gives the attendance module
 * a single transaction boundary: begin, insert the payment, insert its allocation, insert the ledger
 * pair, commit.
 */
import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
import { feeFrequencyEnum, feeStatusEnum, paymentMethodEnum, paymentStatusEnum } from "./_enums";
import { academicSessions, institutions } from "./institution";
import { classes, groups, sections } from "./academic";
import { students } from "./student";

/**
 * `fee_structures` — a named, dated set of fee heads.
 *
 * `PRD.md` MODULE 6: "Fee structures define what is charged and when". The structure is the *list*; the
 * items below it are the lines. Splitting them means a fee structure can be edited without touching
 * every student's invoice, which is the entire reason an institution maintains one.
 *
 * `appliesTo` is a discriminator plus two nullable ids rather than a polymorphic `target_id`/`target_type`
 * pair, because a foreign key is what makes `onDelete` behave: deleting a class must remove its
 * fee structure, and with a polymorphic pair there is no foreign key to cascade from.
 *
 * `isActive` is not `archived_at` here. A fee structure is *retired* by policy on a date
 * (`effectiveTo`) and *deleted* only when it was a mistake; those are different facts, and the date is
 * what a retroactive invoice needs.
 */
export const feeStructures = pgTable(
  "fee_structures",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    /** `class`, `group`, `section`, `all`. Exactly one of the two ids is set when not `all`. */
    appliesTo: varchar("applies_to", { length: 16 }).notNull().default("all"),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id").references(() => academicSessions.id, {
      onDelete: "cascade",
    }),
    /** ISO 4217 alphabetic code. Required on every money table (ADR-0003). */
    currency: currencyCode(),
    description: description(),
    /** Whether the structure is currently offered. Distinct from its effective window. */
    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    index("fee_structures_institution_idx").on(t.institutionId, t.isActive),
    index("fee_structures_effective_idx").on(t.institutionId, t.effectiveFrom, t.effectiveTo),
    currencyCodeCheck("fee_structures_currency_check", t.currency),
    check(
      "fee_structures_effective_order_check",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
    // `applies_to` must agree with which ids are present: a row claiming `class` with a null class_id
    // would silently apply to nobody, and a row claiming `all` with a class_id would apply to one.
    check(
      "fee_structures_scope_consistency_check",
      sql`(
        ${t.appliesTo} = 'all' and num_nonnulls(${t.classId}, ${t.groupId}, ${t.sectionId}) = 0
      ) or (
        ${t.appliesTo} = 'class' and ${t.classId} is not null
      ) or (
        ${t.appliesTo} = 'group' and ${t.groupId} is not null
      ) or (
        ${t.appliesTo} = 'section' and ${t.sectionId} is not null
      )`,
    ),
  ],
);

/**
 * `fee_structure_items` — one chargeable line inside a structure.
 *
 * `amount` is what the institution set. What a student owes for this item is `amount` from the
 * invoice line, because that is what was actually billed — a fee structure edited after invoicing must
 * not retroactively change an issued invoice.
 *
 * `fee_frequency` drives invoice generation. `term` has no period of its own because a term's dates are
 * an institution's academic calendar, held in `academic_sessions`; storing a second copy here would let
 * the two disagree.
 */
export const feeStructureItems = pgTable(
  "fee_structure_items",
  {
    id: primaryId(),
    feeStructureId: uuid("fee_structure_id")
      .notNull()
      .references(() => feeStructures.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    amount: moneyAmount("amount"),
    /** Discount applied at invoicing. Null means no discount configured. */
    discountAmount: optionalMoneyAmount("discount_amount"),
    frequency: feeFrequencyEnum("frequency").notNull().default("one_time"),
    /** For `monthly`/`quarterly`/`annual`: how many installments, and hence which due dates. */
    installmentCount: integer("installment_count"),
    /** `admission`, `tuition`, `transport`, `lab`, `library`, `exam`, `uniform`, `other`. */
    category: varchar("category", { length: 32 }).notNull().default("other"),
    /** Per-student override, e.g. a sibling discount. Null means the structure's amount applies. */
    overrideAmount: optionalMoneyAmount("override_amount"),
    isMandatory: boolean("is_mandatory").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    description: description(),
    createdAt: createdAt(),
  },
  (t) => [
    index("fee_structure_items_structure_idx").on(t.feeStructureId, t.sortOrder),
    check("fee_structure_items_amount_positive", sql`${t.amount} >= 0`),
    check(
      "fee_structure_items_discount_check",
      sql`${t.discountAmount} is null or (${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.amount})`,
    ),
    check(
      "fee_structure_items_override_check",
      sql`${t.overrideAmount} is null or ${t.overrideAmount} >= 0`,
    ),
    // Installments only make sense for a recurring charge. A `one_time` item with three installments
    // would generate three identical invoices.
    check(
      "fee_structure_items_installment_check",
      sql`${t.frequency} = 'one_time' or (${t.installmentCount} is not null and ${t.installmentCount} > 0)`,
    ),
  ],
);

/**
 * `fee_invoices` — a charge issued to a student. **The amount owed lives here and is never overwritten.**
 *
 * `total_amount` is `SUM(invoice_lines.amount)` frozen at issue time. It is *not* a stored derived
 * balance — it is the billed total, a fact about what was invoiced, and it must not move when a line
 * is added later (that would be a change to an issued document, which `RULES.md` §36 requires to be an
 * audited event, i.e. a credit note or a new invoice, not an edit).
 *
 * What is *not* here: `amount_paid` and `outstanding_amount`. Those are `SUM()`s over `payments` and
 * `payment_allocations`. This is the single most important line of reasoning in the file.
 *
 * `invoiceNumber` is unique per institution and per academic session, because two institutions (and two
 * sessions of one institution) each start at INV-0001 and neither may collide.
 */
export const feeInvoices = pgTable(
  "fee_invoices",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /** Human reference. Unique within institution + session. */
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    /** The frozen billed total. Never reduced by a payment; see the note above. */
    totalAmount: moneyAmount("total_amount"),
    currency: currencyCode(),
    status: feeStatusEnum("status").notNull().default("pending"),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on"),
    /** Set by `kind = 'deferral'` on the related payment; suspends collection, not the amount. */
    deferredUntil: date("deferred_until"),
    waiverReason: varchar("waiver_reason", { length: 500 }),
    /** `regular`, `installment`, `deferral_adjustment`, `credit_note`. */
    kind: varchar("kind", { length: 24 }).notNull().default("regular"),
    notes: text("notes"),
    /** Immutable after issue. `RULES.md` §36. */
    issuedByUserId: uuid("issued_by_user_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("fee_invoices_number_key").on(
      t.institutionId,
      t.academicSessionId,
      t.invoiceNumber,
    ),
    // The arrears report: every open invoice for a student.
    index("fee_invoices_student_status_idx").on(t.studentId, t.status, t.dueOn),
    index("fee_invoices_institution_due_idx").on(t.institutionId, t.dueOn, t.status),
    currencyCodeCheck("fee_invoices_currency_check", t.currency),
    check("fee_invoices_total_positive", sql`${t.totalAmount} >= 0`),
    check("fee_invoices_due_check", sql`${t.dueOn} is null or ${t.dueOn} >= ${t.issuedOn}`),
    // A deferral is a decision with a new date. `deferred` status without `deferred_until` is a state
    // that can never be acted on.
    check(
      "fee_invoices_deferral_pair",
      sql`${t.status} <> 'deferred' or ${t.deferredUntil} is not null`,
    ),
    // A waiver reduces what is collectable, so it must say why.
    check(
      "fee_invoices_waiver_reason_check",
      sql`${t.status} <> 'waived' or ${t.waiverReason} is not null`,
    ),
  ],
);

/**
 * `fee_invoice_lines` — one charge on an invoice.
 *
 * `fee_structure_item_id` is nullable and `onDelete: set null`: a line records what was charged, and
 * deleting the fee structure that defined it must not delete an issued invoice line. The name and
 * amount are copied onto the line for the same reason — an invoice must still read correctly after the
 * catalogue changes. This is a deliberate denormalisation of a *historical document*, which is the one
 * place in this schema where copying is right.
 */
export const feeInvoiceLines = pgTable(
  "fee_invoice_lines",
  {
    id: primaryId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => feeInvoices.id, { onDelete: "cascade" }),
    /** `onDelete: set null` — see the note above. */
    feeStructureItemId: uuid("fee_structure_item_id").references(() => feeStructureItems.id, {
      onDelete: "set null",
    }),
    /** Copied from the structure item at issue time, so the invoice is readable after a reorganisation. */
    name: varchar("name", { length: 160 }).notNull(),
    /** The amount billed for this line, after any discount. A fact, not a balance. */
    amount: moneyAmount("amount"),
    category: varchar("category", { length: 32 }).notNull().default("other"),
    /** `tuition`, `transport`, `admission`, … Free text here; the structure item carries the canonical set. */
    isTaxable: boolean("is_taxable").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("fee_invoice_lines_invoice_idx").on(t.invoiceId),
    check("fee_invoice_lines_amount_positive", sql`${t.amount} >= 0`),
  ],
);

/**
 * `payments` — money received.
 *
 * ## A payment is never deleted
 *
 * `payment_status` has `reversed` and `refunded` precisely so a mistaken receipt can be undone without
 * erasing the fact that it happened. Deleting the row would leave `payment_allocations` orphaned, would
 * make the ledger disagree with the receipts, and would violate `RULES.md` §36 (maintain history). A correction posts a **reversing** entry; it does not remove the original.
 *
 * `amount` is the amount received. `payment_allocations` says which invoices it settles, and
 * `overpaymentAmount` says what is left unallocated — a real state, because a parent may pay a term in
 * advance and the allocation is decided later.
 *
 * `receivedByUserId` is the cashier. `RULES.md` §36 makes cash handling auditable, so this is
 * `NOT NULL`: an unattributed cash receipt is the single most common financial-control failure.
 */
export const payments = pgTable(
  "payments",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    paymentNumber: varchar("payment_number", { length: 64 }).notNull(),
    amount: moneyAmount("amount"),
    currency: currencyCode(),
    /** Amount received but not yet allocated to an invoice. See the note above. */
    overpaymentAmount: optionalMoneyAmount("overpayment_amount"),
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull().default("completed"),
    /** Bank reference / cheque number / gateway transaction id. Required for non-cash. */
    referenceNumber: varchar("reference_number", { length: 128 }),
    /**
     * The account or cash box it landed in. `RULES.md` §36.
     *
     * A bare uuid, and the cycle once written here does not exist: `fees → finance` would be the only
     * edge between the two modules, and `finance` reaches nothing but `institution`, so no loop
     * closes. No other reason is recorded in the schema, so this is an unexplained gap rather than a
     * decision — see `OMISSION_CANDIDATES` in `schema-contract.test.ts`. Either way no foreign key
     * means **no relation in `relations.ts`** (generated from `references()` calls), so the join is an
     * explicit `eq(financialAccounts.id, payments.depositedToAccountId)` and an account deletion
     * cannot cascade here; a payment still cascades to its allocations and receipts.
     */
    depositedToAccountId: uuid("deposited_to_account_id"),
    receivedOn: date("received_on").notNull(),
    receivedByUserId: uuid("received_by_user_id").notNull(),
    /** The payment that reversed this one, and vice versa. Never null for a reversal. */
    reversesPaymentId: uuid("reverses_payment_id").references((): AnyPgColumn => payments.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("payments_number_key").on(t.institutionId, t.paymentNumber),
    index("payments_deposited_to_idx").on(t.depositedToAccountId, t.receivedOn),
    index("payments_student_idx").on(t.studentId, t.receivedOn),
    index("payments_institution_date_idx").on(t.institutionId, t.receivedOn, t.method),
    currencyCodeCheck("payments_currency_check", t.currency),
    check("payments_amount_positive", sql`${t.amount} > 0`),
    // Cash has no reference; every other method does, or the bank reconciliation cannot be done.
    check(
      "payments_reference_check",
      sql`${t.method} = 'cash' or ${t.referenceNumber} is not null`,
    ),
    // A reversal points at what it reverses, and cannot itself be a pending payment.
    check(
      "payments_reversal_check",
      sql`${t.status} <> 'reversed' or ${t.reversesPaymentId} is not null`,
    ),
  ],
);

/**
 * `payment_allocations` — how much of a payment settles which invoice.
 *
 * A join table with an amount on it, which is the whole point: one payment can settle several invoices
 * (paying a term in advance) and one invoice can be settled by several payments (fees in instalments).
 * A foreign key on `fee_invoices` alone could not express that, and the reverse — a nullable
 * `invoice_id` on `payments` — could only express one.
 *
 * The composite primary key `(payment_id, invoice_id)` makes a double allocation of the same pair
 * impossible; the money module enforces `SUM(allocations) <= payment.amount` inside the transaction,
 * which is a cross-row rule the database cannot state as a constraint.
 */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => feeInvoices.id, { onDelete: "restrict" }),
    /** How much of this payment goes to this invoice. Positive; the invoice's balance is the remainder. */
    allocatedAmount: moneyAmount("allocated_amount"),
    allocatedAt: timestamp("allocated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    allocatedByUserId: uuid("allocated_by_user_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.paymentId, t.invoiceId] }),
    index("payment_allocations_invoice_idx").on(t.invoiceId),
    check("payment_allocations_positive", sql`${t.allocatedAmount} > 0`),
  ],
);

/**
 * `receipts` — the printed/issued receipt for a payment. `PRD.md` MODULE 6.
 *
 * Separate from `payments` because they have different lifetimes and different audiences: a payment is
 * an accounting fact, a receipt is a document handed to a parent. A payment may be recorded with no
 * receipt issued (a bank transfer reconciled later) and a receipt may be reissued (`supersededById`)
 * without the payment changing at all. Merging them would make "print a receipt again" a financial
 * edit.
 *
 * `receiptNumber` is unique per institution and is the parent's proof of payment — so the sequence must
 * not be reused, and `RULES.md` §36 keeps it even when the payment is later reversed.
 */
export const receipts = pgTable(
  "receipts",
  {
    id: primaryId(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    receiptNumber: varchar("receipt_number", { length: 64 }).notNull(),
    amount: moneyAmount("amount"),
    currency: currencyCode(),
    issuedAt: timestamp("issued_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    issuedByUserId: uuid("issued_by_user_id").notNull(),
    /** A reissued receipt supersedes an older one without altering the payment. */
    supersededById: uuid("superseded_by_id").references((): AnyPgColumn => receipts.id, {
      onDelete: "set null",
    }),
    /** Opaque storage key for the rendered PDF. `ARCHITECTURE.md` §51: no binary in the database. */
    documentStorageKey: varchar("document_storage_key", { length: 512 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("receipts_number_key").on(t.institutionId, t.receiptNumber),
    // A payment may have several receipts over time (reissues), so this index is not unique.
    index("receipts_payment_idx").on(t.paymentId),
    currencyCodeCheck("receipts_currency_check", t.currency),
    check("receipts_amount_positive", sql`${t.amount} > 0`),
    // A receipt cannot supersede itself.
    check(
      "receipts_no_self_supersession",
      sql`${t.supersededById} is null or ${t.supersededById} <> ${t.id}`,
    ),
  ],
);

/**
 * `fee_deferrals` — a formal postponement, with an approval.
 *
 * `PRD.md` MODULE 6 requires deferrals and `fee_status` carries `deferred`. This table is why that
 * status is *stored* rather than computed from a date: a deferral is a decision (who approved it, until
 * when, for what reason) that must survive the passing of the original due date, and a date comparison
 * cannot express any of that.
 *
 * `approvedByUserId` is required whenever `isApproved`, and `RULES.md` §37 makes an unapproved deferral
 * meaningless — it must not silently suspend collection.
 */
export const feeDeferrals = pgTable(
  "fee_deferrals",
  {
    id: primaryId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => feeInvoices.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    /** The guardian who asked, where the request came from the parent rather than the office. */
    requestedByGuardianUserId: uuid("requested_by_guardian_user_id"),
    reason: text("reason").notNull(),
    requestedFrom: date("requested_from").notNull(),
    requestedUntil: date("requested_until").notNull(),
    isApproved: boolean("is_approved").notNull().default(false),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    decisionNotes: text("decision_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("fee_deferrals_invoice_idx").on(t.invoiceId, t.isApproved),
    check("fee_deferrals_window_check", sql`${t.requestedUntil} > ${t.requestedFrom}`),
    check(
      "fee_deferrals_approval_pair",
      sql`${t.isApproved} = false or (${t.approvedByUserId} is not null and ${t.approvedAt} is not null)`,
    ),
  ],
);

/**
 * `fee_concessions` — a discount or waiver granted to one student.
 *
 * Distinct from `fee_structure_items.discount_amount`, which is a *catalogue* discount everybody with
 * that structure gets. A concession is granted to a named student, needs an approver and a reason, and
 * may be revoked. `PRD.md` MODULE 6 lists both "fee discounts" and "fee waivers" and they are the same
 * table with `kind` distinguishing them, because the workflow is identical.
 *
 * `percentage` and `amount` are both nullable but at least one must be present: "10% off" and "500 off"
 * are both real, and neither can be stored in the other's column.
 */
export const feeConcessions = pgTable(
  "fee_concessions",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => feeInvoices.id, { onDelete: "cascade" }),
    feeStructureId: uuid("fee_structure_id").references(() => feeStructures.id, {
      onDelete: "cascade",
    }),
    /** `discount`, `waiver`, `scholarship`, `sibling_discount`. */
    kind: varchar("kind", { length: 24 }).notNull(),
    /** Percentage, 0–100. Mutually exclusive with `amount`. */
    percentage: integer("percentage"),
    amount: optionalMoneyAmount("amount"),
    currency: currencyCode(),
    reason: text("reason").notNull(),
    grantedByUserId: uuid("granted_by_user_id").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    revokedByUserId: uuid("revoked_by_user_id"),
    revocationReason: varchar("revocation_reason", { length: 500 }),
  },
  (t) => [
    index("fee_concessions_student_idx").on(t.studentId, t.grantedAt),
    index("fee_concessions_invoice_idx").on(t.invoiceId),
    check(
      "fee_concessions_percentage_range",
      sql`${t.percentage} is null or (${t.percentage} >= 0 and ${t.percentage} <= 100)`,
    ),
    check("fee_concessions_percentage_only", sql`${t.percentage} is null or ${t.percentage} >= 0`),
    check("fee_concessions_one_basis_check", sql`num_nonnulls(${t.percentage}, ${t.amount}) >= 1`),
    check(
      "fee_concessions_revocation_pair",
      sql`${t.revokedAt} is null or ${t.revokedByUserId} is not null`,
    ),
  ],
);

/**
 * `fee_payment_plans` — an agreed schedule of instalments, so a family can pay monthly.
 *
 * `PRD.md` MODULE 6's "payment schedule". `totalAmount` is the agreed sum, `installmentAmount` the
 * expected per-period figure, and `installmentCount` how many. **The final instalment is not assumed to
 * be equal** — with 10,000 over 3 the last is 3,334 — so `fee_installments.amount` is the authority for
 * each one, and this row carries only the plan's shape.
 *
 * A plan is a *schedule*, not a payment. Money moves through `payments`; changing a plan never changes
 * what has been paid.
 */
export const feePaymentPlans = pgTable(
  "fee_payment_plans",
  {
    id: primaryId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => feeInvoices.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    totalAmount: moneyAmount("total_amount"),
    currency: currencyCode(),
    installmentAmount: moneyAmount("installment_amount"),
    installmentCount: integer("installment_count").notNull(),
    /** `proposed`, `approved`, `rejected`, `active`, `completed`, `defaulted`. */
    status: varchar("status", { length: 16 }).notNull().default("proposed"),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("fee_payment_plans_one_active_key")
      .on(t.invoiceId)
      .where(sql`${t.status} in ('active', 'approved')`),
    index("fee_payment_plans_student_idx").on(t.studentId, t.status),
    currencyCodeCheck("fee_payment_plans_currency_check", t.currency),
    check("fee_payment_plans_count_check", sql`${t.installmentCount} > 0`),
    check(
      "fee_payment_plans_amount_positive",
      sql`${t.totalAmount} >= 0 and ${t.installmentAmount} > 0`,
    ),
    check(
      "fee_payment_plans_approval_pair",
      sql`${t.status} not in ('approved', 'active') or ${t.approvedByUserId} is not null`,
    ),
  ],
);

/**
 * `fee_installments` — one scheduled payment of a plan.
 *
 * A child table because the *dates* are the substance of a plan: "on the 10th of each month" is what a
 * family agreed to, and it is what a default is measured against. `amount` per row also resolves the
 * rounding problem a single `installmentAmount` cannot.
 */
export const feeInstallments = pgTable(
  "fee_installments",
  {
    id: primaryId(),
    paymentPlanId: uuid("payment_plan_id")
      .notNull()
      .references(() => feePaymentPlans.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    dueOn: date("due_on").notNull(),
    amount: moneyAmount("amount"),
    /** Set once a `payments` row has settled this instalment. */
    paidByPaymentId: uuid("paid_by_payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [
    uniqueIndex("fee_installments_sequence_key").on(t.paymentPlanId, t.sequence),
    index("fee_installments_due_idx").on(t.dueOn),
    check("fee_installments_sequence_check", sql`${t.sequence} > 0`),
    check("fee_installments_amount_positive", sql`${t.amount} > 0`),
    check(
      "fee_installments_payment_pair",
      sql`${t.paidAt} is null or ${t.paidByPaymentId} is not null`,
    ),
  ],
);

/**
 * `fee_structure_audit` — who changed a fee structure, when, and what it was.
 *
 * `RULES.md` §36 and `ARCHITECTURE.md` §53. A fee structure change silently alters what every future
 * invoice will say, and `ARCHITECTURE.md` §53 makes the structure an editable document rather than
 * configuration. Without this
 * trail, "why did the tuition fee change in March?" is unanswerable, and the parents who were charged
 * the old rate have no record of it either.
 *
 * `snapshot` is a JSON document of the structure and its items at the moment of the change — the only
 * way to show a parent the exact configuration their child was billed under.
 */
export const feeStructureAudit = pgTable(
  "fee_structure_audit",
  {
    id: primaryId(),
    feeStructureId: uuid("fee_structure_id")
      .notNull()
      .references(() => feeStructures.id, { onDelete: "cascade" }),
    /** `created`, `updated`, `deactivated`, `effective_window_changed`. */
    action: varchar("action", { length: 32 }).notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    changedByUserId: uuid("changed_by_user_id").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    reason: varchar("reason", { length: 500 }),
  },
  (t) => [
    index("fee_structure_audit_structure_idx").on(t.feeStructureId, t.changedAt),
    check(
      "fee_structure_audit_action_check",
      sql`${t.action} in ('created', 'updated', 'deactivated', 'effective_window_changed')`,
    ),
  ],
);
