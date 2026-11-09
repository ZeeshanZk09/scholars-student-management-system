/**
 * Student roster (`PHASES.md` Phase 7, task 1 — "Student profile").
 *
 * Gated on `students.view` through the shared institution frame — the same key the navigation
 * model gates this href on (`RULES.md` §19: a page and its nav item must ask the same question).
 *
 * Two axes render independently, exactly as the domain keeps them (D-4): **lifecycle** is a
 * badge over the state machine's allowed edges, **archival** is a separate row flag that hides
 * edit/status controls and offers Restore instead. The archive logic lives in the row component
 * so the two never drift into one control that the service would then refuse.
 *
 * Row "Open" deep-links to `/student-info?institution=…&student=…` — the detail page addresses
 * rows by id (the slug is a readable reference, minted once and left stable).
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentIcon } from "@/components/ui/icons";
import { listStudents, LIFECYCLE_LABELS, type StudentListRow } from "@/modules/student";
import { hasPermission } from "@/shared/authorization";

import {
  ArchiveStudentDialog,
  ChangeLifecycleDialog,
  CreateStudentDialog,
  EditStudentDialog,
  UnarchiveStudentDialog,
} from "@/modules/student/ui/student-forms";
import { LIFECYCLE_TONES } from "@/modules/student/ui/form-options";

import { InstitutionPage } from "../_lib/institution-page";

export default async function StudentsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="students.view"
      title="Students"
      description="Enrolled students and their records"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Academic", href: "/academics" },
        { label: "Students" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view student records."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its students.",
        noInstitution:
          "Student records belong to an institution. Add one to start enrolling students.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={(ctx) =>
        ctx.institution === null || !hasPermission(ctx.principal, "students.create") ? null : (
          <CreateStudentDialog institutionId={ctx.institution.id} />
        )
      }
      render={async ({ institution, principal }) => {
        const canMutate = hasPermission(principal, "students.update");
        const students = await listStudents(institution.id);

        if (students.length === 0) {
          return (
            <EmptyState
              icon={StudentIcon}
              title="No students yet"
              description="Add the first student to create their record — guardians and class placement follow from it."
            />
          );
        }

        return (
          <div className="overflow-x-auto rounded-none border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission no.</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead className="hidden md:table-cell">Class</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <StudentRow
                    key={student.id}
                    institutionId={institution.id}
                    student={student}
                    canMutate={canMutate}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        );
      }}
    />
  );
}

function StudentRow({
  institutionId,
  student,
  canMutate,
}: Readonly<{
  institutionId: string;
  student: StudentListRow;
  canMutate: boolean;
}>) {
  const archived = student.archivedAt !== null;
  const classLabel =
    student.className === null
      ? null
      : student.groupName === null || student.groupName === student.className
        ? `${student.className} · ${student.sectionName ?? "—"}`
        : `${student.className} · ${student.groupName} · ${student.sectionName ?? "—"}`;

  return (
    <TableRow className={archived ? "opacity-70" : undefined}>
      <TableCell className="whitespace-nowrap font-mono text-xs">
        {student.admissionNumber}
      </TableCell>
      <TableCell>
        <div className="font-medium">
          {student.firstName} {student.lastName}
        </div>
        <div className="text-xs text-muted-foreground">{student.email}</div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {classLabel ?? "Not placed"}
        {student.sessionName !== null && <div className="text-xs">{student.sessionName}</div>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone={LIFECYCLE_TONES[student.lifecycle]} dot={false}>
            {LIFECYCLE_LABELS[student.lifecycle]}
          </StatusBadge>
          {archived && (
            <StatusBadge tone="danger" dot={false}>
              Archived
            </StatusBadge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          {canMutate &&
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
      </TableCell>
    </TableRow>
  );
}
