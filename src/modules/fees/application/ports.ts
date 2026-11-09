/**
 * What the application layer needs from the data layer (`src/modules/README.md`: ports in,
 * Drizzle out). Nothing here imports `db`, `drizzle-orm` or a table — the service is tested
 * against `testing/fakes.ts` without a database, exactly like the admission module's port.
 *
 * Three seams deserve naming:
 *
 * - **No derived balance is ever stored** (`ADR-0003`). Invoice rows therefore carry
 *   `totalAmount` plus the store-computed `allocatedSum`, and the service derives the
 *   outstanding figure with `invoiceBalance` at read time. A port that returned a precomputed
 *   `outstanding` would quietly reinstate the forbidden column.
 * - **Generation is resolve-then-insert.** `resolveAppliedStructures` answers *which structures
 *   and which students are in scope, and which (student, structure) pairs already have an
 *   invoice*; the service matches scopes, refuses empty sets and currency mismatches, and hands
 *   the store fully-built invoices to insert. The store must never update an existing invoice
 *   during generation — that is the Critical Rule (`RULES.md` §36).
 * - **Versioned writes take `expectedVersion`.** Optimistic concurrency, same as admission:
 *   the store refuses the write when the row moved underneath and surfaces a `ConflictError`.
 */
import type {
  ConcessionKind,
  FeeCategory,
  FeeFrequency,
  FeeStatus,
  PaymentMethod,
  PaymentStatus,
} from "../domain/fee-rules";

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

export type FeeStructureScope = "all" | "class" | "group" | "section";

/** One row of the fee-structures list, with the item count rolled up for display. */
export interface FeeStructureListRow {
  readonly id: string;
  readonly institutionId: string;
  readonly name: string;
  readonly appliesTo: FeeStructureScope;
  readonly classId: string | null;
  readonly groupId: string | null;
  readonly sectionId: string | null;
  readonly academicSessionId: string | null;
  readonly currency: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly itemCount: number;
  readonly version: number;
  readonly updatedAt: Date;
}

/** One `fee_structure_items` line, as the editor and invoice generation both need it. */
export interface FeeStructureItemRow {
  readonly id: string;
  readonly name: string;
  readonly amount: string;
  readonly discountAmount: string | null;
  readonly frequency: FeeFrequency;
  readonly installmentCount: number | null;
  readonly category: FeeCategory;
  readonly overrideAmount: string | null;
  readonly isMandatory: boolean;
  readonly sortOrder: number;
  readonly description: string | null;
}

/** The values `fee_structure_audit.action` may carry — the same list as its DDL check. */
export type StructureAuditAction =
  "created" | "updated" | "deactivated" | "effective_window_changed";

/**
 * One `fee_structure_audit` row with the actor's display name, so the trail can answer *who*
 * without the page joining anything. `snapshot` stays `Record<string, unknown>`: it is jsonb
 * written by the store at the moment of the change and typed by nothing on the way back out —
 * whoever renders it parses defensively rather than trusting a shape.
 */
export interface StructureAuditRow {
  readonly id: string;
  readonly action: StructureAuditAction;
  readonly changedByUserId: string;
  /** Null when the account that made the change was deleted — the table carries no FK. */
  readonly changedByName: string | null;
  readonly changedAt: Date;
  readonly reason: string | null;
  readonly snapshot: Record<string, unknown>;
}

/**
 * The detail page assembles the structure with its items and its audit trail in one use case
 * (no N+1 from RSC). The generation read shares this type but never loads the trail — it asks
 * for `audit: []` rather than paying for rows it only displays nowhere.
 */
export interface FeeStructureDetailRow extends FeeStructureListRow {
  readonly items: readonly FeeStructureItemRow[];
  readonly audit: readonly StructureAuditRow[];
}

/**
 * One row of the invoices list. `allocatedSum` and `concessionSum` are the store's
 * `SUM(allocations)` and `SUM(live concessions)`, not a balance — the service derives the
 * outstanding figure from all three at read time (ADR-0003).
 */
export interface InvoiceListRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly studentId: string;
  readonly studentName: string | null;
  readonly invoiceNumber: string;
  readonly feeStructureId: string | null;
  readonly totalAmount: string;
  readonly allocatedSum: string;
  readonly concessionSum: string;
  readonly currency: string;
  readonly status: FeeStatus;
  readonly kind: string;
  readonly issuedOn: string;
  readonly dueOn: string | null;
  readonly deferredUntil: string | null;
}

export interface InvoiceLineRow {
  readonly id: string;
  readonly feeStructureItemId: string | null;
  readonly name: string;
  readonly amount: string;
  readonly category: string;
  readonly isTaxable: boolean;
}

/** One allocation settling this invoice, joined through its payment for display. */
export interface InvoiceAllocationRow {
  readonly paymentId: string;
  readonly paymentNumber: string;
  readonly allocatedAmount: string;
  readonly method: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
  readonly receivedOn: string;
  readonly referenceNumber: string | null;
}

export interface InvoiceConcessionRow {
  readonly id: string;
  readonly kind: ConcessionKind;
  readonly percentage: number | null;
  readonly amount: string | null;
  readonly reason: string;
  readonly grantedAt: Date;
}

export interface InvoiceDeferralRow {
  readonly id: string;
  readonly reason: string;
  readonly requestedFrom: string;
  readonly requestedUntil: string;
  readonly isApproved: boolean;
  readonly approvedByUserId: string | null;
  readonly decisionNotes: string | null;
}

/** The invoice detail page: the row, its frozen lines, and everything that has touched it. */
export interface InvoiceDetailRow extends InvoiceListRow {
  readonly lines: readonly InvoiceLineRow[];
  readonly allocations: readonly InvoiceAllocationRow[];
  readonly concessions: readonly InvoiceConcessionRow[];
  readonly deferrals: readonly InvoiceDeferralRow[];
  readonly waiverReason: string | null;
  readonly notes: string | null;
  readonly issuedByUserId: string;
  readonly updatedAt: Date;
  readonly version: number;
}

/**
 * Per-student arrears roll-up, derived by the store from invoice, allocation and concession
 * sums. `creditNoteSum` is the total of the student's credit notes — audited corrections filed
 * as their own invoices (`kind = 'credit_note'`) — which offset what is still collectable even
 * though they are excluded from `totalInvoiced`.
 */
export interface StudentFeeSummaryRow {
  readonly studentId: string;
  readonly studentName: string;
  readonly currency: string;
  readonly totalInvoiced: string;
  readonly totalAllocated: string;
  readonly concessionSum: string;
  readonly creditNoteSum: string;
  readonly openInvoiceCount: number;
  readonly overdueInvoiceCount: number;
}

/**
 * The fees dashboard's headline figures for one institution (optionally one session).
 *
 * `concessionSum` and `creditNoteSum` are the two ways billed money is written off — they are
 * reported separately rather than netted into `totalInvoiced`, so the "invoiced" figure stays
 * what was billed and the dashboard can subtract the write-offs itself (`invoiceBalance`'s third
 * argument), exactly as `listStudentFees` does at student scope.
 */
export interface DashboardStatsRow {
  readonly currency: string;
  readonly totalInvoiced: string;
  readonly totalAllocated: string;
  readonly concessionSum: string;
  readonly creditNoteSum: string;
  readonly overdueTotal: string;
  readonly openInvoiceCount: number;
  readonly overdueInvoiceCount: number;
}

/** A student whose placement puts them in scope for a fee structure. */
export interface ApplicableStudent {
  readonly studentId: string;
  readonly studentName: string;
  readonly classId: string | null;
  readonly groupId: string | null;
  readonly sectionId: string | null;
}

/** A (student, structure) pair that already has an invoice — generation must skip it. */
export interface ExistingInvoiceKey {
  readonly invoiceId: string;
  readonly studentId: string;
  readonly feeStructureId: string;
}

/** Everything generation needs to decide what to insert: no student or structure is invented here. */
export interface AppliedStructuresResult {
  readonly structures: readonly FeeStructureDetailRow[];
  readonly students: readonly ApplicableStudent[];
  readonly existingInvoiceKeys: readonly ExistingInvoiceKey[];
}

export interface InvoiceListFilters {
  readonly studentId?: string | null | undefined;
  readonly academicSessionId?: string | null | undefined;
  readonly status?: FeeStatus | null | undefined;
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/** One fee head to write. Amounts are decimal text (`toDecimalText`), never floats. */
export interface FeeStructureItemWrite {
  readonly name: string;
  readonly amount: string;
  readonly discountAmount: string | null;
  readonly frequency: FeeFrequency;
  readonly installmentCount: number | null;
  readonly category: FeeCategory;
  readonly overrideAmount: string | null;
  readonly isMandatory: boolean;
  readonly sortOrder: number;
  readonly description: string | null;
}

export interface FeeStructureWrite {
  readonly institutionId: string;
  readonly name: string;
  readonly appliesTo: FeeStructureScope;
  readonly classId: string | null;
  readonly groupId: string | null;
  readonly sectionId: string | null;
  readonly academicSessionId: string | null;
  readonly currency: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly items: readonly FeeStructureItemWrite[];
}

export interface FeeStructureUpdate extends FeeStructureWrite {
  readonly id: string;
  readonly expectedVersion: number;
}

export interface InvoiceLineWrite {
  readonly feeStructureItemId: string | null;
  readonly name: string;
  readonly amount: string;
  readonly category: string;
}

/** One invoice the service has already priced; the store mints its number and inserts it. */
export interface InvoiceWrite {
  readonly studentId: string;
  readonly feeStructureId: string | null;
  readonly totalAmount: string;
  readonly currency: string;
  readonly lines: readonly InvoiceLineWrite[];
}

/** Inserts only. Re-running generation must never update a row that already exists. */
export interface GenerateInvoicesWrite {
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly issuedByUserId: string;
  readonly note: string | null;
  readonly invoices: readonly InvoiceWrite[];
}

export interface PaymentAllocationWrite {
  readonly invoiceId: string;
  readonly amount: string;
}

export interface RecordPaymentWrite {
  readonly institutionId: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly amount: string;
  readonly currency: string;
  readonly method: PaymentMethod;
  readonly referenceNumber: string | null;
  readonly receivedOn: string;
  readonly notes: string | null;
  readonly allocations: readonly PaymentAllocationWrite[];
}

export interface ConcessionWrite {
  readonly studentId: string;
  readonly invoiceId: string | null;
  readonly feeStructureId: string | null;
  readonly kind: ConcessionKind;
  readonly percentage: number | null;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly reason: string;
}

export interface DeferralWrite {
  readonly invoiceId: string;
  readonly reason: string;
  readonly requestedFrom: string;
  readonly requestedUntil: string;
  readonly requestedByUserId: string;
  /** Present only when the request is approved the moment it is filed. */
  readonly approvedByUserId?: string | undefined;
  readonly decisionNotes?: string | undefined;
}

export interface DeferralDecision {
  readonly invoiceId: string;
  readonly deferralId: string;
  readonly expectedVersion: number;
  readonly isApproved: boolean;
  readonly decisionNotes: string | null;
  readonly approverUserId: string | null;
  readonly now: Date;
}

export interface CreditNoteWrite {
  readonly institutionId: string;
  readonly invoiceId: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly amount: string;
  readonly currency: string;
  readonly reason: string;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

export interface FeeStore {
  /* ---- Fee structures ---------------------------------------------------- */
  listStructures(
    institutionId: string,
    isActive?: boolean | null,
  ): Promise<readonly FeeStructureListRow[]>;
  getStructure(institutionId: string, structureId: string): Promise<FeeStructureDetailRow | null>;
  createStructure(
    values: FeeStructureWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;
  updateStructure(
    values: FeeStructureUpdate,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /* ---- Generation & invoices -------------------------------------------- */
  /** Structures in force for the session, students in scope, and pairs already invoiced. */
  resolveAppliedStructures(
    institutionId: string,
    academicSessionId: string,
    feeStructureId?: string | null,
  ): Promise<AppliedStructuresResult>;
  /** Insert-only. The Critical Rule: never mutate an existing invoice or its lines. */
  generateInvoices(values: GenerateInvoicesWrite): Promise<{ readonly createdCount: number }>;
  listInvoices(
    institutionId: string,
    filters?: InvoiceListFilters,
  ): Promise<readonly InvoiceListRow[]>;
  getInvoice(institutionId: string, invoiceId: string): Promise<InvoiceDetailRow | null>;

  /* ---- Money in --------------------------------------------------------- */
  recordPayment(
    values: RecordPaymentWrite,
    actorUserId: string,
  ): Promise<{ readonly paymentId: string }>;
  grantConcession(
    values: ConcessionWrite,
    grantedByUserId: string,
  ): Promise<{ readonly id: string }>;
  createCreditNote(values: CreditNoteWrite, actorUserId: string): Promise<{ readonly id: string }>;
  /**
   * The student's outstanding charges, floored at zero — the cap a credit note may not exceed.
   * Derived from `total_amount - allocations - live concessions` per charge invoice (credit
   * notes themselves are excluded), never a stored balance (ADR-0003).
   */
  sumStudentOutstanding(institutionId: string, studentId: string): Promise<string>;

  /* ---- Deferrals -------------------------------------------------------- */
  requestDeferral(values: DeferralWrite): Promise<{ readonly id: string }>;
  decideDeferral(values: DeferralDecision): Promise<{ readonly id: string }>;

  /* ---- Read models ------------------------------------------------------ */
  getDashboardStats(
    institutionId: string,
    academicSessionId?: string | null,
  ): Promise<DashboardStatsRow>;
  listStudentFees(
    institutionId: string,
    studentId: string,
    academicSessionId?: string | null,
  ): Promise<StudentFeeSummaryRow | null>;
}
