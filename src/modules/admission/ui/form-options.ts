/**
 * Select-option builders and badge tones for the admission forms (Phase 8 task 14).
 *
 * Pure values over this module's domain tuples, so the file is safe for both server pages and
 * `"use client"` dialogs — unlike the admission barrel, which re-exports the Drizzle store
 * (`index.ts` header). Gender, guardian and document tuples are imported from the **student
 * module's domain** rather than its barrel: that file is pure over `@/shared/errors` and its own
 * header documents exactly this cross-module value import, while `@/modules/student` itself would
 * drag the store into the client bundle.
 *
 * `scopeOptions` flattens a session's class tree into the three dependent pickers the application
 * form needs (class → group → section). A private builder here — rather than the student module's
 * `sectionOptions` — keeps the modules independent (`src/modules/README.md` rule 3); the pages
 * assemble the per-session maps once and hand them to the dialogs as props.
 */
import type { SelectOption } from "@/components/shared/select-field";
import type { StatusTone } from "@/components/shared/status-badge";
import type { ClassNode } from "@/modules/academic";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  GENDER_VALUES,
  GUARDIAN_CONTACT_TYPES,
  GUARDIAN_RELATIONSHIPS,
} from "@/modules/student/domain/domain-rules";

import {
  ADMISSION_STATUS_LABELS,
  ADMISSION_TRANSITIONS,
  DECISION_STATUSES,
  type AdmissionStatus,
} from "../domain/domain-rules";

/** `under_review` → `Under review`. The database stores the key; the form shows this. */
export function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function tupleOptions(values: readonly string[], leading?: SelectOption): readonly SelectOption[] {
  const options = values.map((value) => ({ value, label: humanize(value) }));
  return leading === undefined ? options : [leading, ...options];
}

/** Gender carries an explicit "not specified" — nullable by design, not a validation failure. */
export const GENDER_OPTIONS: readonly SelectOption[] = tupleOptions(GENDER_VALUES, {
  value: "",
  label: "Not specified",
});

export const DOCUMENT_TYPE_OPTIONS: readonly SelectOption[] = tupleOptions(DOCUMENT_TYPES);

export const RELATIONSHIP_OPTIONS: readonly SelectOption[] = tupleOptions(GUARDIAN_RELATIONSHIPS);

export const CONTACT_TYPE_OPTIONS: readonly SelectOption[] = tupleOptions(GUARDIAN_CONTACT_TYPES);

/** Badge tone per document status (`DOCUMENT_STATUSES`) — the shared enum, this module's copy. */
export const DOCUMENT_STATUS_TONES: Record<(typeof DOCUMENT_STATUSES)[number], StatusTone> = {
  pending_verification: "warning",
  verified: "success",
  rejected: "danger",
  expired: "neutral",
};

/** Short badge copy for a document's status — the database stores the key, the badge shows this. */
export const DOCUMENT_STATUS_LABELS: Record<(typeof DOCUMENT_STATUSES)[number], string> = {
  pending_verification: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
};

/** Badge tone per application status — one map, shared by the roster and the detail page. */
export const ADMISSION_STATUS_TONES: Record<AdmissionStatus, StatusTone> = {
  submitted: "info",
  under_review: "warning",
  waitlisted: "neutral",
  approved: "success",
  rejected: "danger",
  converted: "info",
  cancelled: "neutral",
};

/**
 * The statuses the decide dialog offers for the application's *current* state: the machine's
 * outgoing edges, minus `converted` — conversion carries its own command with the student payload
 * (`DECISION_STATUSES`'s rationale, restated at the option list the UI never shows).
 */
export function decisionOptions(status: AdmissionStatus): readonly SelectOption[] {
  return ADMISSION_TRANSITIONS[status]
    .filter((next): next is (typeof DECISION_STATUSES)[number] =>
      (DECISION_STATUSES as readonly string[]).includes(next),
    )
    .map((next) => ({ value: next, label: ADMISSION_STATUS_LABELS[next] }));
}

/**
 * Flatten one session's class tree into the dependent pickers of the application/conversion
 * forms. Section labels carry the whole path because section names repeat across classes ("A" in
 * Class 5 and Class 6) — the dialog must name where the child is going, not just the room.
 */
export function scopeOptions(trees: readonly ClassNode[]): {
  readonly classes: readonly SelectOption[];
  readonly groupsByClass: Readonly<Record<string, readonly SelectOption[]>>;
  readonly sections: readonly SelectOption[];
} {
  return {
    classes: trees.map((node) => ({ value: node.id, label: node.name })),
    groupsByClass: Object.fromEntries(
      trees.map((node) => [
        node.id,
        node.groups.map((group) => ({ value: group.id, label: group.name })),
      ]),
    ),
    sections: trees.flatMap((node) =>
      node.groups.flatMap((group) =>
        group.sections.map((section) => ({
          value: section.id,
          label: `${node.name} · ${group.name} · ${section.name}`,
        })),
      ),
    ),
  };
}
