/**
 * Drizzle implementation of LeaveStore (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { and, desc, eq, lte, gte } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import { leaveRequests, leaveTypes } from "@/db/schema";
import { NotFoundError } from "@/shared/errors";
import type { LeaveRequestedBy, LeaveStatus } from "../domain/leave-rules";
import type { LeaveRequestRow, LeaveStore } from "../application/ports";
import type { SubmitStudentLeaveRequestInput } from "../application/schemas";

export class DrizzleLeaveStore implements LeaveStore {
  constructor(private readonly client: DbLike = db) {}

  private mapRow(r: typeof leaveRequests.$inferSelect): LeaveRequestRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      studentId: r.studentId,
      employeeId: r.employeeId,
      leaveTypeId: r.leaveTypeId,
      requestedByUserId: r.requestedByUserId,
      requestedBy: r.requestedBy as LeaveRequestedBy,
      fromDate: r.fromDate,
      toDate: r.toDate,
      totalDays: r.totalDays,
      reason: r.reason,
      notes: null,
      status: r.status as LeaveStatus,
      decidedByUserId: r.decidedByUserId,
      decidedAt: r.decidedAt,
      decisionNotes: r.decisionNotes,
      appliedToAttendanceAt: r.appliedToAttendanceAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  private async resolveOrCreateLeaveTypeId(institutionId: string, leaveTypeId?: string | null): Promise<string> {
    if (leaveTypeId) {
      return leaveTypeId;
    }

    const [existing] = await this.client
      .select({ id: leaveTypes.id })
      .from(leaveTypes)
      .where(eq(leaveTypes.institutionId, institutionId))
      .limit(1);

    if (existing) {
      return existing.id;
    }

    const [inserted] = await this.client
      .insert(leaveTypes)
      .values({
        institutionId,
        name: "General Student Leave",
        code: "GEN_LEAVE",
        type: "other",
        isPaid: true,
      })
      .returning({ id: leaveTypes.id });

    if (!inserted) throw new Error("Failed to resolve or create default leave type.");
    return inserted.id;
  }

  async createStudentLeaveRequest(
    data: SubmitStudentLeaveRequestInput & { readonly totalDays: number },
    requestedByUserId: string,
    requestedBy: LeaveRequestedBy = "guardian",
  ): Promise<LeaveRequestRow> {
    const resolvedLeaveTypeId = await this.resolveOrCreateLeaveTypeId(data.institutionId, data.leaveTypeId);

    const [row] = await this.client
      .insert(leaveRequests)
      .values({
        institutionId: data.institutionId,
        studentId: data.studentId,
        employeeId: null,
        leaveTypeId: resolvedLeaveTypeId,
        status: "pending",
        fromDate: data.fromDate,
        toDate: data.toDate,
        totalDays: data.totalDays,
        reason: data.notes ? `${data.reason} (${data.notes})` : data.reason,
        requestedBy,
        requestedByUserId,
      })
      .returning();

    if (!row) throw new Error("Failed to insert leave request.");
    return this.mapRow(row);
  }

  async getLeaveRequest(id: string): Promise<LeaveRequestRow | null> {
    const [row] = await this.client
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async listLeaveRequests(filters: {
    readonly institutionId: string;
    readonly studentId?: string | undefined;
    readonly employeeId?: string | undefined;
    readonly status?: LeaveStatus | undefined;
    readonly fromDate?: string | undefined;
    readonly toDate?: string | undefined;
  }): Promise<readonly LeaveRequestRow[]> {
    const conditions = [eq(leaveRequests.institutionId, filters.institutionId)];

    if (filters.studentId) conditions.push(eq(leaveRequests.studentId, filters.studentId));
    if (filters.employeeId) conditions.push(eq(leaveRequests.employeeId, filters.employeeId));
    if (filters.status) conditions.push(eq(leaveRequests.status, filters.status));
    if (filters.fromDate) conditions.push(gte(leaveRequests.toDate, filters.fromDate));
    if (filters.toDate) conditions.push(lte(leaveRequests.fromDate, filters.toDate));

    const rows = await this.client
      .select()
      .from(leaveRequests)
      .where(and(...conditions))
      .orderBy(desc(leaveRequests.fromDate));

    return rows.map((r) => this.mapRow(r));
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
    const [row] = await this.client
      .update(leaveRequests)
      .set({
        status: update.status,
        decidedByUserId: update.decidedByUserId,
        decidedAt: update.decidedAt,
        decisionNotes: update.decisionNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, id))
      .returning();

    if (!row) throw new NotFoundError(`Leave request "${id}" not found.`);
    return this.mapRow(row);
  }

  async findApprovedLeaveForStudent(studentId: string, date: string): Promise<LeaveRequestRow | null> {
    const [row] = await this.client
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.studentId, studentId),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.fromDate, date),
          gte(leaveRequests.toDate, date),
        ),
      )
      .limit(1);

    return row ? this.mapRow(row) : null;
  }
}
