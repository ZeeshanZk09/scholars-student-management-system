/**
 * In-memory test fake for LeaveStore (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { randomUUID } from "node:crypto";

import type { LeaveRequestedBy, LeaveStatus } from "../../domain/leave-rules";
import type { LeaveRequestRow, LeaveStore } from "../ports";
import type { SubmitStudentLeaveRequestInput } from "../schemas";

export class FakeLeaveStore implements LeaveStore {
  readonly requests = new Map<string, LeaveRequestRow>();

  async createStudentLeaveRequest(
    data: SubmitStudentLeaveRequestInput & { readonly totalDays: number },
    requestedByUserId: string,
    requestedBy: LeaveRequestedBy = "guardian",
  ): Promise<LeaveRequestRow> {
    const id = randomUUID();
    const row: LeaveRequestRow = {
      id,
      institutionId: data.institutionId,
      studentId: data.studentId,
      employeeId: null,
      leaveTypeId: data.leaveTypeId ?? null,
      requestedByUserId,
      requestedBy,
      fromDate: data.fromDate,
      toDate: data.toDate,
      totalDays: data.totalDays,
      reason: data.reason,
      notes: data.notes ?? null,
      status: "pending",
      decidedByUserId: null,
      decidedAt: null,
      decisionNotes: null,
      appliedToAttendanceAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    this.requests.set(id, row);
    return row;
  }

  async getLeaveRequest(id: string): Promise<LeaveRequestRow | null> {
    return this.requests.get(id) ?? null;
  }

  async listLeaveRequests(filters: {
    readonly institutionId: string;
    readonly studentId?: string | undefined;
    readonly employeeId?: string | undefined;
    readonly status?: LeaveStatus | undefined;
    readonly fromDate?: string | undefined;
    readonly toDate?: string | undefined;
  }): Promise<readonly LeaveRequestRow[]> {
    return Array.from(this.requests.values()).filter((r) => {
      if (r.institutionId !== filters.institutionId) return false;
      if (filters.studentId && r.studentId !== filters.studentId) return false;
      if (filters.employeeId && r.employeeId !== filters.employeeId) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.fromDate && r.toDate < filters.fromDate) return false;
      if (filters.toDate && r.fromDate > filters.toDate) return false;
      return true;
    });
  }

  async updateLeaveRequestStatus(
    id: string,
    update: {
      readonly status: LeaveStatus;
      readonly decidedByUserId: string;
      readonly decidedAt: Date;
      readonly decisionNotes?: string | null | undefined;
    },
  ): Promise<LeaveRequestRow> {
    const ex = this.requests.get(id);
    if (!ex) throw new Error("Leave request not found");

    const updated: LeaveRequestRow = {
      ...ex,
      status: update.status,
      decidedByUserId: update.decidedByUserId,
      decidedAt: update.decidedAt,
      decisionNotes: update.decisionNotes ?? ex.decisionNotes,
      updatedAt: new Date(),
      version: ex.version + 1,
    };
    this.requests.set(id, updated);
    return updated;
  }

  async findApprovedLeaveForStudent(studentId: string, date: string): Promise<LeaveRequestRow | null> {
    for (const r of this.requests.values()) {
      if (r.studentId === studentId && r.status === "approved" && date >= r.fromDate && date <= r.toDate) {
        return r;
      }
    }
    return null;
  }
}
