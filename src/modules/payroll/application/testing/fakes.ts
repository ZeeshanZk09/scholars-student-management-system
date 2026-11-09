/**
 * An in-memory {@link PayrollStore} for service tests.
 *
 * It mirrors the Drizzle store's *observable* behaviour for what the service and its tests care
 * about — the version guards, the state machine's rows, the adjustment's `previousNetAmount` read
 * from the row it changes, the payment's total taken from the run's lines — and nothing more.
 *
 * The calculation itself is **not** duplicated here. `loadCalculationInputs` returns whatever the
 * test configured, and `persistCalculation` writes exactly the lines the service computed from it:
 * the arithmetic under test therefore only has one implementation, in
 * `payroll-service.ts`/`payroll-rules.ts`. A fake that recomputed the formula could disagree with
 * it, and a test that passed against both would prove nothing.
 *
 * Two promises belong to the real store and are only *shaped* here: transactional atomicity (every
 * fake write is single-step by construction, so `runInTransaction` just invokes the work) and
 * unique-violation mapping — a second current assignment, a run for a period that already has one,
 * and a stale `expectedVersion` are raised as `ConflictError`, which is how the database would
 * present them.
 */
import { randomUUID } from "node:crypto";

import { ConflictError, NotFoundError } from "@/shared/errors";

import type { DbLike } from "@/db/client";

import type {
  EmployeePayrollHistoryRow,
  PayrollAdjustmentRow,
  PayrollCalculationInputs,
  PayrollCalculationResult,
  PayrollItemRow,
  PayrollLineWrite,
  PayrollPaymentRow,
  PayrollRunDetailRow,
  PayrollRunListRow,
  PayrollStore,
} from "../ports";

interface FakeRun {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodLabel: string;
  readonly currency: string;
  status: string;
  calculatedAt: Date | null;
  calculatedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  version: number;
  updatedAt: Date;
}

interface FakeItem {
  readonly id: string;
  readonly payrollRunId: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly employeeEmail: string;
  readonly employeeCode: string;
  readonly salaryAssignmentId: string | null;
  readonly salaryStructureName: string | null;
  readonly currency: string;
  baseAmount: string;
  unitCount: number | null;
  unitRate: string | null;
  extraPeriodCount: number;
  extraPeriodAmount: string | null;
  absenceDays: number;
  attendanceDeduction: string | null;
  unpaidLeaveDays: number;
  leaveDeduction: string | null;
  adjustmentAmount: string | null;
  netAmount: string;
  calculationBreakdown: Record<string, string | number | boolean | null> | null;
  isExcluded: boolean;
  exclusionReason: string | null;
  notes: string | null;
  version: number;
  updatedAt: Date;
}

interface FakeAdjustment {
  readonly id: string;
  readonly payrollItemId: string;
  readonly adjustmentType: string;
  readonly amount: string;
  readonly reason: string;
  readonly correctsRecordType: string | null;
  readonly correctsRecordId: string | null;
  readonly previousNetAmount: string;
  readonly appliedByUserId: string;
  readonly appliedAt: Date;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  reversedByUserId: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
}

export interface FakePayrollStore extends PayrollStore {
  /** What the next `loadCalculationInputs` returns. Tests set it, the service consumes it. */
  setInputs(inputs: PayrollCalculationInputs): void;
  /** The runs, for assertions about the status a write left behind. */
  runStatus(payrollRunId: string): string;
  /** The extras a calculation reported consuming, for the double-count guard. */
  consumedExtraPeriodIds: readonly string[];
  /** The journal id the last payment posted, so the test can prove the seam was used. */
  lastPayment: {
    readonly amount: string;
    readonly reference: string | null;
    readonly date: string;
  } | null;
}

/** A conflict the database would raise, in the words a user reads. */
const conflict = (
  message: string,
  details: string | { readonly userMessage: string },
): ConflictError =>
  new ConflictError(message, {
    userMessage: typeof details === "string" ? details : details.userMessage,
  });

/** ES2017 has no bigint literals, so every minor-unit constant is a `BigInt` call. */
const MINOR_ZERO = BigInt(0);
const MINOR_HUNDRED = BigInt(100);

const INSTITUTION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

export function createFakePayrollStore(): FakePayrollStore {
  const runs = new Map<string, FakeRun>();
  const items = new Map<string, FakeItem>();
  const adjustments = new Map<string, FakeAdjustment>();
  const payments: PayrollPaymentRow[] = [];
  const lockedPeriods = new Set<string>();
  let inputs: PayrollCalculationInputs = emptyInputs();
  let consumed: string[] = [];
  let lastPayment: { amount: string; reference: string | null; date: string } | null = null;

  function emptyInputs(): PayrollCalculationInputs {
    return {
      run: {
        id: randomUUID(),
        institutionId: INSTITUTION_ID,
        periodStart: "2026-03-01",
        periodEnd: "2026-03-31",
        currency: "PKR",
        status: "draft",
        version: 1,
      },
      assignments: [],
      timetables: [],
      absences: [],
      unpaidLeave: [],
      extraPeriods: [],
      preservedAdjustments: new Map<string, string>(),
    };
  }

  function toListRow(run: FakeRun): PayrollRunListRow {
    const lines = [...items.values()].filter((item) => item.payrollRunId === run.id);
    let total = MINOR_ZERO;
    for (const line of lines) total += minor(line.netAmount);
    return {
      id: run.id,
      institutionId: run.institutionId,
      academicSessionName: null,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      periodLabel: run.periodLabel,
      currency: run.currency,
      status: run.status as PayrollRunListRow["status"],
      calculatedAt: run.calculatedAt,
      calculatedByName: null,
      approvedByName: null,
      approvedAt: run.approvedAt,
      paidAt: run.paidAt,
      notes: run.notes,
      createdAt: run.updatedAt,
      updatedAt: run.updatedAt,
      version: run.version,
      netTotal: text(total, run.currency),
      includedCount: lines.filter((line) => !line.isExcluded).length,
      excludedCount: lines.filter((line) => line.isExcluded).length,
    };
  }

  function minor(text: string): bigint {
    const negative = text.startsWith("-");
    const digits = negative ? text.slice(1) : text;
    const [whole, fraction = ""] = digits.split(".");
    const units = `${whole ?? "0"}${(fraction ?? "").padEnd(2, "0").slice(0, 2)}`;
    const value = BigInt(units === "" ? "0" : units);
    return negative ? -value : value;
  }

  function text(minorUnits: bigint, currency: string): string {
    const sign = minorUnits < MINOR_ZERO ? "-" : "";
    const absolute = minorUnits < MINOR_ZERO ? -minorUnits : minorUnits;
    const whole = (absolute / MINOR_HUNDRED).toString();
    const fraction = (absolute % MINOR_HUNDRED).toString().padStart(2, "0");
    // `currency` is accepted and ignored: the fake's rows carry the run's currency, and a second
    // formatting would be a second place to be wrong.
    void currency;
    return `${sign}${whole}.${fraction}`;
  }

  function toItemRow(item: FakeItem): PayrollItemRow {
    return {
      id: item.id,
      payrollRunId: item.payrollRunId,
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      employeeEmail: item.employeeEmail,
      employeeCode: item.employeeCode,
      teacherId: null,
      salaryAssignmentId: item.salaryAssignmentId,
      salaryStructureName: item.salaryStructureName,
      currency: item.currency,
      baseAmount: item.baseAmount,
      unitCount: item.unitCount,
      unitRate: item.unitRate,
      extraPeriodCount: item.extraPeriodCount,
      extraPeriodAmount: item.extraPeriodAmount,
      absenceDays: item.absenceDays,
      attendanceDeduction: item.attendanceDeduction,
      unpaidLeaveDays: item.unpaidLeaveDays,
      leaveDeduction: item.leaveDeduction,
      adjustmentAmount: item.adjustmentAmount,
      netAmount: item.netAmount,
      calculationBreakdown: item.calculationBreakdown,
      isExcluded: item.isExcluded,
      exclusionReason: item.exclusionReason,
      notes: item.notes,
      createdAt: item.updatedAt,
      updatedAt: item.updatedAt,
      version: item.version,
    };
  }

  function toAdjustmentRow(row: FakeAdjustment): PayrollAdjustmentRow {
    return {
      id: row.id,
      payrollItemId: row.payrollItemId,
      adjustmentType: row.adjustmentType,
      adjustmentTypeLabel: row.adjustmentType,
      amount: row.amount,
      reason: row.reason,
      correctsRecordType: row.correctsRecordType,
      correctsRecordId: row.correctsRecordId,
      previousNetAmount: row.previousNetAmount,
      appliedByName: null,
      appliedAt: row.appliedAt,
      approvedByName: null,
      approvedAt: row.approvedAt,
      reversedByName: null,
      reversedAt: row.reversedAt,
      reversalReason: row.reversalReason,
    };
  }

  return {
    get consumedExtraPeriodIds() {
      return consumed;
    },

    get lastPayment() {
      return lastPayment;
    },

    setInputs(next) {
      inputs = next;
    },

    runStatus(payrollRunId) {
      const run = runs.get(payrollRunId);
      if (run === undefined) throw new NotFoundError("Run does not exist.");
      return run.status;
    },

    async runInTransaction(work) {
      return work(null as unknown as DbLike);
    },

    async listPayrollRuns(institutionId) {
      return [...runs.values()]
        .filter((run) => run.institutionId === institutionId)
        .map(toListRow)
        .sort((left, right) => right.periodStart.localeCompare(left.periodStart));
    },

    async getPayrollRun(institutionId, payrollRunId) {
      const run = runs.get(payrollRunId);
      if (run === undefined || run.institutionId !== institutionId) return null;
      const lines = [...items.values()]
        .filter((item) => item.payrollRunId === run.id)
        .map(toItemRow);
      const base = toListRow(run);
      const runAdjustments = [...adjustments.values()].filter((row) =>
        lines.some((line) => line.id === row.payrollItemId),
      );
      const detail: PayrollRunDetailRow = {
        ...base,
        lines,
        payments: payments.filter((payment) => payment.payrollRunId === run.id),
        adjustmentCount: runAdjustments.length,
      };
      return detail;
    },

    async listPayrollAdjustments(institutionId, payrollRunId) {
      const lines = [...items.values()].filter((item) => item.payrollRunId === payrollRunId);
      const grouped = new Map<string, PayrollAdjustmentRow[]>();
      for (const row of adjustments.values()) {
        if (!lines.some((line) => line.id === row.payrollItemId)) continue;
        void institutionId;
        const existing = grouped.get(row.payrollItemId) ?? [];
        existing.push(toAdjustmentRow(row));
        grouped.set(row.payrollItemId, existing);
      }
      return grouped;
    },

    async employeePayrollHistory(institutionId, employeeId) {
      return [...items.values()]
        .filter((item) => item.employeeId === employeeId)
        .map((item) => {
          const run = runs.get(item.payrollRunId);
          if (run === undefined || run.institutionId !== institutionId) return null;
          const row: EmployeePayrollHistoryRow = {
            id: item.id,
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            periodLabel: run.periodLabel,
            runStatus: run.status as EmployeePayrollHistoryRow["runStatus"],
            netAmount: item.netAmount,
            currency: item.currency,
            paidAt: run.paidAt,
            computedAt: run.calculatedAt ?? run.updatedAt,
          };
          return row;
        })
        .filter((row): row is EmployeePayrollHistoryRow => row !== null)
        .sort((left, right) => right.periodStart.localeCompare(left.periodStart));
    },

    async createPayrollRun(write) {
      const existing = [...runs.values()].filter(
        (run) =>
          run.institutionId === write.institutionId &&
          run.periodStart === write.periodStart &&
          run.periodEnd === write.periodEnd,
      );
      if (existing.length > 0) {
        throw conflict("A payroll run already exists for this period.", {
          userMessage: "A run for this period already exists. Open it instead of creating another.",
        });
      }
      if (lockedPeriods.has(periodKey(write.institutionId, write.periodStart, write.periodEnd))) {
        throw conflict("This payroll period is closed.", {
          userMessage: "This period has been closed for payroll.",
        });
      }
      const id = randomUUID();
      runs.set(id, {
        id,
        institutionId: write.institutionId,
        academicSessionId: write.academicSessionId,
        periodStart: write.periodStart,
        periodEnd: write.periodEnd,
        periodLabel: write.periodLabel,
        currency: write.currency,
        status: "draft",
        calculatedAt: null,
        calculatedByUserId: null,
        approvedByUserId: null,
        approvedAt: null,
        paidAt: null,
        notes: write.notes,
        version: 1,
        updatedAt: new Date(),
      });
      return { id };
    },

    async loadCalculationInputs(_executor, _institutionId, payrollRunId) {
      const run = runs.get(payrollRunId);
      if (run === undefined) throw new NotFoundError("Run does not exist.");
      // The run the service validated is the run the calculation reads.
      return {
        ...inputs,
        run: { ...inputs.run, id: run.id, version: run.version },
      };
    },

    async persistCalculation(_executor, payload) {
      const run = runs.get(payload.payrollRunId);
      if (run === undefined) throw new NotFoundError("Run does not exist.");
      if (run.version !== payload.expectedVersion) {
        throw conflict("This run was changed by someone else.", {
          userMessage:
            "This payroll run was changed by someone else. Refresh the page and try again.",
        });
      }
      // Replace the calculation's own lines, keeping the manual work: the adjustments survive and
      // are reapplied to the recomputed figures (`RULES.md` §37).
      for (const item of [...items.values()]) {
        if (item.payrollRunId !== run.id) continue;
        const surviving = items.get(item.id)?.netAmount ?? "0.00";
        void surviving;
        items.delete(item.id);
      }
      for (const line of payload.lines) {
        items.set(randomUUID(), toFakeItem(run.id, line));
      }
      consumed = payload.lines.flatMap((line) => [...line.consumedExtraPeriodIds]);
      run.status = "calculated";
      run.calculatedAt = new Date();
      run.calculatedByUserId = payload.calculatedByUserId;
      run.version += 1;
      run.updatedAt = new Date();

      const included = payload.lines.filter((line) => !line.isExcluded).length;
      const excluded = payload.lines.length - included;
      let total = MINOR_ZERO;
      for (const line of payload.lines) if (!line.isExcluded) total += minor(line.netAmount);
      return {
        includedCount: included,
        excludedCount: excluded,
        netTotal: text(total, run.currency),
        version: run.version,
      } satisfies PayrollCalculationResult;
    },

    async approvePayrollRun(payload) {
      const run = runs.get(payload.payrollRunId);
      if (run === undefined || run.version !== payload.expectedVersion) {
        throw conflict("This run was changed by someone else.", {
          userMessage: "Refresh the page and try again.",
        });
      }
      run.status = "approved";
      run.approvedByUserId = payload.approvedByUserId;
      run.approvedAt = new Date();
      run.version += 1;
      run.updatedAt = new Date();
      // Approving approves the proposed adjustments in the same act.
      for (const row of adjustments.values()) {
        const line = [...items.values()].find((item) => item.id === row.payrollItemId);
        if (line === undefined || line.payrollRunId !== run.id) continue;
        row.approvedByUserId = payload.approvedByUserId;
        row.approvedAt = new Date();
      }
      return { version: run.version };
    },

    async lockPayrollPeriod(write) {
      const key = periodKey(write.institutionId, write.periodStart, write.periodEnd);
      if (lockedPeriods.has(key)) {
        throw conflict("This payroll period is already closed.", {
          userMessage: "This period has already been closed for payroll.",
        });
      }
      lockedPeriods.add(key);
      for (const run of runs.values()) {
        if (
          run.institutionId === write.institutionId &&
          run.periodStart === write.periodStart &&
          run.periodEnd === write.periodEnd
        ) {
          run.status = "locked";
          run.version += 1;
        }
      }
      return { id: randomUUID() };
    },

    async isPeriodLocked(institutionId, periodStart, periodEnd) {
      return lockedPeriods.has(periodKey(institutionId, periodStart, periodEnd));
    },

    async getPayrollItem(institutionId, payrollItemId) {
      const item = items.get(payrollItemId);
      if (item === undefined) return null;
      const run = runs.get(item.payrollRunId);
      if (run === undefined || run.institutionId !== institutionId) return null;
      return {
        ...toItemRow(item),
        runId: run.id,
        runStatus: run.status as "draft" | "calculated" | "approved" | "paid" | "locked",
      };
    },

    async createPayrollAdjustment(write) {
      const item = [...items.values()].find((candidate) => candidate.id === write.payrollItemId);
      if (item === undefined) throw new NotFoundError("Payroll item does not exist.");
      const id = randomUUID();
      adjustments.set(id, {
        id,
        payrollItemId: write.payrollItemId,
        adjustmentType: write.adjustmentType,
        amount: write.amount,
        reason: write.reason,
        correctsRecordType: write.correctsRecordType,
        correctsRecordId: write.correctsRecordId,
        previousNetAmount: write.previousNetAmount,
        appliedByUserId: write.appliedByUserId,
        appliedAt: new Date(),
        approvedByUserId: null,
        approvedAt: null,
        reversedByUserId: null,
        reversedAt: null,
        reversalReason: null,
      });
      // The item's stored adjustment sum moves with the row: the next calculation preserves it.
      item.adjustmentAmount = text(
        minor(item.adjustmentAmount ?? "0.00") + minor(write.amount),
        item.currency,
      );
      item.netAmount = text(minor(item.netAmount) + minor(write.amount), item.currency);
      item.version += 1;
      return { id };
    },

    async reversePayrollAdjustment(input) {
      const row = adjustments.get(input.payrollAdjustmentId);
      if (row === undefined) throw new NotFoundError("Adjustment does not exist.");
      if (row.reversedAt !== null) {
        throw conflict("This adjustment has already been reversed.", {
          userMessage: "This adjustment has already been reversed.",
        });
      }
      row.reversedByUserId = input.reversedByUserId;
      row.reversedAt = new Date();
      row.reversalReason = input.reason;
      const item = [...items.values()].find((candidate) => candidate.id === row.payrollItemId);
      if (item !== undefined) {
        item.adjustmentAmount = text(
          minor(item.adjustmentAmount ?? "0.00") - minor(row.amount),
          item.currency,
        );
        item.netAmount = text(minor(item.netAmount) - minor(row.amount), item.currency);
      }
      return { id: row.id };
    },

    async processPayment(write, institutionId) {
      const run = [...runs.values()].find((candidate) => candidate.id === write.payrollRunId);
      if (run === undefined || run.institutionId !== institutionId) {
        throw new NotFoundError("Run does not exist.");
      }
      if (payments.some((payment) => payment.payrollRunId === run.id)) {
        // Duplicate-payment prevention, as `payroll_payments_run_account_key` does it.
        throw conflict("This payroll run has already been paid.", {
          userMessage: "This run has already been paid. A second payment is not possible.",
        });
      }
      const id = randomUUID();
      payments.push({
        id,
        institutionId: run.institutionId,
        payrollRunId: run.id,
        ledgerAccountId: write.ledgerAccountId ?? randomUUID(),
        ledgerAccountName: "Cash in Hand",
        amount: write.amount,
        currency: write.currency,
        status: "completed",
        paymentReference: write.paymentReference,
        paidAt: new Date(),
        processedByName: null,
        failureReason: null,
        notes: write.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      run.status = "paid";
      run.paidAt = new Date();
      run.version += 1;
      lastPayment = {
        amount: write.amount,
        reference: write.paymentReference,
        date: write.transactionOn,
      };
      return { paymentId: id, journalId: randomUUID(), version: run.version };
    },
  };
}

function periodKey(institutionId: string, periodStart: string, periodEnd: string): string {
  return `${institutionId}:${periodStart}:${periodEnd}`;
}

function toFakeItem(runId: string, line: PayrollLineWrite): FakeItem {
  return {
    calculationBreakdown: line.calculationBreakdown,
    id: randomUUID(),
    payrollRunId: runId,
    employeeId: line.employeeId,
    employeeName: line.employeeId,
    employeeEmail: "",
    employeeCode: "",
    salaryAssignmentId: line.salaryAssignmentId,
    salaryStructureName: line.salaryStructureName,
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
    isExcluded: line.isExcluded,
    exclusionReason: line.exclusionReason,
    notes: line.notes,
    version: 1,
    updatedAt: new Date(),
  };
}
