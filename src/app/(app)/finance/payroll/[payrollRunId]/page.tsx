/**
 * One payroll run: its lines, their provenance, and the payment that settled it.
 *
 * The page's structure is the payslip's structure, so a reader who knows a payslip can read this:
 *
 * 1. **The header** — the period, the currency, and the run's status. A draft is open; a calculated
 *    run can be adjusted; an approved one waits to be paid; a paid one is settled; a locked one is
 *    history.
 * 2. **The calculation** — one row per employee, in staff-number order. The figures are the ones
 *    the calculation wrote: the base (a fixed amount, or `unitCount × unitRate`), the extra periods
 *    on their own line, the deductions the institution recorded, and the net. The **inputs** are
 *    shown verbatim under each line, because `ARCHITECTURE.md` §22's question is "what was this
 *    calculated from?" and the answer is stored, not recomputed on the way to the user.
 * 3. **The manual work** — each adjustment with its kind, its reason, who applied it and when, and
 *    whether it is still live. Reversing is a separate action with its own reason, so a trail can
 *    show both what happened and that it was undone.
 * 4. **The controls** — gated on the run's status *and* the principal's grant. Calculating is
 *    offered while the run is `draft`/`calculated`, adjusting while it is open, approving when it
 *    is `calculated` and `payroll.approve`, settling when it is `approved` and `payroll.process`.
 *
 * Total is always the store's `SUM(net_amount)` over the included lines — the same number the
 * register shows, and the number the payment posts.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  BankIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  MoneyIcon,
  UserListIcon,
} from "@/components/ui/icons";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { getPayrollRun, listPayrollAdjustments } from "@/modules/payroll";
import { hasPermission } from "@/shared/authorization";

import {
  AdjustPayrollLineDialog,
  ApprovePayrollRunForm,
  CalculatePayrollRunForm,
  ProcessPayrollPaymentDialog,
  ReversePayrollAdjustmentForm,
} from "@/modules/payroll/ui/payroll-forms";

import { InstitutionPage } from "../../../_lib/institution-page";

const STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  draft: "neutral",
  calculated: "info",
  approved: "warning",
  paid: "success",
  locked: "neutral",
};

/** Whether an employee's line may be adjusted: the run is open and the line pays somebody. */
function canAdjustLine(status: string, isExcluded: boolean): boolean {
  return (status === "draft" || status === "calculated") && !isExcluded;
}

/** The "last adjusted" hint, from the run's own figures rather than a fabricated date. */
function latestAdjustmentHint(run: Awaited<ReturnType<typeof getPayrollRun>>): string {
  const live = run.lines.filter((line) => (line.adjustmentAmount ?? "0.00") !== "0.00").length;
  return live > 0 ? `${live} adjustment${live === 1 ? "" : "s"} applied` : "None yet";
}

export default async function PayrollRunDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ payrollRunId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const resolved = await params;
  const runId = Array.isArray(resolved.payrollRunId)
    ? resolved.payrollRunId[0]
    : resolved.payrollRunId;

  return (
    <InstitutionPage
      permission="payroll.view"
      title="Payroll run"
      description="The calculation, its manual adjustments and the payment that settled it"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Finance", href: "/finance" },
        { label: "Payroll", href: "/finance/payroll" },
        { label: "Run" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view this payroll run."
      empty={{
        chooseInstitution: "Choose an institution to see its payroll runs.",
        noInstitution: "A payroll run belongs to an institution.",
        noMembership: "You are not a member of any institution yet.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null) return null;
        const run = await getPayrollRun({
          institutionId: ctx.institution.id,
          payrollRunId: runId,
        });
        const canCalculate = hasPermission(ctx.principal, "payroll.calculate");
        const canProcess = hasPermission(ctx.principal, "payroll.process");
        const isOpen = run.status === "draft" || run.status === "calculated";
        return (
          <div className="flex flex-wrap items-center gap-2">
            {canCalculate && isOpen ? (
              <CalculatePayrollRunForm
                institutionId={ctx.institution.id}
                payrollRunId={run.id}
                version={run.version}
              />
            ) : null}
            <ApprovePayrollRunForm
              institutionId={ctx.institution.id}
              payrollRunId={run.id}
              version={run.version}
              status={run.status}
            />
            {run.status === "approved" && canProcess ? (
              <ProcessPayrollPaymentDialog
                institutionId={ctx.institution.id}
                payrollRunId={run.id}
                version={run.version}
              />
            ) : null}
          </div>
        );
      }}
      render={async ({ institution, principal }) => {
        const run = await getPayrollRun({
          institutionId: institution.id,
          payrollRunId: runId,
        });
        const adjustments = await listPayrollAdjustments({
          institutionId: institution.id,
          payrollRunId: runId,
        });

        const canCalculate = hasPermission(principal, "payroll.calculate");

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{run.periodLabel}</h2>
              <StatusBadge tone={STATUS_TONES[run.status] ?? "neutral"}>{run.status}</StatusBadge>
              <Badge variant="outline">{run.currency}</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Period"
                value={`${run.periodStart} → ${run.periodEnd}`}
                icon={CalendarBlankIcon}
              />
              <StatCard
                label="Employees"
                value={String(run.includedCount)}
                icon={UserListIcon}
                hint={
                  run.excludedCount > 0
                    ? `${run.excludedCount} excluded from pay`
                    : "All on the payroll"
                }
              />
              <StatCard
                label="Net total"
                value={`${run.currency} ${run.netTotal}`}
                icon={MoneyIcon}
                hint="The sum the payment posts"
              />
              <StatCard
                label="Adjustments"
                value={String(run.adjustmentCount)}
                icon={CheckCircleIcon}
                hint={latestAdjustmentHint(run)}
              />
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Calculation</h3>
              {run.lines.length === 0 ? (
                <EmptyState
                  icon={UserListIcon}
                  title="Nothing calculated yet"
                  description="Calculate the run to produce a line per employee, from the salary assignments the institution already holds."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Extra periods</TableHead>
                      <TableHead>Absence</TableHead>
                      <TableHead>Leave</TableHead>
                      <TableHead>Adjustments</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Calculation basis</TableHead>
                      {canCalculate ? <TableHead>Adjust</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.lines.map((line) => {
                      const live = (adjustments.get(line.id) ?? []).filter(
                        (row) => row.reversedAt === null,
                      );
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/hr/employees/${line.employeeId}?institution=${encodeURIComponent(institution.id)}`}
                              className="underline underline-offset-4"
                            >
                              {line.employeeName}
                            </Link>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {line.employeeCode}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono">
                            {line.baseAmount}
                            {line.unitCount !== null ? (
                              <span className="block text-xs text-muted-foreground">
                                {line.unitCount} × {line.unitRate}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono">
                            {line.extraPeriodAmount ?? "0.00"}
                            {line.extraPeriodCount > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                {line.extraPeriodCount} period
                                {line.extraPeriodCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono">
                            {line.attendanceDeduction ?? "0.00"}
                            {line.absenceDays > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                {line.absenceDays} day{line.absenceDays === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono">
                            {line.leaveDeduction ?? "0.00"}
                            {line.unpaidLeaveDays > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                {line.unpaidLeaveDays} day{line.unpaidLeaveDays === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono">
                            {line.adjustmentAmount ?? "0.00"}
                            {live.length > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                {live.length} adjustment{live.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-mono">{line.netAmount}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {line.isExcluded ? (
                              <span className="text-destructive">
                                {line.exclusionReason ?? "Excluded from payroll"}
                              </span>
                            ) : line.unitCount === null ? (
                              <span>
                                Fixed salary
                                {line.salaryStructureName
                                  ? ` (${line.salaryStructureName})`
                                  : ""}
                              </span>
                            ) : line.calculationBreakdown !== null ? (
                              <span>
                                {line.calculationBreakdown["workingDaysInPeriod"] ?? 0} days ×{" "}
                                {line.calculationBreakdown["periodsPerDay"] ?? 0} periods/day
                                {line.calculationBreakdown["periodsPerDaySource"] === "timetable"
                                  ? " (timetable)"
                                  : line.calculationBreakdown["periodsPerDaySource"] ===
                                      "configuration"
                                    ? " (configured)"
                                    : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          {canCalculate ? (
                            <TableCell>
                              {canAdjustLine(run.status, line.isExcluded) ? (
                                <AdjustPayrollLineDialog
                                  institutionId={institution.id}
                                  payrollItemId={line.id}
                                />
                              ) : null}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Manual adjustments</h3>
              {run.adjustmentCount === 0 ? (
                <EmptyState
                  icon={BankIcon}
                  title="No manual adjustments yet"
                  description="An adjustment records what a calculation cannot know — a bonus, a deduction, a correction — with a reason and a signature."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Status</TableHead>
                      {canCalculate ? <TableHead>Reverse</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.lines.flatMap((line) =>
                      (adjustments.get(line.id) ?? [])
                        .filter((row) => row.reversedAt === null)
                        .map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{line.employeeName}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.adjustmentTypeLabel}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">{row.amount}</TableCell>
                            <TableCell>{row.reason}</TableCell>
                            <TableCell>{row.appliedByName ?? "—"}</TableCell>
                            <TableCell>
                              <StatusBadge tone={row.approvedAt !== null ? "success" : "warning"}>
                                {row.approvedAt !== null ? "Approved" : "Proposed"}
                              </StatusBadge>
                            </TableCell>
                            {canCalculate ? (
                              <TableCell>
                                {canAdjustLine(run.status, line.isExcluded) ? (
                                  <ReversePayrollAdjustmentForm
                                    institutionId={institution.id}
                                    payrollAdjustmentId={row.id}
                                  />
                                ) : null}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        )),
                    )}
                  </TableBody>
                </Table>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Payment</h3>
              {run.payments.length === 0 ? (
                <EmptyState
                  icon={MoneyIcon}
                  title="Not paid yet"
                  description={
                    run.status === "approved"
                      ? "Settle the payment to post the salary-payment journal and mark the run paid."
                      : "The run must be calculated and approved before it can be paid."
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {payment.ledgerAccountName ?? "Default disbursement account"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {payment.currency} {payment.amount}
                        </TableCell>
                        <TableCell>{payment.paymentReference ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={payment.status === "completed" ? "success" : "warning"}
                          >
                            {payment.status}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>{payment.paidAt?.toISOString().slice(0, 10) ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Audit</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fact</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Calculated</TableCell>
                    <TableCell>
                      {run.calculatedAt?.toISOString().slice(0, 10) ?? "—"}
                      {run.calculatedByName ? ` by ${run.calculatedByName}` : ""}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Approved</TableCell>
                    <TableCell>
                      {run.approvedAt?.toISOString().slice(0, 10) ?? "—"}
                      {run.approvedByName ? ` by ${run.approvedByName}` : ""}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Paid</TableCell>
                    <TableCell>
                      {run.paidAt?.toISOString().slice(0, 10) ?? "—"}
                      {run.payments.length > 0 && run.payments[0]?.paymentReference
                        ? ` (ref: ${run.payments[0].paymentReference})`
                        : ""}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Notes</TableCell>
                    <TableCell>{run.notes ?? "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Payroll cannot be recalculated after approval. A correction is a new run with an
                adjustment that names the record it fixes.
              </p>
            </section>

            {run.status === "locked" ? (
              <EmptyState
                icon={BankIcon}
                title="This period is closed"
                description="A locked payroll is history. A later correction is a new run, not a rewrite."
              />
            ) : null}
          </div>
        );
      }}
    />
  );
}
