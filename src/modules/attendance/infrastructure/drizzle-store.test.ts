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
  it("identifies code 23505", () => {
    expect(isUniqueViolation(makeViolation("attendance_sessions_slot_key"))).toBe(true);
  });

  it("returns false for non-violation errors", () => {
    expect(isUniqueViolation(new Error("network error"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
  });
});

describe("uniqueConflictError", () => {
  it("translates attendance_sessions_slot_key into friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("attendance_sessions_slot_key"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("already open or submitted");
  });

  it("translates attendance_corrections_one_per_mark_key into friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("attendance_corrections_one_per_mark_key"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("already been recorded for this student");
  });

  it("translates attendance_records_pkey into friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("attendance_records_pkey"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("already has an attendance mark");
  });

  it("falls back to generic conflict for unrecognized unique constraint", () => {
    const conflict = uniqueConflictError(makeViolation("other_unique_idx"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("conflicts with existing data");
  });
});
