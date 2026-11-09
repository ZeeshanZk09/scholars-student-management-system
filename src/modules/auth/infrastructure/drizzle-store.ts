/**
 * The Drizzle implementation of {@link AuthStore} — the only file in the auth module that
 * imports `@/db/client` or the table objects.
 *
 * ## Why the live-session check is a single read-then-write
 *
 * `validateSession` reads the row and, when the sliding window is due, writes the renewed
 * `expires_at`. Between the two, a concurrent logout on the same cookie could revoke the row and
 * the renewal would resurrect its expiry — so every renewal is guarded by
 * `where id = ? and revoked_at is null`, and a renewal that matches no row is treated exactly
 * like a dead session: the caller gets `null`, and Auth.js drops the user.
 *
 * ## Why consumption is one UPDATE
 *
 * `consumeSecurityEvent` is a single conditional `UPDATE … RETURNING`. Single-use is therefore a
 * database guarantee, not a read-then-write race: two concurrent requests with the same token
 * cannot both observe `consumed_at is null`, because the predicate is re-evaluated on the row
 * lock the first UPDATE takes.
 */
import { and, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { emailMessages, securityEvents, sessions, userCredentials, users } from "@/db/schema";

import type {
  AuthStore,
  CreateSessionInput,
  EnqueueEmailInput,
  IssueSecurityEventInput,
  IssuedSession,
  LiveSession,
} from "../application/ports";
import { initialExpiry, isSessionLive, nextExpiry, shouldRenew } from "../domain/session-policy";
import { generateToken, hashToken } from "../domain/security-token";
import { DUMMY_CREDENTIAL_HASH, verifyPassword } from "./password";

/** Case-insensitive equality on the generated `lower(email)` index. */
const emailEquals = (email: string) => sql`lower(${users.email}) = lower(${email})`;

/** A session lookup predicate: exact row, never already revoked. */
const liveTokenHash = (tokenHash: string) =>
  and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt));

export const drizzleAuthStore: AuthStore = {
  async findForLogin(email) {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        failedLoginCount: users.failedLoginCount,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(emailEquals(email))
      .limit(1);

    return rows[0] ?? null;
  },

  async findAccountById(userId) {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        failedLoginCount: users.failedLoginCount,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  },

  async verifyCredential({ userId, plaintext }) {
    const rows = await db
      .select({ passwordHash: userCredentials.passwordHash })
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1);

    // "No credential row", "hash absent" and "hash present" all funnel through the one verify
    // call, which returns false for a missing hash — a caller must not be able to tell which.
    const hash = rows[0]?.passwordHash;
    return verifyPassword(
      plaintext,
      hash !== null && hash !== undefined && hash !== "" ? { passwordHash: hash } : null,
    );
  },

  // The unknown-email path in `sign-in` has no `user_credentials` row to verify against, but it
  // must spend the same Argon2 work anyway (timing side-channel, `SECURITY.md` §62). Verify the
  // attempt against the fixed dummy hash; the boolean is promptly discarded.
  async verifyDummyCredential(plaintext) {
    return verifyPassword(plaintext, { passwordHash: DUMMY_CREDENTIAL_HASH });
  },

  async recordSuccessfulLogin({ userId, now }) {
    await db
      .update(users)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  },

  async recordFailedLogin({ userId, failedCount, lockedUntil }) {
    await db
      .update(users)
      .set({
        failedLoginCount: failedCount,
        lockedUntil,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  },

  async createSession({ userId, now, ipAddress, userAgent }: CreateSessionInput) {
    const sid = generateToken();
    const inserted = await db
      .insert(sessions)
      .values({
        userId,
        tokenHash: hashToken(sid),
        userAgent: userAgent ?? null,
        ipAddress: ipAddress ?? null,
        issuedAt: now,
        expiresAt: initialExpiry(now),
      })
      .returning({ id: sessions.id, expiresAt: sessions.expiresAt });

    const row = inserted[0];
    if (row === undefined) {
      throw new Error("session insert returned no row");
    }
    return { sid, sessionId: row.id, expiresAt: row.expiresAt } satisfies IssuedSession;
  },

  async validateSession({ sid, now }) {
    const tokenHash = hashToken(sid);
    const rows = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        issuedAt: sessions.issuedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      // The status join is the instant-suspension guarantee: an administrator moving an account
      // out of `active` ends every session on its next read, without waiting for a revoke pass.
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(liveTokenHash(tokenHash), eq(users.status, "active")))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return null;
    if (!isSessionLive(row.issuedAt, row.expiresAt, now)) return null;

    if (!shouldRenew(now, row.expiresAt)) {
      return {
        sessionId: row.id,
        userId: row.userId,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
      } satisfies LiveSession;
    }

    // Sliding renewal, guarded against a concurrent logout (see file header).
    const renewed = await db
      .update(sessions)
      .set({ expiresAt: nextExpiry(row.issuedAt, now) })
      .where(and(eq(sessions.id, row.id), isNull(sessions.revokedAt)))
      .returning({ expiresAt: sessions.expiresAt });

    const expiresAt = renewed[0]?.expiresAt;
    if (expiresAt === undefined) return null;

    return {
      sessionId: row.id,
      userId: row.userId,
      issuedAt: row.issuedAt,
      expiresAt,
    } satisfies LiveSession;
  },

  async revokeSession({ sid, reason, now }) {
    const revoked = await db
      .update(sessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(liveTokenHash(hashToken(sid)))
      .returning({ id: sessions.id });
    return revoked.length > 0;
  },

  async revokeAllSessions({ userId, reason, now, exceptSid }) {
    const predicates = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
    if (exceptSid !== undefined) {
      predicates.push(ne(sessions.tokenHash, hashToken(exceptSid)));
    }
    const revoked = await db
      .update(sessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(...predicates))
      .returning({ id: sessions.id });
    return revoked.length;
  },

  async findLiveSecurityEvent({ kind, tokenHash, now }) {
    const rows = await db
      .select({ id: securityEvents.id, userId: securityEvents.userId })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.kind, kind),
          eq(securityEvents.tokenHash, tokenHash),
          isNull(securityEvents.consumedAt),
          isNotNull(securityEvents.userId),
          gt(securityEvents.expiresAt, now),
        ),
      )
      .limit(1);
    const row = rows[0];
    // The column is nullable in the schema; a token row without a user is not actionable here.
    return row?.userId != null ? { id: row.id, userId: row.userId } : null;
  },

  async issueSecurityEvent({
    userId,
    kind,
    tokenHash,
    now,
    ttlMs,
    ipAddress,
    userAgent,
  }: IssueSecurityEventInput) {
    const inserted = await db
      .insert(securityEvents)
      .values({
        userId,
        kind,
        tokenHash,
        expiresAt: new Date(now.getTime() + ttlMs),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        // createdAt defaults server-side; passing it keeps `now` the single clock in tests.
        createdAt: now,
      })
      .returning({ id: securityEvents.id });
    const row = inserted[0];
    if (row === undefined) throw new Error("security_event insert returned no row");
    return { id: row.id };
  },

  async consumeSecurityEvent({ kind, tokenHash, now }) {
    const consumed = await db
      .update(securityEvents)
      .set({ consumedAt: now })
      .where(
        and(
          eq(securityEvents.kind, kind),
          eq(securityEvents.tokenHash, tokenHash),
          isNull(securityEvents.consumedAt),
          isNotNull(securityEvents.userId),
          gt(securityEvents.expiresAt, now),
        ),
      )
      .returning({ id: securityEvents.id, userId: securityEvents.userId });
    const row = consumed[0];
    return row?.userId != null ? { id: row.id, userId: row.userId } : null;
  },

  async setCredential({ userId, stored, now, unlock, activate }) {
    await db.transaction(async (tx) => {
      await tx
        .insert(userCredentials)
        .values({
          userId,
          passwordHash: stored.passwordHash,
          algorithm: stored.algorithm,
          parameters: stored.parameters,
          rotatedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userCredentials.userId,
          set: {
            passwordHash: stored.passwordHash,
            algorithm: stored.algorithm,
            parameters: stored.parameters,
            rotatedAt: now,
            updatedAt: now,
          },
        });

      if (unlock) {
        await tx
          .update(users)
          .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: now })
          .where(eq(users.id, userId));
      }
      if (activate) {
        // `invited → active` only: an `inactive`/`suspended` account must not be promoted by
        // proving an email address — that is an administrator's decision, not the user's.
        await tx
          .update(users)
          .set({ status: "active", updatedAt: now })
          .where(and(eq(users.id, userId), eq(users.status, "invited")));
      }
    });
  },

  async activateAccount({ userId, now }) {
    const activated = await db
      .update(users)
      .set({ status: "active", updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.status, "invited")))
      .returning({ id: users.id });
    return activated.length > 0;
  },

  async enqueueEmail({
    toUserId,
    toEmail,
    emailType,
    idempotencyKey,
    subject,
    bodyText,
    now,
  }: EnqueueEmailInput) {
    await db
      .insert(emailMessages)
      .values({
        toUserId,
        toEmail,
        emailType,
        idempotencyKey,
        subject,
        bodyText,
        status: "queued",
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })
      // `RULES.md` §47: a retried use case with the same business event enqueues nothing new.
      .onConflictDoNothing({ target: emailMessages.idempotencyKey });
  },
};
