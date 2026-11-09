"use server";

/**
 * Finance server actions (PRD MODULE 7).
 *
 * Each action is the single path from `ui/` into the finance module's use cases
 * (`src/modules/README.md`). It runs **two gates before the command** — the fee module's pattern
 * (`../fees/ui/actions.ts`), with the finance module's own permission keys:
 *
 * 1. the institution gate — `requireInstitutionMutation` resolves the key *at* the institution
 *    the form names and refuses an institution this user does not belong to, so a forged
 *    `institutionId` can never widen a write (`SECURITY.md` §21, §87). The keys, paired with the
 *    navigation item that links to the page:
 *
 *    | command                        | key               |
 *    |--------------------------------|-------------------|
 *    | record income                  | `finance.record`  |
 *    | create an expense              | `finance.record`  |
 *    | submit an expense for approval | `finance.record`  |
 *    | approve / mark paid / reject   | `finance.manage`  |
 *    | create an expense head         | `finance.manage`  |
 *    | reverse a posted journal       | `finance.adjust`  |
 *
 *    The UI's hiding of buttons is a courtesy, not authorization: every one of these actions
 *    re-checks server-side. (`finance.view` is the *page* gate; the ledger is deliberately a
 *    separate grant from reading fees — `permissions.ts`.)
 *
 * 2. the boundary schema — the zod input the module's use case accepts
 *    (`application/schemas.ts`). Normalisations the schema cannot make from a string arrive here:
 *    `expectedVersion` becomes the positive integer the version check compares, and an absent
 *    optional field (`accountId`, `departmentId`, `receiptStorageKey`, `description`) arrives as
 *    `""`, which `optionalId` / `optionalText` turn into `null` themselves — so those parts are
 *    read raw rather than pre-empted here.
 *
 * A refusal from either comes back as a serialisable `FormState` for `useActionState`, not as an
 * error boundary: the user stays on the form and reads why. A `redirect()` (expired session) is
 * deliberately *not* converted — see `gate`.
 *
 * Commands that stamp an actor (`recordIncome`, `approveExpense`, every posting path) receive
 * the acting `principal.userId` from the gate itself; the client never supplies the "who did
 * this" field. What each command *does* — the open period, the state machine, the zero-sum
 * journal, the reversal's reason — is the service's and the store's business
 * (`application/finance-service.ts`, `infrastructure/drizzle-store.ts`).
 *
 * A `ConflictError` from a versioned write revalidates the expenses list before it is reported,
 * so the row's stale `expectedVersion` is replaced by the current one and the next attempt is
 * a genuine retry rather than the same stale token (`DESIGN.md` §17).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import type { PermissionKey, Principal } from "@/shared/authorization";
import { ConflictError, isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

import {
  approveExpense,
  createExpense,
  createExpenseHead,
  markExpensePaid,
  recordIncome,
  rejectExpense,
  reverseJournal,
  submitExpense,
} from "@/modules/finance";

/** Anything naming a route must be a uuid — a raw form value would let an updater purge caches
 *  for paths outside this module, and a malformed one would throw out of the action contract. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Raw `FormData` value for a key, or `""` when the part is absent. */
function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** An optimistic-concurrency token the schema wants as a positive integer. */
function expectedVersion(formData: FormData): number {
  return Number(field(formData, "expectedVersion"));
}

/** Normalise a command failure into a serialisable form state. */
function stateFrom(error: unknown): FormState {
  if (isAppError(error)) {
    if (error instanceof ValidationError) {
      return {
        status: "error",
        message: error.userMessage,
        issues: Object.values(error.fieldErrors).flat(),
      };
    }
    return { status: "error", message: error.userMessage };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

type Gate =
  | { readonly ok: true; readonly principal: Principal }
  | { readonly ok: false; readonly state: FormState };

/**
 * Gate 1: resolve `permission` at the institution the form names, returning the acting principal
 * so caller-stamped commands can use its `userId`.
 *
 * `AppError` becomes the `error` arm of `FormState` — `ForbiddenError`, `ValidationError` and
 * `ConflictError` all carry a safe `userMessage` meant for exactly this. Anything else
 * propagates, and that includes `redirect("/login")` from an expired session: swallowing it would
 * turn "your session ended" into "something went wrong", and an unexpected failure should reach
 * the error boundary rather than be dressed up as a form message.
 */
async function gate(formData: FormData, permission: PermissionKey): Promise<Gate> {
  try {
    const principal = await requireInstitutionMutation(
      permission,
      field(formData, "institutionId"),
    );
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

/**
 * Money writes move the dashboard, the register, and — for a reversal — the journal the form
 * names, whose status flips to `reversed` the moment the correcting journal is posted.
 */
function revalidateJournalPaths(formData: FormData): void {
  revalidatePath("/finance");
  revalidatePath("/finance/transactions");
  const journalId = field(formData, "journalId");
  if (UUID_PATTERN.test(journalId)) revalidatePath(`/finance/transactions/${journalId}`);
}

/** Every expense write moves the dashboard (an approval posts a journal) and the expenses list. */
function revalidateExpensePaths(): void {
  revalidatePath("/finance");
  revalidatePath("/finance/expenses");
}

/**
 * A versioned expense transition that lost a race: report the conflict *and* refresh the list,
 * because the failure came from a row the table is holding a stale token for.
 */
function conflictAware(error: unknown): FormState {
  if (error instanceof ConflictError) revalidateExpensePaths();
  return stateFrom(error);
}

/* -------------------------------------------------------------------------- */
/* Posting                                                                     */
/* -------------------------------------------------------------------------- */

export async function recordIncomeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.record");
  if (!result.ok) return result.state;
  try {
    await recordIncome(
      {
        institutionId: field(formData, "institutionId"),
        amount: field(formData, "amount"),
        currency: field(formData, "currency"),
        transactionOn: field(formData, "transactionOn"),
        method: field(formData, "method"),
        accountId: field(formData, "accountId"),
        description: field(formData, "description"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/finance");
  revalidatePath("/finance/transactions");
  return { status: "done", message: "Income recorded and posted to the ledger." };
}

export async function reverseJournalAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.adjust");
  if (!result.ok) return result.state;
  try {
    await reverseJournal(
      {
        institutionId: field(formData, "institutionId"),
        journalId: field(formData, "journalId"),
        reason: field(formData, "reason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateJournalPaths(formData);
  return {
    status: "done",
    message: "Reversal posted — the original journal is marked reversed, never deleted.",
  };
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

export async function createExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.record");
  if (!result.ok) return result.state;
  try {
    await createExpense(
      {
        institutionId: field(formData, "institutionId"),
        expenseHeadId: field(formData, "expenseHeadId"),
        departmentId: field(formData, "departmentId"),
        amount: field(formData, "amount"),
        currency: field(formData, "currency"),
        description: field(formData, "description"),
        incurredOn: field(formData, "incurredOn"),
        method: field(formData, "method"),
        receiptStorageKey: field(formData, "receiptStorageKey"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateExpensePaths();
  return {
    status: "done",
    message: "Expense recorded as a draft — nothing has left the ledger yet.",
  };
}

export async function submitExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.record");
  if (!result.ok) return result.state;
  try {
    await submitExpense(
      {
        institutionId: field(formData, "institutionId"),
        expenseId: field(formData, "expenseId"),
        expectedVersion: expectedVersion(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    return conflictAware(error);
  }
  revalidateExpensePaths();
  return { status: "done", message: "Expense submitted for approval." };
}

export async function approveExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.manage");
  if (!result.ok) return result.state;
  try {
    await approveExpense(
      {
        institutionId: field(formData, "institutionId"),
        expenseId: field(formData, "expenseId"),
        expectedVersion: expectedVersion(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    return conflictAware(error);
  }
  revalidateExpensePaths();
  return { status: "done", message: "Expense approved — its journal is posted." };
}

export async function markExpensePaidAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.manage");
  if (!result.ok) return result.state;
  try {
    await markExpensePaid(
      {
        institutionId: field(formData, "institutionId"),
        expenseId: field(formData, "expenseId"),
        expectedVersion: expectedVersion(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    return conflictAware(error);
  }
  revalidateExpensePaths();
  return { status: "done", message: "Expense marked as paid." };
}

export async function rejectExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.manage");
  if (!result.ok) return result.state;
  try {
    await rejectExpense(
      {
        institutionId: field(formData, "institutionId"),
        expenseId: field(formData, "expenseId"),
        expectedVersion: expectedVersion(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    return conflictAware(error);
  }
  revalidateExpensePaths();
  return { status: "done", message: "Expense rejected — no journal was posted." };
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

export async function createExpenseHeadAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "finance.manage");
  if (!result.ok) return result.state;
  try {
    await createExpenseHead(
      {
        institutionId: field(formData, "institutionId"),
        name: field(formData, "name"),
        category: field(formData, "category"),
        parentHeadId: field(formData, "parentHeadId"),
        ledgerAccountId: field(formData, "ledgerAccountId"),
        description: field(formData, "description"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateExpensePaths();
  return { status: "done", message: "Expense head created." };
}
