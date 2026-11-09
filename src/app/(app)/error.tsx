"use client";

import { ErrorState } from "@/components/shared/error-state";

/**
 * The authenticated area's error boundary (`PHASES.md` §13 task 12). Next 16 hands `retry` (not
 * `reset`) as the second argument; `error.digest` gives support a correlation id to search logs by.
 */
export default function AppError({
  error,
  retry,
}: Readonly<{ error: Error & { digest?: string }; retry: () => void }>) {
  return (
    <ErrorState {...(error.digest !== undefined ? { digest: error.digest } : {})} retry={retry} />
  );
}
