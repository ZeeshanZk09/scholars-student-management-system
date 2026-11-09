/**
 * In-memory {@link AuthStore} and {@link RateLimiter} doubles for application-layer tests.
 *
 * These are *semantic* fakes, not stubs: session liveness uses the real domain policy, token
 * consumption is guarded exactly as the store's conditional UPDATE is, and password
 * verification compares against a seeded value. A test that passes here therefore exercises
 * the same decision logic production runs — only the SQL is skipped.
 */
import { isSessionLive, nextExpiry, shouldRenew } from "../../domain/session-policy";
import type { PasswordCheck } from "../../domain/password-policy";
import type {
  AuthStore,
  CreateSessionInput,
  EnqueueEmailInput,
  IssuedSession,
  LiveSession,
  LoginUserRecord,
  RateLimiter,
  RevokeReason,
} from "../ports";
import type { StoredPassword } from "../../domain/credential";

interface FakeSession {
  sid: string;
  sessionId: string;
  userId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RevokeReason | null;
}

interface FakeSecurityEvent {
  id: string;
  userId: string;
  kind: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface FakeAuthStore extends AuthStore {
  /** Accounts in the directory, keyed by id. */
  readonly users: Map<string, LoginUserRecord>;
  /** Plaintext stand-ins for hashes — the fake's "verification". */
  readonly credentials: Map<string, string>;
  readonly sessions: FakeSession[];
  readonly securityEvents: FakeSecurityEvent[];
  readonly emails: EnqueueEmailInput[];
  readonly recorded: {
    successLogins: { userId: string; now: Date }[];
    failedLogins: { userId: string; failedCount: number; lockedUntil: Date | null }[];
    setCredentials: { userId: string; unlock: boolean; activate: boolean }[];
    revocations: { userId: string; reason: RevokeReason; exceptSid?: string | undefined }[];
    activations: string[];
  };
}

/** Register an account; returns it for further seeding. */
export function addUser(store: FakeAuthStore, user: LoginUserRecord): LoginUserRecord {
  store.users.set(user.id, user);
  return user;
}

/** Seed the credential the fake will accept for `userId`. */
export function seedPassword(store: FakeAuthStore, userId: string, plaintext: string): void {
  store.credentials.set(userId, plaintext);
}

/** Every session currently valid at `now` — convenience for assertions. */
export function liveSessions(store: FakeAuthStore, now: Date): FakeSession[] {
  return store.sessions.filter(
    (s) => s.revokedAt === null && isSessionLive(s.issuedAt, s.expiresAt, now),
  );
}

export function fakeAuthStore(): FakeAuthStore {
  const store: FakeAuthStore = {
    users: new Map(),
    credentials: new Map(),
    sessions: [],
    securityEvents: [],
    emails: [],
    recorded: {
      successLogins: [],
      failedLogins: [],
      setCredentials: [],
      revocations: [],
      activations: [],
    },

    async findForLogin(email) {
      const needle = email.trim().toLowerCase();
      for (const user of store.users.values()) {
        if (user.email.toLowerCase() === needle) return user;
      }
      return null;
    },

    async findAccountById(userId) {
      return store.users.get(userId) ?? null;
    },

    async verifyCredential({ userId, plaintext }) {
      return store.credentials.get(userId) === plaintext;
    },

    async verifyDummyCredential() {
      // The real store burns 64 MiB of Argon2 here; a fake never matches and has no work cost.
      return false;
    },

    async recordSuccessfulLogin({ userId, now }) {
      store.recorded.successLogins.push({ userId, now });
      const user = store.users.get(userId);
      if (user) {
        store.users.set(userId, { ...user, failedLoginCount: 0, lockedUntil: null });
      }
    },

    async recordFailedLogin({ userId, failedCount, lockedUntil }) {
      store.recorded.failedLogins.push({ userId, failedCount, lockedUntil });
      const user = store.users.get(userId);
      if (user) store.users.set(userId, { ...user, failedLoginCount: failedCount, lockedUntil });
    },

    async createSession({ userId, now }: CreateSessionInput): Promise<IssuedSession> {
      const n = store.sessions.length + 1;
      const session: FakeSession = {
        sid: `sid-${n}`,
        sessionId: `session-${n}`,
        userId,
        issuedAt: now,
        expiresAt: nextExpiry(now, now), // initialExpiry === min(now+idle, now+absolute) from now
        revokedAt: null,
        revokedReason: null,
      };
      store.sessions.push(session);
      return { sid: session.sid, sessionId: session.sessionId, expiresAt: session.expiresAt };
    },

    async validateSession({ sid, now }) {
      const session = store.sessions.find((s) => s.sid === sid && s.revokedAt === null);
      if (!session) return null;
      // Mirror the store's status join: a non-active account has no live session.
      if (store.users.get(session.userId)?.status !== "active") return null;
      if (!isSessionLive(session.issuedAt, session.expiresAt, now)) return null;
      if (shouldRenew(now, session.expiresAt)) {
        session.expiresAt = nextExpiry(session.issuedAt, now);
      }
      const live: LiveSession = {
        sessionId: session.sessionId,
        userId: session.userId,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      };
      return live;
    },

    async revokeSession({ sid, reason, now }) {
      const session = store.sessions.find((s) => s.sid === sid && s.revokedAt === null);
      if (!session) return false;
      session.revokedAt = now;
      session.revokedReason = reason;
      return true;
    },

    async revokeAllSessions({ userId, reason, now, exceptSid }) {
      store.recorded.revocations.push({ userId, reason, exceptSid });
      let count = 0;
      for (const session of store.sessions) {
        if (session.userId !== userId || session.revokedAt !== null) continue;
        if (exceptSid !== undefined && session.sid === exceptSid) continue;
        session.revokedAt = now;
        session.revokedReason = reason;
        count += 1;
      }
      return count;
    },

    async findLiveSecurityEvent({ kind, tokenHash, now }) {
      const event = store.securityEvents.find(
        (e) =>
          e.kind === kind &&
          e.tokenHash === tokenHash &&
          e.consumedAt === null &&
          e.expiresAt.getTime() > now.getTime(),
      );
      return event ? { id: event.id, userId: event.userId } : null;
    },

    async issueSecurityEvent({ userId, kind, tokenHash, now, ttlMs, ipAddress, userAgent }) {
      const id = `event-${store.securityEvents.length + 1}`;
      store.securityEvents.push({
        id,
        userId,
        kind,
        tokenHash,
        expiresAt: new Date(now.getTime() + ttlMs),
        consumedAt: null,
      });
      void ipAddress;
      void userAgent;
      return { id };
    },

    async consumeSecurityEvent({ kind, tokenHash, now }) {
      const event = store.securityEvents.find(
        (e) =>
          e.kind === kind &&
          e.tokenHash === tokenHash &&
          e.consumedAt === null &&
          e.expiresAt.getTime() > now.getTime(),
      );
      if (!event) return null;
      // Atomicity stand-in: the row is consumed here, exactly once, before returning.
      event.consumedAt = now;
      return { id: event.id, userId: event.userId };
    },

    async setCredential({ userId, stored, now, unlock, activate }) {
      store.recorded.setCredentials.push({ userId, unlock, activate });
      store.credentials.set(userId, stored.passwordHash);
      const user = store.users.get(userId);
      if (!user) return;
      const next: LoginUserRecord = { ...user };
      if (unlock) {
        (next as { failedLoginCount: number }).failedLoginCount = 0;
        (next as { lockedUntil: Date | null }).lockedUntil = null;
      }
      if (activate && next.status === "invited") {
        (next as { status: LoginUserRecord["status"] }).status = "active";
      }
      store.users.set(userId, next);
      void now;
    },

    async activateAccount({ userId }) {
      store.recorded.activations.push(userId);
      const user = store.users.get(userId);
      if (!user || user.status !== "invited") return false;
      store.users.set(userId, { ...user, status: "active" } as LoginUserRecord);
      return true;
    },

    async enqueueEmail(input) {
      // Mirror the unique-index: a duplicate idempotency key is silently dropped.
      if (store.emails.some((e) => e.idempotencyKey === input.idempotencyKey)) return;
      store.emails.push(input);
    },
  };
  return store;
}

/** A limiter whose window can be toggled per test. */
export function fakeRateLimiter(
  allowed = true,
): RateLimiter & { resets: string[]; allowed: boolean } {
  const limiter = {
    allowed,
    resets: [] as string[],
    consume: () => limiter.allowed,
    reset: (key: string) => void limiter.resets.push(key),
  };
  return limiter;
}

/** Seed a store the way `setCredential` would, without going through the method. */
export function seedStoredPassword(
  store: FakeAuthStore,
  userId: string,
  stored: Pick<StoredPassword, "passwordHash">,
): void {
  store.credentials.set(userId, stored.passwordHash);
}

/** Helper for building a policy check expectation in tests. */
export type { PasswordCheck };
