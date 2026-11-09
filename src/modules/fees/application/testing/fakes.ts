/**
 * An in-memory {@link FeeStore} for service tests.
 *
 * It mirrors the Drizzle store's *observable* behaviour for what the service and its tests care
 * about — insert-only generation keyed by (student, structure), version-guarded structure and
 * deferral writes, allocation sums rolled onto each invoice, status moving to partial/paid when
 * money lands — and nothing more. Where a rule lives in the *service* (currency agreement, the
 * one-basis concession, the empty-scope refusals) the fake deliberately does not repeat it: a
 * test that passed because the fake was lenient would be worse than no test.
 *
 * Two promises belong to the real store and are only *shaped* here: generation's
 * all-or-nothing insert (the fake inserts synchronously, its payload is exposed as
 * `generated` for assertions) and every unique-violation → `ConflictError` mapping. The fake
 * raises `ConflictError` itself only where the service's critical rule is under test: an
 * attempted insert that collides with an already-issued (student, structure) pair.
 */
import { randomUUID } from "node:crypto";

import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import { add, compare, fromDecimalText, subtract, toDecimalText, zero } from "@/shared/money";

import { calendarDateString, invoiceBalance } from "../../domain/fee-rules";

import type {
  AppliedStructuresResult,
  ApplicableStudent,
  ConcessionWrite,
  CreditNoteWrite,
  DashboardStatsRow,
  DeferralDecision,
  DeferralWrite,
  FeeStructureDetailRow,
  FeeStructureItemRow,
  FeeStructureListRow,
  FeeStructureWrite,
  FeeStore,
  GenerateInvoicesWrite,
  InvoiceAllocationRow,
  InvoiceConcessionRow,
  InvoiceDeferralRow,
  InvoiceDetailRow,
  InvoiceListFilters,
  InvoiceListRow,
  InvoiceWrite,
  RecordPaymentWrite,
  StudentFeeSummaryRow,
} from "../ports";

function nextId(): string {
  return randomUUID();
}

/** Read-model rows are `readonly`; the fake stores mutable copies behind the same shape. */
type StructureRecord = { -readonly [K in keyof FeeStructureDetailRow]: FeeStructureDetailRow[K] };
type ItemRecord = { -readonly [K in keyof FeeStructureItemRow]: FeeStructureItemRow[K] };
type InvoiceRecord = { -readonly [K in keyof InvoiceDetailRow]: InvoiceDetailRow[K] };
type ConcessionRecord = { -readonly [K in keyof InvoiceConcessionRow]: InvoiceConcessionRow[K] };
type DeferralRecord = { -readonly [K in keyof InvoiceDeferralRow]: InvoiceDeferralRow[K] };

interface PaymentRecord {
  readonly id: string;
  readonly paymentNumber: string;
  readonly institutionId: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly amount: string;
  readonly currency: string;
  readonly method: string;
  readonly paymentStatus: "pending" | "completed" | "failed" | "reversed" | "refunded";
  readonly referenceNumber: string | null;
  readonly receivedOn: string;
  readonly notes: string | null;
  readonly receivedByUserId: string;
}

export class FakeFeeStore implements FeeStore {
  private readonly structures = new Map<string, StructureRecord>();
  private readonly invoices = new Map<string, InvoiceRecord>();
  private readonly payments = new Map<string, PaymentRecord>();
  /** Students in scope, keyed by the session they were seeded for. */
  private readonly sessionStudents = new Map<string, ApplicableStudent[]>();
  private readonly studentNames = new Map<string, string>();
  /** Concessions granted against a structure rather than a single invoice. */
  readonly structureConcessions: ConcessionWrite[] = [];
  /** Every credit note the service handed over — the assertions read what would be filed. */
  readonly creditNotes: CreditNoteWrite[] = [];
  /** Every generation payload, so a test can assert insert-only behaviour directly. */
  readonly generated: GenerateInvoicesWrite[] = [];
  private invoiceSequence = 0;
  private paymentSequence = 0;

  /* ---- Test seams -------------------------------------------------------- */

  seedStructure(
    overrides: Partial<StructureRecord> & {
      readonly institutionId: string;
      readonly name: string;
    },
  ): StructureRecord {
    const items: ItemRecord[] =
      overrides.items === undefined
        ? [
            {
              id: nextId(),
              name: "Tuition",
              amount: "1000.00",
              discountAmount: null,
              frequency: "monthly",
              installmentCount: 1,
              category: "tuition",
              overrideAmount: null,
              isMandatory: true,
              sortOrder: 0,
              description: null,
            },
          ]
        : overrides.items.map((item) => ({ ...item }));
    const record: StructureRecord = {
      id: nextId(),
      appliesTo: "all",
      classId: null,
      groupId: null,
      sectionId: null,
      academicSessionId: null,
      currency: "PKR",
      description: null,
      isActive: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      itemCount: items.length,
      version: 1,
      updatedAt: new Date("2026-10-01T09:00:00Z"),
      ...overrides,
      items,
      // The trail starts empty; `createStructure`/`updateStructure` append like the real store.
      audit: [],
    };
    this.structures.set(record.id, record);
    return record;
  }

  /** Register a student (and their name) as in scope for one session. */
  seedStudentForSession(
    academicSessionId: string,
    student: {
      readonly studentId: string;
      readonly studentName: string;
      readonly classId?: string | null;
      readonly groupId?: string | null;
      readonly sectionId?: string | null;
    },
  ): ApplicableStudent {
    const row: ApplicableStudent = {
      studentId: student.studentId,
      studentName: student.studentName,
      classId: student.classId ?? null,
      groupId: student.groupId ?? null,
      sectionId: student.sectionId ?? null,
    };
    const rows = this.sessionStudents.get(academicSessionId) ?? [];
    rows.push(row);
    this.sessionStudents.set(academicSessionId, rows);
    this.studentNames.set(student.studentId, student.studentName);
    return row;
  }

  /** Seed an invoice directly; unspecified fields take a freshly generated invoice's defaults. */
  seedInvoice(
    overrides: Partial<InvoiceRecord> & { readonly institutionId: string },
  ): InvoiceRecord {
    const currency = overrides.currency ?? "PKR";
    const totalAmount = overrides.totalAmount ?? "1000.00";
    const record: InvoiceRecord = {
      id: nextId(),
      academicSessionId: "session-1",
      studentId: "student-1",
      studentName: null,
      invoiceNumber: `INV-SEED-${String(this.invoices.size + 1).padStart(4, "0")}`,
      totalAmount,
      allocatedSum: "0.00",
      concessionSum: "0.00",
      currency,
      status: "pending",
      // The database default is `regular`; the fake matched the seed text `standard` until the
      // generation filters below were made to agree with it, which hid a whole class of mismatch.
      kind: "regular",
      issuedOn: overrides.issuedOn ?? "2026-10-01",
      dueOn: overrides.dueOn ?? (overrides.status === "overdue" ? "2000-01-01" : "2099-12-31"),
      deferredUntil: null,
      feeStructureId: null,
      lines: [],
      allocations: [],
      concessions: [],
      deferrals: [],
      waiverReason: null,
      notes: null,
      issuedByUserId: "user-seed",
      updatedAt: new Date("2026-10-01T09:00:00Z"),
      version: 1,
      ...overrides,
    };
    if (record.studentName === null) {
      record.studentName = this.studentNames.get(record.studentId) ?? null;
    }
    this.invoices.set(record.id, record);
    return record;
  }

  /* ---- Fee structures ---------------------------------------------------- */

  async listStructures(
    institutionId: string,
    isActive?: boolean | null,
  ): Promise<readonly FeeStructureListRow[]> {
    return [...this.structures.values()]
      .filter((row) => row.institutionId === institutionId)
      .filter((row) => isActive == null || row.isActive === isActive)
      .map(({ items, audit, ...row }) => {
        void items;
        void audit;
        return { ...row, itemCount: row.itemCount };
      });
  }

  async getStructure(
    institutionId: string,
    structureId: string,
  ): Promise<FeeStructureDetailRow | null> {
    const record = this.structures.get(structureId);
    if (record === undefined || record.institutionId !== institutionId) return null;
    return record;
  }

  async createStructure(
    values: FeeStructureWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    const items: ItemRecord[] = values.items.map((item) => ({ id: nextId(), ...item }));
    const id = nextId();
    this.structures.set(id, {
      id,
      institutionId: values.institutionId,
      name: values.name,
      appliesTo: values.appliesTo,
      classId: values.classId,
      groupId: values.groupId,
      sectionId: values.sectionId,
      academicSessionId: values.academicSessionId,
      currency: values.currency,
      description: values.description,
      isActive: values.isActive,
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo,
      itemCount: items.length,
      version: 1,
      updatedAt: new Date(),
      items,
      // One row per write, exactly as the store's transaction records it (`changedByName` stays
      // null — the fake has no user directory to resolve a display name against).
      audit: [
        {
          id: nextId(),
          action: "created",
          changedByUserId: actorUserId,
          changedByName: null,
          changedAt: new Date(),
          reason: null,
          snapshot: { before: null, after: { ...values, id, version: 1 } },
        },
      ],
    });
    return { id, version: 1 };
  }

  async updateStructure(
    values: FeeStructureWrite & { readonly id: string; readonly expectedVersion: number },
    actorUserId: string,
  ): Promise<{ readonly id: string; readonly version: number }> {
    const record = this.structures.get(values.id);
    if (record === undefined || record.institutionId !== values.institutionId) {
      throw new NotFoundError("Fee structure does not exist.");
    }
    this.assertVersion(record, values.expectedVersion);
    // Items are matched to the existing rows by position so a survivor keeps its database id
    // (invoices reference it). Removing a row past the incoming length is only safe when no
    // invoice line points at it — the store refuses the delete with a ConflictError; mirror that.
    const beforeItems = record.items;
    const removedIds = beforeItems.slice(values.items.length).map((item) => item.id);
    if (removedIds.length > 0) {
      const referenced = [...this.invoices.values()].some((invoice) =>
        invoice.lines.some(
          (line) =>
            line.feeStructureItemId !== null && removedIds.includes(line.feeStructureItemId),
        ),
      );
      if (referenced) {
        throw new ConflictError("This fee item has already been invoiced and cannot be removed.", {
          userMessage: "This item has already been invoiced and cannot be removed.",
        });
      }
    }
    // The store derives the action rather than logging a blanket "updated", so the fake does the
    // same while `record` still holds the before-state. The snapshot is seeded before the field
    // writes (before = the row the version check passed against) and prepended so the trail reads
    // newest-first, like the store's `ORDER BY changed_at DESC`.
    const action =
      !values.isActive && record.isActive
        ? "deactivated"
        : values.effectiveFrom !== record.effectiveFrom || values.effectiveTo !== record.effectiveTo
          ? "effective_window_changed"
          : "updated";
    record.audit = [
      {
        id: nextId(),
        action,
        changedByUserId: actorUserId,
        changedByName: null,
        changedAt: new Date(),
        reason: null,
        snapshot: {
          before: { ...record },
          after: { ...values, version: values.expectedVersion + 1 },
        },
      },
      ...record.audit,
    ];
    record.name = values.name;
    record.appliesTo = values.appliesTo;
    record.classId = values.classId;
    record.groupId = values.groupId;
    record.sectionId = values.sectionId;
    record.academicSessionId = values.academicSessionId;
    record.currency = values.currency;
    record.description = values.description;
    record.isActive = values.isActive;
    record.effectiveFrom = values.effectiveFrom;
    record.effectiveTo = values.effectiveTo;
    record.items = values.items.map((item, index) => {
      const survivor = beforeItems[index];
      return survivor === undefined ? { id: nextId(), ...item } : { id: survivor.id, ...item };
    });
    record.itemCount = record.items.length;
    record.updatedAt = new Date();
    record.version += 1;
    return { id: record.id, version: record.version };
  }

  /* ---- Generation & invoices -------------------------------------------- */

  async resolveAppliedStructures(
    institutionId: string,
    academicSessionId: string,
    feeStructureId?: string | null,
  ): Promise<AppliedStructuresResult> {
    const structures = [...this.structures.values()].filter(
      (row) =>
        row.institutionId === institutionId &&
        row.isActive &&
        (row.academicSessionId === null || row.academicSessionId === academicSessionId) &&
        (feeStructureId == null || row.id === feeStructureId),
    );
    const existingInvoiceKeys = [...this.invoices.values()]
      .filter(
        (invoice) =>
          invoice.institutionId === institutionId &&
          invoice.academicSessionId === academicSessionId &&
          invoice.kind === "regular" &&
          invoice.feeStructureId !== null,
      )
      .map((invoice) => ({
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        feeStructureId: invoice.feeStructureId as string,
      }));
    return {
      structures,
      students: this.sessionStudents.get(academicSessionId) ?? [],
      existingInvoiceKeys,
    };
  }

  async generateInvoices(
    values: GenerateInvoicesWrite,
  ): Promise<{ readonly createdCount: number }> {
    // Insert-only: a (student, structure) pair that already exists is a unique violation the
    // service should have skipped — raising here keeps the fake honest about the critical rule.
    for (const incoming of values.invoices) {
      if (incoming.feeStructureId !== null) {
        const collision = [...this.invoices.values()].some(
          (invoice) =>
            invoice.institutionId === values.institutionId &&
            invoice.academicSessionId === values.academicSessionId &&
            invoice.kind === "regular" &&
            invoice.studentId === incoming.studentId &&
            invoice.feeStructureId === incoming.feeStructureId,
        );
        if (collision) {
          throw new ConflictError("Invoice already exists for this student and fee structure.", {
            userMessage: "An invoice was already generated for this student. Nothing was changed.",
          });
        }
      }
    }
    this.generated.push({
      ...values,
      invoices: values.invoices.map((invoice) => ({ ...invoice })),
    });
    for (const incoming of values.invoices) {
      this.insertGeneratedInvoice(values, incoming);
    }
    return { createdCount: values.invoices.length };
  }

  async listInvoices(
    institutionId: string,
    filters?: InvoiceListFilters,
  ): Promise<readonly InvoiceListRow[]> {
    this.refreshOverdue(institutionId);
    // Credit notes are listed too now: they are real `kind = 'credit_note'` invoices the student
    // roll-up subtracts, and hiding them made a write-off invisible in the ledger it corrects.
    return [...this.invoices.values()]
      .filter(
        (invoice) =>
          invoice.institutionId === institutionId &&
          (filters?.studentId == null || invoice.studentId === filters.studentId) &&
          (filters?.academicSessionId == null ||
            invoice.academicSessionId === filters.academicSessionId) &&
          (filters?.status == null || invoice.status === filters.status),
      )
      .map(
        ({
          lines,
          allocations,
          concessions,
          deferrals,
          waiverReason,
          notes,
          issuedByUserId,
          updatedAt,
          version,
          ...row
        }) => {
          void lines;
          void allocations;
          void concessions;
          void deferrals;
          void waiverReason;
          void notes;
          void issuedByUserId;
          void updatedAt;
          void version;
          return row;
        },
      )
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
  }

  async getInvoice(institutionId: string, invoiceId: string): Promise<InvoiceDetailRow | null> {
    const record = this.invoices.get(invoiceId);
    if (record === undefined || record.institutionId !== institutionId) return null;
    return record;
  }

  /* ---- Money in --------------------------------------------------------- */

  async recordPayment(
    values: RecordPaymentWrite,
    actorUserId: string,
  ): Promise<{ readonly paymentId: string }> {
    this.paymentSequence += 1;
    const paymentId = nextId();
    const payment: PaymentRecord = {
      id: paymentId,
      paymentNumber: `PAY-${String(this.paymentSequence).padStart(4, "0")}`,
      institutionId: values.institutionId,
      studentId: values.studentId,
      academicSessionId: values.academicSessionId,
      amount: values.amount,
      currency: values.currency,
      method: values.method,
      paymentStatus: "completed",
      referenceNumber: values.referenceNumber,
      receivedOn: values.receivedOn,
      notes: values.notes,
      receivedByUserId: actorUserId,
    };
    this.payments.set(paymentId, payment);

    for (const allocation of values.allocations) {
      const invoice = this.invoices.get(allocation.invoiceId);
      if (invoice === undefined || invoice.institutionId !== values.institutionId) {
        throw new NotFoundError("Invoice does not exist.");
      }
      if (invoice.studentId !== values.studentId) {
        throw new ConflictError("Allocation references another student's invoice.", {
          userMessage: "Every allocated invoice must belong to the student paying.",
        });
      }
      if (
        invoice.status === "paid" ||
        invoice.status === "cancelled" ||
        invoice.status === "waived"
      ) {
        throw new ValidationError(`Cannot allocate to a ${invoice.status} invoice.`, {
          allocations: [
            `Invoice ${allocation.invoiceId} is ${invoice.status} and can no longer be paid.`,
          ],
        });
      }
      const balance = invoiceBalance(
        fromDecimalText(invoice.totalAmount, invoice.currency),
        fromDecimalText(invoice.allocatedSum, invoice.currency),
        fromDecimalText(invoice.concessionSum, invoice.currency),
      );
      if (compare(fromDecimalText(allocation.amount, invoice.currency), balance) > 0) {
        throw new ValidationError("Allocation exceeds the invoice's outstanding balance.", {
          allocations: [
            `Allocation on invoice ${allocation.invoiceId} is ${allocation.amount}, more than the outstanding ${toDecimalText(balance)}.`,
          ],
        });
      }
      invoice.allocatedSum = toDecimalText(
        add(
          fromDecimalText(invoice.allocatedSum, invoice.currency),
          fromDecimalText(allocation.amount, invoice.currency),
        ),
      );
      const row: InvoiceAllocationRow = {
        paymentId,
        paymentNumber: payment.paymentNumber,
        allocatedAmount: allocation.amount,
        method: values.method,
        paymentStatus: "completed",
        receivedOn: values.receivedOn,
        referenceNumber: values.referenceNumber,
      };
      invoice.allocations = [...invoice.allocations, row];
      invoice.status = this.deriveStatus(invoice);
      invoice.version += 1;
      invoice.updatedAt = new Date();
    }
    return { paymentId };
  }

  async grantConcession(
    values: ConcessionWrite,
    grantedByUserId: string,
  ): Promise<{ readonly id: string }> {
    const id = nextId();
    if (values.invoiceId !== null) {
      const invoice = this.invoices.get(values.invoiceId);
      if (invoice === undefined) throw new NotFoundError("Invoice does not exist.");
      const row: ConcessionRecord = {
        id,
        kind: values.kind,
        percentage: values.percentage,
        amount: values.amount,
        reason: values.reason,
        grantedAt: new Date(),
      };
      invoice.concessions = [...invoice.concessions, row];
      // The service always hands the fake a concrete `amount` (a percentage is converted to the
      // discount it computes against the frozen total), so the running concession sum — the figure
      // outstanding calculations subtract — is maintained here just as the store's subquery would.
      if (values.amount !== null) {
        invoice.concessionSum = toDecimalText(
          add(
            fromDecimalText(invoice.concessionSum, invoice.currency),
            fromDecimalText(values.amount, invoice.currency),
          ),
        );
      }
      invoice.version += 1;
      void grantedByUserId;
      return { id };
    }
    this.structureConcessions.push({ ...values });
    void grantedByUserId;
    return { id };
  }

  async createCreditNote(
    values: CreditNoteWrite,
    actorUserId: string,
  ): Promise<{ readonly id: string }> {
    this.creditNotes.push({ ...values });
    // A credit note is filed as its own `kind = 'credit_note'` invoice, exactly as the store
    // does, so the student roll-up can count it and `listInvoices` can show the correction.
    this.invoiceSequence += 1;
    const id = nextId();
    this.invoices.set(id, {
      id,
      institutionId: values.institutionId,
      academicSessionId: values.academicSessionId,
      studentId: values.studentId,
      studentName: this.studentNames.get(values.studentId) ?? null,
      invoiceNumber: `INV-CN-${String(this.invoiceSequence).padStart(4, "0")}`,
      totalAmount: values.amount,
      allocatedSum: "0.00",
      concessionSum: "0.00",
      currency: values.currency,
      status: "paid",
      kind: "credit_note",
      issuedOn: calendarDateString(new Date()),
      dueOn: null,
      deferredUntil: null,
      feeStructureId: null,
      lines: [
        {
          id: nextId(),
          feeStructureItemId: null,
          name: "Credit note",
          amount: values.amount,
          category: "other",
          isTaxable: false,
        },
      ],
      allocations: [],
      concessions: [],
      deferrals: [],
      waiverReason: null,
      notes: `Credit note against invoice ${values.invoiceId}: ${values.reason}`,
      issuedByUserId: actorUserId,
      updatedAt: new Date(),
      version: 1,
    });
    return { id };
  }

  /* ---- Deferrals -------------------------------------------------------- */

  async requestDeferral(values: DeferralWrite): Promise<{ readonly id: string }> {
    const invoice = this.invoices.get(values.invoiceId);
    if (invoice === undefined) throw new NotFoundError("Invoice does not exist.");
    const id = nextId();
    const row: DeferralRecord = {
      id,
      reason: values.reason,
      requestedFrom: values.requestedFrom,
      requestedUntil: values.requestedUntil,
      isApproved: values.approvedByUserId !== undefined,
      approvedByUserId: values.approvedByUserId ?? null,
      decisionNotes: values.decisionNotes ?? null,
    };
    invoice.deferrals = [...invoice.deferrals, row];
    // Filing a *pending* request changes nothing on the invoice — it is a note awaiting a
    // decision, so it must not bump the version a concurrent decider is holding. Only an
    // approved-on-filing deferral moves the invoice into `deferred`, exactly as the store does.
    if (row.isApproved) {
      invoice.status = "deferred";
      invoice.deferredUntil = row.requestedUntil;
      invoice.version += 1;
      invoice.updatedAt = new Date();
    }
    return { id };
  }

  async decideDeferral(values: DeferralDecision): Promise<{ readonly id: string }> {
    const invoice = this.invoices.get(values.invoiceId);
    if (invoice === undefined) throw new NotFoundError("Invoice does not exist.");
    this.assertVersion(invoice, values.expectedVersion);
    const row = invoice.deferrals.find((deferral) => deferral.id === values.deferralId);
    if (row === undefined) throw new NotFoundError("Deferral does not exist.");
    const decided: DeferralRecord = {
      ...row,
      isApproved: values.isApproved,
      approvedByUserId: values.isApproved ? values.approverUserId : null,
      decisionNotes: values.decisionNotes,
    };
    invoice.deferrals = invoice.deferrals.map((deferral) =>
      deferral.id === values.deferralId ? decided : deferral,
    );
    // Mirrors the store: approving re-asserts this window (a reversal back to approve takes
    // effect); rejecting only clears the window when the invoice is currently riding *this*
    // deferral. Either change bumps the version; a rejection that changes nothing does not.
    if (values.isApproved) {
      invoice.status = "deferred";
      invoice.deferredUntil = decided.requestedUntil;
      invoice.version += 1;
      invoice.updatedAt = values.now;
    } else if (invoice.status === "deferred" && invoice.deferredUntil === row.requestedUntil) {
      invoice.deferredUntil = null;
      invoice.status =
        invoice.dueOn !== null && invoice.dueOn < calendarDateString(values.now)
          ? "overdue"
          : "pending";
      invoice.version += 1;
      invoice.updatedAt = values.now;
    }
    return { id: values.deferralId };
  }

  /* ---- Read models ------------------------------------------------------ */

  async getDashboardStats(
    institutionId: string,
    academicSessionId?: string | null,
  ): Promise<DashboardStatsRow> {
    this.refreshOverdue(institutionId);
    // Credit notes are included, matching the store: they are the only source of
    // `creditNoteSum`, so every charge aggregate below filters them out itself rather than a
    // shared kind filter hiding them.
    const rows = [...this.invoices.values()].filter(
      (invoice) =>
        invoice.institutionId === institutionId &&
        (academicSessionId == null || invoice.academicSessionId === academicSessionId),
    );
    const currency = rows[0]?.currency ?? "PKR";
    const addMoney = (total: string, value: string) =>
      toDecimalText(add(fromDecimalText(total, currency), fromDecimalText(value, currency)));
    let totalInvoiced = "0.00";
    let totalAllocated = "0.00";
    let concessionSum = "0.00";
    let creditNoteSum = "0.00";
    let overdueTotal = "0.00";
    let openInvoiceCount = 0;
    let overdueInvoiceCount = 0;
    for (const invoice of rows) {
      if (invoice.currency !== currency) continue;
      if (invoice.kind === "credit_note") {
        creditNoteSum = addMoney(creditNoteSum, invoice.totalAmount);
        continue;
      }
      // A cancelled invoice was billed in error and must not inflate what was reported as
      // invoiced; every other status (including deferred and waived) counts.
      if (invoice.status !== "cancelled") {
        totalInvoiced = addMoney(totalInvoiced, invoice.totalAmount);
      }
      totalAllocated = addMoney(totalAllocated, invoice.allocatedSum);
      concessionSum = addMoney(concessionSum, invoice.concessionSum);
      const isOpen =
        invoice.status === "pending" ||
        invoice.status === "partial" ||
        invoice.status === "overdue";
      if (isOpen) openInvoiceCount += 1;
      if (invoice.status === "overdue") {
        overdueInvoiceCount += 1;
        overdueTotal = toDecimalText(
          add(
            fromDecimalText(overdueTotal, currency),
            invoiceBalance(
              fromDecimalText(invoice.totalAmount, invoice.currency),
              fromDecimalText(invoice.allocatedSum, invoice.currency),
              fromDecimalText(invoice.concessionSum, invoice.currency),
            ),
          ),
        );
      }
    }
    return {
      currency,
      totalInvoiced,
      totalAllocated,
      concessionSum,
      creditNoteSum,
      overdueTotal,
      openInvoiceCount,
      overdueInvoiceCount,
    };
  }

  async listStudentFees(
    institutionId: string,
    studentId: string,
    academicSessionId?: string | null,
  ): Promise<StudentFeeSummaryRow | null> {
    this.refreshOverdue(institutionId);
    // Credit notes are included, matching the store: `totalInvoiced` counts only charges, then
    // `creditNoteSum` is reported separately so the service can subtract charge write-offs.
    const rows = [...this.invoices.values()].filter(
      (invoice) =>
        invoice.institutionId === institutionId &&
        invoice.studentId === studentId &&
        (academicSessionId == null || invoice.academicSessionId === academicSessionId),
    );
    if (rows.length === 0) return null;
    const currency = rows[0]?.currency ?? "PKR";
    let totalInvoiced = "0.00";
    let totalAllocated = "0.00";
    let concessionSum = "0.00";
    let creditNoteSum = "0.00";
    let openInvoiceCount = 0;
    let overdueInvoiceCount = 0;
    for (const invoice of rows) {
      const isCredit = invoice.kind === "credit_note";
      if (isCredit) {
        creditNoteSum = toDecimalText(
          add(
            fromDecimalText(creditNoteSum, currency),
            fromDecimalText(invoice.totalAmount, currency),
          ),
        );
        continue;
      }
      if (invoice.status !== "cancelled") {
        totalInvoiced = toDecimalText(
          add(
            fromDecimalText(totalInvoiced, currency),
            fromDecimalText(invoice.totalAmount, currency),
          ),
        );
      }
      totalAllocated = toDecimalText(
        add(
          fromDecimalText(totalAllocated, currency),
          fromDecimalText(invoice.allocatedSum, currency),
        ),
      );
      concessionSum = toDecimalText(
        add(
          fromDecimalText(concessionSum, currency),
          fromDecimalText(invoice.concessionSum, currency),
        ),
      );
      if (
        invoice.status === "pending" ||
        invoice.status === "partial" ||
        invoice.status === "overdue"
      ) {
        openInvoiceCount += 1;
      }
      if (invoice.status === "overdue") overdueInvoiceCount += 1;
    }
    return {
      studentId,
      studentName: this.studentNames.get(studentId) ?? "Test Student",
      currency,
      totalInvoiced,
      totalAllocated,
      concessionSum,
      creditNoteSum,
      openInvoiceCount,
      overdueInvoiceCount,
    };
  }

  async sumStudentOutstanding(institutionId: string, studentId: string): Promise<string> {
    // What the student still owes on charges: billed total less payments, live concessions and
    // credit notes already issued. Credit notes are netted so a second note cannot over-credit
    // charges a first one already offset — the same figure `listStudentFees` derives.
    let currency = "PKR";
    let charged = zero(currency);
    let credited = zero(currency);
    let seen = false;
    for (const invoice of this.invoices.values()) {
      if (invoice.institutionId !== institutionId || invoice.studentId !== studentId) continue;
      if (!seen) {
        currency = invoice.currency;
        charged = zero(currency);
        credited = zero(currency);
        seen = true;
      }
      if (invoice.currency !== currency) continue;
      if (invoice.kind === "credit_note") {
        credited = add(credited, fromDecimalText(invoice.totalAmount, currency));
      } else if (invoice.status !== "cancelled") {
        charged = add(
          charged,
          invoiceBalance(
            fromDecimalText(invoice.totalAmount, currency),
            fromDecimalText(invoice.allocatedSum, currency),
            fromDecimalText(invoice.concessionSum, currency),
          ),
        );
      }
    }
    const net = subtract(charged, credited);
    return toDecimalText(compare(net, zero(currency)) > 0 ? net : zero(currency));
  }

  /* ---- Internals -------------------------------------------------------- */

  private insertGeneratedInvoice(values: GenerateInvoicesWrite, incoming: InvoiceWrite): void {
    this.invoiceSequence += 1;
    const student = (this.sessionStudents.get(values.academicSessionId) ?? []).find(
      (row) => row.studentId === incoming.studentId,
    );
    const id = nextId();
    this.invoices.set(id, {
      id,
      institutionId: values.institutionId,
      academicSessionId: values.academicSessionId,
      studentId: incoming.studentId,
      studentName: student?.studentName ?? null,
      invoiceNumber: `INV-${String(this.invoiceSequence).padStart(4, "0")}`,
      totalAmount: incoming.totalAmount,
      allocatedSum: "0.00",
      concessionSum: "0.00",
      currency: incoming.currency,
      status: "pending",
      kind: "regular",
      issuedOn: values.issuedOn,
      dueOn: values.dueOn,
      deferredUntil: null,
      feeStructureId: incoming.feeStructureId,
      lines: incoming.lines.map((line) => ({ id: nextId(), isTaxable: false, ...line })),
      allocations: [],
      concessions: [],
      deferrals: [],
      waiverReason: null,
      notes: values.note,
      issuedByUserId: values.issuedByUserId,
      updatedAt: new Date(),
      version: 1,
    });
  }

  /**
   * The write-on-read pass the store runs before every fee read: an expired deferral falls back to
   * `pending`, then a past-due pending/partial invoice becomes `overdue`. A live deferral suspends
   * the flip. Mirrors `refreshOverdue` in the Drizzle store against `CURRENT_DATE`.
   */
  private refreshOverdue(institutionId: string): void {
    const today = calendarDateString(new Date());
    for (const invoice of this.invoices.values()) {
      if (invoice.institutionId !== institutionId) continue;
      const liveDeferral = invoice.deferrals.some(
        (deferral) => deferral.isApproved && deferral.requestedUntil >= today,
      );
      if (invoice.status === "deferred") {
        const windowExpired = invoice.deferredUntil === null || invoice.deferredUntil < today;
        if (!liveDeferral && windowExpired) {
          invoice.status = "pending";
          invoice.deferredUntil = null;
        }
      }
      if (invoice.status === "pending" || invoice.status === "partial") {
        const stillDeferred = invoice.deferredUntil !== null && invoice.deferredUntil >= today;
        if (!liveDeferral && !stillDeferred && invoice.dueOn !== null && invoice.dueOn < today) {
          invoice.status = "overdue";
        }
      }
    }
  }

  /** Paid when fully allocated, partial when some money landed — the store's derived status. */
  private deriveStatus(invoice: InvoiceRecord): InvoiceRecord["status"] {
    const outstanding = invoiceBalance(
      fromDecimalText(invoice.totalAmount, invoice.currency),
      fromDecimalText(invoice.allocatedSum, invoice.currency),
      fromDecimalText(invoice.concessionSum, invoice.currency),
    );
    const settled = compare(outstanding, zero(invoice.currency)) === 0;
    const someMoney =
      compare(fromDecimalText(invoice.allocatedSum, invoice.currency), zero(invoice.currency)) > 0;
    if (settled) return "paid";
    if (someMoney) return "partial";
    return invoice.status;
  }

  private assertVersion(record: { readonly version: number }, expected: number): void {
    if (record.version !== expected) {
      throw new ConflictError(
        `Fee record version mismatch (expected ${expected}, found ${record.version}).`,
        {
          userMessage:
            "Someone else changed this record while you had it open. Reload to see the latest state.",
        },
      );
    }
  }
}
