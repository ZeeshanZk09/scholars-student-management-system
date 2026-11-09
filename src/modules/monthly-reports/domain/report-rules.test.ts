import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";

import {
  calculateMonthlyRollup,
  calculateReportCardMetrics,
  deriveMonthBounds,
  validateLocking,
  validatePublication,
  validateReportPeriod,
  validateStatusTransition,
  validateSupersession,
  type DailyTestEvaluationInput,
  type MonthlyReportSummary,
} from "./report-rules";

describe("Monthly Reports Domain Rules", () => {
  describe("calculateMonthlyRollup", () => {
    it("correctly rolls up multiple tests with weighted ratios", () => {
      const evaluations: DailyTestEvaluationInput[] = [
        {
          dailyTestId: "test-1",
          evaluationId: "eval-1",
          title: "Quiz 1",
          testDate: "2026-10-05",
          totalMarks: 20,
          status: "present",
          obtainedMarks: 18,
          percentage: 90,
        },
        {
          dailyTestId: "test-2",
          evaluationId: "eval-2",
          title: "Mid-month Test",
          testDate: "2026-10-15",
          totalMarks: 50,
          status: "present",
          obtainedMarks: 35,
          percentage: 70,
        },
      ];

      // Total obtained = 18 + 35 = 53
      // Total possible = 20 + 50 = 70
      // Weighted average: (90*20 + 70*50) / 70 = (1800 + 3500) / 70 = 5300 / 70 = 75.71%
      const result = calculateMonthlyRollup(evaluations);

      expect(result.testsCounted).toBe(2);
      expect(result.totalObtainedMarks).toBe(53);
      expect(result.totalPossibleMarks).toBe(70);
      expect(result.averagePercentage).toBe(75.71);
      expect(result.breakdown["test-1"]).toEqual({
        title: "Quiz 1",
        testDate: "2026-10-05",
        obtained: 18,
        total: 20,
        percentage: 90,
        status: "present",
      });
      expect(result.breakdown["test-2"]).toEqual({
        title: "Mid-month Test",
        testDate: "2026-10-15",
        obtained: 35,
        total: 50,
        percentage: 70,
        status: "present",
      });
    });

    it("excludes absent and excused evaluations from percentage average but tracks them in breakdown", () => {
      const evaluations: DailyTestEvaluationInput[] = [
        {
          dailyTestId: "test-1",
          evaluationId: "eval-1",
          title: "Quiz 1",
          testDate: "2026-10-05",
          totalMarks: 25,
          status: "present",
          obtainedMarks: 20,
          percentage: 80,
        },
        {
          dailyTestId: "test-2",
          evaluationId: "eval-2",
          title: "Quiz 2",
          testDate: "2026-10-12",
          totalMarks: 25,
          status: "absent",
          obtainedMarks: null,
          percentage: null,
        },
        {
          dailyTestId: "test-3",
          evaluationId: "eval-3",
          title: "Quiz 3",
          testDate: "2026-10-19",
          totalMarks: 25,
          status: "excused",
          obtainedMarks: null,
          percentage: null,
        },
      ];

      const result = calculateMonthlyRollup(evaluations);

      // Only Quiz 1 was sat
      expect(result.testsCounted).toBe(1);
      expect(result.averagePercentage).toBe(80);
      expect(result.totalObtainedMarks).toBe(20);
      expect(result.totalPossibleMarks).toBe(25);

      // Breakdown records all three
      expect(result.breakdown["test-2"]?.status).toBe("absent");
      expect(result.breakdown["test-3"]?.status).toBe("excused");
    });

    it("treats malpractice as 0 marks counting towards testsCounted", () => {
      const evaluations: DailyTestEvaluationInput[] = [
        {
          dailyTestId: "test-1",
          evaluationId: "eval-1",
          title: "Quiz 1",
          testDate: "2026-10-05",
          totalMarks: 50,
          status: "present",
          obtainedMarks: 50,
          percentage: 100,
        },
        {
          dailyTestId: "test-2",
          evaluationId: "eval-2",
          title: "Quiz 2",
          testDate: "2026-10-15",
          totalMarks: 50,
          status: "malpractice",
          obtainedMarks: null,
          percentage: null,
        },
      ];

      const result = calculateMonthlyRollup(evaluations);

      // (100 * 50 + 0 * 50) / 100 = 50%
      expect(result.testsCounted).toBe(2);
      expect(result.averagePercentage).toBe(50);
      expect(result.totalObtainedMarks).toBe(50);
      expect(result.totalPossibleMarks).toBe(100);
      expect(result.breakdown["test-2"]?.status).toBe("malpractice");
      expect(result.breakdown["test-2"]?.obtained).toBe(0);
    });

    it("throws BusinessRuleError when input has 0 evaluations", () => {
      expect(() => calculateMonthlyRollup([])).toThrow(BusinessRuleError);
    });

    it("throws BusinessRuleError when all evaluations are absent/excused (no sat tests)", () => {
      const evaluations: DailyTestEvaluationInput[] = [
        {
          dailyTestId: "test-1",
          evaluationId: "eval-1",
          title: "Quiz 1",
          testDate: "2026-10-05",
          totalMarks: 20,
          status: "absent",
          obtainedMarks: null,
          percentage: null,
        },
      ];

      expect(() => calculateMonthlyRollup(evaluations)).toThrow(BusinessRuleError);
    });
  });

  describe("validateSupersession", () => {
    const liveReport: MonthlyReportSummary = {
      id: "report-1",
      status: "published",
      supersededByReportId: null,
      publishedAt: new Date("2026-10-30T10:00:00Z"),
    };

    it("allows valid supersession for active report", () => {
      expect(() => validateSupersession(liveReport, "report-2")).not.toThrow();
    });

    it("rejects self-supersession", () => {
      expect(() => validateSupersession(liveReport, "report-1")).toThrow(BusinessRuleError);
    });

    it("rejects supersession if report is already superseded", () => {
      const superseded: MonthlyReportSummary = {
        ...liveReport,
        supersededByReportId: "report-prior",
      };
      expect(() => validateSupersession(superseded, "report-3")).toThrow(BusinessRuleError);
    });

    it("rejects supersession if report is locked", () => {
      const locked: MonthlyReportSummary = {
        ...liveReport,
        status: "locked",
      };
      expect(() => validateSupersession(locked, "report-2")).toThrow(BusinessRuleError);
    });

    it("rejects empty newReportId", () => {
      expect(() => validateSupersession(liveReport, "")).toThrow(ValidationError);
    });
  });

  describe("validateStatusTransition", () => {
    it("permits draft -> published", () => {
      expect(() => validateStatusTransition("draft", "published")).not.toThrow();
    });

    it("permits published -> locked", () => {
      expect(() => validateStatusTransition("published", "locked")).not.toThrow();
    });

    it("permits direct draft -> locked", () => {
      expect(() => validateStatusTransition("draft", "locked")).not.toThrow();
    });

    it("forbids published -> draft", () => {
      expect(() => validateStatusTransition("published", "draft")).toThrow(BusinessRuleError);
    });

    it("forbids locked -> draft or locked -> published", () => {
      expect(() => validateStatusTransition("locked", "draft")).toThrow(BusinessRuleError);
      expect(() => validateStatusTransition("locked", "published")).toThrow(BusinessRuleError);
    });
  });

  describe("validatePublication and validateLocking", () => {
    const activeDraft: MonthlyReportSummary = {
      id: "report-draft",
      status: "draft",
      supersededByReportId: null,
      publishedAt: null,
    };

    it("allows publishing an active draft", () => {
      expect(() => validatePublication(activeDraft)).not.toThrow();
    });

    it("forbids publishing a locked report", () => {
      const locked: MonthlyReportSummary = { ...activeDraft, status: "locked" };
      expect(() => validatePublication(locked)).toThrow(BusinessRuleError);
    });

    it("forbids publishing a superseded report", () => {
      const superseded: MonthlyReportSummary = {
        ...activeDraft,
        supersededByReportId: "new-report",
      };
      expect(() => validatePublication(superseded)).toThrow(BusinessRuleError);
    });

    it("allows locking an active draft or published report", () => {
      expect(() => validateLocking(activeDraft)).not.toThrow();
      expect(() => validateLocking({ ...activeDraft, status: "published" })).not.toThrow();
    });

    it("forbids locking an already locked report", () => {
      expect(() => validateLocking({ ...activeDraft, status: "locked" })).toThrow(BusinessRuleError);
    });
  });

  describe("Period & Date helpers", () => {
    it("derives month bounds correctly including leap years", () => {
      expect(deriveMonthBounds("2026-10")).toEqual({
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
      });

      // Leap year Feb 2024
      expect(deriveMonthBounds("2024-02")).toEqual({
        periodStart: "2024-02-01",
        periodEnd: "2024-02-29",
      });

      // Non-leap year Feb 2023
      expect(deriveMonthBounds("2023-02")).toEqual({
        periodStart: "2023-02-01",
        periodEnd: "2023-02-28",
      });
    });

    it("validates report period format and constraints", () => {
      expect(() => validateReportPeriod("2026-10-01", "2026-10-31")).not.toThrow();
      expect(() => validateReportPeriod("2026-10-05", "2026-10-31")).toThrow(ValidationError);
      expect(() => validateReportPeriod("2026-10-31", "2026-10-01")).toThrow(ValidationError);
    });
  });

  describe("calculateReportCardMetrics", () => {
    it("computes overall percentage, grade band, and rating across subjects", () => {
      const subjects = [
        { averagePercentage: 92.5, testsCounted: 4 },
        { averagePercentage: 88.0, testsCounted: 3 },
        { averagePercentage: 95.0, testsCounted: 5 },
      ];

      // Mean: (92.5 + 88.0 + 95.0) / 3 = 275.5 / 3 = 91.83%
      const result = calculateReportCardMetrics(subjects);

      expect(result.evaluatedSubjectsCount).toBe(3);
      expect(result.totalTestsSat).toBe(12);
      expect(result.overallPercentage).toBe(91.83);
      expect(result.performanceRating).toBe("Outstanding");
      expect(result.gradeBand).toBe("A+");
      expect(result.remarks).toContain("exceptional understanding");
    });

    it("handles subjects with null or missing percentages gracefully", () => {
      const subjects = [
        { averagePercentage: 74.0, testsCounted: 3 },
        { averagePercentage: null, testsCounted: 0 },
      ];

      const result = calculateReportCardMetrics(subjects);

      expect(result.evaluatedSubjectsCount).toBe(1);
      expect(result.totalTestsSat).toBe(3);
      expect(result.overallPercentage).toBe(74.0);
      expect(result.performanceRating).toBe("Good Progress");
      expect(result.gradeBand).toBe("B");
    });

    it("returns friendly empty summary when no subjects have evaluations", () => {
      const result = calculateReportCardMetrics([]);

      expect(result.evaluatedSubjectsCount).toBe(0);
      expect(result.totalTestsSat).toBe(0);
      expect(result.overallPercentage).toBeNull();
      expect(result.performanceRating).toBe("No Evaluated Tests");
      expect(result.gradeBand).toBe("N/A");
      expect(result.remarks).toContain("No completed test records");
    });
  });
});

