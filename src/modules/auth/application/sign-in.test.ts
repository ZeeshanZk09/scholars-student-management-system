import { describe, expect, it } from "vitest";

import { FIRST_LOCK_MS, FREE_ATTEMPTS } from "../domain/lockout";
import { signIn, type SignInDeps } from "./sign-in";
import type { RateLimiter } from "./ports";
import { addUser, fakeAuthStore, fakeRateLimiter, seedPassword } from "./testing/fakes";

const now = new Date("2026-10-06T08:00:00Z");

const activeUser = {
  id: "user-1",
  email: "ali@school.edu",
  name: "Ali",
  status: "active" as const,
  failedLoginCount: 0,
  lockedUntil: null,
};

const depsFor = (
  store: ReturnType<typeof fakeAuthStore>,
  limiter: RateLimiter = fakeRateLimiter(),
): SignInDeps => ({
  store,
  rateLimiter: limiter,
});

describe("signIn", () => {
  it("rate-limits before touching the store", async () => {
    const store = fakeAuthStore();
    const limiter = fakeRateLimiter(false);
    const result = await signIn(depsFor(store, limiter), {
      email: "ali@school.edu",
      password: "whatever",
      now,
      origin: { ipAddress: "10.0.0.1" },
    });
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(store.recorded.failedLogins).toHaveLength(0);
  });

  it("returns invalid_credentials for an unknown email without writing counters", async () => {
    const store = fakeAuthStore();
    const result = await signIn(depsFor(store), {
      email: "ghost@school.edu",
      password: "whatever",
      now,
      origin: {},
    });
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(store.recorded.failedLogins).toHaveLength(0);
  });

  it("returns the same failure for a known email with a wrong password, and increments the lockout counter", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...activeUser, failedLoginCount: FREE_ATTEMPTS - 1 });
    seedPassword(store, "user-1", "correct horse battery");

    const result = await signIn(depsFor(store), {
      email: "ali@school.edu",
      password: "wrong",
      now,
      origin: {},
    });

    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(store.recorded.failedLogins).toHaveLength(1);
    // Hitting the threshold locks — persisted for the next attempt.
    expect(store.recorded.failedLogins[0]?.lockedUntil).not.toBeNull();
    expect(store.recorded.failedLogins[0]?.failedCount).toBe(FREE_ATTEMPTS);
  });

  it("reveals the lock only to a caller holding the correct password", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...activeUser, lockedUntil: new Date(now.getTime() + 60_000) });
    seedPassword(store, "user-1", "correct horse battery");

    const result = await signIn(depsFor(store), {
      email: "ali@school.edu",
      password: "correct horse battery",
      now,
      origin: {},
    });

    expect(result).toMatchObject({ ok: false, reason: "account_locked" });
    expect((result as { retryAfterMs: number }).retryAfterMs).toBeGreaterThan(0);
    expect((result as { retryAfterMs: number }).retryAfterMs).toBeLessThanOrEqual(FIRST_LOCK_MS);
  });

  it("does not treat an expired lock as locked", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...activeUser, lockedUntil: new Date(now.getTime() - 1000) });
    seedPassword(store, "user-1", "correct horse battery");

    const result = await signIn(depsFor(store), {
      email: "ali@school.edu",
      password: "correct horse battery",
      now,
      origin: {},
    });
    expect(result.ok).toBe(true);
  });

  it("asks an invited account to verify its email — after the password proves ownership", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...activeUser, status: "invited" });
    seedPassword(store, "user-1", "correct horse battery");

    const result = await signIn(depsFor(store), {
      email: "ali@school.edu",
      password: "correct horse battery",
      now,
      origin: {},
    });
    expect(result).toEqual({ ok: false, reason: "email_verification_required" });
  });

  it("blocks disabled accounts but names which state they are in", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...activeUser, status: "suspended" });
    seedPassword(store, "user-1", "correct horse battery");

    const result = await signIn(depsFor(store), {
      email: "ali@school.edu",
      password: "correct horse battery",
      now,
      origin: {},
    });
    expect(result).toEqual({ ok: false, reason: "account_disabled", status: "suspended" });
  });

  it("mints a session, resets counters and clears the rate window on success", async () => {
    const store = fakeAuthStore();
    addUser(store, { ...activeUser, failedLoginCount: 3 });
    seedPassword(store, "user-1", "correct horse battery");
    const limiter = fakeRateLimiter();

    const result = await signIn(depsFor(store, limiter), {
      email: " ali@school.edu ",
      password: "correct horse battery",
      now,
      origin: { ipAddress: "10.0.0.1", userAgent: "vitest" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.user).toMatchObject({ id: "user-1", email: "ali@school.edu" });
    expect(result.session.sid).toBe("sid-1");
    expect(store.recorded.successLogins).toEqual([{ userId: "user-1", now }]);
    expect(store.sessions).toHaveLength(1);
    expect(limiter.resets).toEqual(["login:10.0.0.1"]);
    // Counters cleared on the account itself, not just recorded.
    expect(store.users.get("user-1")?.failedLoginCount).toBe(0);
  });
});
