/**
 * Subjects (`PHASES.md` Phase 6, task 8). The subject master is a flat catalogue — the
 * department column is a grouping hint (`DepartmentId | null`), not a hierarchy, so the page
 * presents a table rather than a tree.
 */
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BooksIcon } from "@/components/ui/icons";
import { listDepartments, listSubjects } from "@/modules/academic";
import { CreateSubjectDialog } from "@/modules/academic/ui/subject-forms";

import { AcademicPage } from "../_lib/academic-page";

const KIND_LABEL: Record<string, string> = {
  theory: "Theory",
  practical: "Practical",
  both: "Theory + practical",
};

export default async function SubjectsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Subjects"
      description="The catalogue of teachable subjects — coded, classified, optionally department-aligned."
      searchParams={searchParams}
      actions={async ({ institution }) => {
        if (institution === null) return null;
        const departments = await listDepartments(institution.id);
        return <CreateSubjectDialog institutionId={institution.id} departments={departments} />;
      }}
      render={async ({ institution }) => {
        const subjects = await listSubjects(institution.id);

        if (subjects.length === 0) {
          return (
            <EmptyState
              icon={BooksIcon}
              title="No subjects yet"
              description="Add the subjects this institution teaches — Mathematics, Physics, History — before timetabling them."
            />
          );
        }

        return (
          <div className="overflow-x-auto rounded-none border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="font-medium">{subject.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {subject.code}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{KIND_LABEL[subject.kind] ?? subject.kind}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {subject.departmentName ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-[24rem] truncate text-muted-foreground lg:table-cell">
                      {subject.description ?? "—"}
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
