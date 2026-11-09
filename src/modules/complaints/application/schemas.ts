/**
 * Boundary validation schemas for Complaints (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 */

import { z } from "zod";

import { calendarDate, nonEmptyText, optionalId } from "@/shared/validation";
import { COMPLAINT_SEVERITIES } from "../domain/complaint-rules";

export const SubmitComplaintSchema = z.object({
  institutionId: z.string().uuid("Invalid institution identifier."),
  academicSessionId: z.string().uuid("Invalid academic session identifier."),
  studentId: z.string().uuid("Invalid student identifier."),
  classId: optionalId,
  sectionId: optionalId,
  subjectId: optionalId,
  reportedDate: calendarDate("Incident date"),
  title: nonEmptyText("Title", 200),
  reason: nonEmptyText("Reason / Category", 64),
  description: nonEmptyText("Incident description", 4000),
  severity: z.enum(COMPLAINT_SEVERITIES).default("medium"),
});

export type SubmitComplaintInput = z.infer<typeof SubmitComplaintSchema>;

export const AssignComplaintSchema = z.object({
  complaintId: z.string().uuid("Invalid complaint identifier."),
  assignedToUserId: z.string().uuid("Please select a staff member to investigate this complaint."),
});

export type AssignComplaintInput = z.infer<typeof AssignComplaintSchema>;

export const ResolveComplaintSchema = z.object({
  complaintId: z.string().uuid("Invalid complaint identifier."),
  actionTaken: nonEmptyText("Action taken", 1000),
  details: z.string().trim().max(2000).optional(),
});

export type ResolveComplaintInput = z.infer<typeof ResolveComplaintSchema>;

export const DismissComplaintSchema = z.object({
  complaintId: z.string().uuid("Invalid complaint identifier."),
  dismissalReason: nonEmptyText("Dismissal reason", 1000),
});

export type DismissComplaintInput = z.infer<typeof DismissComplaintSchema>;

export const EscalateComplaintSchema = z.object({
  complaintId: z.string().uuid("Invalid complaint identifier."),
  reason: nonEmptyText("Escalation reason", 1000),
  targetAssigneeId: optionalId,
});

export type EscalateComplaintInput = z.infer<typeof EscalateComplaintSchema>;

export const AddComplaintCommentSchema = z.object({
  complaintId: z.string().uuid("Invalid complaint identifier."),
  body: nonEmptyText("Message / Feedback", 2000),
  isInternal: z.boolean().default(false),
  parentCommentId: optionalId,
});

export type AddComplaintCommentInput = z.infer<typeof AddComplaintCommentSchema>;

export const NotifyComplaintSchema = z.object({
  complaintId: z.string().uuid("Invalid complaint identifier."),
  channel: z.enum(["student", "guardian", "both"]).default("both"),
});

export type NotifyComplaintInput = z.infer<typeof NotifyComplaintSchema>;

export const GrantVisibilitySchema = z.object({
  complaintId: z.string().uuid("Invalid complaint identifier."),
  userId: z.string().uuid("Please select a user to grant access to."),
  accessLevel: z.enum(["summary", "full"]).default("summary"),
  expiresAt: z.string().datetime().optional().nullable(),
  reason: z.string().trim().max(300).optional().nullable(),
});

export type GrantVisibilityInput = z.infer<typeof GrantVisibilitySchema>;
