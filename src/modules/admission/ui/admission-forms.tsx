"use client";

/**
 * Admission form controls (Phase 8 task 14 — "Admission UI").
 *
 * The same three patterns the student module settled on (`student-forms.tsx`), matched to what
 * each command *is* (`DESIGN.md` §13):
 *
 * - **Filing and editing** an application are ordinary forms → `EntityDialog`, which closes on
 *   success and leaves the page to re-render through `revalidatePath`.
 * - **Deciding** surfaces only the edges the state machine allows (`decisionOptions` builds them
 *   from `ADMISSION_TRANSITIONS`), so the UI never *offers* a transition the service would refuse;
 *   terminal states get no dialog at all.
 * - **Converting** carries the whole student payload in one submit — one dialog, three blocks
 *   (student, class placement, optional guardian / previous school), because the command creates
 *   all of them in a single transaction and a half-filled optional block is refused at the
 *   boundary (`convertAdmissionSchema`'s `superRefine`), not silently dropped.
 *
 * Values travel as plain `FormData` — the only React state here is the dependent pickers
 * (session → class → group, session → section), which exist because one field's options *are*
 * another field's value. The duplicate preview is the one server round-trip that is not a
 * submission: it calls `previewDuplicatesAction` directly and renders the advisory result inline
 * before the real submit (`SECURITY.md` §21 gates that read too).
 *
 * Import rule (`index.ts` header): types come from the barrel, but every value — labels, tuples,
 * the transition map — comes from `domain/domain-rules` or this module's `form-options`, so this
 * file never pulls the Drizzle store into the client bundle.
 */
import * as React from "react";

import { CheckboxField } from "@/components/shared/checkbox-field";
import { EntityDialog } from "@/components/shared/entity-dialog";
import { FormField, fieldAria } from "@/components/shared/form-field";
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { TextareaField, TextField } from "@/components/shared/text-field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DepartmentRow, SessionRow } from "@/modules/academic";
import { GRADE_LEVEL_OPTIONS } from "@/modules/academic/application/schemas";
import type {
  AdmissionDetailRow,
  AdmissionDocumentRow,
  DuplicateCandidateRow,
} from "@/modules/admission";
import { ADMISSION_STATUS_LABELS } from "@/modules/admission/domain/domain-rules";

import {
  convertAdmissionAction,
  createAdmissionAction,
  decideAdmissionAction,
  decideAdmissionDocumentAction,
  previewDuplicatesAction,
  registerAdmissionDocumentAction,
  updateAdmissionAction,
} from "./actions";
import {
  ADMISSION_STATUS_TONES,
  CONTACT_TYPE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  RELATIONSHIP_OPTIONS,
  decisionOptions,
  humanize,
} from "./form-options";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
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

/** A titled sub-form inside the conversion dialog — the sections `superRefine` reasons about. */
function Block({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint?: string | undefined; children: React.ReactNode }>) {
  return (
    <section className="grid gap-3 rounded-none border px-3 py-3">
      <div className="space-y-0.5">
        <h3 className="text-xs font-semibold">{title}</h3>
        {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Session → class → group, plus the grade-level free text — the "applied for" scope both the
 * create and edit forms post. All three pickers are optional at the field level; the boundary's
 * `requireScope` insists on at least one of class/group/grade and says so with a field-level
 * message. A disabled Base UI select submits no input, which is exactly "no class chosen".
 */
function ScopeFields({
  idPrefix,
  sessions,
  classesBySession,
  groupsByClass,
  initialSessionId,
  initialClassId,
  initialGroupId,
  initialGradeLevel,
}: Readonly<{
  idPrefix: string;
  sessions: readonly SessionRow[];
  classesBySession: Readonly<Record<string, readonly SelectOption[]>>;
  groupsByClass: Readonly<Record<string, readonly SelectOption[]>>;
  initialSessionId?: string | null | undefined;
  initialClassId?: string | null | undefined;
  initialGroupId?: string | null | undefined;
  initialGradeLevel?: string | null | undefined;
}>) {
  const [sessionId, setSessionId] = React.useState<string | null>(initialSessionId ?? null);
  const [classId, setClassId] = React.useState<string | null>(initialClassId ?? null);
  const [groupId, setGroupId] = React.useState<string | null>(initialGroupId ?? null);

  const sessionOptions = sessions.map((session) => ({ value: session.id, label: session.name }));
  const classOptions = sessionId === null ? [] : (classesBySession[sessionId] ?? []);
  const groupOptions = classId === null ? [] : (groupsByClass[classId] ?? []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <ControlledSelect
          id={`${idPrefix}-session`}
          name="academicSessionId"
          label="Session applied for"
          options={sessionOptions}
          value={sessionId}
          onValueChange={(value) => {
            setSessionId(value);
            setClassId(null);
            setGroupId(null);
          }}
          placeholder={sessions.length === 0 ? "No sessions yet" : "No session chosen"}
          disabled={sessions.length === 0}
        />
        <ControlledSelect
          id={`${idPrefix}-class`}
          name="appliedClassId"
          label="Class applied for"
          options={classOptions}
          value={classId}
          onValueChange={(value) => {
            setClassId(value);
            setGroupId(null);
          }}
          placeholder={
            sessionId === null
              ? "Choose a session first"
              : classOptions.length === 0
                ? "This session has no classes yet"
                : "Choose a class"
          }
          disabled={sessionId === null || classOptions.length === 0}
        />
        <ControlledSelect
          id={`${idPrefix}-group`}
          name="appliedGroupId"
          label="Group applied for"
          options={groupOptions}
          value={groupId}
          onValueChange={setGroupId}
          placeholder={
            classId === null
              ? "Choose a class first"
              : groupOptions.length === 0
                ? "This class has no groups"
                : "Choose a group"
          }
          disabled={classId === null || groupOptions.length === 0}
        />
        <TextField
          id={`${idPrefix}-gradeLevel`}
          name="appliedGradeLevel"
          label="Grade applied for"
          hint="Class, group or grade — at least one of the three is required."
          defaultValue={initialGradeLevel ?? undefined}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Application (tasks 1, 2, 8)                                                 */
/* -------------------------------------------------------------------------- */

export function CreateAdmissionDialog({
  institutionId,
  sessions,
  classesBySession,
  groupsByClass,
}: Readonly<{
  institutionId: string;
  sessions: readonly SessionRow[];
  classesBySession: Readonly<Record<string, readonly SelectOption[]>>;
  groupsByClass: Readonly<Record<string, readonly SelectOption[]>>;
}>) {
  return (
    <EntityDialog
      triggerLabel="New application"
      title="File an application"
      description="An applicant becomes a student only by conversion — filing records who applied and for what, and starts the workflow at Submitted."
      action={createAdmissionAction}
      submitLabel="Submit application"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="admission-applicationNumber"
          name="applicationNumber"
          label="Application number"
          hint="Leave blank to mint one (ADM-…)."
        />
        <TextField id="admission-firstName" name="firstName" label="First name" required />
        <TextField id="admission-middleName" name="middleName" label="Middle name" />
        <TextField id="admission-lastName" name="lastName" label="Last name" required />
        <TextField
          id="admission-dateOfBirth"
          name="dateOfBirth"
          label="Date of birth"
          type="date"
        />
        <SelectField
          id="admission-gender"
          name="gender"
          label="Gender"
          options={GENDER_OPTIONS}
          defaultValue=""
        />
        <TextField id="admission-email" name="email" label="Email" type="email" />
        <TextField id="admission-phone" name="phone" label="Phone" />
      </div>
      <TextareaField id="admission-address" name="address" label="Address" rows={2} />
      <DuplicateCheck />
      <div className="grid gap-4 sm:grid-cols-2">
        <ScopeFields
          idPrefix="admission-create"
          sessions={sessions}
          classesBySession={classesBySession}
          groupsByClass={groupsByClass}
          initialSessionId={sessions[0]?.id ?? null}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="admission-testScore"
          name="testScore"
          label="Test score"
          type="number"
          min="0"
          step="0.01"
          hint="Blank means not taken."
        />
        <TextField
          id="admission-interviewScore"
          name="interviewScore"
          label="Interview score"
          type="number"
          min="0"
          step="0.01"
          hint="Blank means not taken."
        />
      </div>
    </EntityDialog>
  );
}

export function EditAdmissionDialog({
  institutionId,
  admission,
  sessions,
  classesBySession,
  groupsByClass,
}: Readonly<{
  institutionId: string;
  admission: AdmissionDetailRow;
  sessions: readonly SessionRow[];
  classesBySession: Readonly<Record<string, readonly SelectOption[]>>;
  groupsByClass: Readonly<Record<string, readonly SelectOption[]>>;
}>) {
  return (
    <EntityDialog
      triggerLabel="Edit"
      triggerVariant="outline"
      title="Edit application"
      description="Applicant details and applied-for scope only — the application number and any recorded outcome are audit facts and never rewritten."
      action={updateAdmissionAction}
      submitLabel="Save changes"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="admissionId" value={admission.id} />
      <input type="hidden" name="version" value={admission.version} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="admission-edit-firstName"
          name="firstName"
          label="First name"
          defaultValue={admission.firstName}
          required
        />
        <TextField
          id="admission-edit-middleName"
          name="middleName"
          label="Middle name"
          defaultValue={admission.middleName ?? undefined}
        />
        <TextField
          id="admission-edit-lastName"
          name="lastName"
          label="Last name"
          defaultValue={admission.lastName}
          required
        />
        <TextField
          id="admission-edit-dateOfBirth"
          name="dateOfBirth"
          label="Date of birth"
          type="date"
          defaultValue={admission.dateOfBirth ?? undefined}
        />
        <SelectField
          id="admission-edit-gender"
          name="gender"
          label="Gender"
          options={GENDER_OPTIONS}
          defaultValue={admission.gender ?? ""}
        />
        <TextField
          id="admission-edit-email"
          name="email"
          label="Email"
          type="email"
          defaultValue={admission.email ?? undefined}
        />
        <TextField
          id="admission-edit-phone"
          name="phone"
          label="Phone"
          defaultValue={admission.phone ?? undefined}
        />
        <TextField
          id="admission-edit-testScore"
          name="testScore"
          label="Test score"
          type="number"
          min="0"
          step="0.01"
          defaultValue={admission.testScore ?? undefined}
        />
        <TextField
          id="admission-edit-interviewScore"
          name="interviewScore"
          label="Interview score"
          type="number"
          min="0"
          step="0.01"
          defaultValue={admission.interviewScore ?? undefined}
        />
      </div>
      <TextareaField
        id="admission-edit-address"
        name="address"
        label="Address"
        defaultValue={admission.address ?? undefined}
        rows={2}
      />
      <ScopeFields
        idPrefix="admission-edit"
        sessions={sessions}
        classesBySession={classesBySession}
        groupsByClass={groupsByClass}
        initialSessionId={admission.academicSessionId}
        initialClassId={admission.appliedClassId}
        initialGroupId={admission.appliedGroupId}
        initialGradeLevel={admission.appliedGradeLevel}
      />
    </EntityDialog>
  );
}

/**
 * The pre-submit name look-up (task 9). Not a submission — it walks up to the enclosing form,
 * packages whatever is typed so far, and renders the advisory candidates inline. The form stays
 * open either way: duplicates warn, they never block (`domain-rules` `isLikelyDuplicate`).
 */
function DuplicateCheck() {
  const scope = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [candidates, setCandidates] = React.useState<readonly DuplicateCandidateRow[] | null>(null);

  async function check(): Promise<void> {
    const form = scope.current?.closest("form");
    if (form === null || busy) return;
    setBusy(true);
    setMessage(null);
    setCandidates(null);
    try {
      const result = await previewDuplicatesAction(new FormData(form));
      if (result.status === "error") {
        setMessage(result.message);
      } else if (result.candidates.length === 0) {
        setMessage("No likely duplicates found.");
      } else {
        setCandidates(result.candidates);
      }
    } catch {
      /* A rejected fetch (offline, expired session mid-flight) must not die as an unhandled
           rejection with a spinner that stops silently — say something. */
      setMessage("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={scope} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="xs" onClick={check} disabled={busy}>
          {busy ? "Checking…" : "Check for duplicates"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Compares name and date of birth against this institution&apos;s applications.
        </span>
      </div>
      {message !== null && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {candidates !== null && (
        <div
          role="status"
          className="grid gap-2 rounded-none border border-warning/40 bg-warning/5 px-3 py-2"
        >
          <p className="text-xs font-medium">
            {candidates.length === 1
              ? "1 application with the same name:"
              : `${candidates.length} applications with the same name:`}{" "}
            Advisory only — file this application if they are different people.
          </p>
          <ul className="grid gap-1">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono">{candidate.applicationNumber}</span>
                <span>
                  {candidate.firstName} {candidate.lastName}
                </span>
                {candidate.dateOfBirth !== null && (
                  <span className="text-muted-foreground">born {candidate.dateOfBirth}</span>
                )}
                <StatusBadge tone={ADMISSION_STATUS_TONES[candidate.status]} dot={false}>
                  {ADMISSION_STATUS_LABELS[candidate.status]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Decision (task 10)                                                          */
/* -------------------------------------------------------------------------- */

export function DecideAdmissionDialog({
  institutionId,
  admission,
}: Readonly<{ institutionId: string; admission: AdmissionDetailRow }>) {
  const options = decisionOptions(admission.status);
  // Terminal (rejected / converted / cancelled): the machine has no outgoing edge, so there is
  // deliberately no dialog — the UI cannot offer what the service would refuse.
  if (options.length === 0) return null;

  return (
    <EntityDialog
      triggerLabel="Decide"
      triggerVariant="outline"
      title="Record a decision"
      description={`Currently ${ADMISSION_STATUS_LABELS[admission.status].toLowerCase()}. Only transitions the record allows are offered — conversion has its own control.`}
      action={decideAdmissionAction}
      submitLabel="Save decision"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="admissionId" value={admission.id} />
      <input type="hidden" name="version" value={admission.version} />
      <SelectField
        id="admission-decision"
        name="to"
        label="Decision"
        options={options}
        defaultValue={options[0]?.value}
        required
      />
      <TextareaField
        id="admission-rejectionReason"
        name="rejectionReason"
        label="Rejection reason"
        hint="Required when rejecting — shown wherever this application's outcome is reviewed."
        rows={2}
        maxLength={500}
      />
      <TextareaField
        id="admission-decisionNotes"
        name="decisionNotes"
        label="Decision notes"
        hint="Optional context for the timeline."
        rows={3}
        maxLength={2000}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Conversion (tasks 2, 3, 5, 6, 7, 11–12)                                     */
/* -------------------------------------------------------------------------- */

export function ConvertAdmissionDialog({
  institutionId,
  admission,
  openSessions,
  sectionsBySession,
  departments,
}: Readonly<{
  institutionId: string;
  admission: AdmissionDetailRow;
  /** Open sessions only — a closed session refuses placement at the service (`RULES.md` §44). */
  openSessions: readonly SessionRow[];
  sectionsBySession: Readonly<Record<string, readonly SelectOption[]>>;
  departments: readonly DepartmentRow[];
}>) {
  /* Prefer the session the applicant applied for — it is open in the common case, and landing on
     an unrelated open session silently misplaces the conversion. */
  const [sessionId, setSessionId] = React.useState<string | null>(
    openSessions.find((session) => session.id === admission.academicSessionId)?.id ??
      openSessions[0]?.id ??
      null,
  );
  const [sectionId, setSectionId] = React.useState<string | null>(null);
  const sectionOptions = sessionId === null ? [] : (sectionsBySession[sessionId] ?? []);
  const departmentOptions = departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));

  return (
    <EntityDialog
      triggerLabel="Convert to student"
      title={`Convert ${admission.applicationNumber}?`}
      description="One command creates the student, places and enrolls them, and — if the guardian block is filled — provisions the guardian account and previous-school record, all in a single transaction. The application is consumed: it cannot be converted twice."
      action={convertAdmissionAction}
      submitLabel="Convert application"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="admissionId" value={admission.id} />
      <input type="hidden" name="version" value={admission.version} />

      <Block title="Student" hint="Defaults to the applicant's details — confirm or correct them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="convert-admissionNumber"
            name="admissionNumber"
            label="Admission number"
            defaultValue={admission.applicationNumber}
            required
          />
          <TextField
            id="convert-firstName"
            name="firstName"
            label="First name"
            defaultValue={admission.firstName}
            required
          />
          <TextField
            id="convert-middleName"
            name="middleName"
            label="Middle name"
            defaultValue={admission.middleName ?? undefined}
          />
          <TextField
            id="convert-lastName"
            name="lastName"
            label="Last name"
            defaultValue={admission.lastName}
            required
          />
          <TextField
            id="convert-email"
            name="email"
            label="Email"
            type="email"
            defaultValue={admission.email ?? undefined}
            hint="A student record needs an institution-issued e-mail — the institution owns this address."
            required
          />
          <TextField
            id="convert-phone"
            name="phone"
            label="Phone"
            defaultValue={admission.phone ?? undefined}
          />
          <TextField
            id="convert-dateOfBirth"
            name="dateOfBirth"
            label="Date of birth"
            type="date"
            defaultValue={admission.dateOfBirth ?? undefined}
          />
          <SelectField
            id="convert-gender"
            name="gender"
            label="Gender"
            options={GENDER_OPTIONS}
            defaultValue={admission.gender ?? ""}
          />
          <TextField id="convert-rollNumber" name="rollNumber" label="Roll number" />
        </div>
        <TextareaField
          id="convert-address"
          name="address"
          label="Address"
          defaultValue={admission.address ?? undefined}
          rows={2}
        />
      </Block>

      <Block
        title="Class placement & enrollment"
        hint="The admission date itself is the enrolled-on date unless you change it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ControlledSelect
            id="convert-session"
            name="academicSessionId"
            label="Session"
            options={openSessions.map((session) => ({ value: session.id, label: session.name }))}
            value={sessionId}
            onValueChange={(value) => {
              setSessionId(value);
              setSectionId(null);
            }}
            placeholder={openSessions.length === 0 ? "No open session" : "Choose a session"}
            disabled={openSessions.length === 0}
            required
          />
          <ControlledSelect
            id="convert-section"
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
          <TextField
            id="convert-academicYear"
            name="academicYear"
            label="Academic year"
            placeholder="2026–27"
            required
          />
          <SelectField
            id="convert-gradeLevel"
            name="gradeLevel"
            label="Grade level"
            options={GRADE_LEVEL_OPTIONS}
            placeholder="Not set"
          />
          <SelectField
            id="convert-department"
            name="departmentId"
            label="Department"
            options={departmentOptions}
            placeholder="None"
          />
          <TextField
            id="convert-enrolledOn"
            name="enrolledOn"
            label="Enrolled on"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
      </Block>

      <Block
        title="Guardian account (optional)"
        hint="Fill any field to link a guardian — the first name, last name, e-mail and relationship are then required, and a blank password invites them to set their own. Leave the whole block blank to skip."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="convert-guardianFirstName" name="guardianFirstName" label="First name" />
          <TextField id="convert-guardianLastName" name="guardianLastName" label="Last name" />
          <TextField
            id="convert-guardianEmail"
            name="guardianEmail"
            label="Email"
            type="email"
            hint="The guardian account's sign-in name."
          />
          <TextField id="convert-guardianPhone" name="guardianPhone" label="Phone" />
          <TextField id="convert-guardianOccupation" name="guardianOccupation" label="Occupation" />
          <TextField
            id="convert-guardianPassword"
            name="guardianPassword"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="Leave blank to invite them to set their own."
          />
          <SelectField
            id="convert-guardianRelationship"
            name="guardianRelationship"
            label="Relationship"
            options={RELATIONSHIP_OPTIONS}
            placeholder="Not linked"
          />
          <SelectField
            id="convert-guardianContactType"
            name="guardianContactType"
            label="Contact priority"
            options={CONTACT_TYPE_OPTIONS}
            placeholder="Not set"
          />
        </div>
        <TextField id="convert-guardianAddress" name="guardianAddress" label="Address" />
        <div className="flex flex-wrap gap-6">
          <CheckboxField
            id="convert-guardianIsFeePayer"
            name="guardianIsFeePayer"
            label="Handles fee payments"
          />
          <CheckboxField
            id="convert-guardianReceivesNotifications"
            name="guardianReceivesNotifications"
            label="Receives notifications"
            defaultChecked
          />
        </div>
      </Block>

      <Block
        title="Previous school (optional)"
        hint="The school's name carries this block — the rest is refused once any of it is filled."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="convert-previousSchoolName"
            name="previousSchoolName"
            label="School name"
          />
          <TextField
            id="convert-previousSchoolClassAttended"
            name="previousSchoolClassAttended"
            label="Class attended"
          />
          <TextField
            id="convert-previousSchoolTcNumber"
            name="previousSchoolTcNumber"
            label="Transfer certificate no."
          />
          <TextField
            id="convert-previousSchoolPhone"
            name="previousSchoolPhone"
            label="School phone"
          />
        </div>
        <TextField
          id="convert-previousSchoolAddress"
          name="previousSchoolAddress"
          label="School address"
        />
      </Block>
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Documents (task 4)                                                          */
/* -------------------------------------------------------------------------- */

export function RegisterAdmissionDocumentDialog({
  institutionId,
  admissionId,
}: Readonly<{ institutionId: string; admissionId: string }>) {
  return (
    <EntityDialog
      triggerLabel="Add document"
      title="Register a document"
      description="Records the document's metadata; it starts as pending until someone verifies it."
      action={registerAdmissionDocumentAction}
      submitLabel="Register document"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="admissionId" value={admissionId} />
      <SelectField
        id="admission-document-type"
        name="documentType"
        label="Document type"
        options={DOCUMENT_TYPE_OPTIONS}
        required
      />
      <TextField
        id="admission-document-file"
        name="originalFileName"
        label="File name"
        placeholder="birth-certificate.pdf"
        hint="The file itself is uploaded separately; this names the record."
      />
    </EntityDialog>
  );
}

export function AdmissionDocumentDecisionDialog({
  institutionId,
  admissionId,
  document,
  decision,
}: Readonly<{
  institutionId: string;
  admissionId: string;
  document: Pick<AdmissionDocumentRow, "id" | "documentType">;
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
          ? "The document stays on the application as rejected, with your reason attached."
          : `Marks the ${humanize(document.documentType)} as verified.`
      }
      action={decideAdmissionDocumentAction}
      submitLabel={isReject ? "Reject document" : "Verify document"}
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="admissionId" value={admissionId} />
      <input type="hidden" name="documentId" value={document.id} />
      <input type="hidden" name="decision" value={decision} />
      {isReject && (
        <TextareaField
          id="admission-document-rejection"
          name="rejectionReason"
          label="Reason"
          hint="Shown wherever this document's status is reviewed."
          required
          rows={2}
          maxLength={500}
        />
      )}
    </EntityDialog>
  );
}
