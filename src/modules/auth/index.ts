/**
 * The auth module's public surface (`src/modules/README.md`: cross-module access goes through
 * this file only).
 *
 * ## Composition, not re-export
 *
 * This file *wires* the layers: it instantiates the Drizzle store, the in-memory rate window
 * and the environment readers, then hands them to the application use cases so consumers see
 * one-call functions and never assemble dependencies themselves. Framework glue (`src/auth.ts`,
 * server actions, route handlers) imports from here; nothing outside the module reaches into
 * `application/`, `domain/` or `infrastructure/`.
 *
 * The rate limiter is deliberately a module-level singleton: its window must be shared by
 * every login attempt in the process. Under `next dev` hot reload the module re-evaluates and
 * the window resets — a development-only inconvenience; production evaluates this once.
 */
import { SESSION_ABSOLUTE_MS } from "./domain/session-policy";
import { requestEmailVerification, verifyEmail } from "./application/email-verification";
import {
  PASSWORD_RESET_TTL_MS,
  requestPasswordReset,
  resetPassword,
} from "./application/password-reset";
import { signIn, type SignInResult } from "./application/sign-in";
import type { RequestOrigin } from "./application/ports";
import { drizzleAuthStore } from "./infrastructure/drizzle-store";
import { readAppBaseUrl, readAuthSecret } from "./infrastructure/env";
import { createSlidingWindowRateLimiter } from "./infrastructure/rate-limit";
import { hashPassword, verifyPassword } from "./infrastructure/password";

const store = drizzleAuthStore;
const rateLimiter = createSlidingWindowRateLimiter();

/** Session cookie / JWT lifetime, in seconds, for Auth.js configuration. */
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_ABSOLUTE_MS / 1000);

/** How long a password-reset link stays valid — exported for UI copy. */
export const PASSWORD_RESET_TTL_MINUTES = Math.floor(PASSWORD_RESET_TTL_MS / 60_000);

/**
 * Validate `AUTH_SECRET` — called by `src/auth.ts` at configuration time so a missing secret
 * fails loudly at startup instead of at the first sign-in.
 */
export function authSecret(): string {
  return readAuthSecret();
}

/** The origin used in verification/reset email links. */
export function appBaseUrl(): string {
  return readAppBaseUrl();
}

/** Authenticate (Phase 3 task 6). See `application/sign-in.ts` for the failure taxonomy. */
export function authenticate(input: {
  email: string;
  password: string;
  now: Date;
  origin: RequestOrigin;
}): Promise<SignInResult> {
  return signIn({ store, rateLimiter }, input);
}

/** Queue a password-reset email — always answers `ok` for unknown addresses (§62). */
export function requestPasswordResetEmail(input: {
  email: string;
  now: Date;
  origin: RequestOrigin;
}): Promise<{ ok: true } | { ok: false; reason: "rate_limited" }> {
  return requestPasswordReset({ store, rateLimiter, appBaseUrl: appBaseUrl() }, input);
}

/** Consume a reset token: policy → atomic consume → credential + unlock + revoke sessions. */
export function completePasswordReset(input: {
  token: string;
  password: string;
  now: Date;
}): ReturnType<typeof resetPassword> {
  return resetPassword({ store, hashPassword }, input);
}

/** Queue an email-verification message for an invited account. */
export function sendEmailVerification(input: {
  email: string;
  now: Date;
  origin: RequestOrigin;
}): Promise<{ ok: true } | { ok: false; reason: "rate_limited" }> {
  return requestEmailVerification({ store, rateLimiter, appBaseUrl: appBaseUrl() }, input);
}

/** Consume a verification token and activate the account. */
export function completeEmailVerification(input: {
  token: string;
  now: Date;
}): ReturnType<typeof verifyEmail> {
  return verifyEmail({ store }, input);
}

/**
 * The revocation gate used by the Auth.js `jwt` callback on every session read: `null` means
 * "no live session" (expired, revoked, or the account is no longer active).
 */
export function validateSession(input: { sid: string; now: Date }) {
  return store.validateSession(input);
}

/** Revoke one session — the `events.signOut` hook. Returns false when it was already gone. */
export function revokeSession(input: { sid: string; now: Date }) {
  return store.revokeSession({ ...input, reason: "logout" });
}

/** Credential verification for callers that own their own flow (e.g. future MFA step-up). */
export { hashPassword, verifyPassword };
