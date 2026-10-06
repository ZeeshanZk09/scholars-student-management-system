/**
 * Sign-in — Phase 3 task 6, the application-layer half.
 *
 * ## Enumeration safety (`SECURITY.md` §62)
 *
 * An unknown email and a known email with a wrong password produce the *same* result
 * (`invalid_credentials`) and the same observable work profile: no lock message, no status
 * message, no counter written for the unknown address. Account-specific facts — "you are
 * locked", "you must verify your email", "this account is disabled" — are only revealed after
 * the caller has *proved ownership* by presenting the correct password. A stranger probing
 * `ali@x.com` learns nothing; the real Ali, mistyped-password-free, learns exactly what to fix.
 *
 * ## Why password verification precedes the lock check
 *
 * Rejecting a locked account before Argon2 would let anyone who knows an email keep a victim
 * locked indefinitely *and* confirm the account exists. Verifying first means the lock is only
 * ever reported to someone who already holds the password — the only audience for whom the
 * message is useful rather than exploitable.
 */
import { isLocked, lockoutAfterFailure } from "../domain/lockout";
import type { AuthStore, IssuedSession, RateLimiter, RequestOrigin } from "./ports";

export type SignInFailureReason =
  /** Unknown email, wrong password, or no credential — deliberately indistinguishable. */
  | "invalid_credentials"
  /** The per-IP window for this endpoint is exhausted. */
  | "rate_limited"
  /** Correct password, but the temporary lockout is still active. */
  | "account_locked"
  /** Correct password; the account has never completed email verification. */
  | "email_verification_required"
  /** Correct password; the account is inactive, suspended or revoked. */
  | "account_disabled";

export type SignInResult =
  | {
      readonly ok: true;
      readonly user: { readonly id: string; readonly email: string; readonly name: string | null };
      readonly session: IssuedSession;
    }
  | {
      readonly ok: false;
      readonly reason: SignInFailureReason;
      /** Only meaningful for `account_locked` — how long until the account unlocks. */
      readonly retryAfterMs?: number;
      /** Only meaningful for `account_disabled`. */
      readonly status?: "inactive" | "suspended" | "revoked";
    };

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly now: Date;
  readonly origin: RequestOrigin;
}

export interface SignInDeps {
  readonly store: AuthStore;
  readonly rateLimiter: RateLimiter;
}

/** Window identity for the IP-level throttle (`SECURITY.md` §59). */
const rateKey = (origin: RequestOrigin): string => `login:${origin.ipAddress ?? "unknown"}`;

/**
 * Authenticate and, on success, mint a `sessions` row.
 *
 * The returned `IssuedSession.sid` is meant to travel into the Auth.js JWT (see `src/auth.ts`);
 * the plaintext never touches storage.
 */
export async function signIn(deps: SignInDeps, input: SignInInput): Promise<SignInResult> {
  const { store, rateLimiter } = deps;

  if (!rateLimiter.consume(rateKey(input.origin))) {
    return { ok: false, reason: "rate_limited" };
  }

  const user = await store.findForLogin(input.email.trim());
  if (user === null) {
    // No row to update, so an attacker cannot distinguish "no such user" from "wrong password"
    // by watching `failed_login_count` — there is nothing to watch.
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordOk = await store.verifyCredential({ userId: user.id, plaintext: input.password });
  if (!passwordOk) {
    const next = lockoutAfterFailure(user.failedLoginCount + 1, input.now);
    await store.recordFailedLogin({
      userId: user.id,
      failedCount: next.failedCount,
      lockedUntil: next.lockedUntil,
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  // From here the caller holds the password: account facts are safe to disclose.
  if (isLocked(user.lockedUntil, input.now)) {
    const retryAfterMs = (user.lockedUntil?.getTime() ?? input.now.getTime()) - input.now.getTime();
    return { ok: false, reason: "account_locked", retryAfterMs: Math.max(retryAfterMs, 0) };
  }
  if (user.status === "invited") {
    return { ok: false, reason: "email_verification_required" };
  }
  if (user.status !== "active") {
    return { ok: false, reason: "account_disabled", status: user.status };
  }

  await store.recordSuccessfulLogin({ userId: user.id, now: input.now });
  const session = await store.createSession({
    userId: user.id,
    now: input.now,
    ipAddress: input.origin.ipAddress,
    userAgent: input.origin.userAgent,
  });
  rateLimiter.reset(rateKey(input.origin));

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    session,
  };
}
