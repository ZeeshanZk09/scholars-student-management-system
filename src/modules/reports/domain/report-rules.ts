/**
 * Pure domain rules for analytics and report generation (`PRD.md` MODULE 29, `PHASES.md` §36).
 *
 * All functions here are pure calculations and classifications with no dependencies on
 * frameworks, databases, or external infrastructure.
 */
import {
  add,
  fromDecimalText,
  isNegative,
  subtract,
  toDecimalText,
  zero,
} from "@/shared/money";

export type AttendanceHealth = "excellent" | "good" | "concerning" | "critical";
export type FeeCollectionHealth = "healthy" | "moderate" | "action_needed";
export type GpaPerformanceTier = "distinction" | "proficient" | "developing" | "needs_support";
export type WorkloadBalanceStatus = "balanced" | "underloaded" | "overloaded";

/**
 * Calculates a percentage rate safely rounded to one decimal place.
 * Returns 0 if the denominator is non-positive or not a finite number.
 */
export function calculateRate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const raw = (numerator / denominator) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  return Math.round(clamped * 10) / 10;
}

/**
 * Formats a numeric rate into a user-friendly percentage string.
 */
export function formatPercentage(rate: number): string {
  const safe = Number.isFinite(rate) ? Math.max(0, rate) : 0;
  return `${(Math.round(safe * 10) / 10).toFixed(1)}%`;
}

/**
 * Derives outstanding fee balance using canonical decimal money arithmetic.
 * outstanding = max(0, totalInvoiced - totalCollected - totalConcessions).
 */
export function calculateOutstandingBalance(
  totalInvoicedText: string,
  totalCollectedText: string,
  totalConcessionsText: string,
  currency: string = "PKR",
): string {
  try {
    const invoiced = fromDecimalText(totalInvoicedText || "0.00", currency);
    const collected = fromDecimalText(totalCollectedText || "0.00", currency);
    const concessions = fromDecimalText(totalConcessionsText || "0.00", currency);

    const credits = add(collected, concessions);
    const balance = subtract(invoiced, credits);

    if (isNegative(balance)) {
      return toDecimalText(zero(currency));
    }
    return toDecimalText(balance);
  } catch {
    return "0.00";
  }
}

/**
 * Classifies attendance percentage health against school operational benchmarks.
 * - >= 95%: Excellent (target attendance rate)
 * - >= 90%: Good (acceptable operational standard)
 * - >= 80%: Concerning (intervention recommended)
 * - < 80%: Critical (urgent intervention required)
 */
export function classifyAttendanceHealth(rate: number): AttendanceHealth {
  if (rate >= 95) return "excellent";
  if (rate >= 90) return "good";
  if (rate >= 80) return "concerning";
  return "critical";
}

/**
 * Classifies fee collection efficiency.
 * - >= 85%: Healthy cash flow
 * - >= 70%: Moderate (follow-up needed on overdue invoices)
 * - < 70%: Action Needed (high outstanding ratio requires recovery process)
 */
export function classifyFeeCollectionHealth(collectionRate: number): FeeCollectionHealth {
  if (collectionRate >= 85) return "healthy";
  if (collectionRate >= 70) return "moderate";
  return "action_needed";
}

/**
 * Classifies examination GPA average performance (standard 4.0 scale).
 * - >= 3.5: Distinction (outstanding academic achievement)
 * - >= 3.0: Proficient (solid academic standard)
 * - >= 2.0: Developing (average performance with room for improvement)
 * - < 2.0: Needs Support (academic intervention needed)
 */
export function classifyGpaPerformance(gpa: number): GpaPerformanceTier {
  if (gpa >= 3.5) return "distinction";
  if (gpa >= 3.0) return "proficient";
  if (gpa >= 2.0) return "developing";
  return "needs_support";
}

/**
 * Classifies teacher workload distribution based on average periods per day.
 * - 4 to 6 periods/day: Balanced
 * - < 4 periods/day: Underloaded
 * - > 6 periods/day: Overloaded
 */
export function classifyTeacherWorkloadBalance(averagePeriodsPerTeacher: number): WorkloadBalanceStatus {
  if (averagePeriodsPerTeacher > 6) return "overloaded";
  if (averagePeriodsPerTeacher < 4 && averagePeriodsPerTeacher > 0) return "underloaded";
  return "balanced";
}

export interface ExecutiveSummaryInputs {
  readonly totalStudents: number;
  readonly activeRate: number;
  readonly collectionRate: number;
  readonly attendanceRate: number;
  readonly averageGpa: number;
  readonly passRate: number;
}

/**
 * Generates an executive briefing sentence formatted for school leadership.
 */
export function generateExecutiveSummary(inputs: ExecutiveSummaryInputs): string {
  const { totalStudents, activeRate, collectionRate, attendanceRate, averageGpa, passRate } = inputs;

  const attendanceHealth = classifyAttendanceHealth(attendanceRate);
  const feeHealth = classifyFeeCollectionHealth(collectionRate);

  let tone = "Operations are stable and performing within key parameters.";
  if (attendanceHealth === "critical" || feeHealth === "action_needed") {
    tone = "Attention is required on fee recovery and student attendance interventions.";
  } else if (attendanceHealth === "excellent" && feeHealth === "healthy") {
    tone = "The institute demonstrates strong operational vitality and high financial compliance.";
  }

  return `Institute serves ${totalStudents.toLocaleString()} total students (${activeRate}% active). Attendance is at ${attendanceRate}% with a ${collectionRate}% fee collection rate. Academic performance reflects an average GPA of ${averageGpa.toFixed(2)} with a ${passRate}% examination pass rate. ${tone}`;
}
