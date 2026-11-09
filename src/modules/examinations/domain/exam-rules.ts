/**
 * Examination and marks domain rules (`PRD.md` MODULE 20, `PHASES.md` §28 Phase 20, `RULES.md` §43/§44).
 *
 * Pure business rules for examinations, marks entry, percentage calculation, grading scheme
 * evaluation, and status transitions. Contains no dependencies on Drizzle, Next.js or PostgreSQL.
 *
 * ## Principles
 * 1. Historical integrity: Marks store obtained and maximum numbers; percentages and grades
 *    are computed rules evaluated dynamically, frozen only upon formal publication of student results.
 * 2. Status machine: Strict lifecycle progression prevents modifications to locked historical papers.
 * 3. Attribution: Every mark and correction is attributed to a user with timestamp and reason.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Status Constants & Types                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Full lifecycle of an examination.
 * - draft: Paper is created/configured, questions being set.
 * - scheduled: Date and hall/room allocated; students registered.
 * - ongoing: Examination is currently taking place.
 * - grading: Paper sitting finished; teachers are evaluating scripts and entering marks.
 * - published: Results released to students and parents.
 * - locked: Terminal archive state. Historical truth frozen; modifications strictly forbidden.
 */
export const EXAM_LIFECYCLE_STATUSES = [
  "draft",
  "scheduled",
  "ongoing",
  "grading",
  "published",
  "locked",
] as const;

export type ExamLifecycleStatus = (typeof EXAM_LIFECYCLE_STATUSES)[number];

/** Publication status corresponding to database column `examinations.status`. */
export const PUBLICATION_STATUSES = ["draft", "published", "locked"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/** Stored status of an individual student's examination mark. */
export const EXAM_MARK_STATUSES = [
  "pending",
  "absent",
  "submitted",
  "malpractice",
  "withheld",
] as const;

export type ExamMarkStatus = (typeof EXAM_MARK_STATUSES)[number];

/** Registration status for who is expected to sit. */
export const EXAM_REGISTRATION_STATUSES = [
  "registered",
  "withdrawn",
  "debarred",
  "absent",
  "submitted",
] as const;

export type ExamRegistrationStatus = (typeof EXAM_REGISTRATION_STATUSES)[number];

/** Overall outcome classification of a student's session result. */
export const RESULT_STATUSES = ["pass", "fail", "compartment", "withheld"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** Formal examination categories per PRD Module 20. */
export const EXAMINATION_TYPES = [
  "daily_test",
  "monthly_test",
  "grand_test",
  "midterm",
  "annual",
  "quiz",
  "assignment",
] as const;

export type ExaminationType = (typeof EXAMINATION_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Status Transitions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Legal next statuses for examination lifecycle.
 * Linear progression with operational resilience for scheduling adjustments.
 */
const LEGAL_LIFECYCLE_TRANSITIONS: Record<ExamLifecycleStatus, readonly ExamLifecycleStatus[]> = {
  draft: ["scheduled", "ongoing", "grading"],
  scheduled: ["ongoing", "grading", "draft"],
  ongoing: ["grading"],
  grading: ["published", "ongoing"],
  published: ["locked"],
  locked: [], // Terminal
};

/**
 * Assert that an examination lifecycle transition is legal.
 * Throws BusinessRuleError on illegal transitions.
 */
export function validateExamStatusTransition(
  currentStatus: ExamLifecycleStatus,
  nextStatus: ExamLifecycleStatus,
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!EXAM_LIFECYCLE_STATUSES.includes(currentStatus)) {
    throw new ValidationError(`Unknown current exam status "${currentStatus}".`, {
      status: [`Must be one of: ${EXAM_LIFECYCLE_STATUSES.join(", ")}`],
    });
  }

  if (!EXAM_LIFECYCLE_STATUSES.includes(nextStatus)) {
    throw new ValidationError(`Unknown target exam status "${nextStatus}".`, {
      status: [`Must be one of: ${EXAM_LIFECYCLE_STATUSES.join(", ")}`],
    });
  }

  if (currentStatus === "locked") {
    throw new BusinessRuleError("A locked examination cannot transition to any other status.", {
      userMessage: "This examination is permanently locked as historical record and cannot be changed.",
      details: { status: "Locked examination records are read-only." },
    });
  }

  const allowed = LEGAL_LIFECYCLE_TRANSITIONS[currentStatus];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessRuleError(
      `Cannot transition examination from "${currentStatus}" to "${nextStatus}".`,
      {
        userMessage: `Invalid exam status change from ${currentStatus} to ${nextStatus}. Allowed next states: ${allowed.join(", ") || "none"}.`,
        details: { status: `Allowed next states: ${allowed.join(", ")}` },
      },
    );
  }
}

/**
 * Legal next transitions for publication status (`draft` | `published` | `locked`).
 */
export function validatePublicationStatusTransition(
  currentStatus: PublicationStatus,
  nextStatus: PublicationStatus,
): void {
  if (currentStatus === nextStatus) return;

  if (currentStatus === "locked") {
    throw new BusinessRuleError("Cannot change status of a locked examination.", {
      userMessage: "This examination is locked and cannot be reopened.",
    });
  }

  if (currentStatus === "published" && nextStatus === "draft") {
    throw new BusinessRuleError(
      "A published examination cannot be reverted directly to draft status.",
      {
        userMessage:
          "Published examination results cannot be reset to draft. Post-publication amendments require an audited correction.",
      },
    );
  }

  if (currentStatus === "draft" && nextStatus === "locked") {
    throw new BusinessRuleError("Cannot lock an examination without publishing it first.", {
      userMessage: "Publish the examination before locking it.",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Percentage Calculation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Pure calculation of obtained percentage with exact 2-decimal arithmetic.
 *
 * @param obtainedMarks - Non-negative marks scored
 * @param totalMarks - Positive maximum marks
 * @returns Percentage rounded to 2 decimal places (0.00 to 100.00)
 */
export function calculatePercentage(obtainedMarks: number, totalMarks: number): number {
  if (typeof totalMarks !== "number" || !Number.isFinite(totalMarks) || totalMarks <= 0) {
    throw new ValidationError("Total marks must be a positive number.", {
      totalMarks: ["Total marks must be greater than zero."],
    });
  }

  if (typeof obtainedMarks !== "number" || !Number.isFinite(obtainedMarks) || obtainedMarks < 0) {
    throw new ValidationError("Obtained marks must be a non-negative number.", {
      obtainedMarks: ["Obtained marks cannot be negative."],
    });
  }

  if (obtainedMarks > totalMarks) {
    throw new ValidationError(
      `Obtained marks (${obtainedMarks}) cannot exceed total marks (${totalMarks}).`,
      {
        obtainedMarks: [`Marks obtained cannot exceed total marks (${totalMarks}).`],
      },
    );
  }

  const raw = (obtainedMarks / totalMarks) * 100;
  // Round to 2 decimal places with half-up precision
  return Math.round(raw * 100) / 100;
}

/** Formats a decimal percentage for user presentation (e.g. 84.5 -> "84.50%"). */
export function formatPercentage(percentage: number): string {
  if (!Number.isFinite(percentage)) return "0.00%";
  return `${percentage.toFixed(2)}%`;
}

/* -------------------------------------------------------------------------- */
/* Grading Scheme & Band Mapping                                              */
/* -------------------------------------------------------------------------- */

export interface GradingBandRule {
  readonly id?: string;
  readonly grade: string;
  /** Lower bound inclusive as a percentage (0 to 100). */
  readonly minPercentage?: number | null;
  /** Lower bound inclusive in marks. */
  readonly minMarks?: number | null;
  /** Numerical GPA point (e.g. 4.00, 3.50, 0.00). */
  readonly gradePoint?: number | null;
  /** Display sorting order. */
  readonly displayOrder?: number;
  /** True if this grade qualifies as passing. */
  readonly isPass: boolean;
}

export interface MatchedGrade {
  readonly grade: string;
  readonly gradePoint: number | null;
  readonly isPass: boolean;
  readonly band: GradingBandRule | null;
}

/**
 * Maps an obtained score or percentage to the appropriate grading band.
 * Bands are sorted by lower bound descending. The highest band whose lower bound
 * is met by the candidate score is chosen.
 */
export function matchGradingBand(
  score: { obtainedMarks: number; totalMarks: number },
  bands: readonly GradingBandRule[],
  basis: "percentage" | "absolute" = "percentage",
): MatchedGrade {
  if (!bands || bands.length === 0) {
    // Default fallback when no scheme is configured: pass if >= 40%
    const pct = calculatePercentage(score.obtainedMarks, score.totalMarks);
    const isPass = pct >= 40;
    return {
      grade: isPass ? "Pass" : "Fail",
      gradePoint: isPass ? 2.0 : 0.0,
      isPass,
      band: null,
    };
  }

  if (basis === "absolute") {
    // Sort descending by minMarks
    const sorted = [...bands]
      .filter((b) => typeof b.minMarks === "number")
      .sort((a, b) => (b.minMarks ?? 0) - (a.minMarks ?? 0));

    for (const band of sorted) {
      if (score.obtainedMarks >= (band.minMarks ?? 0)) {
        return {
          grade: band.grade,
          gradePoint: band.gradePoint ?? null,
          isPass: band.isPass,
          band,
        };
      }
    }
  } else {
    // Percentage basis
    const pct = calculatePercentage(score.obtainedMarks, score.totalMarks);
    // Sort descending by minPercentage
    const sorted = [...bands]
      .filter((b) => typeof b.minPercentage === "number")
      .sort((a, b) => (b.minPercentage ?? 0) - (a.minPercentage ?? 0));

    for (const band of sorted) {
      if (pct >= (band.minPercentage ?? 0)) {
        return {
          grade: band.grade,
          gradePoint: band.gradePoint ?? null,
          isPass: band.isPass,
          band,
        };
      }
    }
  }

  // If score is below lowest configured band, return lowest band or default Fail
  const lowest = bands[bands.length - 1];
  if (lowest) {
    return {
      grade: lowest.grade,
      gradePoint: lowest.gradePoint ?? null,
      isPass: lowest.isPass,
      band: lowest,
    };
  }

  return {
    grade: "F",
    gradePoint: 0.0,
    isPass: false,
    band: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Consolidated Student Results                                               */
/* -------------------------------------------------------------------------- */

export interface SubjectMarkInput {
  readonly subjectId: string;
  readonly subjectName?: string;
  readonly obtainedMarks: number | null;
  readonly totalMarks: number;
  readonly passMarks?: number | null;
  readonly status: ExamMarkStatus;
}

export interface ComputedStudentResult {
  readonly totalObtainedMarks: number;
  readonly totalMaximumMarks: number;
  readonly percentage: number;
  readonly grade: string;
  readonly gradePoint: number | null;
  readonly resultStatus: ResultStatus;
  readonly subjectsConsidered: number;
  readonly subjectsPassed: number;
  readonly subjectBreakdown: Record<
    string,
    {
      readonly obtained: number;
      readonly total: number;
      readonly grade: string | null;
      readonly isPass: boolean;
      readonly status: ExamMarkStatus;
    }
  >;
}

/**
 * Consolidates multiple subject examination marks into a final session result.
 *
 * Rules:
 * - Withheld if any subject was withheld or invalidated for malpractice.
 * - Passing requires all considered subjects to pass (or pass marks threshold reached).
 * - 1-2 subject failures qualify for "compartment" (supplementary examination).
 * - >2 subject failures classify as "fail".
 */
export function calculateStudentSessionResult(params: {
  readonly marks: readonly SubjectMarkInput[];
  readonly gradingBands?: readonly GradingBandRule[];
  readonly defaultPassPercentage?: number;
}): ComputedStudentResult {
  const { marks, gradingBands = [], defaultPassPercentage = 40 } = params;

  if (marks.length === 0) {
    throw new ValidationError("Cannot calculate result with zero subject marks.", {
      marks: ["At least one subject mark is required."],
    });
  }

  let totalObtained = 0;
  let totalMaximum = 0;
  let passedCount = 0;
  let consideredCount = 0;
  let hasMalpracticeOrWithheld = false;

  const breakdown: Record<
    string,
    {
      readonly obtained: number;
      readonly total: number;
      readonly grade: string | null;
      readonly isPass: boolean;
      readonly status: ExamMarkStatus;
    }
  > = {};

  for (const m of marks) {
    consideredCount += 1;
    totalMaximum += m.totalMarks;

    if (m.status === "malpractice" || m.status === "withheld") {
      hasMalpracticeOrWithheld = true;
      breakdown[m.subjectId] = {
        obtained: 0,
        total: m.totalMarks,
        grade: "Withheld",
        isPass: false,
        status: m.status,
      };
      continue;
    }

    if (m.status === "absent" || m.status === "pending" || m.obtainedMarks === null) {
      breakdown[m.subjectId] = {
        obtained: 0,
        total: m.totalMarks,
        grade: m.status === "absent" ? "Absent" : "Pending",
        isPass: false,
        status: m.status,
      };
      continue;
    }

    const obtained = m.obtainedMarks;
    totalObtained += obtained;

    const matched = matchGradingBand({ obtainedMarks: obtained, totalMarks: m.totalMarks }, gradingBands);

    // Subject pass rule: either scheme isPass or obtained >= passMarks or >= defaultPassPercentage
    const passThreshold = m.passMarks ?? (m.totalMarks * defaultPassPercentage) / 100;
    const isSubjectPass = obtained >= passThreshold && (matched.band ? matched.isPass : true);

    if (isSubjectPass) {
      passedCount += 1;
    }

    breakdown[m.subjectId] = {
      obtained,
      total: m.totalMarks,
      grade: matched.grade,
      isPass: isSubjectPass,
      status: m.status,
    };
  }

  const overallPercentage =
    totalMaximum > 0 ? calculatePercentage(totalObtained, totalMaximum) : 0;

  const overallGrade = matchGradingBand(
    { obtainedMarks: totalObtained, totalMarks: totalMaximum },
    gradingBands,
  );

  let resultStatus: ResultStatus;
  if (hasMalpracticeOrWithheld) {
    resultStatus = "withheld";
  } else if (passedCount === consideredCount) {
    resultStatus = "pass";
  } else {
    const failedCount = consideredCount - passedCount;
    // 1 or 2 failed subjects qualify for compartment
    if (failedCount <= 2 && consideredCount > 2) {
      resultStatus = "compartment";
    } else {
      resultStatus = "fail";
    }
  }

  return {
    totalObtainedMarks: Math.round(totalObtained * 100) / 100,
    totalMaximumMarks: Math.round(totalMaximum * 100) / 100,
    percentage: overallPercentage,
    grade: overallGrade.grade,
    gradePoint: overallGrade.gradePoint,
    resultStatus,
    subjectsConsidered: consideredCount,
    subjectsPassed: passedCount,
    subjectBreakdown: breakdown,
  };
}

/* -------------------------------------------------------------------------- */
/* Marks & Correction Validation                                              */
/* -------------------------------------------------------------------------- */

/**
 * Validates one examination mark entry row before persistence.
 */
export function validateExamMark(mark: {
  readonly status: string;
  readonly obtainedMarks: number | null;
  readonly totalMarks: number;
  readonly statusReason?: string | null;
  readonly enteredByUserId?: string | null;
}): void {
  if (!EXAM_MARK_STATUSES.includes(mark.status as ExamMarkStatus)) {
    throw new ValidationError(`Unknown exam mark status "${mark.status}".`, {
      status: [`Must be one of: ${EXAM_MARK_STATUSES.join(", ")}`],
    });
  }

  if (typeof mark.totalMarks !== "number" || mark.totalMarks <= 0) {
    throw new ValidationError("Total marks must be positive.", {
      totalMarks: ["Total marks must be greater than zero."],
    });
  }

  if (mark.status === "submitted") {
    if (mark.obtainedMarks === null || mark.obtainedMarks === undefined) {
      throw new ValidationError("A submitted mark must record obtained marks.", {
        obtainedMarks: ["Obtained marks are required for submitted status."],
      });
    }
    if (mark.obtainedMarks < 0 || mark.obtainedMarks > mark.totalMarks) {
      throw new ValidationError(
        `Obtained marks (${mark.obtainedMarks}) must be between 0 and total marks (${mark.totalMarks}).`,
        {
          obtainedMarks: [`Marks must be between 0 and ${mark.totalMarks}.`],
        },
      );
    }
    if (!mark.enteredByUserId) {
      throw new BusinessRuleError("A submitted mark must name the author who entered it.", {
        userMessage: "Confirm the staff member entering these marks.",
      });
    }
  } else {
    // Non-submitted (absent, pending, malpractice, withheld) must not have obtained marks
    if (mark.obtainedMarks !== null && mark.obtainedMarks !== undefined) {
      throw new ValidationError(`Obtained marks cannot be entered for "${mark.status}" status.`, {
        obtainedMarks: [`Marks can only be recorded when status is "submitted".`],
      });
    }
  }

  if (mark.status === "malpractice" || mark.status === "withheld") {
    if (!mark.statusReason || mark.statusReason.trim().length === 0) {
      throw new BusinessRuleError(
        `A status reason is mandatory when marking a student as "${mark.status}".`,
        {
          userMessage: `Please provide an official explanation for marking as ${mark.status}.`,
          details: { statusReason: "Reason is required." },
        },
      );
    }
  }
}

/**
 * Validates a mark correction made after publication.
 */
export function validateMarkCorrection(correction: {
  readonly previousMarks: number | null;
  readonly correctedMarks: number;
  readonly totalMarks: number;
  readonly reason: string;
  readonly correctedByUserId: string;
}): void {
  if (correction.previousMarks === correction.correctedMarks) {
    throw new ValidationError("A correction must actually alter the marks.", {
      correctedMarks: ["Corrected marks must differ from previous marks."],
    });
  }

  if (
    typeof correction.correctedMarks !== "number" ||
    correction.correctedMarks < 0 ||
    correction.correctedMarks > correction.totalMarks
  ) {
    throw new ValidationError(
      `Corrected marks (${correction.correctedMarks}) must be between 0 and total marks (${correction.totalMarks}).`,
      {
        correctedMarks: [`Enter marks between 0 and ${correction.totalMarks}.`],
      },
    );
  }

  if (!correction.reason || correction.reason.trim().length === 0) {
    throw new BusinessRuleError("An audit reason is required for every marks correction.", {
      userMessage: "Please provide a reason explaining why this mark is being corrected.",
      details: { reason: "Correction reason is mandatory." },
    });
  }

  if (!correction.correctedByUserId) {
    throw new BusinessRuleError("A correction must attribute who made the change.", {
      userMessage: "User identity is required to record a correction.",
    });
  }
}
