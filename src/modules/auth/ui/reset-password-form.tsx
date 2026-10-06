"use client";

/**
 * "Choose a new password" form (Phase 3 task 11).
 *
 * The single-use token rides in a hidden field; the server action validates policy *before*
 * consuming it (see `actions.ts`), so a rejected password can be corrected and resubmitted
 * against the same link.
 */
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { resetPasswordAction, type FormState } from "./actions";

const INITIAL: FormState = { status: "idle" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-4" aria-busy={pending}>
      <input type="hidden" name="token" value={token} />

      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          At least 12 characters. Avoid your name, email or common words.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmation">Confirm new password</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          disabled={pending}
        />
      </div>

      {state.status === "error" ? (
        <div role="alert" className="grid gap-1">
          <p className="text-xs text-destructive">{state.message}</p>
          {state.issues?.map((issue) => (
            <p key={issue} className="text-xs text-destructive">
              {issue}
            </p>
          ))}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
