"use client";

/**
 * Institution create/edit forms.
 *
 * Both use `FormShell`, so a refusal from the server action (a duplicate slug, an out-of-date
 * `version`, a missing `academic.manage` grant) arrives as readable prose on the same form the
 * user was filling in rather than as a navigation away from it (`RULES.md` §19).
 *
 * `updateInstitutionAction` carries an optimistic-concurrency `version`: two administrators editing
 * the same institution at once cannot silently overwrite each other, the second save fails with
 * "changed since you loaded it" and a refresh.
 */
import { FormShell } from "@/components/shared/form-shell";
import { SelectField } from "@/components/shared/select-field";
import { TextField, TextareaField } from "@/components/shared/text-field";

import type { InstitutionRow } from "@/modules/academic";

import { createInstitutionAction, updateInstitutionAction } from "./actions";
import { EntityDialog } from "@/components/shared/entity-dialog";

const KIND_OPTIONS = [
  { value: "school", label: "School" },
  { value: "college", label: "College" },
];

/** Fields shared by create and edit, so the two can never drift apart. */
function InstitutionFields({
  idPrefix,
  institution,
}: Readonly<{ idPrefix: string; institution?: InstitutionRow }>) {
  return (
    <>
      {institution !== undefined && (
        <>
          <input type="hidden" name="institutionId" value={institution.id} />
          <input type="hidden" name="version" value={institution.version} />
        </>
      )}
      <TextField
        id={`${idPrefix}-name`}
        name="name"
        label="Institution name"
        defaultValue={institution?.name}
        required
        autoComplete="organization"
      />
      <SelectField
        id={`${idPrefix}-kind`}
        name="kind"
        label="Type"
        options={KIND_OPTIONS}
        defaultValue={institution?.kind}
        required
      />
      <TextField
        id={`${idPrefix}-email`}
        name="email"
        label="Contact email"
        type="email"
        defaultValue={institution?.email ?? ""}
        autoComplete="email"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-code`}
          name="code"
          label="Code"
          defaultValue={institution?.code ?? ""}
          hint="Short identifier used in exports."
        />
        <TextField
          id={`${idPrefix}-phone`}
          name="phone"
          label="Phone"
          type="tel"
          defaultValue={institution?.phone ?? ""}
          autoComplete="tel"
        />
      </div>
      <TextareaField
        id={`${idPrefix}-address`}
        name="address"
        label="Address"
        defaultValue={institution?.address ?? ""}
        rows={3}
      />
      <TextField
        id={`${idPrefix}-website`}
        name="website"
        label="Website"
        type="url"
        defaultValue={institution?.website ?? ""}
        placeholder="https://example.edu"
      />
    </>
  );
}

export function CreateInstitutionDialog() {
  return (
    <EntityDialog
      triggerLabel="Add institution"
      title="Add institution"
      description="A tenant with its own academic structure, staff and students."
      action={createInstitutionAction}
      submitLabel="Create institution"
      width="md"
    >
      <InstitutionFields idPrefix="institution-new" />
    </EntityDialog>
  );
}

export function UpdateInstitutionForm({ institution }: Readonly<{ institution: InstitutionRow }>) {
  return (
    <FormShell action={updateInstitutionAction} submitLabel="Save changes">
      <InstitutionFields idPrefix="institution-edit" institution={institution} />
    </FormShell>
  );
}
