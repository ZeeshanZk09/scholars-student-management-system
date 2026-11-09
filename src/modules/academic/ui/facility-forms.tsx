"use client";

/** Campus, building and floor creation (Phase 6 task 9). */
import { SelectField } from "@/components/shared/select-field";
import { TextField, TextareaField } from "@/components/shared/text-field";

import type { BuildingRow, CampusRow } from "@/modules/academic";

import { createBuildingAction, createCampusAction, createFloorAction } from "./actions";
import { EntityDialog } from "@/components/shared/entity-dialog";

export function CreateCampusDialog({ institutionId }: Readonly<{ institutionId: string }>) {
  return (
    <EntityDialog
      triggerLabel="Add campus"
      title="Add campus"
      description="A site the institution occupies. Buildings belong to a campus."
      action={createCampusAction}
      submitLabel="Create campus"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <TextField
        id="campus-name"
        name="name"
        label="Campus name"
        placeholder="Main campus"
        required
      />
      <TextareaField id="campus-address" name="address" label="Address" rows={3} />
      <TextField id="campus-phone" name="phone" label="Phone" type="tel" />
    </EntityDialog>
  );
}

export function CreateBuildingDialog({
  institutionId,
  campuses,
  defaultCampusId,
}: Readonly<{
  institutionId: string;
  campuses: readonly CampusRow[];
  defaultCampusId?: string | undefined;
}>) {
  return (
    <EntityDialog
      triggerLabel="Add building"
      title="Add building"
      description="A structure within a campus. Floors belong to a building."
      action={createBuildingAction}
      submitLabel="Create building"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <TextField
        id="building-name"
        name="name"
        label="Building name"
        placeholder="Block A"
        required
      />
      <SelectField
        id="building-campus"
        name="campusId"
        label="Campus"
        options={campuses.map((c) => ({ value: c.id, label: c.name }))}
        defaultValue={defaultCampusId}
        placeholder="None"
      />
    </EntityDialog>
  );
}

export function CreateFloorDialog({
  institutionId,
  buildings,
  defaultBuildingId,
}: Readonly<{
  institutionId: string;
  buildings: readonly BuildingRow[];
  /**
   * The building this dialog was opened from. Preselecting it is not a convenience: `buildingId`
   * is optional in the schema, so a floor saved without one has no parent card to render under —
   * the record exists and the page that created it cannot show it.
   */
  defaultBuildingId?: string | undefined;
}>) {
  const options = buildings.map((building) => ({
    value: building.id,
    label:
      building.campusName === null ? building.name : `${building.campusName} · ${building.name}`,
  }));

  return (
    <EntityDialog
      triggerLabel="Add floor"
      title="Add floor"
      description="A level within a building. Sections are assigned to floors."
      action={createFloorAction}
      submitLabel="Create floor"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="floor-name" name="name" label="Floor name" placeholder="Ground" required />
        <TextField
          id="floor-level"
          name="level"
          label="Level"
          type="number"
          inputMode="numeric"
          hint="0 = ground floor."
        />
      </div>
      <SelectField
        id="floor-building"
        name="buildingId"
        label="Building"
        options={options}
        defaultValue={defaultBuildingId}
        placeholder="None"
      />
    </EntityDialog>
  );
}
