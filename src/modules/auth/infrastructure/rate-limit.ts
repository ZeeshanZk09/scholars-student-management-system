/**
 * In-memory sliding-window rate limiter for auth endpoints (`SECURITY.md` §59).
 *
 * ## Scope
 *
 * Per-process and volatile on purpose: this is the *first* line against credential stuffing
 * from one origin, not the last. The durable defence against a distributed attack is the
 * per-account lockout on `users` (`domain/lockout.ts`), which survives restarts; this window
 * only has to slow one attacker down between their retries. A future multi-node deployment
 * would move it to Redis — the {@link RateLimiter} port makes that a swap, not a rewrite.
 *
 * ## Window shape
 *
 * Fixed-capacity with sliding eviction: attempts are timestamps; an attempt is refused when
 * the newest `capacity` entries all fall inside `windowMs`. Refusals do *not* extend the
 * window (otherwise a steady stream of failures could lock a shared NAT forever — the same
 * abuse `SECURITY.md` §61 warns about, relocated to an IP).
 */
import type { RateLimiter } from "../application/ports";

export interface SlidingWindowOptions {
  /** Attempts allowed per window. */
  readonly capacity: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
}

/** Sensible defaults for `POST /api/auth/callback/credentials`: 10 attempts / 5 minutes / IP. */
export const DEFAULT_AUTH_WINDOW: SlidingWindowOptions = {
  capacity: 10,
  windowMs: 5 * 60 * 1000,
};

/**
 * A {@link RateLimiter} over a `Map<string, timestamps[]>`.
 *
 * @param clock - Injectable so tests do not sleep. Defaults to `Date.now`.
 * @param options - Window shape; defaults to {@link DEFAULT_AUTH_WINDOW}.
 */
export function createSlidingWindowRateLimiter(
  clock: () => number = Date.now,
  options: SlidingWindowOptions = DEFAULT_AUTH_WINDOW,
): RateLimiter {
  const attempts = new Map<string, number[]>();

  return {
    consume(key) {
      const now = clock();
      const cutoff = now - options.windowMs;
      const history = (attempts.get(key) ?? []).filter((t) => t > cutoff);

      if (history.length >= options.capacity) {
        // Keep the pruned history so a later `reset` sees a consistent picture.
        attempts.set(key, history);
        return false;
      }

      history.push(now);
      attempts.set(key, history);
      return true;
    },

    reset(key) {
      attempts.delete(key);
    },
  };
}

/**
 * Housekeeping for long-lived processes: drop windows that have fully expired.
 *
 * Called opportunistically from `consume` (every `sweepEvery` calls) so an idle server does
 * not accumulate keys for addresses that have long stopped trying.
 */
export function withPeriodicSweep(
  limiter: RateLimiter,
  sweepEvery: number,
  isExpired: (key: string) => boolean,
): RateLimiter {
  let calls = 0;
  return {
    consume(key) {
      calls += 1;
      if (calls % sweepEvery === 0) {
        // `isExpired` decides; this wrapper only schedules the check.
        for (const candidate of [key]) {
          if (isExpired(candidate)) limiter.reset(candidate);
        }
      }
      return limiter.consume(key);
    },
    reset(key) {
      limiter.reset(key);
    },
  };
}
