"use client";

/**
 * Teacher forms and dialogs (`PHASES.md` §22, `ADR-0002`).
 */
import { EntityDialog } from "@/components/shared/entity-dialog";
import { SelectField } from "@/components/shared/select-field";
import { TextField, TextareaField } from "@/components/shared/text-field";
import type { DepartmentRow, SubjectRow } from "@/modules/academic";

import {
  addTeacherCompetenceAction,
  assignTeacherAction,
  createTeacherAction,
} from "./actions";

export interface CandidateUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface SectionOption {
  readonly id: string;
  readonly label: string;
}

export function CreateTeacherDialog({
  institutionId,
  departments,
  candidateUsers,
}: Readonly<{
  institutionId: string;
  departments: readonly DepartmentRow[];
  candidateUsers: readonly CandidateUser[];
}>) {
  const userOptions = candidateUsers.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.email})`,
  }));

  return (
    <EntityDialog
      triggerLabel="Add teacher profile"
      title="Add teacher profile"
      description="Create a teaching profile for a registered staff member."
      action={createTeacherAction}
      submitLabel="Create profile"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="space-y-4">
        {userOptions.length > 0 ? (
          <SelectField
            id="teacher-user"
            name="userId"
            label="User account"
            options={userOptions}
            placeholder="Select a user account"
            required
          />
        ) : (
          <TextField
            id="teacher-user-id"
            name="userId"
            label="User account ID"
            placeholder="Enter user account ID"
            hint="The system ID of the user account to associate with this teacher."
            required
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="teacher-first-name"
            name="firstName"
            label="First name"
            placeholder="e.g. Ayesha"
            required
          />
          <TextField
            id="teacher-last-name"
            name="lastName"
            label="Last name"
            placeholder="e.g. Malik"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="teacher-employee-code"
            name="employeeCode"
            label="Employee code"
            placeholder="e.g. TCH-001"
          />
          <SelectField
            id="teacher-department"
            name="departmentId"
            label="Department"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Select department (optional)"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="teacher-email"
            name="email"
            label="Email"
            type="email"
            placeholder="teacher@institution.edu"
          />
          <TextField
            id="teacher-phone"
            name="phone"
            label="Phone"
            placeholder="+92 300 1234567"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="teacher-qualification"
            name="qualification"
            label="Qualification"
            placeholder="e.g. M.Sc. Mathematics"
          />
          <TextField
            id="teacher-max-periods"
            name="maxPeriodsPerDay"
            label="Max periods/day"
            type="number"
            placeholder="e.g. 5"
          />
        </div>

        <TextareaField
          id="teacher-bio"
          name="bio"
          label="Bio / Notes"
          placeholder="Brief teaching experience and notes"
          rows={3}
        />
      </div>
    </EntityDialog>
  );
}

export function AssignTeacherDialog({
  institutionId,
  teacherId,
  academicSessionId,
  sections,
  subjects,
}: Readonly<{
  institutionId: string;
  teacherId: string;
  academicSessionId: string;
  sections: readonly SectionOption[];
  subjects: readonly SubjectRow[];
}>) {
  return (
    <EntityDialog
      triggerLabel="Assign section / subject"
      title="Assign section / subject"
      description="Assign this teacher to a class section and subject for the active session."
      action={assignTeacherAction}
      submitLabel="Save assignment"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="academicSessionId" value={academicSessionId} />

      <div className="space-y-4">
        <SelectField
          id="assign-section"
          name="sectionId"
          label="Class Section"
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
          placeholder="Select a section"
          required
        />

        <SelectField
          id="assign-subject"
          name="subjectId"
          label="Subject"
          options={subjects.map((sub) => ({ value: sub.id, label: `${sub.name} (${sub.code})` }))}
          placeholder="Select a subject"
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is-class-teacher"
            name="isClassTeacher"
            value="true"
            className="size-4 rounded border-gray-300"
          />
          <label htmlFor="is-class-teacher" className="text-sm">
            Designate as Class Teacher (In-charge)
          </label>
        </div>
      </div>
    </EntityDialog>
  );
}

export function AddTeacherCompetenceDialog({
  institutionId,
  teacherUserId,
  subjects,
}: Readonly<{
  institutionId: string;
  teacherUserId: string;
  subjects: readonly SubjectRow[];
}>) {
  return (
    <EntityDialog
      triggerLabel="Add subject competence"
      title="Add subject competence"
      description="Record a subject this teacher is qualified to teach."
      action={addTeacherCompetenceAction}
      submitLabel="Record competence"
      width="sm"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="teacherUserId" value={teacherUserId} />

      <div className="space-y-4">
        <SelectField
          id="competence-subject"
          name="subjectId"
          label="Subject"
          options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          placeholder="Select subject"
          required
        />
        <TextField
          id="competence-from"
          name="effectiveFrom"
          label="Effective from"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
    </EntityDialog>
  );
}
