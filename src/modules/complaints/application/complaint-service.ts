/**
 * Complaint application service (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 */

import { NotFoundError } from "@/shared/errors";
import {
  assertComplaintStatusTransition,
  validateComplaintAssignment,
  validateComplaintComment,
  validateComplaintEscalation,
  validateComplaintResolution,
  validateComplaintSubmission,
} from "../domain/complaint-rules";
import type {
  ComplaintCommentRow,
  ComplaintDetails,
  ComplaintFilters,
  ComplaintRow,
  ComplaintStore,
  ComplaintVisibilityRow,
} from "./ports";
import {
  AddComplaintCommentSchema,
  AssignComplaintSchema,
  DismissComplaintSchema,
  EscalateComplaintSchema,
  GrantVisibilitySchema,
  NotifyComplaintSchema,
  ResolveComplaintSchema,
  SubmitComplaintSchema,
} from "./schemas";

export class ComplaintService {
  constructor(private readonly store: ComplaintStore) {}

  async submitComplaint(
    input: unknown,
    reportedByUserId: string,
  ): Promise<ComplaintRow> {
    const parsed = SubmitComplaintSchema.parse(input);

    validateComplaintSubmission({
      studentId: parsed.studentId,
      reportedByUserId,
      title: parsed.title,
      reason: parsed.reason,
      description: parsed.description,
      reportedDate: parsed.reportedDate,
      severity: parsed.severity,
    });

    return this.store.createComplaint(parsed, reportedByUserId);
  }

  async getComplaint(id: string): Promise<ComplaintRow | null> {
    return this.store.getComplaintById(id);
  }

  async getComplaintDetails(
    id: string,
    isStaff = true,
  ): Promise<ComplaintDetails> {
    const complaint = await this.store.getComplaintById(id);
    if (!complaint) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    const actions = await this.store.listActions(id, isStaff);
    const comments = await this.store.listComments(id, isStaff);

    return {
      complaint,
      actions,
      comments,
    };
  }

  async listComplaints(filters: ComplaintFilters): Promise<readonly ComplaintRow[]> {
    return this.store.listComplaints(filters);
  }

  async assignComplaint(
    input: unknown,
    actorUserId: string,
  ): Promise<ComplaintRow> {
    const parsed = AssignComplaintSchema.parse(input);

    const existing = await this.store.getComplaintById(parsed.complaintId);
    if (!existing) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    validateComplaintAssignment({
      assignedToUserId: parsed.assignedToUserId,
      actorUserId,
    });

    if (existing.status === "open") {
      assertComplaintStatusTransition("open", "under_review");
    }

    return this.store.assignComplaint(
      parsed.complaintId,
      parsed.assignedToUserId,
      actorUserId,
    );
  }

  async resolveComplaint(
    input: unknown,
    resolvedByUserId: string,
  ): Promise<ComplaintRow> {
    const parsed = ResolveComplaintSchema.parse(input);

    const existing = await this.store.getComplaintById(parsed.complaintId);
    if (!existing) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    assertComplaintStatusTransition(existing.status, "resolved");

    validateComplaintResolution({
      status: "resolved",
      actionTaken: parsed.actionTaken,
      resolvedByUserId,
    });

    return this.store.resolveComplaint(parsed.complaintId, {
      actionTaken: parsed.actionTaken,
      resolvedByUserId,
      details: parsed.details,
    });
  }

  async dismissComplaint(
    input: unknown,
    dismissedByUserId: string,
  ): Promise<ComplaintRow> {
    const parsed = DismissComplaintSchema.parse(input);

    const existing = await this.store.getComplaintById(parsed.complaintId);
    if (!existing) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    assertComplaintStatusTransition(existing.status, "dismissed");

    validateComplaintResolution({
      status: "dismissed",
      dismissalReason: parsed.dismissalReason,
      resolvedByUserId: dismissedByUserId,
    });

    return this.store.dismissComplaint(parsed.complaintId, {
      dismissalReason: parsed.dismissalReason,
      dismissedByUserId,
    });
  }

  async escalateComplaint(
    input: unknown,
    actorUserId: string,
  ): Promise<ComplaintRow> {
    const parsed = EscalateComplaintSchema.parse(input);

    const existing = await this.store.getComplaintById(parsed.complaintId);
    if (!existing) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    assertComplaintStatusTransition(existing.status, "escalated");

    validateComplaintEscalation({
      reason: parsed.reason,
      actorUserId,
    });

    return this.store.escalateComplaint(parsed.complaintId, {
      reason: parsed.reason,
      actorUserId,
      targetAssigneeId: parsed.targetAssigneeId ?? undefined,
    });
  }

  async notifyStudentOrGuardian(
    input: unknown,
    actorUserId: string,
  ): Promise<ComplaintRow> {
    const parsed = NotifyComplaintSchema.parse(input);

    const existing = await this.store.getComplaintById(parsed.complaintId);
    if (!existing) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    return this.store.recordNotification(
      parsed.complaintId,
      actorUserId,
      parsed.channel,
    );
  }

  async addComment(
    input: unknown,
    authorUserId: string,
  ): Promise<ComplaintCommentRow> {
    const parsed = AddComplaintCommentSchema.parse(input);

    const existing = await this.store.getComplaintById(parsed.complaintId);
    if (!existing) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    validateComplaintComment({
      body: parsed.body,
      authorUserId,
      isInternal: parsed.isInternal,
    });

    return this.store.addComment(parsed.complaintId, {
      authorUserId,
      body: parsed.body,
      isInternal: parsed.isInternal,
      parentCommentId: parsed.parentCommentId ?? undefined,
    });
  }

  async grantVisibility(
    input: unknown,
    grantedByUserId: string,
  ): Promise<ComplaintVisibilityRow> {
    const parsed = GrantVisibilitySchema.parse(input);

    const existing = await this.store.getComplaintById(parsed.complaintId);
    if (!existing) {
      throw new NotFoundError(`Complaint record not found.`);
    }

    return this.store.grantVisibility({
      complaintId: parsed.complaintId,
      userId: parsed.userId,
      accessLevel: parsed.accessLevel,
      grantedByUserId,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
      reason: parsed.reason ?? undefined,
    });
  }
}
