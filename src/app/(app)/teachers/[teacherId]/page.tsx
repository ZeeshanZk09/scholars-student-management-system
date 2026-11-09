/**
 * Teacher profile and teaching assignments (`PHASES.md` §22, `ADR-0002`).
 */
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BooksIcon,
  ChalkboardTeacherIcon,
  ClipboardTextIcon,
  GraduationCapIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAcademicSessions,
  listClassTreeByGroup,
  listDepartments,
  listSubjects,
} from "@/modules/academic";
import {
  getTeacher,
  listAssignments,
  listCompetences,
} from "@/modules/teacher";
import {
  AddTeacherCompetenceDialog,
  AssignTeacherDialog,
} from "@/modules/teacher/ui/teacher-forms";
import { removeAssignmentFormAction } from "@/modules/teacher/ui/actions";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function TeacherDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { teacherId } = await params;

  return (
    <InstitutionPage
      permission="academic.manage"
      title="Teacher Details"
      description="Teacher profile, academic competence, and active teaching assignments."
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Teachers", href: "/teachers" },
        { label: "Profile" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view teacher assignments."
      empty={{
        chooseInstitution: "Choose an institution to view this teacher.",
        noInstitution: "No institution is available.",
        noMembership: "You are not a member of this institution.",
      }}
      actions={async ({ institution }) => {
        try {
          if (!institution) return null;
          const institutionId = institution.id;
          const [subjects, sessions, classTree] = await Promise.all([
            listSubjects(institutionId),
            listAcademicSessions(institutionId),
            listClassTreeByGroup(institutionId).catch(() => []),
          ]);

          const currentSession = sessions.find((s) => s.isCurrent) ?? sessions[0];
          if (!currentSession) return null;

          const sectionOptions = classTree.flatMap((c) =>
            c.groups.flatMap((g) =>
              g.sections.map((s) => ({
                id: s.id,
                label: `${c.name} • ${g.name} • Section ${s.name}`,
              })),
            ),
          );

          return (
            <div className="flex items-center gap-2">
              <AddTeacherCompetenceDialog
                institutionId={institutionId}
                teacherUserId={teacherId}
                subjects={subjects}
              />
              {sectionOptions.length > 0 && (
                <AssignTeacherDialog
                  institutionId={institutionId}
                  teacherId={teacherId}
                  academicSessionId={currentSession.id}
                  sections={sectionOptions}
                  subjects={subjects}
                />
              )}
            </div>
          );
        } catch (err) {
          console.error("TEACHER_DETAIL_ACTIONS_ERROR:", err);
          throw err;
        }
      }}
      render={async ({ institution }) => {
        try {
          const institutionId = institution.id;
          const teacher = await getTeacher(teacherId).catch(() => null);

          if (!teacher || teacher.institutionId !== institutionId) {
            notFound();
          }

          const [assignments, competences, subjects, departments, classTree] = await Promise.all([
            listAssignments({ institutionId, teacherId }),
            listCompetences(teacherId),
            listSubjects(institutionId),
            listDepartments(institutionId),
            listClassTreeByGroup(institutionId).catch(() => []),
          ]);

          const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
          const deptMap = new Map(departments.map((d) => [d.id, d.name]));

          const sectionLabelMap = new Map<string, string>();
          for (const c of classTree) {
            for (const g of c.groups) {
              for (const s of g.sections) {
                sectionLabelMap.set(s.id, `${c.name} (${s.name})`);
              }
            }
          }

          const classTeacherCount = assignments.filter((a) => a.isClassTeacher).length;

          return (
          <div className="space-y-6">
            <section
              aria-label="Teacher summary"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <StatCard
                label="Total assignments"
                value={assignments.length}
                hint="Active class responsibilities"
                icon={ChalkboardTeacherIcon}
              />
              <StatCard
                label="Class in-charge"
                value={classTeacherCount}
                hint="Form master roles"
                icon={GraduationCapIcon}
              />
              <StatCard
                label="Competent subjects"
                value={competences.length}
                hint="Verified teaching subjects"
                icon={BooksIcon}
              />
              <StatCard
                label="Max periods/day"
                value={teacher.maxPeriodsPerDay ?? "Uncapped"}
                hint="Daily period ceiling"
                icon={ClipboardTextIcon}
              />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="rounded-none shadow-none lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base">
                    {teacher.firstName} {teacher.lastName ?? ""}
                  </CardTitle>
                  <CardDescription>
                    {teacher.employeeCode ? `Code: ${teacher.employeeCode}` : "Faculty Profile"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">Department: </span>
                    <span>
                      {(teacher.departmentId && deptMap.get(teacher.departmentId)) ?? "General Faculty"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Email: </span>
                    <span>{teacher.email ?? "—"}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Phone: </span>
                    <span>{teacher.phone ?? "—"}</span>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Qualification: </span>
                    <span>{teacher.qualification ?? "—"}</span>
                  </div>
                  {teacher.bio && (
                    <div className="pt-2 border-t">
                      <span className="font-medium text-muted-foreground">Bio: </span>
                      <p className="mt-1 text-xs text-muted-foreground">{teacher.bio}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-none shadow-none lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Subject Competences</CardTitle>
                  <CardDescription>
                    Subjects this teacher is verified and authorized to teach.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {competences.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No subject competences recorded yet. Use the &quot;Add subject competence&quot; button above.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {competences.map((c) => (
                        <li key={c.subjectId} className="flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs">
                          <span className="font-medium">{subjectMap.get(c.subjectId) ?? "Subject"}</span>
                          {c.isVerified && <Badge variant="secondary">Verified</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <section aria-label="Teaching assignments" className="space-y-3">
              <h2 className="text-sm font-semibold">Class & Subject Assignments</h2>
              {assignments.length === 0 ? (
                <EmptyState
                  icon={ChalkboardTeacherIcon}
                  title="No teaching assignments yet"
                  description="Assign this teacher to sections and subjects for the active academic session."
                />
              ) : (
                <div className="overflow-x-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scope / Section</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Assigned From</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {a.sectionId ? (sectionLabelMap.get(a.sectionId) ?? `Section ${a.sectionId}`) : "Class Scope"}
                          </TableCell>
                          <TableCell>
                            {a.subjectId ? (subjectMap.get(a.subjectId) ?? "Subject") : "All Subjects"}
                          </TableCell>
                          <TableCell>
                            {a.isClassTeacher ? (
                              <Badge variant="default">Class Teacher</Badge>
                            ) : (
                              <Badge variant="outline">Subject Teacher</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(a.assignedFrom).toISOString().slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-right">
                            <form action={removeAssignmentFormAction}>
                              <input type="hidden" name="institutionId" value={institutionId} />
                              <input type="hidden" name="teacherId" value={teacherId} />
                              <input type="hidden" name="assignmentId" value={a.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              >
                                <TrashIcon className="size-3.5 mr-1" />
                                Remove
                              </Button>
                            </form>
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
      } catch (err) {
        console.error("TEACHER_DETAIL_RENDER_ERROR:", err);
        throw err;
      }
    }}
    />
  );
}
