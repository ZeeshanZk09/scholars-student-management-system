"use client";

/** Timetable slot creation (Phase 6 task 10). */
import { CheckboxField } from "@/components/shared/checkbox-field";
import { SelectField } from "@/components/shared/select-field";
import { TextField } from "@/components/shared/text-field";

import type { SessionRow } from "@/modules/academic";

import { createTimeSlotAction } from "./actions";
import { EntityDialog } from "@/components/shared/entity-dialog";

export function CreateTimeSlotDialog({
  institutionId,
  sessions,
}: Readonly<{ institutionId: string; sessions: readonly SessionRow[] }>) {
  const openSessions = sessions
    .filter((session) => session.closedAt === null)
    .map((session) => ({ value: session.id, label: session.name }));

  return (
    <EntityDialog
      triggerLabel="Add time slot"
      title="Add time slot"
      description="A named window in the school day — a lesson period or a break."
      action={createTimeSlotAction}
      submitLabel="Create time slot"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <TextField id="slot-name" name="name" label="Slot name" placeholder="Period 1" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="slot-startTime" name="startTime" label="Starts" type="time" required />
        <TextField id="slot-endTime" name="endTime" label="Ends" type="time" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="slot-sequence"
          name="sequence"
          label="Sequence"
          type="number"
          min={1}
          inputMode="numeric"
          hint="Order in the day."
          required
        />
        <SelectField
          id="slot-session"
          name="academicSessionId"
          label="Session"
          options={openSessions}
          placeholder="None"
          hint="Leave unset to apply the slot to every session."
        />
      </div>
      <CheckboxField
        id="slot-isBreak"
        name="isBreak"
        label="This slot is a break"
        hint="Breaks are not taught periods."
      />
    </EntityDialog>
  );
}
