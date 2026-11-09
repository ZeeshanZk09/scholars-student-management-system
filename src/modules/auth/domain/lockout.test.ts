import { describe, expect, it } from "vitest";
import {
  FIRST_LOCK_MS,
  FREE_ATTEMPTS,
  SECOND_LOCK_MS,
  isLocked,
  lockoutAfterFailure,
} from "./lockout";

const now = new Date("2026-10-06T08:00:00Z");

describe("lockoutAfterFailure", () => {
  it("does not lock before the free attempts are used up", () => {
    for (let count = 1; count < FREE_ATTEMPTS; count += 1) {
      expect(lockoutAfterFailure(count, now).lockedUntil).toBeNull();
    }
  });

  it("locks for the first duration at exactly the free-attempt threshold", () => {
    const state = lockoutAfterFailure(FREE_ATTEMPTS, now);
    expect(state.lockedUntil?.getTime()).toBe(now.getTime() + FIRST_LOCK_MS);
  });

  it("escalates once attempts reach twice the free allowance", () => {
    const state = lockoutAfterFailure(FREE_ATTEMPTS * 2, now);
    expect(state.lockedUntil?.getTime()).toBe(now.getTime() + SECOND_LOCK_MS);
  });

  it("never escalates beyond the second duration", () => {
    const deep = lockoutAfterFailure(FREE_ATTEMPTS * 20, now);
    expect(deep.lockedUntil?.getTime()).toBe(now.getTime() + SECOND_LOCK_MS);
    expect(deep.failedCount).toBe(FREE_ATTEMPTS * 20);
  });
});

describe("isLocked", () => {
  it("is false for a null or missing lock", () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(undefined, now)).toBe(false);
  });

  it("is true strictly before lockedUntil and false at/after it", () => {
    const until = new Date(now.getTime() + 1000);
    expect(isLocked(until, new Date(until.getTime() - 1))).toBe(true);
    expect(isLocked(until, until)).toBe(false);
  });
});
