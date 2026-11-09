"use client";

/**
 * The shared server-action form shell (`PHASES.md` §13): one place for `useActionState`, the
 * status/error/success rendering and the submit button, so a page writes a form and not the
 * same forty lines.
 *
 * The action contract lives in `@/shared/forms` — a server-safe module — and is *imported* here
 * rather than defined here, because the protocol belongs to the actions that produce it and the
 * shell merely renders it. Nothing in this file decides authorization; a forbidden command never
 * reaches the client as prose, it comes back as an `error` arm (`RULES.md` §19).
 */
import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { IDLE_FORM_STATE, type FormAction, type FormState } from "@/shared/forms";

export type { FormState };

/**
 * `useActionState` with the action contract already typed. Prefer {@link FormShell} unless the
 * page needs to render the form itself (a dialog body, a two-column layout with custom chrome).
 */
export function useFormActionState(action: FormAction, defaultState: FormState = IDLE_FORM_STATE) {
  return useActionState(action, defaultState);
}

/**
 * Wraps a server action in a `<form>` that renders its outcome.
 *
 * Every arm of `FormState` is rendered by status, and each is announced: `error` is a
 * `role="alert"` (interruptive — the submit failed), `done` is a `role="status"` (polite — a
 * confirmation, not an interruption). The issue list is only mounted when it actually has
 * entries; `issues.length && …` would otherwise hand React the number `0` and paint it.
 *
 * `onSuccess` fires once per transition into `done` — a dialog closing itself after a saved row,
 * for instance. It is deliberately *not* called for `idle`/`error`: a failed save must keep the
 * form (and whatever the user typed) on screen (`DESIGN.md` §16).
 */
export function FormShell({
  action,
  defaultState,
  children,
  submitLabel = "Save",
  onSuccess,
}: {
  action: FormAction;
  defaultState?: FormState;
  children: React.ReactNode;
  submitLabel?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useFormActionState(action, defaultState);

  const previousStatus = React.useRef(state.status);
  React.useEffect(() => {
    if (previousStatus.current !== "done" && state.status === "done") {
      onSuccess?.();
    }
    previousStatus.current = state.status;
  }, [state.status, onSuccess]);

  return (
    <form
      action={formAction}
      className="grid gap-4"
      aria-busy={isPending}
      onSubmit={(event) => {
        // A native `disabled` submit button would drop focus to `<body>` and never announce why
        // it went quiet. Instead the button stays present and focused; these guards swallow the
        // double-submits that `disabled` used to block (mouse clicks, Enter/Space on the
        // button, and Enter-in-field implicit submission all funnel through here).
        if (isPending) event.preventDefault();
      }}
    >
      {state.status === "error" && state.message.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      )}
      {state.status === "error" && state.issues !== undefined && state.issues.length > 0 && (
        <ul className="list-inside list-disc text-xs text-destructive">
          {state.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {state.status === "done" && (
        <p role="status" className="text-xs text-muted-foreground">
          {state.message}
        </p>
      )}
      {children}

      <Button
        type="submit"
        aria-disabled={isPending}
        tabIndex={isPending ? -1 : 0}
        className="mt-4"
        onClick={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        {isPending ? "Saving…" : submitLabel}
      </Button>
      {/* Polite live region: pending state is announced ("Saving") without the button ever
          leaving the tab order or losing focus. The `done`/`error` arms above announce the
          resolution. */}
      <p role="status" className="sr-only">
        {isPending ? "Saving" : ""}
      </p>
    </form>
  );
}
