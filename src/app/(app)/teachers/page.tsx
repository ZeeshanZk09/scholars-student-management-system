/**
 * Teacher directory (`PHASES.md` §22, `ADR-0002`).
 */
import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChalkboardTeacherIcon } from "@/components/ui/icons";
import { db } from "@/db/client";
import { users, userRoles, roles } from "@/db/schema";
import { listDepartments } from "@/modules/academic";
import { listTeachers } from "@/modules/teacher";
import { CreateTeacherDialog } from "@/modules/teacher/ui/teacher-forms";

import { InstitutionPage } from "../_lib/institution-page";

export default async function TeachersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="academic.manage"
      title="Teachers"
      description="Teaching staff profiles, department mappings, and class responsibilities."
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Teachers" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to manage teachers."
      empty={{
        chooseInstitution:
          "Choose an institution in the selector above to manage its teaching faculty.",
        noInstitution: "No institution is available. Create one to begin adding teachers.",
        noMembership: "You are not a member of any institution yet.",
      }}
      actions={async ({ institution }) => {
        if (!institution) return null;
        const institutionId = institution.id;
        const [departments, teacherRole] = await Promise.all([
          listDepartments(institutionId),
          db.select({ id: roles.id }).from(roles).where(eq(roles.slug, "teacher")).limit(1),
        ]);

        let candidateUsers: { id: string; name: string; email: string }[] = [];
        if (teacherRole[0]) {
          const matchingUsers = await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
            })
            .from(users)
            .innerJoin(userRoles, eq(userRoles.userId, users.id))
            .where(
              and(
                eq(userRoles.institutionId, institutionId),
                eq(userRoles.roleId, teacherRole[0].id),
              ),
            )
            .limit(50);
          candidateUsers = matchingUsers;
        }

        return (
          <CreateTeacherDialog
            institutionId={institutionId}
            departments={departments}
            candidateUsers={candidateUsers}
          />
        );
      }}
      render={async ({ institution }) => {
        const institutionId = institution.id;
        const [teachersResult, departments] = await Promise.all([
          listTeachers({ institutionId, page: 1, pageSize: 50 }),
          listDepartments(institutionId),
        ]);

        const deptMap = new Map(departments.map((d) => [d.id, d.name]));

        if (teachersResult.total === 0) {
          return (
            <EmptyState
              icon={ChalkboardTeacherIcon}
              title="No teachers yet"
              description="Add teaching staff profiles to assign classes, subjects, and timetables."
            />
          );
        }

        return (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-none border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Qualification</TableHead>
                    <TableHead>Max periods/day</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachersResult.rows.map((t) => (
                    <TableRow key={t.userId}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/teachers/${t.userId}?institution=${encodeURIComponent(institutionId)}`}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {t.firstName} {t.lastName ?? ""}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.employeeCode ?? "—"}</TableCell>
                      <TableCell>{(t.departmentId && deptMap.get(t.departmentId)) ?? "—"}</TableCell>
                      <TableCell>{t.qualification ?? "—"}</TableCell>
                      <TableCell>{t.maxPeriodsPerDay ?? "Uncapped"}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/teachers/${t.userId}?institution=${encodeURIComponent(institutionId)}`}
                          className="text-xs text-primary underline underline-offset-4 hover:text-foreground"
                        >
                          View & assign
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      }}
    />
  );
}
