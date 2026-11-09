/**
 * Email verification (Phase 3 task 9) — request and consume.
 *
 * ## Enumeration safety
 *
 * `requestEmailVerification` returns the *same* `ok` result whether or not the address exists.
 * Only the address's owner can ever see the mail, so nothing downstream distinguishes the two
 * cases; an attacker probing for registered accounts sees a uniform "check your inbox".
 *
 * ## One token per request, each single use
 *
 * Every request issues a fresh token rather than skipping when one is already live. A "resend"
 * that silently does nothing because a token from two minutes ago still exists is a broken UX
 * when the first mail never arrived, and multiple outstanding tokens cost nothing: each is
 * hashed, expiring, single-use, and the abuse surface is capped by the per-IP rate window.
 */
import { generateToken, hashToken, TOKEN_BYTES } from "../domain/security-token";
import { buildVerificationEmail } from "./email-templates";
import type { AuthStore, RateLimiter, RequestOrigin } from "./ports";

/** Verification links live for a day — long enough for a weekend invite, short enough to matter. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface RequestVerificationDeps {
  readonly store: AuthStore;
  readonly rateLimiter: RateLimiter;
  /** Origin of the app for building links — read from env at the framework edge, passed as data. */
  readonly appBaseUrl: string;
}

export interface RequestVerificationInput {
  readonly email: string;
  readonly now: Date;
  readonly origin: RequestOrigin;
}

/**
 * Queue a verification email for `email`.
 *
 * The caller must not branch on the return value in a way that differs by existence: the
 * result carries only `ok`/`rate_limited`, never "user not found".
 */
export async function requestEmailVerification(
  deps: RequestVerificationDeps,
  input: RequestVerificationInput,
): Promise<{ ok: true } | { ok: false; reason: "rate_limited" }> {
  const key = `verify:${input.origin.ipAddress ?? "unknown"}`;
  if (!deps.rateLimiter.consume(key)) {
    return { ok: false, reason: "rate_limited" };
  }

  const user = await deps.store.findForLogin(input.email.trim());
  // Unknown address: nothing to issue, same outward result as success.
  if (user === null || user.status !== "invited") {
    return { ok: true };
  }

  const token = generateToken();
  const event = await deps.store.issueSecurityEvent({
    userId: user.id,
    kind: "email_verification",
    tokenHash: hashToken(token),
    now: input.now,
    ttlMs: EMAIL_VERIFICATION_TTL_MS,
    ipAddress: input.origin.ipAddress,
    userAgent: input.origin.userAgent,
  });

  const email = buildVerificationEmail({
    url: `${deps.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`,
  });
  await deps.store.enqueueEmail({
    toUserId: user.id,
    toEmail: user.email,
    emailType: "email_verification",
    idempotencyKey: `email_verification:${event.id}`,
    subject: email.subject,
    bodyText: email.bodyText,
    now: input.now,
  });

  return { ok: true };
}

export interface VerifyEmailDeps {
  readonly store: AuthStore;
}

export type VerifyEmailResult =
  | { readonly ok: true; readonly userId: string }
  /** Unknown, expired, or already-consumed token — deliberately one outcome. */
  | { readonly ok: false; readonly reason: "invalid_token" };

/**
 * Consume a verification token and activate the account.
 *
 * Consumption is atomic in the store (single conditional UPDATE), so a replayed link reports
 * `invalid_token` even against two simultaneous requests.
 */
export async function verifyEmail(
  deps: VerifyEmailDeps,
  input: { token: string; now: Date },
): Promise<VerifyEmailResult> {
  const tokenHash = hashToken(input.token);
  const event = await deps.store.consumeSecurityEvent({
    kind: "email_verification",
    tokenHash,
    now: input.now,
  });
  if (event === null) {
    return { ok: false, reason: "invalid_token" };
  }

  // Idempotent at the account level: consuming a second valid token for an already-active
  // account succeeds (activateAccount returns false) — the link did its job either way.
  await deps.store.activateAccount({ userId: event.userId, now: input.now });
  return { ok: true, userId: event.userId };
}

/** Re-exported so callers do not need to know the token width. */
export { TOKEN_BYTES };
