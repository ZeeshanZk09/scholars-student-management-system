/**
 * The invoice roster — everything the institution has billed, and what is still owed on it.
 *
 * The status filter lives in the URL (`?status=`), exactly like the admissions roster: the chips
 * are plain links, so a filtered view is shareable and survives reload with no client state, and
 * a status key the domain does not know reads as "no filter" rather than an error (the address
 * bar is the one input here the service does not trust — `SECURITY.md` §22). The chip row renders
 * above the results in either branch, so the active filter is always visible and switchable.
 *
 * Outstanding comes from the service (`InvoiceListEntry.outstanding`, derived with
 * `invoiceBalance` at read time — `ADR-0003` forbids storing it), and the status shown is
 * `invoiceDisplayStatus`, so a pending row past its due date says "overdue" before the store's
 * write-on-read refresh has touched it. Credit notes ride the roster alongside the charges they
 * correct: hiding a correction from the list that contains its original is how a bursar ends up
 * chasing money that was already written off. Each one is labelled "Credit note" in the status
 * cell instead of the paid badge it would otherwise inherit, and its outstanding shows "—" —
 * nothing is collectable against a correction — while its number, student, total and issue date
 * stay visible so it can be opened and read.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { ReceiptIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAcademicSessions } from "@/modules/academic";
import type { FeeStatus, InvoiceListEntry } from "@/modules/fees";
import { listFeeInvoices, listFeeStructures } from "@/modules/fees";
import {
  FEE_STATUSES,
  FEE_STATUS_LABELS,
  invoiceDisplayStatus,
} from "@/modules/fees/domain/fee-rules";
import { hasPermission } from "@/shared/authorization";

import { GenerateInvoicesDialog } from "@/modules/fees/ui/fee-forms";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function FeeInvoicesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="fees.view"
      title="Fee invoices"
      description="Everything billed and every correction, with payments, concessions and deferrals"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Fees", href: "/fees" },
        { label: "Invoices" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view fee invoices."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its invoices.",
        noInstitution: "Invoices belong to an institution. Add one before billing anyone.",
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
          <GenerateInvoicesDialog
            institutionId={institutionId}
            sessions={sessions}
            structures={structures}
          />
        );
      }}
      render={async ({ institution }) => {
        const params = await searchParams;
        const raw = typeof params.status === "string" ? params.status : null;
        const status =
          raw !== null && (FEE_STATUSES as readonly string[]).includes(raw)
            ? (raw as FeeStatus)
            : null;

        const rows = await listFeeInvoices({ institutionId: institution.id, status });
        const baseHref = `/fees/invoices?institution=${encodeURIComponent(institution.id)}`;
        const today = new Date();

        return (
          <div className="space-y-4">
            <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
              <Link
                href={baseHref}
                aria-current={status === null ? "true" : undefined}
                className={statusChipClass(status === null)}
              >
                All
              </Link>
              {FEE_STATUSES.map((key) => {
                const active = status === key;
                return (
                  <Link
                    key={key}
                    href={`${baseHref}&status=${key}`}
                    aria-current={active ? "true" : undefined}
                    className={statusChipClass(active)}
                  >
                    {FEE_STATUS_LABELS[key]}
                  </Link>
                );
              })}
            </nav>

            {rows.length === 0 ? (
              status === null ? (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No invoices yet"
                  description="Invoices are generated from a fee structure once its scope matches students in a session — define a structure, then generate from it."
                />
              ) : (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No invoices match this status"
                  description="Nothing sits at this stage right now — pick another status above, or show all of them."
                  action={
                    <Link href={baseHref} className="text-xs underline underline-offset-4">
                      Show all statuses
                    </Link>
                  }
                />
              )
            ) : (
              <div className="overflow-x-auto rounded-none border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice no.</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead className="hidden sm:table-cell">Issued</TableHead>
                      <TableHead className="hidden md:table-cell">Due</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <InvoiceRow
                        key={row.id}
                        institutionId={institution.id}
                        row={row}
                        today={today}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
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

function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

/** Active and inactive differ in colour and weight, and the active chip carries `aria-current`. */
function statusChipClass(active: boolean): string {
  return active
    ? "rounded-none border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
    : "rounded-none border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
}

function InvoiceRow({
  institutionId,
  row,
  today,
}: Readonly<{
  institutionId: string;
  row: InvoiceListEntry;
  today: Date;
}>) {
  const status = invoiceDisplayStatus(row, today);
  // `credit_note` is the only non-regular kind minted today; a correction carries nothing to
  // collect, so its balance cell says so rather than printing the credit figure as a debt.
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
      <TableCell className="whitespace-nowrap">{money(row.currency, row.totalAmount)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {isCreditNote ? "—" : money(row.currency, row.outstanding)}
      </TableCell>
      <TableCell>
        {/* A credit note is stored as a paid document, so its real status would read "Paid"
            here and look like money owed; the label says what the row actually is. */}
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
