/**
 * Tests for LeaveService (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { LeaveService } from "./leave-service";
import { FakeLeaveStore } from "./testing/fakes";

const INSTITUTION_ID = "00000000-0000-4000-8000-000000000001";
const STUDENT_ID = "00000000-0000-4000-8000-000000000002";
const GUARDIAN_USER_ID = "00000000-0000-4000-8000-000000000003";
const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000004";

describe("LeaveService", () => {
  let store: FakeLeaveStore;
  let service: LeaveService;

  beforeEach(() => {
    store = new FakeLeaveStore();
    service = new LeaveService(store);
  });

  describe("Submitting student leave requests", () => {
    it("submits a well-formed leave request for a student", async () => {
      const created = await service.submitStudentLeaveRequest(
        {
          institutionId: INSTITUTION_ID,
          studentId: STUDENT_ID,
          fromDate: "2026-11-10",
          toDate: "2026-11-12",
          reason: "Fever and medical rest.",
        },
        GUARDIAN_USER_ID,
      );

      expect(created.id).toBeDefined();
      expect(created.status).toBe("pending");
      expect(created.totalDays).toBe(3);
      expect(created.requestedByUserId).toBe(GUARDIAN_USER_ID);
      expect(created.requestedBy).toBe("guardian");
    });

    it("refuses end date earlier than start date", async () => {
      await expect(
        service.submitStudentLeaveRequest(
          {
            institutionId: INSTITUTION_ID,
            studentId: STUDENT_ID,
            fromDate: "2026-11-12",
            toDate: "2026-11-10",
            reason: "Invalid dates.",
          },
          GUARDIAN_USER_ID,
        ),
      ).rejects.toThrow();
    });
  });

  describe("Reviewing leave requests", () => {
    it("approves a pending request", async () => {
      const created = await service.submitStudentLeaveRequest(
        {
          institutionId: INSTITUTION_ID,
          studentId: STUDENT_ID,
          fromDate: "2026-11-10",
          toDate: "2026-11-12",
          reason: "Doctor appointment.",
        },
        GUARDIAN_USER_ID,
      );

      const approved = await service.reviewLeaveRequest(
        {
          leaveRequestId: created.id,
          status: "approved",
          decisionNotes: "Medical certificate verified.",
        },
        ADMIN_USER_ID,
      );

      expect(approved.status).toBe("approved");
      expect(approved.decidedByUserId).toBe(ADMIN_USER_ID);
      expect(approved.decidedAt).toBeDefined();

      // Attendance check
      const found = await service.findApprovedLeaveForStudent(STUDENT_ID, "2026-11-11");
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it("rejects a pending request with required note", async () => {
      const created = await service.submitStudentLeaveRequest(
        {
          institutionId: INSTITUTION_ID,
          studentId: STUDENT_ID,
          fromDate: "2026-11-10",
          toDate: "2026-11-10",
          reason: "Vacation during exam week.",
        },
        GUARDIAN_USER_ID,
      );

      const rejected = await service.reviewLeaveRequest(
        {
          leaveRequestId: created.id,
          status: "rejected",
          decisionNotes: "Cannot grant leave during midterm examination.",
        },
        ADMIN_USER_ID,
      );

      expect(rejected.status).toBe("rejected");
      expect(rejected.decidedByUserId).toBe(ADMIN_USER_ID);

      // Attendance check: rejected leave is NOT approved
      const found = await service.findApprovedLeaveForStudent(STUDENT_ID, "2026-11-10");
      expect(found).toBeNull();
    });

    it("refuses to re-approve a rejected request (terminal state)", async () => {
      const created = await service.submitStudentLeaveRequest(
        {
          institutionId: INSTITUTION_ID,
          studentId: STUDENT_ID,
          fromDate: "2026-11-10",
          toDate: "2026-11-10",
          reason: "Vacation.",
        },
        GUARDIAN_USER_ID,
      );

      await service.reviewLeaveRequest(
        {
          leaveRequestId: created.id,
          status: "rejected",
          decisionNotes: "Rejected.",
        },
        ADMIN_USER_ID,
      );

      await expect(
        service.reviewLeaveRequest(
          {
            leaveRequestId: created.id,
            status: "approved",
          },
          ADMIN_USER_ID,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("refuses review of nonexistent request", async () => {
      await expect(
        service.reviewLeaveRequest(
          {
            leaveRequestId: "00000000-0000-4000-8000-000000000099",
            status: "approved",
          },
          ADMIN_USER_ID,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("Cancelling leave requests", () => {
    it("cancels a pending request", async () => {
      const created = await service.submitStudentLeaveRequest(
        {
          institutionId: INSTITUTION_ID,
          studentId: STUDENT_ID,
          fromDate: "2026-11-10",
          toDate: "2026-11-10",
          reason: "Trip cancelled.",
        },
        GUARDIAN_USER_ID,
      );

      const cancelled = await service.cancelLeaveRequest(
        { leaveRequestId: created.id },
        GUARDIAN_USER_ID,
      );

      expect(cancelled.status).toBe("cancelled");
    });
  });
});
