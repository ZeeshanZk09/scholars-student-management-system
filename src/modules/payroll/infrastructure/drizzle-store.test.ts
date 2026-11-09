/**
 * Unit tests for the payroll store's *pure* helpers — `sumNetAmounts`, `isUniqueViolation` and
 * `uniqueConflictError`.
 *
 * Nothing here touches a database: the helpers are deliberately free of `db`/`drizzle-orm` so the
 * run total's arithmetic and the constraint-to-message mapping are verified without a harness
 * (`MEMORY.md`: vitest never connects to Postgres in this repo). Behaviour that needs rows —
 * tenancy, the version guards, the upsert that preserves an item's identity, the extra-period
 * stamping — is covered by `payroll-service.test.ts` against `testing/fakes.ts`, which mirrors this
 * store's observable semantics.
 */
import { describe, expect, it } from "vitest";

import { toDecimalText } from "@/shared/money";

import { isUniqueViolation, sumNetAmounts, uniqueConflictError } from "./drizzle-store";

/** The shape node-postgres reports for a `23505`. */
function uniqueViolation(constraint: string): unknown {
  const error = new Error(
    `duplicate key value violates unique constraint "${constraint}"`,
  ) as Error & { code: string };
  error.code = "23505";
  return error;
}

describe("a run's total", () => {
  it("sums the lines' net figures exactly, in the run's currency", () => {
    expect(toDecimalText(sumNetAmounts(["66000.00", "40000.00", "5454.54"], "PKR"))).toBe(
      "111454.54",
    );
  });

  it("subtracts a negative adjustment rather than truncating it", () => {
    expect(toDecimalText(sumNetAmounts(["40000.00", "-2500.00"], "PKR"))).toBe("37500.00");
  });

  it("is zero for a run with no lines, and one for an empty list", () => {
    expect(toDecimalText(sumNetAmounts([], "PKR"))).toBe("0.00");
  });
});

describe("unique conflicts", () => {
  it("recognises PostgreSQL's unique-violation code", () => {
    expect(isUniqueViolation(uniqueViolation("payroll_runs_period_key"))).toBe(true);
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
  });

  it("names the mistake, because the same code covers three of them", () => {
    expect(uniqueConflictError(uniqueViolation("payroll_runs_period_key"))?.userMessage).toContain(
      "already exists",
    );
    expect(
      uniqueConflictError(uniqueViolation("payroll_period_locks_period_key"))?.userMessage,
    ).toContain("closed for payroll");
    expect(
      uniqueConflictError(uniqueViolation("payroll_payments_run_account_key"))?.userMessage,
    ).toContain("pay it twice");
  });

  it("returns nothing for a constraint this module does not map, so the caller rethrows", () => {
    expect(uniqueConflictError(uniqueViolation("some_other_key"))).toBeUndefined();
    expect(uniqueConflictError(new Error("not a constraint message"))).toBeUndefined();
  });
});
