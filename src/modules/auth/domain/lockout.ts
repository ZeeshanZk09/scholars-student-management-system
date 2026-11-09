/**
 * Failed-login throttling — pure policy, per `SECURITY.md` §60/§61.
 *
 * §61 warns that "permanent lockout after a small number of failed attempts can itself be an
 * abuse vector" — anyone who knows a victim's email could lock them out. So a lock here is
 * always temporary, escalates only as far as the attempt count, and is cleared by a successful
 * login, a password reset, or an administrator.
 *
 * The counters live on `users.failed_login_count` / `users.locked_until` (`identity.ts`), which
 * is why this module deals in "the count after this failure" rather than in per-IP windows: the
 * IP-level defence is a separate, in-memory concern (see `infrastructure/rate-limit.ts`).
 */

/** Failures allowed before the first temporary lock. */
export const FREE_ATTEMPTS = 5;

/** First lock duration, once {@link FREE_ATTEMPTS} is exceeded. */
export const FIRST_LOCK_MS = 5 * 60 * 1000; // 5 minutes

/** Second lock duration, once double the free attempts is exceeded. */
export const SECOND_LOCK_MS = 15 * 60 * 1000; // 15 minutes

export interface LockoutState {
  /** The failure count to persist (already incremented). */
  readonly failedCount: number;
  /** When the account unlocks, or `null` when this failure does not lock it. */
  readonly lockedUntil: Date | null;
}

/**
 * The state to persist after a failed attempt, given the count *including* that attempt.
 *
 * The deliberate ceiling: after the second lock the account keeps locking for
 * {@link SECOND_LOCK_MS} but never for longer — escalating forever would recreate the
 * permanent-lockout abuse §61 forbids, and recovery stays with password reset / admin.
 */
export function lockoutAfterFailure(failedCount: number, now: Date): LockoutState {
  if (failedCount >= FREE_ATTEMPTS * 2) {
    return { failedCount, lockedUntil: new Date(now.getTime() + SECOND_LOCK_MS) };
  }
  if (failedCount >= FREE_ATTEMPTS) {
    return { failedCount, lockedUntil: new Date(now.getTime() + FIRST_LOCK_MS) };
  }
  return { failedCount, lockedUntil: null };
}

/** Is the account locked at `now`? `lockedUntil === null` means never / cleared. */
export function isLocked(lockedUntil: Date | null | undefined, now: Date): boolean {
  return lockedUntil !== null && lockedUntil !== undefined && now.getTime() < lockedUntil.getTime();
}
