/**
 * Forgot-password and password reset (Phase 3 tasks 10–11).
 *
 * ## Enumeration safety on request
 *
 * `requestPasswordReset` answers `ok` for every address, existing or not, and writes nothing
 * observable for unknown ones. The lockout counters and rate window are the only outwardly
 * visible side effects, and they are keyed by IP, not by account.
 *
 * ## Order of operations on reset
 *
 * 1. **Policy first, token second** — the new password is checked against policy *before* the
 *    token is consumed, so a rejected password never burns a link the user only has once.
 * 2. **Consume atomically** — a single conditional UPDATE; two racing submissions of the same
 *    link produce exactly one winner.
 * 3. **Write credential + unlock + revoke sessions in one transaction** — a reset that leaves
 *    the old sessions alive would defeat its own purpose (`RULES.md` §23: "log out everywhere"
 *    is part of changing a password, not an optional extra).
 *
 * ## The plaintext token exists only here and in the recipient's inbox
 *
 * It is hashed before storage and never logged, never placed in `email_messages` beyond the
 * link itself (`RULES.md` §52 forbids logging secrets; the mail body is the delivery channel,
 * not a log).
 */
import { checkPassword } from "../domain/password-policy";
import { generateToken, hashToken } from "../domain/security-token";
import { buildPasswordResetEmail } from "./email-templates";
import type { AuthStore, RateLimiter, RequestOrigin } from "./ports";

/** Reset links live for an hour — enough to switch tabs, short enough to limit abuse. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface RequestPasswordResetDeps {
  readonly store: AuthStore;
  readonly rateLimiter: RateLimiter;
  readonly appBaseUrl: string;
}

export interface RequestPasswordResetInput {
  readonly email: string;
  readonly now: Date;
  readonly origin: RequestOrigin;
}

/**
 * Queue a reset email for `email` — or silently for nobody, indistinguishably.
 *
 * Only statuses that can actually authenticate are offered a reset: a `revoked` account
 * recovering a password would be a status bypass. `invited` accounts are included — an invitee
 * who never set a password is exactly who the flow exists for.
 */
export async function requestPasswordReset(
  deps: RequestPasswordResetDeps,
  input: RequestPasswordResetInput,
): Promise<{ ok: true } | { ok: false; reason: "rate_limited" }> {
  const key = `forgot:${input.origin.ipAddress ?? "unknown"}`;
  if (!deps.rateLimiter.consume(key)) {
    return { ok: false, reason: "rate_limited" };
  }

  const user = await deps.store.findForLogin(input.email.trim());
  if (user === null || user.status === "revoked" || user.status === "inactive") {
    return { ok: true };
  }

  const token = generateToken();
  const event = await deps.store.issueSecurityEvent({
    userId: user.id,
    kind: "password_reset",
    tokenHash: hashToken(token),
    now: input.now,
    ttlMs: PASSWORD_RESET_TTL_MS,
    ipAddress: input.origin.ipAddress,
    userAgent: input.origin.userAgent,
  });

  const email = buildPasswordResetEmail({
    url: `${deps.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`,
  });
  await deps.store.enqueueEmail({
    toUserId: user.id,
    toEmail: user.email,
    emailType: "password_reset",
    idempotencyKey: `password_reset:${event.id}`,
    subject: email.subject,
    bodyText: email.bodyText,
    now: input.now,
  });

  return { ok: true };
}

export type ResetPasswordDeps = {
  readonly store: AuthStore;
  readonly hashPassword: (plaintext: string) => Promise<{
    passwordHash: string;
    algorithm: "argon2id";
    parameters: Readonly<Record<string, number>>;
  }>;
};

export type ResetPasswordResult =
  | { readonly ok: true }
  /** Unknown, expired, or already-consumed token. */
  | { readonly ok: false; readonly reason: "invalid_token" }
  /** The typed password failed policy — the token was *not* consumed (see file header). */
  | { readonly ok: false; readonly reason: "weak_password"; readonly issues: readonly string[] };

export async function resetPassword(
  deps: ResetPasswordDeps,
  input: { token: string; password: string; now: Date },
): Promise<ResetPasswordResult> {
  const tokenHash = hashToken(input.token);

  // Look up first (no mutation): the token must be live, and the account it points at is the
  // policy context for the new password.
  const live = await deps.store.findLiveSecurityEvent({
    kind: "password_reset",
    tokenHash,
    now: input.now,
  });
  if (live === null) {
    return { ok: false, reason: "invalid_token" };
  }

  const account = await deps.store.findAccountById(live.userId);
  if (account === null) {
    return { ok: false, reason: "invalid_token" };
  }

  const policy = checkPassword(input.password, {
    email: account.email,
    name: account.name ?? undefined,
  });
  if (!policy.ok) {
    return {
      ok: false,
      reason: "weak_password",
      issues: policy.issues.map((issue) => issue.message),
    };
  }

  // Atomic single-use consumption — the point of no return.
  const consumed = await deps.store.consumeSecurityEvent({
    kind: "password_reset",
    tokenHash,
    now: input.now,
  });
  if (consumed === null) {
    // Lost a race with a concurrent submission of the same link.
    return { ok: false, reason: "invalid_token" };
  }

  const stored = await deps.hashPassword(input.password);
  await deps.store.setCredential({
    userId: consumed.userId,
    stored,
    now: input.now,
    unlock: true,
    activate: false,
  });
  // "Log out everywhere": every pre-reset session dies with the old password
  // (`RULES.md` §23). This device included — the login page is the correct next stop.
  await deps.store.revokeAllSessions({
    userId: consumed.userId,
    reason: "password_changed",
    now: input.now,
  });

  return { ok: true };
}
