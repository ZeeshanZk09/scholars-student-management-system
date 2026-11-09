/**
 * Pure academic rules: slug minting and the session lifecycle guards.
 *
 * Anything that needs a database (existence, uniqueness, ownership) stays in the service; the
 * functions here are the decision rules around it, so they are unit-testable without a store.
 *
 * `slugify`/`uniqueSlug` moved to `@/shared/validation/slug` when the student module (Phase 7)
 * became a second consumer; they are re-exported here so existing academic imports are unchanged.
 */
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

export { slugify, uniqueSlug } from "@/shared/validation/slug";

/** A session row narrowed to what the lifecycle guards read. */
export interface SessionLifecycle {
  readonly id: string;
  readonly isCurrent: boolean;
  readonly closedAt: Date | null;
}

/** RULES §44: closed sessions are read-only history. Holds for any write under the session. */
export function assertSessionOpen(
  session: SessionLifecycle | null,
  subject = "this session",
): asserts session is SessionLifecycle {
  if (session === null) {
    throw new NotFoundError(`${subject} does not exist.`);
  }
  if (session.closedAt !== null) {
    throw new BusinessRuleError(`Cannot modify a closed session.`, {
      userMessage: `This session has been closed and is now read-only history. Reopen it before making changes.`,
    });
  }
}

/** Guarantee the target exists before a state change. */
export function assertSessionExists(
  session: SessionLifecycle | null,
  subject = "Session",
): asserts session is SessionLifecycle {
  if (session === null) {
    throw new NotFoundError(`${subject} does not exist.`);
  }
}

/** A session cannot be closed while it is still the current one — close the successor first. */
export function assertCanClose(session: SessionLifecycle | null): void {
  assertSessionExists(session);
  if (session.closedAt !== null) {
    throw new ConflictError("This session is already closed.");
  }
  if (session.isCurrent) {
    throw new BusinessRuleError("Cannot close the current session.", {
      userMessage: `Set a successor as the current session before closing this one.`,
    });
  }
}

/** A session cannot become current again once closed. */
export function assertCanMakeCurrent(session: SessionLifecycle | null): void {
  assertSessionExists(session);
  if (session.closedAt !== null) {
    throw new BusinessRuleError("Cannot reopen a closed session.", {
      userMessage: `This session is closed and read-only. It cannot be made current again.`,
    });
  }
}
