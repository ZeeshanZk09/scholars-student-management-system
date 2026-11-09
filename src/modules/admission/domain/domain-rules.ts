/**
 * Admission lifecycle rules (`PHASES.md` Phase 8, tasks 8–10).
 *
 * The status machine is asserted from the `admission_status` enum and `DOMAIN-MODEL.md` D-3/BR-3
 * (conversion is a transition, exactly once) rather than mirrored loosely: `converted` and
 * `rejected` are terminal because a second conversion would create a second student from one
 * application (the partial unique `admissions_converted_student_key` enforces the same thing) and
 * a rejected application's appeal history must not be rewritable. `CANCELLED` is terminal too — a
 * cancelled application is an audit fact; reopening one should create a new application.
 *
 * Pure over `@/shared/errors` — no I/O, no Drizzle — plus one type-only import of the shared
 * `document_status` shape from the student module's index (erased at runtime, so the file stays
 * safe to import from a `"use client"` file; the module's option tuples live here for exactly
 * that reason).
 */
import type { DocumentStatus } from "@/modules/student";
import { BusinessRuleError, ConflictError } from "@/shared/errors";

export const ADMISSION_STATUSES = [
  "submitted",
  "under_review",
  "waitlisted",
  "approved",
  "rejected",
  "converted",
  "cancelled",
] as const;

export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export function isAdmissionStatus(value: unknown): value is AdmissionStatus {
  return typeof value === "string" && (ADMISSION_STATUSES as readonly string[]).includes(value);
}

/** Human labels for the states — the database stores the key, the UI shows this. */
export const ADMISSION_STATUS_LABELS: Record<AdmissionStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  waitlisted: "Waitlisted",
  approved: "Approved",
  rejected: "Rejected",
  converted: "Converted",
  cancelled: "Cancelled",
};

/**
 * The outcomes an administrator picks on the decide form. `converted` is absent on purpose:
 * conversion carries its own command with the student payload, and offering it here would let a
 * bare status flip satisfy `admissions_converted_pair` without a student. `submitted` is absent
 * because it is where every application starts. Lives in the domain (not `application/schemas`)
 * so `"use client"` dialogs can build their options from this tuple plus `ADMISSION_STATUS_LABELS`.
 */
export const DECISION_STATUSES = [
  "under_review",
  "waitlisted",
  "approved",
  "rejected",
  "cancelled",
] as const;

/**
 * The state machine. Small institutions may decide directly from `submitted` (there is no
 * reviewer to intermediate), so the edges from `submitted` include every decision — but nothing
 * reaches `converted` except through `approved`, and terminal states have no outgoing edges.
 */
export const ADMISSION_TRANSITIONS: Record<AdmissionStatus, readonly AdmissionStatus[]> = {
  submitted: ["under_review", "waitlisted", "approved", "rejected", "cancelled"],
  under_review: ["waitlisted", "approved", "rejected", "cancelled"],
  waitlisted: ["under_review", "approved", "rejected", "cancelled"],
  approved: ["converted", "rejected", "cancelled"],
  rejected: [],
  converted: [],
  cancelled: [],
};

/** Whether `from → to` is an edge of the state machine. */
export function canTransition(from: AdmissionStatus, to: AdmissionStatus): boolean {
  return ADMISSION_TRANSITIONS[from].includes(to);
}

/**
 * Reject an illegal transition, and reject a transition to the current state — a no-op change is
 * a stale form, not an error the user should have to interpret.
 */
export function assertAdmissionTransition(
  current: AdmissionStatus,
  next: unknown,
  subject = "This application",
): asserts next is AdmissionStatus {
  if (!isAdmissionStatus(next)) {
    throw new ConflictError(`Unknown admission status: ${String(next)}.`);
  }
  if (next === current) {
    throw new ConflictError(
      `${subject} is already ${ADMISSION_STATUS_LABELS[next].toLowerCase()}.`,
    );
  }
  if (!canTransition(current, next)) {
    throw new BusinessRuleError(`Cannot move an application from ${current} to ${next}.`, {
      userMessage: `${subject} is ${ADMISSION_STATUS_LABELS[current].toLowerCase()}, which cannot become ${ADMISSION_STATUS_LABELS[next].toLowerCase()}.`,
    });
  }
}

/**
 * A rejection without a reason cannot be appealed (`PRD.md` MODULE 5 requires appeals, and the
 * `admissions_rejection_reason_check` enforces the same at the database). Blank strings are
 * treated as absent — this is called after the zod boundary, but the rule is domain policy, not
 * field shape.
 */
export function assertDecisionReason(
  next: AdmissionStatus,
  reason: string | null | undefined,
): void {
  if (next !== "rejected") return;
  if (reason === null || reason === undefined || reason.trim() === "") {
    throw new ConflictError("Rejection requires a reason.", {
      userMessage: "Give a reason before rejecting this application.",
    });
  }
}

/** Conversion (BR-3) is reachable only from `approved` — see `ADMISSION_TRANSITIONS`. */
export function assertConvertable(current: AdmissionStatus, subject = "This application"): void {
  if (current === "converted") {
    throw new ConflictError(`${subject} has already been converted.`, {
      userMessage: "This application has already been converted to a student.",
    });
  }
  if (!canTransition(current, "converted")) {
    throw new BusinessRuleError(`Cannot convert an application in status ${current}.`, {
      userMessage: `${subject} is ${ADMISSION_STATUS_LABELS[current].toLowerCase()} — only an approved application can be converted to a student.`,
    });
  }
}

/**
 * The timestamp columns a transition implies. `submittedAt` is stamped once on first submission,
 * `decidedAt` once on the first decision (waitlist/approve/reject/cancel — `under_review` is not
 * a decision), and `convertedAt` once on conversion; a re-read of an old row must never move a
 * date already recorded.
 */
export function admissionTimestampPatch(
  to: AdmissionStatus,
  current: {
    readonly submittedAt: Date | null;
    readonly decidedAt: Date | null;
    readonly convertedAt: Date | null;
  },
  now: Date,
): { readonly submittedAt?: Date; readonly decidedAt?: Date; readonly convertedAt?: Date } {
  const patch: { submittedAt?: Date; decidedAt?: Date; convertedAt?: Date } = {};
  if (to === "submitted" && current.submittedAt === null) patch.submittedAt = now;
  if (
    (to === "waitlisted" || to === "approved" || to === "rejected" || to === "cancelled") &&
    current.decidedAt === null
  ) {
    patch.decidedAt = now;
  }
  if (to === "converted" && current.convertedAt === null) patch.convertedAt = now;
  return patch;
}

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Advisory duplicate matching (task 9) — deliberately *not* a block: identity matching by name
 * and date of birth produces false positives ("Mohammad Ali" twice in one intake is not
 * necessarily one person), and a blocked applicant needs a human override nobody built. Names
 * must match after normalization; date of birth, when present on both sides, must agree — a
 * missing DOB cannot veto, it just leaves the match on name alone.
 */
export function isLikelyDuplicate(
  a: {
    readonly firstName: string;
    readonly lastName: string;
    readonly dateOfBirth?: string | null;
  },
  b: {
    readonly firstName: string;
    readonly lastName: string;
    readonly dateOfBirth?: string | null;
  },
): boolean {
  if (normalize(a.firstName) === "" || normalize(a.lastName) === "") return false;
  if (
    normalize(a.firstName) !== normalize(b.firstName) ||
    normalize(a.lastName) !== normalize(b.lastName)
  ) {
    return false;
  }
  if (a.dateOfBirth && b.dateOfBirth && a.dateOfBirth !== b.dateOfBirth) return false;
  return true;
}

/**
 * Mint the human handle when the form leaves it blank: `ADM-YYYYMMDD-XXXX` (task 8/11 — the
 * application number is unique per institution, and `admissions_institution_application_number_key`
 * backstops any collision, which surfaces as a `ConflictError`, never a 500). The suffix is a
 * parameter so the rule is testable without touching `crypto`.
 */
export function mintApplicationNumber(now: Date, suffix: string): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `ADM-${year}${month}${day}-${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* Editability and documents                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The statuses whose applicant/scope fields may still be edited (task 8: admission validation).
 * Once a decision exists — approved, rejected, cancelled — or the application has been converted,
 * the record is an audit fact: changing the applicant's name or the applied class after approval
 * would rewrite who was approved. The version check in the store guards the *write*; this guards
 * the *right* to write.
 */
export const EDITABLE_ADMISSION_STATUSES = ["submitted", "under_review", "waitlisted"] as const;

export function assertAdmissionEditable(status: AdmissionStatus): void {
  if ((EDITABLE_ADMISSION_STATUSES as readonly string[]).includes(status)) return;
  throw new ConflictError(`A ${status} application cannot be edited.`, {
    userMessage: `This application is ${ADMISSION_STATUS_LABELS[status].toLowerCase()} and can no longer be edited — its outcome is recorded.`,
  });
}

/**
 * Document verification for `admission_documents` — the same shared `document_status` enum and
 * the same DB pair constraint as student documents, so the same shape of rule applies here in the
 * module that owns the table. The `verified → verifiedBy/At` stamps themselves are written by the
 * store alongside the status.
 */
export function assertAdmissionDocumentDecision(
  current: DocumentStatus,
  decision: "verified" | "rejected",
  rejectionReason: string | null,
): void {
  if (current !== "pending_verification") {
    throw new BusinessRuleError(`Cannot ${decision} a ${current.replace("_", " ")} document.`, {
      userMessage: "This document is not awaiting verification, so there is nothing to decide.",
    });
  }
  if (decision === "rejected" && (rejectionReason === null || rejectionReason.trim() === "")) {
    throw new ConflictError("Rejection requires a reason.", {
      userMessage: "Give a reason before rejecting this document.",
    });
  }
}
