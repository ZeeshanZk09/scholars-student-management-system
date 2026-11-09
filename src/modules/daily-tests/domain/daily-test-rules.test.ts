import { describe, expect, it } from "vitest";
import {
  assertCanCorrectEvaluation,
  assertDailyTestScope,
  assertEvaluationReason,
  assertObtainedMarks,
  assertTotalMarks,
  calculateGrade,
  calculatePercentage,
  evaluationStatusBadgeTone,
  evaluateStudentTestScore,
  isPassing,
  validateDailyTestStatusTransition,
} from "./daily-test-rules";

describe("assertTotalMarks", () => {
  it("accepts valid positive total marks", () => {
    expect(() => assertTotalMarks(10)).not.toThrow();
    expect(() => assertTotalMarks(25.5)).not.toThrow();
    expect(() => assertTotalMarks(100)).not.toThrow();
    expect(() => assertTotalMarks(1000)).not.toThrow();
  });

  it("rejects non-positive marks", () => {
    expect(() => assertTotalMarks(0)).toThrow("Total marks must be greater than zero");
    expect(() => assertTotalMarks(-5)).toThrow("Total marks must be greater than zero");
    expect(() => assertTotalMarks(Number.NaN)).toThrow();
  });

  it("rejects marks exceeding 1000", () => {
    expect(() => assertTotalMarks(1001)).toThrow("Total marks cannot exceed 1000");
  });

  it("rejects marks with more than 2 decimal places", () => {
    expect(() => assertTotalMarks(10.555)).toThrow("at most 2 decimal places");
  });
});

describe("assertObtainedMarks", () => {
  const totalMarks = 25;

  it("accepts valid obtained marks for present student", () => {
    expect(() => assertObtainedMarks(0, totalMarks, "present")).not.toThrow();
    expect(() => assertObtainedMarks(12.5, totalMarks, "present")).not.toThrow();
    expect(() => assertObtainedMarks(25, totalMarks, "present")).not.toThrow();
  });

  it("requires obtained marks when student is present", () => {
    expect(() => assertObtainedMarks(null, totalMarks, "present")).toThrow(
      "Obtained marks are required when student is present",
    );
    expect(() => assertObtainedMarks(undefined, totalMarks, "present")).toThrow(
      "Obtained marks are required when student is present",
    );
  });

  it("rejects negative obtained marks", () => {
    expect(() => assertObtainedMarks(-1, totalMarks, "present")).toThrow("cannot be negative");
  });

  it("rejects obtained marks exceeding total marks", () => {
    expect(() => assertObtainedMarks(26, totalMarks, "present")).toThrow(
      "cannot exceed total marks",
    );
  });

  it("rejects more than 2 decimal places in obtained marks", () => {
    expect(() => assertObtainedMarks(15.123, totalMarks, "present")).toThrow(
      "at most 2 decimal places",
    );
  });

  it("rejects obtained marks when student is absent, excused, malpractice, or pending", () => {
    expect(() => assertObtainedMarks(10, totalMarks, "absent")).toThrow(
      "Only present students can carry marks",
    );
    expect(() => assertObtainedMarks(10, totalMarks, "excused")).toThrow(
      "Only present students can carry marks",
    );
    expect(() => assertObtainedMarks(10, totalMarks, "malpractice")).toThrow(
      "Only present students can carry marks",
    );
    expect(() => assertObtainedMarks(10, totalMarks, "pending")).toThrow(
      "Only present students can carry marks",
    );
  });

  it("accepts null/undefined marks for non-present statuses", () => {
    expect(() => assertObtainedMarks(null, totalMarks, "absent")).not.toThrow();
    expect(() => assertObtainedMarks(undefined, totalMarks, "excused")).not.toThrow();
    expect(() => assertObtainedMarks(null, totalMarks, "malpractice")).not.toThrow();
    expect(() => assertObtainedMarks(null, totalMarks, "pending")).not.toThrow();
  });
});

describe("assertEvaluationReason", () => {
  it("requires reason for excused and malpractice", () => {
    expect(() => assertEvaluationReason("excused", null)).toThrow("reason is required");
    expect(() => assertEvaluationReason("excused", "   ")).toThrow("reason is required");
    expect(() => assertEvaluationReason("malpractice", "")).toThrow("reason is required");

    expect(() => assertEvaluationReason("excused", "Medical emergency")).not.toThrow();
    expect(() => assertEvaluationReason("malpractice", "Used unauthorized paper")).not.toThrow();
  });

  it("does not require reason for present, absent, pending", () => {
    expect(() => assertEvaluationReason("present", null)).not.toThrow();
    expect(() => assertEvaluationReason("absent", null)).not.toThrow();
    expect(() => assertEvaluationReason("pending", null)).not.toThrow();
  });
});

describe("calculatePercentage & isPassing", () => {
  it("calculates percentage accurately to 2 decimal places", () => {
    expect(calculatePercentage(20, 25)).toBe(80);
    expect(calculatePercentage(10, 30)).toBe(33.33);
    expect(calculatePercentage(0, 50)).toBe(0);
    expect(calculatePercentage(50, 50)).toBe(100);
  });

  it("handles edge cases safely", () => {
    expect(calculatePercentage(0, 0)).toBe(0);
    expect(calculatePercentage(-5, 50)).toBe(0);
  });

  it("checks passing criteria with default threshold (40%)", () => {
    expect(isPassing(10, 25)).toBe(true); // 40%
    expect(isPassing(9.9, 25)).toBe(false); // 39.6%
    expect(isPassing(15, 25)).toBe(true); // 60%
  });

  it("checks passing criteria with custom threshold", () => {
    expect(isPassing(10, 20, 50)).toBe(true); // 50%
    expect(isPassing(9, 20, 50)).toBe(false); // 45%
  });
});

describe("calculateGrade", () => {
  it("maps percentages to expected grades", () => {
    expect(calculateGrade(95)).toBe("A+");
    expect(calculateGrade(90)).toBe("A+");
    expect(calculateGrade(85)).toBe("A");
    expect(calculateGrade(80)).toBe("A");
    expect(calculateGrade(75)).toBe("B");
    expect(calculateGrade(65)).toBe("C");
    expect(calculateGrade(55)).toBe("D");
    expect(calculateGrade(45)).toBe("E");
    expect(calculateGrade(39)).toBe("F");
    expect(calculateGrade(0)).toBe("F");
  });
});

describe("evaluationStatusBadgeTone", () => {
  it("returns correct tone for all statuses", () => {
    expect(evaluationStatusBadgeTone("present")).toBe("success");
    expect(evaluationStatusBadgeTone("absent")).toBe("danger");
    expect(evaluationStatusBadgeTone("excused")).toBe("info");
    expect(evaluationStatusBadgeTone("malpractice")).toBe("danger");
    expect(evaluationStatusBadgeTone("pending")).toBe("neutral");
  });
});

describe("assertCanCorrectEvaluation", () => {
  it("accepts valid corrections", () => {
    expect(() =>
      assertCanCorrectEvaluation({
        previousMarks: 15,
        correctedMarks: 18,
        totalMarks: 20,
        reason: "Recounted page 2 marks",
      }),
    ).not.toThrow();
  });

  it("rejects corrections when marks are unchanged", () => {
    expect(() =>
      assertCanCorrectEvaluation({
        previousMarks: 15,
        correctedMarks: 15,
        totalMarks: 20,
        reason: "Checking marks",
      }),
    ).toThrow("Corrected marks must be different");
  });

  it("rejects corrected marks exceeding total marks", () => {
    expect(() =>
      assertCanCorrectEvaluation({
        previousMarks: 15,
        correctedMarks: 25,
        totalMarks: 20,
        reason: "Recounted",
      }),
    ).toThrow("cannot exceed total marks");
  });

  it("requires a non-trivial reason", () => {
    expect(() =>
      assertCanCorrectEvaluation({
        previousMarks: 15,
        correctedMarks: 18,
        totalMarks: 20,
        reason: "no",
      }),
    ).toThrow("at least 3 characters");
  });
});

describe("assertDailyTestScope", () => {
  it("passes when classId or sectionId is provided", () => {
    expect(() => assertDailyTestScope({ classId: "cls-1" })).not.toThrow();
    expect(() => assertDailyTestScope({ sectionId: "sec-1" })).not.toThrow();
    expect(() => assertDailyTestScope({ classId: "cls-1", sectionId: "sec-1" })).not.toThrow();
  });

  it("rejects when neither classId nor sectionId is provided", () => {
    expect(() => assertDailyTestScope({})).toThrow("specify either a class or a section scope");
    expect(() => assertDailyTestScope({ classId: null, sectionId: undefined })).toThrow();
    expect(() => assertDailyTestScope({ classId: "  ", sectionId: "" })).toThrow();
  });
});

describe("validateDailyTestStatusTransition", () => {
  it("permits legal forward transitions", () => {
    expect(() => validateDailyTestStatusTransition("draft", "draft")).not.toThrow();
    expect(() => validateDailyTestStatusTransition("draft", "published")).not.toThrow();
    expect(() => validateDailyTestStatusTransition("published", "locked")).not.toThrow();
    expect(() => validateDailyTestStatusTransition("locked", "locked")).not.toThrow();
  });

  it("forbids jumping from draft directly to locked", () => {
    expect(() => validateDailyTestStatusTransition("draft", "locked")).toThrow(
      "must be published before it can be locked",
    );
  });

  it("forbids reverting published tests to draft", () => {
    expect(() => validateDailyTestStatusTransition("published", "draft")).toThrow(
      "cannot be reverted directly to draft",
    );
  });

  it("forbids changing status once locked", () => {
    expect(() => validateDailyTestStatusTransition("locked", "draft")).toThrow(
      "Cannot modify the status of a locked daily test",
    );
    expect(() => validateDailyTestStatusTransition("locked", "published")).toThrow(
      "Cannot modify the status of a locked daily test",
    );
  });
});

describe("evaluateStudentTestScore", () => {
  it("correctly evaluates score for a present student", () => {
    const result = evaluateStudentTestScore({
      status: "present",
      obtainedMarks: 18,
      totalMarks: 20,
    });
    expect(result.status).toBe("present");
    expect(result.obtainedMarks).toBe(18);
    expect(result.percentage).toBe(90);
    expect(result.grade).toBe("A+");
    expect(result.isPassing).toBe(true);
  });

  it("evaluates failing score for low percentage", () => {
    const result = evaluateStudentTestScore({
      status: "present",
      obtainedMarks: 5,
      totalMarks: 20,
    });
    expect(result.percentage).toBe(25);
    expect(result.grade).toBe("F");
    expect(result.isPassing).toBe(false);
  });

  it("evaluates absent student with null marks and grade", () => {
    const result = evaluateStudentTestScore({
      status: "absent",
      obtainedMarks: null,
      totalMarks: 20,
    });
    expect(result.status).toBe("absent");
    expect(result.obtainedMarks).toBeNull();
    expect(result.percentage).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.isPassing).toBe(false);
  });

  it("enforces reason for excused status during score evaluation", () => {
    expect(() =>
      evaluateStudentTestScore({
        status: "excused",
        obtainedMarks: null,
        totalMarks: 20,
        statusReason: "",
      }),
    ).toThrow("A reason is required");

    const validExcused = evaluateStudentTestScore({
      status: "excused",
      obtainedMarks: null,
      totalMarks: 20,
      statusReason: "Approved sick leave",
    });
    expect(validExcused.status).toBe("excused");
    expect(validExcused.obtainedMarks).toBeNull();
    expect(validExcused.isPassing).toBe(false);
  });
});

