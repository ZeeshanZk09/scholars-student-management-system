/**
 * The expense register — what has been requested, what is waiting on a reviewer, and what has
 * already been paid. Status lives in the URL (`?status=`), exactly like the transaction register:
 * the chips are plain links, so a filtered view is shareable and survives reload with no client
 * state, and a status key the domain does not know reads as "no filter" (`SECURITY.md` §22).
 *
 * The state machine is on the page, not behind a detail route: `EXPENSE_TRANSITIONS` is
 * draft → submitted → approved → paid (or rejected), and the row renders exactly the step the
 * current status allows — Submit for `finance.record`, Approve / Reject / Mark paid for
 * `finance.manage`. Those buttons are courtesy; each action re-checks its key server-side and the
 * store re-checks the transition with the row's `version`, so two reviewers cannot both approve
 * the same expense (`DESIGN.md` §17).
 *
 * Creating happens in the header: an expense (needs a head to file it under) and a head itself,
 * both gated on their own keys. A submitted row also shows the reviewer who is *not* being asked
 * for anything — a one-line note rather than a disabled button, so the absence of Approve reads
 * as a permission rather than a bug.
 *
 * Pagination is two links in a labelled `<nav>` rather than `components/ui/pagination.tsx` —
 * that file imports `@phosphor-icons/react` without `"use client"`, and evaluating it in a
 * server component is the documented Turbopack `createContext` crash (`components/ui/icons.tsx`
 * header). `PAGE_SIZE` is passed to the read so the footer's arithmetic is the number the store
 * actually paged with.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { ReceiptIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExpenseStatus } from "@/modules/finance";
import {
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  listExpenseHeads,
  listExpenses,
} from "@/modules/finance";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/domain/finance-rules";
import { hasPermission } from "@/shared/authorization";

import {
  CreateExpenseDialog,
  CreateExpenseHeadDialog,
  ExpenseRowActions,
} from "@/modules/finance/ui/finance-forms";

import { InstitutionPage } from "../../_lib/institution-page";

/** The store's default page size, passed explicitly so "Page X of Y" agrees with the rows. */
const PAGE_SIZE = 50;
/** `wholeNumberFrom(1, 1, 100_000)` in `listExpensesSchema` — the accepted page range. */
const MAX_PAGE = 100_000;

export default async function FinanceExpensesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="finance.view"
      title="Expenses"
      description="Requested, approved and paid expenditure — one status at a time"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Finance", href: "/finance" },
        { label: "Expenses" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view expenses."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its expenses.",
        noInstitution: "An expense belongs to an institution. Add one before spending anything.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null) return null;
        const institutionId = ctx.institution.id;
        const canRecord = hasPermission(ctx.principal, "finance.record");
        const canManage = hasPermission(ctx.principal, "finance.manage");
        if (!canRecord && !canManage) return null;

        // Heads are read only for the record dialog, and only the active ones: a deactivated
        // head stops appearing in new expenses, which is what `setExpenseHeadActive` promises.
        const heads = canRecord ? await listExpenseHeads({ institutionId, isActive: true }) : [];
        return (
          <>
            {canRecord && <CreateExpenseDialog institutionId={institutionId} heads={heads} />}
            {canManage && <CreateExpenseHeadDialog institutionId={institutionId} />}
          </>
        );
      }}
      render={async ({ institution, principal }) => {
        const params = await searchParams;
        const status = readStatus(params.status);
        const page = readPage(params.page);

        const rows = await listExpenses({
          institutionId: institution.id,
          status,
          page,
          pageSize: PAGE_SIZE,
        });

        const canRecord = hasPermission(principal, "finance.record");
        const canManage = hasPermission(principal, "finance.manage");
        const totalPages = Math.max(1, Math.ceil(rows.total / PAGE_SIZE));
        const base = `/finance/expenses?institution=${encodeURIComponent(institution.id)}`;
        const awaitingReview = rows.rows.filter((row) => row.status === "submitted").length;

        return (
          <div className="space-y-4">
            <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
              <Link
                href={expensesHref(institution.id, null, 1)}
                aria-current={status === null ? "true" : undefined}
                className={chipClass(status === null)}
              >
                All
              </Link>
              {EXPENSE_STATUSES.map((key) => {
                const active = status === key;
                return (
                  <Link
                    key={key}
                    href={expensesHref(institution.id, key, 1)}
                    aria-current={active ? "true" : undefined}
                    className={chipClass(active)}
                  >
                    {EXPENSE_STATUS_LABELS[key]}
                  </Link>
                );
              })}
            </nav>

            {rows.rows.length === 0 ? (
              status === null && page === 1 ? (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No expenses yet"
                  description="Spending starts as a draft: record an expense against an expense head, submit it, and it waits here for a reviewer."
                />
              ) : (
                <EmptyState
                  icon={ReceiptIcon}
                  title="No expenses match this status"
                  description="Nothing sits at this stage right now — pick another status above, or show all of them."
                  action={
                    <Link href={base} className="text-xs underline underline-offset-4">
                      Show all expenses
                    </Link>
                  }
                />
              )
            ) : (
              <>
                <div className="overflow-x-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Expense head</TableHead>
                        <TableHead className="hidden sm:table-cell">Description</TableHead>
                        <TableHead className="hidden md:table-cell">Incurred</TableHead>
                        <TableHead className="hidden md:table-cell">Method</TableHead>
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
                          <TableCell className="font-medium">{row.expenseHeadName}</TableCell>
                          <TableCell className="hidden max-w-xs truncate text-muted-foreground sm:table-cell">
                            {row.description}
                          </TableCell>
                          <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                            {row.incurredOn}
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">
                            {PAYMENT_METHOD_LABELS[row.method]}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {money(row.currency, row.amount)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={EXPENSE_STATUS_TONES[row.status]} dot={false}>
                              {EXPENSE_STATUS_LABELS[row.status]}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            {canRecord || canManage ? (
                              <div className="flex items-center justify-end">
                                <ExpenseRowActions
                                  institutionId={institution.id}
                                  expenseId={row.id}
                                  version={row.version}
                                  status={row.status}
                                  canRecord={canRecord}
                                  canManage={canManage}
                                />
                              </div>
                            ) : null}
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
                  href={expensesHref.bind(null, institution.id, status)}
                />

                {awaitingReview > 0 && !canManage && (
                  <p className="text-xs text-muted-foreground">
                    {awaitingReview} expense{awaitingReview === 1 ? "" : "s"} waiting for a reviewer
                    — approving needs the finance manage permission.
                  </p>
                )}
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

/** An expenses URL carrying the institution, the live status, and `page` only when it matters. */
function expensesHref(institutionId: string, status: ExpenseStatus | null, page: number): string {
  const params = new URLSearchParams();
  params.set("institution", institutionId);
  if (status !== null) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return `/finance/expenses?${params.toString()}`;
}

/** An unknown enum key reads as "no filter"; arrays are not a filter here. */
function readStatus(raw: string | string[] | undefined): ExpenseStatus | null {
  return typeof raw === "string" && (EXPENSE_STATUSES as readonly string[]).includes(raw)
    ? (raw as ExpenseStatus)
    : null;
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

/** The stored labels and tones for a rendered expense status — duplicated per page, see report. */
const EXPENSE_STATUS_TONES: Record<ExpenseStatus, StatusTone> = {
  draft: "neutral",
  submitted: "warning",
  approved: "info",
  paid: "success",
  rejected: "danger",
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
 * Previous / "Page x of y" / Next, inside a labelled `<nav>` — the same semantics the icon-only
 * `Pagination` component gives its buttons, as links, so pagination works with JavaScript off
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
