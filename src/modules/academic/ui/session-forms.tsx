"use client";

/**
 * Academic session lifecycle controls (Phase 6 task 2: academic years).
 *
 * Three different shapes for three different consequences:
 *
 * - **Add session** is ordinary creation → dialog.
 * - **Make current** is a one-click, reversible pointer move → inline submit with its outcome
 *   rendered beside the button, so the list updates in place without a dialog to dismiss.
 * - **Close session** freezes the year's academic structure (`closeSession` refuses a session that
 *   is still current) → a dialog that names the session and says what closing does, which is the
 *   `DESIGN.md` §13 confirmation a consequential action owes the user.
 */
import { useFormActionState } from "@/components/shared/form-shell";
import { TextField } from "@/components/shared/text-field";
import { Button } from "@/components/ui/button";

import type { SessionRow } from "@/modules/academic";

import {
  closeSessionAction,
  createAcademicSessionAction,
  setCurrentSessionAction,
} from "./actions";
import { EntityDialog } from "@/components/shared/entity-dialog";
import { IDLE_FORM_STATE, type FormState } from "@/shared/forms";

export function CreateSessionDialog({ institutionId }: Readonly<{ institutionId: string }>) {
  return (
    <EntityDialog
      triggerLabel="Add session"
      title="Add academic session"
      description="A school year. Sessions become current individually; classes belong to one."
      action={createAcademicSessionAction}
      submitLabel="Create session"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <SessionFields idPrefix="session-new" />
    </EntityDialog>
  );
}

function SessionFields({ idPrefix }: Readonly<{ idPrefix: string }>) {
  return (
    <>
      <TextField
        id={`${idPrefix}-name`}
        name="name"
        label="Session name"
        placeholder="2026–27"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-startDate`}
          name="startDate"
          label="Starts"
          type="date"
          required
        />
        <TextField id={`${idPrefix}-endDate`} name="endDate" label="Ends" type="date" required />
      </div>
    </>
  );
}

/** The rendered outcome of a one-click inline action: success or refusal, next to the button. */
function InlineOutcome({ state }: Readonly<{ state: FormState }>) {
  if (state.status === "error" && state.message.length > 0) {
    return (
      <span role="alert" className="text-xs text-destructive">
        {state.message}
      </span>
    );
  }
  if (state.status === "done") {
    return (
      <span role="status" className="text-xs text-muted-foreground">
        {state.message}
      </span>
    );
  }
  return null;
}

export function SetCurrentSessionButton({
  institutionId,
  session,
}: Readonly<{ institutionId: string; session: SessionRow }>) {
  const [state, action, isPending] = useFormActionState(setCurrentSessionAction, IDLE_FORM_STATE);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="sessionId" value={session.id} />
      <Button
        type="submit"
        variant="outline"
        size="xs"
        disabled={isPending || session.isCurrent || session.closedAt !== null}
      >
        {isPending ? "Setting…" : session.isCurrent ? "Current session" : "Make current"}
      </Button>
      <InlineOutcome state={state} />
    </form>
  );
}

export function CloseSessionDialog({
  institutionId,
  session,
}: Readonly<{ institutionId: string; session: SessionRow }>) {
  return (
    <EntityDialog
      triggerLabel="Close"
      triggerVariant="destructive"
      title={`Close ${session.name}?`}
      description="A closed session becomes read-only and cannot be reopened or made current again. Set a successor as current first — the current session cannot be closed."
      action={closeSessionAction}
      submitLabel="Close session"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="sessionId" value={session.id} />
      <p className="text-xs text-muted-foreground">
        {session.classCount} classes · {session.groupCount} groups · {session.sectionCount} sections
      </p>
    </EntityDialog>
  );
}
