/**
 * The payroll register — every run the institution has opened, newest first.
 *
 * The status chips are plain links, exactly like the expense register: a filtered view is shareable
 * and survives reload with no client state, and a status key the domain does not know reads as "no
 * filter" rather than as a 400 (`payroll-rules.ts`, `readStatus`).
 *
 * A run's figure is always the `SUM` the store computed over its lines, never a stored total —
 * `payroll.ts` refuses a stored one, and this page is what would have been wrong about it. Opening
 * a period is the only write the register offers, and it is gated on `payroll.calculate`: a period
 * is opened by whoever prepares the month, which is the same grant that calculates it
 * (`scripts/seed.ts` grants HR and admin both; the accountant may not open one).
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { BankIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPayrollRuns } from "@/modules/payroll";
import { listAcademicSessions } from "@/modules/academic";
import { hasPermission } from "@/shared/authorization";

import { CreatePayrollRunDialog } from "@/modules/payroll/ui/payroll-forms";

import { InstitutionPage } from "../../_lib/institution-page";

const STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  draft: "neutral",
  calculated: "info",
  approved: "warning",
  paid: "success",
  locked: "neutral",
};

/** A status chip the domain does not know reads as "no filter", never as a 400. */
function readStatus(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  return /^(draft|calculated|approved|paid|locked)$/.test(raw) ? raw : null;
}

function runsHref(institutionId: string, status: string | null): string {
  const base = `/finance/payroll?institution=${encodeURIComponent(institutionId)}`;
  return status === null ? base : `${base}&status=${status}`;
}

function chipClass(active: boolean): string {
  const base =
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return active
    ? `${base} border-transparent bg-primary text-primary-foreground`
    : `${base} border-border text-muted-foreground hover:bg-muted`;
}

export default async function PayrollPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="payroll.view"
      title="Payroll"
      description="Salary runs, their calculation and the payment that settles them"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Finance", href: "/finance" },
        { label: "Payroll" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view payroll runs."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its payroll runs.",
        noInstitution: "A payroll run belongs to an institution. Add one before opening a period.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null) return null;
        if (!hasPermission(ctx.principal, "payroll.calculate")) return null;
        // The session list is the institution's own; a run that names a session is scoped to that
        // term, and the dialog reads the options rather than asking the user to type a uuid.
        const academicSessions = await listAcademicSessions(ctx.institution.id);
        return (
          <CreatePayrollRunDialog
            institutionId={ctx.institution.id}
            academicSessions={academicSessions}
          />
        );
      }}
      render={async ({ institution, principal }) => {
        const params = await searchParams;
        const status = readStatus(params.status);
        const rows = await listPayrollRuns({ institutionId: institution.id });
        const visible = status === null ? rows : rows.filter((row) => row.status === status);
        const counts = new Map(
          rows.map(
            (row) =>
              [
                row.status,
                rows.filter((candidate) => candidate.status === row.status).length,
              ] as const,
          ),
        );
        void counts;

        const canCalculate = hasPermission(principal, "payroll.calculate");

        return (
          <div className="space-y-4">
            <nav aria-label="Filter by payroll status" className="flex flex-wrap gap-1.5">
              <Link
                href={runsHref(institution.id, null)}
                aria-current={status === null ? "true" : undefined}
                className={chipClass(status === null)}
              >
                All ({rows.length})
              </Link>
              {(["draft", "calculated", "approved", "paid", "locked"] as const).map((key) => (
                <Link
                  key={key}
                  href={runsHref(institution.id, key)}
                  aria-current={status === key ? "true" : undefined}
                  className={chipClass(status === key)}
                >
                  {key[0]?.toUpperCase() ?? ""}
                  {key.slice(1)} ({rows.filter((row) => row.status === key).length})
                </Link>
              ))}
            </nav>

            {visible.length === 0 ? (
              <EmptyState
                icon={BankIcon}
                title={status === null ? "No payroll runs yet" : `No ${status} runs`}
                description={
                  status === null
                    ? "Open a period, calculate it, adjust what a calculation cannot know, approve it and settle the payment."
                    : "Pick another status, or open a new period."
                }
              />
            ) : (
              <Table>
                <TableCaption>
                  {visible.length} run{visible.length === 1 ? "" : "s"}, newest first.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead className="text-right">Net total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/finance/payroll/${row.id}?institution=${encodeURIComponent(institution.id)}`}
                          className="underline underline-offset-4"
                        >
                          {row.periodLabel}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {row.periodStart} → {row.periodEnd}
                        </span>
                      </TableCell>
                      <TableCell>{row.academicSessionName ?? "—"}</TableCell>
                      <TableCell>
                        {row.includedCount}
                        {row.excludedCount > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            (+{row.excludedCount} excluded)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.currency} {row.netTotal}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONES[row.status] ?? "neutral"}>
                          {row.status[0]?.toUpperCase() ?? ""}
                          {row.status.slice(1)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {canCalculate && row.status === "draft" ? (
                          <Link
                            href={`/finance/payroll/${row.id}?institution=${encodeURIComponent(institution.id)}`}
                            className="text-xs underline underline-offset-4"
                          >
                            Open
                          </Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        );
      }}
    />
  );
}
