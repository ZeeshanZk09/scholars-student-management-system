/**
 * The staff directory — every employee of the institution, in staff-number order.
 *
 * Status lives in the URL (`?status=`), exactly like the expense register: the chips are plain
 * links, so a filtered view is shareable and survives reload with no client state, and a status
 * key the domain does not know reads as "no filter" (`SECURITY.md` §22).
 *
 * The employment state machine is on the page rather than behind a detail route, because the two
 * one-click controls (`Record leave`, `Return to work`) are the commands HR uses most and they
 * name nothing a dialog could add. A departure needs a date and a reason, so it opens a dialog —
 * both are offered per *status*, and both re-check their key server-side while the service
 * re-checks the edge and the row's `version` (`DESIGN.md` §17).
 *
 * Hiring happens in the header and needs the institution's own departments and designations, so
 * the header awaits them: a dialog whose option list is the institution's data cannot render
 * before the data does (`institution-page.tsx` documents the same contract for its `actions`).
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { UserListIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  listDepartmentOptions,
  listDesignationOptions,
  listEmployees,
} from "@/modules/hr";
import type { EmployeeStatus } from "@/modules/hr/domain/employee-rules";
import { hasPermission } from "@/shared/authorization";

import {
  CreateEmployeeDialog,
  EditEmployeeDialog,
  EmployeeStatusActions,
} from "@/modules/hr/ui/employee-forms";

import { InstitutionPage } from "../../_lib/institution-page";

/** The status tone each employment status reads as, so a departed staff member is unmistakable. */
const STATUS_TONES: Readonly<Record<EmployeeStatus, StatusTone>> = {
  active: "success",
  on_leave: "warning",
  resigned: "neutral",
  terminated: "danger",
  retired: "neutral",
};

/** A status chip the domain does not know reads as "no filter", never as a 400. */
function readStatus(value: string | string[] | undefined): EmployeeStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const found = EMPLOYEE_STATUSES.find((status) => status === raw);
  return found ?? null;
}

function employeesHref(institutionId: string, status: EmployeeStatus | null): string {
  const base = `/hr/employees?institution=${encodeURIComponent(institutionId)}`;
  return status === null ? base : `${base}&status=${status}`;
}

function chipClass(active: boolean): string {
  const base =
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return active
    ? `${base} border-transparent bg-primary text-primary-foreground`
    : `${base} border-border text-muted-foreground hover:bg-muted`;
}

export default async function HrEmployeesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="employees.view"
      title="Employees"
      description="Staff records, employment terms and who may sign in to do what"
      breadcrumb={[{ label: "Home", href: "/" }, { label: "People" }, { label: "Employees" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view the staff directory."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its staff.",
        noInstitution: "An employee belongs to an institution. Add one before hiring anyone.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      actions={async (ctx) => {
        if (ctx.institution === null) return null;
        if (!hasPermission(ctx.principal, "employees.create")) return null;
        // Both option lists are the institution's own master data; a dialog cannot name a
        // department that does not exist, so it reads them before it renders.
        const institutionId = ctx.institution.id;
        const [departments, designations] = await Promise.all([
          listDepartmentOptions({ institutionId }),
          listDesignationOptions({ institutionId }),
        ]);
        return (
          <CreateEmployeeDialog
            institutionId={institutionId}
            departments={departments}
            designations={designations}
          />
        );
      }}
      render={async ({ institution, principal }) => {
        const params = await searchParams;
        const status = readStatus(params.status);
        const institutionId = institution.id;

        const [rows, departments, designations] = await Promise.all([
          listEmployees({ institutionId }),
          listDepartmentOptions({ institutionId }),
          listDesignationOptions({ institutionId }),
        ]);
        const visible = status === null ? rows : rows.filter((row) => row.status === status);

        const canUpdate = hasPermission(principal, "employees.update");
        const canManage = hasPermission(principal, "employees.manage");
        const counts = new Map<EmployeeStatus, number>(
          EMPLOYEE_STATUSES.map((key) => [key, rows.filter((row) => row.status === key).length]),
        );

        return (
          <div className="space-y-4">
            <nav aria-label="Filter by employment status" className="flex flex-wrap gap-1.5">
              <Link
                href={employeesHref(institutionId, null)}
                aria-current={status === null ? "true" : undefined}
                className={chipClass(status === null)}
              >
                All ({rows.length})
              </Link>
              {EMPLOYEE_STATUSES.map((key) => (
                <Link
                  key={key}
                  href={employeesHref(institutionId, key)}
                  aria-current={status === key ? "true" : undefined}
                  className={chipClass(status === key)}
                >
                  {EMPLOYEE_STATUS_LABELS[key]} ({counts.get(key) ?? 0})
                </Link>
              ))}
            </nav>

            {visible.length === 0 ? (
              <EmptyState
                icon={UserListIcon}
                title={
                  status === null ? "No staff yet" : `No ${EMPLOYEE_STATUS_LABELS[status]} staff`
                }
                description={
                  status === null
                    ? "Hiring an employee creates their employment record and the account they sign in with."
                    : "Pick another status, or record a change on an employee's page."
                }
              />
            ) : (
              <Table>
                <TableCaption>
                  {visible.length} employee{visible.length === 1 ? "" : "s"} in staff-number order.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Employment status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={`/hr/employees/${row.id}?institution=${encodeURIComponent(institutionId)}`}
                          className="underline underline-offset-4"
                        >
                          {row.employeeCode}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{row.fullName}</span>
                        <span className="block text-xs text-muted-foreground">{row.email}</span>
                      </TableCell>
                      <TableCell>{row.designationName ?? "—"}</TableCell>
                      <TableCell>{row.departmentName ?? "—"}</TableCell>
                      <TableCell>{row.joiningDate}</TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONES[row.status]}>
                          {EMPLOYEE_STATUS_LABELS[row.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {canUpdate ? (
                            <EditEmployeeDialog
                              institutionId={institutionId}
                              employee={row}
                              departments={departments}
                              designations={designations}
                            />
                          ) : null}
                          <EmployeeStatusActions
                            institutionId={institutionId}
                            employee={row}
                            canManage={canManage}
                          />
                        </div>
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
