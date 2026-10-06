import { describe, expect, it } from "vitest";

import { hashToken } from "../domain/security-token";
import { PASSWORD_RESET_TTL_MS, requestPasswordReset, resetPassword } from "./password-reset";
import { addUser, fakeAuthStore, fakeRateLimiter, liveSessions } from "./testing/fakes";

const now = new Date("2026-10-06T08:00:00Z");
const appBaseUrl = "https://sms.school.edu";

/** The plaintext token a rendered email link carries, extracted from the queued body. */
function tokenFromEmail(bodyText: string): string {
  const match = /reset-password\?token=([^\s]+)/.exec(bodyText);
  if (!match?.[1]) throw new Error("no token in email body");
  return decodeURIComponent(match[1]);
}

describe("requestPasswordReset", () => {
  it("rate-limits before touching the store", async () => {
    const store = fakeAuthStore();
    const limiter = fakeRateLimiter(false);
    const result = await requestPasswordReset(
      { store, rateLimiter: limiter, appBaseUrl },
      { email: "ali@school.edu", now, origin: { ipAddress: "1.1.1.1" } },
    );
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(store.emails).toHaveLength(0);
  });

  it("answers ok for an unknown address and queues nothing", async () => {
    const store = fakeAuthStore();
    const result = await requestPasswordReset(
      { store, rateLimiter: fakeRateLimiter(), appBaseUrl },
      { email: "ghost@school.edu", now, origin: {} },
    );
    // Indistinguishable from the success case — this is the enumeration guarantee.
    expect(result).toEqual({ ok: true });
    expect(store.emails).toHaveLength(0);
    expect(store.securityEvents).toHaveLength(0);
  });

  it("issues a hashed token and queues an email whose link carries the matching plaintext", async () => {
    const store = fakeAuthStore();
    addUser(store, {
      id: "user-1",
      email: "ali@school.edu",
      name: "Ali",
      status: "active",
      failedLoginCount: 0,
      lockedUntil: null,
    });

    const result = await requestPasswordReset(
      { store, rateLimiter: fakeRateLimiter(), appBaseUrl },
      { email: " ALI@school.edu ", now, origin: { ipAddress: "1.1.1.1" } },
    );

    expect(result).toEqual({ ok: true });
    expect(store.securityEvents).toHaveLength(1);
    expect(store.emails).toHaveLength(1);

    const queued = store.emails[0];
    if (!queued) throw new Error("no email");
    const token = tokenFromEmail(queued.bodyText);
    // The stored hash must match the emailed token — the bug this assertion exists to catch.
    expect(store.securityEvents[0]?.tokenHash).toBe(hashToken(token));
    expect(queued.idempotencyKey).toBe(`password_reset:${store.securityEvents[0]?.id}`);
    expect(queued.emailType).toBe("password_reset");
    expect(queued.toEmail).toBe("ali@school.edu");
    expect(queued.bodyText).toContain(`${appBaseUrl}/reset-password?token=`);
  });

  it("does not offer a reset to a revoked account", async () => {
    const store = fakeAuthStore();
    addUser(store, {
      id: "user-1",
      email: "ali@school.edu",
      name: null,
      status: "revoked",
      failedLoginCount: 0,
      lockedUntil: null,
    });
    const result = await requestPasswordReset(
      { store, rateLimiter: fakeRateLimiter(), appBaseUrl },
      { email: "ali@school.edu", now, origin: {} },
    );
    expect(result).toEqual({ ok: true });
    expect(store.emails).toHaveLength(0);
  });
});

describe("resetPassword", () => {
  const hashed = async (plaintext: string) => ({
    passwordHash: `stored:${plaintext}`,
    algorithm: "argon2id" as const,
    parameters: { memoryCost: 65536 },
  });

  /** Seed a live reset token and return the plaintext that unlocks it. */
  async function seedReset(
    store: ReturnType<typeof fakeAuthStore>,
    userId: string,
  ): Promise<string> {
    const token = "reset-token-plain";
    await store.issueSecurityEvent({
      userId,
      kind: "password_reset",
      tokenHash: hashToken(token),
      now,
      ttlMs: PASSWORD_RESET_TTL_MS,
    });
    return token;
  }

  it("rejects an unknown token without mutating anything", async () => {
    const store = fakeAuthStore();
    const result = await resetPassword(
      { store, hashPassword: hashed },
      { token: "not-a-real-token", password: "a-fine-long-passphrase", now },
    );
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
    expect(store.recorded.setCredentials).toHaveLength(0);
  });

  it("rejects a weak password WITHOUT consuming the token", async () => {
    const store = fakeAuthStore();
    addUser(store, {
      id: "user-1",
      email: "ali@school.edu",
      name: "Ali",
      status: "active",
      failedLoginCount: 0,
      lockedUntil: null,
    });
    const token = await seedReset(store, "user-1");

    const result = await resetPassword(
      { store, hashPassword: hashed },
      { token, password: "short", now },
    );

    expect(result).toMatchObject({ ok: false, reason: "weak_password" });
    // The link survives a policy rejection — the user only has one.
    expect(store.securityEvents[0]?.consumedAt).toBeNull();
    expect(store.recorded.setCredentials).toHaveLength(0);
  });

  it("rejects a password containing the account email local part", async () => {
    const store = fakeAuthStore();
    // Local parts shorter than 4 characters are deliberately not matched (a 3-letter fragment
    // collides with ordinary words), so the fixture uses a qualifying address.
    addUser(store, {
      id: "user-1",
      email: "alexander@school.edu",
      name: null,
      status: "active",
      failedLoginCount: 0,
      lockedUntil: null,
    });
    const token = await seedReset(store, "user-1");

    const result = await resetPassword(
      { store, hashPassword: hashed },
      { token, password: "alexander-panama-tunnel-9", now },
    );
    expect(result).toMatchObject({ ok: false, reason: "weak_password" });
    expect(store.securityEvents[0]?.consumedAt).toBeNull();
  });

  it("sets the credential, unlocks the account, revokes every session and consumes the token", async () => {
    const store = fakeAuthStore();
    addUser(store, {
      id: "user-1",
      email: "ali@school.edu",
      name: "Ali",
      status: "active",
      failedLoginCount: 7,
      lockedUntil: new Date(now.getTime() + 60_000),
    });
    const token = await seedReset(store, "user-1");

    // Two pre-existing sessions on other devices.
    await store.createSession({ userId: "user-1", now });
    await store.createSession({ userId: "user-1", now });
    expect(liveSessions(store, now)).toHaveLength(2);

    const result = await resetPassword(
      { store, hashPassword: hashed },
      { token, password: "a-fine-long-passphrase", now },
    );

    expect(result).toEqual({ ok: true });
    expect(store.credentials.get("user-1")).toBe("stored:a-fine-long-passphrase");
    expect(store.users.get("user-1")?.failedLoginCount).toBe(0);
    expect(store.users.get("user-1")?.lockedUntil).toBeNull();
    expect(store.recorded.revocations).toEqual([
      { userId: "user-1", reason: "password_changed", exceptSid: undefined },
    ]);
    expect(liveSessions(store, now)).toHaveLength(0);
    expect(store.securityEvents[0]?.consumedAt).toEqual(now);
  });

  it("is single-use: a second submission of the same link fails", async () => {
    const store = fakeAuthStore();
    addUser(store, {
      id: "user-1",
      email: "ali@school.edu",
      name: "Ali",
      status: "active",
      failedLoginCount: 0,
      lockedUntil: null,
    });
    const token = await seedReset(store, "user-1");

    const first = await resetPassword(
      { store, hashPassword: hashed },
      { token, password: "a-fine-long-passphrase", now },
    );
    const second = await resetPassword(
      { store, hashPassword: hashed },
      { token, password: "another-fine-passphrase", now },
    );

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, reason: "invalid_token" });
    expect(store.recorded.setCredentials).toHaveLength(1);
  });

  it("rejects an expired token", async () => {
    const store = fakeAuthStore();
    addUser(store, {
      id: "user-1",
      email: "ali@school.edu",
      name: null,
      status: "active",
      failedLoginCount: 0,
      lockedUntil: null,
    });
    const token = await seedReset(store, "user-1");
    const afterExpiry = new Date(now.getTime() + PASSWORD_RESET_TTL_MS + 1000);

    const result = await resetPassword(
      { store, hashPassword: hashed },
      { token, password: "a-fine-long-passphrase", now: afterExpiry },
    );
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });
});
