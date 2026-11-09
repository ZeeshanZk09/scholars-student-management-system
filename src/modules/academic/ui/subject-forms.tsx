"use client";

/** Subject creation (Phase 6 task 7). */
import { SelectField } from "@/components/shared/select-field";
import { TextField, TextareaField } from "@/components/shared/text-field";

import type { DepartmentRow } from "@/modules/academic";

import { createSubjectAction } from "./actions";
import { EntityDialog } from "@/components/shared/entity-dialog";

const SUBJECT_KIND_OPTIONS = [
  { value: "theory", label: "Theory" },
  { value: "practical", label: "Practical" },
  { value: "both", label: "Theory + practical" },
];

export function CreateSubjectDialog({
  institutionId,
  departments,
}: Readonly<{ institutionId: string; departments: readonly DepartmentRow[] }>) {
  return (
    <EntityDialog
      triggerLabel="Add subject"
      title="Add subject"
      description="A teachable subject offered by the institution."
      action={createSubjectAction}
      submitLabel="Create subject"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="subject-name"
          name="name"
          label="Subject name"
          placeholder="Physics"
          required
        />
        <TextField id="subject-code" name="code" label="Code" placeholder="PHY-09" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="subject-kind"
          name="kind"
          label="Type"
          options={SUBJECT_KIND_OPTIONS}
          placeholder="Select a type"
          required
        />
        <SelectField
          id="subject-department"
          name="departmentId"
          label="Department"
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="None"
        />
      </div>
      <TextareaField id="subject-description" name="description" label="Description" rows={3} />
    </EntityDialog>
  );
}
