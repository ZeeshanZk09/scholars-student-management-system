/**
 * Pure student and guardian rules (`PHASES.md` Phase 7 — tasks 2, 4–6, 11–14).
 *
 * Anything that needs a database (existence, uniqueness, who belongs to which institution) stays in
 * the service; these are the decision rules around it, so they are unit-testable without a store —
 * the same split `src/modules/academic/domain/domain-rules.ts` uses.
 *
 * Two axes are deliberately never mixed here (DOMAIN-MODEL §3, decision D-4): `lifecycle` is *what
 * became of the student*, `archivedAt` is *whether this row still counts*. A graduated student is
 * history with an intact record; an archived row is a record that was created in error. Neither
 * implies the other, so nothing below derives one from the other.
 */
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Student identity (tasks 2, 14)                                             */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Enum vocabulary (shared by zod schemas, ports and the UI)                  */
/* -------------------------------------------------------------------------- */

/**
 * The `guardian_relationship` values. One tuple feeds three things — the zod boundary, the port
 * types and the relationship picker — so a new relationship is a single edit plus a migration,
 * never a half-updated list.
 */
/** The `gender` values (`_enums.ts`). Unknown is a legitimate answer — hence `undisclosed`. */
export const GENDER_VALUES = ["male", "female", "other", "undisclosed"] as const;
export type Gender = (typeof GENDER_VALUES)[number];

export const GUARDIAN_RELATIONSHIPS = [
  "father",
  "mother",
  "grandparent",
  "sibling",
  "uncle_aunt",
  "legal_guardian",
  "foster_guardian",
  "other",
] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

/** The `guardian_contact_type` values — which adult to ring first (schema comment on the index). */
export const GUARDIAN_CONTACT_TYPES = ["primary", "secondary", "emergency"] as const;
export type GuardianContactType = (typeof GUARDIAN_CONTACT_TYPES)[number];

/** The `student_placements.placement_reason` check-constraint values. */
export const PLACEMENT_REASONS = ["admission", "promotion", "transfer", "re_admission"] as const;
export type PlacementReason = (typeof PLACEMENT_REASONS)[number];

/** The eight `document_type` values (`_enums.ts`, MODULE 5: B-Form and birth certificate named). */
export const DOCUMENT_TYPES = [
  "b_form",
  "birth_certificate",
  "transfer_certificate",
  "previous_result_card",
  "national_id",
  "photo",
  "medical_certificate",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** The lifecycle states of `student_lifecycle` (`DOMAIN-MODEL.md` §3). */
export const STUDENT_LIFECYCLE_STATES = [
  "admitted",
  "active",
  "promoted",
  "graduated",
  "transferred",
  "withdrawn",
  "inactive",
] as const;

/** One value of `student_lifecycle`. */
export type StudentLifecycle = (typeof STUDENT_LIFECYCLE_STATES)[number];

/** Narrow an arbitrary string (form input, database value) to a lifecycle state. */
export function isStudentLifecycle(value: unknown): value is StudentLifecycle {
  return (
    typeof value === "string" && (STUDENT_LIFECYCLE_STATES as readonly string[]).includes(value)
  );
}

/**
 * The state machine of `DOMAIN-MODEL.md` §3, encoded as an adjacency map (BR-4: invalid
 * transitions are rejected, not silently accepted):
 *
 * ```text
 * Admitted → Active → Promoted → Graduated
 *              ↘ Transferred / Withdrawn / Inactive
 * ```
 *
 * Terminal states have no outgoing edge on purpose. A withdrawn student does not become active
 * again — re-admission is a new *admission* (`DOMAIN-MODEL.md` §3.1, decision D-3), which is a
 * separate entity in its own phase, so resurrecting the row here would erase the reason it was
 * withdrawn. `inactive → active` is the one reactivation that stays on the same record, because
 * inactivity is an administrative pause rather than an outcome.
 */
export const LIFECYCLE_TRANSITIONS: Record<StudentLifecycle, readonly StudentLifecycle[]> = {
  admitted: ["active", "transferred", "withdrawn", "inactive"],
  active: ["promoted", "graduated", "transferred", "withdrawn", "inactive"],
  promoted: ["active", "graduated"],
  inactive: ["active", "withdrawn"],
  graduated: [],
  transferred: [],
  withdrawn: [],
};

/** Human labels for the states — the database stores the key, the UI shows this. */
export const LIFECYCLE_LABELS: Record<StudentLifecycle, string> = {
  admitted: "Admitted",
  active: "Active",
  promoted: "Promoted",
  graduated: "Graduated",
  transferred: "Transferred",
  withdrawn: "Withdrawn",
  inactive: "Inactive",
};

/** Whether `from → to` is an edge of the state machine. */
export function canTransition(from: StudentLifecycle, to: StudentLifecycle): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * Reject an illegal transition, and reject a transition to the current state (a no-op change is
 * not an error a user should have to interpret — it is a stale form, and the message says so).
 */
export function assertLifecycleTransition(
  current: StudentLifecycle,
  next: unknown,
  studentName = "This student",
): asserts next is StudentLifecycle {
  if (!isStudentLifecycle(next)) {
    throw new ConflictError(`Unknown lifecycle state: ${String(next)}.`);
  }
  if (next === current) {
    throw new ConflictError(`${studentName} is already ${LIFECYCLE_LABELS[next].toLowerCase()}.`);
  }
  if (!canTransition(current, next)) {
    throw new BusinessRuleError(`Cannot move a student from ${current} to ${next}.`, {
      userMessage: `${studentName} is ${LIFECYCLE_LABELS[current].toLowerCase()}, which cannot become ${LIFECYCLE_LABELS[next].toLowerCase()}.`,
    });
  }
}

/**
 * The timestamp columns a transition implies.
 *
 * `admittedAt` is only stamped when the student first becomes active (the schema leaves it null
 * precisely because a student is not born "active" here), and the outcome timestamps are stamped
 * once — a re-read of an old row must not move the date it graduated on.
 */
export function lifecycleTimestampPatch(
  to: StudentLifecycle,
  current: {
    readonly admittedAt: Date | null;
    readonly graduatedAt: Date | null;
    readonly withdrawnAt: Date | null;
  },
  now: Date,
): { readonly admittedAt?: Date; readonly graduatedAt?: Date; readonly withdrawnAt?: Date } {
  const patch: { admittedAt?: Date; graduatedAt?: Date; withdrawnAt?: Date } = {};
  if (to === "active" && current.admittedAt === null) patch.admittedAt = now;
  if (to === "graduated" && current.graduatedAt === null) patch.graduatedAt = now;
  if (to === "withdrawn" && current.withdrawnAt === null) patch.withdrawnAt = now;
  return patch;
}

/** Guarantee the student exists before anything is done to them. */
export function assertStudentExists<T>(
  student: T | null,
  subject = "Student",
): asserts student is T {
  if (student === null) {
    throw new NotFoundError(`${subject} does not exist.`, {
      userMessage: `That student is no longer available. Refresh the page and try again.`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Placement & enrollment (tasks 11, 12)                                      */
/* -------------------------------------------------------------------------- */

/** The session columns a placement decision reads — kept narrow so the rule needs no store. */
export interface SessionView {
  readonly id: string;
  readonly name: string;
  readonly isCurrent: boolean;
  readonly closedAt: Date | null;
}

/**
 * RULES §44: closed sessions are read-only history, so a placement or enrollment cannot be written
 * into one. A *non-current but open* session is fine — backfilling last term while this term runs
 * is a real need, and the append-only placement table (decision D-2) is what keeps both.
 */
export function assertSessionAcceptsPlacement(
  session: SessionView | null,
  subject = "That academic session",
): asserts session is SessionView {
  if (session === null) {
    throw new NotFoundError("Academic session does not exist.", {
      userMessage: `${subject} is not available. Choose another session and try again.`,
    });
  }
  if (session.closedAt !== null) {
    throw new BusinessRuleError("Cannot place a student in a closed session.", {
      userMessage: `${session.name} is closed and read-only. Place the student in an open session instead.`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Guardian links (tasks 4–6, 17)                                             */
/* -------------------------------------------------------------------------- */

/** The link columns these rules read. */
export interface GuardianLinkView {
  readonly guardianUserId: string;
  readonly studentId: string;
  readonly relationship: string;
  readonly isActive: boolean;
}

/**
 * A student has at most one **active** primary contact (the partial unique index
 * `guardian_links_one_primary_key` enforces it). The rule is stated here as well because the
 * database can only tell the writer after it has already conflicted; refusing before the insert
 * produces the message a person can act on.
 */
export function assertPrimaryContactFree(
  currentPrimaryExists: boolean,
  requestedContactType: string | null,
): void {
  if (requestedContactType === "primary" && currentPrimaryExists) {
    throw new ConflictError("This student already has a primary guardian.", {
      userMessage: `Make another guardian primary first, or save this one as a secondary contact.`,
    });
  }
}

/** Unlinking is only meaningful for a link that is still active — twice would mean nothing. */
export function assertLinkIsActive(
  link: GuardianLinkView | null,
): asserts link is GuardianLinkView {
  if (link === null) {
    throw new NotFoundError("Guardian link does not exist.");
  }
  if (!link.isActive) {
    throw new ConflictError("This guardian link is already inactive.", {
      userMessage: `This guardian is already unlinked from the student.`,
    });
  }
}

/** Re-linking the same pair would create a second "current" relationship for one pairing. */
export function assertNotAlreadyLinked(existing: GuardianLinkView | null): void {
  if (existing !== null && existing.isActive) {
    throw new ConflictError("These guardians are already linked.", {
      userMessage: `That guardian is already linked to this student.`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Documents (task 10)                                                        */
/* -------------------------------------------------------------------------- */

/** Statuses of `student_documents.status`. */
export const DOCUMENT_STATUSES = [
  "pending_verification",
  "verified",
  "rejected",
  "expired",
] as const;

/** One value of `student_documents.status`. */
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Narrow an arbitrary string to a document status. */
export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return typeof value === "string" && (DOCUMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * A verification decision: only a document that is still awaiting review can be verified or
 * rejected, and rejecting requires a reason a human can read (`RULES.md` §51 keeps the audit trail
 * meaningful only if "why" is recorded).
 */
export function assertDocumentDecision(
  current: DocumentStatus,
  decision: "verified" | "rejected",
  rejectionReason: string | null,
): void {
  if (current !== "pending_verification") {
    throw new BusinessRuleError(`Cannot ${decision} a ${current.replace("_", " ")} document.`, {
      userMessage: `This document is not awaiting verification, so there is nothing to decide.`,
    });
  }
  if (decision === "rejected" && (rejectionReason === null || rejectionReason.trim() === "")) {
    throw new ConflictError("Rejection requires a reason.", {
      userMessage: "Give a reason before rejecting this document.",
    });
  }
}
