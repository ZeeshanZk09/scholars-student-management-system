/**
 * Unit tests for the HR store's *pure* helpers — `isUniqueViolation` and `uniqueConflictError`.
 *
 * Nothing here touches a database: the helpers are deliberately free of `db`/`drizzle-orm` so the
 * constraint-to-message mapping is verified without a harness (`MEMORY.md`: vitest never connects
 * to Postgres in this repo). Behaviour that needs rows — tenancy, versioning, the transaction that
 * provisions an account with its employee — is covered by `hr-service.test.ts` against
 * `testing/fakes.ts`, which mirrors this store's observable semantics.
 */
import { describe, expect, it } from "vitest";

import { isUniqueViolation, uniqueConflictError } from "./drizzle-store";

/** The shape node-postgres reports for a `23505`. */
function uniqueViolation(constraint: string): unknown {
  const error = new Error(
    `duplicate key value violates unique constraint "${constraint}"`,
  ) as Error & { code: string };
  error.code = "23505";
  return error;
}

describe("isUniqueViolation", () => {
  it("recognises PostgreSQL's unique-violation code", () => {
    expect(isUniqueViolation(uniqueViolation("users_email_lower_key"))).toBe(true);
  });

  it("does not mistake another driver error for a duplicate", () => {
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });
});

describe("uniqueConflictError", () => {
  it("names the collision a reader recognises", () => {
    expect(uniqueConflictError(uniqueViolation("users_email_lower_key"))?.userMessage).toContain(
      "email already exists",
    );
    expect(
      uniqueConflictError(uniqueViolation("employees_institution_code_key"))?.userMessage,
    ).toContain("employee code is already in use");
    expect(
      uniqueConflictError(uniqueViolation("salary_assignments_one_current_key"))?.userMessage,
    ).toContain("current salary assignment");
  });

  it("returns nothing for a constraint this module does not map, so the caller rethrows", () => {
    expect(uniqueConflictError(uniqueViolation("some_other_key"))).toBeUndefined();
    expect(uniqueConflictError(new Error("not a constraint message"))).toBeUndefined();
  });
});
