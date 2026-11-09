/**
 * The salary register — what each role of employee is supposed to earn, from when.
 *
 * `ARCHITECTURE.md` §20 separates configuration from calculation, so this page holds *dated*
 * structures and never a figure that has already paid somebody: a raise is a new row with a later
 * `effectiveFrom`, and the one it replaces stays exactly where payroll last read it. That is why
 * there is no archive control here — a structure is closed by setting its `effectiveTo`, which the
 * edit dialog does.
 *
 * Editing a structure does not disturb the employees currently holding it: an assignment records
 * *which* structure it used, so a payslip resolves to the row that was in force when it was
 * computed.
 */
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { MoneyIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listDepartmentOptions, listDesignationOptions, listSalaryStructures } from "@/modules/hr";
import { EMPLOYEE_TYPE_LABELS, SALARY_STRUCTURE_LABELS } from "@/modules/hr";
import { hasPermission } from "@/shared/authorization";

import {
  CreateSalaryStructureDialog,
  EditSalaryStructureDialog,
} from "@/modules/hr/ui/employee-forms";

import { InstitutionPage } from "../../_lib/institution-page";

/** The effective range as one phrase, so "closed" and "in force" read apart at a glance. */
function effectiveRange(effectiveFrom: string, effectiveTo: string | null): string {
  return effectiveTo === null ? `from ${effectiveFrom}` : `${effectiveFrom} → ${effectiveTo}`;
}

export default async function HrSalaryStructuresPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="employees.view"
      title="Salary structures"
      description="What a role of employee is supposed to earn, and from when"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "People", href: "/hr/employees" },
        { label: "Salary" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view salary structures."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its salary structures.",
        noInstitution: "A salary structure belongs to an institution. Add one first.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null) return null;
        if (!hasPermission(ctx.principal, "employees.manage")) return null;
        // A structure may point at a designation or a department, so the dialog reads both option
        // lists from the institution's own master data rather than inventing free text.
        const institutionId = ctx.institution.id;
        const [departments, designations] = await Promise.all([
          listDepartmentOptions({ institutionId }),
          listDesignationOptions({ institutionId }),
        ]);
        return (
          <CreateSalaryStructureDialog
            institutionId={institutionId}
            departments={departments}
            designations={designations}
          />
        );
      }}
      render={async ({ institution, principal }) => {
        const institutionId = institution.id;
        const [structures, departments, designations] = await Promise.all([
          listSalaryStructures({ institutionId }),
          listDepartmentOptions({ institutionId }),
          listDesignationOptions({ institutionId }),
        ]);
        const canManage = hasPermission(principal, "employees.manage");
        const inForce = structures.filter((structure) => structure.effectiveTo === null).length;

        return (
          <div className="space-y-4">
            {structures.length === 0 ? (
              <EmptyState
                icon={MoneyIcon}
                title="No salary structures yet"
                description="A structure states what a role earns from a date, so a payslip can be reproduced after the fact."
              />
            ) : (
              <Table>
                <TableCaption>
                  {structures.length} structure{structures.length === 1 ? "" : "s"}, {inForce} in
                  force.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Structure</TableHead>
                    <TableHead>Applies to</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead>Edit</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {structures.map((structure) => (
                    <TableRow key={structure.id}>
                      <TableCell className="font-medium">{structure.name}</TableCell>
                      <TableCell>{SALARY_STRUCTURE_LABELS[structure.structure]}</TableCell>
                      <TableCell>
                        {structure.designationName ??
                          structure.departmentName ??
                          (structure.employeeType === null
                            ? "Any designation"
                            : EMPLOYEE_TYPE_LABELS[structure.employeeType])}
                      </TableCell>
                      <TableCell className="font-mono">
                        {structure.currency} {structure.amount}
                        {structure.unitRate === null ? "" : ` + ${structure.unitRate}/period`}
                      </TableCell>
                      <TableCell>
                        {effectiveRange(structure.effectiveFrom, structure.effectiveTo)}
                      </TableCell>
                      <TableCell>
                        {structure.effectiveTo === null ? (
                          <Badge variant="outline">In force</Badge>
                        ) : (
                          <Badge variant="secondary">Closed</Badge>
                        )}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <EditSalaryStructureDialog
                            institutionId={institutionId}
                            structure={structure}
                            departments={departments}
                            designations={designations}
                          />
                        </TableCell>
                      ) : null}
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
