/**
 * Student personal information (`PHASES.md` Phase 7, tasks 7–13, 16–17 — profile, lifecycle,
 * placement, enrollment, guardians, documents).
 *
 * Gated on `students.view` through the shared frame — this is a student record seen through
 * another lens, so it asks the question the roster asks (`RULES.md` §19). The row is addressed
 * by `?institution=…&student=…`; without `student` the page renders a picker rather than
 * guessing a first row (the address bar and the data on screen must name the same record).
 *
 * Every section pictures one relationship of the record and owns its own controls, so the page
 * stays a composition of small, independently authorized pieces: the action each dialog posts
 * (`src/modules/student/ui/actions.ts`) re-checks permission at the institution named in the
 * form, twice for mutations, regardless of what this page rendered.
 *
 * Archival (D-4) puts the page into restore-only mode: an archived row refuses profile edits at
 * the service, so the UI offers Restore instead of controls that would only refuse.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
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
import { NotePencilIcon } from "@/components/ui/icons";
import type { DepartmentRow, SessionRow } from "@/modules/academic";
import { listAcademicSessions, listClassTree, listDepartments } from "@/modules/academic";
import {
  getStudent,
  listGuardians,
  listStudents,
  LIFECYCLE_LABELS,
  type DocumentRow,
  type GuardianLinkRow,
  type GuardianListRow,
  type PlacementRow,
  type StudentDetail,
  type StudentListRow,
} from "@/modules/student";
import { NotFoundError } from "@/shared/errors";
import { hasPermission } from "@/shared/authorization";

import {
  ArchiveStudentDialog,
  ChangeLifecycleDialog,
  DocumentDecisionDialog,
  EditStudentDialog,
  EnrollStudentDialog,
  PlaceStudentDialog,
  RegisterDocumentDialog,
  UnarchiveStudentDialog,
} from "@/modules/student/ui/student-forms";
import {
  CreateGuardianDialog,
  LinkGuardianDialog,
  UnlinkGuardianDialog,
} from "@/modules/student/ui/guardian-forms";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  LIFECYCLE_TONES,
  humanize,
  sectionOptions,
} from "@/modules/student/ui/form-options";

import { InstitutionPage } from "../_lib/institution-page";

export default async function StudentInfoPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="students.view"
      title="Student Information"
      description="Personal, academic and guardian details for one student"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Academic", href: "/academics" },
        { label: "Students", href: "/students" },
        { label: "Student Info" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view student information."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its students.",
        noInstitution:
          "Student records belong to an institution. Add one before opening a student's details.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      render={async ({ institution, principal }) => {
        const canMutateStudents = hasPermission(principal, "students.update");
        const canManageGuardians = hasPermission(principal, "guardians.manage");
        const params = await searchParams;
        const studentId = typeof params.student === "string" ? params.student.trim() : "";

        if (studentId.length === 0) {
          const students = await listStudents(institution.id);
          return <StudentPicker institutionId={institution.id} students={students} />;
        }

        let detail: StudentDetail;
        try {
          detail = await getStudent(institution.id, studentId);
        } catch (error) {
          if (error instanceof NotFoundError) {
            return (
              <ErrorState
                title="Student not found"
                description="That student does not exist at this institution. Pick one from the list instead."
              />
            );
          }
          throw error;
        }

        const [sessions, departments, guardians] = await Promise.all([
          listAcademicSessions(institution.id),
          listDepartments(institution.id),
          listGuardians(institution.id),
        ]);
        const openSessions = sessions.filter((session) => session.closedAt === null);
        const trees = await Promise.all(
          openSessions.map((session) => listClassTree(institution.id, session.id)),
        );
        const sectionsBySession: Record<string, readonly SelectOption[]> = Object.fromEntries(
          openSessions.map((session, index) => [session.id, sectionOptions(trees[index] ?? [])]),
        );

        return (
          <StudentDetailBody
            institutionId={institution.id}
            detail={detail}
            openSessions={openSessions}
            sectionsBySession={sectionsBySession}
            departments={departments}
            guardians={guardians}
            canMutateStudents={canMutateStudents}
            canManageGuardians={canManageGuardians}
          />
        );
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Picker (no `?student=` yet)                                                 */
/* -------------------------------------------------------------------------- */

function StudentPicker({
  institutionId,
  students,
}: Readonly<{ institutionId: string; students: readonly StudentListRow[] }>) {
  if (students.length === 0) {
    return (
      <EmptyState
        icon={NotePencilIcon}
        title="No students yet"
        description="Add a student from the Students page — their details will open here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Choose a student to view their details.</p>
      <div className="overflow-x-auto rounded-none border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admission no.</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {student.admissionNumber}
                </TableCell>
                <TableCell className="font-medium">
                  {student.firstName} {student.lastName}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    render={
                      <Link
                        href={`/student-info?institution=${encodeURIComponent(institutionId)}&student=${encodeURIComponent(student.id)}`}
                      />
                    }
                  >
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
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

function StudentDetailBody({
  institutionId,
  detail,
  openSessions,
  sectionsBySession,
  departments,
  guardians,
  canMutateStudents,
  canManageGuardians,
}: Readonly<{
  institutionId: string;
  detail: StudentDetail;
  openSessions: readonly SessionRow[];
  sectionsBySession: Readonly<Record<string, readonly SelectOption[]>>;
  departments: readonly DepartmentRow[];
  guardians: readonly GuardianListRow[];
  canMutateStudents: boolean;
  canManageGuardians: boolean;
}>) {
  const { student, placements, enrollments, guardians: links, documents } = detail;
  const archived = student.archivedAt !== null;
  const activeLinks = links.filter((link) => link.isActive);
  const pastLinks = links.filter((link) => !link.isActive);
  const linkedIds = new Set(activeLinks.map((link) => link.guardianUserId));
  const linkableGuardians = guardians.filter((guardian) => !linkedIds.has(guardian.userId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            render={<Link href={`/students?institution=${encodeURIComponent(institutionId)}`} />}
          >
            ← All students
          </Button>
          <h1 className="text-xl font-semibold">
            {student.firstName} {student.middleName !== null && `${student.middleName} `}
            {student.lastName}
          </h1>
          <StatusBadge tone={LIFECYCLE_TONES[student.lifecycle]} dot={false}>
            {LIFECYCLE_LABELS[student.lifecycle]}
          </StatusBadge>
          {archived && (
            <StatusBadge tone="danger" dot={false}>
              Archived
            </StatusBadge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canMutateStudents &&
            (archived ? (
              <UnarchiveStudentDialog institutionId={institutionId} student={student} />
            ) : (
              <>
                <EditStudentDialog institutionId={institutionId} student={student} />
                <ChangeLifecycleDialog institutionId={institutionId} student={student} />
                <ArchiveStudentDialog institutionId={institutionId} student={student} />
              </>
            ))}
        </div>
      </div>

      {archived && (
        <p className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          This record is archived — profile edits and status changes are refused until it is
          restored.
        </p>
      )}

      <Section title="Profile" description="Identity and contact details as recorded on admission.">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Admission number" value={student.admissionNumber} mono />
          <Field label="Roll number" value={student.rollNumber} mono />
          <Field label="Date of birth" value={student.dateOfBirth} />
          <Field label="Gender" value={student.gender === null ? null : humanize(student.gender)} />
          <Field label="Email" value={student.email} />
          <Field label="Phone" value={student.phone} />
          <Field label="Address" value={student.address} />
          <Field label="Record slug" value={student.slug} mono />
        </dl>
      </Section>

      <Section
        title="Class placement"
        description={
          openSessions.length === 0
            ? "No open session is accepting placements right now."
            : "One current placement per session; history is kept."
        }
        actions={
          canMutateStudents && openSessions.length > 0 && !archived ? (
            <PlaceStudentDialog
              institutionId={institutionId}
              student={student}
              sessions={openSessions}
              sectionsBySession={sectionsBySession}
            />
          ) : undefined
        }
      >
        <PlacementView placements={placements} />
      </Section>

      <Section
        title="Enrollment"
        description="Academic year and grade — one row per (student, year, grade)."
        actions={
          canMutateStudents && openSessions.length > 0 && !archived ? (
            <EnrollStudentDialog
              institutionId={institutionId}
              student={student}
              sessions={openSessions}
              departments={departments}
            />
          ) : undefined
        }
      >
        <EnrollmentView enrollments={enrollments} />
      </Section>

      <Section
        title="Guardians"
        description="Links define who may see this student at this institution."
        actions={
          canManageGuardians && !archived ? (
            <>
              {linkableGuardians.length > 0 && (
                <LinkGuardianDialog
                  institutionId={institutionId}
                  student={student}
                  guardians={linkableGuardians}
                />
              )}
              <CreateGuardianDialog
                institutionId={institutionId}
                students={[student]}
                presetStudentId={student.id}
              />
            </>
          ) : undefined
        }
      >
        <GuardianLinksView
          institutionId={institutionId}
          studentId={student.id}
          activeLinks={activeLinks}
          pastLinks={pastLinks}
          canManage={canManageGuardians}
        />
      </Section>

      <Section
        title="Documents"
        description="Metadata only — the files themselves live in the object store."
        actions={
          canMutateStudents && !archived ? (
            <RegisterDocumentDialog institutionId={institutionId} studentId={student.id} />
          ) : undefined
        }
      >
        <DocumentsView
          institutionId={institutionId}
          studentId={student.id}
          documents={documents}
          canMutate={canMutateStudents}
        />
      </Section>
    </div>
  );
}

function PlacementView({ placements }: Readonly<{ placements: readonly PlacementRow[] }>) {
  if (placements.length === 0) {
    return <p className="text-sm text-muted-foreground">Not placed in any class yet.</p>;
  }

  return (
    <div className="space-y-4">
      {(() => {
        const current = placements.find((placement) => placement.isCurrent);
        if (current === undefined) return null;
        return (
          <div className="rounded-none border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="text-xs font-medium text-muted-foreground">Current placement</div>
            <div className="text-sm font-semibold">
              {current.sessionName} · {current.className}
              {current.groupName !== current.className && ` · ${current.groupName}`} ·{" "}
              {current.sectionName}
            </div>
          </div>
        );
      })()}
      <div className="overflow-x-auto rounded-none border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Class</TableHead>
              <TableHead className="hidden sm:table-cell">Reason</TableHead>
              <TableHead className="hidden sm:table-cell">Placed</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {placements.map((placement) => (
              <TableRow key={`${placement.academicSessionId}-${placement.sectionId}`}>
                <TableCell className="whitespace-nowrap">{placement.sessionName}</TableCell>
                <TableCell>
                  {placement.className}
                  {placement.groupName !== placement.className &&
                    ` · ${placement.groupName}`} · {placement.sectionName}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {placement.placementReason === null ? "—" : humanize(placement.placementReason)}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                  {placement.placedAt.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>
                  {placement.isCurrent ? (
                    <StatusBadge tone="success" dot={false}>
                      Current
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral" dot={false}>
                      Past
                    </StatusBadge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EnrollmentView({
  enrollments,
}: Readonly<{
  enrollments: readonly import("@/modules/student").EnrollmentRow[];
}>) {
  if (enrollments.length === 0) {
    return <p className="text-sm text-muted-foreground">No enrollment recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Year</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead className="hidden sm:table-cell">Department</TableHead>
            <TableHead>Enrolled on</TableHead>
            <TableHead className="hidden md:table-cell">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrollments.map((enrollment) => (
            <TableRow key={enrollment.id}>
              <TableCell className="whitespace-nowrap font-medium">
                {enrollment.academicYear}
              </TableCell>
              <TableCell>{enrollment.gradeLevel === null ? "—" : enrollment.gradeLevel}</TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {enrollment.departmentName ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {enrollment.enrolledOn}
              </TableCell>
              <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                {enrollment.description ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function GuardianLinksView({
  institutionId,
  studentId,
  activeLinks,
  pastLinks,
  canManage,
}: Readonly<{
  institutionId: string;
  studentId: string;
  activeLinks: readonly GuardianLinkRow[];
  pastLinks: readonly GuardianLinkRow[];
  canManage: boolean;
}>) {
  return (
    <div className="space-y-4">
      {activeLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No guardian linked yet. Link an existing account or add a new guardian.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-none border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guardian</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead className="hidden sm:table-cell">Priority</TableHead>
                <TableHead className="hidden md:table-cell">Flags</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeLinks.map((link) => (
                <TableRow key={link.guardianUserId}>
                  <TableCell>
                    <div className="font-medium">
                      {link.guardianFirstName} {link.guardianLastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{link.guardianEmail}</div>
                  </TableCell>
                  <TableCell>{humanize(link.relationship)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {link.contactType === null ? "—" : humanize(link.contactType)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    <div>{link.isFeePayer ? "Fee payer" : "—"}</div>
                    {!link.receivesNotifications && <div className="text-xs">No notifications</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <UnlinkGuardianDialog
                        institutionId={institutionId}
                        link={{
                          studentId,
                          guardianUserId: link.guardianUserId,
                          guardianFirstName: link.guardianFirstName,
                          guardianLastName: link.guardianLastName,
                          relationship: link.relationship,
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pastLinks.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Past links:</span>{" "}
          {pastLinks
            .map(
              (link) =>
                `${link.guardianFirstName} ${link.guardianLastName} (${humanize(link.relationship)})`,
            )
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function DocumentsView({
  institutionId,
  studentId,
  documents,
  canMutate,
}: Readonly<{
  institutionId: string;
  studentId: string;
  documents: readonly DocumentRow[];
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
                    <DocumentDecisionDialog
                      institutionId={institutionId}
                      studentId={studentId}
                      document={document}
                      decision="verified"
                    />
                    <DocumentDecisionDialog
                      institutionId={institutionId}
                      studentId={studentId}
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
