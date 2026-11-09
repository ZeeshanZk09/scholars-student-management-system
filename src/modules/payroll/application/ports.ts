/**
 * What the payroll service needs from the data layer (`src/modules/README.md`: ports in, Drizzle
 * out). Nothing here imports `db`, `drizzle-orm` or a table, so the service is tested against
 * `testing/fakes.ts` without a database — the same contract the fee, admission, finance and HR
 * stores fulfil.
 *
 * Six of these methods are the design of Phase 12 rather than plumbing, and they deserve naming:
 *
 * 1. **`loadCalculationInputs`** is the calculation's whole world in one call: the run, the
 *    employees it may pay, the assignment in force for the period, the teacher's teachable periods
 *    per day, the recorded attendance and the approved unpaid leave. Everything the engine can
 *    possibly read arrives together, so a calculation cannot be assembled from stale reads: a
 *    timetable edited between two queries would otherwise produce a figure no single snapshot
 *    supports (`RULES.md` §39).
 * 2. **`persistCalculation`** writes the lines and the sources, and *guards* them: the version
 *    predicate on the run row and the unique keys on `payroll_items`,
 *    `payroll_calculation_sources` and `extra_periods.consumed_by_pay_line_id` are what make a
 *    recalculation idempotent and an extra period unpayable twice.
 * 3. **`preservedAdjustments`** is the opposite of a cache. A recalculation recomputes the figures
 *    the *calculation* owns, and hands the manual ones back untouched — `RULES.md` §37, "automation
 *    must never silently destroy an authorized manual correction", which is a requirement the store
 *    can only meet by keeping the rows the run already had.
 * 4. **`processPayment`** is the one method that crosses the module boundary: it calls
 *    `postPayrollCollectionWithin` (`@/modules/finance`) inside the payroll transaction, so the
 *    payment row, the run's `paid` status and the salary-payment journal commit together
 *    (`RULES.md` §16, `ARCHITECTURE.md` §21). A payslip paid with no ledger entry is worse than a
 *    failed request, so the failure is not swallowed.
 * 5. **Audit and concurrency are the store's, not the service's.** `payroll_runs.calculatedByUserId`,
 *    `approvedByUserId`, `paidAt`, `payroll_adjustments.appliedByUserId` and the version predicates
 *    are written here, in the same transaction as the change they describe, because a history row
 *    written after the fact is a history row that can be lost (`ARCHITECTURE.md` §22).
 */
import type { DbLike } from "@/db/client";

import type { PayrollStatus } from "../domain/payroll-rules";

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

/** One `payroll_runs` row, with the totals the run page renders. */
export interface PayrollRunListRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionName: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodLabel: string;
  readonly currency: string;
  readonly status: PayrollStatus;
  readonly calculatedAt: Date | null;
  readonly calculatedByName: string | null;
  readonly approvedByName: string | null;
  readonly approvedAt: Date | null;
  readonly paidAt: Date | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  /** Derived at read: `SUM(payroll_items.net_amount)` — `payroll.ts` stores no run total. */
  readonly netTotal: string;
  readonly includedCount: number;
  readonly excludedCount: number;
}

/** The run's full detail: the header, its lines, and the payment already made. */
export interface PayrollRunDetailRow extends PayrollRunListRow {
  readonly lines: readonly PayrollItemRow[];
  readonly payments: readonly PayrollPaymentRow[];
  readonly adjustmentCount: number;
}

/** One `payroll_items` row with the names a payslip needs. */
export interface PayrollItemRow {
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

/** A manual adjustment, as the payslip's provenance section reads it. */
export interface PayrollAdjustmentRow {
  readonly id: string;
  readonly payrollItemId: string;
  readonly adjustmentType: string;
  readonly adjustmentTypeLabel: string;
  readonly amount: string;
  readonly reason: string;
  readonly correctsRecordType: string | null;
  readonly correctsRecordId: string | null;
  /** What the calculation produced before this adjustment — the §22 provenance requirement. */
  readonly previousNetAmount: string | null;
  readonly appliedByName: string | null;
  readonly appliedAt: Date;
  readonly approvedByName: string | null;
  readonly approvedAt: Date | null;
  readonly reversedByName: string | null;
  readonly reversedAt: Date | null;
  readonly reversalReason: string | null;
}

/** One disbursement for a run, one account. */
export interface PayrollPaymentRow {
  readonly id: string;
  readonly institutionId: string;
  readonly payrollRunId: string;
  readonly ledgerAccountId: string;
  readonly ledgerAccountName: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly status: string;
  readonly paymentReference: string | null;
  readonly paidAt: Date | null;
  readonly processedByName: string | null;
  readonly failureReason: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** One line of an employee's pay history, for the employee detail page. */
export interface EmployeePayrollHistoryRow {
  readonly id: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodLabel: string;
  readonly runStatus: PayrollStatus;
  readonly netAmount: string;
  readonly currency: string;
  readonly paidAt: Date | null;
  readonly computedAt: Date;
}

/* -------------------------------------------------------------------------- */
/* Calculation inputs                                                          */
/* -------------------------------------------------------------------------- */

/** The assignment in force for the period, resolved from `salary_assignments`. */
export interface PayrollAssignmentInput {
  readonly employeeId: string;
  /** The employee's account id — the key `timetables.teacherUserId` and `extra_periods.teacherId` use. */
  readonly userId: string;
  readonly employeeName: string;
  readonly employeeCode: string;
  readonly email: string;
  readonly status: string;
  readonly salaryAssignmentId: string | null;
  readonly salaryStructureId: string | null;
  readonly salaryStructureName: string | null;
  /** `fixed` or `unit_based`. Null when the employee has no assignment. */
  readonly structure: "fixed" | "unit_based" | null;
  readonly salaryAmount: string | null;
  readonly unitRate: string | null;
  readonly periodsPerDay: number | null;
  readonly workingDaysPerMonth: number | null;
  readonly currency: string;
}

/** The teacher's teachable periods per day, from the published timetable. */
export interface PayrollTimetableInput {
  readonly teacherUserId: string;
  /** Distinct teachable time slots the teacher is timetabled for. */
  readonly periodsPerDay: number;
  /** Number of published timetable rows behind the count. */
  readonly publishedPeriods: number;
}

/** One recorded absence inside the period. */
export interface PayrollAbsenceInput {
  readonly employeeAttendanceId: string;
  readonly employeeId: string;
  readonly attendanceDate: string;
  readonly status: string;
}

/** One approved, salary-deducting leave inside the period. */
export interface PayrollUnpaidLeaveInput {
  readonly leaveRequestId: string;
  readonly employeeId: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly totalDays: number;
}

/** One payable extra period inside the period, not yet consumed by a pay line. */
export interface PayrollExtraPeriodInput {
  readonly extraPeriodId: string;
  readonly teacherUserId: string;
  readonly extraDate: string;
  readonly reason: string;
}

/**
 * Everything the calculation reads, in one snapshot.
 *
 * The store assembles it inside a transaction, so the figure it produces is a function of this
 * object alone — which is why the fakes can supply one and the service can be tested without a
 * database.
 */
export interface PayrollCalculationInputs {
  readonly run: {
    readonly id: string;
    readonly institutionId: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly currency: string;
    readonly status: PayrollStatus;
    readonly version: number;
  };
  readonly assignments: readonly PayrollAssignmentInput[];
  readonly timetables: readonly PayrollTimetableInput[];
  readonly absences: readonly PayrollAbsenceInput[];
  readonly unpaidLeave: readonly PayrollUnpaidLeaveInput[];
  readonly extraPeriods: readonly PayrollExtraPeriodInput[];
  /**
   * The signed net of the adjustments a previous calculation left on the run's lines, keyed by
   * employee, as canonical decimal text. Recalculation re-applies them; it never re-reads them
   * from a frozen run.
   */
  readonly preservedAdjustments: ReadonlyMap<string, string>;
}

/** The one line the calculation writes. */
export interface PayrollLineWrite {
  readonly employeeId: string;
  readonly salaryAssignmentId: string | null;
  readonly salaryStructureName: string | null;
  readonly structure: "fixed" | "unit_based" | null;
  readonly currency: string;
  readonly baseAmount: string;
  readonly unitCount: number | null;
  readonly unitRate: string | null;
  readonly extraPeriodCount: number;
  readonly extraPeriodAmount: string;
  readonly absenceDays: number;
  readonly attendanceDeduction: string;
  readonly unpaidLeaveDays: number;
  readonly leaveDeduction: string;
  readonly adjustmentAmount: string;
  readonly netAmount: string;
  readonly calculationBreakdown: Record<string, string | number | boolean | null>;
  readonly isExcluded: boolean;
  readonly exclusionReason: string | null;
  readonly notes: string | null;
  /** The extra periods this line consumed, stamped so they cannot be paid twice. */
  readonly consumedExtraPeriodIds: readonly string[];
}

/** The calculation's result: what the store wrote, in the shape the service reports. */
export interface PayrollCalculationResult {
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly netTotal: string;
  readonly version: number;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export interface PayrollRunWrite {
  readonly institutionId: string;
  readonly academicSessionId: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodLabel: string;
  readonly currency: string;
  readonly notes: string | null;
  readonly createdByUserId: string;
}

export interface PayrollAdjustmentWrite {
  readonly payrollItemId: string;
  readonly adjustmentType: string;
  readonly amount: string;
  readonly reason: string;
  readonly correctsRecordType: string | null;
  readonly correctsRecordId: string | null;
  /** Written by the store from the row it just read; never supplied by the caller. */
  readonly previousNetAmount: string;
  readonly appliedByUserId: string;
}

export interface PayrollPaymentWrite {
  readonly payrollRunId: string;
  /** The caller's optimistic-concurrency token for the run row this payment settles. */
  readonly expectedVersion: number;
  readonly ledgerAccountId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly paymentReference: string | null;
  readonly notes: string | null;
  readonly processedByUserId: string;
  /** The journal's date and method — the finance seam's payload, not extra payroll state. */
  readonly transactionOn: string;
  readonly method: "cash" | "bank_transfer" | "cheque" | "online_gateway" | "card" | "other";
  readonly description: string | null;
}

export interface PayrollPeriodLockWrite {
  readonly institutionId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly reason: string | null;
  readonly lockedByUserId: string;
}

/* -------------------------------------------------------------------------- */
/* The port                                                                   */
/* -------------------------------------------------------------------------- */

export interface PayrollStore {
  /* ---- Reads ------------------------------------------------------------- */

  listPayrollRuns(institutionId: string): Promise<readonly PayrollRunListRow[]>;
  getPayrollRun(institutionId: string, payrollRunId: string): Promise<PayrollRunDetailRow | null>;
  /** The adjustments on the run's lines, for the provenance section of a payslip. */
  listPayrollAdjustments(
    institutionId: string,
    payrollRunId: string,
  ): Promise<ReadonlyMap<string, readonly PayrollAdjustmentRow[]>>;
  employeePayrollHistory(
    institutionId: string,
    employeeId: string,
  ): Promise<readonly EmployeePayrollHistoryRow[]>;

  /* ---- Writes ------------------------------------------------------------ */

  /**
   * Run `work` inside a transaction, the seam `src/modules/fees` uses to call into finance and
   * `src/modules/admission` uses to convert an application: the service composes the reads and
   * writes it needs to be one atomic calculation, and the store decides what a transaction is.
   *
   * This exists so a calculation cannot be assembled from two committed reads. Between the
   * `loadCalculationInputs` and the `persistCalculation` of a run, a timetable row, an attendance
   * row or an assignment can move — and the figure written must be a function of one snapshot,
   * or "what was this calculated from?" has no answer.
   */
  runInTransaction<T>(work: (executor: DbLike) => Promise<T>): Promise<T>;

  createPayrollRun(write: PayrollRunWrite): Promise<{ readonly id: string }>;

  /** Everything the calculation may read, in one snapshot, inside the caller's transaction. */
  loadCalculationInputs(
    executor: DbLike,
    institutionId: string,
    payrollRunId: string,
  ): Promise<PayrollCalculationInputs>;
  /** Write the calculated lines, their sources, and the run's `calculated` state. */
  persistCalculation(
    executor: DbLike,
    input: {
      readonly institutionId: string;
      readonly payrollRunId: string;
      readonly expectedVersion: number;
      readonly lines: readonly PayrollLineWrite[];
      readonly calculatedByUserId: string;
    },
  ): Promise<PayrollCalculationResult>;
  approvePayrollRun(store: {
    readonly institutionId: string;
    readonly payrollRunId: string;
    readonly expectedVersion: number;
    readonly approvedByUserId: string;
    readonly notes: string | null;
  }): Promise<{ readonly version: number }>;
  lockPayrollPeriod(write: PayrollPeriodLockWrite): Promise<{ readonly id: string }>;
  /** Whether the institution has already closed this period for payroll. */
  isPeriodLocked(institutionId: string, periodStart: string, periodEnd: string): Promise<boolean>;

  /**
   * One item with the run it belongs to, so an adjustment can be refused when the run is frozen
   * and can record the figure it is changing (`previousNetAmount`).
   */
  getPayrollItem(
    institutionId: string,
    payrollItemId: string,
  ): Promise<
    (PayrollItemRow & { readonly runId: string; readonly runStatus: PayrollStatus }) | null
  >;

  createPayrollAdjustment(write: PayrollAdjustmentWrite): Promise<{ readonly id: string }>;
  reversePayrollAdjustment(input: {
    readonly institutionId: string;
    readonly payrollAdjustmentId: string;
    readonly reason: string;
    readonly reversedByUserId: string;
  }): Promise<{ readonly id: string }>;

  /**
   * Pay a run: the payment row, the run's `paid` status, and the ledger journal in one
   * transaction, via the finance module's seam.
   */
  processPayment(
    write: PayrollPaymentWrite,
    institutionId: string,
  ): Promise<{
    readonly paymentId: string;
    readonly journalId: string;
    readonly version: number;
  }>;
}
