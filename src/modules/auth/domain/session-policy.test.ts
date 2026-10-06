import { describe, expect, it } from "vitest";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_RENEW_AFTER_MS,
  initialExpiry,
  isSessionLive,
  nextExpiry,
  shouldRenew,
} from "./session-policy";

const t = (iso: string) => new Date(iso);
const HOUR = 60 * 60 * 1000;

describe("isSessionLive", () => {
  const issued = t("2026-10-06T08:00:00Z");

  it("keeps a session inside both windows", () => {
    expect(isSessionLive(issued, t("2026-10-06T08:30:00Z"), t("2026-10-06T08:15:00Z"))).toBe(true);
  });

  it("expires exactly at expires_at (exclusive boundary)", () => {
    const expires = t("2026-10-06T08:30:00Z");
    expect(isSessionLive(issued, expires, t("2026-10-06T08:29:59.999Z"))).toBe(true);
    expect(isSessionLive(issued, expires, t("2026-10-06T08:30:00Z"))).toBe(false);
  });

  it("enforces the absolute cap even when the idle window was renewed", () => {
    const issued = t("2026-10-01T08:00:00Z");
    const farExpiry = new Date(issued.getTime() + SESSION_ABSOLUTE_MS + HOUR);
    const before = new Date(issued.getTime() + SESSION_ABSOLUTE_MS - HOUR);
    const after = new Date(issued.getTime() + SESSION_ABSOLUTE_MS);
    expect(isSessionLive(issued, farExpiry, before)).toBe(true);
    expect(isSessionLive(issued, farExpiry, after)).toBe(false);
  });
});

describe("shouldRenew", () => {
  it("does not renew a freshly issued session", () => {
    const now = t("2026-10-06T08:00:00Z");
    expect(shouldRenew(now, initialExpiry(now))).toBe(false);
  });

  it("renews once the idle window has burned down to the throttle threshold", () => {
    const issued = t("2026-10-06T08:00:00Z");
    const expires = initialExpiry(issued);
    // 25 minutes of idle remaining = 5 minutes of activity = throttle elapsed.
    const edge = new Date(expires.getTime() - (SESSION_IDLE_MS - SESSION_RENEW_AFTER_MS));
    expect(shouldRenew(edge, expires)).toBe(true);
    expect(shouldRenew(new Date(edge.getTime() - 1), expires)).toBe(false);
  });
});

describe("nextExpiry / initialExpiry", () => {
  const issued = t("2026-10-06T08:00:00Z");

  it("grants the full idle window from now while under the cap", () => {
    const now = t("2026-10-06T09:00:00Z");
    expect(nextExpiry(issued, now).getTime()).toBe(now.getTime() + SESSION_IDLE_MS);
    expect(initialExpiry(issued).getTime()).toBe(issued.getTime() + SESSION_IDLE_MS);
  });

  it("never pushes expiry past the absolute cap", () => {
    // Within 10 minutes of the cap: idle-based expiry (now + 30 min) would overshoot it.
    const now = new Date(issued.getTime() + SESSION_ABSOLUTE_MS - 10 * 60 * 1000);
    expect(nextExpiry(issued, now).getTime()).toBe(issued.getTime() + SESSION_ABSOLUTE_MS);
  });
});
