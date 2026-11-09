/**
 * Ports and interfaces for the Complaints module (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 */

import type {
  ComplaintActionType,
  ComplaintSeverity,
  ComplaintStatus,
} from "../domain/complaint-rules";
import type { SubmitComplaintInput } from "./schemas";

export interface ComplaintRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly studentId: string;
  readonly reportedByUserId: string;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly subjectId: string | null;
  readonly reportedDate: string;
  readonly reportedAt: Date;
  readonly title: string;
  readonly reason: string;
  readonly description: string;
  readonly status: ComplaintStatus;
  readonly actionTaken: string | null;
  readonly severity: ComplaintSeverity;
  readonly assignedToUserId: string | null;
  readonly assignedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly studentNotifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ComplaintActionRow {
  readonly id: string;
  readonly complaintId: string;
  readonly actionType: ComplaintActionType;
  readonly fromStatus: ComplaintStatus | null;
  readonly toStatus: ComplaintStatus | null;
  readonly actorUserId: string | null;
  readonly details: string | null;
  readonly isVisibleToStudent: boolean;
  readonly occurredAt: Date;
}

export interface ComplaintCommentRow {
  readonly id: string;
  readonly complaintId: string;
  readonly authorUserId: string;
  readonly parentCommentId: string | null;
  readonly body: string;
  readonly isInternal: boolean;
  readonly editedAt: Date | null;
  readonly editedByUserId: string | null;
  readonly createdAt: Date;
}

export interface ComplaintVisibilityRow {
  readonly id: string;
  readonly complaintId: string;
  readonly userId: string;
  readonly accessLevel: "summary" | "full";
  readonly grantedByUserId: string;
  readonly grantedAt: Date;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedByUserId: string | null;
  readonly reason: string | null;
}

export interface ComplaintFilters {
  readonly institutionId: string;
  readonly studentId?: string | undefined;
  readonly reportedByUserId?: string | undefined;
  readonly assignedToUserId?: string | undefined;
  readonly status?: ComplaintStatus | undefined;
  readonly severity?: ComplaintSeverity | undefined;
  readonly classId?: string | undefined;
  readonly sectionId?: string | undefined;
  readonly fromDate?: string | undefined;
  readonly toDate?: string | undefined;
  readonly search?: string | undefined;
}

export interface ComplaintDetails {
  readonly complaint: ComplaintRow;
  readonly actions: readonly ComplaintActionRow[];
  readonly comments: readonly ComplaintCommentRow[];
}

export interface ComplaintStore {
  createComplaint(
    data: SubmitComplaintInput,
    reportedByUserId: string,
  ): Promise<ComplaintRow>;

  getComplaintById(id: string): Promise<ComplaintRow | null>;

  listComplaints(filters: ComplaintFilters): Promise<readonly ComplaintRow[]>;

  assignComplaint(
    id: string,
    assignedToUserId: string,
    actorUserId: string,
  ): Promise<ComplaintRow>;

  updateStatus(
    id: string,
    newStatus: ComplaintStatus,
    actorUserId: string,
    options?: {
      readonly details?: string | undefined;
      readonly actionTaken?: string | undefined;
    },
  ): Promise<ComplaintRow>;

  resolveComplaint(
    id: string,
    data: {
      readonly actionTaken: string;
      readonly resolvedByUserId: string;
      readonly details?: string | undefined;
    },
  ): Promise<ComplaintRow>;

  dismissComplaint(
    id: string,
    data: {
      readonly dismissalReason: string;
      readonly dismissedByUserId: string;
    },
  ): Promise<ComplaintRow>;

  escalateComplaint(
    id: string,
    data: {
      readonly reason: string;
      readonly actorUserId: string;
      readonly targetAssigneeId?: string | undefined;
    },
  ): Promise<ComplaintRow>;

  recordNotification(
    id: string,
    actorUserId: string,
    channel: "student" | "guardian" | "both",
  ): Promise<ComplaintRow>;

  addComment(
    complaintId: string,
    data: {
      readonly authorUserId: string;
      readonly body: string;
      readonly isInternal: boolean;
      readonly parentCommentId?: string | undefined;
    },
  ): Promise<ComplaintCommentRow>;

  listComments(
    complaintId: string,
    includeInternal?: boolean,
  ): Promise<readonly ComplaintCommentRow[]>;

  listActions(
    complaintId: string,
    includePrivate?: boolean,
  ): Promise<readonly ComplaintActionRow[]>;

  grantVisibility(data: {
    readonly complaintId: string;
    readonly userId: string;
    readonly accessLevel: "summary" | "full";
    readonly grantedByUserId: string;
    readonly expiresAt?: Date | undefined;
    readonly reason?: string | undefined;
  }): Promise<ComplaintVisibilityRow>;
}
