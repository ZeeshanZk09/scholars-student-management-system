/**
 * One admission application, seen through the detail lens (Phase 8). The row is addressed by the
 * path — `/admissions/[admissionId]` — while the institution still travels as `?institution=`, so
 * the address bar names the tenant and the record together and the roster can deep-link here with
 * both halves (`SECURITY.md` §22). The frame above resolves the capability and the tenant; the body
 * only ever asks for *this* application at *that* tenant, and a row that is gone answers with the
 * same "pick one from the list" the student page uses rather than a stack trace.
 *
 * Every control the header offers is a gate its own server action re-checks, so what this page
 * renders is a courtesy, not the boundary. Two of those controls mirror rules rather than
 * permissions alone: Edit appears only while `EDITABLE_ADMISSION_STATUSES` still holds (an approved
 * application is an audit fact — offering Edit would promise a write the service refuses), and
 * conversion appears only from `approved` and only while a session is open, because a closed
 * session refuses placement (`RULES.md` §44) and the UI should say so before the dialog opens, not
 * after the submit.
 *
 * Applicant, documents and history arrive with the row in one read (`AdmissionDetail`), so the
 * page costs no N+1 from the RSC; the class/group/section pickers are assembled once per session
 * here and handed to the dialogs as props, the same shape the forms expect.
 */
import Link from "next/link";

import { ErrorState } from "@/components/shared/error-state";
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
import type { DepartmentRow, SessionRow } from "@/modules/academic";
import { listAcademicSessions, listClassTree, listDepartments } from "@/modules/academic";
import type {
  AdmissionDetail,
  AdmissionDocumentRow,
  AdmissionHistoryRow,
} from "@/modules/admission";
import {
  ADMISSION_STATUS_LABELS,
  EDITABLE_ADMISSION_STATUSES,
  getAdmission,
} from "@/modules/admission";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { hasPermission } from "@/shared/authorization";

import {
  AdmissionDocumentDecisionDialog,
  ConvertAdmissionDialog,
  DecideAdmissionDialog,
  EditAdmissionDialog,
  RegisterAdmissionDocumentDialog,
} from "@/modules/admission/ui/admission-forms";
import {
  ADMISSION_STATUS_TONES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  humanize,
  scopeOptions,
} from "@/modules/admission/ui/form-options";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function AdmissionDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ admissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { admissionId } = await params;

  return (
    <InstitutionPage
      permission="admissions.view"
      title="Admission application"
      description="Applicant, outcome, documents and timeline for one application"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Admissions", href: "/admissions" },
        { label: "Application" },
      ]}
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
      render={async ({ institution, principal }) => {
        let detail: AdmissionDetail;
        try {
          detail = await getAdmission({ institutionId: institution.id, admissionId });
        } catch (error) {
          // A path segment that is not even a uuid fails the boundary schema before any row is
          // read, and at this layer that is an address which can never name a row — the URL is
          // the one input here the service does not trust, so a failure keyed to `admissionId`
          // answers like a missing application rather than handing the error boundary a
          // form-shaped validation error. Any other field failing is a real bug and still throws.
          const badAddress =
            error instanceof ValidationError && error.fieldErrors.admissionId !== undefined;
          if (error instanceof NotFoundError || badAddress) {
            return (
              <ErrorState
                title="Application not found"
                description="That application no longer exists at this institution. Pick one from the list instead."
              />
            );
          }
          throw error;
        }

        const [sessions, departments] = await Promise.all([
          listAcademicSessions(institution.id),
          listDepartments(institution.id),
        ]);
        const openSessions = sessions.filter((session) => session.closedAt === null);
        const trees = await Promise.all(
          sessions.map((session) => listClassTree(institution.id, session.id)),
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
        const sectionsBySession: Record<string, readonly SelectOption[]> = Object.fromEntries(
          sessions.map((session, index): [string, readonly SelectOption[]] => [
            session.id,
            scopes[index]?.sections ?? [],
          ]),
        );

        const canUpdate = hasPermission(principal, "admissions.update");
        const canApprove = hasPermission(principal, "admissions.approve");

        return (
          <AdmissionDetailBody
            institutionId={institution.id}
            detail={detail}
            sessions={sessions}
            openSessions={openSessions}
            classesBySession={classesBySession}
            groupsByClass={groupsByClass}
            sectionsBySession={sectionsBySession}
            departments={departments}
            canUpdate={canUpdate}
            canApprove={canApprove}
          />
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
  actions,
  children,
}: Readonly<{
  title: string;
  description?: string | undefined;
  actions?: React.ReactNode;
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
        {actions !== undefined && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
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
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

function AdmissionDetailBody({
  institutionId,
  detail,
  sessions,
  openSessions,
  classesBySession,
  groupsByClass,
  sectionsBySession,
  departments,
  canUpdate,
  canApprove,
}: Readonly<{
  institutionId: string;
  detail: AdmissionDetail;
  sessions: readonly SessionRow[];
  openSessions: readonly SessionRow[];
  classesBySession: Readonly<Record<string, readonly SelectOption[]>>;
  groupsByClass: Readonly<Record<string, readonly SelectOption[]>>;
  sectionsBySession: Readonly<Record<string, readonly SelectOption[]>>;
  departments: readonly DepartmentRow[];
  canUpdate: boolean;
  canApprove: boolean;
}>) {
  const { admission, documents, history } = detail;
  const status = admission.status;
  const editable = (EDITABLE_ADMISSION_STATUSES as readonly string[]).includes(status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            render={<Link href={`/admissions?institution=${encodeURIComponent(institutionId)}`} />}
          >
            ← All applications
          </Button>
          <h1 className="text-xl font-semibold">
            {admission.firstName} {admission.middleName !== null && `${admission.middleName} `}
            {admission.lastName}
          </h1>
          <span className="font-mono text-xs text-muted-foreground">
            {admission.applicationNumber}
          </span>
          <StatusBadge tone={ADMISSION_STATUS_TONES[status]} dot={false}>
            {ADMISSION_STATUS_LABELS[status]}
          </StatusBadge>
          {admission.archivedAt !== null && (
            <StatusBadge tone="danger" dot={false}>
              Archived
            </StatusBadge>
          )}
          {admission.studentId !== null && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              render={
                <Link
                  href={`/student-info?institution=${encodeURIComponent(institutionId)}&student=${encodeURIComponent(admission.studentId)}`}
                />
              }
            >
              Open student record
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canUpdate && editable && (
            <EditAdmissionDialog
              institutionId={institutionId}
              admission={admission}
              sessions={sessions}
              classesBySession={classesBySession}
              groupsByClass={groupsByClass}
            />
          )}
          {canApprove && (
            <DecideAdmissionDialog institutionId={institutionId} admission={admission} />
          )}
          {canApprove && status === "approved" && (
            <>
              {openSessions.length > 0 ? (
                <ConvertAdmissionDialog
                  institutionId={institutionId}
                  admission={admission}
                  openSessions={openSessions}
                  sectionsBySession={sectionsBySession}
                  departments={departments}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Conversion needs an open session — none is accepting placements right now.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <Section title="Applicant" description="As filed with the application.">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date of birth" value={admission.dateOfBirth} />
          <Field
            label="Gender"
            value={admission.gender === null ? null : humanize(admission.gender)}
          />
          <Field label="Email" value={admission.email} />
          <Field label="Phone" value={admission.phone} />
          <Field label="Address" value={admission.address} />
          <Field label="Reference link" value={admission.slug} mono />
        </dl>
      </Section>

      <Section
        title="Applied for"
        description="Class, group or grade — the scope this application asks for."
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Session" value={admission.sessionName} />
          <Field label="Class" value={admission.appliedClassName} />
          <Field label="Group" value={admission.appliedGroupName} />
          <Field label="Grade" value={admission.appliedGradeLevel} />
          <Field label="Test score" value={admission.testScore} mono />
          <Field label="Interview score" value={admission.interviewScore} mono />
          <Field
            label="Submitted on"
            value={admission.submittedAt?.toISOString().slice(0, 10) ?? null}
          />
        </dl>
      </Section>

      <Section
        title="Outcome"
        description={admission.decidedAt === null ? "No decision recorded yet." : undefined}
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Decided on"
            value={admission.decidedAt?.toISOString().slice(0, 10) ?? null}
          />
          <Field label="Decided by" value={admission.decidedByName} />
          <Field
            label="Converted on"
            value={admission.convertedAt?.toISOString().slice(0, 10) ?? null}
          />
          <Field label="Decision notes" value={admission.decisionNotes} />
          <Field label="Rejection reason" value={admission.rejectionReason} />
        </dl>
      </Section>

      <Section
        title="Documents"
        description="Official documents and records submitted for verification."
        actions={
          canUpdate ? (
            <RegisterAdmissionDocumentDialog
              institutionId={institutionId}
              admissionId={admission.id}
            />
          ) : undefined
        }
      >
        <DocumentsView
          institutionId={institutionId}
          admissionId={admission.id}
          documents={documents}
          canMutate={canUpdate}
        />
      </Section>

      <Section title="Timeline" description="Application status history and audit timeline, oldest first.">
        <HistoryView history={history} />
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

function DocumentsView({
  institutionId,
  admissionId,
  documents,
  canMutate,
}: Readonly<{
  institutionId: string;
  admissionId: string;
  documents: readonly AdmissionDocumentRow[];
  canMutate: boolean;
}>) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents registered yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead className="hidden sm:table-cell">File</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Received</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className="font-medium">{humanize(document.documentType)}</TableCell>
              <TableCell className="hidden max-w-xs truncate text-muted-foreground sm:table-cell">
                {document.originalFileName ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <StatusBadge tone={DOCUMENT_STATUS_TONES[document.status]} dot={false}>
                    {DOCUMENT_STATUS_LABELS[document.status]}
                  </StatusBadge>
                  {document.rejectionReason !== null && (
                    <span className="max-w-xs text-xs text-muted-foreground">
                      {document.rejectionReason}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                {document.createdAt.toISOString().slice(0, 10)}
              </TableCell>
              <TableCell className="text-right">
                {canMutate && document.status === "pending_verification" && (
                  <div className="flex justify-end gap-2">
                    <AdmissionDocumentDecisionDialog
                      institutionId={institutionId}
                      admissionId={admissionId}
                      document={document}
                      decision="verified"
                    />
                    <AdmissionDocumentDecisionDialog
                      institutionId={institutionId}
                      admissionId={admissionId}
                      document={document}
                      decision="rejected"
                    />
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HistoryView({ history }: Readonly<{ history: readonly AdmissionHistoryRow[] }>) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No history yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>By</TableHead>
            <TableHead className="hidden md:table-cell">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap font-mono text-xs">
                {entry.changedAt.toISOString().replace("T", " ").slice(0, 16)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {entry.fromStatus === null ? "—" : ADMISSION_STATUS_LABELS[entry.fromStatus]}
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium">
                {ADMISSION_STATUS_LABELS[entry.toStatus]}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {entry.changedByName ?? "—"}
              </TableCell>
              <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                {entry.notes ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
