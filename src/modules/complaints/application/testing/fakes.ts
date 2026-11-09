/**
 * In-memory test fake for ComplaintStore (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 */

import { randomUUID } from "node:crypto";

import type {
  ComplaintActionRow,
  ComplaintCommentRow,
  ComplaintFilters,
  ComplaintRow,
  ComplaintStore,
  ComplaintVisibilityRow,
} from "../ports";
import type { SubmitComplaintInput } from "../schemas";
import type { ComplaintStatus } from "../../domain/complaint-rules";

export class FakeComplaintStore implements ComplaintStore {
  readonly complaints = new Map<string, ComplaintRow>();
  readonly actions: ComplaintActionRow[] = [];
  readonly comments: ComplaintCommentRow[] = [];
  readonly visibilityGrants: ComplaintVisibilityRow[] = [];

  async createComplaint(
    data: SubmitComplaintInput,
    reportedByUserId: string,
  ): Promise<ComplaintRow> {
    const id = randomUUID();
    const now = new Date();

    const row: ComplaintRow = {
      id,
      institutionId: data.institutionId,
      academicSessionId: data.academicSessionId,
      studentId: data.studentId,
      reportedByUserId,
      classId: data.classId ?? null,
      sectionId: data.sectionId ?? null,
      subjectId: data.subjectId ?? null,
      reportedDate: data.reportedDate,
      reportedAt: now,
      title: data.title,
      reason: data.reason,
      description: data.description,
      status: "open",
      actionTaken: null,
      severity: data.severity,
      assignedToUserId: null,
      assignedAt: null,
      resolvedAt: null,
      resolvedByUserId: null,
      studentNotifiedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.complaints.set(id, row);

    this.actions.push({
      id: randomUUID(),
      complaintId: id,
      actionType: "created",
      fromStatus: null,
      toStatus: "open",
      actorUserId: reportedByUserId,
      details: "Complaint lodged.",
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return row;
  }

  async getComplaintById(id: string): Promise<ComplaintRow | null> {
    return this.complaints.get(id) ?? null;
  }

  async listComplaints(filters: ComplaintFilters): Promise<readonly ComplaintRow[]> {
    return Array.from(this.complaints.values()).filter((c) => {
      if (c.institutionId !== filters.institutionId) return false;
      if (filters.studentId && c.studentId !== filters.studentId) return false;
      if (filters.reportedByUserId && c.reportedByUserId !== filters.reportedByUserId) return false;
      if (filters.assignedToUserId && c.assignedToUserId !== filters.assignedToUserId) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.severity && c.severity !== filters.severity) return false;
      if (filters.classId && c.classId !== filters.classId) return false;
      if (filters.sectionId && c.sectionId !== filters.sectionId) return false;
      if (filters.fromDate && c.reportedDate < filters.fromDate) return false;
      if (filters.toDate && c.reportedDate > filters.toDate) return false;
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchesTitle = c.title.toLowerCase().includes(query);
        const matchesReason = c.reason.toLowerCase().includes(query);
        const matchesDesc = c.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesReason && !matchesDesc) return false;
      }
      return true;
    });
  }

  async assignComplaint(
    id: string,
    assignedToUserId: string,
    actorUserId: string,
  ): Promise<ComplaintRow> {
    const existing = this.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date();
    const isReassign = existing.assignedToUserId !== null;

    const updated: ComplaintRow = {
      ...existing,
      status: existing.status === "open" ? "under_review" : existing.status,
      assignedToUserId,
      assignedAt: now,
      updatedAt: now,
      version: existing.version + 1,
    };

    this.complaints.set(id, updated);

    this.actions.push({
      id: randomUUID(),
      complaintId: id,
      actionType: isReassign ? "reassigned" : "assigned",
      fromStatus: existing.status,
      toStatus: updated.status,
      actorUserId,
      details: `Assigned to investigator.`,
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return updated;
  }

  async updateStatus(
    id: string,
    newStatus: ComplaintStatus,
    actorUserId: string,
    options?: {
      readonly details?: string | undefined;
      readonly actionTaken?: string | undefined;
    },
  ): Promise<ComplaintRow> {
    const existing = this.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date();
    const updated: ComplaintRow = {
      ...existing,
      status: newStatus,
      actionTaken: options?.actionTaken ?? existing.actionTaken,
      updatedAt: now,
      version: existing.version + 1,
    };

    this.complaints.set(id, updated);

    this.actions.push({
      id: randomUUID(),
      complaintId: id,
      actionType: "status_change",
      fromStatus: existing.status,
      toStatus: newStatus,
      actorUserId,
      details: options?.details ?? `Status changed to ${newStatus}.`,
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return updated;
  }

  async resolveComplaint(
    id: string,
    data: {
      readonly actionTaken: string;
      readonly resolvedByUserId: string;
      readonly details?: string | undefined;
    },
  ): Promise<ComplaintRow> {
    const existing = this.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date();
    const updated: ComplaintRow = {
      ...existing,
      status: "resolved",
      actionTaken: data.actionTaken,
      resolvedAt: now,
      resolvedByUserId: data.resolvedByUserId,
      updatedAt: now,
      version: existing.version + 1,
    };

    this.complaints.set(id, updated);

    this.actions.push({
      id: randomUUID(),
      complaintId: id,
      actionType: "status_change",
      fromStatus: existing.status,
      toStatus: "resolved",
      actorUserId: data.resolvedByUserId,
      details: data.details ?? `Resolved: ${data.actionTaken}`,
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return updated;
  }

  async dismissComplaint(
    id: string,
    data: {
      readonly dismissalReason: string;
      readonly dismissedByUserId: string;
    },
  ): Promise<ComplaintRow> {
    const existing = this.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date();
    const updated: ComplaintRow = {
      ...existing,
      status: "dismissed",
      actionTaken: `Dismissed: ${data.dismissalReason}`,
      resolvedAt: now,
      resolvedByUserId: data.dismissedByUserId,
      updatedAt: now,
      version: existing.version + 1,
    };

    this.complaints.set(id, updated);

    this.actions.push({
      id: randomUUID(),
      complaintId: id,
      actionType: "status_change",
      fromStatus: existing.status,
      toStatus: "dismissed",
      actorUserId: data.dismissedByUserId,
      details: `Dismissed: ${data.dismissalReason}`,
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return updated;
  }

  async escalateComplaint(
    id: string,
    data: {
      readonly reason: string;
      readonly actorUserId: string;
      readonly targetAssigneeId?: string | undefined;
    },
  ): Promise<ComplaintRow> {
    const existing = this.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date();
    const updated: ComplaintRow = {
      ...existing,
      status: "escalated",
      assignedToUserId: data.targetAssigneeId ?? existing.assignedToUserId,
      assignedAt: data.targetAssigneeId ? now : existing.assignedAt,
      updatedAt: now,
      version: existing.version + 1,
    };

    this.complaints.set(id, updated);

    this.actions.push({
      id: randomUUID(),
      complaintId: id,
      actionType: "escalated",
      fromStatus: existing.status,
      toStatus: "escalated",
      actorUserId: data.actorUserId,
      details: `Escalated: ${data.reason}`,
      isVisibleToStudent: false, // Internal escalation note
      occurredAt: now,
    });

    return updated;
  }

  async recordNotification(
    id: string,
    actorUserId: string,
    channel: "student" | "guardian" | "both",
  ): Promise<ComplaintRow> {
    const existing = this.complaints.get(id);
    if (!existing) throw new Error("Complaint not found");

    const now = new Date();
    const updated: ComplaintRow = {
      ...existing,
      studentNotifiedAt: now,
      updatedAt: now,
      version: existing.version + 1,
    };

    this.complaints.set(id, updated);

    if (channel === "student" || channel === "both") {
      this.actions.push({
        id: randomUUID(),
        complaintId: id,
        actionType: "student_notified",
        fromStatus: null,
        toStatus: null,
        actorUserId,
        details: "Student notified of complaint.",
        isVisibleToStudent: true,
        occurredAt: now,
      });
    }

    if (channel === "guardian" || channel === "both") {
      this.actions.push({
        id: randomUUID(),
        complaintId: id,
        actionType: "guardian_notified",
        fromStatus: null,
        toStatus: null,
        actorUserId,
        details: "Parent / Guardian notified of complaint.",
        isVisibleToStudent: true,
        occurredAt: now,
      });
    }

    return updated;
  }

  async addComment(
    complaintId: string,
    data: {
      readonly authorUserId: string;
      readonly body: string;
      readonly isInternal: boolean;
      readonly parentCommentId?: string | undefined;
    },
  ): Promise<ComplaintCommentRow> {
    const now = new Date();
    const comment: ComplaintCommentRow = {
      id: randomUUID(),
      complaintId,
      authorUserId: data.authorUserId,
      parentCommentId: data.parentCommentId ?? null,
      body: data.body,
      isInternal: data.isInternal,
      editedAt: null,
      editedByUserId: null,
      createdAt: now,
    };

    this.comments.push(comment);

    this.actions.push({
      id: randomUUID(),
      complaintId,
      actionType: "note_added",
      fromStatus: null,
      toStatus: null,
      actorUserId: data.authorUserId,
      details: data.isInternal ? "Staff note recorded." : "Feedback / comment added.",
      isVisibleToStudent: !data.isInternal,
      occurredAt: now,
    });

    return comment;
  }

  async listComments(
    complaintId: string,
    includeInternal = false,
  ): Promise<readonly ComplaintCommentRow[]> {
    return this.comments.filter((c) => {
      if (c.complaintId !== complaintId) return false;
      if (!includeInternal && c.isInternal) return false;
      return true;
    });
  }

  async listActions(
    complaintId: string,
    includePrivate = false,
  ): Promise<readonly ComplaintActionRow[]> {
    return this.actions.filter((a) => {
      if (a.complaintId !== complaintId) return false;
      if (!includePrivate && !a.isVisibleToStudent) return false;
      return true;
    });
  }

  async grantVisibility(data: {
    readonly complaintId: string;
    readonly userId: string;
    readonly accessLevel: "summary" | "full";
    readonly grantedByUserId: string;
    readonly expiresAt?: Date | undefined;
    readonly reason?: string | undefined;
  }): Promise<ComplaintVisibilityRow> {
    const grant: ComplaintVisibilityRow = {
      id: randomUUID(),
      complaintId: data.complaintId,
      userId: data.userId,
      accessLevel: data.accessLevel,
      grantedByUserId: data.grantedByUserId,
      grantedAt: new Date(),
      expiresAt: data.expiresAt ?? null,
      revokedAt: null,
      revokedByUserId: null,
      reason: data.reason ?? null,
    };
    this.visibilityGrants.push(grant);
    return grant;
  }
}
