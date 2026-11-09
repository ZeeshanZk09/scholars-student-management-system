/**
 * Select-option builders for the fee dialogs (PRD MODULE 6).
 *
 * Pure values over this module's domain tuples — imported from `domain/fee-rules`, never the
 * barrel, so the file is safe for `"use client"` dialogs (`index.ts` header: the barrel
 * re-exports the Drizzle store, which cannot reach the browser). Labels come from the domain's
 * display maps where one exists (`PAYMENT_METHOD_LABELS`, `FEE_FREQUENCY_LABELS`) and from the
 * shared `humanize` convention where it does not, so the database keeps the key and the form
 * shows the words.
 */
import type { SelectOption } from "@/components/shared/select-field";

import {
  CATEGORIES,
  CONCESSION_KINDS,
  FEE_FREQUENCIES,
  FEE_FREQUENCY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "../domain/fee-rules";

/** `bank_transfer` → `Bank transfer` — for tuples without an explicit label map. */
function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function tupleOptions(values: readonly string[]): readonly SelectOption[] {
  return values.map((value) => ({ value, label: humanize(value) }));
}

/** Who a structure bills: everyone, or one class / group / section. */
export const APPLIES_TO_OPTIONS: readonly SelectOption[] = [
  { value: "all", label: "All students" },
  { value: "class", label: "A class" },
  { value: "group", label: "A group" },
  { value: "section", label: "A section" },
];

export const FEE_FREQUENCY_OPTIONS: readonly SelectOption[] = FEE_FREQUENCIES.map((value) => ({
  value,
  label: FEE_FREQUENCY_LABELS[value],
}));

export const FEE_CATEGORY_OPTIONS: readonly SelectOption[] = tupleOptions(CATEGORIES);

export const PAYMENT_METHOD_OPTIONS: readonly SelectOption[] = PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

export const CONCESSION_KIND_OPTIONS: readonly SelectOption[] = tupleOptions(CONCESSION_KINDS);
