/**
 * Select-option builders shared by the student and guardian form files (Phase 7 UI).
 *
 * Pure values over the module's own enum tuples, so this file is safe for both server pages and
 * `"use client"` dialogs — unlike the module barrel, which re-exports the Drizzle store
 * (`index.ts` header). `sectionOptions` lives here rather than in a client file because the
 * **server** page builds the per-session section list it hands to the placement dialog.
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
  PLACEMENT_REASONS,
  type StudentLifecycle,
} from "../domain/domain-rules";

/** `re_admission` → `Re Admission`. The database stores the key; the form shows this. */
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

export const RELATIONSHIP_OPTIONS: readonly SelectOption[] = tupleOptions(GUARDIAN_RELATIONSHIPS);

export const CONTACT_TYPE_OPTIONS: readonly SelectOption[] = tupleOptions(GUARDIAN_CONTACT_TYPES);

export const PLACEMENT_REASON_OPTIONS: readonly SelectOption[] = tupleOptions(PLACEMENT_REASONS);

export const DOCUMENT_TYPE_OPTIONS: readonly SelectOption[] = tupleOptions(DOCUMENT_TYPES);

/**
 * Flatten one session's class tree into the placement dialog's section choices. The label carries
 * the whole path because section names repeat across classes ("A" in Class 5 and Class 6) — the
 * dialog must name where the child is going, not just the room.
 */
export function sectionOptions(trees: readonly ClassNode[]): readonly SelectOption[] {
  return trees.flatMap((node) =>
    node.groups.flatMap((group) =>
      group.sections.map((section) => ({
        value: section.id,
        label: `${node.name} · ${group.name} · ${section.name}`,
      })),
    ),
  );
}

/** Badge tone per lifecycle state — one map, shared by the roster and the detail page. */
export const LIFECYCLE_TONES: Record<StudentLifecycle, StatusTone> = {
  admitted: "info",
  active: "success",
  promoted: "success",
  graduated: "info",
  transferred: "neutral",
  withdrawn: "neutral",
  inactive: "warning",
};

/** Badge tone per document status (`DOCUMENT_STATUSES`). */
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
