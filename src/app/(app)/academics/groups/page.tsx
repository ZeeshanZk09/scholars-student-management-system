/**
 * Groups (`PHASES.md` Phase 6, task 5). A flat view of every group in the institution, because
 * the same groups are also reachable through their class on `/academics/classes` — here they are
 * scanned by name instead of by structure. Both routes are in `navigation.ts` and point at
 * different views of one dataset, not two models.
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
import { UsersThreeIcon } from "@/components/ui/icons";
import { GRADE_LEVEL_OPTIONS, listClassTreeByGroup } from "@/modules/academic";
import { CreateGroupDialog } from "@/modules/academic/ui/class-forms";

import { AcademicPage } from "../_lib/academic-page";

const GRADE_NAMES = new Map(
  GRADE_LEVEL_OPTIONS.map((option: { value: string; label: string }) => [
    Number(option.value),
    option.label,
  ]),
);

export default async function GroupsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Groups"
      description="Streams, houses and tracks — every group, across all classes."
      searchParams={searchParams}
      actions={async ({ institution }) => {
        if (institution === null) return null;
        const tree = await listClassTreeByGroup(institution.id);
        if (tree.length === 0) return null;
        return (
          <CreateGroupDialog
            institutionId={institution.id}
            classOptions={tree.map((node) => ({ value: node.id, label: node.name }))}
          />
        );
      }}
      render={async ({ institution }) => {
        const tree = await listClassTreeByGroup(institution.id);
        const rows = tree.flatMap((node) =>
          node.groups.map((group) => ({
            id: group.id,
            name: group.name,
            description: group.description,
            sectionCount: group.sections.length,
            className: node.name,
            gradeLabel: GRADE_NAMES.get(node.gradeLevel) ?? `Grade ${node.gradeLevel}`,
            classId: node.id,
          })),
        );

        if (rows.length === 0) {
          return (
            <EmptyState
              icon={UsersThreeIcon}
              title="No groups yet"
              description="Groups divide a class into streams or houses. Add one from a class card, or start with a class itself."
            />
          );
        }

        return (
          <div className="overflow-x-auto rounded-none border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="hidden sm:table-cell">Sections</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.gradeLabel}</Badge>{" "}
                      <span className="text-muted-foreground">{row.className}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {row.sectionCount === 0
                        ? "—"
                        : `${row.sectionCount} ${row.sectionCount === 1 ? "section" : "sections"}`}
                    </TableCell>
                    <TableCell className="hidden max-w-[28rem] truncate text-muted-foreground md:table-cell">
                      {row.description ?? "—"}
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
