/**
 * The payroll module's use cases (`PRD.md` MODULE 9/10, `PHASES.md` #20 Phase 12).
 *
 * Every command follows the rhythm the fee, admission, finance and HR modules use
 * (`src/modules/README.md` §5): **validate** the payload at the zod boundary, **check policy**
 * against current state, then **write**. Store `ConflictError`/`ValidationError` propagate, because
 * a server action already maps `AppError` to a user response.
 *
 * The calculation itself is the point of the phase, and `ARCHITECTURE.md` §20 is its architecture:
 *
 * ```text
 * Salary Configuration  (Phase 11: `salary_assignments`, dated)
 *        ↓
 * Payroll Calculation   (this file: `calculateLines`, a pure function)
 *        ↓
 * Calculated Amount     (`payroll_items.base_amount`, `unit_count` …)
 *        ↓
 * Manual Adjustment     (`payroll_adjustments`: reason, author, moment, previous net)
 *        ↓
 * Final Amount          (`payroll_items.net_amount`)
 *        ↓
 * Payroll Record        (`payroll_runs` → `approved` → `paid`, with the ledger journal)
 * ```
 *
 * Three invariants this file exists to protect, each of which is a rule the schema cannot express:
 *
 * - **A recalculation never destroys manual work** (`RULES.md` §37). `calculateLines` recomputes the
 *   figures the *calculation* owns and re-applies the adjustments the run already carries, taken
 *   from `inputs.preservedAdjustments`. The store keeps those rows rather than deleting them.
 * - **Extra periods are counted once** (`RULES.md` §39). An extra period never enters `unitCount`:
 *   it lands in `extraPeriodCount`/`extraPeriodAmount`, and the store stamps `consumed_by_pay_line_id`
 *   on the rows a line consumed, so a second calculation cannot read the same period twice. The two
 *   figures are also separate columns, so a payslip shows them apart.
 * - **The calculation is a function of one snapshot.** The reads and the writes happen inside one
 *   `runInTransaction`, so a timetable that changed between them cannot produce a figure no single
 *   moment supports.
 *
 * Authorization is the caller's: a server action checks the principal's `payroll.*` permission and
 * hands the action a named `userId`. Every write demands one, because payslip provenance without an
 * author is not provenance (`ARCHITECTURE.md` §22).
 */
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import { fromDecimalText, toDecimalText } from "@/shared/money";
import { parseOrThrow } from "@/shared/validation";

import {
  assertAdjustment,
  assertPayrollPeriod,
  assertPayrollTransition,
  isEligibleForPayroll,
  overlappingDays,
  payrollNetText,
  periodLabelFor,
  proRata,
  scaleByUnitCount,
  calculationBreakdown,
} from "../domain/payroll-rules";
import * as s from "./schemas";
import type {
  EmployeePayrollHistoryRow,
  PayrollAdjustmentRow,
  PayrollCalculationInputs,
  PayrollCalculationResult,
  PayrollItemRow,
  PayrollLineWrite,
  PayrollRunListRow,
  PayrollRunDetailRow,
  PayrollStore,
} from "./ports";

/** Who is performing a write. Every payroll write demands a named one. */
export interface Actor {
  readonly userId: string | null;
}

export interface PayrollService {
  /* ---- Periods and runs -------------------------------------------------- */

  createPayrollRun(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly periodLabel: string }>;
  listPayrollRuns(input: unknown): Promise<readonly PayrollRunListRow[]>;
  getPayrollRun(input: unknown): Promise<PayrollRunDetailRow>;
  calculatePayrollRun(input: unknown, actor: Actor): Promise<PayrollCalculationResult>;
  approvePayrollRun(input: unknown, actor: Actor): Promise<{ readonly id: string }>;
  lockPayrollPeriod(input: unknown, actor: Actor): Promise<{ readonly id: string }>;

  /* ---- Adjustments ------------------------------------------------------- */

  createPayrollAdjustment(input: unknown, actor: Actor): Promise<{ readonly id: string }>;
  reversePayrollAdjustment(input: unknown, actor: Actor): Promise<{ readonly id: string }>;

  /* ---- Payment ----------------------------------------------------------- */

  processPayment(
    input: unknown,
    actor: Actor,
  ): Promise<{
    readonly paymentId: string;
    readonly journalId: string;
  }>;

  /* ---- Reads ------------------------------------------------------------ */

  getPayrollItem(input: unknown): Promise<PayrollItemRow>;
  listPayrollAdjustments(
    input: unknown,
  ): Promise<ReadonlyMap<string, readonly PayrollAdjustmentRow[]>>;
  employeePayrollHistory(input: unknown): Promise<readonly EmployeePayrollHistoryRow[]>;
}

export function createPayrollService(store: PayrollStore): PayrollService {
  /** Every write names a real HR or finance operator; the client never supplies "who did this". */
  function requireActorUserId(actor: Actor): string {
    if (actor.userId === null) {
      throw new ValidationError("An authenticated user must perform this action.", {
        actor: ["Sign in before recording this change."],
      });
    }
    return actor.userId;
  }

  async function requireRun(institutionId: string, payrollRunId: string) {
    const run = await store.getPayrollRun(institutionId, payrollRunId);
    if (run === null) {
      throw new NotFoundError("Payroll run does not exist.", {
        userMessage: "That payroll run is no longer available. Refresh the list and try again.",
      });
    }
    return run;
  }

  /* ---------------------------------------------------------------------- */
  /* The calculation                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * The one line per employee the calculation owns.
   *
   * A **pure** function over the snapshot the store gives it (`PayrollCalculationInputs`), which is
   * why it takes no store and why the fakes can supply the whole world in an object literal: the
   * arithmetic a payslip depends on is testable without a database.
   *
   * The rules, in the order the schema's columns record them (`payroll.ts`):
   *
   * - An employee who has left is **not in the run at all** (`isEligibleForPayroll`), because a
   *   line for a departed employee is a final settlement and not a monthly pay.
   * - An employee with **no assignment** in force gets an *excluded* line — `base 0`, with
   *   `exclusionReason` carrying the sentence. Hiding them would leave the run's employee count
   *   silent about who was left out.
   * - **Fixed**: `base = assignment amount`, `unitCount`/`unitRate` null, so a payslip never prints
   *   a rate that does not exist.
   * - **Unit-based**: `periodsPerDay` is the teacher's *published timetable* figure when the
   *   institution has one, and the structure's configured `periodsPerDay` otherwise — the schedule
   *   is the more specific fact and Phase 17 will make it authoritative, but a school whose
   *   scheduling module is not yet live still has a denominator to pay from, and the run records
   *   which of the two it used. `workingDays` is the days the institution actually recorded staff
   *   attendance for, and — only when nothing is recorded — the configured `workingDaysPerMonth`.
   *   `unitCount = periodsPerDay × workingDays`, `base = unitCount × unitRate`: §39's baseline,
   *   verbatim.
   * - **Deductions** are per *day*, priced at the per-day rate the figures imply: a unit-based
   *   employee's absent day is `periodsPerDay × unitRate`; a fixed employee's is
   *   `proRata(base, 1, workingDaysPerMonth)`. Unpaid leave is approved leave whose `leave_type`
   *   deducts, which is what "approved leave must not automatically be treated as absence"
   *   (`RULES.md` §41) means in money.
   * - **Extra periods** are a separate amount, at the same rate, so a replacement period pays on
   *   its own line rather than inflating the baseline.
   */
  function calculateLines(inputs: PayrollCalculationInputs): readonly PayrollLineWrite[] {
    const { run } = inputs;
    const timetables = new Map(
      inputs.timetables.map((timetable) => [timetable.teacherUserId, timetable]),
    );
    const absences = new Map<string, number>();
    for (const absence of inputs.absences) {
      if (absence.status !== "absent") continue;
      absences.set(absence.employeeId, (absences.get(absence.employeeId) ?? 0) + 1);
    }
    const unpaidLeaveDays = new Map<string, number>();
    for (const leave of inputs.unpaidLeave) {
      const days = overlappingDays(leave.fromDate, leave.toDate, run.periodStart, run.periodEnd);
      if (days === 0) continue;
      unpaidLeaveDays.set(leave.employeeId, (unpaidLeaveDays.get(leave.employeeId) ?? 0) + days);
    }
    const extraPeriods = new Map<string, string[]>();
    for (const period of inputs.extraPeriods) {
      const existing = extraPeriods.get(period.teacherUserId) ?? [];
      existing.push(period.extraPeriodId);
      extraPeriods.set(period.teacherUserId, existing);
    }

    return inputs.assignments.map((employee) => {
      const absenceDays = absences.get(employee.employeeId) ?? 0;
      const leaveDays = unpaidLeaveDays.get(employee.employeeId) ?? 0;
      const consumedExtraPeriodIds = extraPeriods.get(employee.userId) ?? [];

      // Departed from before the period closed: they are not payable in it at all. The store
      // reads `employees.status`, and the schema keeps `leaving_date` for exactly this.
      if (!isEligibleForPayroll(employee.status)) {
        return excludedLine(employee, "Not on the payroll for this period (employment ended).");
      }

      if (employee.salaryAssignmentId === null) {
        return excludedLine(
          employee,
          "No salary assignment in force for this period. Assign a salary to include them.",
        );
      }

      // A structure-less assignment that carries an amount is a fixed salary the institution
      // configured directly (`assignSalarySchema` allows it); with neither, there is nothing to
      // pay from.
      const structure = employee.structure ?? (employee.salaryAmount !== null ? "fixed" : null);
      if (structure === null) {
        return excludedLine(
          employee,
          "No salary assignment in force for this period. Assign a salary to include them.",
        );
      }

      const currency = employee.currency || run.currency;
      // The published timetable when it has a figure for this teacher, the configured denominator
      // otherwise — and the run says which one it used, so a figure can be argued with later.
      const timetable = timetables.get(employee.userId) ?? null;
      const timetablePeriodsPerDay = timetable?.periodsPerDay ?? 0;
      const periodsPerDay =
        timetablePeriodsPerDay > 0 ? timetablePeriodsPerDay : (employee.periodsPerDay ?? 0);
      const periodsPerDaySource: "timetable" | "configuration" | "none" =
        timetablePeriodsPerDay > 0
          ? "timetable"
          : employee.periodsPerDay !== null
            ? "configuration"
            : "none";
      const rate = fromDecimalText(employee.unitRate ?? "0.00", currency);
      const recordedDays = [...inputs.absences]
        .filter((absence) => absence.employeeId === employee.employeeId)
        .map((absence) => absence.attendanceDate);
      const workingDaysInPeriod =
        new Set(recordedDays).size === 0
          ? (employee.workingDaysPerMonth ?? 0)
          : new Set(recordedDays).size;

      const unitCount = structure === "unit_based" ? periodsPerDay * workingDaysInPeriod : null;
      const baseAmount =
        structure === "unit_based"
          ? toDecimalText(scaleByUnitCount(rate, unitCount ?? 0))
          : (employee.salaryAmount ?? "0.00");

      // A day's rate, for the two deductions that price absences and unpaid leave.
      const dayRate =
        structure === "unit_based"
          ? toDecimalText(scaleByUnitCount(rate, periodsPerDay))
          : toDecimalText(
              proRata(fromDecimalText(baseAmount, currency), 1, employee.workingDaysPerMonth ?? 0),
            );

      const attendanceDeduction = toDecimalText(
        scaleByUnitCount(fromDecimalText(dayRate, currency), absenceDays),
      );
      const leaveDeduction = toDecimalText(
        scaleByUnitCount(fromDecimalText(dayRate, currency), leaveDays),
      );

      const extraPeriodRate = structure === "unit_based" ? toDecimalText(rate) : dayRate;
      const extraPeriodAmount = toDecimalText(
        scaleByUnitCount(fromDecimalText(extraPeriodRate, currency), consumedExtraPeriodIds.length),
      );

      // Signed money text: an adjustment can subtract, and the stored sum carries the sign.
      const adjustmentAmount = inputs.preservedAdjustments.get(employee.employeeId) ?? "0.00";

      const netAmount = payrollNetText({
        currency,
        baseAmount,
        extraPeriodAmount,
        adjustmentAmount,
        attendanceDeduction,
        leaveDeduction,
      });

      return {
        employeeId: employee.employeeId,
        salaryAssignmentId: employee.salaryAssignmentId,
        salaryStructureName: employee.salaryStructureName,
        structure,
        currency,
        baseAmount,
        unitCount,
        unitRate: structure === "unit_based" ? toDecimalText(rate) : null,
        extraPeriodCount: consumedExtraPeriodIds.length,
        extraPeriodAmount,
        absenceDays,
        attendanceDeduction,
        unpaidLeaveDays: leaveDays,
        leaveDeduction,
        adjustmentAmount,
        netAmount,
        calculationBreakdown: calculationBreakdown({
          structure,
          salaryStructureName: employee.salaryStructureName,
          periodsPerDay: structure === "unit_based" ? periodsPerDay : null,
          periodsPerDaySource: structure === "unit_based" ? periodsPerDaySource : "none",
          workingDaysInPeriod: structure === "unit_based" ? workingDaysInPeriod : null,
          unitCount,
          unitRate: structure === "unit_based" ? toDecimalText(rate) : null,
          extraPeriodCount: consumedExtraPeriodIds.length,
          extraPeriodRate,
          absenceDays,
          unpaidLeaveDays: leaveDays,
          salaryAssignmentAmount: employee.salaryAmount,
          preservedAdjustments: 0,
        }),
        isExcluded: false,
        exclusionReason: null,
        notes: null,
        consumedExtraPeriodIds,
      } satisfies PayrollLineWrite;
    });
  }

  /** A line that is in the run and pays nothing, with the reason on its face. */
  function excludedLine(
    employee: PayrollCalculationInputs["assignments"][number],
    reason: string,
  ): PayrollLineWrite {
    const currency = employee.currency || "PKR";
    const zero = "0.00";
    return {
      employeeId: employee.employeeId,
      salaryAssignmentId: employee.salaryAssignmentId,
      salaryStructureName: employee.salaryStructureName,
      structure: employee.structure,
      currency,
      baseAmount: zero,
      unitCount: null,
      unitRate: null,
      extraPeriodCount: 0,
      extraPeriodAmount: zero,
      absenceDays: 0,
      attendanceDeduction: zero,
      unpaidLeaveDays: 0,
      leaveDeduction: zero,
      adjustmentAmount: zero,
      netAmount: zero,
      calculationBreakdown: calculationBreakdown({
        structure: null,
        salaryStructureName: null,
        periodsPerDay: null,
        periodsPerDaySource: "none",
        workingDaysInPeriod: null,
        unitCount: null,
        unitRate: null,
        extraPeriodCount: 0,
        extraPeriodRate: null,
        absenceDays: 0,
        unpaidLeaveDays: 0,
        salaryAssignmentAmount: null,
        preservedAdjustments: 0,
      }),
      isExcluded: true,
      exclusionReason: reason,
      notes: null,
      consumedExtraPeriodIds: [],
    };
  }

  return {
    /* ---- Periods and runs ------------------------------------------------- */

    async createPayrollRun(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.createPayrollRunSchema, input, "payroll run");
      assertPayrollPeriod(data.periodStart, data.periodEnd);
      // A closed period is closed before a run exists (`payroll_period_locks`), so opening one for
      // a month the institution has already shut is refused rather than caught later.
      if (await store.isPeriodLocked(data.institutionId, data.periodStart, data.periodEnd)) {
        throw new ValidationError("This payroll period is already closed.", {
          periodStart: ["Choose a different period — this one has been closed for payroll."],
        });
      }
      const periodLabel = periodLabelFor(data.periodStart);
      const created = await store.createPayrollRun({
        institutionId: data.institutionId,
        academicSessionId: data.academicSessionId ?? null,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        periodLabel,
        currency: data.currency,
        notes: data.notes ?? null,
        createdByUserId: userId,
      });
      return { id: created.id, periodLabel };
    },

    async listPayrollRuns(input) {
      const data = parseOrThrow(s.listPayrollRunsSchema, input, "payroll runs");
      return store.listPayrollRuns(data.institutionId);
    },

    async getPayrollRun(input) {
      const data = parseOrThrow(s.payRunDetailSchema, input, "payroll run");
      return requireRun(data.institutionId, data.payrollRunId);
    },

    async calculatePayrollRun(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.calculatePayrollRunSchema, input, "payroll calculation");
      const run = await requireRun(data.institutionId, data.payrollRunId);
      // Approval freezes the figures, so a recalculation after it is refused — a figure that
      // changes under an approved run is a rule (`ARCHITECTURE.md` §20), not a convenience.
      assertPayrollTransition(run.status, "calculated");
      // The guard is the version the *form* held, not the one just re-read: a stale page must
      // fail, which is the whole point of carrying the token through the request.
      if (run.version !== data.expectedVersion) {
        throw new ConflictError(
          `Payroll run version mismatch (expected ${data.expectedVersion}, found ${run.version}).`,
          {
            userMessage:
              "This payroll run was changed by someone else. Reload to see the latest figures.",
          },
        );
      }

      return store.runInTransaction(async (executor) => {
        const inputs = await store.loadCalculationInputs(
          executor,
          data.institutionId,
          data.payrollRunId,
        );
        const lines = calculateLines(inputs);
        return store.persistCalculation(executor, {
          institutionId: data.institutionId,
          payrollRunId: data.payrollRunId,
          expectedVersion: data.expectedVersion,
          lines,
          calculatedByUserId: userId,
        });
      });
    },

    async approvePayrollRun(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.approvePayrollRunSchema, input, "payroll approval");
      const run = await requireRun(data.institutionId, data.payrollRunId);
      assertPayrollTransition(run.status, "approved");
      // A run whose every line is excluded approves nothing: there is nothing to pay, and
      // approving an empty set is how a payroll pays itself.
      if (run.netTotal === "0.00" && run.includedCount === 0) {
        throw new ValidationError("This run has no payable employees yet.", {
          payrollRunId: ["Calculate the run, or add a salary assignment, before approving."],
        });
      }
      // Approval also approves the proposed adjustments: `payroll_adjustments` records the pair
      // once the run leaves `calculated`, which is the moment a manual value becomes final.
      await store.approvePayrollRun({
        institutionId: data.institutionId,
        payrollRunId: data.payrollRunId,
        expectedVersion: run.version,
        approvedByUserId: userId,
        notes: data.notes ?? null,
      });
      return { id: run.id };
    },

    async lockPayrollPeriod(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.lockPayrollPeriodSchema, input, "payroll period lock");
      assertPayrollPeriod(data.periodStart, data.periodEnd);
      const locked = await store.lockPayrollPeriod({
        institutionId: data.institutionId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        reason: data.reason ?? null,
        lockedByUserId: userId,
      });
      return { id: locked.id };
    },

    /* ---- Adjustments ------------------------------------------------------ */

    async createPayrollAdjustment(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.createPayrollAdjustmentSchema, input, "payroll adjustment");
      const item = await store.getPayrollItem(data.institutionId, data.payrollItemId);
      if (item === null) {
        throw new NotFoundError("Payroll item does not exist.", {
          userMessage: "That payslip is no longer available. Refresh the run and try again.",
        });
      }
      // A frozen run may not be adjusted: the figure is what the employee was paid. The escape is
      // a new run with a correction adjustment that names the record it fixes.
      if (
        item.runStatus === "approved" ||
        item.runStatus === "paid" ||
        item.runStatus === "locked"
      ) {
        throw new ValidationError("This payroll run is already finalised.", {
          amount: ["Reopen the calculation, or correct the underlying record and recalculate."],
        });
      }
      assertAdjustment(data.amount, data.reason, data.adjustmentType, {
        type: data.correctsRecordType ?? null,
        id: data.correctsRecordId ?? null,
      });
      const created = await store.createPayrollAdjustment({
        payrollItemId: data.payrollItemId,
        adjustmentType: data.adjustmentType,
        amount: data.amount,
        reason: data.reason,
        correctsRecordType: data.correctsRecordType ?? null,
        correctsRecordId: data.correctsRecordId ?? null,
        // The figure the calculation produced, read from the row just loaded: `ARCHITECTURE.md` §22.
        previousNetAmount: item.netAmount,
        appliedByUserId: userId,
      });
      return { id: created.id };
    },

    async reversePayrollAdjustment(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.reversePayrollAdjustmentSchema, input, "payroll adjustment");
      const reversed = await store.reversePayrollAdjustment({
        institutionId: data.institutionId,
        payrollAdjustmentId: data.payrollAdjustmentId,
        reason: data.reason,
        reversedByUserId: userId,
      });
      return { id: reversed.id };
    },

    /* ---- Payment ---------------------------------------------------------- */

    async processPayment(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.processPayrollPaymentSchema, input, "payroll payment");
      const run = await requireRun(data.institutionId, data.payrollRunId);
      assertPayrollTransition(run.status, "paid");
      if (run.version !== data.expectedVersion) {
        throw new ConflictError(
          `Payroll run version mismatch (expected ${data.expectedVersion}, found ${run.version}).`,
          {
            userMessage:
              "This payroll run was changed by someone else. Reload to see the latest figures.",
          },
        );
      }
      // The run total is the sum of the lines the store reported; a stored total could drift
      // (`payroll.ts` refuses one for exactly this reason).
      if (run.netTotal === "0.00" && run.includedCount === 0) {
        throw new ValidationError("This run has no payable employees yet.", {
          payrollRunId: ["Calculate the run before paying it."],
        });
      }
      const paid = await store.processPayment(
        {
          payrollRunId: data.payrollRunId,
          expectedVersion: data.expectedVersion,
          ledgerAccountId: data.ledgerAccountId ?? null,
          amount: run.netTotal,
          currency: run.currency,
          paymentReference: data.paymentReference ?? null,
          notes: data.notes ?? null,
          processedByUserId: userId,
          transactionOn: run.periodEnd,
          method: data.method,
          description: `Salary payment, ${run.periodLabel}`,
        },
        data.institutionId,
      );
      return { paymentId: paid.paymentId, journalId: paid.journalId };
    },

    /* ---- Reads ------------------------------------------------------------ */

    async getPayrollItem(input) {
      const data = parseOrThrow(s.payrollItemDetailSchema, input, "payroll item");
      const item = await store.getPayrollItem(data.institutionId, data.payrollItemId);
      if (item === null) {
        throw new NotFoundError("Payroll item does not exist.", {
          userMessage: "That payslip is no longer available. Refresh the run and try again.",
        });
      }
      return item;
    },

    async listPayrollAdjustments(input) {
      const data = parseOrThrow(s.payRunDetailSchema, input, "payroll adjustments");
      await requireRun(data.institutionId, data.payrollRunId);
      return store.listPayrollAdjustments(data.institutionId, data.payrollRunId);
    },

    async employeePayrollHistory(input) {
      const data = parseOrThrow(s.employeePayrollHistorySchema, input, "payroll history");
      return store.employeePayrollHistory(data.institutionId, data.employeeId);
    },
  };
}
