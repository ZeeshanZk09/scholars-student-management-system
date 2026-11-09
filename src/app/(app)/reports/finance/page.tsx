/**
 * Financial reports (`PHASES.md` §21 task 7; the sidebar's "Financial Reports" item, which was a
 * "Planned" badge until this page existed).
 *
 * The ledger overview at `/finance` answers "what happened this year, month by month". This page
 * answers the three questions a treasurer is asked at a review: **what is in each account**
 * (the ledger balance, `SUM(in) − SUM(out)`, sign conventions per account type as the store
 * derives them), **where the money came from and went** (income and expense by journal kind and
 * by expense category), and **what the two revenue pipelines produced** — fees invoiced, paid,
 * conceded and still outstanding (`invoiceBalance`, the same derivation both other fee pages
 * use) and payroll settled, per run.
 *
 * Every figure is a read. The fee figures come from `getFeeDashboardStats`, the ledger cuts from
 * `getOverview` and `listAccounts`, the payroll table from `listPayrollRuns` filtered to `paid`
 * — no report owns a number of its own, so the reports can never disagree with the registers.
 */
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ArrowsLeftRightIcon,
  BankIcon,
  ClipboardTextIcon,
  MoneyIcon,
  ReceiptIcon,
} from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPayrollRuns } from "@/modules/payroll";
import { getFeeDashboardStats } from "@/modules/fees";
import { invoiceBalance } from "@/modules/fees/domain/fee-rules";
import {
  ACCOUNT_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  JOURNAL_KIND_LABELS,
  getOverview,
  listAccounts,
} from "@/modules/finance";
import { add, fromDecimalText, isZero, toDecimalText } from "@/shared/money";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function FinancialReportsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="reports.view"
      title="Financial Reports"
      description="Account balances, income and expense by kind, and what the fee and payroll pipelines produced"
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Reports" }, { label: "Financial" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view financial reports."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its reports.",
        noInstitution: "A report belongs to an institution. Add one before posting anything.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      render={async ({ institution }) => {
        const institutionId = institution.id;
        const [overview, accounts, stats, runs] = await Promise.all([
          getOverview({ institutionId, months: 12 }),
          listAccounts({ institutionId }),
          getFeeDashboardStats({ institutionId }),
          listPayrollRuns({ institutionId }),
        ]);

        const outstanding = toDecimalText(
          invoiceBalance(
            fromDecimalText(stats.totalInvoiced, stats.currency),
            fromDecimalText(stats.totalAllocated, stats.currency),
            add(
              fromDecimalText(stats.concessionSum, stats.currency),
              fromDecimalText(stats.creditNoteSum, stats.currency),
            ),
          ),
        );
        const paidRuns = runs.filter((run) => run.status === "paid");
        const payrollTotal = paidRuns.reduce(
          (sum, run) => add(sum, fromDecimalText(run.netTotal, run.currency)),
          fromDecimalText("0", overview.currency),
        );

        const hasLedgerActivity =
          !isZero(fromDecimalText(overview.incomeTotal, overview.currency)) ||
          !isZero(fromDecimalText(overview.expenseTotal, overview.currency));

        return (
          <div className="space-y-8">
            <section
              aria-label="Headline figures"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <StatCard
                label="Income (all-time)"
                value={money(overview.currency, overview.incomeTotal)}
                hint="Posted income, corrections netted off"
                icon={MoneyIcon}
              />
              <StatCard
                label="Expense (all-time)"
                value={money(overview.currency, overview.expenseTotal)}
                hint="Approved and paid expenditure"
                icon={ReceiptIcon}
              />
              <StatCard
                label="Fees outstanding"
                value={money(stats.currency, outstanding)}
                hint={`${stats.openInvoiceCount} open, ${stats.overdueInvoiceCount} overdue`}
                icon={ClipboardTextIcon}
              />
              <StatCard
                label="Payroll settled"
                value={money(overview.currency, toDecimalText(payrollTotal))}
                hint={`${paidRuns.length} paid run${paidRuns.length === 1 ? "" : "s"}`}
                icon={BankIcon}
              />
            </section>

            <section aria-label="Account balances" className="space-y-3">
              <h2 className="text-sm font-semibold">Account balances</h2>
              {accounts.length === 0 ? (
                <EmptyState
                  icon={MoneyIcon}
                  title="No accounts yet"
                  description="The first posting provisions the default accounts; until then there is nothing to balance."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell>{ACCOUNT_TYPE_LABELS[account.accountType]}</TableCell>
                        <TableCell className="font-mono">{account.currency}</TableCell>
                        <TableCell className="text-right font-mono">
                          {account.currency} {account.balance}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={account.isActive ? "success" : "neutral"}>
                            {account.isActive ? "Active" : "Closed"}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section aria-label="Income and expense by kind" className="space-y-3">
              <h2 className="text-sm font-semibold">By journal kind</h2>
              {!hasLedgerActivity ? (
                <EmptyState
                  icon={ArrowsLeftRightIcon}
                  title="Nothing has posted yet"
                  description="Record income, settle a fee or approve an expense and the totals appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kind</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.byKind.map((row) => (
                      <TableRow key={row.kind}>
                        <TableCell>{JOURNAL_KIND_LABELS[row.kind]}</TableCell>
                        <TableCell className="text-right font-mono">
                          {overview.currency} {row.total}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section aria-label="Expense by category" className="space-y-3">
              <h2 className="text-sm font-semibold">Expense by category</h2>
              {overview.byExpenseCategory.length === 0 ? (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No categorised expenditure"
                  description="Approved expenses post their category here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.byExpenseCategory.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell>{EXPENSE_CATEGORY_LABELS[row.category]}</TableCell>
                        <TableCell className="text-right font-mono">
                          {overview.currency} {row.total}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section aria-label="Fee collection summary" className="space-y-3">
              <h2 className="text-sm font-semibold">Fee collection</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoiced</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Concessions</TableHead>
                    <TableHead>Credit notes</TableHead>
                    <TableHead>Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono">
                      {stats.currency} {stats.totalInvoiced}
                    </TableCell>
                    <TableCell className="font-mono">
                      {stats.currency} {stats.totalAllocated}
                    </TableCell>
                    <TableCell className="font-mono">
                      {stats.currency} {stats.concessionSum}
                    </TableCell>
                    <TableCell className="font-mono">
                      {stats.currency} {stats.creditNoteSum}
                    </TableCell>
                    <TableCell className="font-mono">
                      {stats.currency} {outstanding}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>

            <section aria-label="Payroll settled" className="space-y-3">
              <h2 className="text-sm font-semibold">Payroll runs settled</h2>
              {paidRuns.length === 0 ? (
                <EmptyState
                  icon={BankIcon}
                  title="No payroll has been settled"
                  description="A paid run appears here with the month it covered and the amount that left the books."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Net paid</TableHead>
                      <TableHead>Paid on</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>{run.periodLabel}</TableCell>
                        <TableCell className="text-right font-mono">
                          {run.currency} {run.netTotal}
                        </TableCell>
                        <TableCell>{run.paidAt?.toISOString().slice(0, 10) ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        );
      }}
    />
  );
}

/** Local mirror of the shared formatter — a server page cannot import a `"use client"` helper. */
function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}
