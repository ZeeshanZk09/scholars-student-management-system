/**
 * Guardian roster (`PHASES.md` Phase 7, tasks 4–6 — the guardian entity and its links).
 *
 * Gated on `guardians.view` — the same key the navigation model gates this href on; not
 * `academic.manage`, which asks whether the visitor may restructure an academic calendar rather
 * than whether they may read a parent's contact details (`RULES.md` §19).
 *
 * A guardian has **no institution on the person** (ADR-0004 §2) — this list is built entirely
 * from `guardian_links` into this institution's students, so an unlinked person is invisible
 * here by design. That is why "Link" sits beside every row: linking is what brings someone into
 * scope, and the unlink control lives on the student's own page, where the relationship is
 * actually pictured.
 */
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsersThreeIcon } from "@/components/ui/icons";
import { listGuardians, listStudents } from "@/modules/student";
import { hasPermission } from "@/shared/authorization";

import {
  CreateGuardianDialog,
  EditGuardianDialog,
  LinkStudentDialog,
} from "@/modules/student/ui/guardian-forms";

import { InstitutionPage } from "../_lib/institution-page";

export default async function GuardiansPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="guardians.view"
      title="Guardians"
      description="Parents and caregivers, and the students they are linked to"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Academic", href: "/academics" },
        { label: "Guardians" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view guardian records."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its guardians.",
        noInstitution:
          "Guardian records belong to an institution. Add one to start linking parents to students.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null || !hasPermission(ctx.principal, "guardians.manage")) {
          return null;
        }
        const students = await listStudents(ctx.institution.id);
        return <CreateGuardianDialog institutionId={ctx.institution.id} students={students} />;
      }}
      render={async ({ institution, principal }) => {
        const canManage = hasPermission(principal, "guardians.manage");
        const [guardians, students] = await Promise.all([
          listGuardians(institution.id),
          canManage ? listStudents(institution.id) : Promise.resolve([]),
        ]);

        if (guardians.length === 0) {
          return (
            <EmptyState
              icon={UsersThreeIcon}
              title="No guardians yet"
              description="A guardian becomes visible once they are linked to a student. Add one to create their account and link them in the same step."
            />
          );
        }

        return (
          <div className="overflow-x-auto rounded-none border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guardian</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead>Linked students</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardians.map((guardian) => (
                  <TableRow key={guardian.userId}>
                    <TableCell>
                      <div className="font-medium">
                        {guardian.firstName} {guardian.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">{guardian.email}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {guardian.phone ?? "—"}
                      {guardian.occupation !== null && (
                        <div className="text-xs">{guardian.occupation}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {guardian.studentCount === 0
                        ? "Not linked"
                        : guardian.studentNames.join(", ")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canManage && (
                          <>
                            <LinkStudentDialog
                              institutionId={institution.id}
                              guardian={guardian}
                              students={students}
                            />
                            <EditGuardianDialog
                              institutionId={institution.id}
                              guardian={guardian}
                            />
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      }}
    />
  );
}
