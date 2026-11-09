/**
 * Use-case tests for the fee service, run against an in-memory {@link FakeFeeStore}.
 *
 * These cover the decisions that live in the service layer (`PRD.md` MODULE 6): boundary
 * validation on every command, the actor gate money writes demand, scope-consistency stated at
 * the form, generation's resolve-then-insert flow — including the Critical Rule regression that
 * an issued invoice's frozen total and lines survive a re-run — payment allocation limits,
 * the one-basis concession, deferral approval gates, and the balances derived at read time
 * (`ADR-0003`: never stored). Store-level integrity (tenant guards, unique-violation
 * translation, the generation transaction) belongs to the Drizzle store and is out of scope here.
 */
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  BusinessRuleError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";

import type { FeeStructureItemRow, GenerateInvoicesWrite } from "./ports";
import { createFeeService, type FeeService } from "./fee-service";
import { FakeFeeStore } from "./testing/fakes";

const GHOST = randomUUID();
const ACTOR = { userId: randomUUID() };
const SIGNED_OUT = { userId: null };
const SID = randomUUID();
const SID_B = randomUUID();
const SID_C = randomUUID();
const CLASS_A = randomUUID();
const CLASS_B = randomUUID();

let INST: string;
let SESSION: string;
let store: FakeFeeStore;
let svc: FeeService;

const structureItem = (overrides: Partial<FeeStructureItemRow> = {}): FeeStructureItemRow => ({
  id: randomUUID(),
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
  ...overrides,
});

const structureInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  name: "Grade 5 Tuition",
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
  items: [
    {
      name: "Tuition",
      amount: "1000.00",
      frequency: "monthly",
      installmentCount: 1,
      category: "tuition",
      isMandatory: true,
      sortOrder: 0,
    },
  ],
  ...overrides,
});

const genInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  academicSessionId: SESSION,
  dueOn: "2026-11-15",
  feeStructureId: null,
  note: null,
  ...overrides,
});

const paymentInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  studentId: SID,
  academicSessionId: SESSION,
  amount: "400.00",
  currency: "PKR",
  method: "cash",
  receivedOn: "2026-10-10",
  referenceNumber: null,
  notes: null,
  allocations: [] as { invoiceId: string; amount: string }[],
  ...overrides,
});

/** Assert a rejection whose `fieldErrors` mention `field` (paths may be dotted, e.g. `items.0.x`). */
async function expectFieldError(promise: Promise<unknown>, field: string): Promise<void> {
  try {
    await promise;
    throw new Error("expected a rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    const keys = Object.keys((error as ValidationError).fieldErrors);
    expect(keys.some((key) => key.includes(field))).toBe(true);
  }
}

beforeEach(() => {
  INST = randomUUID();
  SESSION = randomUUID();
  store = new FakeFeeStore();
  svc = createFeeService(store);
});

/* -------------------------------------------------------------------------- */
/* Fee structures                                                             */
/* -------------------------------------------------------------------------- */

describe("fee service — structures", () => {
  it("creates a structure with its items at version 1", async () => {
    const created = await svc.createStructure(structureInput(), ACTOR);
    expect(created.version).toBe(1);
    const detail = await svc.getStructure({ institutionId: INST, structureId: created.id });
    expect(detail.name).toBe("Grade 5 Tuition");
    expect(detail.currency).toBe("PKR");
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]?.amount).toBe("1000.00");
  });

  it("refuses a class-scoped structure that names no class — the DB check stated at the form", async () => {
    await expectFieldError(
      svc.createStructure(structureInput({ appliesTo: "class" }), ACTOR),
      "classId",
    );
  });

  it("refuses an all-scope structure that still names a class", async () => {
    await expectFieldError(
      svc.createStructure(structureInput({ appliesTo: "all", classId: CLASS_A }), ACTOR),
      "classId",
    );
  });

  it("refuses a one-time item carrying an installment count", async () => {
    await expectFieldError(
      svc.createStructure(
        structureInput({
          items: [
            {
              name: "Admission fee",
              amount: "500.00",
              frequency: "one_time",
              installmentCount: 3,
              category: "admission",
              isMandatory: true,
              sortOrder: 0,
            },
          ],
        }),
        ACTOR,
      ),
      "installmentCount",
    );
  });

  it("refuses a recurring item with no installment count", async () => {
    await expectFieldError(
      svc.createStructure(
        structureInput({
          items: [
            {
              name: "Tuition",
              amount: "1000.00",
              frequency: "monthly",
              category: "tuition",
              isMandatory: true,
              sortOrder: 0,
            },
          ],
        }),
        ACTOR,
      ),
      "installmentCount",
    );
  });

  it("refuses a discount larger than its item", async () => {
    await expectFieldError(
      svc.createStructure(
        structureInput({
          items: [
            {
              name: "Tuition",
              amount: "100.00",
              discountAmount: "150.00",
              frequency: "one_time",
              installmentCount: null,
              category: "tuition",
              isMandatory: true,
              sortOrder: 0,
            },
          ],
        }),
        ACTOR,
      ),
      "discountAmount",
    );
  });

  it("refuses an effective window that ends before it starts", async () => {
    await expectFieldError(
      svc.createStructure(
        structureInput({ effectiveFrom: "2026-06-01", effectiveTo: "2026-01-01" }),
        ACTOR,
      ),
      "effectiveTo",
    );
  });

  it("updates a structure, bumping its version, then refuses a stale writer", async () => {
    const created = await svc.createStructure(structureInput(), ACTOR);
    const updated = await svc.updateStructure(
      structureInput({ id: created.id, expectedVersion: 1, name: "Grade 5 Tuition 2027" }),
      ACTOR,
    );
    expect(updated.version).toBe(2);
    await expect(
      svc.updateStructure(structureInput({ id: created.id, expectedVersion: 1 }), ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps a surviving item's id when a structure is edited in place", async () => {
    const structure = store.seedStructure({
      institutionId: INST,
      name: "Grade 5 Tuition",
      items: [structureItem({ name: "Tuition", amount: "1000.00", sortOrder: 0 })],
    });
    const itemId = structure.items[0]?.id;

    const updated = await svc.updateStructure(
      structureInput({
        id: structure.id,
        expectedVersion: 1,
        name: "Grade 5 Tuition 2027",
        items: [
          {
            name: "Tuition (revised)",
            amount: "1200.00",
            frequency: "monthly",
            installmentCount: 1,
            category: "tuition",
            isMandatory: true,
            sortOrder: 0,
          },
        ],
      }),
      ACTOR,
    );
    expect(updated.version).toBe(2);

    const detail = await svc.getStructure({ institutionId: INST, structureId: structure.id });
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]?.id).toBe(itemId);
    expect(detail.items[0]?.amount).toBe("1200.00");
  });

  it("refuses to remove a structure item an issued invoice line still references", async () => {
    const structure = store.seedStructure({
      institutionId: INST,
      name: "Grade 5 Tuition",
      items: [
        structureItem({ name: "Tuition", amount: "1000.00", sortOrder: 0 }),
        structureItem({ name: "Lab", amount: "200.00", sortOrder: 1 }),
      ],
    });
    store.seedInvoice({
      institutionId: INST,
      lines: [
        {
          id: "line-1",
          feeStructureItemId: structure.items[1]?.id ?? "",
          name: "Lab",
          amount: "200.00",
          category: "lab",
          isTaxable: false,
        },
      ],
    });

    await expect(
      svc.updateStructure(
        structureInput({
          id: structure.id,
          expectedVersion: 1,
          items: [
            {
              name: "Tuition",
              amount: "1000.00",
              frequency: "monthly",
              installmentCount: 1,
              category: "tuition",
              isMandatory: true,
              sortOrder: 0,
            },
          ],
        }),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("drops an item no invoice references when an edit shortens the list", async () => {
    const structure = store.seedStructure({
      institutionId: INST,
      name: "Grade 5 Tuition",
      items: [
        structureItem({ name: "Tuition", amount: "1000.00", sortOrder: 0 }),
        structureItem({ name: "Lab", amount: "200.00", sortOrder: 1 }),
      ],
    });

    const updated = await svc.updateStructure(
      structureInput({
        id: structure.id,
        expectedVersion: 1,
        items: [
          {
            name: "Tuition",
            amount: "1000.00",
            frequency: "monthly",
            installmentCount: 1,
            category: "tuition",
            isMandatory: true,
            sortOrder: 0,
          },
        ],
      }),
      ACTOR,
    );
    expect(updated.version).toBe(2);
    const detail = await svc.getStructure({ institutionId: INST, structureId: structure.id });
    expect(detail.items).toHaveLength(1);
  });

  it("refuses to update another institution's structure", async () => {
    const created = await svc.createStructure(structureInput(), ACTOR);
    await expect(
      svc.updateStructure(
        structureInput({ id: created.id, expectedVersion: 1, institutionId: randomUUID() }),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("turns a ghost structure id into a NotFoundError", async () => {
    await expect(
      svc.getStructure({ institutionId: INST, structureId: GHOST }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists structures and honours the isActive filter", async () => {
    store.seedStructure({ institutionId: INST, name: "Active plan", isActive: true });
    store.seedStructure({ institutionId: INST, name: "Retired plan", isActive: false });
    const all = await svc.listStructures({ institutionId: INST });
    expect(all).toHaveLength(2);
    const inactive = await svc.listStructures({ institutionId: INST, isActive: false });
    expect(inactive.map((row) => row.name)).toEqual(["Retired plan"]);
  });

  it("rejects a payload that is not an object at all", async () => {
    await expect(svc.createStructure("nope", ACTOR)).rejects.toBeInstanceOf(ValidationError);
  });
});

/* -------------------------------------------------------------------------- */
/* Invoice generation                                                         */
/* -------------------------------------------------------------------------- */

describe("fee service — generation", () => {
  it("generates one invoice per student, totalling the structure's item", async () => {
    store.seedStructure({ institutionId: INST, name: "Tuition" });
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });
    store.seedStudentForSession(SESSION, { studentId: SID_B, studentName: "Bilal Ahmed" });

    const result = await svc.generateInvoices(genInput(), ACTOR);
    expect(result).toEqual({ createdCount: 2, skippedCount: 0, matchedCount: 2 });

    const invoices = await svc.listInvoices({ institutionId: INST });
    expect(invoices).toHaveLength(2);
    expect(invoices.map((row) => row.totalAmount)).toEqual(["1000.00", "1000.00"]);
    expect(invoices.every((row) => row.outstanding === "1000.00")).toBe(true);
    expect(invoices[0]?.dueOn).toBe("2026-11-15");
    expect(invoices[0]?.studentName).toBe("Amina Khan");
  });

  it("bills each line net of its standing discount", async () => {
    store.seedStructure({
      institutionId: INST,
      name: "Discounted",
      items: [structureItem({ amount: "500.00", discountAmount: "50.00" })],
    });
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });

    await svc.generateInvoices(genInput(), ACTOR);
    const [invoice] = await svc.listInvoices({ institutionId: INST });
    expect(invoice?.totalAmount).toBe("450.00");
  });

  it("skips students outside a class-scoped structure's placement", async () => {
    store.seedStructure({
      institutionId: INST,
      name: "Class plan",
      appliesTo: "class",
      classId: CLASS_A,
    });
    store.seedStudentForSession(SESSION, {
      studentId: SID,
      studentName: "Other class",
      classId: CLASS_B,
    });

    const result = await svc.generateInvoices(genInput(), ACTOR);
    expect(result).toEqual({ createdCount: 0, skippedCount: 0, matchedCount: 0 });
    expect(store.generated).toHaveLength(0);
  });

  it("Critical Rule: a second run creates nothing and skips every existing pair", async () => {
    store.seedStructure({ institutionId: INST, name: "Tuition" });
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });

    const first = await svc.generateInvoices(genInput(), ACTOR);
    expect(first).toEqual({ createdCount: 1, skippedCount: 0, matchedCount: 1 });

    const second = await svc.generateInvoices(genInput(), ACTOR);
    expect(second).toEqual({ createdCount: 0, skippedCount: 1, matchedCount: 1 });

    const invoices = await svc.listInvoices({ institutionId: INST });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.totalAmount).toBe("1000.00");
  });

  it("Critical Rule: a re-run leaves the issued invoice's total and lines untouched", async () => {
    store.seedStructure({ institutionId: INST, name: "Tuition" });
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });
    await svc.generateInvoices(genInput(), ACTOR);

    const [before] = await svc.listInvoices({ institutionId: INST });
    const detailBefore = await svc.getInvoice({
      institutionId: INST,
      invoiceId: before?.id ?? GHOST,
    });
    await svc.generateInvoices(genInput(), ACTOR);
    const detailAfter = await svc.getInvoice({
      institutionId: INST,
      invoiceId: before?.id ?? GHOST,
    });

    expect(detailAfter.totalAmount).toBe(detailBefore.totalAmount);
    expect(detailAfter.lines.map((line) => line.amount)).toEqual(
      detailBefore.lines.map((line) => line.amount),
    );
    expect(detailAfter.version).toBe(detailBefore.version);
  });

  it("Critical Rule: a generation path that rewrites an issued invoice fails loudly", async () => {
    // A rogue store that tampers with an already-issued invoice mid-write — the regression
    // `assertIssuedInvoiceUntouched` exists to catch (`RULES.md` §36).
    class RogueStore extends FakeFeeStore {
      tamper: { totalAmount: string } | null = null;
      override async generateInvoices(values: GenerateInvoicesWrite) {
        const result = await super.generateInvoices(values);
        if (this.tamper !== null) this.tamper.totalAmount = "0.01";
        return result;
      }
    }
    const rogue = new RogueStore();
    rogue.seedStructure({ institutionId: INST, name: "Tuition" });
    rogue.seedStudentForSession(SESSION, { studentId: SID, studentName: "A" });
    rogue.seedStudentForSession(SESSION, { studentId: SID_B, studentName: "B" });
    const rogueSvc = createFeeService(rogue);

    await rogueSvc.generateInvoices(genInput(), ACTOR);
    const [issued] = await rogueSvc.listInvoices({ institutionId: INST });
    const detail = await rogueSvc.getInvoice({
      institutionId: INST,
      invoiceId: issued?.id ?? GHOST,
    });
    rogue.tamper = detail;
    rogue.seedStudentForSession(SESSION, { studentId: SID_C, studentName: "C" });

    await expect(rogueSvc.generateInvoices(genInput(), ACTOR)).rejects.toBeInstanceOf(
      InternalError,
    );
  });

  it("refuses to generate when no structure applies to the session", async () => {
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });
    await expect(svc.generateInvoices(genInput(), ACTOR)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses to generate when the session has no students", async () => {
    store.seedStructure({ institutionId: INST, name: "Tuition" });
    await expect(svc.generateInvoices(genInput(), ACTOR)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses a generation spanning two currencies", async () => {
    store.seedStructure({ institutionId: INST, name: "PKR plan", currency: "PKR" });
    store.seedStructure({ institutionId: INST, name: "USD plan", currency: "USD" });
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });
    await expect(svc.generateInvoices(genInput(), ACTOR)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses a malformed due date at the boundary", async () => {
    await expectFieldError(svc.generateInvoices(genInput({ dueOn: "someday" }), ACTOR), "dueOn");
  });

  it("demands an actor before it generates anything", async () => {
    store.seedStructure({ institutionId: INST, name: "Tuition" });
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });
    await expect(svc.generateInvoices(genInput(), SIGNED_OUT)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.generated).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Invoice reads                                                              */
/* -------------------------------------------------------------------------- */

describe("fee service — invoice reads", () => {
  it("derives the outstanding balance at read time and floors it at zero", async () => {
    store.seedInvoice({ institutionId: INST, totalAmount: "1000.00", allocatedSum: "1200.00" });
    const [row] = await svc.listInvoices({ institutionId: INST });
    expect(row?.outstanding).toBe("0.00");
  });

  it("flips a deferred invoice back to overdue once its window has lapsed", async () => {
    store.seedInvoice({
      institutionId: INST,
      status: "deferred",
      dueOn: "2000-01-01",
      deferredUntil: "2000-01-01",
    });
    const [row] = await svc.listInvoices({ institutionId: INST });
    expect(row?.status).toBe("overdue");
    expect(row?.deferredUntil).toBeNull();
  });

  it("keeps a deferred invoice deferred while its window is still open", async () => {
    store.seedInvoice({
      institutionId: INST,
      status: "deferred",
      dueOn: "2000-01-01",
      deferredUntil: "2999-12-31",
    });
    const [row] = await svc.listInvoices({ institutionId: INST });
    expect(row?.status).toBe("deferred");
    expect(row?.deferredUntil).toBe("2999-12-31");
  });

  it("flips a past-due pending invoice to overdue at read time", async () => {
    store.seedInvoice({
      institutionId: INST,
      status: "pending",
      dueOn: "2000-01-01",
    });
    const [row] = await svc.listInvoices({ institutionId: INST });
    expect(row?.status).toBe("overdue");
  });

  it("filters the list by stored status", async () => {
    store.seedInvoice({ institutionId: INST, totalAmount: "100.00", status: "pending" });
    store.seedInvoice({ institutionId: INST, totalAmount: "200.00", status: "paid" });
    const rows = await svc.listInvoices({ institutionId: INST, status: "paid" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.totalAmount).toBe("200.00");
  });

  it("turns a ghost invoice id into a NotFoundError", async () => {
    await expect(svc.getInvoice({ institutionId: INST, invoiceId: GHOST })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns the invoice with its frozen lines", async () => {
    const seeded = store.seedInvoice({
      institutionId: INST,
      totalAmount: "750.00",
      lines: [
        {
          id: "line-1",
          feeStructureItemId: null,
          name: "Tuition",
          amount: "500.00",
          category: "tuition",
          isTaxable: false,
        },
        {
          id: "line-2",
          feeStructureItemId: null,
          name: "Lab",
          amount: "250.00",
          category: "lab",
          isTaxable: true,
        },
      ],
    });
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: seeded.id });
    expect(detail.lines).toHaveLength(2);
    expect(detail.totalAmount).toBe("750.00");
  });
});

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

describe("fee service — payments", () => {
  it("records a partial payment and rolls the allocation onto the invoice", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    const created = await svc.recordPayment(
      paymentInput({ allocations: [{ invoiceId: invoice.id, amount: "400.00" }] }),
      ACTOR,
    );
    expect(created.paymentId).toEqual(expect.any(String));

    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(detail.allocatedSum).toBe("400.00");
    expect(detail.status).toBe("partial");
    expect(detail.allocations).toHaveLength(1);
    expect(detail.allocations[0]?.paymentNumber).toMatch(/^PAY-\d{4}$/);
  });

  it("marks an invoice paid when the allocation settles it in full", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    await svc.recordPayment(
      paymentInput({
        amount: "1000.00",
        allocations: [{ invoiceId: invoice.id, amount: "1000.00" }],
      }),
      ACTOR,
    );
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(detail.status).toBe("paid");
    const [row] = await svc.listInvoices({ institutionId: INST });
    expect(row?.outstanding).toBe("0.00");
  });

  it("refuses allocations that exceed the payment", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          amount: "500.00",
          allocations: [{ invoiceId: invoice.id, amount: "600.00" }],
        }),
        ACTOR,
      ),
      "allocations",
    );
  });

  it("refuses an allocation larger than the invoice's derived balance", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "100.00",
    });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          amount: "150.00",
          allocations: [{ invoiceId: invoice.id, amount: "150.00" }],
        }),
        ACTOR,
      ),
      "allocations",
    );
  });

  it("refuses an allocation larger than the balance left after a concession", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    await svc.grantConcession(
      {
        institutionId: INST,
        studentId: SID,
        invoiceId: invoice.id,
        kind: "discount",
        percentage: 50,
        reason: "Half off",
      },
      ACTOR,
    );
    // The invoice now owes 500, so a payment that covers 600 is still allocated past the balance.
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          amount: "600.00",
          allocations: [{ invoiceId: invoice.id, amount: "600.00" }],
        }),
        ACTOR,
      ),
      "allocations",
    );
  });

  it("refuses a further allocation against a paid invoice", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "100.00",
      allocatedSum: "100.00",
      status: "paid",
    });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          amount: "10.00",
          allocations: [{ invoiceId: invoice.id, amount: "10.00" }],
        }),
        ACTOR,
      ),
      "allocations",
    );
  });

  it("refuses an allocation against a cancelled invoice", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "100.00",
      status: "cancelled",
    });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          amount: "10.00",
          allocations: [{ invoiceId: invoice.id, amount: "10.00" }],
        }),
        ACTOR,
      ),
      "allocations",
    );
  });

  it("refuses an allocation against a credit note", async () => {
    // A credit note is excluded from every roll-up, so money landing on it would disappear from
    // the totals it is meant to correct.
    const creditNote = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "100.00",
      kind: "credit_note",
    });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          amount: "10.00",
          allocations: [{ invoiceId: creditNote.id, amount: "10.00" }],
        }),
        ACTOR,
      ),
      "allocations",
    );
  });

  it("refuses an allocation pointing at another student's invoice", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: "someone-else" });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({ allocations: [{ invoiceId: invoice.id, amount: "100.00" }] }),
        ACTOR,
      ),
      "allocations",
    );
  });

  it("refuses a payment in the wrong currency for its invoice", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID, currency: "PKR" });
    await expect(
      svc.recordPayment(
        paymentInput({
          currency: "USD",
          allocations: [{ invoiceId: invoice.id, amount: "100.00" }],
        }),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("demands a reference number for a non-cash payment", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          method: "bank_transfer",
          allocations: [{ invoiceId: invoice.id, amount: "100.00" }],
        }),
        ACTOR,
      ),
      "referenceNumber",
    );
  });

  it("refuses the same invoice twice in one payment", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({
          amount: "300.00",
          allocations: [
            { invoiceId: invoice.id, amount: "100.00" },
            { invoiceId: invoice.id, amount: "200.00" },
          ],
        }),
        ACTOR,
      ),
      "invoiceId",
    );
  });

  it("refuses a zero or missing amount", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.recordPayment(
        paymentInput({ amount: "0", allocations: [{ invoiceId: invoice.id, amount: "0" }] }),
        ACTOR,
      ),
      "amount",
    );
  });

  it("refuses a payment with no allocations", async () => {
    await expectFieldError(
      svc.recordPayment(paymentInput({ allocations: [] }), ACTOR),
      "allocations",
    );
  });

  it("demands an actor before it records money", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expect(
      svc.recordPayment(
        paymentInput({ allocations: [{ invoiceId: invoice.id, amount: "100.00" }] }),
        SIGNED_OUT,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

/* -------------------------------------------------------------------------- */
/* Concessions                                                                */
/* -------------------------------------------------------------------------- */

describe("fee service — concessions", () => {
  it("grants a concession against an invoice", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    const created = await svc.grantConcession(
      {
        institutionId: INST,
        studentId: SID,
        invoiceId: invoice.id,
        kind: "sibling_discount",
        percentage: 10,
        reason: "Sibling in Grade 7",
      },
      ACTOR,
    );
    expect(created.id).toEqual(expect.any(String));
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(detail.concessions).toHaveLength(1);
    expect(detail.concessions[0]?.percentage).toBe(10);
  });

  it("refuses a concession that names no invoice — discounts attach to issued money", async () => {
    // A structure-scoped discount would have to be re-applied at generation time and could drift
    // from the frozen issued lines, so the service requires an invoice target.
    const structure = store.seedStructure({
      institutionId: INST,
      name: "Waived plan",
      currency: "PKR",
    });
    await expectFieldError(
      svc.grantConcession(
        {
          institutionId: INST,
          studentId: SID,
          feeStructureId: structure.id,
          kind: "waiver",
          amount: "500.00",
          reason: "Staff ward",
        },
        ACTOR,
      ),
      "invoiceId",
    );
  });

  it("refuses a concession whose student differs from the invoice's owner", async () => {
    // The concession is written against the invoice, so it discounts *that* student's balance.
    // A mismatched `studentId` from the form would cross-attribute an adjustment — the same
    // ownership gate `recordPayment` enforces before allocating money to an invoice.
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.grantConcession(
        {
          institutionId: INST,
          studentId: SID_B,
          invoiceId: invoice.id,
          kind: "sibling_discount",
          percentage: 10,
          reason: "Sibling in Grade 7",
        },
        ACTOR,
      ),
      "studentId",
    );
  });

  it("stores a percentage concession as the discount it computes against the frozen total", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    await svc.grantConcession(
      {
        institutionId: INST,
        studentId: SID,
        invoiceId: invoice.id,
        kind: "sibling_discount",
        percentage: 10,
        reason: "Sibling in Grade 7",
      },
      ACTOR,
    );
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(detail.concessions[0]?.amount).toBe("100.00");
    // The stored discount now reduces what the student owes at read time.
    const [row] = await svc.listInvoices({ institutionId: INST });
    expect(row?.outstanding).toBe("900.00");
  });

  it("refuses both bases at once — fee_concessions_one_basis_check stated at the form", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.grantConcession(
        {
          institutionId: INST,
          studentId: SID,
          invoiceId: invoice.id,
          kind: "discount",
          percentage: 10,
          amount: "50.00",
          reason: "Whatever sticks",
        },
        ACTOR,
      ),
      "percentage",
    );
  });

  it("refuses a concession with no basis at all", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.grantConcession(
        {
          institutionId: INST,
          studentId: SID,
          invoiceId: invoice.id,
          kind: "discount",
          reason: "No basis",
        },
        ACTOR,
      ),
      "percentage",
    );
  });

  it("refuses a concession targeting both an invoice and a structure", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    const structure = store.seedStructure({ institutionId: INST, name: "Target plan" });
    await expectFieldError(
      svc.grantConcession(
        {
          institutionId: INST,
          studentId: SID,
          invoiceId: invoice.id,
          feeStructureId: structure.id,
          kind: "discount",
          percentage: 5,
          reason: "Both targets",
        },
        ACTOR,
      ),
      "invoiceId",
    );
  });

  it("demands an actor before it grants money off", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expect(
      svc.grantConcession(
        {
          institutionId: INST,
          studentId: SID,
          invoiceId: invoice.id,
          kind: "discount",
          percentage: 5,
          reason: "Signed out",
        },
        SIGNED_OUT,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

/* -------------------------------------------------------------------------- */
/* Deferrals                                                                  */
/* -------------------------------------------------------------------------- */

describe("fee service — deferrals", () => {
  const deferralInput = (
    invoiceId: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    institutionId: INST,
    invoiceId,
    reason: "Family requested more time",
    requestedFrom: "2026-11-01",
    requestedUntil: "2026-12-01",
    isApproved: false,
    decisionNotes: null,
    ...overrides,
  });

  it("files a pending request without moving the invoice's deferral window", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await svc.requestDeferral(deferralInput(invoice.id), ACTOR);
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(detail.deferrals).toHaveLength(1);
    expect(detail.deferrals[0]?.isApproved).toBe(false);
    expect(detail.deferredUntil).toBeNull();
  });

  it("sets the deferral window when the request is approved on filing", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await svc.requestDeferral(
      deferralInput(invoice.id, { isApproved: true, decisionNotes: "Approved by bursar" }),
      ACTOR,
    );
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(detail.deferredUntil).toBe("2026-12-01");
  });

  it("refuses a deferral window that ends before it starts", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.requestDeferral(
        deferralInput(invoice.id, { requestedFrom: "2026-12-01", requestedUntil: "2026-11-01" }),
        ACTOR,
      ),
      "requestedUntil",
    );
  });

  it("refuses an approval filed without decision notes", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expectFieldError(
      svc.requestDeferral(
        deferralInput(invoice.id, { isApproved: true, decisionNotes: null }),
        ACTOR,
      ),
      "decisionNotes",
    );
  });

  it("approves a filed request under a current version", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    const filed = await svc.requestDeferral(deferralInput(invoice.id), ACTOR);
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    const decided = await svc.decideDeferral(
      {
        institutionId: INST,
        invoiceId: invoice.id,
        deferralId: filed.id,
        expectedVersion: detail.version,
        isApproved: true,
        decisionNotes: "Approved after review",
      },
      ACTOR,
    );
    expect(decided.id).toBe(filed.id);
    const after = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(after.deferredUntil).toBe("2026-12-01");
    expect(after.deferrals[0]?.approvedByUserId).toBe(ACTOR.userId);
  });

  it("refuses a deferral decision made against a stale version", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    const filed = await svc.requestDeferral(deferralInput(invoice.id), ACTOR);
    // A pending filing leaves the version alone, so a later money write is what moves the invoice
    // on and makes the decider's pre-read version stale.
    await svc.recordPayment(
      paymentInput({ allocations: [{ invoiceId: invoice.id, amount: "100.00" }] }),
      ACTOR,
    );
    await expect(
      svc.decideDeferral(
        {
          institutionId: INST,
          invoiceId: invoice.id,
          deferralId: filed.id,
          expectedVersion: 1,
          isApproved: true,
          decisionNotes: "Approved after review",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("clears the deferral window when the request is rejected", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    const filed = await svc.requestDeferral(
      deferralInput(invoice.id, { isApproved: true, decisionNotes: "Pre-approved" }),
      ACTOR,
    );
    const detail = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(detail.deferredUntil).toBe("2026-12-01");

    await svc.decideDeferral(
      {
        institutionId: INST,
        invoiceId: invoice.id,
        deferralId: filed.id,
        expectedVersion: detail.version,
        isApproved: false,
        decisionNotes: null,
      },
      ACTOR,
    );
    const after = await svc.getInvoice({ institutionId: INST, invoiceId: invoice.id });
    expect(after.deferredUntil).toBeNull();
    expect(after.deferrals[0]?.isApproved).toBe(false);
  });

  it("demands an actor before it files a deferral", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expect(svc.requestDeferral(deferralInput(invoice.id), SIGNED_OUT)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Manual adjustments                                                         */
/* -------------------------------------------------------------------------- */

describe("fee service — credit notes", () => {
  it("files a credit note carrying the invoice's student, session and currency", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      academicSessionId: SESSION,
      currency: "PKR",
      totalAmount: "1000.00",
    });
    const created = await svc.createCreditNote(
      {
        institutionId: INST,
        invoiceId: invoice.id,
        kind: "credit_note",
        amount: "250.00",
        reason: "Charged in error",
      },
      ACTOR,
    );
    expect(created.id).toEqual(expect.any(String));
    expect(store.creditNotes).toHaveLength(1);
    expect(store.creditNotes[0]?.studentId).toBe(SID);
    expect(store.creditNotes[0]?.academicSessionId).toBe(SESSION);
    expect(store.creditNotes[0]?.currency).toBe("PKR");
  });

  it("caps a credit note at the student's remaining balance after prior notes", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    await svc.createCreditNote(
      {
        institutionId: INST,
        invoiceId: invoice.id,
        kind: "credit_note",
        amount: "600.00",
        reason: "First write-off",
      },
      ACTOR,
    );
    // Only 400 of the charges remain uncovered, so a second 500 note over-credits the student.
    await expectFieldError(
      svc.createCreditNote(
        {
          institutionId: INST,
          invoiceId: invoice.id,
          kind: "credit_note",
          amount: "500.00",
          reason: "Second write-off",
        },
        ACTOR,
      ),
      "amount",
    );
  });

  it("lists a credit note as its own ledger row", async () => {
    const invoice = store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
    });
    await svc.createCreditNote(
      {
        institutionId: INST,
        invoiceId: invoice.id,
        kind: "credit_note",
        amount: "250.00",
        reason: "Charged in error",
      },
      ACTOR,
    );
    const rows = await svc.listInvoices({ institutionId: INST });
    expect(rows.filter((row) => row.kind === "credit_note")).toHaveLength(1);
  });

  it("refuses a non-credit-note adjustment under this command", async () => {
    const invoice = store.seedInvoice({ institutionId: INST, studentId: SID });
    await expect(
      svc.createCreditNote(
        {
          institutionId: INST,
          invoiceId: invoice.id,
          kind: "deferral_adjustment",
          amount: "10.00",
          reason: "Wrong kind",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("turns a ghost invoice into a NotFoundError", async () => {
    await expect(
      svc.createCreditNote(
        {
          institutionId: INST,
          invoiceId: GHOST,
          kind: "credit_note",
          amount: "10.00",
          reason: "Missing invoice",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

describe("fee service — read models", () => {
  it("rolls the dashboard up from invoice and allocation sums", async () => {
    store.seedInvoice({ institutionId: INST, totalAmount: "1000.00", status: "pending" });
    store.seedInvoice({ institutionId: INST, totalAmount: "500.00", status: "overdue" });
    store.seedInvoice({
      institutionId: INST,
      totalAmount: "300.00",
      status: "paid",
      allocatedSum: "300.00",
    });

    const stats = await svc.getDashboardStats({ institutionId: INST });
    expect(stats.currency).toBe("PKR");
    expect(stats.totalInvoiced).toBe("1800.00");
    expect(stats.totalAllocated).toBe("300.00");
    expect(stats.concessionSum).toBe("0.00");
    expect(stats.creditNoteSum).toBe("0.00");
    expect(stats.overdueTotal).toBe("500.00");
    expect(stats.openInvoiceCount).toBe(2);
    expect(stats.overdueInvoiceCount).toBe(1);
  });

  it("reports write-offs apart from the billed total and skips cancelled rows", async () => {
    store.seedInvoice({ institutionId: INST, totalAmount: "1000.00", status: "pending" });
    store.seedInvoice({
      institutionId: INST,
      totalAmount: "400.00",
      status: "partial",
      concessionSum: "150.00",
    });
    store.seedInvoice({ institutionId: INST, totalAmount: "600.00", status: "cancelled" });
    store.seedInvoice({
      institutionId: INST,
      totalAmount: "250.00",
      status: "paid",
      kind: "credit_note",
    });

    const stats = await svc.getDashboardStats({ institutionId: INST });
    // The billed figure counts neither the invoice voided in error nor the correction itself;
    // both write-offs are reported separately so the dashboard can subtract them.
    expect(stats.totalInvoiced).toBe("1400.00");
    expect(stats.concessionSum).toBe("150.00");
    expect(stats.creditNoteSum).toBe("250.00");
    // Neither correction is an open charge, so neither can enter the overdue book.
    expect(stats.openInvoiceCount).toBe(2);
    expect(stats.overdueInvoiceCount).toBe(0);
    expect(stats.overdueTotal).toBe("0.00");
  });

  it("summarises one student's fees with a derived outstanding figure", async () => {
    store.seedStudentForSession(SESSION, { studentId: SID, studentName: "Amina Khan" });
    store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "1000.00",
      allocatedSum: "400.00",
      status: "partial",
    });
    store.seedInvoice({
      institutionId: INST,
      studentId: SID,
      totalAmount: "200.00",
      status: "pending",
    });

    const summary = await svc.listStudentFees({ institutionId: INST, studentId: SID });
    expect(summary.studentName).toBe("Amina Khan");
    expect(summary.totalInvoiced).toBe("1200.00");
    expect(summary.totalAllocated).toBe("400.00");
    expect(summary.outstanding).toBe("800.00");
    expect(summary.openInvoiceCount).toBe(2);
  });

  it("turns a student with no fee records into a NotFoundError", async () => {
    await expect(
      svc.listStudentFees({ institutionId: INST, studentId: GHOST }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
