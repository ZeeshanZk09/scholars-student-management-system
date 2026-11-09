/**
 * Unit tests for DrizzleJobStore's pure constraint-to-message mapping.
 *
 * Verifies that PostgreSQL 23505 errors are accurately translated into user-facing ConflictErrors
 * with clear non-technical messages and zero internal database jargon.
 */
import { describe, expect, it } from "vitest";

import {
  constraintOf,
  isUniqueViolation,
  uniqueConflictError,
} from "./drizzle-job-store";

function createUniqueViolationError(constraintName: string): unknown {
  const err = new Error(
    `duplicate key value violates unique constraint "${constraintName}"`,
  ) as Error & { code: string };
  err.code = "23505";
  return err;
}

describe("DrizzleJobStore constraint handling", () => {
  it("detects PostgreSQL 23505 unique violation code", () => {
    const error = createUniqueViolationError("jobs_idempotency_key_unique");
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("extracts constraint name correctly", () => {
    const error = createUniqueViolationError("jobs_idempotency_key_unique");
    expect(constraintOf(error)).toBe("jobs_idempotency_key_unique");
  });

  it("translates jobs_idempotency_key_unique to a user-friendly conflict error", () => {
    const error = createUniqueViolationError("jobs_idempotency_key_unique");
    const conflict = uniqueConflictError(error);
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toBe(
      "This task has already been submitted and duplicate processing is prevented.",
    );
  });

  it("translates dead_letter_jobs_job_unique", () => {
    const error = createUniqueViolationError("dead_letter_jobs_job_unique");
    const conflict = uniqueConflictError(error);
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toBe(
      "An incident report has already been logged for this failed job.",
    );
  });

  it("translates job_schedules_name_unique", () => {
    const error = createUniqueViolationError("job_schedules_name_unique");
    const conflict = uniqueConflictError(error);
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toBe("A recurring schedule with this name already exists.");
  });

  it("translates job_definitions_type_unique", () => {
    const error = createUniqueViolationError("job_definitions_type_unique");
    const conflict = uniqueConflictError(error);
    expect(conflict).toBeDefined();
    expect(conflict?.userMessage).toBe("A job definition for this job type is already registered.");
  });

  it("returns undefined for non-unique errors or unmapped constraints", () => {
    expect(uniqueConflictError(new Error("Generic error"))).toBeUndefined();
    expect(uniqueConflictError(createUniqueViolationError("unrelated_unique_idx"))).toBeUndefined();
  });
});
