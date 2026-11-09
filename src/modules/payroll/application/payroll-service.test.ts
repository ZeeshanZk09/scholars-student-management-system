/**
 * The payroll module's use cases (`PRD.md` MODULE 9/10, `PHASES.md` #20 Phase 12).
 *
 * Workflow tests against the in-memory `PayrollStore` — no database, exactly like the fee,
 * admission, finance and HR service tests.
 *
 * The engine is asserted through the service rather than around it, because the promises that
 * matter are about *what survives a recalculation* and *what a payslip can prove*, not about
 * arithmetic:
 *
 * - `RULES.md` §39's baseline — 80 completed units × PKR 500 is PKR 40,000, and an extra period
 *   pays on its own column so it cannot be counted twice.
 * - `RULES.md` §37's override rule — a manual adjustment survives a recalculation with its
 *   reason, its author and the figure it was applied to, and the calculated base it was applied
 *   to is preserved exactly as it was.
 * - `ARCHITECTURE.md` §20/§22 — a run walks configuration → calculation → adjusted → final →
 *   record, and no step after approval can move a figure.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";

import { createPayrollService } from "./payroll-service";
import { createFakePayrollStore, type FakePayrollStore } from "./testing/fakes";
import type { PayrollCalculationInputs } from "./ports";

const INSTITUTION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const SESSION_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const ACTOR = "5f6d4c8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const OTHER_ACTOR = "6a7e5d9f-2b3c-4d4e-9f0a-1b2c3d4e5f60";

/** The unit-based teacher: 6 periods a day × 21 working days × PKR 500. */
const UNIT_TEACHER = "11111111-1111-4111-8111-111111111111";
/** The fixed accountant: PKR 40,000 a month, no periods. */
const FIXED_ACCOUNTANT = "22222222-2222-4222-8222-222222222222";
/** The unit teacher's *account* — deliberately not their profile id (`ADR-0002`). */
const UNIT_TEACHER_USER = "11111111-1111-4111-8111-111111111112";

const MARCH = { periodStart: "2026-03-01", periodEnd: "2026-03-31" } as const;

function inputs(overrides: Partial<PayrollCalculationInputs> = {}): PayrollCalculationInputs {
  return {
    run: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      institutionId: INSTITUTION_ID,
      periodStart: MARCH.periodStart,
      periodEnd: MARCH.periodEnd,
      currency: "PKR",
      status: "calculated",
      version: 1,
    },
    assignments: [
      {
        employeeId: UNIT_TEACHER,
        userId: UNIT_TEACHER_USER,
        employeeName: "Ayesha Khan",
        employeeCode: "EP-000001",
        email: "teacher@example.test",
        status: "active",
        salaryAssignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        salaryStructureId: "99999999-9999-4999-8999-999999999999",
        salaryStructureName: "Teacher pay",
        structure: "unit_based",
        salaryAmount: null,
        unitRate: "500.00",
        periodsPerDay: 6,
        workingDaysPerMonth: 22,
        currency: "PKR",
      },
      {
        employeeId: FIXED_ACCOUNTANT,
        userId: FIXED_ACCOUNTANT,
        employeeName: "Bilal Ahmed",
        employeeCode: "EP-000002",
        email: "accountant@example.test",
        status: "active",
        salaryAssignmentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        salaryStructureId: "88888888-8888-4888-8888-888888888888",
        salaryStructureName: "Accountant pay",
        structure: "fixed",
        salaryAmount: "40000.00",
        unitRate: null,
        periodsPerDay: null,
        workingDaysPerMonth: 22,
        currency: "PKR",
      },
    ],
    timetables: [],
    absences: [],
    unpaidLeave: [],
    extraPeriods: [],
    preservedAdjustments: new Map<string, string>(),
    ...overrides,
  };
}

/** Twenty working days of March 2026 as recorded attendance dates. */
const MARCH_WORKDAYS = Array.from({ length: 22 }, (_unused, index) => {
  const day = index + 1;
  return `2026-03-${String(day).padStart(2, "0")}`;
});

describe("opening a payroll period", () => {
  let store: FakePayrollStore;
  let service: ReturnType<typeof createPayrollService>;

  beforeEach(() => {
    store = createFakePayrollStore();
    service = createPayrollService(store);
  });

  it("opens a run whose label follows its dates", async () => {
    const created = await service.createPayrollRun(
      { institutionId: INSTITUTION_ID, academicSessionId: SESSION_ID, ...MARCH, currency: "PKR" },
      { userId: ACTOR },
    );
    expect(created.periodLabel).toBe("March 2026");

    const run = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: created.id,
    });
    expect(run.status).toBe("draft");
    expect(run.periodStart).toBe(MARCH.periodStart);
    expect(run.netTotal).toBe("0.00");
  });

  it("refuses a second run for the same period", async () => {
    await service.createPayrollRun(
      { institutionId: INSTITUTION_ID, ...MARCH, currency: "PKR" },
      { userId: ACTOR },
    );
    await expect(
      service.createPayrollRun(
        { institutionId: INSTITUTION_ID, ...MARCH, currency: "PKR" },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a period the institution has already closed", async () => {
    await service.lockPayrollPeriod(
      { institutionId: INSTITUTION_ID, ...MARCH, reason: "Year end" },
      { userId: ACTOR },
    );
    await expect(
      service.createPayrollRun(
        { institutionId: INSTITUTION_ID, ...MARCH, currency: "PKR" },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ValidationError);
  });
});

describe("calculating a run", () => {
  let store: FakePayrollStore;
  let service: ReturnType<typeof createPayrollService>;
  let runId: string;

  beforeEach(async () => {
    store = createFakePayrollStore();
    service = createPayrollService(store);
    const created = await service.createPayrollRun(
      { institutionId: INSTITUTION_ID, ...MARCH, currency: "PKR", notes: "March payroll" },
      { userId: ACTOR },
    );
    runId = created.id;
    store.setInputs(inputs({ run: { ...inputs().run, id: runId } }));
  });

  /** The unit teacher's published timetable, six teachable periods a day. */
  const TIMETABLE = [{ teacherUserId: UNIT_TEACHER_USER, periodsPerDay: 6, publishedPeriods: 30 }];
  /** The 21 working days of March the institution recorded. */
  const RECORDED_DAYS = MARCH_WORKDAYS.slice(0, 21).map((attendanceDate, index) => ({
    employeeAttendanceId: `9999999${index}-9999-4999-8999-999999999999`,
    employeeId: UNIT_TEACHER,
    attendanceDate,
    status: "present",
  }));

  it("pays the configured figures when nothing has been recorded yet", async () => {
    // 6 periods a day (the structure's denominator) × 22 working days a month (also configured) ×
    // PKR 500 is PKR 66,000; the accountant's fixed PKR 40,000 is untouched by periods.
    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    expect(result.netTotal).toBe("106000.00");
    expect(result.includedCount).toBe(2);
    expect(result.excludedCount).toBe(0);

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    const accountant = detail.lines.find((line) => line.employeeId === FIXED_ACCOUNTANT);
    expect(teacher?.unitCount).toBe(132);
    expect(teacher?.unitRate).toBe("500.00");
    expect(teacher?.baseAmount).toBe("66000.00");
    expect(accountant?.unitCount).toBeNull();
    expect(accountant?.unitRate).toBeNull();
    expect(accountant?.baseAmount).toBe("40000.00");
  });

  it("pays the recorded days rather than the configured ones, and says which figure it used", async () => {
    store.setInputs(inputs({ run: { ...inputs().run, id: runId }, absences: RECORDED_DAYS }));

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    // 6 × 21 recorded days × 500 = 63,000.00; the accountant is unchanged.
    expect(result.netTotal).toBe("103000.00");

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    expect(teacher?.unitCount).toBe(126);
    expect(teacher?.calculationBreakdown?.["periodsPerDaySource"]).toBe("configuration");
  });

  it("counts an approved replacement period separately, so it cannot be paid twice", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        timetables: TIMETABLE,
        extraPeriods: [
          {
            extraPeriodId: "77777777-7777-4777-8777-777777777777",
            teacherUserId: UNIT_TEACHER_USER,
            extraDate: "2026-03-20",
            reason: "replacement",
          },
        ],
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    // 6 × 22 × 500 = 66,000 for the baseline; the replacement period is its own PKR 500. A second
    // calculation of the same month would pay it twice if it were inside `unitCount`.
    expect(result.netTotal).toBe("106500.00");

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    expect(teacher?.extraPeriodCount).toBe(1);
    expect(teacher?.extraPeriodAmount).toBe("500.00");
    expect(teacher?.baseAmount).toBe("66000.00");
    expect(store.consumedExtraPeriodIds).toEqual(["77777777-7777-4777-8777-777777777777"]);
  });

  it("deducts a recorded absence at the day's rate", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        timetables: TIMETABLE,
        absences: [
          ...RECORDED_DAYS,
          {
            employeeAttendanceId: "88888888-8888-4888-8888-888888888888",
            employeeId: UNIT_TEACHER,
            attendanceDate: "2026-03-21",
            status: "absent",
          },
        ],
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    // 6 × 21 recorded days × 500 = 63,000.00, less one absent day at 6 × 500 = 3,000.00.
    expect(result.netTotal).toBe("100000.00");

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    expect(teacher?.absenceDays).toBe(1);
    expect(teacher?.attendanceDeduction).toBe("3000.00");
  });

  it("deducts approved unpaid leave, and never the approved paid kind", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        unpaidLeave: [
          {
            leaveRequestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            employeeId: FIXED_ACCOUNTANT,
            fromDate: "2026-03-14",
            toDate: "2026-03-16",
            totalDays: 3,
          },
          {
            // March is not April: this leave prices nothing in a March run.
            leaveRequestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
            employeeId: FIXED_ACCOUNTANT,
            fromDate: "2026-04-01",
            toDate: "2026-04-30",
            totalDays: 30,
          },
        ],
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const accountant = detail.lines.find((line) => line.employeeId === FIXED_ACCOUNTANT);
    expect(accountant?.unpaidLeaveDays).toBe(3);
    // A fixed salary's day rate is `base ÷ 22 working days` = 1,818.18; three days is 5,454.54.
    expect(accountant?.leaveDeduction).toBe("5454.54");
    expect(result.netTotal).toBe("100545.46");
  });

  it("keeps a manual adjustment through a recalculation, and preserves what it was applied to", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        preservedAdjustments: new Map([[UNIT_TEACHER, "-2500.00"]]),
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    expect(result.netTotal).toBe("103500.00");
    expect(result.version).toBeGreaterThan(1);

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    expect(teacher?.adjustmentAmount).toBe("-2500.00");
  });

  it("excludes an employee with no salary assignment, and says so", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        assignments: [
          {
            employeeId: "44444444-4444-4444-8444-444444444444",
            userId: "44444444-4444-4444-8444-555555555555",
            employeeName: "Nadia Iqbal",
            employeeCode: "EP-000004",
            email: "nadia@example.test",
            status: "active",
            salaryAssignmentId: null,
            salaryStructureId: null,
            salaryStructureName: null,
            structure: null,
            salaryAmount: null,
            unitRate: null,
            periodsPerDay: null,
            workingDaysPerMonth: null,
            currency: "PKR",
          },
        ],
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    expect(result.excludedCount).toBe(1);
    expect(result.netTotal).toBe("0.00");

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    expect(detail.lines[0]?.isExcluded).toBe(true);
    expect(detail.lines[0]?.exclusionReason).toContain("No salary assignment");
  });

  it("carries a departed employee as an excluded, unpaid line, so the run is complete", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        assignments: [
          { ...inputs().assignments[0]!, status: "resigned" },
          inputs().assignments[1]!,
        ],
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    // Paying a resigned teacher for a month they did not work is the error this prevents, and the
    // line that says why is better than a line that silently is not there (`RULES.md` §51).
    expect(result.includedCount).toBe(1);
    expect(result.excludedCount).toBe(1);
    expect(result.netTotal).toBe("40000.00");

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    expect(teacher?.isExcluded).toBe(true);
    expect(teacher?.exclusionReason).toContain("employment ended");
  });

  it("pays a structure-less fixed assignment the amount the institution configured", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        assignments: [
          {
            ...inputs().assignments[0]!,
            structure: null,
            salaryStructureId: null,
            salaryStructureName: null,
            salaryAmount: "35000.00",
          },
          inputs().assignments[1]!,
        ],
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    // 35,000.00 for the direct assignment plus the accountant's 40,000.00.
    expect(result.includedCount).toBe(2);
    expect(result.netTotal).toBe("75000.00");

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    expect(teacher?.isExcluded).toBe(false);
    expect(teacher?.baseAmount).toBe("35000.00");
    expect(teacher?.unitCount).toBeNull();
    expect(teacher?.unitRate).toBeNull();
  });

  it("excludes an assignment that carries neither a structure nor an amount", async () => {
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: runId },
        assignments: [
          {
            ...inputs().assignments[0]!,
            structure: null,
            salaryStructureId: null,
            salaryStructureName: null,
            salaryAmount: null,
            unitRate: null,
            periodsPerDay: null,
            workingDaysPerMonth: null,
          },
          inputs().assignments[1]!,
        ],
      }),
    );

    const result = await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    expect(result.excludedCount).toBe(1);
    expect(result.netTotal).toBe("40000.00");

    const detail = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const teacher = detail.lines.find((line) => line.employeeId === UNIT_TEACHER);
    expect(teacher?.isExcluded).toBe(true);
    expect(teacher?.exclusionReason).toContain("No salary assignment");
  });

  it("refuses a stale version", async () => {
    await expect(
      service.calculatePayrollRun(
        { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 99 },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to recalculate an approved run", async () => {
    await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
    await service.approvePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 2 },
      { userId: ACTOR },
    );
    await expect(
      service.calculatePayrollRun(
        { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 3 },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe("approving and paying", () => {
  let store: FakePayrollStore;
  let service: ReturnType<typeof createPayrollService>;
  let runId: string;

  beforeEach(async () => {
    store = createFakePayrollStore();
    service = createPayrollService(store);
    const created = await service.createPayrollRun(
      { institutionId: INSTITUTION_ID, ...MARCH, currency: "PKR" },
      { userId: ACTOR },
    );
    runId = created.id;
    store.setInputs(inputs({ run: { ...inputs().run, id: runId } }));
    await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
      { userId: ACTOR },
    );
  });

  it("approves, then pays the run's total into the ledger", async () => {
    const run = await service.getPayrollRun({ institutionId: INSTITUTION_ID, payrollRunId: runId });
    expect(run.netTotal).toBe("106000.00");

    await service.approvePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: run.version },
      { userId: ACTOR },
    );
    expect(store.runStatus(runId)).toBe("approved");

    const approved = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    const paid = await service.processPayment(
      {
        institutionId: INSTITUTION_ID,
        payrollRunId: runId,
        expectedVersion: approved.version,
        method: "bank_transfer",
        paymentReference: "TRF-2026-03-001",
      },
      { userId: OTHER_ACTOR },
    );
    expect(paid.journalId).toBeDefined();
    // The payment is the run's own total, and the journal's date is the period's end.
    expect(store.lastPayment).toEqual({
      amount: "106000.00",
      reference: "TRF-2026-03-001",
      date: MARCH.periodEnd,
    });
    expect(store.runStatus(runId)).toBe("paid");
  });

  it("refuses to pay an unapproved run, or the same run twice", async () => {
    const run = await service.getPayrollRun({ institutionId: INSTITUTION_ID, payrollRunId: runId });
    await expect(
      service.processPayment(
        {
          institutionId: INSTITUTION_ID,
          payrollRunId: runId,
          expectedVersion: run.version,
          method: "bank_transfer",
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(BusinessRuleError);

    await service.approvePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: run.version },
      { userId: ACTOR },
    );
    const approved = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    await service.processPayment(
      {
        institutionId: INSTITUTION_ID,
        payrollRunId: runId,
        expectedVersion: approved.version,
        method: "cash",
      },
      { userId: ACTOR },
    );
    const paid = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: runId,
    });
    // The state machine refuses a paid run before the store is reached, which is why the
    // duplicate-payment guard in `payroll_payments_run_account_key` is a *backstop*: a second
    // batch for a run that is already paid cannot get that far. `drizzle-store.test.ts` asserts
    // the store's own refusal for the case the machine cannot see (one run, two payments, two
    // accounts).
    await expect(
      service.processPayment(
        {
          institutionId: INSTITUTION_ID,
          payrollRunId: runId,
          expectedVersion: paid.version,
          method: "cash",
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("refuses to approve a run with nothing payable", async () => {
    store.setInputs(inputs({ assignments: [] }));
    const empty = await service.createPayrollRun(
      {
        institutionId: INSTITUTION_ID,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        currency: "PKR",
      },
      { userId: ACTOR },
    );
    store.setInputs(
      inputs({
        run: { ...inputs().run, id: empty.id, periodStart: "2026-04-01", periodEnd: "2026-04-30" },
        assignments: [],
      }),
    );
    await service.calculatePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: empty.id, expectedVersion: 1 },
      { userId: ACTOR },
    );
    const calculated = await service.getPayrollRun({
      institutionId: INSTITUTION_ID,
      payrollRunId: empty.id,
    });
    await expect(
      service.approvePayrollRun(
        {
          institutionId: INSTITUTION_ID,
          payrollRunId: empty.id,
          expectedVersion: calculated.version,
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("locks the period, which is a fact about the period and not about one run", async () => {
    await service.approvePayrollRun(
      { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 2 },
      { userId: ACTOR },
    );
    await service.lockPayrollPeriod(
      { institutionId: INSTITUTION_ID, ...MARCH, reason: "Closed for 2026" },
      { userId: ACTOR },
    );
    expect(store.runStatus(runId)).toBe("locked");
    await expect(
      service.createPayrollRun(
        { institutionId: INSTITUTION_ID, ...MARCH, currency: "PKR" },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses everything an unauthenticated caller asks for", async () => {
    await expect(
      service.createPayrollRun(
        { institutionId: INSTITUTION_ID, ...MARCH, currency: "PKR" },
        { userId: null },
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.calculatePayrollRun(
        { institutionId: INSTITUTION_ID, payrollRunId: runId, expectedVersion: 1 },
        { userId: null },
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses a run from another institution's scope", async () => {
    await expect(
      service.getPayrollRun({
        institutionId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        payrollRunId: runId,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
