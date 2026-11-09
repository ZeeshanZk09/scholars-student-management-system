/**
 * Departments and designations (`PHASES.md` Phase 6, task 9). Two related master lists on one
 * page: a department owns subjects and staff alignment, a designation names a staff role and may
 * optionally be scoped to one department (`Designation.departmentId | null`).
 *
 * The page leads with departments (the primary "Add department" action); designations are a
 * secondary block beneath it, matching the fact that a designation *may* outlive any department.
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
import { SquaresFourIcon, UserListIcon } from "@/components/ui/icons";
import { listDepartments, listDesignations } from "@/modules/academic";
import {
  CreateDepartmentDialog,
  CreateDesignationDialog,
} from "@/modules/academic/ui/department-forms";

import { AcademicPage } from "../_lib/academic-page";

export default async function DepartmentsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Departments & Designations"
      description="Academic groupings, and the staff roles that sit within or across them."
      searchParams={searchParams}
      actions={({ institution }) =>
        institution === null ? null : <CreateDepartmentDialog institutionId={institution.id} />
      }
      render={async ({ institution }) => {
        const [departments, designations] = await Promise.all([
          listDepartments(institution.id),
          listDesignations(institution.id),
        ]);

        return (
          <div className="space-y-6">
            <section aria-labelledby="departments-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="departments-heading" className="text-sm font-medium text-muted-foreground">
                  Departments
                </h2>
                {departments.length > 0 && (
                  <CreateDepartmentDialog institutionId={institution.id} />
                )}
              </div>

              {departments.length === 0 ? (
                <EmptyState
                  icon={SquaresFourIcon}
                  title="No departments yet"
                  description="A department groups subjects and staff — Science, Humanities. Subjects and designations can be left unaligned, so this is optional but useful."
                />
              ) : (
                <div className="overflow-x-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="hidden sm:table-cell">Designations</TableHead>
                        <TableHead className="hidden md:table-cell">Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departments.map((department) => (
                        <TableRow key={department.id}>
                          <TableCell className="font-medium">{department.name}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {department.designationCount === 0
                              ? "—"
                              : `${department.designationCount} ${
                                  department.designationCount === 1 ? "role" : "roles"
                                }`}
                          </TableCell>
                          <TableCell className="hidden max-w-[32rem] truncate text-muted-foreground md:table-cell">
                            {department.description ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <section aria-labelledby="designations-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="designations-heading" className="text-sm font-medium text-muted-foreground">
                  Designations
                </h2>
                {designations.length > 0 && (
                  <CreateDesignationDialog
                    institutionId={institution.id}
                    departments={departments}
                  />
                )}
              </div>

              {designations.length === 0 ? (
                <EmptyState
                  icon={UserListIcon}
                  title="No designations yet"
                  description="A designation is a staff role — Teacher, Head of Department — used when staff records arrive in a later phase."
                  action={
                    <CreateDesignationDialog
                      institutionId={institution.id}
                      departments={departments}
                    />
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Designation</TableHead>
                        <TableHead className="hidden sm:table-cell">Department</TableHead>
                        <TableHead className="hidden md:table-cell">Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {designations.map((designation) => (
                        <TableRow key={designation.id}>
                          <TableCell className="font-medium">{designation.name}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {designation.departmentName ?? (
                              <span className="text-muted-foreground">Any department</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-[32rem] truncate text-muted-foreground md:table-cell">
                            {designation.description ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </div>
        );
      }}
    />
  );
}
