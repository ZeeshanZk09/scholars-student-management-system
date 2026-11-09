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
    expect(isUniqueViolation(makeViolation("teachers_institution_code_key"))).toBe(true);
  });

  it("returns false for non-violation errors", () => {
    expect(isUniqueViolation(new Error("network error"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
  });
});

describe("uniqueConflictError", () => {
  it("translates teachers_institution_code_key into friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("teachers_institution_code_key"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("employee code already exists");
  });

  it("translates class_teacher_assignments_unique into friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("class_teacher_assignments_unique"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("already assigned to this subject and section");
  });

  it("translates teacher_subjects_pkey into friendly ConflictError", () => {
    const conflict = uniqueConflictError(makeViolation("teacher_subjects_pkey"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("already mapped to this teacher");
  });

  it("falls back to generic conflict for unrecognized unique constraint", () => {
    const conflict = uniqueConflictError(makeViolation("other_unique_idx"));
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toContain("conflicts with existing data");
  });
});
