import { describe, expect, it } from "vitest";

import { hashToken } from "../domain/security-token";
import {
  EMAIL_VERIFICATION_TTL_MS,
  requestEmailVerification,
  verifyEmail,
} from "./email-verification";
import { addUser, fakeAuthStore, fakeRateLimiter } from "./testing/fakes";

const now = new Date("2026-10-06T08:00:00Z");
const appBaseUrl = "https://sms.school.edu";

function tokenFromEmail(bodyText: string): string {
  const match = /verify-email\?token=([^\s]+)/.exec(bodyText);
  if (!match?.[1]) throw new Error("no token in email body");
  return decodeURIComponent(match[1]);
}

const invited = {
  id: "user-1",
  email: "ali@school.edu",
  name: "Ali",
  status: "invited" as const,
  failedLoginCount: 0,
  lockedUntil: null,
};

describe("requestEmailVerification", () => {
  it("rate-limits before touching the store", async () => {
    const store = fakeAuthStore();
    const limiter = fakeRateLimiter(false);
    const result = await requestEmailVerification(
      { store, rateLimiter: limiter, appBaseUrl },
      { email: "ali@school.edu", now, origin: {} },
    );
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(store.emails).toHaveLength(0);
  });

  it("answers ok for an unknown address and queues nothing", async () => {
    const store = fakeAuthStore();
    const result = await requestEmailVerification(
      { store, rateLimiter: fakeRateLimiter(), appBaseUrl },
      { email: "ghost@school.edu", now, origin: {} },
    );
    expect(result).toEqual({ ok: true });
    expect(store.emails).toHaveLength(0);
  });

  it("queues nothing for an already-active account (no invitation pending)", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...invited, status: "active" });
    const result = await requestEmailVerification(
      { store, rateLimiter: fakeRateLimiter(), appBaseUrl },
      { email: "ali@school.edu", now, origin: {} },
    );
    expect(result).toEqual({ ok: true });
    expect(store.emails).toHaveLength(0);
  });

  it("issues a token whose hash matches the emailed link", async () => {
    const store = fakeAuthStore();
    addUser(store, invited);

    const result = await requestEmailVerification(
      { store, rateLimiter: fakeRateLimiter(), appBaseUrl },
      { email: "ALI@school.edu", now, origin: { ipAddress: "1.1.1.1" } },
    );

    expect(result).toEqual({ ok: true });
    expect(store.securityEvents).toHaveLength(1);
    expect(store.emails).toHaveLength(1);

    const queued = store.emails[0];
    if (!queued) throw new Error("no email");
    const token = tokenFromEmail(queued.bodyText);
    expect(store.securityEvents[0]?.tokenHash).toBe(hashToken(token));
    expect(queued.emailType).toBe("email_verification");
    expect(queued.idempotencyKey).toBe(`email_verification:${store.securityEvents[0]?.id}`);
  });

  it("issues a fresh token on every resend — a lost first email is not a dead end", async () => {
    const store = fakeAuthStore();
    addUser(store, invited);
    const deps = { store, rateLimiter: fakeRateLimiter(), appBaseUrl };

    await requestEmailVerification(deps, { email: "ali@school.edu", now, origin: {} });
    await requestEmailVerification(deps, { email: "ali@school.edu", now, origin: {} });

    expect(store.securityEvents).toHaveLength(2);
    expect(store.emails).toHaveLength(2);
    // Each is single-use and independently valid until it expires.
    expect(store.securityEvents[0]?.tokenHash).not.toBe(store.securityEvents[1]?.tokenHash);
  });
});

describe("verifyEmail", () => {
  async function seedVerification(
    store: ReturnType<typeof fakeAuthStore>,
    userId: string,
  ): Promise<string> {
    const token = "verify-token-plain";
    await store.issueSecurityEvent({
      userId,
      kind: "email_verification",
      tokenHash: hashToken(token),
      now,
      ttlMs: EMAIL_VERIFICATION_TTL_MS,
    });
    return token;
  }

  it("rejects an unknown token", async () => {
    const store = fakeAuthStore();
    const result = await verifyEmail({ store }, { token: "bogus", now });
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("activates an invited account on a valid token", async () => {
    const store = fakeAuthStore();
    addUser(store, invited);
    const token = await seedVerification(store, "user-1");

    const result = await verifyEmail({ store }, { token, now });

    expect(result).toEqual({ ok: true, userId: "user-1" });
    expect(store.users.get("user-1")?.status).toBe("active");
    expect(store.securityEvents[0]?.consumedAt).toEqual(now);
  });

  it("is single-use: a replayed link fails and the account state stays put", async () => {
    const store = fakeAuthStore();
    addUser(store, invited);
    const token = await seedVerification(store, "user-1");

    const first = await verifyEmail({ store }, { token, now });
    const replay = await verifyEmail({ store }, { token, now });

    expect(first).toEqual({ ok: true, userId: "user-1" });
    expect(replay).toEqual({ ok: false, reason: "invalid_token" });
    expect(store.users.get("user-1")?.status).toBe("active");
  });

  it("rejects an expired token", async () => {
    const store = fakeAuthStore();
    addUser(store, invited);
    const token = await seedVerification(store, "user-1");
    const afterExpiry = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS + 1000);

    const result = await verifyEmail({ store }, { token, now: afterExpiry });
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
    expect(store.users.get("user-1")?.status).toBe("invited");
  });

  it("succeeds against an already-active account (second valid token) without flipping status", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...invited, status: "active" });
    const token = await seedVerification(store, "user-1");

    const result = await verifyEmail({ store }, { token, now });
    expect(result).toEqual({ ok: true, userId: "user-1" });
    expect(store.users.get("user-1")?.status).toBe("active");
  });
});
