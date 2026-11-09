/**
 * Monthly Test Reports Domain Rules (`PRD.md` MODULE 22, `PHASES.md` Phase 26, `RULES.md` §43/§46/§47).
 *
 * Pure business rules for monthly test report calculations, rollups, supersession and publication locking.
 * Knows nothing of Next.js, Drizzle, or PostgreSQL. Every rule here is tested in `report-rules.test.ts`.
 *
 * ## Domain Invariants:
 * 1. Percentage Rollup:
 *    - Present and malpractice evaluations are eligible for aggregation.
 *    - Absent / excused tests do not penalize a student with a synthetic 0%, but are tracked in breakdown.
 *    - Weighting uses test total marks by default so that weighted average percentage aligns with total obtained / total marks.
 *    - Resulting averagePercentage is bounded between 0.00 and 100.00, rounded to 2 decimal places.
 *    - At least 1 test is required (`testsCounted > 0`).
 * 2. Supersession Handling:
 *    - When mark corrections or new tests occur for an existing period, a new report is generated.
 *    - The previous live report is linked via `supersededByReportId` pointing to the new report.
 *    - Self-supersession is strictly forbidden (`report.id !== supersededByReportId`).
 *    - A locked report cannot be superseded without an administrative unlock.
 *    - An already superseded report cannot be superseded again.
 * 3. Publication & Locking:
 *    - Allowed transitions: `draft -> published -> locked`.
 *    - Once published, `publishedAt` is recorded.
 *    - Once locked, the report is immutable and cannot transition back to draft or published.
 *    - Superseded reports cannot be published or locked.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Status Constants & Types                                                   */
/* -------------------------------------------------------------------------- */

export const MONTHLY_REPORT_STATUSES = ["draft", "published", "locked"] as const;
export type MonthlyReportStatus = (typeof MONTHLY_REPORT_STATUSES)[number];

export const DAILY_TEST_STATUSES = ["draft", "published", "locked"] as const;

export const EVALUATION_STATUSES = [
  "pending",
  "present",
  "absent",
  "excused",
  "malpractice",
] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Data Structures for Pure Domain Operations                                 */
/* -------------------------------------------------------------------------- */

export interface DailyTestEvaluationInput {
  readonly dailyTestId: string;
  readonly evaluationId: string;
  readonly title: string;
  readonly testDate: string;
  readonly totalMarks: number;
  readonly status: string;
  readonly obtainedMarks: number | null;
  readonly percentage: number | null;
  readonly weight?: number | null | undefined;
}

export interface EvaluationRollupItem {
  readonly dailyTestId: string;
  readonly evaluationId: string;
  readonly usedPercentage: number;
  readonly weight: number;
  readonly obtainedMarks: number;
  readonly totalMarks: number;
}

export interface TestBreakdownEntry {
  readonly title: string;
  readonly testDate: string;
  readonly obtained: number;
  readonly total: number;
  readonly percentage: number;
  readonly status: string;
}

export interface MonthlyReportRollupResult {
  readonly testsCounted: number;
  readonly averagePercentage: number;
  readonly totalObtainedMarks: number;
  readonly totalPossibleMarks: number;
  readonly items: readonly EvaluationRollupItem[];
  readonly breakdown: Record<string, TestBreakdownEntry>;
}

export interface MonthlyReportSummary {
  readonly id: string;
  readonly status: MonthlyReportStatus;
  readonly supersededByReportId: string | null;
  readonly publishedAt: Date | null;
}

/* -------------------------------------------------------------------------- */
/* Percentage Rollup Calculation                                              */
/* -------------------------------------------------------------------------- */

/**
 * Calculates the monthly weighted percentage rollup from daily tests.
 *
 * Implements PRD MODULE 22 and the arithmetic defined in `daily-tests.ts`:
 * - Only evaluations with `status === "present"` or `status === "malpractice"` contribute to the score.
 * - `absent` or `excused` evaluations are recorded in `breakdown` for visibility, but do not contribute
 *   to `testsCounted` or `averagePercentage` to prevent artificial skewing.
 * - Default weight is the test's `totalMarks` so that the weighted mean equals total obtained / total marks.
 */
export function calculateMonthlyRollup(
  evaluations: readonly DailyTestEvaluationInput[],
): MonthlyReportRollupResult {
  if (evaluations.length === 0) {
    throw new BusinessRuleError("Cannot generate monthly report without any daily test evaluations.", {
      userMessage: "No test records were found for this subject and period.",
    });
  }

  const items: EvaluationRollupItem[] = [];
  const breakdown: Record<string, TestBreakdownEntry> = {};

  let weightedSum = 0;
  let totalWeight = 0;
  let totalObtained = 0;
  let totalPossible = 0;

  for (const ev of evaluations) {
    const isPresent = ev.status === "present";
    const isMalpractice = ev.status === "malpractice";

    // Obtain or derive marks
    let obtained = 0;
    let percentage = 0;

    if (isPresent && ev.obtainedMarks !== null) {
      obtained = Math.max(0, ev.obtainedMarks);
      percentage = ev.percentage !== null && ev.percentage !== undefined
        ? Math.min(100, Math.max(0, ev.percentage))
        : ev.totalMarks > 0
          ? Math.min(100, Math.max(0, (obtained / ev.totalMarks) * 100))
          : 0;
    } else if (isMalpractice) {
      // Malpractice counts as sat test with 0 marks
      obtained = 0;
      percentage = 0;
    }

    // Add to breakdown for parent and student view
    breakdown[ev.dailyTestId] = {
      title: ev.title,
      testDate: ev.testDate,
      obtained: isPresent ? obtained : 0,
      total: ev.totalMarks,
      percentage: Math.round(percentage * 100) / 100,
      status: ev.status,
    };

    // Only present and malpractice count towards average percentage
    if (isPresent || isMalpractice) {
      const weight = ev.weight && ev.weight > 0 ? ev.weight : (ev.totalMarks > 0 ? ev.totalMarks : 1);
      const usedPercentage = Math.round(percentage * 100) / 100;

      items.push({
        dailyTestId: ev.dailyTestId,
        evaluationId: ev.evaluationId,
        usedPercentage,
        weight,
        obtainedMarks: obtained,
        totalMarks: ev.totalMarks,
      });

      weightedSum += usedPercentage * weight;
      totalWeight += weight;
      totalObtained += obtained;
      totalPossible += ev.totalMarks;
    }
  }

  if (items.length === 0) {
    throw new BusinessRuleError(
      "Cannot generate monthly report because no attended tests (present or malpractice) were found.",
      {
        userMessage: "The student has no attended tests in this subject for the selected month.",
      },
    );
  }

  const rawAverage = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const averagePercentage = Math.min(100, Math.max(0, Math.round(rawAverage * 100) / 100));

  return {
    testsCounted: items.length,
    averagePercentage,
    totalObtainedMarks: Math.round(totalObtained * 100) / 100,
    totalPossibleMarks: Math.round(totalPossible * 100) / 100,
    items,
    breakdown,
  };
}

/* -------------------------------------------------------------------------- */
/* Supersession Rules                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Validates that an existing report can be superseded by a new replacement report.
 *
 * Rules:
 * - A report cannot supersede itself (`existingReport.id !== newReportId`).
 * - A locked report cannot be superseded without unlocking first.
 * - A report that is already superseded cannot be superseded again.
 */
export function validateSupersession(
  existingReport: MonthlyReportSummary,
  newReportId: string,
): void {
  if (!newReportId || newReportId.trim() === "") {
    throw new ValidationError("Replacement report ID is required for supersession.", {
      newReportId: ["Replacement report ID cannot be empty."],
    });
  }

  if (existingReport.id === newReportId) {
    throw new BusinessRuleError(
      `Report ${existingReport.id} cannot supersede itself.`,
      {
        userMessage: "A monthly test report cannot supersede itself.",
      },
    );
  }

  if (existingReport.supersededByReportId !== null) {
    throw new BusinessRuleError(
      `Report ${existingReport.id} is already superseded by report ${existingReport.supersededByReportId}.`,
      {
        userMessage: "This report has already been superseded by a newer version.",
      },
    );
  }

  if (existingReport.status === "locked") {
    throw new BusinessRuleError(
      `Report ${existingReport.id} is locked and cannot be superseded.`,
      {
        userMessage: "Locked monthly reports cannot be recomputed or replaced.",
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Status Transitions & Publication Locking                                   */
/* -------------------------------------------------------------------------- */

/**
 * Validates report status transitions:
 * - draft -> published
 * - published -> locked
 * - draft -> locked (direct lock)
 * Reversing from locked or published backwards is strictly forbidden.
 */
export function validateStatusTransition(
  currentStatus: MonthlyReportStatus,
  targetStatus: MonthlyReportStatus,
): void {
  if (currentStatus === targetStatus) return;

  if (currentStatus === "locked") {
    throw new BusinessRuleError("Cannot alter the status of a locked report.", {
      userMessage: "This monthly report is locked and cannot be modified.",
    });
  }

  if (currentStatus === "published" && targetStatus === "draft") {
    throw new BusinessRuleError(
      "Cannot revert a published monthly report back to draft.",
      {
        userMessage: "Published reports cannot be reverted to draft. Recompute a new version if changes are needed.",
      },
    );
  }
}

/**
 * Validates that a report is eligible for publication.
 */
export function validatePublication(report: MonthlyReportSummary): void {
  if (report.status === "locked") {
    throw new BusinessRuleError("Cannot publish a locked report.", {
      userMessage: "This report is already locked.",
    });
  }

  if (report.supersededByReportId !== null) {
    throw new BusinessRuleError("Cannot publish an inactive superseded report.", {
      userMessage: "This monthly report has been superseded and cannot be published.",
    });
  }
}

/**
 * Validates that a report is eligible for locking.
 */
export function validateLocking(report: MonthlyReportSummary): void {
  if (report.status === "locked") {
    throw new BusinessRuleError("Report is already locked.", {
      userMessage: "This monthly report is already locked.",
    });
  }

  if (report.supersededByReportId !== null) {
    throw new BusinessRuleError("Cannot lock an inactive superseded report.", {
      userMessage: "This monthly report has been superseded and cannot be locked.",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Period Validation Helpers                                                  */
/* -------------------------------------------------------------------------- */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;

/**
 * Validates that periodStart and periodEnd represent a valid reporting interval.
 */
export function validateReportPeriod(periodStart: string, periodEnd: string): void {
  if (!ISO_DATE_REGEX.test(periodStart)) {
    throw new ValidationError("Invalid period start date format.", {
      periodStart: ["Must be a valid date in YYYY-MM-DD format."],
    });
  }

  if (!ISO_DATE_REGEX.test(periodEnd)) {
    throw new ValidationError("Invalid period end date format.", {
      periodEnd: ["Must be a valid date in YYYY-MM-DD format."],
    });
  }

  if (periodEnd < periodStart) {
    throw new ValidationError("Period end date must be on or after period start date.", {
      periodEnd: ["Period end cannot precede period start."],
    });
  }

  // Ensure periodStart is the first of the month
  if (!periodStart.endsWith("-01")) {
    throw new ValidationError("Period start must be the first day of the month.", {
      periodStart: ["Monthly reporting period must start on day 01."],
    });
  }
}

/**
 * Derives first and last day of a month from a "YYYY-MM" string.
 */
export function deriveMonthBounds(yearMonth: string): { periodStart: string; periodEnd: string } {
  if (!MONTH_KEY_REGEX.test(yearMonth)) {
    throw new ValidationError("Invalid month format. Expected YYYY-MM.", {
      periodMonth: ["Expected format YYYY-MM (e.g. 2026-10)."],
    });
  }

  const [yearStr, monthStr] = yearMonth.split("-") as [string, string];
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (month < 1 || month > 12) {
    throw new ValidationError("Invalid month value.", {
      periodMonth: ["Month must be between 01 and 12."],
    });
  }

  const periodStart = `${yearStr}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  return { periodStart, periodEnd };
}

/* -------------------------------------------------------------------------- */
/* Student Report Card Compilation & Performance Metrics                     */
/* -------------------------------------------------------------------------- */

export interface SubjectEvaluationSummary {
  readonly averagePercentage: number | null;
  readonly testsCounted: number;
}

export interface ReportCardMetricsResult {
  readonly evaluatedSubjectsCount: number;
  readonly totalTestsSat: number;
  readonly overallPercentage: number | null;
  readonly performanceRating: string;
  readonly gradeBand: string;
  readonly remarks: string;
}

/**
 * Calculates overall academic metrics and performance ratings across multiple subject reports.
 *
 * Provides non-technical, human-friendly feedback for parents and students:
 * - Computes mean percentage across subjects with recorded evaluations.
 * - Aggregates total daily tests sat.
 * - Assigns clear, encouraging performance descriptors without educational jargon.
 */
export function calculateReportCardMetrics(
  subjects: readonly SubjectEvaluationSummary[],
): ReportCardMetricsResult {
  let sumPercentage = 0;
  let evaluatedCount = 0;
  let totalTests = 0;

  for (const s of subjects) {
    totalTests += Math.max(0, s.testsCounted);
    if (s.averagePercentage !== null && s.averagePercentage !== undefined) {
      sumPercentage += s.averagePercentage;
      evaluatedCount += 1;
    }
  }

  if (evaluatedCount === 0) {
    return {
      evaluatedSubjectsCount: 0,
      totalTestsSat: totalTests,
      overallPercentage: null,
      performanceRating: "No Evaluated Tests",
      gradeBand: "N/A",
      remarks: "No completed test records were available for this reporting month.",
    };
  }

  const overall = Math.min(100, Math.max(0, Math.round((sumPercentage / evaluatedCount) * 100) / 100));

  let performanceRating: string;
  let gradeBand: string;
  let remarks: string;

  if (overall >= 90) {
    performanceRating = "Outstanding";
    gradeBand = "A+";
    remarks = "Demonstrates exceptional understanding and mastery across subjects.";
  } else if (overall >= 80) {
    performanceRating = "Excellent";
    gradeBand = "A";
    remarks = "Maintains strong academic performance with commendable consistency.";
  } else if (overall >= 70) {
    performanceRating = "Good Progress";
    gradeBand = "B";
    remarks = "Shows steady progress and good comprehension of class material.";
  } else if (overall >= 60) {
    performanceRating = "Satisfactory";
    gradeBand = "C";
    remarks = "Meeting standard expectations with room for further improvement.";
  } else if (overall >= 50) {
    performanceRating = "Needs Focus";
    gradeBand = "D";
    remarks = "Passing performance; additional practice and guided study recommended.";
  } else {
    performanceRating = "Requires Support";
    gradeBand = "F";
    remarks = "Academic support and teacher consultation are strongly advised.";
  }

  return {
    evaluatedSubjectsCount: evaluatedCount,
    totalTestsSat: totalTests,
    overallPercentage: overall,
    performanceRating,
    gradeBand,
    remarks,
  };
}

