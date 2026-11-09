/**
 * The fee module's public surface (`src/modules/README.md`): wires the Drizzle store into the
 * fee service, then exports one-call functions. Nothing outside the module reaches into
 * `application/`, `domain/` or `infrastructure/`.
 *
 * **Callers own the gates.** Every institution-targeted command below is authorized by its caller
 * (`requireInstitutionMutation` in `ui/actions.ts`, permissions `fees.view/record/adjust/manage/
 * refund`) *before* it arrives; the service owns policy (zod boundary, generation's scope and
 * currency checks, allocations may not exceed the payment or reach another student's invoices,
 * every money write demands an actor), the store owns integrity (tenant guards, version checks,
 * unique conflicts, the single-transaction payment write, and the Critical Rule — `RULES.md`
 * §36 — that generation only ever inserts). Raw `input: unknown` is by design — the boundary
 * schema runs inside the service, so no caller can bypass it.
 *
 * `resolveAppliedFeeStructures` is the one function wired straight to the store rather than the
 * service: the read model the generate page needs to preview scope and skipped pairs has no use
 * case wrapper in `application/fee-service.ts`, so it is a thin tenant-scoped select and nothing
 * else. It never mints an invoice — `generateInvoices` does that.
 *
 * **`"use client"` files**: import *types* from this barrel; import value tuples and labels
 * (`FEE_STATUS_LABELS`, `PAYMENT_METHODS`, `FEE_FREQUENCIES`, …) from
 * `@/modules/fees/domain/fee-rules` instead. This barrel re-exports the store (`drizzle` → `pg`
 * → `child_process`, none of which exist in a browser), and a **value** import drags the whole
 * graph into the client bundle — a type import is erased, so it does not. The domain module is
 * pure rules over `@/shared/errors`, which is why the presentation vocabulary lives there. The
 * admission barrel re-exports its labels from here for historical reasons; do not copy that
 * pattern. Getting this backwards does not fail typecheck; it fails at the first visit to
 * `/fees` with `Can't resolve 'child_process'`.
 */
import { createFeeService } from "./application/fee-service";
import type { FeeService } from "./application/fee-service";
import { drizzleFeeStore } from "./infrastructure/drizzle-store";

const fee: FeeService = createFeeService(drizzleFeeStore);

/* ---- Fee structures ---------------------------------------------------- */

export function listFeeStructures(input: unknown) {
  return fee.listStructures(input);
}

export function getFeeStructure(input: unknown) {
  return fee.getStructure(input);
}

export function createFeeStructure(input: unknown, userId: string) {
  return fee.createStructure(input, { userId });
}

export function updateFeeStructure(input: unknown, userId: string) {
  return fee.updateStructure(input, { userId });
}

/* ---- Generation & invoices -------------------------------------------- */

/**
 * Structures in force for the session, students in scope, and pairs that already have an
 * invoice. A read for the generate page's preview — the write path stays behind
 * `generateInvoices`.
 */
export function resolveAppliedFeeStructures(
  institutionId: string,
  academicSessionId: string,
  feeStructureId?: string | null,
) {
  return drizzleFeeStore.resolveAppliedStructures(institutionId, academicSessionId, feeStructureId);
}

export function generateInvoices(input: unknown, userId: string) {
  return fee.generateInvoices(input, { userId });
}

export function listFeeInvoices(input: unknown) {
  return fee.listInvoices(input);
}

export function getFeeInvoice(input: unknown) {
  return fee.getInvoice(input);
}

/* ---- Money in ---------------------------------------------------------- */

export function recordFeePayment(input: unknown, userId: string) {
  return fee.recordPayment(input, { userId });
}

export function grantFeeConcession(input: unknown, userId: string) {
  return fee.grantConcession(input, { userId });
}

export function createFeeCreditNote(input: unknown, userId: string) {
  return fee.createCreditNote(input, { userId });
}

/* ---- Deferrals --------------------------------------------------------- */

export function requestFeeDeferral(input: unknown, userId: string) {
  return fee.requestDeferral(input, { userId });
}

export function decideFeeDeferral(input: unknown, userId: string) {
  return fee.decideDeferral(input, { userId });
}

/* ---- Read models ------------------------------------------------------- */

export function getFeeDashboardStats(input: unknown) {
  return fee.getDashboardStats(input);
}

export function listStudentFeeSummary(input: unknown) {
  return fee.listStudentFees(input);
}

/* ---- Types (erased at runtime — safe for `"use client"` imports) -------- */

export type {
  Actor,
  FeeService,
  GenerateInvoicesResult,
  InvoiceListEntry,
} from "./application/fee-service";
export type {
  AppliedStructuresResult,
  DashboardStatsRow,
  FeeStructureDetailRow,
  FeeStructureItemRow,
  FeeStructureListRow,
  FeeStructureScope,
  InvoiceAllocationRow,
  InvoiceConcessionRow,
  InvoiceDeferralRow,
  InvoiceDetailRow,
  InvoiceLineRow,
  InvoiceListFilters,
  InvoiceListRow,
  StructureAuditAction,
  StructureAuditRow,
  StudentFeeSummaryRow,
} from "./application/ports";
export type {
  ConcessionKind,
  FeeCategory,
  FeeFrequency,
  FeeStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
} from "./domain/fee-rules";
