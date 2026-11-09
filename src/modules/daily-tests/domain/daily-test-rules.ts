/**
 * Daily test domain rules (`PRD.md` MODULE 21, `PHASES.md` §29, `src/db/schema/daily-tests.ts`).
 *
 * Pure domain logic — zero I/O, zero Drizzle, zero Next.js, zero Zod.
 * Enforces business invariants for daily tests, evaluations, passing criteria, and corrections.
 */
import { BusinessRuleError, ValidationError } from "@/shared/errors";

export const DAILY_TEST_STATUSES = ["draft", "published", "locked"] as const;
export type DailyTestPublicationStatus = (typeof DAILY_TEST_STATUSES)[number];

export const EVALUATION_STATUSES = [
  "pending",
  "present",
  "absent",
  "excused",
  "malpractice",
] as const;
export type DailyTestEvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const DEFAULT_PASSING_PERCENTAGE = 40;

/**
 * Validates total marks for a test.
 * Must be a positive number up to 1000 with at most 2 decimal places.
 */
export function assertTotalMarks(totalMarks: number): void {
  if (typeof totalMarks !== "number" || Number.isNaN(totalMarks) || totalMarks <= 0) {
    throw new ValidationError("Total marks must be greater than zero.", {
      totalMarks: ["Total marks must be greater than zero."],
    });
  }
  if (totalMarks > 1000) {
    throw new ValidationError("Total marks cannot exceed 1000.", {
      totalMarks: ["Total marks cannot exceed 1000."],
    });
  }
  // Max 2 decimal places check
  const decimalPart = totalMarks.toString().split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    throw new ValidationError("Total marks cannot have more than 2 decimal places (at most 2 decimal places).", {
      totalMarks: ["Enter marks with at most 2 decimal places."],
    });
  }
}

/**
 * Asserts the evaluation marks pair invariant:
 * - Only status = 'present' carries obtained marks.
 * - If status = 'present', obtainedMarks must be >= 0 and <= totalMarks.
 * - An absent/excused/malpractice/pending student must not carry obtained marks.
 */
export function assertObtainedMarks(
  obtainedMarks: number | null | undefined,
  totalMarks: number,
  status: DailyTestEvaluationStatus,
): void {
  assertTotalMarks(totalMarks);

  if (status === "present") {
    if (obtainedMarks === null || obtainedMarks === undefined || Number.isNaN(obtainedMarks)) {
      throw new ValidationError("Obtained marks are required when student is present.", {
        obtainedMarks: ["Enter obtained marks for present student."],
      });
    }
    if (obtainedMarks < 0) {
      throw new ValidationError("Obtained marks cannot be negative.", {
        obtainedMarks: ["Marks cannot be negative."],
      });
    }
    if (obtainedMarks > totalMarks) {
      throw new BusinessRuleError(
        `Obtained marks (${obtainedMarks}) cannot exceed total marks (${totalMarks}).`,
        {
          userMessage: `Obtained marks (${obtainedMarks}) cannot exceed total marks (${totalMarks}).`,
        },
      );
    }
    const decimalPart = obtainedMarks.toString().split(".")[1];
    if (decimalPart && decimalPart.length > 2) {
      throw new ValidationError(
        "Obtained marks cannot have more than 2 decimal places (at most 2 decimal places).",
        {
          obtainedMarks: ["Enter marks with at most 2 decimal places."],
        },
      );
    }
  } else {
    if (obtainedMarks !== null && obtainedMarks !== undefined) {
      throw new ValidationError(
        `Only present students can carry marks. Status '${status}' cannot have obtained marks.`,
        {
          obtainedMarks: ["Clear marks when student is not present."],
        },
      );
    }
  }
}

/**
 * Asserts that excused and malpractice statuses carry an explanatory reason.
 */
export function assertEvaluationReason(
  status: DailyTestEvaluationStatus,
  reason?: string | null | undefined,
): void {
  if (status === "excused" || status === "malpractice") {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError(
        `A reason is required when status is marked as '${status}'.`,
        {
          statusReason: [`Please provide an explanation for status: ${status}.`],
        },
        {
          userMessage: `Please provide a reason why this student is marked as ${status}.`,
        },
      );
    }
  }
}

/**
 * Calculates percentage from obtainedMarks and totalMarks, bounded [0, 100].
 */
export function calculatePercentage(obtainedMarks: number, totalMarks: number): number {
  if (totalMarks <= 0) return 0;
  if (obtainedMarks <= 0) return 0;
  const raw = (obtainedMarks / totalMarks) * 100;
  const clamped = Math.min(100, Math.max(0, raw));
  return Number(clamped.toFixed(2));
}

/**
 * Determines whether the obtained marks meet passing criteria.
 */
export function isPassing(
  obtainedMarks: number,
  totalMarks: number,
  passingThreshold = DEFAULT_PASSING_PERCENTAGE,
): boolean {
  const percentage = calculatePercentage(obtainedMarks, totalMarks);
  return percentage >= passingThreshold;
}

/**
 * Determines the academic performance letter grade for a given percentage.
 */
export function calculateGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  if (percentage >= 40) return "E";
  return "F";
}

/**
 * Returns UI badge tone for evaluation statuses.
 */
export function evaluationStatusBadgeTone(
  status: DailyTestEvaluationStatus,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "present":
      return "success";
    case "absent":
      return "danger";
    case "excused":
      return "info";
    case "malpractice":
      return "danger";
    case "pending":
    default:
      return "neutral";
  }
}

/**
 * Asserts that an evaluation can be corrected append-only:
 * - Marks must differ.
 * - Corrected marks must be non-negative and <= totalMarks.
 * - Non-empty audit reason must be provided.
 */
export function assertCanCorrectEvaluation(params: {
  readonly previousMarks: number | null | undefined;
  readonly correctedMarks: number;
  readonly totalMarks: number;
  readonly reason: string;
}): void {
  const { previousMarks, correctedMarks, totalMarks, reason } = params;

  if (typeof correctedMarks !== "number" || Number.isNaN(correctedMarks) || correctedMarks < 0) {
    throw new ValidationError("Corrected marks must be a non-negative number.", {
      correctedMarks: ["Marks must be zero or greater."],
    });
  }

  if (correctedMarks > totalMarks) {
    throw new BusinessRuleError(
      `Corrected marks (${correctedMarks}) cannot exceed total marks (${totalMarks}).`,
      {
        userMessage: `Corrected marks (${correctedMarks}) cannot exceed total marks (${totalMarks}).`,
      },
    );
  }

  if (previousMarks !== null && previousMarks !== undefined && previousMarks === correctedMarks) {
    throw new BusinessRuleError(
      "Corrected marks must be different from previous marks.",
      {
        userMessage: "The new mark is identical to the current mark. No correction needed.",
      },
    );
  }

  if (!reason || reason.trim().length < 3) {
    throw new ValidationError(
      "A reason of at least 3 characters is required for mark corrections.",
      {
        reason: ["Please provide a detailed reason for correcting this mark."],
      },
      {
        userMessage: "Please provide a valid explanation for why this mark was corrected.",
      },
    );
  }
}

/**
 * Asserts the test scope invariant:
 * At least one of `classId` or `sectionId` must be non-null.
 */
export function assertDailyTestScope(scope: {
  readonly classId?: string | null | undefined;
  readonly sectionId?: string | null | undefined;
}): void {
  const hasScope =
    (scope.classId !== null && scope.classId !== undefined && scope.classId.trim() !== "") ||
    (scope.sectionId !== null && scope.sectionId !== undefined && scope.sectionId.trim() !== "");

  if (!hasScope) {
    throw new ValidationError(
      "A daily test must specify either a class or a section scope.",
      { scope: ["Select at least a class or section."] },
      { userMessage: "Please choose a class or section for this daily test." },
    );
  }
}

/**
 * Validates legal publication status transitions (`draft` -> `published` -> `locked`).
 */
export function validateDailyTestStatusTransition(
  currentStatus: DailyTestPublicationStatus,
  nextStatus: DailyTestPublicationStatus,
): void {
  if (currentStatus === nextStatus) return;

  if (currentStatus === "locked") {
    throw new BusinessRuleError("Cannot modify the status of a locked daily test.", {
      userMessage: "This daily test is locked and cannot be reopened or edited.",
    });
  }

  if (currentStatus === "published" && nextStatus === "draft") {
    throw new BusinessRuleError(
      "A published daily test cannot be reverted directly to draft status.",
      {
        userMessage:
          "Published tests cannot be reverted to draft. Any mark adjustments require an audited correction.",
      },
    );
  }

  if (currentStatus === "draft" && nextStatus === "locked") {
    throw new BusinessRuleError(
      "A draft daily test must be published before it can be locked.",
      {
        userMessage: "Please publish the test marks before locking the test.",
      },
    );
  }
}

export interface StudentTestScoreEvaluation {
  readonly status: DailyTestEvaluationStatus;
  readonly obtainedMarks: number | null;
  readonly percentage: number | null;
  readonly grade: string | null;
  readonly isPassing: boolean;
}

/**
 * Validates student test marks and evaluates score, percentage, grade, and passing status.
 */
export function evaluateStudentTestScore(params: {
  readonly status: DailyTestEvaluationStatus;
  readonly obtainedMarks?: number | null | undefined;
  readonly totalMarks: number;
  readonly statusReason?: string | null | undefined;
  readonly passingThreshold?: number | undefined;
}): StudentTestScoreEvaluation {
  const {
    status,
    obtainedMarks,
    totalMarks,
    statusReason,
    passingThreshold = DEFAULT_PASSING_PERCENTAGE,
  } = params;

  assertTotalMarks(totalMarks);
  assertObtainedMarks(obtainedMarks, totalMarks, status);
  assertEvaluationReason(status, statusReason);

  if (status === "present" && obtainedMarks !== null && obtainedMarks !== undefined) {
    const percentage = calculatePercentage(obtainedMarks, totalMarks);
    const grade = calculateGrade(percentage);
    const passing = isPassing(obtainedMarks, totalMarks, passingThreshold);
    return {
      status,
      obtainedMarks,
      percentage,
      grade,
      isPassing: passing,
    };
  }

  return {
    status,
    obtainedMarks: null,
    percentage: null,
    grade: null,
    isPassing: false,
  };
}

