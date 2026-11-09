/**
 * The fee module's use cases (`PRD.md` MODULE 6).
 *
 * Every command does the same three things, in the same order — the admission module's rhythm
 * (`../README.md` §5), so a reader who knows one module knows the other:
 *
 * 1. **Validate** the raw payload against its zod boundary schema (`parseOrThrow`), so a malformed
 *    request dies before it touches the store.
 * 2. **Check policy** against current state — generation refuses an empty scope or a currency
 *    mismatch, a payment's allocations may not exceed its amount or reach another student's
 *    invoices, a concession and a deferral approval demand an actor. These are pure functions in
 *    `../domain/fee-rules.ts` plus checks that need rows the service just loaded.
 * 3. **Write**, letting the store's unique-violation handling turn conflicts the rules cannot
 *    foresee into `ConflictError`. Store `ConflictError`/`ValidationError` are never caught here
 *    — they propagate, because a server action maps `AppError` to a user response already.
 *
 * Two invariants this file exists to protect:
 *
 * - **`ADR-0003`: no derived balance is stored.** `listInvoices` and `listStudentFees` compute
 *   the outstanding figure from `totalAmount` and the allocated sums the port provides, through
 *   `invoiceBalance`, which floors at zero.
 * - **The Critical Rule** (`RULES.md` §36): an issued invoice's frozen total and lines are
 *   immutable. Generation only ever *inserts* — it skips (student, structure) pairs that already
 *   have an invoice via `resolveAppliedStructures` — so re-running it is a no-op for rows that
 *   exist rather than a silent rewrite.
 */
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import {
  add,
  compare,
  fromDecimalText,
  subtract,
  toDecimalText,
  zero,
  type Money,
} from "@/shared/money";
import { parseOrThrow } from "@/shared/validation";

import {
  applyConcessionToAmount,
  assertAllocationWithinPayment,
  assertIssuedInvoiceUntouched,
  calendarDateString,
  invoiceBalance,
  structureAppliesToStudent,
  type InvoiceSnapshot,
} from "../domain/fee-rules";
import * as s from "./schemas";
import type {
  AppliedStructuresResult,
  DashboardStatsRow,
  FeeStructureDetailRow,
  FeeStore,
  InvoiceDetailRow,
  InvoiceLineWrite,
  InvoiceListRow,
  InvoiceWrite,
  StudentFeeSummaryRow,
} from "./ports";

/**
 * Who is performing a write. `userId` is `null` only where no authenticated user exists (seeds,
 * tests); a server action always supplies the session's user so payments, concessions and
 * deferral decisions name a real actor — and every fee write demands one (see
 * `requireActorUserId`).
 */
export interface Actor {
  readonly userId: string | null;
}

/** A list row plus the derived outstanding figure — computed here, never stored. */
export interface InvoiceListEntry extends InvoiceListRow {
  readonly outstanding: string;
}

export interface GenerateInvoicesResult {
  readonly createdCount: number;
  readonly skippedCount: number;
  /** Student×structure pairs whose scope matched, before the already-invoiced filter. */
  readonly matchedCount: number;
}

export interface FeeService {
  /* ---- Fee structures ---------------------------------------------------- */
  listStructures(input: unknown): Promise<readonly import("./ports").FeeStructureListRow[]>;
  getStructure(input: unknown): Promise<FeeStructureDetailRow>;
  createStructure(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;
  updateStructure(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly version: number }>;

  /* ---- Invoices ---------------------------------------------------------- */
  generateInvoices(input: unknown, actor: Actor): Promise<GenerateInvoicesResult>;
  listInvoices(input: unknown): Promise<readonly InvoiceListEntry[]>;
  getInvoice(input: unknown): Promise<import("./ports").InvoiceDetailRow>;

  /* ---- Money in ---------------------------------------------------------- */
  recordPayment(input: unknown, actor: Actor): Promise<{ readonly paymentId: string }>;
  grantConcession(input: unknown, actor: Actor): Promise<{ readonly id: string }>;
  createCreditNote(input: unknown, actor: Actor): Promise<{ readonly id: string }>;

  /* ---- Deferrals --------------------------------------------------------- */
  requestDeferral(input: unknown, actor: Actor): Promise<{ readonly id: string }>;
  decideDeferral(input: unknown, actor: Actor): Promise<{ readonly id: string }>;

  /* ---- Read models ------------------------------------------------------- */
  getDashboardStats(input: unknown): Promise<DashboardStatsRow>;
  listStudentFees(input: unknown): Promise<StudentFeeSummaryRow & { readonly outstanding: string }>;
}

export function createFeeService(store: FeeStore): FeeService {
  /** Every money write names a real cashier, approver or requester. */
  function requireActorUserId(actor: Actor): string {
    if (actor.userId === null) {
      throw new ValidationError("An authenticated user must perform this action.", {
        actor: ["Sign in before recording this change."],
      });
    }
    return actor.userId;
  }

  async function requireInvoice(
    institutionId: string,
    invoiceId: string,
  ): Promise<InvoiceDetailRow> {
    const invoice = await store.getInvoice(institutionId, invoiceId);
    if (invoice === null) {
      throw new NotFoundError("Invoice does not exist.", {
        userMessage: "That invoice is no longer available. Refresh the list and try again.",
      });
    }
    return invoice;
  }

  /** What the Critical Rule freezes: the billed total and every existing line's id and amount. */
  function toSnapshot(invoice: InvoiceDetailRow): InvoiceSnapshot {
    const lineAmounts: Record<string, string> = {};
    const lineIds: string[] = [];
    for (const line of invoice.lines) {
      lineIds.push(line.id);
      lineAmounts[line.id] = line.amount;
    }
    return { totalAmount: invoice.totalAmount, lineIds, lineAmounts };
  }

  return {
    async listStructures(input) {
      const data = parseOrThrow(s.listStructuresSchema, input, "fee structure");
      return store.listStructures(data.institutionId, data.isActive);
    },

    async getStructure(input) {
      const data = parseOrThrow(s.getStructureSchema, input, "fee structure");
      const structure = await store.getStructure(data.institutionId, data.structureId);
      if (structure === null) {
        throw new NotFoundError("Fee structure does not exist.", {
          userMessage: "That fee structure is no longer available. Refresh the list and try again.",
        });
      }
      return structure;
    },

    async createStructure(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.feeStructureSchema, input, "fee structure");
      return store.createStructure(
        {
          institutionId: data.institutionId,
          name: data.name,
          appliesTo: data.appliesTo,
          classId: data.classId,
          groupId: data.groupId,
          sectionId: data.sectionId,
          academicSessionId: data.academicSessionId,
          currency: data.currency,
          description: data.description,
          isActive: data.isActive,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
          items: data.items.map((item) => ({
            name: item.name,
            amount: item.amount,
            discountAmount: item.discountAmount,
            frequency: item.frequency,
            installmentCount: item.installmentCount,
            category: item.category,
            overrideAmount: item.overrideAmount,
            isMandatory: item.isMandatory,
            sortOrder: item.sortOrder,
            description: item.description,
          })),
        },
        userId,
      );
    },

    async updateStructure(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.updateFeeStructureSchema, input, "fee structure");
      return store.updateStructure(
        {
          id: data.id,
          expectedVersion: data.expectedVersion,
          institutionId: data.institutionId,
          name: data.name,
          appliesTo: data.appliesTo,
          classId: data.classId,
          groupId: data.groupId,
          sectionId: data.sectionId,
          academicSessionId: data.academicSessionId,
          currency: data.currency,
          description: data.description,
          isActive: data.isActive,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo,
          items: data.items.map((item) => ({
            name: item.name,
            amount: item.amount,
            discountAmount: item.discountAmount,
            frequency: item.frequency,
            installmentCount: item.installmentCount,
            category: item.category,
            overrideAmount: item.overrideAmount,
            isMandatory: item.isMandatory,
            sortOrder: item.sortOrder,
            description: item.description,
          })),
        },
        userId,
      );
    },

    async generateInvoices(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.generateInvoicesSchema, input, "invoice generation");
      const resolved: AppliedStructuresResult = await store.resolveAppliedStructures(
        data.institutionId,
        data.academicSessionId,
        data.feeStructureId,
      );

      if (resolved.structures.length === 0) {
        throw new BusinessRuleError("No applicable fee structure.", {
          userMessage:
            data.feeStructureId === null
              ? "No active fee structure applies to this session. Create or activate one before generating invoices."
              : "That fee structure does not apply to this session.",
        });
      }
      if (resolved.students.length === 0) {
        throw new BusinessRuleError("No students to invoice.", {
          userMessage: "There are no students in scope for this session.",
        });
      }
      const currencies = new Set(resolved.structures.map((structure) => structure.currency));
      if (currencies.size > 1) {
        throw new BusinessRuleError("Currency mismatch across fee structures.", {
          userMessage:
            "The applicable fee structures do not share one currency. Fix them before generating invoices.",
        });
      }

      const alreadyInvoiced = new Set(
        resolved.existingInvoiceKeys.map((key) => `${key.studentId}:${key.feeStructureId}`),
      );
      const issuedOn = calendarDateString(new Date());
      const invoices: InvoiceWrite[] = [];
      let skippedCount = 0;
      let matchedCount = 0;

      for (const structure of resolved.structures) {
        for (const student of resolved.students) {
          if (!structureAppliesToStudent(structure, student)) continue;
          matchedCount += 1;
          const key = `${student.studentId}:${structure.id}`;
          if (alreadyInvoiced.has(key)) {
            skippedCount += 1;
            continue;
          }
          const lines: InvoiceLineWrite[] = structure.items.map((item) => {
            const base = item.overrideAmount ?? item.amount;
            const net =
              item.discountAmount === null
                ? fromDecimalText(base, structure.currency)
                : applyConcessionToAmount(
                    base,
                    { amount: item.discountAmount },
                    structure.currency,
                  );
            return {
              feeStructureItemId: item.id,
              name: item.name,
              amount: toDecimalText(net),
              category: item.category,
            };
          });
          const total: Money = zero(structure.currency);
          const totalAmount = toDecimalText(
            lines.reduce(
              (accumulator, line) =>
                add(accumulator, fromDecimalText(line.amount, structure.currency)),
              total,
            ),
          );
          invoices.push({
            studentId: student.studentId,
            feeStructureId: structure.id,
            totalAmount,
            currency: structure.currency,
            lines,
          });
        }
      }

      if (invoices.length > 0) {
        // The Critical Rule, asserted around the write: generation may only insert. Anything
        // that rewrote an already-issued invoice (or its lines) surfaces as an InternalError —
        // a bug in our code, never a user-facing validation message.
        const frozen = await Promise.all(
          resolved.existingInvoiceKeys.map(async (key) => {
            const invoice = await requireInvoice(data.institutionId, key.invoiceId);
            return { id: invoice.id, snapshot: toSnapshot(invoice) };
          }),
        );
        const created = await store.generateInvoices({
          institutionId: data.institutionId,
          academicSessionId: data.academicSessionId,
          issuedOn,
          dueOn: data.dueOn,
          issuedByUserId: userId,
          note: data.note,
          invoices,
        });
        for (const entry of frozen) {
          const after = await requireInvoice(data.institutionId, entry.id);
          assertIssuedInvoiceUntouched(entry.snapshot, toSnapshot(after));
        }
        return { createdCount: created.createdCount, skippedCount, matchedCount };
      }
      return { createdCount: 0, skippedCount, matchedCount };
    },

    async listInvoices(input) {
      const data = parseOrThrow(s.listInvoicesSchema, input, "invoice");
      const rows = await store.listInvoices(data.institutionId, {
        studentId: data.studentId,
        academicSessionId: data.academicSessionId,
        status: data.status,
      });
      return rows.map((row) => ({
        ...row,
        outstanding: toDecimalText(
          invoiceBalance(
            fromDecimalText(row.totalAmount, row.currency),
            fromDecimalText(row.allocatedSum, row.currency),
            fromDecimalText(row.concessionSum, row.currency),
          ),
        ),
      }));
    },

    async getInvoice(input) {
      const data = parseOrThrow(s.getInvoiceSchema, input, "invoice");
      return requireInvoice(data.institutionId, data.invoiceId);
    },

    async recordPayment(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.recordPaymentSchema, input, "payment");
      let allocated: Money = zero(data.currency);
      for (const allocation of data.allocations) {
        const invoice = await requireInvoice(data.institutionId, allocation.invoiceId);
        if (invoice.studentId !== data.studentId) {
          throw new ValidationError("Allocation references another student's invoice.", {
            allocations: ["Every allocated invoice must belong to the student paying."],
          });
        }
        if (invoice.currency !== data.currency) {
          throw new BusinessRuleError(
            `Cannot allocate a ${data.currency} payment to a ${invoice.currency} invoice.`,
            {
              userMessage: `The payment is in ${data.currency} but the invoice is in ${invoice.currency}. Record the payment in the invoice's currency.`,
            },
          );
        }
        // A credit note is a correction, not a charge: it is excluded from every roll-up, so an
        // allocation landing on one would vanish from the totals it is meant to settle.
        if (invoice.kind === "credit_note") {
          throw new ValidationError("Cannot allocate to a credit note.", {
            allocations: [
              `Invoice ${allocation.invoiceId} is a credit note; allocations settle charges, not corrections.`,
            ],
          });
        }
        // No money may land on an invoice the institution has already closed out. `waived` is a
        // deliberate forgiveness, not a licence to collect afterwards; `paid`/`cancelled` are
        // equally terminal.
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
        if (compare(fromDecimalText(allocation.amount, data.currency), balance) > 0) {
          throw new ValidationError("Allocation exceeds the invoice's outstanding balance.", {
            allocations: [
              `Allocation on invoice ${allocation.invoiceId} is ${allocation.amount}, more than the outstanding ${toDecimalText(balance)}.`,
            ],
          });
        }
        allocated = add(allocated, fromDecimalText(allocation.amount, data.currency));
      }
      assertAllocationWithinPayment(data.amount, "0.00", toDecimalText(allocated), data.currency);

      const created = await store.recordPayment(
        {
          institutionId: data.institutionId,
          studentId: data.studentId,
          academicSessionId: data.academicSessionId,
          amount: data.amount,
          currency: data.currency,
          method: data.method,
          referenceNumber: data.referenceNumber,
          receivedOn: data.receivedOn,
          notes: data.notes,
          allocations: data.allocations,
        },
        userId,
      );
      return { paymentId: created.paymentId };
    },

    async grantConcession(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.concessionSchema, input, "concession");
      // A concession must land on a concrete invoice. A structure-scoped discount would have to
      // be re-applied at generation time and could drift from the issued lines (the Critical
      // Rule freezes those); invoice-scoped keeps every discount attached to money already billed.
      if (data.invoiceId === null) {
        throw new ValidationError("A concession must target an invoice.", {
          invoiceId: ["Choose the invoice this concession applies to."],
        });
      }
      const invoice = await requireInvoice(data.institutionId, data.invoiceId);
      // The concession goes onto the invoice, so the paying side of it is the invoice's student
      // — not whatever `studentId` the form happened to send. Refuse a mismatched pair (the same
      // ownership gate `recordPayment` enforces before allocating money to an invoice).
      if (data.studentId !== invoice.studentId) {
        throw new ValidationError("A concession must target the invoice's own student.", {
          studentId: ["The student does not match the invoice this concession applies to."],
        });
      }
      // A percentage concession is stored as the discount it computes *now*, against the
      // invoice's frozen total, so every later outstanding figure reads one number from
      // `fee_concessions.amount` instead of re-deriving a percentage against a moving base. The
      // percentage is kept alongside it for the audit trail.
      let amount = data.amount;
      if (data.percentage !== null) {
        const net = applyConcessionToAmount(
          invoice.totalAmount,
          { percentage: data.percentage },
          invoice.currency,
        );
        amount = toDecimalText(
          subtract(fromDecimalText(invoice.totalAmount, invoice.currency), net),
        );
      }
      const created = await store.grantConcession(
        {
          studentId: data.studentId,
          invoiceId: data.invoiceId,
          feeStructureId: null,
          kind: data.kind,
          percentage: data.percentage,
          amount,
          currency: amount === null ? null : invoice.currency,
          reason: data.reason,
        },
        userId,
      );
      return { id: created.id };
    },

    async createCreditNote(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.manualAdjustmentSchema, input, "credit note");
      if (data.kind !== "credit_note") {
        throw new BusinessRuleError(
          `Cannot create a credit note for adjustment kind ${data.kind}.`,
          {
            userMessage:
              "This command only issues credit notes. Use the deferral decision for postponements.",
          },
        );
      }
      const invoice = await requireInvoice(data.institutionId, data.invoiceId);
      // A credit note writes off money the student still owes; issuing more than that would
      // create a negative receivable the ledger has no way to represent (and the invoice total
      // is frozen). The cap is student-level and already nets prior credit notes, so repeated
      // notes cannot over-credit the same charges.
      const outstanding = await store.sumStudentOutstanding(data.institutionId, invoice.studentId);
      if (
        compare(
          fromDecimalText(data.amount, invoice.currency),
          fromDecimalText(outstanding, invoice.currency),
        ) > 0
      ) {
        throw new ValidationError("Credit note exceeds the student's outstanding balance.", {
          amount: [
            `The credit note is ${data.amount}, more than the ${outstanding} the student still owes.`,
          ],
        });
      }
      const created = await store.createCreditNote(
        {
          institutionId: data.institutionId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          academicSessionId: invoice.academicSessionId,
          amount: data.amount,
          currency: invoice.currency,
          reason: data.reason,
        },
        userId,
      );
      return { id: created.id };
    },

    async requestDeferral(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.deferralSchema, input, "deferral");
      await requireInvoice(data.institutionId, data.invoiceId);
      const created = await store.requestDeferral({
        invoiceId: data.invoiceId,
        reason: data.reason,
        requestedFrom: data.requestedFrom,
        requestedUntil: data.requestedUntil,
        requestedByUserId: userId,
        ...(data.isApproved
          ? { approvedByUserId: userId, decisionNotes: data.decisionNotes ?? "" }
          : {}),
      });
      return { id: created.id };
    },

    async decideDeferral(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.decideDeferralSchema, input, "deferral decision");
      const invoice = await requireInvoice(data.institutionId, data.invoiceId);
      const created = await store.decideDeferral({
        invoiceId: invoice.id,
        deferralId: data.deferralId,
        expectedVersion: data.expectedVersion,
        isApproved: data.isApproved,
        decisionNotes: data.decisionNotes,
        approverUserId: data.isApproved ? userId : null,
        now: new Date(),
      });
      return { id: created.id };
    },

    async getDashboardStats(input) {
      const data = parseOrThrow(s.getDashboardStatsSchema, input, "fee dashboard");
      return store.getDashboardStats(data.institutionId, data.academicSessionId);
    },

    async listStudentFees(input) {
      const data = parseOrThrow(s.listStudentFeesSchema, input, "student fees");
      const summary = await store.listStudentFees(
        data.institutionId,
        data.studentId,
        data.academicSessionId,
      );
      if (summary === null) {
        throw new NotFoundError("Student fees do not exist.", {
          userMessage: "That student has no fee records. Refresh the page and try again.",
        });
      }
      return {
        ...summary,
        outstanding: toDecimalText(
          invoiceBalance(
            fromDecimalText(summary.totalInvoiced, summary.currency),
            fromDecimalText(summary.totalAllocated, summary.currency),
            // Concessions and credit notes are both write-offs of billed money, so they reduce
            // what is still collectable together; `invoiceBalance` floors the result at zero.
            add(
              fromDecimalText(summary.concessionSum, summary.currency),
              fromDecimalText(summary.creditNoteSum, summary.currency),
            ),
          ),
        ),
      };
    },
  };
}
