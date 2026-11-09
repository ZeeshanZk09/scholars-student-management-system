/**
 * Classes, groups and sections (`PHASES.md` Phase 6, tasks 4–6 — classes, groups and sections,
 * plus task 12 "prevent invalid relationships", which the form surfaces as its parent selectors).
 *
 * Rendered as a three-level tree rather than a flat table: a section means nothing without its
 * group and class, and a table that repeats the class name on every row hides that relationship.
 * Each level owns its own "Add" control, so creating a section never offers classes it could not
 * belong to — the relationship is enforced by *what the form can say*, before the service enforces
 * it again (`SECURITY.md`: validate at the boundary, keep the invariant in the domain).
 *
 * The tree is scoped to the **current** session (`listClassTreeByGroup`), so the page refuses to
 * invent content when no session is current instead of silently showing an empty year.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ChalkboardTeacherIcon } from "@/components/ui/icons";
import {
  GRADE_LEVEL_OPTIONS,
  listAcademicSessions,
  listBuildingsWithFloors,
  listCampuses,
  listClassTreeByGroup,
  listDepartments,
} from "@/modules/academic";
import {
  CreateClassDialog,
  CreateGroupDialog,
  CreateSectionDialog,
} from "@/modules/academic/ui/class-forms";

import { AcademicPage } from "../_lib/academic-page";

/** Ordinal → display name, falling back to the raw grade for anything unregistered. */
const GRADE_NAMES = new Map(
  GRADE_LEVEL_OPTIONS.map((option) => [Number(option.value), option.label]),
);

export default async function ClassesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Classes & Sections"
      description="Classes, the groups within them, and the sections attendance is taken against."
      searchParams={searchParams}
      actions={async ({ institution }) => {
        if (institution === null) return null;
        const [sessions, departments] = await Promise.all([
          listAcademicSessions(institution.id),
          listDepartments(institution.id),
        ]);
        const hasCurrent = sessions.some(
          (session) => session.isCurrent && session.closedAt === null,
        );
        if (!hasCurrent) return null;
        return (
          <CreateClassDialog
            institutionId={institution.id}
            sessions={sessions}
            departments={departments}
          />
        );
      }}
      render={async ({ institution }) => {
        const [sessions, tree, campuses, buildings] = await Promise.all([
          listAcademicSessions(institution.id),
          listClassTreeByGroup(institution.id),
          listCampuses(institution.id),
          listBuildingsWithFloors(institution.id),
        ]);

        const hasCurrent = sessions.some(
          (session) => session.isCurrent && session.closedAt === null,
        );
        if (!hasCurrent) {
          return (
            <EmptyState
              icon={ChalkboardTeacherIcon}
              title="No current session"
              description="Classes belong to an academic session, and this page lists the current one. Mark a session as current first."
              action={
                <Button type="button" size="sm" render={<Link href="/academics/sessions" />}>
                  Go to sessions
                </Button>
              }
            />
          );
        }

        if (tree.length === 0) {
          return (
            <EmptyState
              icon={ChalkboardTeacherIcon}
              title="No classes yet"
              description="Add a class to start building the structure — its groups are created with it, and sections under each group."
            />
          );
        }

        const classOptions = tree.map((node) => ({ value: node.id, label: node.name }));
        const campusOptions = campuses.map((campus) => ({ value: campus.id, label: campus.name }));
        const floorOptions = buildings.flatMap((building) =>
          building.floors.map((floor) => ({
            value: floor.id,
            label:
              building.campusName === null
                ? `${building.name} · ${floor.name}`
                : `${building.campusName} · ${building.name} · ${floor.name}`,
          })),
        );

        return (
          <div className="space-y-4">
            {tree.map((node) => (
              <Card key={node.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {node.name}
                    <Badge variant="secondary">
                      {GRADE_NAMES.get(node.gradeLevel) ?? `Grade ${node.gradeLevel}`}
                    </Badge>
                    {node.departmentName !== null && (
                      <Badge variant="outline">{node.departmentName}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {node.groups.length === 0
                      ? "No groups yet"
                      : `${node.groups.length} ${node.groups.length === 1 ? "group" : "groups"}`}
                  </CardDescription>
                  <CardAction>
                    <CreateGroupDialog
                      institutionId={institution.id}
                      classOptions={classOptions}
                      defaultClassId={node.id}
                    />
                  </CardAction>
                </CardHeader>

                <CardContent className="grid gap-3">
                  {node.description !== null && (
                    <p className="text-xs text-muted-foreground">{node.description}</p>
                  )}

                  {node.groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No groups yet — add one to divide the class into streams or houses.
                    </p>
                  ) : (
                    node.groups.map((group) => (
                      <div key={group.id} className="rounded-none border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{group.name}</p>
                            {group.description !== null && (
                              <p className="text-xs text-muted-foreground">{group.description}</p>
                            )}
                          </div>
                          <CreateSectionDialog
                            institutionId={institution.id}
                            groupOptions={[
                              { value: group.id, label: `${node.name} · ${group.name}` },
                            ]}
                            defaultGroupId={group.id}
                            campusOptions={campusOptions}
                            floorOptions={floorOptions}
                          />
                        </div>

                        {group.sections.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">No sections yet.</p>
                        ) : (
                          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                            {group.sections.map((section) => (
                              <li
                                key={section.id}
                                className="flex items-center justify-between gap-2 border-b py-1.5 text-xs"
                              >
                                <span className="min-w-0 truncate">{section.name}</span>
                                <span className="shrink-0 text-muted-foreground">
                                  {section.capacity !== null ? `≤ ${section.capacity}` : "—"}
                                  {section.floorName !== null && ` · ${section.floorName}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        );
      }}
    />
  );
}
