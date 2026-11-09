/**
 * Session lifetime rules — pure time arithmetic over the `sessions` row
 * (`src/db/schema/identity.ts`), with no knowledge of how a row is read or written.
 *
 * Two clocks, as recorded in `adr/0005-auth-mechanism.md` decision 4:
 *
 * - **Idle timeout** — `expires_at` slides forward on activity (`SESSION_IDLE_MS` from the moment
 *   of renewal), so an abandoned browser dies after half an hour (`SECURITY.md` §10 "appropriate
 *   idle timeout").
 * - **Absolute cap** — `issued_at + SESSION_ABSOLUTE_MS`, regardless of activity, so a stolen
 *   cookie cannot be kept alive forever by a keep-alive ping.
 *
 * Renewal is throttled: an `auth()` call renews only when the row would otherwise be within
 * `SESSION_RENEW_AFTER_MS` of idling out. That bounds the write rate to one UPDATE per session
 * per five minutes while keeping the idle window honest.
 *
 * All functions take `now` as a parameter. Time is an argument, not a call — which is what makes
 * the boundary conditions (`now === expiresAt`, absolute cap reached mid-window) testable without
 * fake timers.
 */

/** Inactivity window: a session idle for longer than this is dead. */
export const SESSION_IDLE_MS = 30 * 60 * 1000; // 30 minutes

/** Hard ceiling: a session never outlives this, however active. */
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Minimum spacing between renewal writes. See the module comment. */
export const SESSION_RENEW_AFTER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Is the session live at `now`?
 *
 * Expiry boundaries are exclusive: a session whose `expiresAt` equals `now` is dead, not
 * "alive for zero more milliseconds".
 */
export function isSessionLive(issuedAt: Date, expiresAt: Date, now: Date): boolean {
  if (now.getTime() >= expiresAt.getTime()) return false; // idle expired
  if (now.getTime() >= issuedAt.getTime() + SESSION_ABSOLUTE_MS) return false; // absolute cap
  return true;
}

/**
 * Should a live session's expiry be pushed forward at `now`?
 *
 * True when the remaining idle window has shrunk below the idle window minus the renewal
 * spacing — i.e. the last renewal (or issue) was at least `SESSION_RENEW_AFTER_MS` ago.
 */
export function shouldRenew(now: Date, expiresAt: Date): boolean {
  const remaining = expiresAt.getTime() - now.getTime();
  return remaining <= SESSION_IDLE_MS - SESSION_RENEW_AFTER_MS;
}

/**
 * The new `expires_at` for a renewal at `now`: idle window from now, but never past the
 * absolute cap anchored at `issuedAt`.
 */
export function nextExpiry(issuedAt: Date, now: Date): Date {
  const idleBased = now.getTime() + SESSION_IDLE_MS;
  const absoluteCap = issuedAt.getTime() + SESSION_ABSOLUTE_MS;
  return new Date(Math.min(idleBased, absoluteCap));
}

/** The `expires_at` a freshly issued session gets at `now`. */
export function initialExpiry(now: Date): Date {
  return nextExpiry(now, now);
}
