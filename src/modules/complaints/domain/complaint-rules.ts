/**
 * Complaint domain rules (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23, `RULES.md` §43/§51).
 *
 * Pure business rules for student complaint lifecycle, priority/severity, assignment,
 * resolution, actions, and student/parent feedback.
 * Pure domain layer: Knows nothing of Next.js, HTTP, Drizzle, or PostgreSQL.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Statuses and State Machine                                                 */
/* -------------------------------------------------------------------------- */

export const COMPLAINT_STATUSES = [
  "open",
  "under_review",
  "resolved",
  "dismissed",
  "escalated",
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Open",
  under_review: "Under Review",
  resolved: "Resolved",
  dismissed: "Dismissed",
  escalated: "Escalated",
};

export const COMPLAINT_STATUS_TONES: Record<
  ComplaintStatus,
  "info" | "warning" | "success" | "neutral" | "danger"
> = {
  open: "info",
  under_review: "warning",
  resolved: "success",
  dismissed: "neutral",
  escalated: "danger",
};

export function isComplaintStatus(value: unknown): value is ComplaintStatus {
  return typeof value === "string" && (COMPLAINT_STATUSES as readonly string[]).includes(value);
}

/**
 * Permitted status transitions in the complaint lifecycle.
 *
 * - open: may move to under_review, resolved (direct resolution for simple matters), dismissed, or escalated.
 * - under_review: investigator can resolve, dismiss, escalate, or release back to open.
 * - escalated: leadership can move back to under_review, resolve, or dismiss.
 * - resolved: can be reopened to under_review or escalated on appeal/feedback.
 * - dismissed: can be reopened to open or under_review on appeal/feedback.
 */
export const ALLOWED_COMPLAINT_TRANSITIONS: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  open: ["under_review", "resolved", "dismissed", "escalated"],
  under_review: ["open", "resolved", "dismissed", "escalated"],
  escalated: ["under_review", "resolved", "dismissed"],
  resolved: ["under_review", "escalated"],
  dismissed: ["open", "under_review"],
};

export function canTransitionComplaintStatus(from: ComplaintStatus, to: ComplaintStatus): boolean {
  if (from === to) return false;
  return ALLOWED_COMPLAINT_TRANSITIONS[from].includes(to);
}

export function assertComplaintStatusTransition(from: ComplaintStatus, to: ComplaintStatus): void {
  if (!canTransitionComplaintStatus(from, to)) {
    throw new BusinessRuleError(
      `Cannot transition complaint status from "${from}" to "${to}".`,
      {
        userMessage: `This complaint is currently ${COMPLAINT_STATUS_LABELS[from].toLowerCase()} and cannot be directly changed to ${COMPLAINT_STATUS_LABELS[to].toLowerCase()}.`,
        details: { status: `Current status "${from}" cannot transition to "${to}".` },
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Severities / Priorities                                                    */
/* -------------------------------------------------------------------------- */

export const COMPLAINT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];

export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const COMPLAINT_SEVERITY_TONES: Record<
  ComplaintSeverity,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export function isComplaintSeverity(value: unknown): value is ComplaintSeverity {
  return typeof value === "string" && (COMPLAINT_SEVERITIES as readonly string[]).includes(value);
}

export function isHighPriority(severity: ComplaintSeverity): boolean {
  return severity === "high" || severity === "critical";
}

export function requiresUrgentAttention(severity: ComplaintSeverity): boolean {
  return severity === "critical";
}

/* -------------------------------------------------------------------------- */
/* Action Types & Audit Trail                                                 */
/* -------------------------------------------------------------------------- */

export const COMPLAINT_ACTION_TYPES = [
  "created",
  "status_change",
  "assigned",
  "reassigned",
  "note_added",
  "evidence_attached",
  "student_notified",
  "guardian_notified",
  "escalated",
] as const;

export type ComplaintActionType = (typeof COMPLAINT_ACTION_TYPES)[number];

export const COMPLAINT_ACTION_LABELS: Record<ComplaintActionType, string> = {
  created: "Complaint Created",
  status_change: "Status Updated",
  assigned: "Assigned to Investigator",
  reassigned: "Reassigned",
  note_added: "Note Added",
  evidence_attached: "Evidence Attached",
  student_notified: "Student Notified",
  guardian_notified: "Parent/Guardian Notified",
  escalated: "Escalated to Leadership",
};

/* -------------------------------------------------------------------------- */
/* Validation Rules                                                           */
/* -------------------------------------------------------------------------- */

export interface ComplaintSubmissionInput {
  readonly studentId: string;
  readonly reportedByUserId: string;
  readonly title: string;
  readonly reason: string;
  readonly description: string;
  readonly reportedDate: string;
  readonly severity?: ComplaintSeverity | undefined;
}

/**
 * Validates complaint submission.
 * Enforces human-readable error messages and zero DB jargon.
 */
export function validateComplaintSubmission(input: ComplaintSubmissionInput): void {
  const issues: Record<string, string[]> = {};

  if (!input.studentId || input.studentId.trim() === "") {
    issues["studentId"] = ["Please select the student this complaint concerns."];
  }

  if (!input.reportedByUserId || input.reportedByUserId.trim() === "") {
    issues["reportedByUserId"] = ["Reporter user identifier is required."];
  }

  if (input.studentId && input.reportedByUserId && input.studentId === input.reportedByUserId) {
    issues["studentId"] = ["A student cannot lodge a teacher incident report against themselves."];
  }

  const trimmedTitle = input.title ? input.title.trim() : "";
  if (trimmedTitle.length < 3) {
    issues["title"] = ["Title must be at least 3 characters long."];
  } else if (trimmedTitle.length > 200) {
    issues["title"] = ["Title cannot exceed 200 characters."];
  }

  const trimmedReason = input.reason ? input.reason.trim() : "";
  if (trimmedReason.length < 2) {
    issues["reason"] = ["Please specify a complaint reason or category (e.g. Conduct, Attendance)."];
  } else if (trimmedReason.length > 64) {
    issues["reason"] = ["Reason category cannot exceed 64 characters."];
  }

  const trimmedDesc = input.description ? input.description.trim() : "";
  if (trimmedDesc.length < 5) {
    issues["description"] = ["Please provide a detailed description of the incident (at least 5 characters)."];
  } else if (trimmedDesc.length > 4000) {
    issues["description"] = ["Description cannot exceed 4000 characters."];
  }

  if (!input.reportedDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.reportedDate)) {
    issues["reportedDate"] = ["Please enter a valid incident date in YYYY-MM-DD format."];
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (input.reportedDate > today) {
      issues["reportedDate"] = ["Incident date cannot be in the future."];
    }
  }

  if (input.severity && !isComplaintSeverity(input.severity)) {
    issues["severity"] = ["Please select a valid severity level (Low, Medium, High, Critical)."];
  }

  if (Object.keys(issues).length > 0) {
    throw new ValidationError(
      "Complaint submission details are invalid.",
      issues,
      { userMessage: "Please check the complaint details and correct the highlighted fields." },
    );
  }
}

/**
 * Validates complaint assignment to an investigator.
 */
export function validateComplaintAssignment(data: {
  readonly assignedToUserId: string;
  readonly actorUserId: string;
}): void {
  if (!data.assignedToUserId || data.assignedToUserId.trim() === "") {
    throw new ValidationError(
      "Assignee is required.",
      { assignedToUserId: ["Staff member assignment is required."] },
      { userMessage: "Please choose a staff member to assign this complaint to." },
    );
  }

  if (!data.actorUserId || data.actorUserId.trim() === "") {
    throw new ValidationError(
      "Actor is required.",
      { actorUserId: ["Assigner user identifier is required."] },
      { userMessage: "Current user session is missing for assigning complaint." },
    );
  }
}

/**
 * Validates complaint resolution.
 * If status is 'resolved', `actionTaken` is mandatory.
 * If status is 'dismissed', a dismissal reason must be provided.
 */
export function validateComplaintResolution(data: {
  readonly status: "resolved" | "dismissed";
  readonly actionTaken?: string | null | undefined;
  readonly resolvedByUserId: string;
  readonly dismissalReason?: string | null | undefined;
}): void {
  const issues: Record<string, string[]> = {};

  if (!data.resolvedByUserId || data.resolvedByUserId.trim() === "") {
    issues["resolvedByUserId"] = ["Resolver user identifier is required."];
  }

  if (data.status === "resolved") {
    const trimmedAction = data.actionTaken ? data.actionTaken.trim() : "";
    if (trimmedAction.length < 3) {
      issues["actionTaken"] = ["Please describe the action taken to resolve this complaint."];
    }
  }

  if (data.status === "dismissed") {
    const trimmedDismissal = data.dismissalReason ? data.dismissalReason.trim() : "";
    if (trimmedDismissal.length < 3) {
      issues["dismissalReason"] = ["Please provide a reason why this complaint is being dismissed."];
    }
  }

  if (Object.keys(issues).length > 0) {
    throw new ValidationError(
      "Resolution details are incomplete.",
      issues,
      { userMessage: "Please provide all required resolution details before completing this complaint." },
    );
  }
}

/**
 * Validates escalating a complaint.
 */
export function validateComplaintEscalation(data: {
  readonly reason: string;
  readonly actorUserId: string;
}): void {
  const trimmed = data.reason ? data.reason.trim() : "";
  if (trimmed.length < 5) {
    throw new ValidationError(
      "Escalation reason is too brief.",
      { reason: ["Escalation reason must be at least 5 characters."] },
      { userMessage: "Please provide a clear reason for escalating this complaint (at least 5 characters)." },
    );
  }

  if (!data.actorUserId || data.actorUserId.trim() === "") {
    throw new ValidationError(
      "Actor identifier is required for escalation.",
      { actorUserId: ["User identifier is required."] },
      { userMessage: "User session is required to record escalation." },
    );
  }
}

/**
 * Validates feedback or comments on a complaint.
 */
export function validateComplaintComment(data: {
  readonly body: string;
  readonly authorUserId: string;
  readonly isInternal?: boolean | undefined;
}): void {
  const trimmed = data.body ? data.body.trim() : "";
  if (trimmed.length < 1) {
    throw new ValidationError(
      "Comment text cannot be empty.",
      { body: ["Feedback or comment text cannot be blank."] },
      { userMessage: "Please enter your message or feedback before submitting." },
    );
  }

  if (trimmed.length > 2000) {
    throw new ValidationError(
      "Comment text is too long.",
      { body: ["Comment text cannot exceed 2000 characters."] },
      { userMessage: "Feedback or comments cannot exceed 2000 characters." },
    );
  }

  if (!data.authorUserId || data.authorUserId.trim() === "") {
    throw new ValidationError(
      "Author user identifier is required.",
      { authorUserId: ["Author identifier is required."] },
      { userMessage: "You must be signed in to add comments or feedback." },
    );
  }
}
