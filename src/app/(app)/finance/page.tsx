/**
 * The finance dashboard — the target the sidebar's `/finance` item has been pointing at with a
 * "Planned" badge until now (`src/lib/navigation.ts`; flipping its `disabled` flag is the whole
 * reason this file exists, and `navigation.test.ts` checks the two stay in step).
 *
 * The institute-wide ledger in the order a treasurer reads it: four headline figures, the
 * trailing year month by month, where the money came from and what it was spent on, then the
 * movements themselves. Three reads — `getOverview` (12 months), `getFeeDashboardStats` and
 * `listJournals(pageSize: 8)` — run together, so the page costs one round trip and no N+1.
 *
 * The outstanding-fees card is *derived here*, never selected: `ADR-0003` forbids storing a
 * balance, so it subtracts what has been allocated *and* what has been written off (concessions
 * plus credit notes) from what has been invoiced with the same `invoiceBalance` the fee dashboard
 * and invoice detail use, and the two pages can never disagree (`src/app/(app)/fees/page.tsx`).
 * Net position and every monthly figure come from `getOverview`, whose formula — including how a
 * reversal is dated — is stated on `application/ports.ts`.
 *
 * There are no write controls here: a ledger is read from this page and changed from the register
 * (`/finance/transactions`) and the expense list (`/finance/expenses`), each behind its own key.
 * The cards render even for an institution that has never posted, so the zeros are the answer
 * rather than an empty shell; the tables below them step aside for one EmptyState instead.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  ArrowsLeftRightIcon,
  ChartBarIcon,
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
import type { JournalStatus } from "@/modules/finance";
import { getFeeDashboardStats } from "@/modules/fees";
import { invoiceBalance } from "@/modules/fees/domain/fee-rules";
import {
  EXPENSE_CATEGORY_LABELS,
  JOURNAL_KIND_LABELS,
  JOURNAL_STATUS_LABELS,
  getOverview,
  listJournals,
} from "@/modules/finance";
import { add, fromDecimalText, isZero, toDecimalText } from "@/shared/money";

import { InstitutionPage } from "../_lib/institution-page";

export default async function FinanceOverviewPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="finance.view"
      title="Finance"
      description="The ledger this institution runs on — income, expense and what is still collectable"
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Finance" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view the finance ledger."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its ledger.",
        noInstitution: "A ledger belongs to an institution. Add one before recording anything.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      render={async ({ institution }) => {
        const institutionId = institution.id;
        const [overview, stats, recent] = await Promise.all([
          getOverview({ institutionId, months: 12 }),
          getFeeDashboardStats({ institutionId }),
          listJournals({ institutionId, pageSize: 8 }),
        ]);

        // Write-offs reduce what is collectable but are never allocated, so they are folded in
        // as `invoiceBalance`'s third argument — the same way the fee dashboard derives it.
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

        // Parsed rather than string-compared: `0`, `0.00` and `0.000` are all "nothing posted",
        // and the store returns whatever `SUM()` rendered the column as.
        const hasActivity =
          !isZero(fromDecimalText(overview.incomeTotal, overview.currency)) ||
          !isZero(fromDecimalText(overview.expenseTotal, overview.currency)) ||
          !isZero(fromDecimalText(outstanding, stats.currency)) ||
          recent.rows.length > 0;

        return (
          <div className="space-y-6">
            <section
              aria-label="Finance summary"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <StatCard
                label="Income"
                value={money(overview.currency, overview.incomeTotal)}
                hint="All-time posted income, corrections netted off"
                icon={MoneyIcon}
              />
              <StatCard
                label="Expense"
                value={money(overview.currency, overview.expenseTotal)}
                hint="All-time approved and paid expenditure"
                icon={ReceiptIcon}
              />
              <StatCard
                label="Net position"
                value={money(overview.currency, overview.netPosition)}
                hint="Income less expense — a negative figure is a real answer"
                icon={ArrowsLeftRightIcon}
              />
              <StatCard
                label="Outstanding fees"
                value={money(stats.currency, outstanding)}
                hint="Billed less payments, concessions and credit notes"
                icon={ClipboardTextIcon}
              />
            </section>

            {!hasActivity ? (
              <EmptyState
                icon={ChartBarIcon}
                title="No ledger activity yet"
                description="Fee collection, expense approval and recorded income post here as they happen. Collect a fee or record an expense to give this page something to report."
                action={
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    render={
                      <Link
                        href={`/finance/transactions?institution=${encodeURIComponent(institutionId)}`}
                      />
                    }
                  >
                    Open the register
                  </Button>
                }
              />
            ) : (
              <>
                <section aria-label="Monthly movement" className="space-y-3">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-semibold">Monthly movement</h2>
                    <p className="text-xs text-muted-foreground">
                      The trailing twelve months, oldest first — a correction counts in the month it
                      was posted, so the month that was wrong keeps its figure.
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-none border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Income</TableHead>
                          <TableHead className="text-right">Expense</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.monthly.map((month) => (
                          <TableRow key={month.month}>
                            <TableCell className="whitespace-nowrap font-medium">
                              {monthLabel(month.month)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              {money(overview.currency, month.income)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              {money(overview.currency, month.expense)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right">
                              {money(overview.currency, month.net)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <section aria-label="Breakdown" className="grid gap-4 md:grid-cols-2">
                  <BreakdownCard
                    title="By journal kind"
                    description="What kind of movement made the money move."
                    empty="Nothing has been posted yet."
                    rows={overview.byKind.map((row) => ({
                      key: row.kind,
                      label: JOURNAL_KIND_LABELS[row.kind],
                      total: row.total,
                    }))}
                    currency={overview.currency}
                  />
                  <BreakdownCard
                    title="By expense category"
                    description="Where the expenditure went, by the head's category."
                    empty="No expense has been approved yet."
                    rows={overview.byExpenseCategory.map((row) => ({
                      key: row.category,
                      label: EXPENSE_CATEGORY_LABELS[row.category],
                      total: row.total,
                    }))}
                    currency={overview.currency}
                  />
                </section>

                <section aria-label="Recent movements" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h2 className="text-sm font-semibold">Recent movements</h2>
                      <p className="text-xs text-muted-foreground">
                        The eight most recent journals at this institution — open one to read its
                        entries and, where the ledger allows it, reverse it.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      render={
                        <Link
                          href={`/finance/transactions?institution=${encodeURIComponent(institutionId)}`}
                        />
                      }
                    >
                      All transactions
                    </Button>
                  </div>
                  {recent.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No journals have been posted at this institution yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-none border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Reference</TableHead>
                            <TableHead className="hidden sm:table-cell">Kind</TableHead>
                            <TableHead className="hidden md:table-cell">Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>
                              <span className="sr-only">Actions</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recent.rows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="whitespace-nowrap font-mono text-xs">
                                {row.referenceNumber}
                              </TableCell>
                              <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                                {JOURNAL_KIND_LABELS[row.kind]}
                              </TableCell>
                              <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                                {row.transactionOn}
                              </TableCell>
                              <TableCell className="max-w-xs truncate">
                                {row.description ?? "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right">
                                {money(row.currency, row.totalAmount)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge tone={JOURNAL_STATUS_TONES[row.status]} dot={false}>
                                  {JOURNAL_STATUS_LABELS[row.status]}
                                </StatusBadge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end">
                                  <Button
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    render={
                                      <Link
                                        href={`/finance/transactions/${row.id}?institution=${encodeURIComponent(institutionId)}`}
                                      />
                                    }
                                  >
                                    Open
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        );
      }}
    />
  );
}

/** The stored labels and tones for a rendered journal status — duplicated per page, see report. */
const JOURNAL_STATUS_TONES: Record<JournalStatus, StatusTone> = {
  draft: "neutral",
  posted: "success",
  reversed: "warning",
};

/** `PKR 1,500.00` — there is no formatter in the money module, so pages shape the string. */
function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `2026-09` → `Sep 2026`. A month key is text, so it is labelled as text — no date parsing. */
function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  const name = MONTH_NAMES[index];
  return name === undefined ? month : `${name} ${month.slice(0, 4)}`;
}

/** One "where did it go / come from" table: label, total, in the register's currency. */
function BreakdownCard({
  title,
  description,
  rows,
  currency,
  empty,
}: Readonly<{
  title: string;
  description: string;
  rows: readonly { key: string; label: string; total: string }[];
  currency: string;
  empty: string;
}>) {
  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-none border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {money(currency, row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
