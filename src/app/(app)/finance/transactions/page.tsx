/**
 * The transaction register — every journal at this institution, newest first, with the two ways a
 * treasurer narrows it: a kind chip row (fee collection, income, expense, adjustment…) and a
 * status chip row (draft / posted / reversed), both plain links so a filtered view is shareable
 * and survives reload with no client state, and a key the domain does not know reads as "no
 * filter" rather than an error (the address bar is the one input the service does not trust —
 * `SECURITY.md` §22). The active filter stays visible above the results in either branch.
 *
 * Search is a plain GET form: reference number or description, up to 120 characters because that
 * is what `listJournalsSchema` accepts (`optionalText(120)`) — a longer term is clipped here so a
 * pasted paragraph becomes "no match" instead of a 400 at the boundary.
 *
 * Income is recorded from this page's header (`finance.record`), and each row opens the journal
 * detail, where a posted reversible journal can be reversed (`finance.adjust`). Nothing edits a
 * journal in place: a ledger entry is corrected by a second entry (ARCHITECTURE.md §54).
 *
 * Pagination is two links inside a labelled `<nav>` rather than `components/ui/pagination.tsx`
 * — that file imports `@phosphor-icons/react` without `"use client"`, and evaluating it in a
 * server component is the documented Turbopack `createContext` crash (`components/ui/icons.tsx`
 * header). `PAGE_SIZE` is passed to the read so the footer's arithmetic is the same number the
 * store paged with.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReceiptIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JournalStatus, TransactionKind } from "@/modules/finance";
import {
  JOURNAL_KINDS,
  JOURNAL_KIND_LABELS,
  JOURNAL_STATUSES,
  JOURNAL_STATUS_LABELS,
  listAccounts,
  listJournals,
} from "@/modules/finance";
import { hasPermission } from "@/shared/authorization";

import { RecordIncomeDialog } from "@/modules/finance/ui/finance-forms";

import { InstitutionPage } from "../../_lib/institution-page";

/** The store's default page size, passed explicitly so "Page X of Y" agrees with the rows. */
const PAGE_SIZE = 50;
/** `optionalText(120)` in `listJournalsSchema` — past this, the read refuses. */
const MAX_SEARCH = 120;
/** `wholeNumberFrom(1, 1, 100_000)` in `listJournalsSchema` — the accepted page range. */
const MAX_PAGE = 100_000;

export default async function FinanceTransactionsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="finance.view"
      title="Transactions"
      description="The journal register — fee collection, payroll, income, expense and every correction"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Finance", href: "/finance" },
        { label: "Transactions" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view the transaction register."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its register.",
        noInstitution: "A register belongs to an institution. Add one before posting anything.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null || !hasPermission(ctx.principal, "finance.record")) {
          return null;
        }
        const accounts = await listAccounts({ institutionId: ctx.institution.id });
        return <RecordIncomeDialog institutionId={ctx.institution.id} accounts={accounts} />;
      }}
      render={async ({ institution }) => {
        const params = await searchParams;
        const kind = readOneOf(params.kind, JOURNAL_KINDS);
        const status = readOneOf(params.status, JOURNAL_STATUSES);
        const search = readSearch(params.search);
        const page = readPage(params.page);

        const rows = await listJournals({
          institutionId: institution.id,
          kind,
          status,
          search,
          page,
          pageSize: PAGE_SIZE,
        });

        const totalPages = Math.max(1, Math.ceil(rows.total / PAGE_SIZE));
        const filtered = kind !== null || status !== null || search !== null;
        const base = `/finance/transactions?institution=${encodeURIComponent(institution.id)}`;

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form
                method="get"
                action="/finance/transactions"
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="institution" value={institution.id} />
                {kind !== null && <input type="hidden" name="kind" value={kind} />}
                {status !== null && <input type="hidden" name="status" value={status} />}
                <div className="space-y-1">
                  <label htmlFor="journal-search" className="text-xs text-muted-foreground">
                    Search
                  </label>
                  <Input
                    id="journal-search"
                    type="search"
                    name="search"
                    placeholder="Reference or description"
                    defaultValue={search ?? ""}
                    maxLength={MAX_SEARCH}
                    className="h-8 w-full sm:w-64"
                  />
                </div>
                <Button type="submit" size="xs" variant="outline">
                  Search
                </Button>
                {search !== null && (
                  <Link
                    href={transactionsHref(institution.id, kind, status, null, 1)}
                    className="pb-2 text-xs underline underline-offset-4"
                  >
                    Clear
                  </Link>
                )}
              </form>
            </div>

            <div className="space-y-2">
              <nav aria-label="Filter by kind" className="flex flex-wrap gap-1.5">
                <Link
                  href={transactionsHref(institution.id, null, status, search, 1)}
                  aria-current={kind === null ? "true" : undefined}
                  className={chipClass(kind === null)}
                >
                  All kinds
                </Link>
                {JOURNAL_KINDS.map((key) => {
                  const active = kind === key;
                  return (
                    <Link
                      key={key}
                      href={transactionsHref(institution.id, key, status, search, 1)}
                      aria-current={active ? "true" : undefined}
                      className={chipClass(active)}
                    >
                      {JOURNAL_KIND_LABELS[key]}
                    </Link>
                  );
                })}
              </nav>
              <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
                <Link
                  href={transactionsHref(institution.id, kind, null, search, 1)}
                  aria-current={status === null ? "true" : undefined}
                  className={chipClass(status === null)}
                >
                  All statuses
                </Link>
                {JOURNAL_STATUSES.map((key) => {
                  const active = status === key;
                  return (
                    <Link
                      key={key}
                      href={transactionsHref(institution.id, kind, key, search, 1)}
                      aria-current={active ? "true" : undefined}
                      className={chipClass(active)}
                    >
                      {JOURNAL_STATUS_LABELS[key]}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {rows.rows.length === 0 ? (
              filtered || page > 1 ? (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No transactions match"
                  description="Nothing in the register fits these filters right now — widen the search, or show everything."
                  action={
                    <Link href={base} className="text-xs underline underline-offset-4">
                      Show all transactions
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No transactions yet"
                  description="Fee collection, payroll and recorded income post a journal here as they happen. Record an income entry to see the register move."
                />
              )
            ) : (
              <>
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
                      {rows.rows.map((row) => (
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
                                    href={`/finance/transactions/${row.id}?institution=${encodeURIComponent(institution.id)}`}
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

                <PaginationNav
                  page={page}
                  totalPages={totalPages}
                  total={rows.total}
                  href={transactionsHref.bind(null, institution.id, kind, status, search)}
                />
              </>
            )}
          </div>
        );
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* URL helpers                                                                 */
/* -------------------------------------------------------------------------- */

/** A register URL carrying the institution, every live filter, and `page` only when it matters. */
function transactionsHref(
  institutionId: string,
  kind: TransactionKind | null,
  status: JournalStatus | null,
  search: string | null,
  page: number,
): string {
  const params = new URLSearchParams();
  params.set("institution", institutionId);
  if (kind !== null) params.set("kind", kind);
  if (status !== null) params.set("status", status);
  if (search !== null) params.set("search", search);
  if (page > 1) params.set("page", String(page));
  return `/finance/transactions?${params.toString()}`;
}

/** Unknown enum key → no filter; arrays → no filter (repeated params are not a filter here). */
function readOneOf<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T | null {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : null;
}

function readSearch(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, MAX_SEARCH);
  return trimmed.length > 0 ? trimmed : null;
}

/** A page the store cannot accept (letters, `0`, past the cap) reads as page one, not a 400. */
function readPage(raw: string | string[] | undefined): number {
  if (typeof raw !== "string") return 1;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_PAGE ? value : 1;
}

/* -------------------------------------------------------------------------- */
/* Shared presentation                                                        */
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

/** Active and inactive differ in colour and weight, and the active chip carries `aria-current`. */
function chipClass(active: boolean): string {
  return active
    ? "rounded-none border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
    : "rounded-none border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
}

/**
 * Previous / "Page x of y" / Next, inside a labelled `<nav>`: the same semantics the icon-only
 * `Pagination` component gives its buttons, as links — so pagination works with JavaScript off
 * and every page is a URL the address bar can hold.
 */
function PaginationNav({
  page,
  totalPages,
  total,
  href,
}: Readonly<{
  page: number;
  totalPages: number;
  total: number;
  href: (page: number) => string;
}>) {
  if (total === 0 || totalPages <= 1) {
    return total === 0 ? null : (
      <p className="text-xs text-muted-foreground">Showing all {total} entries — one page.</p>
    );
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
    >
      <p>
        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </p>
      <div className="flex items-center gap-3">
        {page > 1 ? (
          <Link href={href(page - 1)} rel="prev" className="underline underline-offset-4">
            ← Previous
          </Link>
        ) : (
          <span aria-disabled="true" className="opacity-50">
            ← Previous
          </span>
        )}
        <span>
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={href(page + 1)} rel="next" className="underline underline-offset-4">
            Next →
          </Link>
        ) : (
          <span aria-disabled="true" className="opacity-50">
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
