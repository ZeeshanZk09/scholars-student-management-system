/**
 * Attendance domain rules (`PRD.md` MODULE 15/16/19, `RULES.md` §16/§18/§44/§51,
 * `ARCHITECTURE.md` §17–§18/§35).
 *
 * Pure business rules for marking, correcting and finalising attendance. Knows nothing of
 * Next.js, Drizzle or PostgreSQL — only what makes an attendance record valid and how marks
 * transition. Every rule here is asserted in `attendance-rules.test.ts`.
 *
 * ## The four statuses (§1)
 *
 * `present`, `absent`, `late`, `leave`. Nothing else is a mark — `excused`, `half_day` and free
 * text are deliberately absent.
 *
 * ## The leave/absence boundary (§2)
 *
 * An unapproved absence is `absent`, never `leave`. `leave` appears only when an approved
 * `leave_requests` row stands behind it, which is why `status = leave` implies
 * `source = derived_from_leave` and a present `leaveRequestId`. The boundary schema cannot know
 * whether a request is approved — that is state the service reads — so this module owns the
 * rule as a pure assertion: `status === leave` requires `source === derived_from_leave`.
 *
 * ## Source decides attribution (§3)
 *
 * `manual` (a Floor-Incharge tapped it), `biometric` (a device claim), `imported` (bulk load),
 * `derived_from_leave` (the attendance module itself derived it from an approved leave). `source`
 * is what makes a disputed mark attributable, and it is checked against `status`:
 * - `leave` → `derived_from_leave` only
 * - `manual` → requires a `markedByUserId`
 * - `biometric` → requires a `biometricTransactionId`
 *
 * ## Lateness (§4)
 *
 * `minutesLate` belongs to `late` alone — "absent 20 minutes late" is the contradiction
 * `ARCHITECTURE.md` §18 rules out. Required and positive for `late`, null otherwise.
 *
 * ## Corrections are append-only (§5)
 *
 * A mark changes only through `attendance_corrections`, recording before/after status, reason,
 * author and moment. `beforeStatus` is text (not the enum) so a historical value the enum no
 * longer permits stays readable. A correction is allowed any→any status transition except
 * `leave`, which still requires an approved leave behind it.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

/** The complete, final set of attendance statuses — no others are accepted anywhere. */
export const ATTENDANCE_STATUSES = ["present", "absent", "late", "leave"] as const;

/** One of the four final attendance statuses. */
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** `late` is the only status that carries minutes — every other state rejects them. */
export const LATENESS_CARRIES_MINUTES = new Set(["late"]);

/**
 * A status alone is not enough: `leave` requires an approved leave request behind it, which
 * the service must supply as `leaveRequestId`. This predicate is the enum's business meaning.
 */
export function isLeaveStatus(status: string): status is "leave" {
  return status === "leave";
}

/** True when a mark states the student was not in the room for the whole period. */
export function isAbsentStatus(status: string): boolean {
  return status === "absent";
}

/** True when a mark states the student arrived partway through the period. */
export function isLateStatus(status: string): boolean {
  return status === "late";
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

/** The complete, final set of mark sources — who or what decided the mark. */
export const ATTENDANCE_SOURCES = [
  "manual",
  "biometric",
  "imported",
  "derived_from_leave",
] as const;

/** One of the four final attendance sources. */
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number];

/** A mark an actual person tapped — always attributable to a `markedByUserId`. */
export function isManualSource(source: string): boolean {
  return source === "manual";
}

/** A claim from a biometric device; becomes a mark only through resolution. */
export function isBiometricSource(source: string): boolean {
  return source === "biometric";
}

/** A mark the attendance module itself derived from an approved leave request. */
export function isDerivedFromLeaveSource(source: string): boolean {
  return source === "derived_from_leave";
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Assert the full business contract for one attendance mark, before anything touches a database.
 *
 * Throws `ValidationError` for a malformed mark and `BusinessRuleError` for a rule that the
 * boundary schema cannot express (the leave/absence pairing).
 *
 * @param mark - one attendance mark's fields, in the shape the service reads
 */
export function validateAttendanceMark(mark: {
  readonly status: string;
  readonly source: string;
  readonly leaveRequestId: string | null;
  readonly biometricTransactionId: string | null;
  readonly markedByUserId: string | null;
  readonly minutesLate: number | null;
}): void {
  if (!ATTENDANCE_STATUSES.includes(mark.status as AttendanceStatus)) {
    throw new ValidationError(`Unknown attendance status "${mark.status}".`, {
      status: [`Use ${ATTENDANCE_STATUSES.join(", ")}.`],
    });
  }

  if (!ATTENDANCE_SOURCES.includes(mark.source as AttendanceSource)) {
    throw new ValidationError(`Unknown attendance source "${mark.source}".`, {
      source: [`Use ${ATTENDANCE_SOURCES.join(", ")}.`],
    });
  }

  // §2 — leave must be derived from an approved leave request.
  if (isLeaveStatus(mark.status)) {
    if (!isDerivedFromLeaveSource(mark.source)) {
      throw new BusinessRuleError("A leave mark must be derived from an approved leave request.", {
        userMessage:
          "Leave can only be recorded from an approved leave request. Approve the leave request first.",
        details: { leaveRequestId: "An approved leave request is required to record a leave mark." },
      });
    }
    if (!mark.leaveRequestId) {
      throw new BusinessRuleError("A leave mark must name its leave request.", {
        userMessage: "The leave request behind this leave mark is missing.",
        details: { leaveRequestId: "Select the approved leave request." },
      });
    }
  }

  // §4 — minutes_late belongs to late alone.
  if (isLateStatus(mark.status)) {
    if (
      typeof mark.minutesLate !== "number" ||
      !Number.isFinite(mark.minutesLate) ||
      mark.minutesLate <= 0
    ) {
      throw new ValidationError("A late mark must record how many minutes late.", {
        minutesLate: ["Enter a positive whole number of minutes."],
      });
    }
  } else if (mark.minutesLate !== null) {
    throw new ValidationError(`Minutes late is meaningless for a ${mark.status} mark.`, {
      minutesLate: [`Only a late mark may carry minutes.`],
    });
  }

  // §3 — manual marks are attributable to a person.
  if (isManualSource(mark.source) && !mark.markedByUserId) {
    throw new BusinessRuleError("A manual mark must name who marked it.", {
      userMessage: "Please confirm who marked this attendance.",
      details: { markedByUserId: "Choose the staff member who marked it." },
    });
  }

  // §3 — biometric marks are tied to a device transaction.
  if (isBiometricSource(mark.source) && !mark.biometricTransactionId) {
    throw new BusinessRuleError("A biometric mark must reference its device transaction.", {
      userMessage: "This mark has no biometric transaction behind it.",
      details: { biometricTransactionId: "Link the device scan first." },
    });
  }
}

/**
 * Assert a correction's before/after pair. Any status may become any other except `leave`,
 * which still needs an approved leave request behind it.
 */
export function validateAttendanceCorrection(correction: {
  readonly beforeStatus: string;
  readonly afterStatus: string;
  readonly reason: string;
  readonly correctedByUserId: string | null;
}): void {
  if (correction.beforeStatus === correction.afterStatus) {
    throw new ValidationError("A correction must actually change the status.", {
      afterStatus: ["Choose a different status."],
    });
  }
  if (!ATTENDANCE_STATUSES.includes(correction.afterStatus as AttendanceStatus)) {
    throw new ValidationError(`Unknown attendance status "${correction.afterStatus}".`, {
      afterStatus: [`Use ${ATTENDANCE_STATUSES.join(", ")}.`],
    });
  }
  if (correction.afterStatus === "leave" && !correction.reason) {
    throw new BusinessRuleError(
      "Correcting to leave needs an approved leave request and a reason.",
      { userMessage: "A leave correction needs an approved leave request and a reason." },
    );
  }
  if (!correction.correctedByUserId) {
    throw new BusinessRuleError("A correction must name who corrected it.", {
      userMessage: "Please confirm who corrected this attendance.",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Session state                                                              */
/* -------------------------------------------------------------------------- */

/** A marking session is open while the teacher is tapping; submitted once committed. */
export const SESSION_STATUSES = ["in_progress", "submitted"] as const;

export function isSessionSubmitted(status: string): boolean {
  return status === "submitted";
}

/**
 * A session's counts must agree: marked cannot exceed total, and a submitted session
 * needs both a submitter and a moment.
 */
export function validateSessionTotals(session: {
  readonly totalStudents: number;
  readonly markedCount: number;
  readonly status: string;
  readonly submittedByUserId: string | null;
  readonly submittedAt: Date | null;
}): void {
  if (typeof session.totalStudents !== "number" || session.totalStudents < 0) {
    throw new ValidationError("Total students must be zero or more.", {
      totalStudents: ["Enter zero or more students."],
    });
  }
  if (
    typeof session.markedCount !== "number" ||
    session.markedCount < 0 ||
    session.markedCount > session.totalStudents
  ) {
    throw new ValidationError("Marked students cannot exceed the total, nor be below zero.", {
      markedCount: ["Marked must be between zero and the total."],
    });
  }
  if (isSessionSubmitted(session.status)) {
    if (!session.submittedByUserId) {
      throw new BusinessRuleError("A submitted session needs a submitter.", {
        userMessage: "Confirm who submitted this register.",
      });
    }
    if (!session.submittedAt) {
      throw new BusinessRuleError("A submitted session needs a moment.", {
        userMessage: "Confirm when this register was submitted.",
      });
    }
  }
}
