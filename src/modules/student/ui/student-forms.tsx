"use client";

/**
 * Student form controls (Phase 7 tasks 1–2, 7–9, 11–13, 17 — profile, lifecycle, archival,
 * placement, enrollment, documents).
 *
 * Three patterns, matching what each command *is* (`DESIGN.md` §13):
 *
 * - **Creation and editing** are ordinary forms → `EntityDialog`, which closes on success and
 *   leaves the page to re-render through `revalidatePath`.
 * - **Lifecycle** offers only the edges the state machine allows (`LIFECYCLE_TRANSITIONS`), the
 *   same surfacing the sessions page does for `assertCanClose`: the UI never *offers* a
 *   transition the service would refuse. Terminal states get no dialog at all.
 * - **Archive / reject / unlink** are consequential → `triggerVariant="destructive"` so the
 *   control reads as such before the dialog explains the consequences.
 *
 * The placement dialog is the one with client state: a section only exists inside a session, so
 * choosing a session rebuilds the section list. Everything else is a plain uncontrolled form —
 * values travel as `FormData`, never through React state the server action cannot see.
 */
import * as React from "react";

import { FormField, fieldAria } from "@/components/shared/form-field";
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { TextareaField, TextField } from "@/components/shared/text-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityDialog } from "@/components/shared/entity-dialog";
import type { DepartmentRow, SessionRow } from "@/modules/academic";
import { GRADE_LEVEL_OPTIONS } from "@/modules/academic/application/schemas";

import type { DocumentRow, StudentListRow } from "@/modules/student";
import { LIFECYCLE_LABELS, LIFECYCLE_TRANSITIONS } from "@/modules/student/domain/domain-rules";

import {
  archiveStudentAction,
  createStudentAction,
  decideDocumentAction,
  enrollStudentAction,
  placeStudentAction,
  registerDocumentAction,
  setStudentLifecycleAction,
  unarchiveStudentAction,
  updateStudentAction,
} from "./actions";
import { DOCUMENT_TYPE_OPTIONS, GENDER_OPTIONS, PLACEMENT_REASON_OPTIONS } from "./form-options";

/* -------------------------------------------------------------------------- */
/* Profile (tasks 1–2, 7–9)                                                    */
/* -------------------------------------------------------------------------- */

export function CreateStudentDialog({ institutionId }: Readonly<{ institutionId: string }>) {
  return (
    <EntityDialog
      triggerLabel="Add student"
      title="Add student"
      description="A student record with an institution-issued e-mail. Guardians and class placement come after the record exists."
      action={createStudentAction}
      submitLabel="Create student"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <StudentFields idPrefix="student-new" />
    </EntityDialog>
  );
}

export function EditStudentDialog({
  institutionId,
  student,
}: Readonly<{ institutionId: string; student: StudentListRow }>) {
  return (
    <EntityDialog
      triggerLabel="Edit"
      triggerVariant="outline"
      title="Edit student"
      description="Profile fields only — status and class placement have their own controls."
      action={updateStudentAction}
      submitLabel="Save changes"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="version" value={student.version} />
      <StudentFields idPrefix="student-edit" student={student} />
    </EntityDialog>
  );
}

function StudentFields({
  idPrefix,
  student,
}: Readonly<{ idPrefix: string; student?: StudentListRow | undefined }>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-admissionNumber`}
          name="admissionNumber"
          label="Admission number"
          defaultValue={student?.admissionNumber}
          required
        />
        <TextField
          id={`${idPrefix}-rollNumber`}
          name="rollNumber"
          label="Roll number"
          defaultValue={student?.rollNumber ?? undefined}
        />
        <TextField
          id={`${idPrefix}-firstName`}
          name="firstName"
          label="First name"
          defaultValue={student?.firstName}
          required
        />
        <TextField
          id={`${idPrefix}-middleName`}
          name="middleName"
          label="Middle name"
          defaultValue={student?.middleName ?? undefined}
        />
        <TextField
          id={`${idPrefix}-lastName`}
          name="lastName"
          label="Last name"
          defaultValue={student?.lastName}
          required
        />
        <TextField
          id={`${idPrefix}-dateOfBirth`}
          name="dateOfBirth"
          label="Date of birth"
          type="date"
          defaultValue={student?.dateOfBirth ?? undefined}
        />
        <SelectField
          id={`${idPrefix}-gender`}
          name="gender"
          label="Gender"
          options={GENDER_OPTIONS}
          defaultValue={student?.gender ?? ""}
        />
        <TextField
          id={`${idPrefix}-email`}
          name="email"
          label="Email"
          type="email"
          defaultValue={student?.email}
          hint="Contact address only — students do not sign in."
          required
        />
        <TextField
          id={`${idPrefix}-phone`}
          name="phone"
          label="Phone"
          defaultValue={student?.phone ?? undefined}
        />
      </div>
      <TextareaField
        id={`${idPrefix}-address`}
        name="address"
        label="Address"
        defaultValue={student?.address ?? undefined}
        rows={2}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Lifecycle & archival (task 13, D-4)                                         */
/* -------------------------------------------------------------------------- */

export function ChangeLifecycleDialog({
  institutionId,
  student,
}: Readonly<{ institutionId: string; student: StudentListRow }>) {
  const nextStates = LIFECYCLE_TRANSITIONS[student.lifecycle];
  // Terminal (graduated / transferred / withdrawn): re-admission is a future admission entity
  // (D-3), so there is deliberately no dialog — the UI cannot offer what the machine forbids.
  if (nextStates.length === 0) return null;

  const options = nextStates.map((state) => ({ value: state, label: LIFECYCLE_LABELS[state] }));

  return (
    <EntityDialog
      triggerLabel="Change status"
      triggerVariant="outline"
      title="Change student status"
      description={`Currently ${LIFECYCLE_LABELS[student.lifecycle].toLowerCase()}. Only transitions the record allows are offered.`}
      action={setStudentLifecycleAction}
      submitLabel="Save status"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={student.id} />
      <SelectField
        id="student-lifecycle"
        name="lifecycle"
        label="New status"
        options={options}
        defaultValue={nextStates[0]}
        required
      />
    </EntityDialog>
  );
}

export function ArchiveStudentDialog({
  institutionId,
  student,
}: Readonly<{ institutionId: string; student: StudentListRow }>) {
  return (
    <EntityDialog
      triggerLabel="Archive"
      triggerVariant="destructive"
      title={`Archive ${student.firstName}?`}
      description="Archiving marks the record as no longer counting — for rows created in error. It is separate from the student's status, which stays as it is. Restore puts the record back."
      action={archiveStudentAction}
      submitLabel="Archive record"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="version" value={student.version} />
    </EntityDialog>
  );
}

export function UnarchiveStudentDialog({
  institutionId,
  student,
}: Readonly<{ institutionId: string; student: StudentListRow }>) {
  return (
    <EntityDialog
      triggerLabel="Restore"
      triggerVariant="outline"
      title={`Restore ${student.firstName}'s record?`}
      description="The record returns to the active roster. The student's status is unchanged."
      action={unarchiveStudentAction}
      submitLabel="Restore record"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={student.id} />
      <input type="hidden" name="version" value={student.version} />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Placement & enrollment (tasks 11–12)                                        */
/* -------------------------------------------------------------------------- */

/** A `Select` whose value the component owns — needed when one field's options depend on another. */
function ControlledSelect({
  id,
  name,
  label,
  options,
  value,
  onValueChange,
  placeholder,
  required,
  disabled,
}: Readonly<{
  id: string;
  name: string;
  label: string;
  options: readonly SelectOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
}>) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label])) as Record<
    string,
    string
  >;

  return (
    <FormField label={label} htmlFor={id} required={required ?? false}>
      <Select
        name={name}
        items={items}
        value={value}
        onValueChange={onValueChange}
        required={required ?? false}
        disabled={disabled ?? false}
      >
        <SelectTrigger id={id} className="w-full" {...fieldAria(id, {})}>
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

export function PlaceStudentDialog({
  institutionId,
  student,
  sessions,
  sectionsBySession,
}: Readonly<{
  institutionId: string;
  student: Pick<StudentListRow, "id" | "firstName" | "lastName">;
  /** Open sessions only — a closed session refuses placement at the service (`RULES.md` §44). */
  sessions: readonly SessionRow[];
  sectionsBySession: Readonly<Record<string, readonly SelectOption[]>>;
}>) {
  const [sessionId, setSessionId] = React.useState<string | null>(sessions[0]?.id ?? null);
  const [sectionId, setSectionId] = React.useState<string | null>(null);

  const sessionOptions = sessions.map((session) => ({
    value: session.id,
    label: session.name,
  }));
  const sectionOptions = sessionId === null ? [] : (sectionsBySession[sessionId] ?? []);

  return (
    <EntityDialog
      triggerLabel="Place in class"
      title={`Place ${student.firstName} in a class`}
      description="A placement puts the student into a section of an open session for this session's lifecycle. Previous placements are kept as history."
      action={placeStudentAction}
      submitLabel="Place student"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={student.id} />
      <ControlledSelect
        id="placement-session"
        name="academicSessionId"
        label="Session"
        options={sessionOptions}
        value={sessionId}
        onValueChange={(value) => {
          setSessionId(value);
          setSectionId(null);
        }}
        required
      />
      <ControlledSelect
        id="placement-section"
        name="sectionId"
        label="Class placement"
        options={sectionOptions}
        value={sectionId}
        onValueChange={setSectionId}
        placeholder={
          sectionOptions.length === 0 ? "This session has no sections yet" : "Choose a section"
        }
        disabled={sectionOptions.length === 0}
        required
      />
      <SelectField
        id="placement-reason"
        name="placementReason"
        label="Reason"
        options={PLACEMENT_REASON_OPTIONS}
        defaultValue="admission"
        required
      />
    </EntityDialog>
  );
}

export function EnrollStudentDialog({
  institutionId,
  student,
  sessions,
  departments,
}: Readonly<{
  institutionId: string;
  student: Pick<StudentListRow, "id" | "firstName" | "lastName">;
  sessions: readonly SessionRow[];
  departments: readonly DepartmentRow[];
}>) {
  const departmentOptions = departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));

  return (
    <EntityDialog
      triggerLabel="Enroll"
      title={`Enroll ${student.firstName}`}
      description="Enrollment records the student's academic year and grade — one row per (student, year, grade), independent of class placement."
      action={enrollStudentAction}
      submitLabel="Enroll student"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={student.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="enroll-session"
          name="academicSessionId"
          label="Session"
          options={sessions.map((session) => ({ value: session.id, label: session.name }))}
          defaultValue={sessions[0]?.id}
          required
        />
        <TextField
          id="enroll-year"
          name="academicYear"
          label="Academic year"
          placeholder="2026–27"
          required
        />
        <SelectField
          id="enroll-grade"
          name="gradeLevel"
          label="Grade level"
          options={GRADE_LEVEL_OPTIONS}
          placeholder="Not set"
        />
        <SelectField
          id="enroll-department"
          name="departmentId"
          label="Department"
          options={departmentOptions}
          placeholder="None"
        />
        <TextField
          id="enroll-date"
          name="enrolledOn"
          label="Enrolled on"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <TextareaField id="enroll-description" name="description" label="Notes" rows={2} />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Documents (task 10)                                                         */
/* -------------------------------------------------------------------------- */

export function RegisterDocumentDialog({
  institutionId,
  studentId,
}: Readonly<{ institutionId: string; studentId: string }>) {
  return (
    <EntityDialog
      triggerLabel="Add document"
      title="Register a document"
      description="Records the document's metadata; it starts as pending until someone verifies it."
      action={registerDocumentAction}
      submitLabel="Register document"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={studentId} />
      <SelectField
        id="document-type"
        name="documentType"
        label="Document type"
        options={DOCUMENT_TYPE_OPTIONS}
        required
      />
      <TextField
        id="document-file"
        name="originalFileName"
        label="File name"
        placeholder="birth-certificate.pdf"
        hint="The file itself is uploaded separately; this names the record."
      />
    </EntityDialog>
  );
}

export function DocumentDecisionDialog({
  institutionId,
  studentId,
  document,
  decision,
}: Readonly<{
  institutionId: string;
  studentId: string;
  document: Pick<DocumentRow, "id" | "documentType">;
  decision: "verified" | "rejected";
}>) {
  const isReject = decision === "rejected";

  return (
    <EntityDialog
      triggerLabel={isReject ? "Reject" : "Verify"}
      triggerVariant={isReject ? "destructive" : "outline"}
      title={isReject ? "Reject this document?" : "Verify this document?"}
      description={
        isReject
          ? "The document stays on the record as rejected, with your reason attached."
          : `Marks the ${document.documentType.replaceAll("_", " ")} as verified.`
      }
      action={decideDocumentAction}
      submitLabel={isReject ? "Reject document" : "Verify document"}
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="documentId" value={document.id} />
      <input type="hidden" name="decision" value={decision} />
      {isReject && (
        <TextareaField
          id="document-rejection"
          name="rejectionReason"
          label="Reason"
          hint="Shown wherever this document's status is reviewed."
          required
          rows={2}
        />
      )}
    </EntityDialog>
  );
}
