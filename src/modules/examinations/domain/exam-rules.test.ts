/**
 * Unit tests for Examinations domain rules (`PRD.md` MODULE 20, `PHASES.md` §28 Phase 20).
 * Tests business assertions in pure isolation with no database dependency.
 */

import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  calculatePercentage,
  calculateStudentSessionResult,
  EXAM_LIFECYCLE_STATUSES,
  EXAM_MARK_STATUSES,
  formatPercentage,
  type GradingBandRule,
  matchGradingBand,
  PUBLICATION_STATUSES,
  type SubjectMarkInput,
  validateExamMark,
  validateExamStatusTransition,
  validateMarkCorrection,
  validatePublicationStatusTransition,
} from "./exam-rules";

describe("examination status constants", () => {
  it("defines the complete lifecycle progression", () => {
    expect(EXAM_LIFECYCLE_STATUSES).toEqual([
      "draft",
      "scheduled",
      "ongoing",
      "grading",
      "published",
      "locked",
    ]);
  });

  it("defines database publication statuses", () => {
    expect(PUBLICATION_STATUSES).toEqual(["draft", "published", "locked"]);
  });

  it("defines marks statuses", () => {
    expect(EXAM_MARK_STATUSES).toEqual([
      "pending",
      "absent",
      "submitted",
      "malpractice",
      "withheld",
    ]);
  });
});

describe("examination lifecycle status transitions", () => {
  it("allows standard linear progression: draft -> scheduled -> ongoing -> grading -> published -> locked", () => {
    expect(() => validateExamStatusTransition("draft", "scheduled")).not.toThrow();
    expect(() => validateExamStatusTransition("scheduled", "ongoing")).not.toThrow();
    expect(() => validateExamStatusTransition("ongoing", "grading")).not.toThrow();
    expect(() => validateExamStatusTransition("grading", "published")).not.toThrow();
    expect(() => validateExamStatusTransition("published", "locked")).not.toThrow();
  });

  it("allows fast-track transitions: draft directly to ongoing or grading", () => {
    expect(() => validateExamStatusTransition("draft", "ongoing")).not.toThrow();
    expect(() => validateExamStatusTransition("draft", "grading")).not.toThrow();
  });

  it("allows operational rollbacks: scheduled back to draft, grading back to ongoing", () => {
    expect(() => validateExamStatusTransition("scheduled", "draft")).not.toThrow();
    expect(() => validateExamStatusTransition("grading", "ongoing")).not.toThrow();
  });

  it("no-op when transitioning to the same status", () => {
    expect(() => validateExamStatusTransition("draft", "draft")).not.toThrow();
    expect(() => validateExamStatusTransition("published", "published")).not.toThrow();
  });

  it("strictly forbids any transition from locked state", () => {
    expect(() => validateExamStatusTransition("locked", "draft")).toThrow(BusinessRuleError);
    expect(() => validateExamStatusTransition("locked", "published")).toThrow(BusinessRuleError);
    expect(() => validateExamStatusTransition("locked", "grading")).toThrow(BusinessRuleError);
  });

  it("forbids illegal backwards jumps like published -> draft", () => {
    expect(() => validateExamStatusTransition("published", "draft")).toThrow(BusinessRuleError);
    expect(() => validateExamStatusTransition("published", "ongoing")).toThrow(BusinessRuleError);
  });

  it("validates publication status transitions", () => {
    expect(() => validatePublicationStatusTransition("draft", "published")).not.toThrow();
    expect(() => validatePublicationStatusTransition("published", "locked")).not.toThrow();
    expect(() => validatePublicationStatusTransition("published", "draft")).toThrow(BusinessRuleError);
    expect(() => validatePublicationStatusTransition("draft", "locked")).toThrow(BusinessRuleError);
    expect(() => validatePublicationStatusTransition("locked", "draft")).toThrow(BusinessRuleError);
  });
});

describe("percentage calculation", () => {
  it("calculates accurate percentage rounded to 2 decimal places", () => {
    expect(calculatePercentage(50, 100)).toBe(50);
    expect(calculatePercentage(75, 100)).toBe(75);
    expect(calculatePercentage(33, 75)).toBe(44);
    expect(calculatePercentage(85.5, 100)).toBe(85.5);
    expect(calculatePercentage(1, 3)).toBe(33.33);
    expect(calculatePercentage(2, 3)).toBe(66.67);
  });

  it("handles boundary values 0 and full marks", () => {
    expect(calculatePercentage(0, 100)).toBe(0);
    expect(calculatePercentage(100, 100)).toBe(100);
  });

  it("refuses negative obtained marks", () => {
    expect(() => calculatePercentage(-5, 100)).toThrow(ValidationError);
  });

  it("refuses zero or negative total marks", () => {
    expect(() => calculatePercentage(50, 0)).toThrow(ValidationError);
    expect(() => calculatePercentage(50, -100)).toThrow(ValidationError);
  });

  it("refuses obtained marks exceeding total marks", () => {
    expect(() => calculatePercentage(105, 100)).toThrow(ValidationError);
  });

  it("formats percentage correctly", () => {
    expect(formatPercentage(84.5)).toBe("84.50%");
    expect(formatPercentage(100)).toBe("100.00%");
    expect(formatPercentage(0)).toBe("0.00%");
  });
});

describe("grading scheme & band mapping", () => {
  const standardBands: readonly GradingBandRule[] = [
    { grade: "A+", minPercentage: 90, gradePoint: 4.0, isPass: true },
    { grade: "A", minPercentage: 80, gradePoint: 3.7, isPass: true },
    { grade: "B", minPercentage: 70, gradePoint: 3.0, isPass: true },
    { grade: "C", minPercentage: 60, gradePoint: 2.0, isPass: true },
    { grade: "D", minPercentage: 50, gradePoint: 1.0, isPass: true },
    { grade: "F", minPercentage: 0, gradePoint: 0.0, isPass: false },
  ];

  it("maps score to correct grade on percentage basis", () => {
    const resAplus = matchGradingBand({ obtainedMarks: 95, totalMarks: 100 }, standardBands);
    expect(resAplus.grade).toBe("A+");
    expect(resAplus.gradePoint).toBe(4.0);
    expect(resAplus.isPass).toBe(true);

    const resB = matchGradingBand({ obtainedMarks: 72, totalMarks: 100 }, standardBands);
    expect(resB.grade).toBe("B");
    expect(resB.gradePoint).toBe(3.0);
    expect(resB.isPass).toBe(true);

    const resF = matchGradingBand({ obtainedMarks: 42, totalMarks: 100 }, standardBands);
    expect(resF.grade).toBe("F");
    expect(resF.gradePoint).toBe(0.0);
    expect(resF.isPass).toBe(false);
  });

  it("maps score to correct grade on absolute marks basis", () => {
    const absoluteBands: readonly GradingBandRule[] = [
      { grade: "Distinction", minMarks: 85, gradePoint: 4.0, isPass: true },
      { grade: "Merit", minMarks: 65, gradePoint: 3.0, isPass: true },
      { grade: "Pass", minMarks: 40, gradePoint: 2.0, isPass: true },
      { grade: "Fail", minMarks: 0, gradePoint: 0.0, isPass: false },
    ];

    const match1 = matchGradingBand(
      { obtainedMarks: 88, totalMarks: 100 },
      absoluteBands,
      "absolute",
    );
    expect(match1.grade).toBe("Distinction");

    const match2 = matchGradingBand(
      { obtainedMarks: 64, totalMarks: 100 },
      absoluteBands,
      "absolute",
    );
    expect(match2.grade).toBe("Pass");
  });

  it("provides sensible default when no bands are configured", () => {
    const defaultPass = matchGradingBand({ obtainedMarks: 50, totalMarks: 100 }, []);
    expect(defaultPass.grade).toBe("Pass");
    expect(defaultPass.isPass).toBe(true);

    const defaultFail = matchGradingBand({ obtainedMarks: 30, totalMarks: 100 }, []);
    expect(defaultFail.grade).toBe("Fail");
    expect(defaultFail.isPass).toBe(false);
  });
});

describe("consolidated student session results", () => {
  const standardBands: readonly GradingBandRule[] = [
    { grade: "A+", minPercentage: 90, gradePoint: 4.0, isPass: true },
    { grade: "A", minPercentage: 80, gradePoint: 3.7, isPass: true },
    { grade: "B", minPercentage: 70, gradePoint: 3.0, isPass: true },
    { grade: "C", minPercentage: 60, gradePoint: 2.0, isPass: true },
    { grade: "D", minPercentage: 40, gradePoint: 1.0, isPass: true },
    { grade: "F", minPercentage: 0, gradePoint: 0.0, isPass: false },
  ];

  it("calculates pass result when all subjects are passed", () => {
    const marks: SubjectMarkInput[] = [
      { subjectId: "sub-1", totalMarks: 100, obtainedMarks: 85, passMarks: 40, status: "submitted" },
      { subjectId: "sub-2", totalMarks: 100, obtainedMarks: 75, passMarks: 40, status: "submitted" },
      { subjectId: "sub-3", totalMarks: 100, obtainedMarks: 90, passMarks: 40, status: "submitted" },
    ];

    const result = calculateStudentSessionResult({ marks, gradingBands: standardBands });
    expect(result.resultStatus).toBe("pass");
    expect(result.subjectsPassed).toBe(3);
    expect(result.subjectsConsidered).toBe(3);
    expect(result.totalObtainedMarks).toBe(250);
    expect(result.totalMaximumMarks).toBe(300);
    expect(result.percentage).toBe(83.33);
    expect(result.grade).toBe("A");
  });

  it("classifies as compartment when 1 subject fails in multi-subject session", () => {
    const marks: SubjectMarkInput[] = [
      { subjectId: "sub-1", totalMarks: 100, obtainedMarks: 85, passMarks: 40, status: "submitted" },
      { subjectId: "sub-2", totalMarks: 100, obtainedMarks: 32, passMarks: 40, status: "submitted" }, // Fail
      { subjectId: "sub-3", totalMarks: 100, obtainedMarks: 90, passMarks: 40, status: "submitted" },
    ];

    const result = calculateStudentSessionResult({ marks, gradingBands: standardBands });
    expect(result.resultStatus).toBe("compartment");
    expect(result.subjectsPassed).toBe(2);
    expect(result.subjectsConsidered).toBe(3);
  });

  it("classifies as fail when more than 2 subjects fail", () => {
    const marks: SubjectMarkInput[] = [
      { subjectId: "sub-1", totalMarks: 100, obtainedMarks: 25, passMarks: 40, status: "submitted" },
      { subjectId: "sub-2", totalMarks: 100, obtainedMarks: 30, passMarks: 40, status: "submitted" },
      { subjectId: "sub-3", totalMarks: 100, obtainedMarks: 20, passMarks: 40, status: "submitted" },
      { subjectId: "sub-4", totalMarks: 100, obtainedMarks: 80, passMarks: 40, status: "submitted" },
    ];

    const result = calculateStudentSessionResult({ marks, gradingBands: standardBands });
    expect(result.resultStatus).toBe("fail");
    expect(result.subjectsPassed).toBe(1);
  });

  it("classifies as withheld if any subject mark is marked for malpractice or withheld", () => {
    const marks: SubjectMarkInput[] = [
      { subjectId: "sub-1", totalMarks: 100, obtainedMarks: 95, passMarks: 40, status: "submitted" },
      { subjectId: "sub-2", totalMarks: 100, obtainedMarks: null, passMarks: 40, status: "malpractice" },
      { subjectId: "sub-3", totalMarks: 100, obtainedMarks: 85, passMarks: 40, status: "submitted" },
    ];

    const result = calculateStudentSessionResult({ marks, gradingBands: standardBands });
    expect(result.resultStatus).toBe("withheld");
    expect(result.subjectBreakdown["sub-2"]?.grade).toBe("Withheld");
  });

  it("refuses to compute result with empty marks array", () => {
    expect(() => calculateStudentSessionResult({ marks: [] })).toThrow(ValidationError);
  });
});

describe("marks entry and correction validation", () => {
  it("validates a correct submitted mark", () => {
    expect(() =>
      validateExamMark({
        status: "submitted",
        obtainedMarks: 85,
        totalMarks: 100,
        enteredByUserId: "teacher-1",
      }),
    ).not.toThrow();
  });

  it("refuses a submitted mark without obtained marks", () => {
    expect(() =>
      validateExamMark({
        status: "submitted",
        obtainedMarks: null,
        totalMarks: 100,
        enteredByUserId: "teacher-1",
      }),
    ).toThrow(ValidationError);
  });

  it("refuses a submitted mark without entering user", () => {
    expect(() =>
      validateExamMark({
        status: "submitted",
        obtainedMarks: 85,
        totalMarks: 100,
        enteredByUserId: null,
      }),
    ).toThrow(BusinessRuleError);
  });

  it("refuses obtained marks for absent student", () => {
    expect(() =>
      validateExamMark({
        status: "absent",
        obtainedMarks: 0, // Should be null
        totalMarks: 100,
      }),
    ).toThrow(ValidationError);
  });

  it("mandates statusReason for malpractice and withheld", () => {
    expect(() =>
      validateExamMark({
        status: "malpractice",
        obtainedMarks: null,
        totalMarks: 100,
        statusReason: null,
      }),
    ).toThrow(BusinessRuleError);

    expect(() =>
      validateExamMark({
        status: "withheld",
        obtainedMarks: null,
        totalMarks: 100,
        statusReason: "Investigation pending",
      }),
    ).not.toThrow();
  });

  it("validates mark correction", () => {
    expect(() =>
      validateMarkCorrection({
        previousMarks: 45,
        correctedMarks: 50,
        totalMarks: 100,
        reason: "Recounting error in section B",
        correctedByUserId: "admin-1",
      }),
    ).not.toThrow();

    // Refuses identical marks
    expect(() =>
      validateMarkCorrection({
        previousMarks: 45,
        correctedMarks: 45,
        totalMarks: 100,
        reason: "No change",
        correctedByUserId: "admin-1",
      }),
    ).toThrow(ValidationError);

    // Refuses missing reason
    expect(() =>
      validateMarkCorrection({
        previousMarks: 45,
        correctedMarks: 50,
        totalMarks: 100,
        reason: "",
        correctedByUserId: "admin-1",
      }),
    ).toThrow(BusinessRuleError);

    // Refuses missing user
    expect(() =>
      validateMarkCorrection({
        previousMarks: 45,
        correctedMarks: 50,
        totalMarks: 100,
        reason: "Valid reason",
        correctedByUserId: "",
      }),
    ).toThrow(BusinessRuleError);
  });
});
