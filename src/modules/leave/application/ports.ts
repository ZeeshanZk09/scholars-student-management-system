/**
 * Ports and read models for the leave module (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import type { LeaveRequestedBy, LeaveStatus } from "../domain/leave-rules";
import type { SubmitStudentLeaveRequestInput } from "./schemas";

export interface LeaveRequestRow {
  readonly id: string;
  readonly institutionId: string;
  readonly studentId: string | null;
  readonly employeeId: string | null;
  readonly leaveTypeId: string | null;
  readonly requestedByUserId: string;
  readonly requestedBy: LeaveRequestedBy;
  readonly fromDate: string;
  readonly toDate: string;
  readonly totalDays: number;
  readonly reason: string;
  readonly notes: string | null;
  readonly status: LeaveStatus;
  readonly decidedByUserId: string | null;
  readonly decidedAt: Date | null;
  readonly decisionNotes: string | null;
  readonly appliedToAttendanceAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface LeaveStore {
  createStudentLeaveRequest(
    data: SubmitStudentLeaveRequestInput & { readonly totalDays: number },
    requestedByUserId: string,
    requestedBy?: LeaveRequestedBy,
  ): Promise<LeaveRequestRow>;

  getLeaveRequest(id: string): Promise<LeaveRequestRow | null>;

  listLeaveRequests(filters: {
    readonly institutionId: string;
    readonly studentId?: string | undefined;
    readonly employeeId?: string | undefined;
    readonly status?: LeaveStatus | undefined;
    readonly fromDate?: string | undefined;
    readonly toDate?: string | undefined;
  }): Promise<readonly LeaveRequestRow[]>;

  updateLeaveRequestStatus(
    id: string,
    update: {
      readonly status: LeaveStatus;
      readonly decidedByUserId: string;
      readonly decidedAt: Date;
      readonly decisionNotes?: string | null | undefined;
    },
  ): Promise<LeaveRequestRow>;

  findApprovedLeaveForStudent(studentId: string, date: string): Promise<LeaveRequestRow | null>;
}
