/**
 * Leave domain rules (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16, `ARCHITECTURE.md` §18).
 *
 * Pure business rules for student and staff leave management, status state machine, date range
 * validations, and attendance synchronization.
 *
 * ## Principles
 * 1. **Pure domain layer**: No database, ORM, framework, or HTTP imports.
 * 2. **State machine integrity**: `pending` -> `approved` | `rejected` | `cancelled`. An approved leave
 *    may only be cancelled before it has been finalized into historical attendance.
 * 3. **Attendance invariant**: Approved leave -> `LEAVE`. Unapproved/pending/rejected leave + absence -> `ABSENT`.
 * 4. **Single subject invariant**: A leave request applies to exactly one student OR one employee, never both and never neither.
 * 5. **Auditable decisions**: Approvals and rejections must record the decision-maker and instant. Rejections strictly require explanation notes.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Statuses and State Machine                                                 */
/* -------------------------------------------------------------------------- */

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const LEAVE_STATUS_TONES: Record<LeaveStatus, "amber" | "emerald" | "rose" | "neutral"> = {
  pending: "amber",
  approved: "emerald",
  rejected: "rose",
  cancelled: "neutral",
};

export function isLeaveStatus(value: unknown): value is LeaveStatus {
  return typeof value === "string" && (LEAVE_STATUSES as readonly string[]).includes(value);
}

/** Allowed transitions between statuses. */
export const ALLOWED_LEAVE_TRANSITIONS: Record<LeaveStatus, readonly LeaveStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"], // May be cancelled prior to attendance taking
  rejected: [], // Terminal
  cancelled: [], // Terminal
};

/** Predicate checking whether a status change is permitted. */
export function canTransitionLeaveStatus(from: LeaveStatus, to: LeaveStatus): boolean {
  if (from === to) return false;
  return ALLOWED_LEAVE_TRANSITIONS[from].includes(to);
}

/** Enforces valid status transitions, throwing BusinessRuleError on violation. */
export function assertLeaveStatusTransition(from: LeaveStatus, to: LeaveStatus): void {
  if (!canTransitionLeaveStatus(from, to)) {
    throw new BusinessRuleError(
      `Cannot transition leave request from "${from}" to "${to}".`,
      {
        userMessage: `This leave request is ${LEAVE_STATUS_LABELS[from].toLowerCase()} and cannot be changed to ${LEAVE_STATUS_LABELS[to].toLowerCase()}.`,
        details: { status: `Current status "${from}" cannot transition to "${to}".` },
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Leave Types & Requested By                                                 */
/* -------------------------------------------------------------------------- */

export const LEAVE_TYPES = [
  "sick",
  "family_emergency",
  "academic",
  "travel",
  "sports",
  "other",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick: "Medical / Sick Leave",
  family_emergency: "Family Emergency",
  academic: "Academic / School Activity",
  travel: "Planned Travel",
  sports: "Sports / Extracurricular",
  other: "Other Reason",
};

export const LEAVE_REQUESTED_BY = ["guardian", "staff", "system"] as const;
export type LeaveRequestedBy = (typeof LEAVE_REQUESTED_BY)[number];

/* -------------------------------------------------------------------------- */
/* Date Calculation & Range Rules                                             */
/* -------------------------------------------------------------------------- */

/**
 * Calculates the inclusive number of calendar days between fromDate and toDate.
 *
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @param _countPartialDays - Whether partial days count (reserved for institutional half-day policy)
 * @returns Total inclusive calendar days (>= 1)
 */
export function calculateLeaveDays(
  fromDate: string,
  toDate: string,
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new ValidationError("Dates must be in YYYY-MM-DD format.", {
      dates: ["Invalid date format (must be YYYY-MM-DD)."],
    });
  }

  const fromTime = Date.parse(`${fromDate}T00:00:00Z`);
  const toTime = Date.parse(`${toDate}T00:00:00Z`);

  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    throw new ValidationError("Invalid calendar date.", {
      dates: ["Please select valid calendar dates."],
    });
  }

  if (toTime < fromTime) {
    throw new BusinessRuleError("End date must be on or after start date.", {
      userMessage: "Leave end date cannot be earlier than start date.",
      details: { toDate: "End date must be on or after start date." },
    });
  }

  // Inclusive day calculation (e.g. 2026-11-01 to 2026-11-01 is 1 day)
  const diffMs = toTime - fromTime;
  const days = Math.round(diffMs / 86_400_000) + 1;

  if (days <= 0) {
    throw new BusinessRuleError("Leave duration must be at least 1 day.", {
      userMessage: "Leave must span at least 1 day.",
      details: { totalDays: "Duration must be greater than zero." },
    });
  }

  return days;
}

/**
 * Validates leave dates and checks against category consecutive days cap if configured.
 */
export function validateLeaveDates(
  fromDate: string,
  toDate: string,
  maxConsecutiveDays?: number | null,
): { totalDays: number } {
  const totalDays = calculateLeaveDays(fromDate, toDate);

  if (maxConsecutiveDays !== null && maxConsecutiveDays !== undefined && maxConsecutiveDays > 0) {
    if (totalDays > maxConsecutiveDays) {
      throw new BusinessRuleError(
        `Leave duration of ${totalDays} days exceeds maximum allowed limit of ${maxConsecutiveDays} days for this leave type.`,
        {
          userMessage: `This leave category allows at most ${maxConsecutiveDays} consecutive days (requested: ${totalDays} days).`,
          details: {
            totalDays: `Maximum allowed is ${maxConsecutiveDays} days.`,
          },
        },
      );
    }
  }

  return { totalDays };
}

/** Check if two date ranges overlap (both ranges inclusive). */
export function areLeaveRangesOverlapping(
  a: { readonly fromDate: string; readonly toDate: string },
  b: { readonly fromDate: string; readonly toDate: string },
): boolean {
  return a.fromDate <= b.toDate && a.toDate >= b.fromDate;
}

/** Check if a specific calendar date falls within a leave range. */
export function isDateWithinLeaveRange(
  date: string,
  fromDate: string,
  toDate: string,
): boolean {
  return date >= fromDate && date <= toDate;
}

/* -------------------------------------------------------------------------- */
/* Subject & Review Invariants                                                */
/* -------------------------------------------------------------------------- */

/**
 * Enforces single-subject constraint: exactly one of studentId or employeeId.
 */
export function validateLeaveSubject(subject: {
  readonly studentId?: string | null;
  readonly employeeId?: string | null;
}): void {
  const hasStudent = Boolean(subject.studentId);
  const hasEmployee = Boolean(subject.employeeId);

  if ((hasStudent && hasEmployee) || (!hasStudent && !hasEmployee)) {
    throw new BusinessRuleError(
      "A leave request must belong to exactly one subject: either a student or an employee.",
      {
        userMessage: "Please specify either a student or an employee for this leave request.",
        details: {
          subject: "Exactly one of student or employee is required.",
        },
      },
    );
  }
}

/**
 * Enforces review rules:
 * - A reviewer ID is mandatory for any decision.
 * - Rejection strictly requires an explanatory note (DB constraint + audit trail).
 */
export function validateLeaveReview(review: {
  readonly status: "approved" | "rejected" | "cancelled";
  readonly decidedByUserId: string;
  readonly decisionNotes?: string | null;
}): void {
  if (!review.decidedByUserId || review.decidedByUserId.trim().length === 0) {
    throw new BusinessRuleError("A decision must record the reviewer.", {
      userMessage: "Missing reviewer information.",
      details: { decidedByUserId: "Reviewer is required." },
    });
  }

  if (review.status === "rejected") {
    if (!review.decisionNotes || review.decisionNotes.trim().length === 0) {
      throw new BusinessRuleError("Rejection requires an explanation note.", {
        userMessage: "Please provide a reason for rejecting this leave request.",
        details: { decisionNotes: "Rejection notes are required." },
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Attendance Integration Rule                                                */
/* -------------------------------------------------------------------------- */

/**
 * Critical rule from PRD.md MODULE 13 & PHASES.md §24:
 *
 * - Approved leave: `LEAVE` (with source `derived_from_leave` and non-null `leaveRequestId`).
 * - Unapproved / rejected / pending leave + absence: `ABSENT`.
 * - Present student remains `PRESENT`.
 *
 * Attendance and leave cannot produce contradictory states.
 */
export function determineAttendanceStatusForAbsence(params: {
  readonly isAbsent: boolean;
  readonly hasApprovedLeave: boolean;
  readonly leaveRequestId?: string | null;
}): {
  readonly status: "leave" | "absent" | "present";
  readonly leaveRequestId: string | null;
  readonly source: "derived_from_leave" | "manual";
} {
  if (!params.isAbsent) {
    return { status: "present", leaveRequestId: null, source: "manual" };
  }

  if (params.hasApprovedLeave && params.leaveRequestId) {
    return {
      status: "leave",
      leaveRequestId: params.leaveRequestId,
      source: "derived_from_leave",
    };
  }

  return {
    status: "absent",
    leaveRequestId: null,
    source: "manual",
  };
}
