/**
 * Select-option builders for the payroll dialogs (`PRD.md` MODULE 9/10 UI).
 *
 * Pure values over the module's domain tuples — imported from `domain/payroll-rules`, never the
 * barrel, so this file is safe for `"use client"` dialogs (`index.ts` header: the barrel re-exports
 * the Drizzle store, which cannot reach the browser).
 *
 * Labels come from the domain's display maps where they exist (`PAYROLL_STATUS_LABELS`,
 * `ADJUSTMENT_TYPE_LABELS`), and from the institution's own data otherwise (`academicSessions`).
 */
import type { SelectOption } from "@/components/shared/select-field";

import {
  ADJUSTMENT_TYPES,
  ADJUSTMENT_TYPE_LABELS,
  PAYROLL_STATUSES,
  PAYROLL_STATUS_LABELS,
} from "../domain/payroll-rules";

/** The lifecycle, in the order the state machine walks it. */
export const PAYROLL_STATUS_OPTIONS: readonly SelectOption[] = PAYROLL_STATUSES.map((value) => ({
  value,
  label: PAYROLL_STATUS_LABELS[value],
}));

/** The kinds of manual adjustment, with the sign each one typically carries. */
export const ADJUSTMENT_TYPE_OPTIONS: readonly SelectOption[] = ADJUSTMENT_TYPES.map((value) => ({
  value,
  label: ADJUSTMENT_TYPE_LABELS[value],
}));

/** An academic session the run may be scoped to — runs are monthly, sessions are the term they sit in. */
export function academicSessionOptions(
  sessions: readonly { readonly id: string | null; readonly name: string }[],
): readonly SelectOption[] {
  return sessions
    .filter(
      (session): session is { readonly id: string; readonly name: string } => session.id !== null,
    )
    .map((session) => ({ value: session.id, label: session.name }));
}

/** Every payment method the ledger and `payment_methods` understand, minus finance's default. */
export const PAYMENT_METHOD_OPTIONS: readonly SelectOption[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "online_gateway", label: "Online gateway" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];
