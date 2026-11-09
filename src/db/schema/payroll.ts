/**
 * Payroll: the run, the per-employee calculation, adjustments, and the payment.
 *
 * `PRD.md` MODULE 8/9/10, `ARCHITECTURE.md` §20 and §22. `RULES.md` §39 is the specification and it is
 * short enough to quote, which is unusual: "**Completed units × configured per-unit amount** must form
 * the baseline calculation" and "extra replacement periods must be represented distinctly and must not
 * be counted twice."
 *
 * ## Why the numbers are duplicated
 *
 * Every other table in this schema refuses to store a derived value — no invoice outstanding balance,
 * no account balance, no attendance percentage that could disagree with its records. `payroll_items`
 * stores `netAmount` anyway, and the difference matters:
 *
 * - A **balance** is live. It changes as money arrives, and any cached copy can drift from the truth.
 * - A **payroll line** is a *frozen decision*. Once a run is `approved`, the figure is what the employee
 *   was paid and what the payslip says. If the underlying inputs are later corrected, the correction is a
 *   new run or an audited adjustment — it does not silently rewrite a payment already made.
 *
 * So these columns are the record of a calculation, not a cache of a running total, and
 * `payroll.adjustments` is where the provenance `ARCHITECTURE.md` §22 requires ("the final value must
 * have a clear provenance") is written down.
 *
 * ## What is not here
 *
 * No `totalNet` on `payroll_runs` either. The run total is `SUM(payroll_items.netAmount)`, and a stored
 * run total is the one place a drift would actually be noticed by a human — so it is a `SUM()`.
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
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
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
import { payrollStatusEnum } from "./_enums";
import { academicSessions, institutions } from "./institution";
import { employees, salaryAssignments } from "./hr";
import { teachers } from "./teacher";
import { users } from "./identity";

/**
 * `payroll_runs` — one institution's payroll for one month.
 *
 * ## The period is a range, not a name
 *
 * `periodStart`/`periodEnd` are real dates because every input to a calculation is filtered by them:
 * approved leave, completed periods, extra periods. A `period = '2026-03'` label cannot be compared
 * against a `date` column without a parsing convention that will differ between the payroll module and
 * the report that disagrees with it. `periodLabel` is kept as a display convenience and is explicitly
 * *not* the query key.
 *
 * ## `status` is the state machine `RULES.md` §39 asks for
 *
 * `draft → calculated → approved → paid → locked`, and it is monotonic. `locked` is `payroll_status_enum`
 * and exists so §44's "closed/read-only" control has a marker in payroll as well as in academic sessions
 * — a locked run cannot be recalculated, and the application refuses before touching a row rather than
 * after.
 *
 * `journalTransactionId` is `NOT NULL` only for a `paid` run, and that is enforced here rather than in a
 * comment: `RULES.md` §16 and `ARCHITECTURE.md` §21 both require the payment and its financial
 * transaction to commit together, so a `paid` run without a ledger journal is a state the database must
 * refuse.
 */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id").references(() => academicSessions.id, {
      onDelete: "set null",
    }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** Display label such as `March 2026`. Never a query key — see the note above. */
    periodLabel: varchar("period_label", { length: 64 }).notNull(),
    currency: currencyCode(),
    status: payrollStatusEnum("status").notNull().default("draft"),
    /** When the figures were last computed. Null while still `draft`. */
    calculatedAt: timestamp("calculated_at", { withTimezone: true, precision: 3 }),
    calculatedByUserId: uuid("calculated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    paidAt: timestamp("paid_at", { withTimezone: true, precision: 3 }),
    /**
     * The ledger journal for this run's payment. Required once paid, so the salary payment and its
     * ledger entries cannot diverge (enforced by `payroll_runs_journal_required`, not by a comment).
     * It is a bare uuid for a different reason: `payroll → finance` would close no cycle, because
     * `finance` imports only `institution`, and no other reason is recorded — an unexplained gap, in
     * `OMISSION_CANDIDATES` in `schema-contract.test.ts`.
     */
    journalTransactionId: uuid("journal_transaction_id"),
    lockedAt: timestamp("locked_at", { withTimezone: true, precision: 3 }),
    notes: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("payroll_runs_period_key").on(t.institutionId, t.periodStart, t.periodEnd),
    index("payroll_runs_institution_status_idx").on(t.institutionId, t.status, t.periodStart),
    currencyCodeCheck("payroll_runs_currency_check", t.currency),
    check("payroll_runs_period_check", sql`${t.periodEnd} >= ${t.periodStart}`),
    check(
      "payroll_runs_approval_pair",
      sql`${t.status} not in ('approved', 'paid', 'locked') or (${t.approvedByUserId} is not null and ${t.approvedAt} is not null)`,
    ),
    check(
      "payroll_runs_calculation_pair",
      sql`${t.status} = 'draft' or (${t.calculatedAt} is not null and ${t.calculatedByUserId} is not null)`,
    ),
    // A paid run must be in the ledger. This is the payroll half of `RULES.md` §16.
    check(
      "payroll_runs_journal_required",
      sql`${t.status} <> 'paid' or ${t.journalTransactionId} is not null`,
    ),
    check("payroll_runs_lock_pair", sql`${t.status} <> 'locked' or ${t.lockedAt} is not null`),
  ],
);

/**
 * `payroll_items` — one employee's calculated pay for one run.
 *
 * ## The columns are the formula, in order
 *
 * `RULES.md` §39 names the inputs; each has a column and nothing is computed at read time:
 *
 * - `baseAmount` — a fixed employee's monthly salary, or a unit-based employee's `unitCount × unitRate`.
 * - `unitCount` / `unitRate` — kept separate for a unit-based employee so the payslip can print
 *   "80 × 500", and kept null for a fixed one so the payslip does not print a rate that does not exist.
 * - `extraPeriodAmount` — the *additional* pay for approved replacement periods. **Separate from
 *   `baseAmount` on purpose**: `RULES.md` §39 says extra periods "must not be counted twice", and the only
 *   way to guarantee that is for the double-counting to be impossible to express.
 * - `attendanceDeduction` / `leaveDeduction` — absences and unpaid leave. Positive numbers, subtracted by
 *   the net formula; there is no signed deduction column.
 * - `adjustmentAmount` — the sum of `payroll_adjustments` for this item. Positive or negative.
 *
 * The net figure is then `base + extra + adjustment - attendance - leave`. It is **stored** because a
 * payslip is an issued document — see the file header.
 *
 * ## `employeeId` and `teacherId` together, not one or the other
 *
 * `ARCHITECTURE.md` §13 and ADR-0002: a teacher is an employee *and* a teacher. Unit-based pay needs
 * periods taught, which live on `teachers`; employment facts live on `employees`. Exactly one of the two
 * ids is set, checked below — a single nullable `payeeId` would make "which table does this point into?"
 * a question every query has to answer.
 */
export const payrollItems = pgTable(
  "payroll_items",
  {
    id: primaryId(),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    /** The employment. Set for every line — salary is an employment fact. */
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /**
     * Set when this line pays a teacher and unit-based rules apply.
     *
     * `teachers.userId` rather than a surrogate: `teacher.ts` makes `user_id` the primary key of the
     * profile (ADR-0002), so this id is the same value as `payroll_items.employeeId` for a teacher who is
     * also an employee. Referencing it is correct and keeps the two joins trivially comparable.
     */
    teacherId: uuid("teacher_id").references(() => teachers.userId, { onDelete: "restrict" }),
    /** The dated salary configuration this line was calculated from (`ARCHITECTURE.md` §20). */
    salaryAssignmentId: uuid("salary_assignment_id").references(() => salaryAssignments.id, {
      onDelete: "set null",
    }),
    currency: currencyCode(),
    /** The fixed monthly salary, or `unitCount × unitRate` for unit-based pay. */
    baseAmount: moneyAmount("base_amount"),
    /** Completed periods in the period. Null for a fixed employee. */
    unitCount: integer("unit_count"),
    /** The configured per-unit amount. Null for a fixed employee. */
    unitRate: optionalMoneyAmount("unit_rate"),
    /**
     * Pay for approved replacement/extra periods. Counted separately from `unitCount` so the same period
     * cannot be paid as both a completed unit and an extra period — `RULES.md` §39's "must not be counted
     * twice", enforced by the shape of the row rather than by a reviewer's diligence.
     */
    extraPeriodCount: integer("extra_period_count").notNull().default(0),
    extraPeriodAmount: optionalMoneyAmount("extra_period_amount"),
    /** Payable absences, as a whole number of units. */
    absenceDays: integer("absence_days").notNull().default(0),
    attendanceDeduction: optionalMoneyAmount("attendance_deduction"),
    /** Unpaid approved leave days. Approved *paid* leave never produces a deduction. */
    unpaidLeaveDays: integer("unpaid_leave_days").notNull().default(0),
    leaveDeduction: optionalMoneyAmount("leave_deduction"),
    /** Sum of `payroll_adjustments.amount` for this item. Signed. */
    adjustmentAmount: optionalMoneyAmount("adjustment_amount"),
    /** `base + extra + adjustment - attendance - leave`. Stored: a payslip is an issued document. */
    netAmount: moneyAmount("net_amount"),
    /** The inputs, verbatim, so a recalculation can explain itself. See the note on this column. */
    calculationBreakdown:
      jsonb("calculation_breakdown").$type<Record<string, string | number | boolean | null>>(),
    isExcluded: boolean("is_excluded").notNull().default(false),
    exclusionReason: varchar("exclusion_reason", { length: 300 }),
    notes: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("payroll_items_run_employee_key").on(t.payrollRunId, t.employeeId),
    index("payroll_items_run_idx").on(t.payrollRunId, t.isExcluded),
    index("payroll_items_employee_idx").on(t.employeeId),
    index("payroll_items_teacher_idx").on(t.teacherId),
    currencyCodeCheck("payroll_items_currency_check", t.currency),
    // Unit counts cannot be negative; a negative count is a subtraction wearing a count's clothes.
    check("payroll_items_unit_count_check", sql`${t.unitCount} is null or ${t.unitCount} >= 0`),
    check("payroll_items_extra_period_count_check", sql`${t.extraPeriodCount} >= 0`),
    check("payroll_items_absence_days_check", sql`${t.absenceDays} >= 0`),
    check("payroll_items_leave_days_check", sql`${t.unpaidLeaveDays} >= 0`),
    // A rate without a count is meaningless and a count without a rate is unpriced: both or neither.
    check(
      "payroll_items_unit_pair_check",
      sql`num_nonnulls(${t.unitCount}, ${t.unitRate}) in (0, 2)`,
    ),
    check("payroll_items_base_amount_check", sql`${t.baseAmount} >= 0`),
    check(
      "payroll_items_deduction_check",
      sql`coalesce(${t.attendanceDeduction}, 0) >= 0 and coalesce(${t.leaveDeduction}, 0) >= 0`,
    ),
    check(
      "payroll_items_extra_period_check",
      sql`${t.extraPeriodCount} = 0 or ${t.extraPeriodAmount} is not null`,
    ),
    // Excluding a line without saying why is the opposite of auditable (`ARCHITECTURE.md` §22).
    check(
      "payroll_items_exclusion_reason_check",
      sql`${t.isExcluded} = false or ${t.exclusionReason} is not null`,
    ),
  ],
);

/**
 * `payroll_adjustments` — a manual change to a calculated figure.
 *
 * `PRD.md` MODULE 9 requires authorized HR/Admin users to "apply manual adjustments" and states "manual
 * modifications must be auditable"; `RULES.md` §37 and `ARCHITECTURE.md` §22 are the rules it satisfies.
 *
 * ## Why this is a table and not a column on `payroll_items`
 *
 * §22 requires that a future user can see **what the system originally calculated** alongside **what it
 * was adjusted to**. A column holding only the final number destroys the original; a column holding both
 * needs two more and still cannot answer "who, when, why". So the adjustment is its own row: signed
 * `amount`, mandatory `reason`, and the approval pair below.
 *
 * `adjustmentType` is a check rather than an enum because it is this table's own vocabulary and, unlike
 * `payment_method` or `expense_category`, no other module needs to read it.
 */
export const payrollAdjustments = pgTable(
  "payroll_adjustments",
  {
    id: primaryId(),
    payrollItemId: uuid("payroll_item_id")
      .notNull()
      .references(() => payrollItems.id, { onDelete: "cascade" }),
    /**
     * `bonus`, `deduction`, `overtime`, `correction`, `allowance`, `clawback`.
     *
     * `correction` is the one that matters: it fixes a miscounted input (a missing period, a wrong
     * absence) and points at what was wrong, so the underlying record can be fixed too.
     */
    adjustmentType: varchar("adjustment_type", { length: 16 }).notNull(),
    /** Signed. Positive adds to the net figure, negative subtracts. */
    amount: moneyAmount("amount"),
    /** Mandatory. A manual override without a reason is unauditable (`RULES.md` §37). */
    reason: text("reason").notNull(),
    /** For `correction`: the record that was wrong, so the source data can be repaired. */
    correctsRecordType: varchar("corrects_record_type", { length: 32 }),
    correctsRecordId: uuid("corrects_record_id"),
    /** What the calculation produced before this adjustment. The §22 provenance requirement. */
    previousNetAmount: optionalMoneyAmount("previous_net_amount"),
    appliedByUserId: uuid("applied_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    appliedAt: timestamp("applied_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    /** Null while the adjustment is proposed; required once the run is approved. */
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
    /** An adjustment that is later found to be wrong is reversed, not deleted. */
    reversedByUserId: uuid("reversed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reversedAt: timestamp("reversed_at", { withTimezone: true, precision: 3 }),
    reversalReason: text("reversal_reason"),
  },
  (t) => [
    index("payroll_adjustments_item_idx").on(t.payrollItemId),
    index("payroll_adjustments_applied_by_idx").on(t.appliedByUserId, t.appliedAt),
    check(
      "payroll_adjustments_type_check",
      sql`${t.adjustmentType} in ('bonus', 'deduction', 'overtime', 'correction', 'allowance', 'clawback')`,
    ),
    check("payroll_adjustments_amount_nonzero", sql`${t.amount} <> 0`),
    check(
      "payroll_adjustments_approval_pair",
      sql`num_nonnulls(${t.approvedByUserId}, ${t.approvedAt}) in (0, 2)`,
    ),
    check(
      "payroll_adjustments_reversal_pair",
      sql`num_nonnulls(${t.reversedByUserId}, ${t.reversedAt}, ${t.reversalReason}) in (0, 3)`,
    ),
    // A correction must say what it corrects, or "fix the payroll" and "change the payroll" are the same
    // action with different names.
    check(
      "payroll_adjustments_correction_target_check",
      sql`${t.adjustmentType} <> 'correction' or num_nonnulls(${t.correctsRecordType}, ${t.correctsRecordId}) = 2`,
    ),
  ],
);

/**
 * `payroll_payments` — the actual disbursement for a run.
 *
 * ## One payment per run, per account
 *
 * `PRD.md` MODULE 10 (Accountant Portal) makes bulk salary payment a single act. The unique key on
 * `(payroll_run_id, ledger_account_id)` is what prevents the classic failure: running the payment batch
 * twice and paying every employee twice. `RULES.md` §36 lists "prevent duplicate transactions" as a
 * financial-integrity requirement, so this is enforced by the database rather than by a disabled button.
 *
 * `paymentReference` is the bank's own reference, unique per institution — the thing that makes a
 * reconciliation match possible (`finance.bank_reconciliation_items`).
 *
 * `ledgerAccountId` has no foreign key, and the cycle once claimed for it does not exist: `payroll →
 * finance` would be the only edge between the two modules, and `finance` imports just `institution`,
 * so nothing loops back. Nothing else in the schema records a reason either, so the gap is listed as
 * unexplained in `OMISSION_CANDIDATES` in `schema-contract.test.ts`. The standing cost of a bare
 * uuid is the same wherever it appears: **no relation in `relations.ts`** (that file is generated
 * from `references()` calls), so the account is joined with an explicit `eq()` rather than a
 * `with: { … }` read, and an account deletion cannot cascade here.
 */
export const payrollPayments = pgTable(
  "payroll_payments",
  {
    id: primaryId(),
    /**
     * Denormalised from the run. Every money table in this schema is institution-scoped, and this one
     * needs it for a second reason: the bank's transfer reference is unique *per institution*, so
     * without this column the unique key could only be `(run, reference)` and a batch could be
     * re-submitted under a different run against the same bank reference.
     */
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "restrict" }),
    /**
     * The account the salaries left. Bare uuid: `payroll → finance` closes no cycle (`finance`
     * imports only `institution`) and no other reason is recorded, so it is an unexplained gap —
     * see `OMISSION_CANDIDATES` in `schema-contract.test.ts`.
     */
    ledgerAccountId: uuid("ledger_account_id").notNull(),
    amount: moneyAmount("amount"),
    currency: currencyCode(),
    /** `pending`, `processing`, `completed`, `failed`, `reversed`. */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** The bank's transfer reference. Unique per institution, and nullable until it exists. */
    paymentReference: varchar("payment_reference", { length: 128 }),
    paidAt: timestamp("paid_at", { withTimezone: true, precision: 3 }),
    processedByUserId: uuid("processed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    failureReason: text("failure_reason"),
    notes: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    // Duplicate-payment prevention, at the database level.
    uniqueIndex("payroll_payments_run_account_key").on(t.payrollRunId, t.ledgerAccountId),
    uniqueIndex("payroll_payments_reference_key")
      .on(t.institutionId, t.paymentReference)
      .where(sql`${t.paymentReference} is not null`),
    index("payroll_payments_status_idx").on(t.status),
    index("payroll_payments_institution_idx").on(t.institutionId, t.status),
    currencyCodeCheck("payroll_payments_currency_check", t.currency),
    check("payroll_payments_amount_positive", sql`${t.amount} > 0`),
    check(
      "payroll_payments_status_check",
      sql`${t.status} in ('pending', 'processing', 'completed', 'failed', 'reversed')`,
    ),
    check(
      "payroll_payments_completion_pair",
      sql`${t.status} <> 'completed' or ${t.paidAt} is not null`,
    ),
    check(
      "payroll_payments_failure_reason_check",
      sql`${t.status} <> 'failed' or ${t.failureReason} is not null`,
    ),
  ],
);

/**
 * `payroll_payslips` — the document an employee actually receives.
 *
 * Separate from `payroll_items` because a payslip is *issued*: it has a number, a generation time, a PDF
 * in storage and a lifecycle (`draft → generated → shared`), while the item is a row of arithmetic. A
 * regeneration must produce a new document rather than mutate the one the employee already downloaded —
 * the same issued-document rule `fees.receipts` follows.
 *
 * `storageKey` is a key, never bytes: `ARCHITECTURE.md` §51.
 *
 * `institutionId` is denormalized from the owning run rather than joined through it. A unique constraint
 * cannot span tables, so without it `slipNumber` would have to be globally unique and the sequence could
 * never restart at 1 for a new institution. `fees.receipts` makes the same trade for `receiptNumber`, and
 * the two tables are the same shape: a tenant-scoped financial document numbered from a per-tenant
 * sequence. The application sets this from the run it read, never from the client.
 */
export const payrollPayslips = pgTable(
  "payroll_payslips",
  {
    id: primaryId(),
    payrollItemId: uuid("payroll_item_id")
      .notNull()
      .references(() => payrollItems.id, { onDelete: "restrict" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** Per-institution sequence. The number an employee quotes when asking about a pay month. */
    slipNumber: varchar("slip_number", { length: 64 }).notNull(),
    /** `draft`, `generated`, `shared`, `superseded`. */
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    /** Opaque storage key for the rendered PDF. `ARCHITECTURE.md` §51: no binary in the database. */
    storageKey: varchar("storage_key", { length: 512 }),
    generatedAt: timestamp("generated_at", { withTimezone: true, precision: 3 }),
    sharedAt: timestamp("shared_at", { withTimezone: true, precision: 3 }),
    sharedByUserId: uuid("shared_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** A reissued slip supersedes the old one; the original row is kept. */
    supersededBySlipId: uuid("superseded_by_slip_id").references(
      (): AnyPgColumn => payrollPayslips.id,
      { onDelete: "set null" },
    ),
    /** The figures exactly as printed, so a later recalculation cannot change what was issued. */
    printedBreakdown: jsonb("printed_breakdown").$type<Record<string, string | number>>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payroll_payslips_number_key").on(t.institutionId, t.slipNumber),
    index("payroll_payslips_item_idx").on(t.payrollItemId),
    check(
      "payroll_payslips_status_check",
      sql`${t.status} in ('draft', 'generated', 'shared', 'superseded')`,
    ),
    check(
      "payroll_payslips_storage_required",
      sql`${t.status} = 'draft' or (${t.storageKey} is not null and ${t.generatedAt} is not null)`,
    ),
    // A slip cannot supersede itself.
    check(
      "payroll_payslips_no_self_supersession",
      sql`${t.supersededBySlipId} is null or ${t.supersededBySlipId} <> ${t.id}`,
    ),
  ],
);

/**
 * `payroll_period_locks` — a period an institution has closed for payroll.
 *
 * The reason this exists separately from `payroll_runs.status = 'locked'`: a lock must be enforceable
 * *before* a run exists. `RULES.md` §36 requires history to be maintained and §44 requires closed
 * periods to be read-only, and both are only real if "March is closed" is a fact about March rather than
 * a property of the one run that happened to be locked. A second run for a locked month must be
 * impossible even though no `payroll_runs` row exists yet — which is exactly what this table gives us,
 * because the unique key makes "one lock per period" a fact and `locked_at` makes it attributable.
 */
export const payrollPeriodLocks = pgTable(
  "payroll_period_locks",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    lockedByUserId: uuid("locked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payroll_period_locks_period_key").on(t.institutionId, t.periodStart, t.periodEnd),
    check("payroll_period_locks_period_check", sql`${t.periodEnd} >= ${t.periodStart}`),
  ],
);

/**
 * `payroll_calculation_sources` — which attendance, leave and period rows fed a calculation.
 *
 * `ARCHITECTURE.md` §22 asks for provenance, and `RULES.md` §41 requires attendance changes to be
 * permission-controlled. Together they make this necessary: when a Floor-Incharge marks a teacher
 * present *after* payroll was calculated, somebody has to be able to answer "was this mark in the
 * calculation or not?" Without a record of the inputs, the honest answer is unknowable and the payroll
 * has to be redone from scratch to find out.
 *
 * So every calculation writes the id of each input row it consumed, with the quantity taken from it. The
 * result is that a correction after the fact produces exactly the rows whose sources are now stale,
 * instead of a full recalculation and a manual diff.
 */
export const payrollCalculationSources = pgTable(
  "payroll_calculation_sources",
  {
    id: primaryId(),
    payrollItemId: uuid("payroll_item_id")
      .notNull()
      .references(() => payrollItems.id, { onDelete: "cascade" }),
    /**
     * `attendance`, `leave`, `schedule`, `extra_period`, `salary_assignment`.
     *
     * The discriminator follows `ARCHITECTURE.md` §9: a cross-domain reference is a type plus an id,
     * resolved by the owning module, not a nullable column per domain.
     */
    sourceType: varchar("source_type", { length: 24 }).notNull(),
    /** Id within `sourceType`. Not a foreign key — five tables live behind this one column. */
    sourceRecordId: uuid("source_record_id").notNull(),
    /** The quantity taken from that row: 1 period, 3 days, 500.00. */
    quantity: varchar("quantity", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    // The same input row is consumed once per item. Two consumption rows for one period is the double
    // count `RULES.md` §39 forbids, made unrepresentable.
    uniqueIndex("payroll_calculation_sources_unique").on(
      t.payrollItemId,
      t.sourceType,
      t.sourceRecordId,
    ),
    index("payroll_calculation_sources_record_idx").on(t.sourceType, t.sourceRecordId),
    check(
      "payroll_calculation_sources_type_check",
      sql`${t.sourceType} in ('attendance', 'leave', 'schedule', 'extra_period', 'salary_assignment')`,
    ),
  ],
);
