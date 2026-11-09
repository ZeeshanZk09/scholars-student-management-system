"use client";

/**
 * The dialog shell every "Add X" form in the admin UI uses (`DESIGN.md` §11: one visually
 * dominant primary action per page — the button in the page header opens this, rather than the
 * page carrying a permanently visible form next to its list). Shared chrome lives under
 * `components/shared` so any module can open a form dialog without reaching into another
 * module's internals (`src/modules/README.md` rule 3).
 *
 * It owns only chrome: title, description, open state, and closing itself when the wrapped
 * `FormShell` reports `done`. Validation, authorization and errors all stay where they belong —
 * in the server action, rendered by `FormShell` as prose the user can act on.
 *
 * Base UI unmounts a dialog's children when it closes, so reopening starts from `IDLE` instead of
 * resurrecting the previous submission's success message.
 */
import * as React from "react";

import { FormShell } from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { FormAction } from "@/shared/forms";

export interface EntityDialogProps {
  /** The primary action's label — an action phrase, not "Manage" (`DESIGN.md` §12). */
  readonly triggerLabel: string;
  readonly triggerAriaLabel?: string | undefined;
  readonly title: string;
  readonly description?: string;
  readonly action: FormAction;
  readonly submitLabel?: string;
  /**
   * Button variant for the trigger. Destructive confirmations open with `destructive` so the
   * control reads as consequential *before* the dialog explains the consequences
   * (`DESIGN.md` §13).
   */
  readonly triggerVariant?: "default" | "outline" | "destructive";
  /** Extra width for forms with side-by-side fields. */
  readonly width?: "sm" | "md";
  readonly children: React.ReactNode;
}

export function EntityDialog({
  triggerLabel,
  triggerAriaLabel,
  title,
  description,
  action,
  submitLabel,
  triggerVariant = "default",
  width = "sm",
  children,
}: Readonly<EntityDialogProps>) {
  const [open, setOpen] = React.useState(false);
  // Stable identity: an inline arrow would re-run the shell's success effect on every render.
  const close = React.useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={triggerVariant}
            aria-label={triggerAriaLabel}
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className={width === "md" ? "sm:max-w-md" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description !== undefined && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <FormShell action={action} submitLabel={submitLabel ?? triggerLabel} onSuccess={close}>
          {children}
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
