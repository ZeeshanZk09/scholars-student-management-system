/**
 * Teacher Portal (`PHASES.md` §22, `ADR-0002`).
 *
 * The personal workspace for a teacher. Surfaces assigned classes, subjects,
 * daily teaching responsibilities, and links into attendance, diary, and evaluation registers.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BooksIcon,
  ChalkboardTeacherIcon,
  ClipboardTextIcon,
  ExamIcon,
  FunnelIcon,
  GraduationCapIcon,
  NotePencilIcon,
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
  listSubjects,
} from "@/modules/academic";
import { getTeacher, listAssignments } from "@/modules/teacher";

import { InstitutionPage } from "../_lib/institution-page";

export default async function TeacherPortalPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="attendance.view"
      title="Teacher Portal"
      description="Your assigned classes, subjects, daily schedule, and student registers."
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Teacher Portal" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to access the teacher portal."
      empty={{
        chooseInstitution: "Select an institution to open your teacher portal.",
        noInstitution: "No institution available.",
        noMembership: "You are not enrolled in any institution.",
      }}
      render={async ({ institution, principal }) => {
        const institutionId = institution.id;
        const userId = principal.userId;

        const teacher = await getTeacher(userId).catch(() => null);

        if (!teacher || teacher.institutionId !== institutionId) {
          return (
            <EmptyState
              icon={ChalkboardTeacherIcon}
              title="No teacher profile linked"
              description="Your account is not registered as a teacher in this institution. Contact an administrator to create your teaching profile."
            />
          );
        }

        const [assignments, subjects, sessions, classTree] = await Promise.all([
          listAssignments({ institutionId, teacherId: userId }),
          listSubjects(institutionId),
          listAcademicSessions(institutionId),
          listClassTreeByGroup(institutionId).catch(() => []),
        ]);

        const currentSession = sessions.find((s) => s.isCurrent) ?? sessions[0];
        const activeAssignments = currentSession
          ? assignments.filter((a) => a.academicSessionId === currentSession.id)
          : assignments;

        const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
        const sectionMap = new Map<string, string>();
        for (const c of classTree) {
          for (const g of c.groups) {
            for (const s of g.sections) {
              sectionMap.set(s.id, `${c.name} • ${g.name} (Section ${s.name})`);
            }
          }
        }

        const classTeacherCount = activeAssignments.filter((a) => a.isClassTeacher).length;

        return (
          <div className="space-y-6">
            <section
              aria-label="Teacher workspace summary"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <StatCard
                label="Assigned sections"
                value={activeAssignments.length}
                hint={`${activeAssignments.length} active classes`}
                icon={ChalkboardTeacherIcon}
              />
              <StatCard
                label="Class in-charge"
                value={classTeacherCount}
                hint="Form master responsibilities"
                icon={GraduationCapIcon}
              />
              <StatCard
                label="Subjects taught"
                value={new Set(activeAssignments.map((a) => a.subjectId).filter(Boolean)).size}
                hint="Distinct curriculum subjects"
                icon={BooksIcon}
              />
              <StatCard
                label="Max periods/day"
                value={teacher.maxPeriodsPerDay ?? "Uncapped"}
                hint="Daily period limit"
                icon={ClipboardTextIcon}
              />
            </section>

            <section aria-label="Registers" className="space-y-3">
              <h2 className="text-sm font-semibold">Teacher Registers & Operations</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <PortalCard
                  href={`/attendance?institution=${encodeURIComponent(institutionId)}`}
                  title="Daily Attendance"
                  description="Mark student attendance for your assigned sections"
                  icon={ClipboardTextIcon}
                />
                <PortalCard
                  href={`/diary?institution=${encodeURIComponent(institutionId)}`}
                  title="Daily Diary"
                  description="Record lesson notes, homework, and parent updates"
                  icon={NotePencilIcon}
                />
                <PortalCard
                  href={`/daily-tests?institution=${encodeURIComponent(institutionId)}`}
                  title="Daily Tests"
                  description="Create and record marks for periodic classroom tests"
                  icon={FunnelIcon}
                />
                <PortalCard
                  href={`/examinations?institution=${encodeURIComponent(institutionId)}`}
                  title="Examinations"
                  description="Enter term exam marks and grading evaluations"
                  icon={ExamIcon}
                />
              </div>
            </section>

            <section aria-label="My assigned classes" className="space-y-3">
              <h2 className="text-sm font-semibold">My Assigned Classes & Sections</h2>
              {activeAssignments.length === 0 ? (
                <EmptyState
                  icon={ChalkboardTeacherIcon}
                  title="No assigned classes yet"
                  description="You have not been assigned to any classes for the active academic session."
                />
              ) : (
                <div className="overflow-x-auto rounded-none border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class & Section</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Responsibility</TableHead>
                        <TableHead>Assigned From</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeAssignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {a.sectionId ? (sectionMap.get(a.sectionId) ?? `Section ${a.sectionId}`) : "Class"}
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

function PortalCard({
  href,
  title,
  description,
  icon: Icon,
}: Readonly<{
  href: string;
  title: string;
  description: string;
  icon: typeof BooksIcon;
}>) {
  return (
    <Card className="rounded-none shadow-none">
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          <Link
            href={href}
            className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {title}
          </Link>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
