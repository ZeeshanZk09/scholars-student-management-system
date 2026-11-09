"use server";

/**
 * Fee server actions (PRD MODULE 6).
 *
 * Each action is the single path from `ui/` into the fee module's use cases
 * (`src/modules/README.md`). It runs **two gates before the command** — the admission module's
 * pattern (`../admission/ui/actions.ts`), with the fee module's own permission keys:
 *
 * 1. the institution gate — `requireInstitutionMutation` resolves the key *at* the institution
 *    the form names and refuses an institution this user does not belong to, so a forged
 *    `institutionId` can never widen a grant (`SECURITY.md` §21, §87). The keys, paired with the
 *    navigation item that links to the page:
 *
 *    | command                          | key             |
 *    |----------------------------------|-----------------|
 *    | create / edit fee structure      | `fees.manage`   |
 *    | generate invoices                | `fees.manage`   |
 *    | record payment                   | `fees.record`   |
 *    | concession, deferral, credit note| `fees.adjust`   |
 *
 *    The UI's hiding of buttons is a courtesy, not authorization: every one of these actions
 *    re-checks server-side. (`fees.view` is the *page* gate; `fees.refund` guards a future
 *    refund command and is not used here.)
 *
 * 2. the boundary schema — the zod input the module's use case accepts
 *    (`application/schemas.ts`). Normalisations the schema cannot make from a string arrive here:
 *    `version` becomes the store's `expectedVersion` number, checkboxes become real booleans
 *    (`formData.has` — an unchecked box sends nothing, and `isActive` must be `false`, not its
 *    schema default), and two FormData array shapes are assembled into the plain objects the
 *    schemas expect:
 *
 *    - **Fee-structure items**: repeated `itemName` / `itemAmount` / … parts (one set per row,
 *      in DOM order) are zipped by index into `items: [{ name, amount, … }]`; an item's
 *      mandatory checkbox cannot share one name across rows (an unchecked box sends nothing), so
 *      each row posts `itemIsMandatory-{index}` and the action reads it per index.
 *    - **Payment allocations**: repeated `allocationInvoiceId` / `allocationAmount` parts are
 *      zipped by index (`1..n` rows); a form that posts none — the single-invoice payment
 *      dialog, which posts one hidden `invoiceId` — becomes one allocation of the full payment
 *      amount against that invoice.
 *
 * A refusal from either comes back as a serialisable `FormState` for `useActionState`, not as an
 * error boundary: the user stays on the form and reads why. A `redirect()` (expired session) is
 * deliberately *not* converted — see `gate`.
 *
 * Commands that stamp an actor (`createStructure`, `recordPayment`, every money write) receive
 * the acting `principal.userId` from the gate itself; the client never supplies the "who did
 * this" field.
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import type { PermissionKey, Principal } from "@/shared/authorization";
import { ConflictError, isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

import {
  createFeeCreditNote,
  createFeeStructure,
  decideFeeDeferral,
  generateInvoices,
  grantFeeConcession,
  recordFeePayment,
  requestFeeDeferral,
  updateFeeStructure,
} from "@/modules/fees";

/** Anything naming a route must be a uuid — a raw form value would let an updater purge caches
 *  for paths outside this module, and a malformed one would throw out of the action contract. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The structures list always moves with the structure; the detail page only when named. */
function revalidateStructure(formData: FormData): void {
  revalidatePath("/fees/structures");
  const structureId = field(formData, "id");
  if (UUID_PATTERN.test(structureId)) revalidatePath(`/fees/structures/${structureId}`);
}

/** Money writes move the dashboard, the invoice list, and the invoice the form names. */
function revalidateInvoice(formData: FormData): void {
  revalidatePath("/fees");
  revalidatePath("/fees/invoices");
  const invoiceId = field(formData, "invoiceId");
  if (UUID_PATTERN.test(invoiceId)) revalidatePath(`/fees/invoices/${invoiceId}`);
}

/** Raw `FormData` value for a key, or `""` when the part is absent. */
function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** An optimistic-concurrency token the schema wants as a number. */
function version(formData: FormData): number {
  return Number(field(formData, "version"));
}

/** HTML checkboxes send `"on"` when checked and nothing when unchecked. */
function checked(formData: FormData, key: string): boolean {
  return formData.has(key);
}

/**
 * The structure editor's rows → the `items` array `feeStructureSchema` expects. Text parts are
 * one repeated name per row in DOM order; the mandatory checkbox is per-index because an
 * unchecked box sends nothing and would break the zip.
 */
function itemsFrom(formData: FormData): unknown[] {
  const names = formData.getAll("itemName").map(String);
  const amounts = formData.getAll("itemAmount").map(String);
  const discounts = formData.getAll("itemDiscountAmount").map(String);
  const frequencies = formData.getAll("itemFrequency").map(String);
  const installments = formData.getAll("itemInstallmentCount").map(String);
  const categories = formData.getAll("itemCategory").map(String);
  const descriptions = formData.getAll("itemDescription").map(String);
  return names.map((name, index) => ({
    name,
    amount: amounts[index] ?? "",
    discountAmount: discounts[index] ?? "",
    frequency: frequencies[index] ?? "one_time",
    installmentCount: installments[index] ?? "",
    category: categories[index] ?? "other",
    isMandatory: checked(formData, `itemIsMandatory-${index}`),
    sortOrder: index,
    description: descriptions[index] ?? "",
  }));
}

/**
 * The payment form's allocations → the array `recordPaymentSchema` expects. Repeated
 * `allocationInvoiceId`/`allocationAmount` parts win (1..n rows, zipped by index); a form with
 * none — the single-invoice dialog posts one hidden `invoiceId` and the payment `amount` —
 * becomes one allocation of the full amount against that invoice.
 */
function allocationsFrom(formData: FormData): unknown[] {
  const invoiceIds = formData
    .getAll("allocationInvoiceId")
    .map(String)
    .filter((value) => value !== "");
  if (invoiceIds.length > 0) {
    const amounts = formData.getAll("allocationAmount").map(String);
    return invoiceIds.map((invoiceId, index) => ({ invoiceId, amount: amounts[index] ?? "" }));
  }
  const invoiceId = field(formData, "invoiceId");
  if (invoiceId === "") return [];
  return [{ invoiceId, amount: field(formData, "amount") }];
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

/* ---- Fee structures ----------------------------------------------------- */

export async function createFeeStructureAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.manage");
  if (!result.ok) return result.state;
  try {
    await createFeeStructure(
      {
        institutionId: field(formData, "institutionId"),
        name: field(formData, "name"),
        appliesTo: field(formData, "appliesTo"),
        classId: field(formData, "classId"),
        groupId: field(formData, "groupId"),
        sectionId: field(formData, "sectionId"),
        currency: field(formData, "currency"),
        description: field(formData, "description"),
        isActive: checked(formData, "isActive"),
        effectiveFrom: field(formData, "effectiveFrom"),
        effectiveTo: field(formData, "effectiveTo"),
        items: itemsFrom(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/fees/structures");
  return { status: "done", message: `Fee structure “${field(formData, "name")}” created.` };
}

export async function updateFeeStructureAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.manage");
  if (!result.ok) return result.state;
  try {
    await updateFeeStructure(
      {
        id: field(formData, "id"),
        expectedVersion: version(formData),
        institutionId: field(formData, "institutionId"),
        name: field(formData, "name"),
        appliesTo: field(formData, "appliesTo"),
        classId: field(formData, "classId"),
        groupId: field(formData, "groupId"),
        sectionId: field(formData, "sectionId"),
        currency: field(formData, "currency"),
        description: field(formData, "description"),
        isActive: checked(formData, "isActive"),
        effectiveFrom: field(formData, "effectiveFrom"),
        effectiveTo: field(formData, "effectiveTo"),
        items: itemsFrom(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    /* A version conflict still refreshes the page: the hidden `version` token must pick up the
       current row, or every retry from the open dialog fails until a hard refresh. */
    if (error instanceof ConflictError) revalidateStructure(formData);
    return stateFrom(error);
  }
  revalidateStructure(formData);
  return { status: "done", message: "Fee structure saved." };
}

/* ---- Generation --------------------------------------------------------- */

export async function generateInvoicesAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.manage");
  if (!result.ok) return result.state;
  try {
    const generated = await generateInvoices(
      {
        institutionId: field(formData, "institutionId"),
        academicSessionId: field(formData, "academicSessionId"),
        dueOn: field(formData, "dueOn"),
        feeStructureId: field(formData, "feeStructureId"),
        note: field(formData, "note"),
      },
      result.principal.userId,
    );
    revalidatePath("/fees");
    revalidatePath("/fees/invoices");
    const noun = generated.createdCount === 1 ? "student" : "students";
    const skipped =
      generated.skippedCount > 0
        ? ` ${generated.skippedCount} already had an invoice and were skipped.`
        : "";
    return {
      status: "done",
      message: `Invoice generated for ${generated.createdCount} ${noun}.${skipped}`,
    };
  } catch (error) {
    return stateFrom(error);
  }
}

/* ---- Money in ----------------------------------------------------------- */

export async function recordFeePaymentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.record");
  if (!result.ok) return result.state;
  try {
    await recordFeePayment(
      {
        institutionId: field(formData, "institutionId"),
        studentId: field(formData, "studentId"),
        academicSessionId: field(formData, "academicSessionId"),
        amount: field(formData, "amount"),
        currency: field(formData, "currency"),
        method: field(formData, "method"),
        referenceNumber: field(formData, "referenceNumber"),
        receivedOn: field(formData, "receivedOn"),
        notes: field(formData, "notes"),
        allocations: allocationsFrom(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateInvoice(formData);
  return { status: "done", message: "Payment recorded." };
}

export async function grantFeeConcessionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.adjust");
  if (!result.ok) return result.state;
  try {
    await grantFeeConcession(
      {
        institutionId: field(formData, "institutionId"),
        studentId: field(formData, "studentId"),
        invoiceId: field(formData, "invoiceId"),
        kind: field(formData, "kind"),
        percentage: field(formData, "percentage"),
        amount: field(formData, "amount"),
        reason: field(formData, "reason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateInvoice(formData);
  return { status: "done", message: "Concession granted." };
}

export async function createFeeCreditNoteAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.adjust");
  if (!result.ok) return result.state;
  try {
    await createFeeCreditNote(
      {
        institutionId: field(formData, "institutionId"),
        invoiceId: field(formData, "invoiceId"),
        kind: "credit_note",
        amount: field(formData, "amount"),
        reason: field(formData, "reason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateInvoice(formData);
  return { status: "done", message: "Credit note created." };
}

/* ---- Deferrals ---------------------------------------------------------- */

export async function requestFeeDeferralAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.adjust");
  if (!result.ok) return result.state;
  try {
    await requestFeeDeferral(
      {
        institutionId: field(formData, "institutionId"),
        invoiceId: field(formData, "invoiceId"),
        reason: field(formData, "reason"),
        requestedFrom: field(formData, "requestedFrom"),
        requestedUntil: field(formData, "requestedUntil"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateInvoice(formData);
  return { status: "done", message: "Deferral requested." };
}

export async function decideFeeDeferralAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "fees.adjust");
  if (!result.ok) return result.state;
  const isApproved = checked(formData, "isApproved");
  try {
    await decideFeeDeferral(
      {
        institutionId: field(formData, "institutionId"),
        invoiceId: field(formData, "invoiceId"),
        deferralId: field(formData, "deferralId"),
        expectedVersion: version(formData),
        isApproved,
        decisionNotes: field(formData, "approverNotes"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidateInvoice(formData);
    return stateFrom(error);
  }
  revalidateInvoice(formData);
  return {
    status: "done",
    message: isApproved ? "Deferral approved." : "Deferral rejected.",
  };
}
