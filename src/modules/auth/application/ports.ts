/**
 * The ports through which authentication use cases reach the outside world
 * (`src/modules/README.md`: `application/` may import `domain/` and `shared/`, never
 * `infrastructure/` — so every effectful dependency is an interface defined here and
 * implemented by `infrastructure/drizzle-store.ts`, composed in `index.ts`).
 *
 * Nothing in this file mentions Drizzle, Argon2, or Next.js. The use cases decide *what* must
 * happen; the adapters decide *how*.
 */
import type { StoredPassword } from "../domain/credential";

/** The account facts a login decision needs — deliberately without the credential hash. */
export interface LoginUserRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly status: "invited" | "active" | "inactive" | "suspended" | "revoked";
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

/** Why a session row was revoked — mirrors the `sessions.revoked_reason` values. */
export type RevokeReason = "logout" | "password_changed" | "admin_revoked" | "rotated";

/** A freshly minted session. `sid` is the plaintext identifier that goes into the JWT only. */
export interface IssuedSession {
  readonly sid: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

/** A session row proven live at validation time. */
export interface LiveSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export type SecurityEventKind = "email_verification" | "password_reset";

/** A live (unconsumed, unexpired) single-use token row, as seen before consumption. */
export interface LiveSecurityEvent {
  readonly id: string;
  readonly userId: string;
}

export interface IssueSecurityEventInput {
  readonly userId: string;
  readonly kind: SecurityEventKind;
  /**
   * SHA-256 of the plaintext token — computed by the *caller*, which also puts the plaintext
   * into the outgoing email link. The store must never mint its own token: the link and the
   * stored hash would then disagree and no emailed link could ever validate.
   */
  readonly tokenHash: string;
  readonly now: Date;
  /** Time-to-live for the token, in milliseconds. */
  readonly ttlMs: number;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

export interface EnqueueEmailInput {
  readonly toUserId: string;
  readonly toEmail: string;
  readonly emailType: "email_verification" | "password_reset";
  /** Unique per business event (`RULES.md` §47). */
  readonly idempotencyKey: string;
  readonly subject: string;
  readonly bodyText: string;
  readonly now: Date;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly now: Date;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

/** Facts the login use case needs about an attempt's origin, for the session row / rate key. */
export interface RequestOrigin {
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

/**
 * Every effectful dependency of the authentication use cases.
 *
 * One interface rather than five: the adapters share a single transaction boundary (a password
 * reset consumes a token, rewrites the credential, and revokes sessions — three tables that must
 * move together), and splitting them into independent ports would make that transaction
 * impossible to express without leaking a unit-of-work parameter into the application layer.
 */
export interface AuthStore {
  /** Case-insensitive email lookup with the facts login needs. */
  findForLogin(email: string): Promise<LoginUserRecord | null>;

  /** Same record by id — password reset works from the token's user, not from an email input. */
  findAccountById(userId: string): Promise<LoginUserRecord | null>;

  /** Argon2id verification against `user_credentials`. False for missing/corrupt hashes. */
  verifyCredential(input: { userId: string; plaintext: string }): Promise<boolean>;

  /**
   * Verify a plaintext against a fixed, never-matching Argon2id hash — the unknown-email arm of
   * `sign-in` spends the same work as a real verification so the two are indistinguishable by
   * timing (`SECURITY.md` §62). The result is always discarded; the cost is the point.
   */
  verifyDummyCredential(plaintext: string): Promise<boolean>;

  /** Reset the failure counters and stamp `last_login_at`. */
  recordSuccessfulLogin(input: { userId: string; now: Date }): Promise<void>;

  /** Persist the post-failure counter and optional temporary lock. */
  recordFailedLogin(input: {
    userId: string;
    failedCount: number;
    lockedUntil: Date | null;
  }): Promise<void>;

  /** Mint a `sessions` row. The returned `sid` is stored only as its SHA-256. */
  createSession(input: CreateSessionInput): Promise<IssuedSession>;

  /**
   * The revocation gate (`RULES.md` §23`): find the row for `sid`, reject it unless it is
   * unrevoked and inside both expiry windows, and slide `expires_at` forward when due.
   * Returns `null` for every dead-session case — the caller does not learn which.
   */
  validateSession(input: { sid: string; now: Date }): Promise<LiveSession | null>;

  /** Mark one session revoked. Returns `false` when there was nothing to revoke. */
  revokeSession(input: { sid: string; reason: RevokeReason; now: Date }): Promise<boolean>;

  /** "Log out everywhere" / password-change invalidation. Returns rows affected. */
  revokeAllSessions(input: {
    userId: string;
    reason: RevokeReason;
    now: Date;
    /** Keep this `sid` alive (the session that is performing the change). */
    exceptSid?: string | undefined;
  }): Promise<number>;

  /** Find an unconsumed, unexpired token row by hash (kind-scoped). */
  findLiveSecurityEvent(input: {
    kind: SecurityEventKind;
    tokenHash: string;
    now: Date;
  }): Promise<LiveSecurityEvent | null>;

  /** Insert a single-use token row. Returns its id for the outbox idempotency key. */
  issueSecurityEvent(input: IssueSecurityEventInput): Promise<{ id: string }>;

  /**
   * Atomically consume a token (`consumed_at IS NULL AND expires_at > now`).
   * Returns `null` if it was already used, expired, or never existed.
   */
  consumeSecurityEvent(input: {
    kind: SecurityEventKind;
    tokenHash: string;
    now: Date;
  }): Promise<LiveSecurityEvent | null>;

  /**
   * Write the new hash to `user_credentials` and, in the same transaction, optionally clear
   * the lockout/failure counters and move `invited → active` (an email-proving flow).
   */
  setCredential(input: {
    userId: string;
    stored: StoredPassword;
    now: Date;
    unlock: boolean;
    activate: boolean;
  }): Promise<void>;

  /**
   * Promote `invited → active` without touching any credential — email verification where the
   * password arrives separately (`setCredential`'s `activate` covers the combined flow).
   * Returns `false` when the account was not in `invited` state.
   */
  activateAccount(input: { userId: string; now: Date }): Promise<boolean>;

  /** Queue one message in the `email_messages` outbox. */
  enqueueEmail(input: EnqueueEmailInput): Promise<void>;
}

/**
 * Sliding-window attempt throttle for sensitive endpoints (`SECURITY.md` §59).
 * In-memory and per-process: a school deployment is single-node, and the durable defence
 * against credential attacks is the DB lockout policy, not this window.
 */
export interface RateLimiter {
  /** Record an attempt for `key`; `false` when the window is exhausted. */
  consume(key: string): boolean;
  /** Forget the window for `key` (used after a successful authentication). */
  reset(key: string): void;
}
