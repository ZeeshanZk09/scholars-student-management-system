/**
 * Tests for DrizzleFloorOperationsStore helpers (`ARCHITECTURE.md` §19).
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
  it("identifies code 23505 as a Postgres unique violation", () => {
    expect(isUniqueViolation(makeViolation("teacher_absences_employee_date_key"))).toBe(true);
  });

  it("returns false for non-violation errors", () => {
    expect(isUniqueViolation(new Error("connection timeout"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
  });
});

describe("uniqueConflictError", () => {
  it("translates teacher_absences_employee_date_key into a friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("teacher_absences_employee_date_key"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("An absence record for this teacher on this date has already been filed");
  });

  it("translates floor_assignments_floor_user_key into a friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("floor_assignments_floor_user_key"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("already assigned to this floor");
  });

  it("translates floor_live_snapshots_unique into a friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("floor_live_snapshots_unique"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("live period snapshot for this room on this date is already recorded");
  });

  it("falls back to generic user-friendly conflict for unrecognized unique constraint", () => {
    const conflict = uniqueConflictError(makeViolation("unknown_unique_index"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("conflicts with an existing entry");
  });

  it("returns null for non-unique violations", () => {
    expect(uniqueConflictError(new Error("Generic failure"))).toBeNull();
  });
});
