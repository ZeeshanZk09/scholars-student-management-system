"use client";

/**
 * "Send me a reset link" form (Phase 3 task 10).
 *
 * The action's `done` state is enumeration-safe by construction — the application answers
 * `ok` for unknown addresses — so this component shows the same confirmation either way and
 * has no signal that could distinguish the two.
 */
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestPasswordResetAction, type FormState } from "./actions";

const INITIAL: FormState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, INITIAL);

  if (state.status === "done") {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4" aria-busy={pending}>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          disabled={pending}
        />
      </div>

      {state.status === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <a
        className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        href="/login"
      >
        Back to sign in
      </a>
    </form>
  );
}
