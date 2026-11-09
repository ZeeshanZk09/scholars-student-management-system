/**
 * One invoice, addressed by path (`/fees/invoices/[invoiceId]`) with the tenant still in
 * `?institution=` (`SECURITY.md` §22). The frame resolves the capability and the tenant; the body
 * asks for *this* invoice at *that* tenant, and an address that can never name a row (a path
 * segment that is not a uuid) answers with the same "pick one from the list" rather than handing
 * the error boundary a form-shaped validation error.
 *
 * Everything on the page is one `getFeeInvoice` read — lines, allocations, concessions and
 * deferrals arrive with the row, so the RSC costs no N+1 — plus two labelling reads (sessions and
 * structures) so the invoice's foreign keys render as names instead of uuids. Outstanding is
 * derived here with `invoiceBalance` (`ADR-0003`: no stored balance) from the total, the
 * allocated sum and the concessions the store already selected, so it agrees with the list page
 * to the minor unit.
 *
 * Every control below is a gate its own server action re-checks (`ui/actions.ts`): recording a
 * payment needs `fees.record`; concessions, deferrals, credit notes and deferral decisions need
 * `fees.adjust`. What this page renders is a courtesy, not the boundary. One shape the module
 * does not model is absent rather than faked: a credit note points at the invoice it corrects
 * only through free-text `notes`, so there is no credit-note list here — the roster carries the
 * note itself, and the correction you can see on this page is the outstanding figure falling.
 */
import Link from "next/link";

import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAcademicSessions } from "@/modules/academic";
import type {
  FeeStatus,
  InvoiceAllocationRow,
  InvoiceConcessionRow,
  InvoiceDeferralRow,
  InvoiceDetailRow,
  InvoiceLineRow,
  PaymentStatus,
} from "@/modules/fees";
import { getFeeInvoice, listFeeStructures } from "@/modules/fees";
import {
  FEE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  invoiceBalance,
  invoiceDisplayStatus,
} from "@/modules/fees/domain/fee-rules";
import { hasPermission } from "@/shared/authorization";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { fromDecimalText, toDecimalText } from "@/shared/money";

import {
  CreateCreditNoteDialog,
  DecideDeferralDialog,
  GrantConcessionDialog,
  RecordPaymentDialog,
  RequestDeferralDialog,
} from "@/modules/fees/ui/fee-forms";

import { InstitutionPage } from "../../../_lib/institution-page";

export default async function FeeInvoiceDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { invoiceId } = await params;

  return (
    <InstitutionPage
      permission="fees.view"
      title="Fee invoice"
      description="Lines, payments, concessions and deferrals for one charge"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Fees", href: "/fees" },
        { label: "Invoices", href: "/fees/invoices" },
        { label: "Invoice" },
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
      render={async ({ institution, principal }) => {
        const institutionId = institution.id;
        let invoice: InvoiceDetailRow;
        try {
          invoice = await getFeeInvoice({ institutionId, invoiceId });
        } catch (error) {
          // A non-uuid path segment fails the boundary schema before any row is read — a bad
          // address reads as a missing invoice. Any other field failing is a real bug and throws.
          const badAddress =
            error instanceof ValidationError && error.fieldErrors.invoiceId !== undefined;
          if (error instanceof NotFoundError || badAddress) {
            return (
              <ErrorState
                title="Invoice not found"
                description="That invoice no longer exists at this institution. Pick one from the list instead."
              />
            );
          }
          throw error;
        }

        const [sessions, structures] = await Promise.all([
          listAcademicSessions(institutionId),
          listFeeStructures({ institutionId }),
        ]);
        const sessionName =
          sessions.find((session) => session.id === invoice.academicSessionId)?.name ?? null;
        const structureName =
          invoice.feeStructureId === null
            ? null
            : (structures.find((row) => row.id === invoice.feeStructureId)?.name ?? null);

        const today = new Date();
        const status = invoiceDisplayStatus(invoice, today);
        // A credit note carries a total but is not a collectable balance, so "outstanding" is
        // meaningless for it (the roster and dashboard already render "—" for the same reason).
        const isCreditNote = invoice.kind === "credit_note";
        // Live concessions are written off, never allocated, so they belong in `invoiceBalance`'s
        // third argument — the exact figure `listInvoices` subtracted to derive this row's own
        // outstanding before it was opened.
        const outstandingText = toDecimalText(
          invoiceBalance(
            fromDecimalText(invoice.totalAmount, invoice.currency),
            fromDecimalText(invoice.allocatedSum, invoice.currency),
            fromDecimalText(invoice.concessionSum, invoice.currency),
          ),
        );
        const canRecord = hasPermission(principal, "fees.record");
        const canAdjust = hasPermission(principal, "fees.adjust");
        const pendingDeferrals = invoice.deferrals.filter((row) => !isDeferralDecided(row));
        const invoiceForPayment: InvoiceDetailRow & { outstanding: string } = {
          ...invoice,
          outstanding: outstandingText,
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  render={
                    <Link
                      href={`/fees/invoices?institution=${encodeURIComponent(institutionId)}`}
                    />
                  }
                >
                  ← All invoices
                </Button>
                <h1 className="font-mono text-xl font-semibold">{invoice.invoiceNumber}</h1>
                <span className="text-sm text-muted-foreground">
                  {invoice.studentName ?? "Student"}
                </span>
                {/* A correction is stored as a paid document, so the status badge would flatter
                    it; `Kind` below already says the same thing, and this says it first. */}
                {invoice.kind !== "regular" ? (
                  <StatusBadge tone="info" dot={false}>
                    Credit note
                  </StatusBadge>
                ) : (
                  <StatusBadge tone={INVOICE_STATUS_TONES[status]} dot={false}>
                    {FEE_STATUS_LABELS[status]}
                  </StatusBadge>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  render={
                    <Link
                      href={`/student-info?institution=${encodeURIComponent(institutionId)}&student=${encodeURIComponent(invoice.studentId)}`}
                    />
                  }
                >
                  Open student record
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canRecord && !isCreditNote && (
                  <RecordPaymentDialog
                    institutionId={institutionId}
                    studentId={invoice.studentId}
                    academicSessionId={invoice.academicSessionId}
                    invoice={invoiceForPayment}
                  />
                )}
                {canAdjust && (
                  <>
                    <GrantConcessionDialog
                      institutionId={institutionId}
                      studentId={invoice.studentId}
                      invoiceId={invoice.id}
                    />
                    <RequestDeferralDialog institutionId={institutionId} invoiceId={invoice.id} />
                    <CreateCreditNoteDialog institutionId={institutionId} invoiceId={invoice.id} />
                  </>
                )}
              </div>
            </div>

            <Section title="Summary" description="What this invoice is and when it was issued.">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Student" value={invoice.studentName} />
                <Field label="Session" value={sessionName} />
                <Field
                  label="Fee structure"
                  value={
                    invoice.feeStructureId === null
                      ? "Manual charge — no structure"
                      : (structureName ?? "—")
                  }
                />
                <Field label="Kind" value={humanize(invoice.kind)} />
                <Field label="Issued on" value={invoice.issuedOn} />
                <Field label="Due on" value={invoice.dueOn} />
                <Field label="Deferred until" value={invoice.deferredUntil} />
                <Field label="Waiver reason" value={invoice.waiverReason} />
                <Field label="Notes" value={invoice.notes} />
              </dl>
            </Section>

            <Section
              title="Amounts"
              description="Derived at read time — no balance is ever stored (ADR-0003)."
            >
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Billed total" value={money(invoice.currency, invoice.totalAmount)} />
                <Field
                  label="Allocated to date"
                  value={money(invoice.currency, invoice.allocatedSum)}
                />
                <Field label="Concessions" value={money(invoice.currency, invoice.concessionSum)} />
                <Field
                  label="Outstanding"
                  value={isCreditNote ? null : money(invoice.currency, outstandingText)}
                />
                <Field label="Currency" value={invoice.currency} />
              </dl>
            </Section>

            <Section
              title="Lines"
              description="Frozen when the invoice was issued — the billed total and line items remain unchanged for audit compliance."
            >
              <LinesView lines={invoice.lines} currency={invoice.currency} />
            </Section>

            <Section
              title="Payments"
              description="Allocations settling this invoice, newest received date first."
            >
              <AllocationsView allocations={invoice.allocations} currency={invoice.currency} />
            </Section>

            <Section
              title="Concessions"
              description="Discounts, waivers and scholarships granted against this invoice."
            >
              <ConcessionsView concessions={invoice.concessions} currency={invoice.currency} />
            </Section>

            <Section
              title="Deferrals"
              description="Requests to suspend collection — a live deferral outranks the due date."
            >
              <DeferralsView
                institutionId={institutionId}
                invoiceId={invoice.id}
                version={invoice.version}
                deferrals={invoice.deferrals}
                canDecide={canAdjust}
                pendingDeferrals={pendingDeferrals}
              />
            </Section>
          </div>
        );
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Section / field helpers                                                    */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description?: string | undefined;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-none border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description !== undefined && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: Readonly<{ label: string; value: string | null; mono?: boolean | undefined }>) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>
        {value === null || value.length === 0 ? "—" : value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Domain presentation                                                        */
/* -------------------------------------------------------------------------- */

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

/** `sibling_discount` → `Sibling discount` — kinds and categories have no label map. */
function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * "Pending" is what a request is until someone decides it. The row records the decision as the
 * approver's user id (and their notes), so an untouched request is the one carrying neither —
 * assumption stated here because the ports type has no explicit `decidedAt` (see report).
 */
function isDeferralDecided(row: InvoiceDeferralRow): boolean {
  return row.isApproved || row.approvedByUserId !== null || row.decisionNotes !== null;
}

function deferralDecisionLabel(row: InvoiceDeferralRow): string {
  if (!isDeferralDecided(row)) return "Pending";
  return row.isApproved ? "Approved" : "Declined";
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

function LinesView({
  lines,
  currency,
}: Readonly<{ lines: readonly InvoiceLineRow[]; currency: string }>) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">This invoice has no lines.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fee head</TableHead>
            <TableHead className="hidden sm:table-cell">Category</TableHead>
            <TableHead className="hidden md:table-cell">Taxable</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">{line.name}</TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {humanize(line.category)}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {line.isTaxable ? "Yes" : "No"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                {money(currency, line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AllocationsView({
  allocations,
  currency,
}: Readonly<{ allocations: readonly InvoiceAllocationRow[]; currency: string }>) {
  if (allocations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has been allocated to this invoice yet.
      </p>
    );
  }

  const rows = [...allocations].sort((left, right) =>
    left.receivedOn < right.receivedOn ? 1 : left.receivedOn > right.receivedOn ? -1 : 0,
  );

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Payment</TableHead>
            <TableHead className="hidden sm:table-cell">Received</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Payment status</TableHead>
            <TableHead className="hidden md:table-cell">Reference</TableHead>
            <TableHead className="text-right">Allocated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.paymentId}-${row.receivedOn}-${index}`}>
              <TableCell className="whitespace-nowrap font-mono text-xs">
                {row.paymentNumber}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                {row.receivedOn}
              </TableCell>
              <TableCell>{PAYMENT_METHOD_LABELS[row.method]}</TableCell>
              <TableCell>
                <StatusBadge tone={PAYMENT_STATUS_TONES[row.paymentStatus]} dot={false}>
                  {PAYMENT_STATUS_LABELS[row.paymentStatus]}
                </StatusBadge>
              </TableCell>
              <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                {row.referenceNumber ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                {money(currency, row.allocatedAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const PAYMENT_STATUS_TONES: Record<PaymentStatus, StatusTone> = {
  pending: "warning",
  completed: "success",
  failed: "danger",
  reversed: "warning",
  refunded: "info",
};

function ConcessionsView({
  concessions,
  currency,
}: Readonly<{ concessions: readonly InvoiceConcessionRow[]; currency: string }>) {
  if (concessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No concessions on this invoice.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Basis</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="hidden sm:table-cell">Granted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {concessions.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{humanize(row.kind)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {row.percentage !== null
                  ? `${row.percentage}%`
                  : money(currency, row.amount ?? "0")}
              </TableCell>
              <TableCell className="max-w-xs">{row.reason}</TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                {row.grantedAt.toISOString().slice(0, 10)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DeferralsView({
  institutionId,
  invoiceId,
  version,
  deferrals,
  canDecide,
  pendingDeferrals,
}: Readonly<{
  institutionId: string;
  invoiceId: string;
  version: number;
  deferrals: readonly InvoiceDeferralRow[];
  canDecide: boolean;
  pendingDeferrals: readonly InvoiceDeferralRow[];
}>) {
  if (deferrals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No deferral requests on this invoice — nothing is suspending collection beyond the due date.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requested window</TableHead>
            <TableHead>Decision</TableHead>
            <TableHead className="hidden sm:table-cell">Decided by</TableHead>
            <TableHead className="hidden md:table-cell">Notes</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deferrals.map((row) => {
            const decided = isDeferralDecided(row);
            const pending = !decided;
            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {row.requestedFrom} → {row.requestedUntil}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={!decided ? "warning" : row.isApproved ? "success" : "danger"}
                    dot={false}
                  >
                    {deferralDecisionLabel(row)}
                  </StatusBadge>
                </TableCell>
                <TableCell className="hidden font-mono text-xs sm:table-cell">
                  {row.approvedByUserId ?? "—"}
                </TableCell>
                <TableCell className="hidden max-w-xs text-muted-foreground md:table-cell">
                  {row.decisionNotes ?? "—"}
                </TableCell>
                <TableCell>
                  {pending && canDecide && (
                    <div className="flex items-center justify-end">
                      <DecideDeferralDialog
                        institutionId={institutionId}
                        deferralId={row.id}
                        invoiceId={invoiceId}
                        version={version}
                      />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {pendingDeferrals.length > 0 && !canDecide && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {pendingDeferrals.length} pending request
          {pendingDeferrals.length === 1 ? "" : "s"} — deciding needs the adjust permission.
        </p>
      )}
    </div>
  );
}
