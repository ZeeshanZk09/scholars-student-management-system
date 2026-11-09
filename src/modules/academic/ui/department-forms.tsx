"use client";

/** Department and designation creation (Phase 6 task 8). */
import { SelectField } from "@/components/shared/select-field";
import { TextField, TextareaField } from "@/components/shared/text-field";

import type { DepartmentRow } from "@/modules/academic";

import { createDepartmentAction, createDesignationAction } from "./actions";
import { EntityDialog } from "@/components/shared/entity-dialog";

export function CreateDepartmentDialog({ institutionId }: Readonly<{ institutionId: string }>) {
  return (
    <EntityDialog
      triggerLabel="Add department"
      title="Add department"
      description="An academic grouping — Science, Humanities — that subjects and staff align to."
      action={createDepartmentAction}
      submitLabel="Create department"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <TextField
        id="department-name"
        name="name"
        label="Department name"
        placeholder="Science"
        required
      />
      <TextareaField id="department-description" name="description" label="Description" rows={3} />
    </EntityDialog>
  );
}

export function CreateDesignationDialog({
  institutionId,
  departments,
}: Readonly<{ institutionId: string; departments: readonly DepartmentRow[] }>) {
  return (
    <EntityDialog
      triggerLabel="Add designation"
      title="Add designation"
      description="A staff role — Teacher, Head of Department — optionally scoped to a department."
      action={createDesignationAction}
      submitLabel="Create designation"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <TextField
        id="designation-name"
        name="name"
        label="Designation"
        placeholder="Teacher"
        required
      />
      <SelectField
        id="designation-department"
        name="departmentId"
        label="Department"
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
        placeholder="None"
        hint="Scope the role to one department, or leave it institution-wide."
      />
      <TextareaField id="designation-description" name="description" label="Description" rows={3} />
    </EntityDialog>
  );
}
