"use client";

/**
 * The shared error state (`PHASES.md` §13 task 12) — also the body of `(app)/error.tsx`.
 * Next 16 hands the boundary `retry` (not `reset`) on the second argument; every interactive
 * error boundary passes the raw segment error in for a digest readout.
 */
import { WarningCircleIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  readonly digest?: string;
  /** Re-runs the failed render. Optional — pure display usage (e.g. iframe surfaces) can omit it. */
  readonly retry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  description = "The page failed to load. If this keeps happening, contact your administrator.",
  digest,
  retry,
}: Readonly<ErrorStateProps>) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-none border border-dashed px-4 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="mb-1 flex size-10 items-center justify-center rounded-none bg-muted *:size-5 *:text-muted-foreground"
      >
        <WarningCircleIcon />
      </span>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="max-w-sm text-xs text-balance text-muted-foreground">{description}</p>
      {retry && (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={retry}>
          Try again
        </Button>
      )}
      {digest && <p className="mt-1 text-[10px] text-muted-foreground/70">Reference: {digest}</p>}
    </div>
  );
}
