"use client";

/**
 * Guardian form controls (Phase 7 tasks 4–6, 15–16 — accounts, profile edits, links).
 *
 * A guardian is a `users` account plus a `guardians` profile (ADR-0004) with **no institution on
 * the person** — only `guardian_links` tie them to an institution's students. So the forms come
 * in two halves: *account* forms (create / edit, institution-gated like everything else) and
 * *link* forms (which student, what relationship, who to call first).
 *
 * Linking runs in **both directions** depending on where you stand: the guardians roster picks a
 * student for a guardian, the student's page picks a guardian for a student. Same action
 * (`linkGuardianAction`), same fields, opposite select.
 *
 * The e-mail is required on create — it is the account's identity (the portal cannot recover a
 * password without it) — while the password is optional: leave it blank and the account is
 * created `invited`, waiting for the person to set their own.
 */
import { CheckboxField } from "@/components/shared/checkbox-field";
import { SelectField } from "@/components/shared/select-field";
import { TextareaField, TextField } from "@/components/shared/text-field";
import { EntityDialog } from "@/components/shared/entity-dialog";

import type { GuardianListRow, StudentListRow } from "@/modules/student";

import {
  createGuardianAction,
  linkGuardianAction,
  unlinkGuardianAction,
  updateGuardianAction,
} from "./actions";
import { CONTACT_TYPE_OPTIONS, RELATIONSHIP_OPTIONS } from "./form-options";

/* -------------------------------------------------------------------------- */
/* Account (tasks 4, 15)                                                       */
/* -------------------------------------------------------------------------- */

export function CreateGuardianDialog({
  institutionId,
  students,
  presetStudentId,
}: Readonly<{
  institutionId: string;
  /** The institution's students, for the optional first link. Empty: account-only create. */
  students: readonly StudentListRow[];
  /** Preselect and pin this student — used from a student's own page. */
  presetStudentId?: string | undefined;
}>) {
  const studentOptions = students.map((student) => ({
    value: student.id,
    label: `${student.firstName} ${student.lastName} (${student.admissionNumber})`,
  }));
  const pinned = presetStudentId !== undefined;

  return (
    <EntityDialog
      triggerLabel="Add guardian"
      title="Add guardian"
      description="Creates the guardian's account. Linking them to a student here is optional — you can also link from the student's page later."
      action={createGuardianAction}
      submitLabel="Create guardian"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="guardian-firstName" name="firstName" label="First name" required />
        <TextField id="guardian-lastName" name="lastName" label="Last name" required />
        <TextField
          id="guardian-email"
          name="email"
          label="Email"
          type="email"
          hint="The account's sign-in name and the portal's recovery address."
          required
        />
        <TextField id="guardian-phone" name="phone" label="Phone" />
        <TextField id="guardian-occupation" name="occupation" label="Occupation" />
        <TextField
          id="guardian-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="Leave blank to invite them to set their own."
        />
      </div>
      <TextareaField id="guardian-address" name="address" label="Address" rows={2} />
      {/* A disabled Base UI select's hidden input is excluded from FormData, so the pinned value
          needs a submit-carrying twin or the link would silently never be created. Rendered
          outside the option-list conditional so a pinned submit can never lose `studentId`. */}
      {pinned && <input type="hidden" name="studentId" value={presetStudentId} />}
      {studentOptions.length > 0 && (
        <>
          <SelectField
            id="guardian-student"
            name="studentId"
            label="Link to a student"
            options={studentOptions}
            defaultValue={presetStudentId}
            placeholder="Not linked yet"
            disabled={pinned}
            hint={
              pinned
                ? "This guardian is being added to this student's record."
                : "A guardian with no link is invisible to every institution — linking is recommended."
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="guardian-relationship"
              name="relationship"
              label="Relationship"
              options={RELATIONSHIP_OPTIONS}
              placeholder="Choose…"
            />
            <SelectField
              id="guardian-contactType"
              name="contactType"
              label="Contact priority"
              options={CONTACT_TYPE_OPTIONS}
              placeholder="Not set"
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <CheckboxField
              id="guardian-isFeePayer"
              name="isFeePayer"
              label="Handles fee payments"
            />
            <CheckboxField
              id="guardian-receivesNotifications"
              name="receivesNotifications"
              label="Receives notifications"
              defaultChecked
            />
          </div>
        </>
      )}
    </EntityDialog>
  );
}

export function EditGuardianDialog({
  institutionId,
  guardian,
}: Readonly<{ institutionId: string; guardian: GuardianListRow }>) {
  return (
    <EntityDialog
      triggerLabel="Edit"
      triggerVariant="outline"
      title="Edit guardian"
      description="Contact details for the guardian's profile. The account's e-mail (their sign-in name) is not changed here."
      action={updateGuardianAction}
      submitLabel="Save changes"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="guardianUserId" value={guardian.userId} />
      <input type="hidden" name="version" value={guardian.version} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="guardian-edit-firstName"
          name="firstName"
          label="First name"
          defaultValue={guardian.firstName}
          required
        />
        <TextField
          id="guardian-edit-lastName"
          name="lastName"
          label="Last name"
          defaultValue={guardian.lastName}
          required
        />
        <TextField
          id="guardian-edit-phone"
          name="phone"
          label="Phone"
          defaultValue={guardian.phone ?? undefined}
        />
        <TextField
          id="guardian-edit-occupation"
          name="occupation"
          label="Occupation"
          defaultValue={guardian.occupation ?? undefined}
        />
      </div>
      <TextareaField
        id="guardian-edit-address"
        name="address"
        label="Address"
        defaultValue={guardian.address ?? undefined}
        rows={2}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Links (tasks 5–6)                                                           */
/* -------------------------------------------------------------------------- */

function LinkFields({ idPrefix }: Readonly<{ idPrefix: string }>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${idPrefix}-relationship`}
          name="relationship"
          label="Relationship"
          options={RELATIONSHIP_OPTIONS}
          placeholder="Choose…"
          required
        />
        <SelectField
          id={`${idPrefix}-contactType`}
          name="contactType"
          label="Contact priority"
          options={CONTACT_TYPE_OPTIONS}
          placeholder="Not set"
        />
      </div>
      <div className="flex flex-wrap gap-6">
        <CheckboxField
          id={`${idPrefix}-isFeePayer`}
          name="isFeePayer"
          label="Handles fee payments"
        />
        <CheckboxField
          id={`${idPrefix}-receivesNotifications`}
          name="receivesNotifications"
          label="Receives notifications"
          defaultChecked
        />
      </div>
    </>
  );
}

/** Guardians roster side: pick which student this guardian belongs to. */
export function LinkStudentDialog({
  institutionId,
  guardian,
  students,
}: Readonly<{
  institutionId: string;
  guardian: Pick<GuardianListRow, "userId" | "firstName" | "lastName">;
  students: readonly StudentListRow[];
}>) {
  const studentOptions = students.map((student) => ({
    value: student.id,
    label: `${student.firstName} ${student.lastName} (${student.admissionNumber})`,
  }));

  return (
    <EntityDialog
      triggerLabel="Link"
      title={`Link ${guardian.firstName} ${guardian.lastName} to a student`}
      description="A link defines this guardian's relationship to one child — and is the only thing that gives them visibility into that institution."
      action={linkGuardianAction}
      submitLabel="Link to student"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="guardianUserId" value={guardian.userId} />
      <SelectField
        id="link-student"
        name="studentId"
        label="Student"
        options={studentOptions}
        placeholder="Choose a student"
        required
      />
      <LinkFields idPrefix="link-student" />
    </EntityDialog>
  );
}

/** Student's page side: pick which guardian to attach to this child. */
export function LinkGuardianDialog({
  institutionId,
  student,
  guardians,
}: Readonly<{
  institutionId: string;
  student: Pick<StudentListRow, "id" | "firstName" | "lastName">;
  guardians: readonly GuardianListRow[];
}>) {
  const guardianOptions = guardians.map((guardian) => ({
    value: guardian.userId,
    label: `${guardian.firstName} ${guardian.lastName} · ${guardian.email}`,
  }));

  return (
    <EntityDialog
      triggerLabel="Link guardian"
      title={`Link a guardian to ${student.firstName}`}
      description="Existing accounts only — a brand-new guardian is created with Add guardian instead."
      action={linkGuardianAction}
      submitLabel="Link guardian"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="studentId" value={student.id} />
      <SelectField
        id="link-guardian"
        name="guardianUserId"
        label="Guardian"
        options={guardianOptions}
        placeholder="Choose a guardian"
        required
      />
      <LinkFields idPrefix="link-guardian" />
    </EntityDialog>
  );
}

export function UnlinkGuardianDialog({
  institutionId,
  link,
}: Readonly<{
  institutionId: string;
  link: {
    readonly studentId: string;
    readonly guardianUserId: string;
    readonly guardianFirstName: string;
    readonly guardianLastName: string;
    readonly relationship: string;
  };
}>) {
  return (
    <EntityDialog
      triggerLabel="Unlink"
      triggerVariant="destructive"
      title={`Unlink ${link.guardianFirstName} ${link.guardianLastName}?`}
      description="They stop having any relationship to this student at this institution. Their account and profile are kept, and they can be linked again later."
      action={unlinkGuardianAction}
      submitLabel="Unlink"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="guardianUserId" value={link.guardianUserId} />
      <input type="hidden" name="studentId" value={link.studentId} />
      <TextareaField
        id="unlink-reason"
        name="reason"
        label="Reason"
        hint="Optional — kept on the link's history."
        rows={2}
      />
    </EntityDialog>
  );
}
