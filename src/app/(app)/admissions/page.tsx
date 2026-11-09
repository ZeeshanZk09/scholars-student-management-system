/**
 * Admission applications roster (`PHASES.md` Phase 8, task 1). Gated on `admissions.view`
 * through the shared institution frame — the same key the navigation model gates this href on
 * (`RULES.md` §19: a page and its nav item must ask the same question).
 *
 * The status filter lives in the URL (`?status=`): the chips are plain links, so a filtered view
 * is shareable, survives reload and needs no client state — and a status key the domain does not
 * know reads as "no filter" rather than an error, because the address bar is the one input here
 * the service does not trust (`SECURITY.md` §22). The chip row renders above the results in
 * either branch so the active filter is always visible and always switchable.
 *
 * Row "Open" deep-links to `/admissions/[admissionId]?institution=…` — the detail page addresses
 * rows by id while the institution travels as `?institution=`, so both halves of the address are
 * in the URL on every page of the flow.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SelectOption } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GraduationCapIcon } from "@/components/ui/icons";
import { listAcademicSessions, listClassTree } from "@/modules/academic";
import {
  ADMISSION_STATUSES,
  ADMISSION_STATUS_LABELS,
  listAdmissions,
  type AdmissionListRow,
  type AdmissionStatus,
} from "@/modules/admission";
import { hasPermission } from "@/shared/authorization";

import { CreateAdmissionDialog } from "@/modules/admission/ui/admission-forms";
import { ADMISSION_STATUS_TONES, scopeOptions } from "@/modules/admission/ui/form-options";

import { InstitutionPage } from "../_lib/institution-page";

export default async function AdmissionsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="admissions.view"
      title="Admissions"
      description="Applications from enquiry to enrolment"
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Admissions" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view admission applications."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its applications.",
        noInstitution:
          "Applications belong to an institution. Add one before opening an application.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null || !hasPermission(ctx.principal, "admissions.create")) {
          return null;
        }
        const institutionId = ctx.institution.id;
        const sessions = await listAcademicSessions(institutionId);
        const trees = await Promise.all(
          sessions.map((session) => listClassTree(institutionId, session.id)),
        );
        const scopes = trees.map((tree) => scopeOptions(tree));
        const classesBySession: Record<string, readonly SelectOption[]> = Object.fromEntries(
          sessions.map((session, index): [string, readonly SelectOption[]] => [
            session.id,
            scopes[index]?.classes ?? [],
          ]),
        );
        const groupsByClass: Readonly<Record<string, readonly SelectOption[]>> = Object.assign(
          {},
          ...scopes.map((scope) => scope.groupsByClass),
        );
        return (
          <CreateAdmissionDialog
            institutionId={institutionId}
            sessions={sessions}
            classesBySession={classesBySession}
            groupsByClass={groupsByClass}
          />
        );
      }}
      render={async ({ institution }) => {
        const params = await searchParams;
        const raw = typeof params.status === "string" ? params.status : null;
        const status =
          raw !== null && (ADMISSION_STATUSES as readonly string[]).includes(raw)
            ? (raw as AdmissionStatus)
            : null;

        const rows = await listAdmissions(institution.id, status);
        const baseHref = `/admissions?institution=${encodeURIComponent(institution.id)}`;

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
              {ADMISSION_STATUSES.map((key) => {
                const active = status === key;
                return (
                  <Link
                    key={key}
                    href={`${baseHref}&status=${key}`}
                    aria-current={active ? "true" : undefined}
                    className={statusChipClass(active)}
                  >
                    {ADMISSION_STATUS_LABELS[key]}
                  </Link>
                );
              })}
            </nav>

            {rows.length === 0 ? (
              status === null ? (
                <EmptyState
                  icon={GraduationCapIcon}
                  title="No applications yet"
                  description="Filing the first application with New application starts the workflow — review, decision and conversion all follow from that record."
                />
              ) : (
                <EmptyState
                  icon={GraduationCapIcon}
                  title="No applications match this status"
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
                      <TableHead>Application no.</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Applied for</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <AdmissionRow key={row.id} institutionId={institution.id} row={row} />
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

/**
 * One status chip. Active and inactive differ in colour and weight, and the active one carries
 * `aria-current` so the current filter is not communicated by colour alone.
 */
function statusChipClass(active: boolean): string {
  return active
    ? "rounded-none border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
    : "rounded-none border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
}

function AdmissionRow({
  institutionId,
  row,
}: Readonly<{
  institutionId: string;
  row: AdmissionListRow;
}>) {
  const scope = [row.sessionName, row.appliedClassName, row.appliedGroupName]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const appliedFor = scope.length > 0 ? scope : (row.appliedGradeLevel ?? "—");

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-xs">{row.applicationNumber}</TableCell>
      <TableCell>
        <div className="font-medium">
          {row.firstName} {row.middleName !== null && `${row.middleName} `}
          {row.lastName}
        </div>
        {row.email !== null && <div className="text-xs text-muted-foreground">{row.email}</div>}
      </TableCell>
      <TableCell>{appliedFor}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {(row.submittedAt ?? row.createdAt).toISOString().slice(0, 10)}
      </TableCell>
      <TableCell>
        <StatusBadge tone={ADMISSION_STATUS_TONES[row.status]}>
          {ADMISSION_STATUS_LABELS[row.status]}
        </StatusBadge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label={`Open application ${row.applicationNumber}`}
            render={
              <Link
                href={`/admissions/${row.id}?institution=${encodeURIComponent(institutionId)}`}
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
