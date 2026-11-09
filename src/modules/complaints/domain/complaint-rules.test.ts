import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  assertComplaintStatusTransition,
  canTransitionComplaintStatus,
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES,
  isComplaintSeverity,
  isComplaintStatus,
  isHighPriority,
  requiresUrgentAttention,
  validateComplaintAssignment,
  validateComplaintComment,
  validateComplaintEscalation,
  validateComplaintResolution,
  validateComplaintSubmission,
} from "./complaint-rules";

describe("Complaint Domain Rules", () => {
  describe("Statuses and State Machine", () => {
    it("recognizes all standard statuses", () => {
      for (const status of COMPLAINT_STATUSES) {
        expect(isComplaintStatus(status)).toBe(true);
      }
      expect(isComplaintStatus("invalid_status")).toBe(false);
      expect(isComplaintStatus(123)).toBe(false);
      expect(isComplaintStatus(null)).toBe(false);
    });

    it("allows valid transitions from open", () => {
      expect(canTransitionComplaintStatus("open", "under_review")).toBe(true);
      expect(canTransitionComplaintStatus("open", "resolved")).toBe(true);
      expect(canTransitionComplaintStatus("open", "dismissed")).toBe(true);
      expect(canTransitionComplaintStatus("open", "escalated")).toBe(true);
      expect(canTransitionComplaintStatus("open", "open")).toBe(false);
    });

    it("allows valid transitions from under_review", () => {
      expect(canTransitionComplaintStatus("under_review", "resolved")).toBe(true);
      expect(canTransitionComplaintStatus("under_review", "dismissed")).toBe(true);
      expect(canTransitionComplaintStatus("under_review", "escalated")).toBe(true);
      expect(canTransitionComplaintStatus("under_review", "open")).toBe(true);
    });

    it("allows reopening resolved complaints on appeal", () => {
      expect(canTransitionComplaintStatus("resolved", "under_review")).toBe(true);
      expect(canTransitionComplaintStatus("resolved", "escalated")).toBe(true);
      expect(canTransitionComplaintStatus("resolved", "open")).toBe(false);
      expect(canTransitionComplaintStatus("resolved", "dismissed")).toBe(false);
    });

    it("allows reopening dismissed complaints", () => {
      expect(canTransitionComplaintStatus("dismissed", "open")).toBe(true);
      expect(canTransitionComplaintStatus("dismissed", "under_review")).toBe(true);
      expect(canTransitionComplaintStatus("dismissed", "resolved")).toBe(false);
    });

    it("throws BusinessRuleError on disallowed transitions", () => {
      expect(() => assertComplaintStatusTransition("resolved", "dismissed")).toThrow(
        BusinessRuleError,
      );
      try {
        assertComplaintStatusTransition("resolved", "dismissed");
      } catch (err) {
        expect((err as BusinessRuleError).userMessage).toContain("cannot be directly changed");
      }
    });
  });

  describe("Severities & Priorities", () => {
    it("recognizes all severities", () => {
      for (const severity of COMPLAINT_SEVERITIES) {
        expect(isComplaintSeverity(severity)).toBe(true);
      }
      expect(isComplaintSeverity("catastrophic")).toBe(false);
    });

    it("flags high priority and urgent attention correctly", () => {
      expect(isHighPriority("low")).toBe(false);
      expect(isHighPriority("medium")).toBe(false);
      expect(isHighPriority("high")).toBe(true);
      expect(isHighPriority("critical")).toBe(true);

      expect(requiresUrgentAttention("high")).toBe(false);
      expect(requiresUrgentAttention("critical")).toBe(true);
    });
  });

  describe("Submission Validation", () => {
    const validSubmission = {
      studentId: "00000000-0000-4000-8000-000000000001",
      reportedByUserId: "00000000-0000-4000-8000-000000000002",
      title: "Disruptive classroom behavior",
      reason: "Classroom Misconduct",
      description: "Student persistently interrupted the lesson and threw items.",
      reportedDate: "2026-10-30",
      severity: "medium" as const,
    };

    it("accepts valid complaint input", () => {
      expect(() => validateComplaintSubmission(validSubmission)).not.toThrow();
    });

    it("rejects future dates", () => {
      expect(() =>
        validateComplaintSubmission({
          ...validSubmission,
          reportedDate: "2099-01-01",
        }),
      ).toThrow(ValidationError);
    });

    it("rejects malformed date strings", () => {
      expect(() =>
        validateComplaintSubmission({
          ...validSubmission,
          reportedDate: "30-10-2026",
        }),
      ).toThrow(ValidationError);
    });

    it("rejects short title or blank description", () => {
      expect(() =>
        validateComplaintSubmission({
          ...validSubmission,
          title: "ab",
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateComplaintSubmission({
          ...validSubmission,
          description: "    ",
        }),
      ).toThrow(ValidationError);
    });

    it("rejects when student files complaint against self", () => {
      expect(() =>
        validateComplaintSubmission({
          ...validSubmission,
          studentId: "user-123",
          reportedByUserId: "user-123",
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("Assignment Validation", () => {
    it("accepts valid assignment", () => {
      expect(() =>
        validateComplaintAssignment({
          assignedToUserId: "user-investigator",
          actorUserId: "user-admin",
        }),
      ).not.toThrow();
    });

    it("rejects missing assignee", () => {
      expect(() =>
        validateComplaintAssignment({
          assignedToUserId: "",
          actorUserId: "user-admin",
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("Resolution Validation", () => {
    it("accepts valid resolution with actionTaken", () => {
      expect(() =>
        validateComplaintResolution({
          status: "resolved",
          actionTaken: "Student apologized and agreed to detention schedule.",
          resolvedByUserId: "user-admin",
        }),
      ).not.toThrow();
    });

    it("rejects resolved complaint without actionTaken", () => {
      expect(() =>
        validateComplaintResolution({
          status: "resolved",
          actionTaken: "",
          resolvedByUserId: "user-admin",
        }),
      ).toThrow(ValidationError);
    });

    it("accepts valid dismissal with reason", () => {
      expect(() =>
        validateComplaintResolution({
          status: "dismissed",
          dismissalReason: "Matter was a misunderstanding between students, resolved informally.",
          resolvedByUserId: "user-admin",
        }),
      ).not.toThrow();
    });

    it("rejects dismissed complaint without dismissal reason", () => {
      expect(() =>
        validateComplaintResolution({
          status: "dismissed",
          dismissalReason: "   ",
          resolvedByUserId: "user-admin",
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("Escalation and Comments", () => {
    it("validates escalation reason length", () => {
      expect(() =>
        validateComplaintEscalation({
          reason: "Too brief",
          actorUserId: "user-1",
        }),
      ).not.toThrow();

      expect(() =>
        validateComplaintEscalation({
          reason: "bad",
          actorUserId: "user-1",
        }),
      ).toThrow(ValidationError);
    });

    it("validates comment body", () => {
      expect(() =>
        validateComplaintComment({
          body: "Parent contacted and meeting scheduled.",
          authorUserId: "user-1",
        }),
      ).not.toThrow();

      expect(() =>
        validateComplaintComment({
          body: "   ",
          authorUserId: "user-1",
        }),
      ).toThrow(ValidationError);
    });
  });
});
