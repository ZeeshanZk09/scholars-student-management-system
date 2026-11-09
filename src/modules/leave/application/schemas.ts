/**
 * Leave validation schemas (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { z } from "zod";

import { calendarDate, nonEmptyText } from "@/shared/validation/fields";

const uuid = z.string().uuid("A valid reference identifier is required.");

export const SubmitStudentLeaveRequestData = z
  .object({
    institutionId: uuid,
    studentId: uuid,
    leaveTypeId: uuid.nullish(),
    fromDate: calendarDate("Start date"),
    toDate: calendarDate("End date"),
    reason: nonEmptyText("Reason for leave", 500),
    notes: z.string().trim().max(1000).nullish(),
  })
  .refine((data) => data.toDate >= data.fromDate, {
    message: "End date must be on or after start date.",
    path: ["toDate"],
  });

export type SubmitStudentLeaveRequestInput = z.infer<typeof SubmitStudentLeaveRequestData>;

export const REVIEW_STATUSES = ["approved", "rejected", "cancelled"] as const;
export type ReviewLeaveStatus = (typeof REVIEW_STATUSES)[number];

export const ReviewLeaveRequestData = z
  .object({
    leaveRequestId: uuid,
    status: z.enum(REVIEW_STATUSES),
    decisionNotes: z.string().trim().max(1000).nullish(),
  })
  .refine(
    (data) => {
      if (data.status === "rejected") {
        return Boolean(data.decisionNotes && data.decisionNotes.trim().length > 0);
      }
      return true;
    },
    {
      message: "An explanatory note is required when rejecting a leave request.",
      path: ["decisionNotes"],
    },
  );

export type ReviewLeaveRequestInput = z.infer<typeof ReviewLeaveRequestData>;

export const CancelLeaveRequestData = z.object({
  leaveRequestId: uuid,
});

export type CancelLeaveRequestInput = z.infer<typeof CancelLeaveRequestData>;
