/**
 * The Accountant Portal (`PHASES.md` §21) — the finance-focused home the sidebar's "Accountant
 * Portal" item points at.
 *
 * Everything here is a **read** composed from the modules that already own the work: the fee
 * dashboard stats, the payroll run register and the expense register. The portal does not
 * re-implement any of them; it surfaces what still needs a decision (the attention list) and
 * links into the pages that can make it. Notifications (`PHASES.md` §24) and attendance
 * visibility (§23) are deliberately absent — their producers do not exist yet, and an empty
 * register would be a lie rather than a placeholder.
 *
 * The gate is `finance.view` through `InstitutionPage`, the same key the ledger uses: the portal
 * is a workspace for anyone who may read the books, and every action it links to keeps its own
 * stricter key (`finance.record`, `payroll.process`, …) on the page that performs it.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowsLeftRightIcon,
  BankIcon,
  ChartLineIcon,
  ClipboardTextIcon,
  MoneyIcon,
  ReceiptIcon,
  SquaresFourIcon,
  UsersIcon,
  WarningCircleIcon,
} from "@/components/ui/icons";
import { listPayrollRuns } from "@/modules/payroll";
import { getFeeDashboardStats } from "@/modules/fees";
import { invoiceBalance } from "@/modules/fees/domain/fee-rules";
import { listExpenses } from "@/modules/finance";
import { add, fromDecimalText, toDecimalText } from "@/shared/money";

import { InstitutionPage } from "../_lib/institution-page";

export default async function AccountantPortalPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="finance.view"
      title="Accountant Portal"
      description="What needs a finance decision today, and every register you are allowed to open"
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Accountant Portal" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to open the accountant portal."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its finance workbench.",
        noInstitution: "A ledger belongs to an institution. Add one before collecting anything.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      render={async ({ institution }) => {
        const institutionId = institution.id;
        const [stats, runs, submitted] = await Promise.all([
          getFeeDashboardStats({ institutionId }),
          listPayrollRuns({ institutionId }),
          listExpenses({ institutionId, status: "submitted", pageSize: 50 }),
        ]);

        // The same derivation the finance overview and the fee dashboard use, so the three
        // pages can never disagree on what is still collectable.
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

        const awaitingSettlement = runs.filter((run) => run.status === "approved");
        const awaitingSettlementTotal = awaitingSettlement.reduce(
          (sum, run) => add(sum, fromDecimalText(run.netTotal, run.currency)),
          fromDecimalText("0", stats.currency),
        );
        const submittedTotal = submitted.rows.reduce(
          (sum, row) => add(sum, fromDecimalText(row.amount, row.currency)),
          fromDecimalText("0", stats.currency),
        );

        const attention = [
          ...awaitingSettlement.map((run) => ({
            key: `payroll-${run.id}`,
            label: `Payroll run ${run.periodLabel} is approved and waiting to be settled`,
            value: money(run.currency, run.netTotal),
            href: `/finance/payroll/${run.id}?institution=${encodeURIComponent(institutionId)}`,
            tone: "warning" as const,
          })),
          ...submitted.rows.map((row) => ({
            key: `expense-${row.id}`,
            label: `Expense “${row.description}” is waiting for approval`,
            value: money(row.currency, row.amount),
            href: `/finance/expenses?institution=${encodeURIComponent(institutionId)}`,
            tone: "info" as const,
          })),
        ];

        return (
          <div className="space-y-6">
            <section
              aria-label="Finance summary"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <StatCard
                label="Outstanding fees"
                value={money(stats.currency, outstanding)}
                hint={`${stats.openInvoiceCount} open invoice${stats.openInvoiceCount === 1 ? "" : "s"}`}
                icon={ClipboardTextIcon}
              />
              <StatCard
                label="Awaiting settlement"
                value={money(stats.currency, toDecimalText(awaitingSettlementTotal))}
                hint={`${awaitingSettlement.length} approved payroll run${awaitingSettlement.length === 1 ? "" : "s"}`}
                icon={BankIcon}
              />
              <StatCard
                label="Awaiting approval"
                value={money(stats.currency, toDecimalText(submittedTotal))}
                hint={`${submitted.total} submitted expense${submitted.total === 1 ? "" : "s"}`}
                icon={ReceiptIcon}
              />
              <StatCard
                label="Overdue invoices"
                value={String(stats.overdueInvoiceCount)}
                hint={money(stats.currency, stats.overdueTotal)}
                icon={WarningCircleIcon}
              />
            </section>

            <section aria-label="Needs attention" className="space-y-3">
              <h2 className="text-sm font-semibold">Needs your attention</h2>
              {attention.length === 0 ? (
                <EmptyState
                  icon={SquaresFourIcon}
                  title="Nothing is waiting on finance"
                  description="Approved payroll runs and expenses awaiting approval will appear here the moment they exist."
                />
              ) : (
                <ul className="divide-y rounded-md border">
                  {attention.map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center gap-2">
                          <Badge variant={item.tone === "warning" ? "default" : "secondary"}>
                            {item.tone === "warning" ? "Payroll" : "Expense"}
                          </Badge>
                          <span>{item.label}</span>
                        </span>
                        <span className="font-mono text-muted-foreground">{item.value}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Registers" className="space-y-3">
              <h2 className="text-sm font-semibold">Registers</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <PortalLink
                  href={`/fees?institution=${encodeURIComponent(institutionId)}`}
                  title="Fee collection & receipts"
                  description="Structures, invoices, payments, concessions and credit notes"
                  icon={MoneyIcon}
                />
                <PortalLink
                  href={`/finance/transactions?institution=${encodeURIComponent(institutionId)}`}
                  title="Transactions & ledgers"
                  description="Journals by kind, their balanced entries, reversals"
                  icon={ArrowsLeftRightIcon}
                />
                <PortalLink
                  href={`/finance/expenses?institution=${encodeURIComponent(institutionId)}`}
                  title="Expenses"
                  description="Draft, submitted, approved, paid — and rejected"
                  icon={ReceiptIcon}
                />
                <PortalLink
                  href={`/finance/payroll?institution=${encodeURIComponent(institutionId)}`}
                  title="Payroll"
                  description="Open a month, settle an approved run"
                  icon={BankIcon}
                />
                <PortalLink
                  href={`/reports/finance?institution=${encodeURIComponent(institutionId)}`}
                  title="Financial reports"
                  description="Account balances, income & expense, fee and payroll summaries"
                  icon={ChartLineIcon}
                />
                <PortalLink
                  href={`/hr/employees?institution=${encodeURIComponent(institutionId)}`}
                  title="Employee directory"
                  description="Who the salaries are for"
                  icon={UsersIcon}
                />
              </div>
            </section>
          </div>
        );
      }}
    />
  );
}

function PortalLink({
  href,
  title,
  description,
  icon: Icon,
}: Readonly<{
  href: string;
  title: string;
  description: string;
  icon: typeof MoneyIcon;
}>) {
  return (
    <Card className="rounded-none shadow-none">
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          <Link
            href={href}
            className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {title}
          </Link>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** Local mirror of the shared formatter — a server page cannot import a `"use client"` helper. */
function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}
