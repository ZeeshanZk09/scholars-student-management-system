/**
 * Tests for DrizzleComplaintStore error mapping and constraint violation translation.
 */

import { describe, expect, it } from "vitest";

import { isUniqueViolation, uniqueConflictError } from "./drizzle-store";

function makeViolation(constraint: string): unknown {
  const err = new Error(
    `duplicate key value violates unique constraint "${constraint}"`,
  ) as Error & { code: string };
  err.code = "23505";
  return err;
}

describe("isUniqueViolation", () => {
  it("identifies error code 23505", () => {
    expect(isUniqueViolation(makeViolation("complaint_visibility_unique"))).toBe(true);
  });

  it("returns false for non-violation errors", () => {
    expect(isUniqueViolation(new Error("network error"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
  });
});

describe("uniqueConflictError", () => {
  it("translates complaint_visibility_unique into friendly ConflictError without DB jargon", () => {
    const conflict = uniqueConflictError(makeViolation("complaint_visibility_unique"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("already granted to this staff member");
  });

  it("translates unknown unique constraint into general conflict without DB jargon", () => {
    const conflict = uniqueConflictError(makeViolation("some_other_unique_key"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("conflicts with existing information");
  });

  it("returns null for non-unique errors", () => {
    expect(uniqueConflictError(new Error("generic failure"))).toBeNull();
  });
});
