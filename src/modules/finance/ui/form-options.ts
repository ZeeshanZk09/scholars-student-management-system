/**
 * Select-option builders for the finance dialogs (PRD MODULE 7).
 *
 * Pure values over this module's domain tuples — imported from `domain/finance-rules`, never the
 * barrel, so the file is safe for `"use client"` dialogs (`index.ts` header: the barrel
 * re-exports the Drizzle store, which cannot reach the browser). Labels come from the domain's
 * display maps, where every finance tuple already has one (`PAYMENT_METHOD_LABELS`,
 * `JOURNAL_KIND_LABELS`, …), so the database keeps the key and the form shows the words.
 *
 * The two builders that take an argument stay here rather than in the pages: a caller must not
 * rebuild an option list with its own idea of what an account or a filter value is.
 */
import type { SelectOption } from "@/components/shared/select-field";

import type { AccountRow } from "../index";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  JOURNAL_KINDS,
  JOURNAL_KIND_LABELS,
  JOURNAL_STATUSES,
  JOURNAL_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "../domain/finance-rules";

/** How money leaves or arrives — the same six methods the ledger posts with. */
export const PAYMENT_METHOD_OPTIONS: readonly SelectOption[] = PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

/** The reporting vocabulary every expense head is filed under. */
export const EXPENSE_CATEGORY_OPTIONS: readonly SelectOption[] = EXPENSE_CATEGORIES.map(
  (value) => ({
    value,
    label: EXPENSE_CATEGORY_LABELS[value],
  }),
);

/** The register's type filter: what kind of movement a journal records. */
export const JOURNAL_KIND_OPTIONS: readonly SelectOption[] = JOURNAL_KINDS.map((value) => ({
  value,
  label: JOURNAL_KIND_LABELS[value],
}));

export const JOURNAL_STATUS_OPTIONS: readonly SelectOption[] = JOURNAL_STATUSES.map((value) => ({
  value,
  label: JOURNAL_STATUS_LABELS[value],
}));

export const EXPENSE_STATUS_OPTIONS: readonly SelectOption[] = EXPENSE_STATUSES.map((value) => ({
  value,
  label: EXPENSE_STATUS_LABELS[value],
}));

/**
 * One option per financial account, labelled with its currency so a `USD` account cannot be
 * mistaken for the `PKR` one beside it. The caller filters the rows it passes — the accounts
 * dialog of a later phase offers archived accounts; an income form offers only active ones.
 */
export function accountOptions(accounts: readonly AccountRow[]): readonly SelectOption[] {
  return accounts.map((account) => ({
    value: account.id,
    label: `${account.name} (${account.currency})`,
  }));
}
