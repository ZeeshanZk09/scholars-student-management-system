/**
 * The fees dashboard — the target the sidebar's `/fees` item has been pointing at with a
 * "Planned" badge until now (`src/lib/navigation.ts`; flipping its `disabled` flag is the whole
 * reason this file exists, and `navigation.test.ts` checks the two stay in step).
 *
 * Three surfaces, in the order a bursar reads them. The headline figures come from one
 * `getFeeDashboardStats` read — and the "outstanding" card is *derived here*, never selected:
 * `ADR-0003` forbids storing a balance, so the dashboard subtracts what has been allocated *and
 * what has been written off* (concessions plus credit notes) from what has been invoiced with the
 * same `invoiceBalance` the invoice list and detail use, and the arithmetic can never disagree
 * with them. The recent-invoice table is one `listInvoices` read
 * (the store's overdue refresh runs on it, so a row past its due date says "overdue" even before
 * any job flips it) sorted by `issuedOn` here rather than trusting the store's `invoiceNumber`
 * order, and the two cards at the bottom are the only routes out of this page.
 *
 * Header actions are one dialog pair behind `fees.manage`, and they are *courtesy*: every write
 * those dialogs submit re-checks the same key in `ui/actions.ts` (`RULES.md` §19 — a page and the
 * nav item that reaches it ask the same question, and so does the action behind the button).
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowsLeftRightIcon,
  ClipboardTextIcon,
  ClockIcon,
  MoneyIcon,
  ReceiptIcon,
  SquaresFourIcon,
  WarningCircleIcon,
} from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NavIcon } from "@/lib/navigation";
import { listAcademicSessions } from "@/modules/academic";
import type { FeeStatus, InvoiceListEntry } from "@/modules/fees";
import { getFeeDashboardStats, listFeeInvoices, listFeeStructures } from "@/modules/fees";
import {
  FEE_STATUS_LABELS,
  invoiceBalance,
  invoiceDisplayStatus,
} from "@/modules/fees/domain/fee-rules";
import { hasPermission } from "@/shared/authorization";
import { add, fromDecimalText, toDecimalText } from "@/shared/money";

import { CreateFeeStructureDialog, GenerateInvoicesDialog } from "@/modules/fees/ui/fee-forms";

import { InstitutionPage } from "../_lib/institution-page";

export default async function FeesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="fees.view"
      title="Fees"
      description="Structures, invoices and collections for this institution"
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Fees" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view fees."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its fees.",
        noInstitution:
          "Fees belong to an institution. Add one before defining a fee structure for it.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null || !hasPermission(ctx.principal, "fees.manage")) {
          return null;
        }
        const institutionId = ctx.institution.id;
        const [sessions, structures] = await Promise.all([
          listAcademicSessions(institutionId),
          listFeeStructures({ institutionId }),
        ]);
        return (
          <>
            <CreateFeeStructureDialog institutionId={institutionId} />
            <GenerateInvoicesDialog
              institutionId={institutionId}
              sessions={sessions}
              structures={structures}
            />
          </>
        );
      }}
      render={async ({ institution }) => {
        const institutionId = institution.id;
        const [stats, invoices] = await Promise.all([
          getFeeDashboardStats({ institutionId }),
          listFeeInvoices({ institutionId }),
        ]);

        // Write-offs reduce what is collectable but are never allocated, so they are folded in
        // as `invoiceBalance`'s third argument — the same way the invoice detail derives it.
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
        const recent = [...invoices].sort((a, b) => compareByIssueDate(a, b)).slice(0, 10);

        return (
          <div className="space-y-6">
            <section
              aria-label="Fee summary"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <StatCard
                label="Total invoiced"
                value={money(stats.currency, stats.totalInvoiced)}
                hint="Billed across every invoice"
                icon={MoneyIcon}
              />
              <StatCard
                label="Payments allocated"
                value={money(stats.currency, stats.totalAllocated)}
                hint="Settled against those invoices"
                icon={ReceiptIcon}
              />
              <StatCard
                label="Outstanding"
                value={money(stats.currency, outstanding)}
                hint="Still collectable — billed less payments, concessions and credit notes"
                icon={ArrowsLeftRightIcon}
              />
              <StatCard
                label="Overdue total"
                value={money(stats.currency, stats.overdueTotal)}
                hint="Past the due date, deferrals excluded"
                icon={WarningCircleIcon}
              />
              <StatCard
                label="Open invoices"
                value={stats.openInvoiceCount}
                hint="Not fully settled yet"
                icon={ClipboardTextIcon}
              />
              <StatCard
                label="Overdue invoices"
                value={stats.overdueInvoiceCount}
                hint="Past due with no live deferral"
                icon={ClockIcon}
              />
            </section>

            <section aria-label="Recent invoices" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-semibold">Recent invoices</h2>
                  <p className="text-xs text-muted-foreground">
                    The ten most recently issued documents at this institution — charges, and the
                    credit notes correcting them.
                  </p>
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  render={
                    <Link
                      href={`/fees/invoices?institution=${encodeURIComponent(institutionId)}`}
                    />
                  }
                >
                  All invoices
                </Button>
              </div>

              {recent.length === 0 ? (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No invoices yet"
                  description="Invoices are generated from a fee structure once its scope matches students in a session — define a structure first, then generate from it."
                  action={
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      render={
                        <Link
                          href={`/fees/structures?institution=${encodeURIComponent(institutionId)}`}
                        />
                      }
                    >
                      Open fee structures
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice no.</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead className="hidden sm:table-cell">Issued</TableHead>
                        <TableHead className="hidden md:table-cell">Due</TableHead>
                        <TableHead>Outstanding</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.map((row) => (
                        <RecentInvoiceRow key={row.id} institutionId={institutionId} row={row} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section aria-label="Fee sections" className="grid gap-4 md:grid-cols-2">
              <SectionCard
                href={`/fees/structures?institution=${encodeURIComponent(institutionId)}`}
                icon={SquaresFourIcon}
                title="Fee structures"
                description="What the institution charges — scope, amounts, discounts and instalments."
              />
              <SectionCard
                href={`/fees/invoices?institution=${encodeURIComponent(institutionId)}`}
                icon={ReceiptIcon}
                title="Invoices"
                description="Everything billed, with the payments, concessions and deferrals against it."
              />
            </section>
          </div>
        );
      }}
    />
  );
}

/** The stored labels and tones for a rendered invoice status — duplicated per page, see report. */
const INVOICE_STATUS_TONES: Record<FeeStatus, StatusTone> = {
  pending: "neutral",
  partial: "info",
  paid: "success",
  overdue: "danger",
  deferred: "warning",
  waived: "info",
  cancelled: "neutral",
};

/** `PKR 1,500.00` — there is no formatter in the money module, so pages shape the string. */
function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

/** Newest issue date first; the invoice number breaks the tie for same-day issues. */
function compareByIssueDate(left: InvoiceListEntry, right: InvoiceListEntry): number {
  if (left.issuedOn !== right.issuedOn) return left.issuedOn < right.issuedOn ? 1 : -1;
  return left.invoiceNumber < right.invoiceNumber ? 1 : -1;
}

function RecentInvoiceRow({
  institutionId,
  row,
}: Readonly<{
  institutionId: string;
  row: InvoiceListEntry;
}>) {
  const status = invoiceDisplayStatus(row, new Date());
  // Credit notes ride `listInvoices` alongside charges; the only non-regular kind minted today
  // is `credit_note`, and neither it nor a correction of that shape is a collectable balance.
  const isCreditNote = row.kind !== "regular";

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-xs">{row.invoiceNumber}</TableCell>
      <TableCell className="font-medium">{row.studentName ?? "—"}</TableCell>
      <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
        {row.issuedOn}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
        {row.dueOn ?? "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {isCreditNote ? "—" : money(row.currency, row.outstanding)}
      </TableCell>
      <TableCell>
        {isCreditNote ? (
          <StatusBadge tone="info" dot={false}>
            Credit note
          </StatusBadge>
        ) : (
          <StatusBadge tone={INVOICE_STATUS_TONES[status]} dot={false}>
            {FEE_STATUS_LABELS[status]}
          </StatusBadge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="xs"
            variant="outline"
            render={
              <Link
                href={`/fees/invoices/${row.id}?institution=${encodeURIComponent(institutionId)}`}
              />
            }
          >
            Open
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** One destination card: icon, title, description, whole card linked. */
function SectionCard({
  href,
  icon: Icon,
  title,
  description,
}: Readonly<{
  href: string;
  icon: NavIcon;
  title: string;
  description: string;
}>) {
  return (
    <Card className="rounded-none shadow-none">
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden="true" className="text-muted-foreground *:size-4">
            <Icon />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-0">
        <p className="text-xs text-muted-foreground">{description}</p>
        <Button type="button" size="xs" variant="outline" render={<Link href={href} />}>
          Open
        </Button>
      </CardContent>
    </Card>
  );
}
