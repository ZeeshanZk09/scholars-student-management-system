/**
 * One journal, addressed by path (`/finance/transactions/[transactionId]`) with the tenant still
 * in `?institution=` (`SECURITY.md` §22). The frame resolves the capability and the tenant; the
 * body asks for *this* journal at *that* tenant, and an address that can never name a row (a path
 * segment that is not a uuid) answers with "that transaction is not available" rather than
 * handing the error boundary a form-shaped validation error.
 *
 * The read is one `getJournal`: the header plus its entries arrive together, so the RSC costs no
 * N+1 (`ports.ts`). The in/out totals under the entries are summed here from the same rows the
 * table prints — a balanced journal has the two figures equal, and `assertJournalBalanced` would
 * have refused to post it otherwise, so a mismatch on this page would be a defect worth seeing
 * rather than a number worth hiding.
 *
 * The correction control is a reversal, and its absence is explained rather than left blank:
 * `assertReversalAllowed` (domain) is what the action will apply, so this page shows the same
 * three refusals as hints — a fee collection is refunded from its payment, a payroll or opening
 * journal has no reversal in this module, and a draft has not posted yet. What is offered here is
 * courtesy; `reverseJournalAction` re-checks `finance.adjust` and the domain re-checks the rest.
 *
 * `reversesTransactionId` is read the way the store writes it: the *reversing* journal carries a
 * pointer to the journal it corrects (`drizzle-store.ts`, `insertJournal({ reversesTransactionId:
 * original.id })`), so it renders as "Corrects →". The schema and ports doc-comments describe the
 * opposite direction; the code is the truth and this page follows it (flagged in the report).
 */
import Link from "next/link";
import type { ReactNode } from "react";

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
import type {
  JournalDetailRow,
  JournalStatus,
  LedgerEntryRow,
  TransactionKind,
} from "@/modules/finance";
import { JOURNAL_KIND_LABELS, JOURNAL_STATUS_LABELS, getJournal } from "@/modules/finance";
import {
  EXPENSE_CATEGORY_LABELS,
  REVERSIBLE_JOURNAL_KINDS,
} from "@/modules/finance/domain/finance-rules";
import { hasPermission } from "@/shared/authorization";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { add, fromDecimalText, toDecimalText } from "@/shared/money";

import { ReverseJournalDialog } from "@/modules/finance/ui/finance-forms";

import { InstitutionPage } from "../../../_lib/institution-page";

export default async function TransactionDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ transactionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { transactionId } = await params;

  return (
    <InstitutionPage
      permission="finance.view"
      title="Transaction"
      description="The journal's header, its entries, and how it can be corrected"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Finance", href: "/finance" },
        { label: "Transactions", href: "/finance/transactions" },
        { label: "Journal" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view transactions."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its journals.",
        noInstitution: "A journal belongs to an institution. Add one before posting anything.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      render={async ({ institution, principal }) => {
        const institutionId = institution.id;
        const result = await readJournal(institutionId, transactionId);
        if (!result.ok) return result.notFound;
        const journal = result.journal;

        const canAdjust = hasPermission(principal, "finance.adjust");
        const reversible = REVERSIBLE_JOURNAL_KINDS.some((kind) => kind === journal.kind);
        const registerHref = `/finance/transactions?institution=${encodeURIComponent(institutionId)}`;
        const totals = sumByDirection(journal.entries, journal.currency);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  render={<Link href={registerHref} />}
                >
                  ← All transactions
                </Button>
                <h1 className="font-mono text-xl font-semibold">{journal.referenceNumber}</h1>
                <StatusBadge tone="info" dot={false}>
                  {JOURNAL_KIND_LABELS[journal.kind]}
                </StatusBadge>
                <StatusBadge tone={JOURNAL_STATUS_TONES[journal.status]} dot={false}>
                  {JOURNAL_STATUS_LABELS[journal.status]}
                </StatusBadge>
                <span className="text-sm text-muted-foreground">{journal.transactionOn}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canAdjust && journal.status === "posted" && reversible ? (
                  <ReverseJournalDialog
                    institutionId={institutionId}
                    journalId={journal.id}
                    referenceNumber={journal.referenceNumber}
                  />
                ) : (
                  <p className="max-w-md text-xs text-muted-foreground">
                    {reversalHint(journal.kind, journal.status)}
                  </p>
                )}
              </div>
            </div>

            <Section
              title="Header"
              description="What this journal is, when it happened, and where it sits in the correction history."
            >
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Reference" value={journal.referenceNumber} mono />
                <Field label="Kind" value={JOURNAL_KIND_LABELS[journal.kind]} />
                <Field label="Status" value={JOURNAL_STATUS_LABELS[journal.status]} />
                <Field label="Dated" value={journal.transactionOn} />
                <Field label="Posted at" value={formatInstant(journal.postedAt)} />
                <Field label="Reversed at" value={formatInstant(journal.reversedAt)} />
                <Field
                  label="Corrects"
                  value={journal.reversesTransactionId}
                  mono
                  href={
                    journal.reversesTransactionId === null
                      ? null
                      : `/finance/transactions/${journal.reversesTransactionId}?institution=${encodeURIComponent(institutionId)}`
                  }
                />
                <Field label="Source payment" value={journal.paymentId} mono />
                <Field label="Payroll run" value={journal.payrollRunId} mono />
                <Field
                  label="Description"
                  value={journal.description}
                  className="sm:col-span-2 lg:col-span-3"
                />
              </dl>
            </Section>

            <Section
              title="Entries"
              description={`Both sides of the journal, in ${journal.currency} — every journal is balanced, so the two totals below are the same figure.`}
            >
              <EntriesView entries={journal.entries} totals={totals} currency={journal.currency} />
            </Section>
          </div>
        );
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

/** The read either yields the journal or the element to render instead of it. */
type JournalRead =
  | { readonly ok: true; readonly journal: JournalDetailRow }
  | { readonly ok: false; readonly notFound: ReactNode };

/**
 * A bad address reads as a missing journal. Anything else — a different field failing, an
 * infrastructure error — is a real bug and is rethrown to the error boundary.
 */
async function readJournal(institutionId: string, journalId: string): Promise<JournalRead> {
  try {
    return { ok: true, journal: await getJournal({ institutionId, journalId }) };
  } catch (error) {
    const badAddress =
      error instanceof ValidationError && error.fieldErrors.journalId !== undefined;
    if (error instanceof NotFoundError || badAddress) {
      return {
        ok: false,
        notFound: (
          <ErrorState
            title="Transaction not found"
            description="That journal no longer exists at this institution. Pick one from the register instead."
          />
        ),
      };
    }
    throw error;
  }
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
  href,
  className,
}: Readonly<{
  label: string;
  value: string | null;
  mono?: boolean | undefined;
  href?: string | null | undefined;
  className?: string | undefined;
}>) {
  const empty = value === null || value.length === 0;
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>
        {empty ? (
          "—"
        ) : href !== null && href !== undefined ? (
          <Link href={href} className="underline underline-offset-4">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Domain presentation                                                        */
/* -------------------------------------------------------------------------- */

/** The stored labels and tones for a rendered journal status — duplicated per page, see report. */
const JOURNAL_STATUS_TONES: Record<JournalStatus, StatusTone> = {
  draft: "neutral",
  posted: "success",
  reversed: "warning",
};

function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

/** A timestamp is shown as its date and time in UTC — the store keeps instants, not displays. */
function formatInstant(value: Date | null): string | null {
  return value === null ? null : value.toISOString().replace("T", " ").slice(0, 16);
}

/**
 * Why the reversal control is not here — the same three refusals `assertReversalAllowed` will
 * apply to the action, in its words, so the page never shows a control that can only fail.
 * Permission is deliberately not one of them: a user without `finance.adjust` simply sees no
 * control and no explanation of someone else's grant.
 */
function reversalHint(kind: TransactionKind, status: JournalStatus): string {
  if (kind === "fee_collection") {
    return "A fee payment is corrected by refunding it — issue the refund from the payment, and it updates both records together.";
  }
  if (!REVERSIBLE_JOURNAL_KINDS.some((key) => key === kind)) {
    return `A ${JOURNAL_KIND_LABELS[kind].toLowerCase()} journal has no reversal in this module.`;
  }
  if (status !== "posted") {
    return `Only a posted journal can be reversed; this one is ${JOURNAL_STATUS_LABELS[status].toLowerCase()}.`;
  }
  return "Reversing needs the finance adjust permission.";
}

/* -------------------------------------------------------------------------- */
/* Entries                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Both sides of the journal plus their totals.
 *
 * The in/out sums are computed with the shared money helpers rather than by adding strings: they
 * are exact decimal texts, and every entry of a journal carries that journal's currency
 * (`assertJournalBalanced` refuses a mixed one), so one `currency` label covers the column.
 */
function EntriesView({
  entries,
  totals,
  currency,
}: Readonly<{
  entries: readonly LedgerEntryRow[];
  totals: { readonly in: string; readonly out: string };
  currency: string;
}>) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">This journal has no entries.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="hidden sm:table-cell">Direction</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead className="hidden md:table-cell">Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{entry.accountName}</TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {DIRECTION_LABELS[entry.direction]}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {entry.category !== null
                  ? EXPENSE_CATEGORY_LABELS[entry.category]
                  : (entry.feeCategory ?? "—")}
              </TableCell>
              <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                {entry.description ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                {money(currency, entry.amount)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={3} className="hidden text-xs text-muted-foreground md:table-cell">
              Totals — the two sides of one balanced journal
            </TableCell>
            <TableCell className="hidden text-right text-xs font-medium md:table-cell">
              {money(currency, totals.in)} in
            </TableCell>
            <TableCell className="whitespace-nowrap text-right text-xs font-medium">
              {money(currency, totals.out)} out
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/** `in` / `out` labels, from the domain's own direction vocabulary. */
const DIRECTION_LABELS = {
  in: "Money in",
  out: "Money out",
} as const;

/** Exact decimal sums per side — `add` over parsed decimals, never string concatenation. */
function sumByDirection(
  entries: readonly {
    readonly direction: "in" | "out";
    readonly amount: string;
  }[],
  currency: string,
): { readonly in: string; readonly out: string } {
  let inflow = fromDecimalText("0", currency);
  let outflow = fromDecimalText("0", currency);
  for (const entry of entries) {
    const amount = fromDecimalText(entry.amount, currency);
    if (entry.direction === "in") {
      inflow = add(inflow, amount);
    } else {
      outflow = add(outflow, amount);
    }
  }
  return { in: toDecimalText(inflow), out: toDecimalText(outflow) };
}
