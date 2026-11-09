/**
 * One employee: their employment record, the trail of its status changes, and the salary they
 * currently hold.
 *
 * The page reads in one call (`getEmployee` returns the profile, the ordered history and the
 * current assignment together — `ports.ts` states why: a detail page that issues a query per
 * section is an N+1). The history is append-only, so the newest event is *last* and the timeline
 * reads top to bottom as it happened; the departure note, when there is one, is shown rather than
 * summarised, because it is the record of why somebody left (`RULES.md` §51).
 *
 * Every command the row offers is gated on its own key and re-guarded on the row's `version`, so a
 * dialog opened on a stale page fails with a conflict rather than deciding twice (`DESIGN.md` §17).
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  CalendarBlankIcon,
  ListNumbersIcon,
  MoneyIcon,
  ShieldCheckIcon,
  UserListIcon,
} from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getEmployee,
  listDepartmentOptions,
  listDesignationOptions,
  listSalaryStructures,
} from "@/modules/hr";
import type { EmployeeStatus } from "@/modules/hr/domain/employee-rules";
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_TYPE_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/modules/hr";
import { hasPermission } from "@/shared/authorization";

import {
  AssignSalaryDialog,
  EditEmployeeDialog,
  EmployeeStatusActions,
  EndSalaryAssignmentForm,
} from "@/modules/hr/ui/employee-forms";

import { InstitutionPage } from "../../../_lib/institution-page";

const STATUS_TONES: Readonly<Record<EmployeeStatus, StatusTone>> = {
  active: "success",
  on_leave: "warning",
  resigned: "neutral",
  terminated: "danger",
  retired: "neutral",
};

function readParams(params: Record<string, string | string[] | undefined>): string | null {
  const employeeId = Array.isArray(params.employeeId) ? params.employeeId[0] : params.employeeId;
  return employeeId ?? null;
}

export default async function HrEmployeeDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const resolved = await params;
  const employeeId = readParams(resolved);

  return (
    <InstitutionPage
      permission="employees.view"
      title="Employee"
      description="Employment record, status history and the salary currently in force"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "People", href: "/hr/employees" },
        { label: "Employee" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view this employee."
      empty={{
        chooseInstitution: "Choose an institution to see its staff.",
        noInstitution: "An employee belongs to an institution.",
        noMembership: "You are not a member of any institution yet.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null || employeeId === null) return null;
        const employee = await getEmployee({
          institutionId: ctx.institution.id,
          employeeId,
        });
        if (!hasPermission(ctx.principal, "employees.update")) return null;
        const [departments, designations] = await Promise.all([
          listDepartmentOptions({ institutionId: ctx.institution.id }),
          listDesignationOptions({ institutionId: ctx.institution.id }),
        ]);
        return (
          <EditEmployeeDialog
            institutionId={ctx.institution.id}
            employee={employee}
            departments={departments}
            designations={designations}
          />
        );
      }}
      render={async ({ institution, principal }) => {
        if (employeeId === null) return null;
        const employee = await getEmployee({ institutionId: institution.id, employeeId });
        const canManage = hasPermission(principal, "employees.manage");

        const [departments, designations, structures] = await Promise.all([
          listDepartmentOptions({ institutionId: institution.id }),
          listDesignationOptions({ institutionId: institution.id }),
          listSalaryStructures({ institutionId: institution.id }),
        ]);
        const current = employee.currentSalary[0];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{employee.fullName}</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {employee.employeeCode}
              </span>
              <StatusBadge tone={STATUS_TONES[employee.status]}>
                {EMPLOYEE_STATUS_LABELS[employee.status]}
              </StatusBadge>
              <Badge variant="outline">{EMPLOYEE_TYPE_LABELS[employee.employeeType]}</Badge>
              <div className="flex flex-wrap items-center gap-2">
                <EmployeeStatusActions
                  institutionId={institution.id}
                  employee={employee}
                  canManage={canManage}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Joined"
                value={employee.joiningDate}
                icon={CalendarBlankIcon}
                hint={
                  employee.leavingDate === null
                    ? `Engagement: ${EMPLOYMENT_TYPE_LABELS[employee.employmentType]}`
                    : `Left on ${employee.leavingDate}`
                }
              />
              <StatCard
                label="Department"
                value={employee.departmentName ?? "—"}
                icon={BuildingIconFor(employee.designationName)}
                hint={employee.designationName ?? "No designation recorded"}
              />
              <StatCard
                label="Access"
                value={employee.roleSlug ?? "No role granted"}
                icon={ShieldCheckIcon}
                hint={employee.email}
              />
              <StatCard
                label="Current salary"
                value={
                  current === undefined
                    ? "—"
                    : `${current.currency ?? "PKR"} ${current.amount ?? "per structure"}`
                }
                icon={MoneyIcon}
                hint={
                  current === undefined
                    ? "No assignment in force"
                    : current.overridesStructure
                      ? "Overrides the structure's figures"
                      : (current.salaryStructureName ?? "Negotiated amount")
                }
              />
            </div>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Employment information</h3>
                <Link
                  href={`/hr/employees?institution=${encodeURIComponent(institution.id)}`}
                  className="text-xs underline underline-offset-4"
                >
                  Back to the directory
                </Link>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Employee type</TableCell>
                    <TableCell>{EMPLOYEE_TYPE_LABELS[employee.employeeType]}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Engagement</TableCell>
                    <TableCell>{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Designation</TableCell>
                    <TableCell>{employee.designationName ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Bank account</TableCell>
                    <TableCell>{employee.bankAccountIban ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Emergency contact</TableCell>
                    <TableCell>
                      {[employee.emergencyContactName, employee.emergencyContactPhone]
                        .filter((value) => value !== null && value !== "")
                        .join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Notes</TableCell>
                    <TableCell>{employee.notes ?? "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Departments and designations are master data — choose from the same{" "}
                {departments.length} department{departments.length === 1 ? "" : "s"} and{" "}
                {designations.length} designation
                {designations.length === 1 ? "" : "s"} the directory uses.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Employment history</h3>
              {employee.statusHistory.length === 0 ? (
                <EmptyState
                  icon={UserListIcon}
                  title="No status changes yet"
                  description="Every employment status change is recorded here, with who made it."
                />
              ) : (
                <ol className="space-y-2">
                  {employee.statusHistory.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-baseline gap-2 border-l-2 border-border pl-3 text-sm"
                    >
                      <span className="font-medium">
                        {event.fromStatus === null
                          ? "Appointed"
                          : `${EMPLOYEE_STATUS_LABELS[event.fromStatus]} → ${EMPLOYEE_STATUS_LABELS[event.toStatus]}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {event.changedAt.toISOString().slice(0, 10)}
                      </span>
                      {event.changedByUserName === null ? null : (
                        <span className="text-xs text-muted-foreground">
                          by {event.changedByUserName}
                        </span>
                      )}
                      {event.notes === null ? null : (
                        <span className="text-xs text-muted-foreground">— {event.notes}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Salary</h3>
                {canManage && current === undefined ? (
                  <AssignSalaryDialog
                    institutionId={institution.id}
                    employeeId={employee.id}
                    structures={structures}
                  />
                ) : null}
              </div>
              {current === undefined ? (
                <EmptyState
                  icon={MoneyIcon}
                  title="No salary assigned"
                  description="Assign a structure, or a negotiated amount, and it takes effect from a date you choose."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Structure</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{current.salaryStructureName ?? "Negotiated amount"}</TableCell>
                      <TableCell className="font-mono">
                        {current.currency ?? "PKR"} {current.amount ?? "structure's own"}
                      </TableCell>
                      <TableCell>{current.effectiveFrom}</TableCell>
                      <TableCell className="space-x-2">
                        {current.overridesStructure ? (
                          <Badge variant="outline">Override</Badge>
                        ) : null}
                        {canManage ? (
                          <EndSalaryAssignmentForm
                            institutionId={institution.id}
                            employeeId={employee.id}
                            assignmentId={current.id}
                            effectiveFrom={current.effectiveFrom}
                            updatedAt={current.updatedAt}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        );
      }}
    />
  );
}

/** The stat card wants an icon; the department's own glyph when there is a designation. */
function BuildingIconFor(designation: string | null) {
  return designation === null ? ListNumbersIcon : UserListIcon;
}
