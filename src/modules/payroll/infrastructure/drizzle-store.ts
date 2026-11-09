/**
 * The Drizzle implementation of {@link PayrollStore} — the only payroll file that imports
 * `@/db/client` or a table. Three of its responsibilities are the phase's requirements stated in
 * their proper layer:
 *
 * 1. **A calculation is one transaction.** `loadCalculationInputs` and `persistCalculation` both
 *    take the executor, so a figure written is a function of one snapshot: a timetable that moves
 *    between two reads cannot produce a payslip no single moment supports (`RULES.md` §39).
 * 2. **A line survives its recalculation.** `persistCalculation` *upserts* on
 *    `payroll_items_run_employee_key` rather than deleting and re-inserting: those rows are the
 *    parents of `payroll_adjustments`, and a cascade delete would destroy the manual work
 *    `RULES.md` §37 exists to protect. The item keeps its id, so an adjustment's author and the
 *    figure it was applied to survive every recalculation.
 * 3. **An extra period is stamped when it is paid.** `extra_periods.consumed_by_pay_line_id` is
 *    set inside the same transaction, so the double-count §39 forbids is not merely unlikely but
 *    unavailable: a second calculation reads only unconsumed payable periods.
 *
 * The run total is `SUM(payroll_items.net_amount)` — never a stored column, which `payroll.ts`
 * deliberately refuses. Money is read as the decimal text the numeric columns hold and summed with
 * `@/shared/money`, so no figure passes through a float.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import type { DbLike } from "@/db/client";
import { postPayrollCollectionWithin } from "@/modules/finance";
import { schedules, timeSlots } from "@/db/schema/academic";
import { academicSessions } from "@/db/schema/institution";
import { users } from "@/db/schema/identity";
import {
  employeeAttendance,
  employees,
  leaveRequests,
  leaveTypes,
  salaryAssignments,
  salaryStructures,
} from "@/db/schema/hr";
import { extraPeriods } from "@/db/schema/floor-operations";
import { financialAccounts } from "@/db/schema/finance";
import {
  payrollAdjustments,
  payrollCalculationSources,
  payrollItems,
  payrollPayments,
  payrollPeriodLocks,
  payrollRuns,
} from "@/db/schema/payroll";
import { ConflictError, InternalError, NotFoundError } from "@/shared/errors";
import { fromDecimalText, sum, toDecimalText, type Money } from "@/shared/money";

import { payrollNetAmount } from "../domain/payroll-rules";

import type {
  EmployeePayrollHistoryRow,
  PayrollAdjustmentRow,
  PayrollItemRow,
  PayrollPaymentRow,
  PayrollPeriodLockWrite,
  PayrollRunDetailRow,
  PayrollRunListRow,
  PayrollRunWrite,
  PayrollStore,
} from "../application/ports";

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The sum of a run's lines, in the run's currency.
 *
 * Exported so `drizzle-store.test.ts` can assert it without a database, and so the SQL version
 * (`SUM(net_amount)`) has a second, readable formulation to be checked against.
 */
export function sumNetAmounts(amounts: readonly string[], currency: string): Money {
  return sum(
    amounts.map((amount) => fromDecimalText(amount, currency)),
    currency,
  );
}

/** PostgreSQL's unique-violation code. Exported for the store's own unit tests. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "23505"
  );
}

/**
 * The user-facing half of a unique violation, by constraint.
 *
 * The same `23505` covers a run that already exists for the period, a period already locked, and a
 * second payment for a run — three mistakes that need three different sentences, so the constraint
 * name is read out of the driver's message rather than guessed at.
 */
export function uniqueConflictError(error: unknown): ConflictError | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const raw = "message" in error ? (error as { readonly message?: unknown }).message : undefined;
  if (typeof raw !== "string") return undefined;
  const match = /unique constraint "([^"]+)"/i.exec(raw);
  switch (match?.[1]) {
    case "payroll_runs_period_key":
      return new ConflictError("A payroll run already exists for this period.", {
        userMessage: "A run for this period already exists. Open it instead of creating another.",
      });
    case "payroll_period_locks_period_key":
      return new ConflictError("This payroll period is already closed.", {
        userMessage: "This period has already been closed for payroll.",
      });
    case "payroll_payments_run_account_key":
      return new ConflictError("This run has already been paid from that account.", {
        userMessage: "This run has already been paid. A second batch would pay it twice.",
      });
    case "payroll_items_run_employee_key":
      return new ConflictError("This employee already has a line in this run.", {
        userMessage: "This employee already has a line in this run.",
      });
    default:
      return undefined;
  }
}

/** A version-guarded write that touched no row: a stale token, or a row that is gone. */
async function expectVersionedRow(
  rows: readonly { readonly id: string }[],
  label: string,
): Promise<void> {
  if (rows.length > 0) return;
  throw new ConflictError(`${label} was changed by someone else.`, {
    userMessage: `This ${label.toLowerCase()} was changed by someone else. Refresh and try again.`,
  });
}

/** The columns a payroll line reads, with the names a payslip needs. */
const itemSelect = {
  id: payrollItems.id,
  payrollRunId: payrollItems.payrollRunId,
  employeeId: payrollItems.employeeId,
  employeeName: users.name,
  employeeEmail: users.email,
  employeeCode: employees.employeeCode,
  teacherId: payrollItems.teacherId,
  salaryAssignmentId: payrollItems.salaryAssignmentId,
  salaryStructureName: salaryStructures.name,
  currency: payrollItems.currency,
  baseAmount: payrollItems.baseAmount,
  unitCount: payrollItems.unitCount,
  unitRate: payrollItems.unitRate,
  extraPeriodCount: payrollItems.extraPeriodCount,
  extraPeriodAmount: payrollItems.extraPeriodAmount,
  absenceDays: payrollItems.absenceDays,
  attendanceDeduction: payrollItems.attendanceDeduction,
  unpaidLeaveDays: payrollItems.unpaidLeaveDays,
  leaveDeduction: payrollItems.leaveDeduction,
  adjustmentAmount: payrollItems.adjustmentAmount,
  netAmount: payrollItems.netAmount,
  calculationBreakdown: payrollItems.calculationBreakdown,
  isExcluded: payrollItems.isExcluded,
  exclusionReason: payrollItems.exclusionReason,
  notes: payrollItems.notes,
  createdAt: payrollItems.createdAt,
  updatedAt: payrollItems.updatedAt,
  version: payrollItems.version,
};

/** The selected shape of a {@link itemSelect} row. Declared, because a column object is not a value. */
interface ItemSelection {
  readonly id: string;
  readonly payrollRunId: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly employeeEmail: string;
  readonly employeeCode: string;
  readonly teacherId: string | null;
  readonly salaryAssignmentId: string | null;
  readonly salaryStructureName: string | null;
  readonly currency: string;
  readonly baseAmount: string;
  readonly unitCount: number | null;
  readonly unitRate: string | null;
  readonly extraPeriodCount: number;
  readonly extraPeriodAmount: string | null;
  readonly absenceDays: number;
  readonly attendanceDeduction: string | null;
  readonly unpaidLeaveDays: number;
  readonly leaveDeduction: string | null;
  readonly adjustmentAmount: string | null;
  readonly netAmount: string;
  readonly calculationBreakdown: Record<string, string | number | boolean | null> | null;
  readonly isExcluded: boolean;
  readonly exclusionReason: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

function toItemRow(row: ItemSelection): PayrollItemRow {
  return {
    id: row.id,
    payrollRunId: row.payrollRunId,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeEmail: row.employeeEmail,
    employeeCode: row.employeeCode,
    teacherId: row.teacherId,
    salaryAssignmentId: row.salaryAssignmentId,
    salaryStructureName: row.salaryStructureName,
    currency: row.currency,
    baseAmount: row.baseAmount,
    unitCount: row.unitCount,
    unitRate: row.unitRate,
    extraPeriodCount: row.extraPeriodCount,
    extraPeriodAmount: row.extraPeriodAmount,
    absenceDays: row.absenceDays,
    attendanceDeduction: row.attendanceDeduction,
    unpaidLeaveDays: row.unpaidLeaveDays,
    leaveDeduction: row.leaveDeduction,
    adjustmentAmount: row.adjustmentAmount,
    netAmount: row.netAmount,
    calculationBreakdown: row.calculationBreakdown,
    isExcluded: row.isExcluded,
    exclusionReason: row.exclusionReason,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/** The sign flip a reversal applies to an adjustment's amount. */
function negateAmount(amount: string): string {
  const value = fromDecimalText(amount, "PKR");
  return toDecimalText({ amountMinor: -value.amountMinor, currency: value.currency });
}

/**
 * Restate one item's stored net after an adjustment landed or was reversed.
 *
 * The item keeps the figures the calculation produced, and its `adjustmentAmount` plus its
 * `netAmount` are the sum of the adjustments that are still live. `ARCHITECTURE.md` §22 requires
 * the *previous* figure to be visible, and that is what `payroll_adjustments.previous_net_amount`
 * is written from — this function only moves the running net forward.
 */
async function restateItem(tx: DbLike, itemId: string, adjustment: string): Promise<void> {
  const rows = await tx
    .select({
      currency: payrollItems.currency,
      adjustmentAmount: payrollItems.adjustmentAmount,
      baseAmount: payrollItems.baseAmount,
      extraPeriodAmount: payrollItems.extraPeriodAmount,
      attendanceDeduction: payrollItems.attendanceDeduction,
      leaveDeduction: payrollItems.leaveDeduction,
    })
    .from(payrollItems)
    .where(eq(payrollItems.id, itemId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new NotFoundError("Payroll item does not exist.");

  const nextAdjustment = toDecimalText(
    sum(
      [fromDecimalText(row.adjustmentAmount ?? "0.00", "PKR"), fromDecimalText(adjustment, "PKR")],
      "PKR",
    ),
  );
  // The item's own figures, restated with the domain formula — the same arithmetic
  // `payrollNetAmount` performs, so an adjusted payslip and a calculated one agree by construction.
  const netAmount = toDecimalText(
    payrollNetAmount({
      currency: row.currency,
      baseAmount: row.baseAmount,
      extraPeriodAmount: row.extraPeriodAmount ?? "0.00",
      adjustmentAmount: nextAdjustment,
      attendanceDeduction: row.attendanceDeduction ?? "0.00",
      leaveDeduction: row.leaveDeduction ?? "0.00",
    }),
  );

  await tx
    .update(payrollItems)
    .set({
      adjustmentAmount: nextAdjustment,
      netAmount,
      updatedAt: new Date(),
      version: sql`${payrollItems.version} + 1`,
    })
    .where(eq(payrollItems.id, itemId));
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */
export function createPayrollStore(executor: DbLike): PayrollStore {
  return {
    /* ---- Reads ------------------------------------------------------------ */

    async runInTransaction(work) {
      return work(executor as DbLike);
    },

    async listPayrollRuns(institutionId) {
      const rows = await executor
        .select({
          id: payrollRuns.id,
          institutionId: payrollRuns.institutionId,
          academicSessionName: academicSessions.name,
          periodStart: payrollRuns.periodStart,
          periodEnd: payrollRuns.periodEnd,
          periodLabel: payrollRuns.periodLabel,
          currency: payrollRuns.currency,
          status: payrollRuns.status,
          calculatedAt: payrollRuns.calculatedAt,
          calculatedByName: users.name,
          approvedByUserId: payrollRuns.approvedByUserId,
          approvedAt: payrollRuns.approvedAt,
          paidAt: payrollRuns.paidAt,
          notes: payrollRuns.notes,
          createdAt: payrollRuns.createdAt,
          updatedAt: payrollRuns.updatedAt,
          version: payrollRuns.version,
        })
        .from(payrollRuns)
        .leftJoin(academicSessions, eq(academicSessions.id, payrollRuns.academicSessionId))
        .leftJoin(users, eq(users.id, payrollRuns.calculatedByUserId))
        .where(eq(payrollRuns.institutionId, institutionId))
        .orderBy(desc(payrollRuns.periodStart));

      const totals = await executor
        .select({
          payrollRunId: payrollItems.payrollRunId,
          netAmount: sql<string | null>`sum(${payrollItems.netAmount})`,
          included: sql<number>`count(*) filter (where ${payrollItems.isExcluded} = false)`,
          excluded: sql<number>`count(*) filter (where ${payrollItems.isExcluded} = true)`,
        })
        .from(payrollItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
        .where(eq(payrollRuns.institutionId, institutionId))
        .groupBy(payrollItems.payrollRunId);

      const byRun = new Map(
        totals.map((row) => [
          row.payrollRunId,
          {
            net: row.netAmount,
            included: Number(row.included ?? 0),
            excluded: Number(row.excluded ?? 0),
          },
        ]),
      );

      return rows.map((row): PayrollRunListRow => {
        const total = byRun.get(row.id);
        return {
          id: row.id,
          institutionId: row.institutionId,
          academicSessionName: row.academicSessionName,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          periodLabel: row.periodLabel,
          currency: row.currency,
          status: row.status,
          calculatedAt: row.calculatedAt,
          calculatedByName: row.calculatedByName,
          approvedByName: null,
          approvedAt: row.approvedAt,
          paidAt: row.paidAt,
          notes: row.notes,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          version: row.version,
          netTotal: total?.net ?? "0.00",
          includedCount: total?.included ?? 0,
          excludedCount: total?.excluded ?? 0,
        };
      });
    },

    async getPayrollRun(institutionId, payrollRunId) {
      const header = await executor
        .select({
          id: payrollRuns.id,
          institutionId: payrollRuns.institutionId,
          academicSessionName: academicSessions.name,
          periodStart: payrollRuns.periodStart,
          periodEnd: payrollRuns.periodEnd,
          periodLabel: payrollRuns.periodLabel,
          currency: payrollRuns.currency,
          status: payrollRuns.status,
          calculatedAt: payrollRuns.calculatedAt,
          calculatedByName: users.name,
          approvedAt: payrollRuns.approvedAt,
          paidAt: payrollRuns.paidAt,
          notes: payrollRuns.notes,
          createdAt: payrollRuns.createdAt,
          updatedAt: payrollRuns.updatedAt,
          version: payrollRuns.version,
        })
        .from(payrollRuns)
        .leftJoin(academicSessions, eq(academicSessions.id, payrollRuns.academicSessionId))
        .leftJoin(users, eq(users.id, payrollRuns.calculatedByUserId))
        .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.institutionId, institutionId)))
        .limit(1);

      const run = header[0];
      if (run === undefined) return null;

      const [lineRows, paymentRows] = await Promise.all([
        executor
          .select({ item: itemSelect })
          .from(payrollItems)
          .innerJoin(employees, eq(employees.id, payrollItems.employeeId))
          .innerJoin(users, eq(users.id, employees.userId))
          .leftJoin(salaryAssignments, eq(salaryAssignments.id, payrollItems.salaryAssignmentId))
          .leftJoin(salaryStructures, eq(salaryStructures.id, salaryAssignments.salaryStructureId))
          .where(eq(payrollItems.payrollRunId, payrollRunId))
          .orderBy(asc(employees.employeeCode)),
        executor
          .select({
            id: payrollPayments.id,
            institutionId: payrollPayments.institutionId,
            payrollRunId: payrollPayments.payrollRunId,
            ledgerAccountId: payrollPayments.ledgerAccountId,
            ledgerAccountName: financialAccounts.name,
            amount: payrollPayments.amount,
            currency: payrollPayments.currency,
            status: payrollPayments.status,
            paymentReference: payrollPayments.paymentReference,
            paidAt: payrollPayments.paidAt,
            processedByName: users.name,
            failureReason: payrollPayments.failureReason,
            notes: payrollPayments.notes,
            createdAt: payrollPayments.createdAt,
            updatedAt: payrollPayments.updatedAt,
          })
          .from(payrollPayments)
          .leftJoin(financialAccounts, eq(financialAccounts.id, payrollPayments.ledgerAccountId))
          .leftJoin(users, eq(users.id, payrollPayments.processedByUserId))
          .where(eq(payrollPayments.payrollRunId, payrollRunId)),
      ]);

      const lines = lineRows.map((row) => toItemRow(row.item));
      const payments: readonly PayrollPaymentRow[] = paymentRows.map((row) => ({
        id: row.id,
        institutionId: row.institutionId,
        payrollRunId: row.payrollRunId,
        ledgerAccountId: row.ledgerAccountId,
        ledgerAccountName: row.ledgerAccountName,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        paymentReference: row.paymentReference,
        paidAt: row.paidAt,
        processedByName: row.processedByName,
        failureReason: row.failureReason,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      const adjustmentCounts = await executor
        .select({ count: sql<number>`count(*)` })
        .from(payrollAdjustments)
        .innerJoin(payrollItems, eq(payrollItems.id, payrollAdjustments.payrollItemId))
        .where(eq(payrollItems.payrollRunId, payrollRunId));

      const total = sumNetAmounts(
        lines.filter((line) => !line.isExcluded).map((line) => line.netAmount),
        run.currency,
      );

      return {
        id: run.id,
        institutionId: run.institutionId,
        academicSessionName: run.academicSessionName,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        periodLabel: run.periodLabel,
        currency: run.currency,
        status: run.status,
        calculatedAt: run.calculatedAt,
        calculatedByName: run.calculatedByName,
        approvedByName: null,
        approvedAt: run.approvedAt,
        paidAt: run.paidAt,
        notes: run.notes,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        version: run.version,
        netTotal: toDecimalText(total),
        includedCount: lines.filter((line) => !line.isExcluded).length,
        excludedCount: lines.filter((line) => line.isExcluded).length,
        lines,
        payments,
        adjustmentCount: Number(adjustmentCounts[0]?.count ?? 0),
      } satisfies PayrollRunDetailRow;
    },

    async listPayrollAdjustments(institutionId, payrollRunId) {
      const rows = await executor
        .select({
          id: payrollAdjustments.id,
          payrollItemId: payrollAdjustments.payrollItemId,
          adjustmentType: payrollAdjustments.adjustmentType,
          amount: payrollAdjustments.amount,
          reason: payrollAdjustments.reason,
          correctsRecordType: payrollAdjustments.correctsRecordType,
          correctsRecordId: payrollAdjustments.correctsRecordId,
          previousNetAmount: payrollAdjustments.previousNetAmount,
          appliedByName: users.name,
          appliedAt: payrollAdjustments.appliedAt,
          approvedAt: payrollAdjustments.approvedAt,
          reversedAt: payrollAdjustments.reversedAt,
          reversalReason: payrollAdjustments.reversalReason,
        })
        .from(payrollAdjustments)
        .innerJoin(payrollItems, eq(payrollItems.id, payrollAdjustments.payrollItemId))
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
        .leftJoin(users, eq(users.id, payrollAdjustments.appliedByUserId))
        .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.institutionId, institutionId)))
        .orderBy(asc(payrollAdjustments.appliedAt));

      const grouped = new Map<string, PayrollAdjustmentRow[]>();
      for (const row of rows) {
        const existing = grouped.get(row.payrollItemId) ?? [];
        existing.push({
          id: row.id,
          payrollItemId: row.payrollItemId,
          adjustmentType: row.adjustmentType,
          adjustmentTypeLabel: row.adjustmentType,
          amount: row.amount,
          reason: row.reason,
          correctsRecordType: row.correctsRecordType,
          correctsRecordId: row.correctsRecordId,
          previousNetAmount: row.previousNetAmount,
          appliedByName: row.appliedByName,
          appliedAt: row.appliedAt,
          approvedByName: null,
          approvedAt: row.approvedAt,
          reversedByName: null,
          reversedAt: row.reversedAt,
          reversalReason: row.reversalReason,
        });
        grouped.set(row.payrollItemId, existing);
      }
      return grouped;
    },

    async employeePayrollHistory(institutionId, employeeId) {
      const rows = await executor
        .select({
          id: payrollItems.id,
          periodStart: payrollRuns.periodStart,
          periodEnd: payrollRuns.periodEnd,
          periodLabel: payrollRuns.periodLabel,
          status: payrollRuns.status,
          netAmount: payrollItems.netAmount,
          currency: payrollItems.currency,
          paidAt: payrollRuns.paidAt,
          calculatedAt: payrollRuns.calculatedAt,
        })
        .from(payrollItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
        .innerJoin(employees, eq(employees.id, payrollItems.employeeId))
        .innerJoin(users, eq(users.id, employees.userId))
        .where(
          and(
            eq(payrollItems.employeeId, employeeId),
            eq(payrollRuns.institutionId, institutionId),
            eq(payrollItems.isExcluded, false),
          ),
        )
        .orderBy(desc(payrollRuns.periodStart));

      return rows.map((row): EmployeePayrollHistoryRow => ({
        id: row.id,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        periodLabel: row.periodLabel,
        runStatus: row.status,
        netAmount: row.netAmount,
        currency: row.currency,
        paidAt: row.paidAt,
        computedAt: row.calculatedAt ?? new Date(),
      }));
    },

    /* ---- Writes ----------------------------------------------------------- */

    async createPayrollRun(write: PayrollRunWrite) {
      const inserted = await executor
        .insert(payrollRuns)
        .values({
          institutionId: write.institutionId,
          academicSessionId: write.academicSessionId,
          periodStart: write.periodStart,
          periodEnd: write.periodEnd,
          periodLabel: write.periodLabel,
          currency: write.currency,
          status: "draft",
          calculatedAt: null,
          calculatedByUserId: null,
          notes: write.notes,
        })
        .returning({ id: payrollRuns.id });
      const row = inserted[0];
      if (row === undefined) throw new InternalError("payroll run insert returned no row");
      return { id: row.id };
    },

    async loadCalculationInputs(runExecutor, institutionId, payrollRunId) {
      const runRows = await runExecutor
        .select({
          id: payrollRuns.id,
          institutionId: payrollRuns.institutionId,
          periodStart: payrollRuns.periodStart,
          periodEnd: payrollRuns.periodEnd,
          currency: payrollRuns.currency,
          status: payrollRuns.status,
          version: payrollRuns.version,
        })
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.institutionId, institutionId)))
        .limit(1);
      const run = runRows[0];
      if (run === undefined) throw new NotFoundError("Payroll run does not exist.");

      // The assignment in force at the end of the period: a raise that begins mid-month is next
      // month's figure, so a payslip never splits one salary across two.
      const assignmentRows = await runExecutor
        .select({
          employeeId: employees.id,
          userId: users.id,
          employeeName: users.name,
          employeeCode: employees.employeeCode,
          email: users.email,
          status: employees.status,
          salaryAssignmentId: salaryAssignments.id,
          salaryStructureId: salaryStructures.id,
          salaryStructureName: salaryStructures.name,
          structure: salaryStructures.structure,
          salaryAmount: salaryAssignments.amount,
          structureAmount: salaryStructures.amount,
          unitRate: salaryStructures.unitRate,
          periodsPerDay: salaryStructures.periodsPerDay,
          workingDaysPerMonth: salaryStructures.workingDaysPerMonth,
          currency: salaryAssignments.currency,
          effectiveFrom: salaryAssignments.effectiveFrom,
        })
        .from(employees)
        .innerJoin(users, eq(users.id, employees.userId))
        .leftJoin(
          salaryAssignments,
          and(
            eq(salaryAssignments.employeeId, employees.id),
            eq(salaryAssignments.institutionId, institutionId),
            lte(salaryAssignments.effectiveFrom, run.periodEnd),
          ),
        )
        .leftJoin(salaryStructures, eq(salaryStructures.id, salaryAssignments.salaryStructureId))
        .where(and(eq(employees.institutionId, institutionId), isNull(employees.archivedAt)));

      // The latest assignment per employee: an assignment that was ended and replaced inside the
      // period would otherwise appear twice.
      const latest = new Map<string, (typeof assignmentRows)[number]>();
      for (const row of assignmentRows) {
        if (row.effectiveFrom === null) continue;
        const existing = latest.get(row.employeeId);
        if (existing?.effectiveFrom === undefined || existing.effectiveFrom === null) {
          latest.set(row.employeeId, row);
          continue;
        }
        if (row.effectiveFrom > existing.effectiveFrom) latest.set(row.employeeId, row);
      }

      const assignments = [...latest.values()].map((row) => ({
        employeeId: row.employeeId,
        userId: row.userId,
        employeeName: row.employeeName,
        employeeCode: row.employeeCode,
        email: row.email,
        status: row.status,
        salaryAssignmentId: row.salaryAssignmentId,
        salaryStructureId: row.salaryStructureId,
        salaryStructureName: row.salaryStructureName,
        structure: row.structure,
        // An override replaces the structure's figure; a restatement inherits it
        // (`salary_assignments.overrides_structure`).
        salaryAmount: row.salaryAmount ?? row.structureAmount ?? null,
        unitRate: row.unitRate,
        periodsPerDay: row.periodsPerDay,
        workingDaysPerMonth: row.workingDaysPerMonth,
        currency: row.currency ?? run.currency,
      }));

      // The published timetable: teachable slots only, and never a draft one, because a draft
      // timetable is not yet a fact anybody can be paid against.
      const timetableRows = await runExecutor
        .select({
          teacherUserId: schedules.teacherId,
          periodsPerDay: sql<number>`count(distinct ${schedules.timeSlotId})`,
        })
        .from(schedules)
        .innerJoin(timeSlots, eq(timeSlots.id, schedules.timeSlotId))
        .where(
          and(
            eq(schedules.institutionId, institutionId),
            eq(schedules.status, "published"),
            eq(timeSlots.isBreak, false),
            isNotNull(schedules.teacherId),
          ),
        )
        .groupBy(schedules.teacherId);

      const timetables = timetableRows
        .filter(
          (row): row is typeof row & { readonly teacherUserId: string } =>
            row.teacherUserId !== null,
        )
        .map((row) => ({
          teacherUserId: row.teacherUserId,
          periodsPerDay: Number(row.periodsPerDay),
          publishedPeriods: Number(row.periodsPerDay),
        }));

      // Every recorded attendance day in the period. The service decides which ones are absences;
      // the store's job is to hand it the facts, all of them, once.
      const absenceRows = await runExecutor
        .select({
          employeeId: employeeAttendance.employeeId,
          attendanceDate: employeeAttendance.attendanceDate,
          status: employeeAttendance.status,
        })
        .from(employeeAttendance)
        .innerJoin(employees, eq(employees.id, employeeAttendance.employeeId))
        .where(
          and(
            eq(employees.institutionId, institutionId),
            gte(employeeAttendance.attendanceDate, run.periodStart),
            lte(employeeAttendance.attendanceDate, run.periodEnd),
          ),
        );

      // Approved leave whose type deducts from salary. `RULES.md` §41: an *approved paid* leave
      // lands in the attendance table as `leave`, and this filter is what keeps it out of money.
      const unpaidLeaveRows = await runExecutor
        .select({
          leaveRequestId: leaveRequests.id,
          employeeId: leaveRequests.employeeId,
          fromDate: leaveRequests.fromDate,
          toDate: leaveRequests.toDate,
          totalDays: leaveRequests.totalDays,
        })
        .from(leaveRequests)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .where(
          and(
            eq(employees.institutionId, institutionId),
            eq(leaveRequests.status, "approved"),
            eq(leaveTypes.deductsFromSalary, true),
            isNotNull(leaveRequests.employeeId),
            lte(leaveRequests.fromDate, run.periodEnd),
            gte(leaveRequests.toDate, run.periodStart),
          ),
        );

      // Payable replacement periods nobody has consumed yet. Unconsumed is the whole
      // anti-double-count mechanism: once a line takes one, the next calculation cannot see it.
      const extraRows = await runExecutor
        .select({
          extraPeriodId: extraPeriods.id,
          teacherUserId: extraPeriods.teacherId,
          extraDate: extraPeriods.extraDate,
          reason: extraPeriods.reason,
        })
        .from(extraPeriods)
        .innerJoin(employees, eq(employees.userId, extraPeriods.teacherId))
        .where(
          and(
            eq(extraPeriods.institutionId, institutionId),
            eq(extraPeriods.isPayable, true),
            isNull(extraPeriods.consumedByPayLineId),
            gte(extraPeriods.extraDate, run.periodStart),
            lte(extraPeriods.extraDate, run.periodEnd),
          ),
        );

      const preservedRows = await runExecutor
        .select({
          employeeId: payrollItems.employeeId,
          total: sql<string>`coalesce(sum(${payrollAdjustments.amount}), 0)`,
        })
        .from(payrollAdjustments)
        .innerJoin(payrollItems, eq(payrollItems.id, payrollAdjustments.payrollItemId))
        .where(
          and(eq(payrollItems.payrollRunId, payrollRunId), isNull(payrollAdjustments.reversedAt)),
        )
        .groupBy(payrollItems.employeeId);

      return {
        run,
        assignments,
        timetables,
        absences: absenceRows.map((row) => ({
          // `employee_attendance` has no surrogate id — its key is `(employee, date)` — so the
          // identity a source row would carry is that pair, and the deduction is recorded as a
          // count rather than as a row reference.
          employeeAttendanceId: `${row.employeeId}:${row.attendanceDate}`,
          employeeId: row.employeeId,
          attendanceDate: row.attendanceDate,
          status: row.status,
        })),
        unpaidLeave: unpaidLeaveRows
          .filter(
            (row): row is typeof row & { readonly employeeId: string } => row.employeeId !== null,
          )
          .map((row) => ({
            leaveRequestId: row.leaveRequestId,
            employeeId: row.employeeId,
            fromDate: row.fromDate,
            toDate: row.toDate,
            totalDays: row.totalDays,
          })),
        extraPeriods: extraRows
          .filter(
            (row): row is typeof row & { readonly teacherUserId: string } =>
              row.teacherUserId !== null,
          )
          .map((row) => ({
            extraPeriodId: row.extraPeriodId,
            teacherUserId: row.teacherUserId,
            extraDate: row.extraDate,
            reason: row.reason,
          })),
        preservedAdjustments: new Map(
          preservedRows.map((row) => [row.employeeId, row.total] as const),
        ),
      };
    },

    async persistCalculation(runExecutor, payload) {
      const { lines } = payload;
      // The version the *form* held, re-guarded here: two people calculating the same month is
      // the race that would otherwise double a salary.
      const updatedRuns = await runExecutor
        .update(payrollRuns)
        .set({
          status: "calculated",
          calculatedAt: new Date(),
          calculatedByUserId: payload.calculatedByUserId,
          updatedAt: new Date(),
          version: sql`${payrollRuns.version} + 1`,
        })
        .where(
          and(
            eq(payrollRuns.id, payload.payrollRunId),
            eq(payrollRuns.institutionId, payload.institutionId),
            eq(payrollRuns.version, payload.expectedVersion),
          ),
        )
        .returning({ id: payrollRuns.id, version: payrollRuns.version });
      await expectVersionedRow(updatedRuns, "Payroll run");
      const versionedRun = updatedRuns[0];
      if (versionedRun === undefined) throw new InternalError("payroll run update returned no row");

      const existingRows = await runExecutor
        .select({ id: payrollItems.id, employeeId: payrollItems.employeeId })
        .from(payrollItems)
        .where(eq(payrollItems.payrollRunId, payload.payrollRunId));

      const nextEmployees = new Set(lines.map((line) => line.employeeId));
      const existingByEmployee = new Map(existingRows.map((row) => [row.employeeId, row.id]));

      // A line whose employee has left the calculation (their assignment is gone) is removed with
      // its own sources. Its *adjustments* go with it, which is correct: there is nobody left to
      // pay, and keeping a floating adjustment would orphan provenance.
      for (const existing of existingRows) {
        if (nextEmployees.has(existing.employeeId)) continue;
        await runExecutor
          .update(extraPeriods)
          .set({ consumedByPayLineId: null, updatedAt: new Date() })
          .where(eq(extraPeriods.consumedByPayLineId, existing.id));
        await runExecutor.delete(payrollItems).where(eq(payrollItems.id, existing.id));
      }

      for (const line of lines) {
        const existingId = existingByEmployee.get(line.employeeId);
        const itemId =
          existingId ??
          (
            await runExecutor
              .insert(payrollItems)
              .values({
                payrollRunId: payload.payrollRunId,
                employeeId: line.employeeId,
                currency: line.currency,
                baseAmount: line.baseAmount,
                netAmount: line.netAmount,
              })
              .returning({ id: payrollItems.id })
          )[0]?.id;
        if (itemId === undefined) throw new InternalError("payroll item write returned no row");

        await runExecutor
          .update(payrollItems)
          .set({
            salaryAssignmentId: line.salaryAssignmentId,
            currency: line.currency,
            baseAmount: line.baseAmount,
            unitCount: line.unitCount,
            unitRate: line.unitRate,
            extraPeriodCount: line.extraPeriodCount,
            extraPeriodAmount: line.extraPeriodAmount,
            absenceDays: line.absenceDays,
            attendanceDeduction: line.attendanceDeduction,
            unpaidLeaveDays: line.unpaidLeaveDays,
            leaveDeduction: line.leaveDeduction,
            adjustmentAmount: line.adjustmentAmount,
            netAmount: line.netAmount,
            calculationBreakdown: line.calculationBreakdown,
            isExcluded: line.isExcluded,
            exclusionReason: line.exclusionReason,
            notes: line.notes,
            updatedAt: new Date(),
            version: sql`${payrollItems.version} + 1`,
          })
          .where(eq(payrollItems.id, itemId));

        // Sources are rewritten from the snapshot: a period plan that changed mid-month produces
        // exactly the rows whose inputs are now stale, instead of a manual diff.
        await runExecutor
          .delete(payrollCalculationSources)
          .where(eq(payrollCalculationSources.payrollItemId, itemId));

        // Only rows that carry a real identifier are recorded. An absence is *not*:
        // `employee_attendance` has no surrogate id (`(employee, date)` is its key), so its
        // provenance is the recorded count and the stored breakdown rather than a row
        // reference — which is the honest version of "where did this figure come from?".
        const sources = [
          ...(line.salaryAssignmentId === null
            ? []
            : [
                {
                  payrollItemId: itemId,
                  sourceType: "salary_assignment",
                  sourceRecordId: line.salaryAssignmentId,
                  quantity: line.baseAmount,
                },
              ]),
          ...line.consumedExtraPeriodIds.map((extraPeriodId) => ({
            payrollItemId: itemId,
            sourceType: "extra_period",
            sourceRecordId: extraPeriodId,
            quantity: "1 period",
          })),
        ];
        if (sources.length > 0) {
          await runExecutor.insert(payrollCalculationSources).values(sources);
        }

        // Consume this line's extra periods, and release any it no longer carries — a recalculation
        // after a correction frees the period rather than leaving it stamped to a dead line.
        if (line.consumedExtraPeriodIds.length > 0) {
          await runExecutor
            .update(extraPeriods)
            .set({ consumedByPayLineId: itemId, updatedAt: new Date() })
            .where(inArray(extraPeriods.id, [...line.consumedExtraPeriodIds]));
        }
      }

      const included = lines.filter((line) => !line.isExcluded).length;
      const excluded = lines.length - included;
      const netFigures = lines.filter((line) => !line.isExcluded).map((line) => line.netAmount);
      const totalText = toDecimalText(sumNetAmounts(netFigures, lines[0]?.currency ?? "PKR"));
      return {
        includedCount: included,
        excludedCount: excluded,
        netTotal: totalText,
        version: versionedRun.version,
      };
    },

    async approvePayrollRun(payload) {
      // The approval pair is written together with the status, and the run's proposed adjustments
      // are approved in the same act: `payroll_adjustments_approval_pair` requires both columns.
      const updated = await executor
        .update(payrollRuns)
        .set({
          status: "approved",
          approvedByUserId: payload.approvedByUserId,
          approvedAt: new Date(),
          notes: payload.notes ?? undefined,
          updatedAt: new Date(),
          version: sql`${payrollRuns.version} + 1`,
        })
        .where(
          and(
            eq(payrollRuns.id, payload.payrollRunId),
            eq(payrollRuns.institutionId, payload.institutionId),
            eq(payrollRuns.version, payload.expectedVersion),
          ),
        )
        .returning({ id: payrollRuns.id, version: payrollRuns.version });
      await expectVersionedRow(updated, "Payroll run");

      await executor
        .update(payrollAdjustments)
        .set({
          approvedByUserId: payload.approvedByUserId,
          approvedAt: new Date(),
        })
        .where(
          and(
            isNull(payrollAdjustments.approvedByUserId),
            sql`${payrollAdjustments.payrollItemId} in (
              select ${payrollItems.id} from ${payrollItems}
              where ${payrollItems.payrollRunId} = ${payload.payrollRunId}
            )`,
          ),
        );

      const row = updated[0];
      if (row === undefined) throw new InternalError("payroll run approval returned no row");
      return { version: row.version };
    },

    async isPeriodLocked(institutionId, periodStart, periodEnd) {
      const rows = await executor
        .select({ id: payrollPeriodLocks.id })
        .from(payrollPeriodLocks)
        .where(
          and(
            eq(payrollPeriodLocks.institutionId, institutionId),
            eq(payrollPeriodLocks.periodStart, periodStart),
            eq(payrollPeriodLocks.periodEnd, periodEnd),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async lockPayrollPeriod(write: PayrollPeriodLockWrite) {
      let rows: readonly { readonly id: string }[];
      try {
        rows = await executor
          .insert(payrollPeriodLocks)
          .values({
            institutionId: write.institutionId,
            periodStart: write.periodStart,
            periodEnd: write.periodEnd,
            reason: write.reason,
            lockedByUserId: write.lockedByUserId,
          })
          .returning({ id: payrollPeriodLocks.id });
      } catch (error) {
        // The unique key is the guarantee that a period is closed once; the sentence it raises
        // comes from `uniqueConflictError`, which is what the person who tried to close it twice
        // needs to read.
        const conflict = uniqueConflictError(error);
        if (conflict !== undefined) throw conflict;
        throw error;
      }
      const row = rows[0];
      if (row === undefined) throw new InternalError("period lock insert returned no row");
      return { id: row.id };
    },

    async getPayrollItem(institutionId, payrollItemId) {
      const rows = await executor
        .select({ item: itemSelect, runId: payrollRuns.id, runStatus: payrollRuns.status })
        .from(payrollItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
        .innerJoin(employees, eq(employees.id, payrollItems.employeeId))
        .innerJoin(users, eq(users.id, employees.userId))
        .leftJoin(salaryAssignments, eq(salaryAssignments.id, payrollItems.salaryAssignmentId))
        .leftJoin(salaryStructures, eq(salaryStructures.id, salaryAssignments.salaryStructureId))
        .where(
          and(eq(payrollItems.id, payrollItemId), eq(payrollRuns.institutionId, institutionId)),
        )
        .limit(1);

      const row = rows[0];
      if (row === undefined) return null;
      return {
        ...toItemRow(row.item),
        runId: row.runId,
        runStatus: row.runStatus,
      };
    },

    async createPayrollAdjustment(write) {
      return executor.transaction(async (tx) => {
        const itemRows = await tx
          .select({ item: itemSelect, status: payrollRuns.status })
          .from(payrollItems)
          .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
          .innerJoin(employees, eq(employees.id, payrollItems.employeeId))
          .innerJoin(users, eq(users.id, employees.userId))
          .leftJoin(salaryAssignments, eq(salaryAssignments.id, payrollItems.salaryAssignmentId))
          .leftJoin(salaryStructures, eq(salaryStructures.id, salaryAssignments.salaryStructureId))
          .where(eq(payrollItems.id, write.payrollItemId))
          .limit(1);
        const row = itemRows[0];
        if (row === undefined) throw new NotFoundError("Payroll item does not exist.");

        const adjustment = await tx
          .insert(payrollAdjustments)
          .values({
            payrollItemId: write.payrollItemId,
            adjustmentType: write.adjustmentType,
            amount: write.amount,
            reason: write.reason,
            correctsRecordType: write.correctsRecordType,
            correctsRecordId: write.correctsRecordId,
            previousNetAmount: write.previousNetAmount,
            appliedByUserId: write.appliedByUserId,
          })
          .returning({ id: payrollAdjustments.id });
        const created = adjustment[0];
        if (created === undefined)
          throw new InternalError("payroll adjustment insert returned no row");

        await restateItem(tx, write.payrollItemId, write.amount);
        return { id: created.id };
      });
    },

    async reversePayrollAdjustment(input) {
      return executor.transaction(async (tx) => {
        const rows = await tx
          .select({
            id: payrollAdjustments.id,
            amount: payrollAdjustments.amount,
            payrollItemId: payrollAdjustments.payrollItemId,
          })
          .from(payrollAdjustments)
          .innerJoin(payrollItems, eq(payrollItems.id, payrollAdjustments.payrollItemId))
          .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
          .where(
            and(
              eq(payrollAdjustments.id, input.payrollAdjustmentId),
              eq(payrollRuns.institutionId, input.institutionId),
              isNull(payrollAdjustments.reversedAt),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (row === undefined) throw new NotFoundError("Adjustment does not exist.");

        const reversed = await tx
          .update(payrollAdjustments)
          .set({
            reversedByUserId: input.reversedByUserId,
            reversedAt: new Date(),
            reversalReason: input.reason,
          })
          .where(eq(payrollAdjustments.id, row.id))
          .returning({ id: payrollAdjustments.id });
        const updated = reversed[0];
        if (updated === undefined) throw new InternalError("adjustment reversal returned no row");

        const itemRows = await tx
          .select({ item: itemSelect })
          .from(payrollItems)
          .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
          .innerJoin(employees, eq(employees.id, payrollItems.employeeId))
          .innerJoin(users, eq(users.id, employees.userId))
          .leftJoin(salaryAssignments, eq(salaryAssignments.id, payrollItems.salaryAssignmentId))
          .leftJoin(salaryStructures, eq(salaryStructures.id, salaryAssignments.salaryStructureId))
          .where(eq(payrollItems.id, row.payrollItemId))
          .limit(1);
        if (itemRows[0] === undefined) throw new NotFoundError("Payroll item does not exist.");

        await restateItem(tx, row.payrollItemId, negateAmount(row.amount));
        return { id: updated.id };
      });
    },

    async processPayment(write, institutionId) {
      return executor
        .transaction(async (tx) => {
          // The run's own total, computed the same way every read computes it: a SUM over the
          // included lines. A stored total could drift (`payroll.ts` refuses one for this reason).
          const totalRows = await tx
            .select({
              total: sql<string>`coalesce(sum(${payrollItems.netAmount}) filter (where ${payrollItems.isExcluded} = false), 0)`,
            })
            .from(payrollItems)
            .where(eq(payrollItems.payrollRunId, write.payrollRunId));
          const total = totalRows[0]?.total ?? "0.00";

          // The ledger journal goes in first: it resolves the account to settle into (an explicit
          // choice, then the payment method's configured account, then the institution's
          // auto-provisioned default) and posts against it. The payment row then records that
          // same resolved id — inserting it before the journal could only write a guessed (or
          // empty) uuid into a NOT NULL column with no foreign key to catch the difference.
          // One transaction: a paid run without a journal is refused by the database
          // (`payroll_runs_journal_required`, `RULES.md` §16).
          const journal = await postPayrollCollectionWithin(
            tx,
            {
              institutionId,
              payrollRunId: write.payrollRunId,
              amount: total,
              currency: write.currency,
              transactionOn: write.transactionOn,
              method: write.method,
              accountId: write.ledgerAccountId,
              description: write.description,
            },
            write.processedByUserId,
          );

          const payments = await tx
            .insert(payrollPayments)
            .values({
              institutionId,
              payrollRunId: write.payrollRunId,
              ledgerAccountId: journal.accountId,
              amount: total,
              currency: write.currency,
              status: "completed",
              paymentReference: write.paymentReference,
              paidAt: new Date(),
              processedByUserId: write.processedByUserId,
              notes: write.notes,
            })
            .returning({ id: payrollPayments.id });
          const payment = payments[0];
          if (payment === undefined)
            throw new InternalError("payroll payment insert returned no row");

          const updatedRuns = await tx
            .update(payrollRuns)
            .set({
              status: "paid",
              paidAt: new Date(),
              journalTransactionId: journal.journalId,
              updatedAt: new Date(),
              version: sql`${payrollRuns.version} + 1`,
            })
            .where(
              and(
                eq(payrollRuns.id, write.payrollRunId),
                eq(payrollRuns.institutionId, institutionId),
                eq(payrollRuns.version, write.expectedVersion),
              ),
            )
            .returning({ id: payrollRuns.id, version: payrollRuns.version });
          await expectVersionedRow(updatedRuns, "Payroll run");
          const run = updatedRuns[0];
          if (run === undefined) throw new InternalError("payroll run update returned no row");

          return {
            paymentId: payment.id,
            journalId: journal.journalId,
            version: run.version,
          };
        })
        .catch((error: unknown) => {
          const conflict = uniqueConflictError(error);
          if (conflict !== undefined) throw conflict;
          throw error;
        });
    },
  };
}

/** The store the module wires into its service — the pooled client, not a transaction scope. */
export const drizzlePayrollStore: PayrollStore = createPayrollStore(db);
