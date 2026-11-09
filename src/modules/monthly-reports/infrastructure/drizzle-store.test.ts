import { describe, expect, it } from "vitest";

import {
  DrizzleMonthlyReportStore,
  isUniqueViolation,
  uniqueConflictError,
} from "./drizzle-store";

function makeViolation(constraint: string): unknown {
  const err = new Error(
    `duplicate key value violates unique constraint "${constraint}"`,
  ) as Error & { code: string };
  err.code = "23505";
  return err;
}

describe("DrizzleMonthlyReportStore Error Handling", () => {
  describe("isUniqueViolation", () => {
    it("identifies code 23505 as a Postgres unique violation", () => {
      expect(isUniqueViolation(makeViolation("monthly_test_reports_unique"))).toBe(true);
    });

    it("returns false for non-violation errors", () => {
      expect(isUniqueViolation(new Error("generic failure"))).toBe(false);
      expect(isUniqueViolation(null)).toBe(false);
      expect(isUniqueViolation({ code: "42P01" })).toBe(false);
    });
  });

  describe("uniqueConflictError", () => {
    it("translates monthly_test_reports_unique into friendly ConflictError", () => {
      const conflict = uniqueConflictError(makeViolation("monthly_test_reports_unique"));
      expect(conflict).toBeDefined();
      expect(conflict?.userMessage).toContain("already been generated");
      expect(conflict?.userMessage).toContain("supersede");
    });

    it("translates monthly_test_report_items_unique into friendly ConflictError", () => {
      const conflict = uniqueConflictError(makeViolation("monthly_test_report_items_unique"));
      expect(conflict).toBeDefined();
      expect(conflict?.userMessage).toContain("cannot be included more than once");
    });

    it("translates monthly_test_report_items_eval_unique into friendly ConflictError", () => {
      const conflict = uniqueConflictError(makeViolation("monthly_test_report_items_eval_unique"));
      expect(conflict).toBeDefined();
      expect(conflict?.userMessage).toContain("evaluation cannot be added more than once");
    });

    it("falls back to generic conflict for unrecognized unique constraint", () => {
      const conflict = uniqueConflictError(makeViolation("unknown_unique_key"));
      expect(conflict).toBeDefined();
      expect(conflict?.userMessage).toContain("conflicts with existing records");
    });

    it("returns null for non-violation error", () => {
      expect(uniqueConflictError(new Error("random error"))).toBeNull();
    });
  });

  describe("DrizzleMonthlyReportStore instantiation", () => {
    it("can be constructed with default or custom client", () => {
      const store = new DrizzleMonthlyReportStore({} as never);
      expect(store).toBeInstanceOf(DrizzleMonthlyReportStore);
    });
  });
});
