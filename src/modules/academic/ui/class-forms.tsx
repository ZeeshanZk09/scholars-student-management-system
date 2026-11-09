"use client";

/**
 * Class, group and section creation (Phase 6 tasks 4–6).
 *
 * The three sit on one page as a nesting tree, so each form names its parent explicitly: a class
 * names its session, a group names its class, a section names its group. Option lists are built
 * by the **page** from data it already loaded for the tree — these are plain props, not helpers
 * exported from this file, because a `"use client"` module can only hand components across the
 * server boundary, not functions the server would call.
 *
 * `groupNames` is a comma-separated string split by the action (`createClassSchema` wants an
 * array), because a class and its first groups are one atomic insert (`DOMAIN-MODEL.md` BR-1).
 */
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { TextField, TextareaField } from "@/components/shared/text-field";

import type { DepartmentRow, SessionRow } from "@/modules/academic";

/**
 * Not from the module barrel: this file is `"use client"`, and the barrel re-exports the store —
 * `drizzle` → `pg` → `dotenv`, none of which exist in a browser. A **type** import is erased, but
 * `GRADE_LEVEL_OPTIONS` is a value, so it has to come from the zod-only boundary schema it is
 * defined in. Getting this backwards does not fail typecheck; it fails at the first visit to
 * `/academics/classes` with `Can't resolve 'child_process'`.
 */
import { GRADE_LEVEL_OPTIONS } from "@/modules/academic/application/schemas";

import { createClassAction, createGroupAction, createSectionAction } from "./actions";
import { EntityDialog } from "@/components/shared/entity-dialog";

/** Open sessions, current first — `createClass` refuses a closed one. */
function openSessions(sessions: readonly SessionRow[]): readonly SessionRow[] {
  const open = sessions.filter((session) => session.closedAt === null);
  return [...open].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

export function CreateClassDialog({
  institutionId,
  sessions,
  departments,
}: Readonly<{
  institutionId: string;
  sessions: readonly SessionRow[];
  departments: readonly DepartmentRow[];
}>) {
  const current = sessions.find((session) => session.isCurrent && session.closedAt === null);

  return (
    <EntityDialog
      triggerLabel="Add class"
      title="Add class"
      description="A grade-level cohort within a session. Its groups are created with it."
      action={createClassAction}
      submitLabel="Create class"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <SelectField
        id="class-session"
        name="academicSessionId"
        label="Session"
        options={openSessions(sessions).map((session) => ({
          value: session.id,
          label: session.isCurrent ? `${session.name} (current)` : session.name,
        }))}
        defaultValue={current?.id}
        placeholder="Select a session"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="class-name" name="name" label="Class name" placeholder="Year 9" required />
        <SelectField
          id="class-grade-level"
          name="gradeLevel"
          label="Grade level"
          options={GRADE_LEVEL_OPTIONS}
          placeholder="Select a grade"
          required
        />
      </div>
      <SelectField
        id="class-department"
        name="departmentId"
        label="Department"
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
        placeholder="None"
        hint="Leave unset for a general class."
      />
      <TextField
        id="class-groups"
        name="groupNames"
        label="Initial groups"
        placeholder="A, B"
        hint="Comma-separated. Leave blank to add groups afterwards."
      />
      <TextareaField id="class-description" name="description" label="Description" rows={3} />
    </EntityDialog>
  );
}

export function CreateGroupDialog({
  institutionId,
  classOptions,
  defaultClassId,
}: Readonly<{
  institutionId: string;
  classOptions: readonly SelectOption[];
  defaultClassId?: string | undefined;
}>) {
  return (
    <EntityDialog
      triggerLabel="Add group"
      title="Add group"
      description="A subdivision of a class — a house, stream or track."
      action={createGroupAction}
      submitLabel="Create group"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <SelectField
        id="group-class"
        name="classId"
        label="Class"
        options={classOptions}
        defaultValue={defaultClassId}
        placeholder="Select a class"
        required
      />
      <TextField id="group-name" name="name" label="Group name" placeholder="Blue" required />
      <TextareaField id="group-description" name="description" label="Description" rows={3} />
    </EntityDialog>
  );
}

export function CreateSectionDialog({
  institutionId,
  groupOptions,
  defaultGroupId,
  campusOptions,
  floorOptions,
}: Readonly<{
  institutionId: string;
  groupOptions: readonly SelectOption[];
  defaultGroupId?: string | undefined;
  campusOptions: readonly SelectOption[];
  floorOptions: readonly SelectOption[];
}>) {
  return (
    <EntityDialog
      triggerLabel="Add section"
      title="Add section"
      description="A room-level division of a group — the unit attendance is taken against."
      action={createSectionAction}
      submitLabel="Create section"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <SelectField
        id="section-group"
        name="groupId"
        label="Group"
        options={groupOptions}
        defaultValue={defaultGroupId}
        placeholder="Select a group"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="section-name" name="name" label="Section name" placeholder="A" required />
        <TextField
          id="section-capacity"
          name="capacity"
          label="Capacity"
          type="number"
          min={1}
          inputMode="numeric"
        />
      </div>
      <SelectField
        id="section-campus"
        name="campusId"
        label="Campus"
        options={campusOptions}
        placeholder="None"
      />
      <SelectField
        id="section-floor"
        name="floorId"
        label="Floor"
        options={floorOptions}
        placeholder="None"
      />
    </EntityDialog>
  );
}
