/**
 * Drizzle implementation of ComplaintStore (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 *
 * Implements persistence for complaints, actions, comments, and visibility grants.
 * Translates database constraint errors into plain-English domain errors with zero database jargon.
 */

import { and, asc, desc, eq, gte, ilike, lte, or } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import {
  complaintActions,
  complaintComments,
  complaints,
  complaintVisibility,
} from "@/db/schema";
import { ConflictError, NotFoundError } from "@/shared/errors";
import type {
  ComplaintActionType,
  ComplaintSeverity,
  ComplaintStatus,
} from "../domain/complaint-rules";
import type {
  ComplaintActionRow,
  ComplaintCommentRow,
  ComplaintFilters,
  ComplaintRow,
  ComplaintStore,
  ComplaintVisibilityRow,
} from "../application/ports";
import type { SubmitComplaintInput } from "../application/schemas";

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function uniqueConflictError(error: unknown): ConflictError | null {
  if (!isUniqueViolation(error)) return null;
  const message = error instanceof Error ? error.message : "";

  if (message.includes("complaint_visibility_unique")) {
    return new ConflictError("This staff member already has active access granted to this complaint.", {
      userMessage: "Active access is already granted to this staff member for this complaint.",
    });
  }

  return new ConflictError("The operation conflicts with an existing record.", {
    userMessage: "This update conflicts with existing information in the system.",
  });
}

export class DrizzleComplaintStore implements ComplaintStore {
  constructor(private readonly client: DbLike = db) {}

  private mapComplaintRow(r: typeof complaints.$inferSelect): ComplaintRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      academicSessionId: r.academicSessionId,
      studentId: r.studentId,
      reportedByUserId: r.reportedByUserId,
      classId: r.classId,
      sectionId: r.sectionId,
      subjectId: r.subjectId,
      reportedDate: r.reportedDate,
      reportedAt: r.reportedAt,
      title: r.title,
      reason: r.reason,
      description: r.description,
      status: r.status as ComplaintStatus,
      actionTaken: r.actionTaken,
      severity: r.severity as ComplaintSeverity,
      assignedToUserId: r.assignedToUserId,
      assignedAt: r.assignedAt,
      resolvedAt: r.resolvedAt,
      resolvedByUserId: r.resolvedByUserId,
      studentNotifiedAt: r.studentNotifiedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  private mapActionRow(r: typeof complaintActions.$inferSelect): ComplaintActionRow {
    return {
      id: r.id,
      complaintId: r.complaintId,
      actionType: r.actionType as ComplaintActionType,
      fromStatus: (r.fromStatus as ComplaintStatus) ?? null,
      toStatus: (r.toStatus as ComplaintStatus) ?? null,
      actorUserId: r.actorUserId,
      details: r.details,
      isVisibleToStudent: r.isVisibleToStudent,
      occurredAt: r.occurredAt,
    };
  }

  private mapCommentRow(r: typeof complaintComments.$inferSelect): ComplaintCommentRow {
    return {
      id: r.id,
      complaintId: r.complaintId,
      authorUserId: r.authorUserId,
      parentCommentId: r.parentCommentId,
      body: r.body,
      isInternal: r.isInternal,
      editedAt: r.editedAt,
      editedByUserId: r.editedByUserId,
      createdAt: r.createdAt,
    };
  }

  private mapVisibilityRow(r: typeof complaintVisibility.$inferSelect): ComplaintVisibilityRow {
    return {
      id: r.id,
      complaintId: r.complaintId,
      userId: r.userId,
      accessLevel: r.accessLevel as "summary" | "full",
      grantedByUserId: r.grantedByUserId,
      grantedAt: r.grantedAt,
      expiresAt: r.expiresAt,
      revokedAt: r.revokedAt,
      revokedByUserId: r.revokedByUserId,
      reason: r.reason,
    };
  }

  async createComplaint(
    data: SubmitComplaintInput,
    reportedByUserId: string,
  ): Promise<ComplaintRow> {
    try {
      const [inserted] = await this.client
        .insert(complaints)
        .values({
          institutionId: data.institutionId,
          academicSessionId: data.academicSessionId,
          studentId: data.studentId,
          reportedByUserId,
          classId: data.classId ?? null,
          sectionId: data.sectionId ?? null,
          subjectId: data.subjectId ?? null,
          reportedDate: data.reportedDate,
          title: data.title,
          reason: data.reason,
          description: data.description,
          severity: data.severity,
          status: "open",
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to lodge complaint record.");
      }

      await this.client.insert(complaintActions).values({
        complaintId: inserted.id,
        actionType: "created",
        fromStatus: null,
        toStatus: "open",
        actorUserId: reportedByUserId,
        details: "Complaint lodged.",
        isVisibleToStudent: true,
      });

      return this.mapComplaintRow(inserted);
    } catch (error) {
      const conflict = uniqueConflictError(error);
      if (conflict) throw conflict;
      throw error;
    }
  }

  async getComplaintById(id: string): Promise<ComplaintRow | null> {
    const [row] = await this.client
      .select()
      .from(complaints)
      .where(eq(complaints.id, id))
      .limit(1);

    return row ? this.mapComplaintRow(row) : null;
  }

  async listComplaints(filters: ComplaintFilters): Promise<readonly ComplaintRow[]> {
    const conditions = [eq(complaints.institutionId, filters.institutionId)];

    if (filters.studentId) {
      conditions.push(eq(complaints.studentId, filters.studentId));
    }
    if (filters.reportedByUserId) {
      conditions.push(eq(complaints.reportedByUserId, filters.reportedByUserId));
    }
    if (filters.assignedToUserId) {
      conditions.push(eq(complaints.assignedToUserId, filters.assignedToUserId));
    }
    if (filters.status) {
      conditions.push(eq(complaints.status, filters.status));
    }
    if (filters.severity) {
      conditions.push(eq(complaints.severity, filters.severity));
    }
    if (filters.classId) {
      conditions.push(eq(complaints.classId, filters.classId));
    }
    if (filters.sectionId) {
      conditions.push(eq(complaints.sectionId, filters.sectionId));
    }
    if (filters.fromDate) {
      conditions.push(gte(complaints.reportedDate, filters.fromDate));
    }
    if (filters.toDate) {
      conditions.push(lte(complaints.reportedDate, filters.toDate));
    }
    if (filters.search && filters.search.trim() !== "") {
      const pattern = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(complaints.title, pattern),
          ilike(complaints.reason, pattern),
          ilike(complaints.description, pattern),
        )!,
      );
    }

    const rows = await this.client
      .select()
      .from(complaints)
      .where(and(...conditions))
      .orderBy(desc(complaints.reportedAt));

    return rows.map((r) => this.mapComplaintRow(r));
  }

  async assignComplaint(
    id: string,
    assignedToUserId: string,
    actorUserId: string,
  ): Promise<ComplaintRow> {
    const existing = await this.getComplaintById(id);
    if (!existing) {
      throw new NotFoundError("Complaint record not found.");
    }

    const now = new Date();
    const isReassign = existing.assignedToUserId !== null;
    const targetStatus = existing.status === "open" ? "under_review" : existing.status;

    const [updated] = await this.client
      .update(complaints)
      .set({
        assignedToUserId,
        assignedAt: now,
        status: targetStatus,
        updatedAt: now,
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to assign complaint.");
    }

    await this.client.insert(complaintActions).values({
      complaintId: id,
      actionType: isReassign ? "reassigned" : "assigned",
      fromStatus: existing.status,
      toStatus: targetStatus,
      actorUserId,
      details: "Assigned to investigator.",
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return this.mapComplaintRow(updated);
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
    const existing = await this.getComplaintById(id);
    if (!existing) {
      throw new NotFoundError("Complaint record not found.");
    }

    const now = new Date();
    const [updated] = await this.client
      .update(complaints)
      .set({
        status: newStatus,
        actionTaken: options?.actionTaken ?? existing.actionTaken,
        updatedAt: now,
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update complaint status.");
    }

    await this.client.insert(complaintActions).values({
      complaintId: id,
      actionType: "status_change",
      fromStatus: existing.status,
      toStatus: newStatus,
      actorUserId,
      details: options?.details ?? `Status changed to ${newStatus}.`,
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return this.mapComplaintRow(updated);
  }

  async resolveComplaint(
    id: string,
    data: {
      readonly actionTaken: string;
      readonly resolvedByUserId: string;
      readonly details?: string | undefined;
    },
  ): Promise<ComplaintRow> {
    const existing = await this.getComplaintById(id);
    if (!existing) {
      throw new NotFoundError("Complaint record not found.");
    }

    const now = new Date();
    const [updated] = await this.client
      .update(complaints)
      .set({
        status: "resolved",
        actionTaken: data.actionTaken,
        resolvedAt: now,
        resolvedByUserId: data.resolvedByUserId,
        updatedAt: now,
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to resolve complaint.");
    }

    await this.client.insert(complaintActions).values({
      complaintId: id,
      actionType: "status_change",
      fromStatus: existing.status,
      toStatus: "resolved",
      actorUserId: data.resolvedByUserId,
      details: data.details ?? `Resolved: ${data.actionTaken}`,
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return this.mapComplaintRow(updated);
  }

  async dismissComplaint(
    id: string,
    data: {
      readonly dismissalReason: string;
      readonly dismissedByUserId: string;
    },
  ): Promise<ComplaintRow> {
    const existing = await this.getComplaintById(id);
    if (!existing) {
      throw new NotFoundError("Complaint record not found.");
    }

    const now = new Date();
    const [updated] = await this.client
      .update(complaints)
      .set({
        status: "dismissed",
        actionTaken: `Dismissed: ${data.dismissalReason}`,
        resolvedAt: now,
        resolvedByUserId: data.dismissedByUserId,
        updatedAt: now,
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to dismiss complaint.");
    }

    await this.client.insert(complaintActions).values({
      complaintId: id,
      actionType: "status_change",
      fromStatus: existing.status,
      toStatus: "dismissed",
      actorUserId: data.dismissedByUserId,
      details: `Dismissed: ${data.dismissalReason}`,
      isVisibleToStudent: true,
      occurredAt: now,
    });

    return this.mapComplaintRow(updated);
  }

  async escalateComplaint(
    id: string,
    data: {
      readonly reason: string;
      readonly actorUserId: string;
      readonly targetAssigneeId?: string | undefined;
    },
  ): Promise<ComplaintRow> {
    const existing = await this.getComplaintById(id);
    if (!existing) {
      throw new NotFoundError("Complaint record not found.");
    }

    const now = new Date();
    const [updated] = await this.client
      .update(complaints)
      .set({
        status: "escalated",
        assignedToUserId: data.targetAssigneeId ?? existing.assignedToUserId,
        assignedAt: data.targetAssigneeId ? now : existing.assignedAt,
        updatedAt: now,
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!updated) {
      throw new Error("Failed to escalate complaint.");
    }

    await this.client.insert(complaintActions).values({
      complaintId: id,
      actionType: "escalated",
      fromStatus: existing.status,
      toStatus: "escalated",
      actorUserId: data.actorUserId,
      details: `Escalated: ${data.reason}`,
      isVisibleToStudent: false, // Internal escalation note
      occurredAt: now,
    });

    return this.mapComplaintRow(updated);
  }

  async recordNotification(
    id: string,
    actorUserId: string,
    channel: "student" | "guardian" | "both",
  ): Promise<ComplaintRow> {
    const now = new Date();
    const [updated] = await this.client
      .update(complaints)
      .set({
        studentNotifiedAt: now,
        updatedAt: now,
      })
      .where(eq(complaints.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError("Complaint record not found.");
    }

    if (channel === "student" || channel === "both") {
      await this.client.insert(complaintActions).values({
        complaintId: id,
        actionType: "student_notified",
        actorUserId,
        details: "Student notified of complaint.",
        isVisibleToStudent: true,
        occurredAt: now,
      });
    }

    if (channel === "guardian" || channel === "both") {
      await this.client.insert(complaintActions).values({
        complaintId: id,
        actionType: "guardian_notified",
        actorUserId,
        details: "Parent / Guardian notified of complaint.",
        isVisibleToStudent: true,
        occurredAt: now,
      });
    }

    return this.mapComplaintRow(updated);
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
    const [comment] = await this.client
      .insert(complaintComments)
      .values({
        complaintId,
        authorUserId: data.authorUserId,
        body: data.body,
        isInternal: data.isInternal,
        parentCommentId: data.parentCommentId ?? null,
      })
      .returning();

    if (!comment) {
      throw new Error("Failed to save complaint comment.");
    }

    await this.client.insert(complaintActions).values({
      complaintId,
      actionType: "note_added",
      actorUserId: data.authorUserId,
      details: data.isInternal ? "Staff note recorded." : "Feedback comment added.",
      isVisibleToStudent: !data.isInternal,
    });

    return this.mapCommentRow(comment);
  }

  async listComments(
    complaintId: string,
    includeInternal = false,
  ): Promise<readonly ComplaintCommentRow[]> {
    const conditions = [eq(complaintComments.complaintId, complaintId)];
    if (!includeInternal) {
      conditions.push(eq(complaintComments.isInternal, false));
    }

    const rows = await this.client
      .select()
      .from(complaintComments)
      .where(and(...conditions))
      .orderBy(asc(complaintComments.createdAt));

    return rows.map((r) => this.mapCommentRow(r));
  }

  async listActions(
    complaintId: string,
    includePrivate = false,
  ): Promise<readonly ComplaintActionRow[]> {
    const conditions = [eq(complaintActions.complaintId, complaintId)];
    if (!includePrivate) {
      conditions.push(eq(complaintActions.isVisibleToStudent, true));
    }

    const rows = await this.client
      .select()
      .from(complaintActions)
      .where(and(...conditions))
      .orderBy(asc(complaintActions.occurredAt));

    return rows.map((r) => this.mapActionRow(r));
  }

  async grantVisibility(data: {
    readonly complaintId: string;
    readonly userId: string;
    readonly accessLevel: "summary" | "full";
    readonly grantedByUserId: string;
    readonly expiresAt?: Date | undefined;
    readonly reason?: string | undefined;
  }): Promise<ComplaintVisibilityRow> {
    try {
      const [grant] = await this.client
        .insert(complaintVisibility)
        .values({
          complaintId: data.complaintId,
          userId: data.userId,
          accessLevel: data.accessLevel,
          grantedByUserId: data.grantedByUserId,
          expiresAt: data.expiresAt ?? null,
          reason: data.reason ?? null,
        })
        .returning();

      if (!grant) {
        throw new Error("Failed to create complaint visibility grant.");
      }

      return this.mapVisibilityRow(grant);
    } catch (error) {
      const conflict = uniqueConflictError(error);
      if (conflict) throw conflict;
      throw error;
    }
  }
}
