/**
 * Leave application service (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { NotFoundError } from "@/shared/errors";
import {
  assertLeaveStatusTransition,
  calculateLeaveDays,
  type LeaveRequestedBy,
  validateLeaveReview,
  validateLeaveSubject,
} from "../domain/leave-rules";
import type { LeaveRequestRow, LeaveStore } from "./ports";
import {
  CancelLeaveRequestData,
  ReviewLeaveRequestData,
  SubmitStudentLeaveRequestData,
} from "./schemas";

export class LeaveService {
  constructor(private readonly store: LeaveStore) {}

  async submitStudentLeaveRequest(
    input: unknown,
    requestedByUserId: string,
    requestedBy: LeaveRequestedBy = "guardian",
  ): Promise<LeaveRequestRow> {
    const parsed = SubmitStudentLeaveRequestData.parse(input);

    validateLeaveSubject({ studentId: parsed.studentId });

    const totalDays = calculateLeaveDays(parsed.fromDate, parsed.toDate);

    return this.store.createStudentLeaveRequest(
      {
        ...parsed,
        totalDays,
      },
      requestedByUserId,
      requestedBy,
    );
  }

  async reviewLeaveRequest(
    input: unknown,
    decidedByUserId: string,
  ): Promise<LeaveRequestRow> {
    const parsed = ReviewLeaveRequestData.parse(input);

    const existing = await this.store.getLeaveRequest(parsed.leaveRequestId);
    if (!existing) {
      throw new NotFoundError(`Leave request "${parsed.leaveRequestId}" not found.`);
    }

    assertLeaveStatusTransition(existing.status, parsed.status);

    validateLeaveReview({
      status: parsed.status,
      decidedByUserId,
      decisionNotes: parsed.decisionNotes ?? null,
    });

    return this.store.updateLeaveRequestStatus(parsed.leaveRequestId, {
      status: parsed.status,
      decidedByUserId,
      decidedAt: new Date(),
      decisionNotes: parsed.decisionNotes ?? null,
    });
  }

  async cancelLeaveRequest(
    input: unknown,
    cancelledByUserId: string,
  ): Promise<LeaveRequestRow> {
    const parsed = CancelLeaveRequestData.parse(input);

    const existing = await this.store.getLeaveRequest(parsed.leaveRequestId);
    if (!existing) {
      throw new NotFoundError(`Leave request "${parsed.leaveRequestId}" not found.`);
    }

    assertLeaveStatusTransition(existing.status, "cancelled");

    return this.store.updateLeaveRequestStatus(parsed.leaveRequestId, {
      status: "cancelled",
      decidedByUserId: cancelledByUserId,
      decidedAt: new Date(),
      decisionNotes: "Cancelled by user.",
    });
  }

  async getLeaveRequest(id: string): Promise<LeaveRequestRow | null> {
    return this.store.getLeaveRequest(id);
  }

  async listLeaveRequests(filters: {
    readonly institutionId: string;
    readonly studentId?: string | undefined;
    readonly employeeId?: string | undefined;
    readonly status?: LeaveRequestRow["status"] | undefined;
    readonly fromDate?: string | undefined;
    readonly toDate?: string | undefined;
  }): Promise<readonly LeaveRequestRow[]> {
    return this.store.listLeaveRequests(filters);
  }

  async findApprovedLeaveForStudent(studentId: string, date: string): Promise<LeaveRequestRow | null> {
    return this.store.findApprovedLeaveForStudent(studentId, date);
  }
}
