/**
 * The Drizzle implementation of {@link FeeStore} — the only file in the fee module that imports
 * `@/db/client` or the table objects (`src/modules/README.md`: ports in, Drizzle out). Its four
 * responsibilities mirror the admission store's (`RULES.md` §15: the database is the source of
 * truth for integrity):
 *
 * 1. **Tenant guards.** Every read and write carries `institution_id` in its own WHERE clause.
 *    Where the payload has no institution (a deferral request names only its invoice, and a
 *    percentage concession borrows its target's currency the same way), the invoice or structure
 *    was already tenant-verified by the service and the foreign key proves the row exists;
 *    student-scoped reads additionally join through `students.institution_id`.
 * 2. **Insert-only generation** (`RULES.md` §36, the Critical Rule). `generateInvoices` mints
 *    numbers and inserts invoices plus their frozen lines inside one transaction; it never
 *    updates an existing invoice or line — the service's pre/post snapshots
 *    (`assertIssuedInvoiceUntouched`) would surface any such rewrite as an `InternalError`.
 *    Dedupe against already-invoiced (student, structure) pairs happens in
 *    `resolveAppliedStructures`; the `fee_invoices_number_key` unique index is the race backstop.
 * 3. **Idempotent write-on-read overdue refresh** (PRD MODULE 6 automation "identify delayed
 *    payments"). `listInvoices` and `getDashboardStats` first run one deterministic UPDATE:
 *    `pending`/`partial` invoices past `due_on` become `overdue`, excluding any invoice under a
 *    live deferral (`deferred_until >= today`, or an approved `fee_deferrals` row whose
 *    `requested_until` is still ahead). A deferral wins over the date; the transition is
 *    repeated every read, so a scheduled job is optional rather than load-bearing. It touches
 *    `status`/`updated_at` only — never `total_amount` (ADR-0003: the billed total is a frozen
 *    fact) and never `version`, because an automated flip must not invalidate a user's open edit.
 * 4. **No derived balance is ever stored** (ADR-0003). Outstanding figures are `SUM()`s over
 *    `payment_allocations` computed here at read time; `recordPayment` updates the affected
 *    invoices' *status* (pending → partial → paid) but never their totals or lines.
 *
 * Unique conflicts arrive as PostgreSQL `23505` (an invoice or payment number minted twice under
 * a race the pre-read lost) and are translated to `ConflictError`; version-guarded writes that
 * touch no row are the same conflict. Everything else propagates.
 */
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import type { DbLike } from "@/db/client";
import { postFeeCollectionWithin } from "@/modules/finance";
import {
  feeConcessions,
  feeDeferrals,
  feeInvoices,
  feeInvoiceLines,
  feeStructureAudit,
  feeStructures,
  feeStructureItems,
  paymentAllocations,
  payments,
  receipts,
  sections,
  studentEnrollments,
  studentPlacements,
  students,
  users,
} from "@/db/schema";
import {
  BusinessRuleError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import {
  add,
  compare,
  fromDecimalText,
  isZero,
  subtract,
  toDecimalText,
  zero,
} from "@/shared/money";

import {
  assertAllocationWithinPayment,
  calendarDateString,
  invoiceBalance,
  type FeeCategory,
} from "../domain/fee-rules";
import type {
  ApplicableStudent,
  AppliedStructuresResult,
  ConcessionWrite,
  CreditNoteWrite,
  DashboardStatsRow,
  DeferralDecision,
  DeferralWrite,
  FeeStructureDetailRow,
  FeeStructureItemRow,
  FeeStructureListRow,
  FeeStructureScope,
  FeeStructureUpdate,
  FeeStore,
  InvoiceAllocationRow,
  InvoiceConcessionRow,
  InvoiceDeferralRow,
  InvoiceDetailRow,
  InvoiceListRow,
  RecordPaymentWrite,
  StructureAuditAction,
  StructureAuditRow,
  StudentFeeSummaryRow,
} from "../application/ports";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

/** A `version`-guarded update that touched no row: stale write, or the row is gone. */
async function expectVersionedRow(
  rows: readonly { readonly id: string }[],
  label: string,
): Promise<void> {
  if (rows.length > 0) return;
  throw new ConflictError(`${label} was changed by someone else.`, {
    userMessage: `This ${label.toLowerCase()} was changed by someone else. Refresh the page and try again.`,
  });
}

/** `applies_to` is a varchar in the database; reject anything the domain does not name. */
function toScope(value: string): FeeStructureScope {
  if (value === "all" || value === "class" || value === "group" || value === "section") {
    return value;
  }
  throw new InternalError(`Unknown fee structure scope "${value}".`);
}

/** Same discipline for the free-text category columns: constrained in the domain, not the DDL. */
function toCategory(value: string): FeeCategory {
  switch (value) {
    case "admission":
    case "tuition":
    case "transport":
    case "lab":
    case "library":
    case "exam":
    case "uniform":
    case "other":
      return value;
    default:
      throw new InternalError(`Unknown fee category "${value}".`);
  }
}

function toConcessionKind(value: string): ConcessionWrite["kind"] {
  switch (value) {
    case "discount":
    case "waiver":
    case "scholarship":
    case "sibling_discount":
      return value;
    default:
      throw new InternalError(`Unknown concession kind "${value}".`);
  }
}

/** Same discipline for the free-text action column: constrained by a DDL check, narrowed here. */
function toAuditAction(value: string): StructureAuditAction {
  switch (value) {
    case "created":
    case "updated":
    case "deactivated":
    case "effective_window_changed":
      return value;
    default:
      throw new InternalError(`Unknown fee structure audit action "${value}".`);
  }
}

type StructureRecord = typeof feeStructures.$inferSelect;
type ItemRecord = typeof feeStructureItems.$inferSelect;
type AuditRecord = typeof feeStructureAudit.$inferSelect;
type InvoiceRecord = typeof feeInvoices.$inferSelect;

function toStructureListRow(row: StructureRecord, itemCount: number): FeeStructureListRow {
  return {
    id: row.id,
    institutionId: row.institutionId,
    name: row.name,
    appliesTo: toScope(row.appliesTo),
    classId: row.classId,
    groupId: row.groupId,
    sectionId: row.sectionId,
    academicSessionId: row.academicSessionId,
    currency: row.currency,
    description: row.description,
    isActive: row.isActive,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    itemCount,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

function toStructureItemRow(row: ItemRecord): FeeStructureItemRow {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    discountAmount: row.discountAmount,
    frequency: row.frequency,
    installmentCount: row.installmentCount,
    category: toCategory(row.category),
    overrideAmount: row.overrideAmount,
    isMandatory: row.isMandatory,
    sortOrder: row.sortOrder,
    description: row.description,
  };
}

function toStructureAuditRow(row: AuditRecord, changedByName: string | null): StructureAuditRow {
  return {
    id: row.id,
    action: toAuditAction(row.action),
    changedByUserId: row.changedByUserId,
    changedByName,
    changedAt: row.changedAt,
    reason: row.reason,
    snapshot: row.snapshot,
  };
}

/**
 * A structure row plus its items assembled into the detail shape both readers share. The audit
 * trail is a parameter rather than a lookup because only `getStructure` loads it — the
 * generation read would otherwise buy one query per structure for rows it never displays.
 */
function toStructureDetailRow(
  row: StructureRecord,
  items: readonly ItemRecord[],
  audit: readonly StructureAuditRow[],
): FeeStructureDetailRow {
  return {
    ...toStructureListRow(row, items.length),
    items: items.map(toStructureItemRow),
    audit,
  };
}

type InvoiceJoinRow = {
  readonly invoice: InvoiceRecord;
  readonly studentName: string | null;
  readonly allocatedSum: string;
  readonly concessionSum: string;
  readonly feeStructureId: string | null;
};

function toInvoiceListRow(row: InvoiceJoinRow): InvoiceListRow {
  return {
    id: row.invoice.id,
    institutionId: row.invoice.institutionId,
    academicSessionId: row.invoice.academicSessionId,
    studentId: row.invoice.studentId,
    studentName: row.studentName,
    invoiceNumber: row.invoice.invoiceNumber,
    feeStructureId: row.feeStructureId,
    totalAmount: row.invoice.totalAmount,
    allocatedSum: row.allocatedSum,
    concessionSum: row.concessionSum,
    currency: row.invoice.currency,
    status: row.invoice.status,
    kind: row.invoice.kind,
    issuedOn: row.invoice.issuedOn,
    dueOn: row.invoice.dueOn,
    deferredUntil: row.invoice.deferredUntil,
  };
}

/** The store-computed allocation sum — never a stored balance (ADR-0003). */
const allocatedSumSql = sql<string>`coalesce(
  (select sum(pa.allocated_amount) from payment_allocations pa where pa.invoice_id = ${feeInvoices.id}),
  '0.00'
)`;

/** The store-computed sum of live (non-revoked) concessions — the other subtraction. */
const concessionSumSql = sql<string>`coalesce(
  (select sum(fc.amount) from fee_concessions fc
   where fc.invoice_id = ${feeInvoices.id} and fc.revoked_at is null),
  '0.00'
)`;

/** The structure a set of invoice lines was generated from, derived through the item link. */
const derivedStructureIdSql = sql<string | null>`(
  select (array_agg(fsi.fee_structure_id))[1]
  from fee_invoice_lines fil
  inner join fee_structure_items fsi on fsi.id = fil.fee_structure_item_id
  where fil.invoice_id = ${feeInvoices.id}
)`;

const studentNameSql = sql<string>`btrim(concat_ws(' ', ${students.firstName}, ${students.lastName}))`;

/** `INV-0001` / `PAY-0001` / `RCP-0001`: the next free suffix for a human-facing number series. */
async function nextNumberSequence(
  executor: DbLike,
  table: typeof feeInvoices | typeof payments | typeof receipts,
  numberColumn:
    | typeof feeInvoices.invoiceNumber
    | typeof payments.paymentNumber
    | typeof receipts.receiptNumber,
  scope: SQL | undefined,
): Promise<number> {
  const rows = await executor
    .select({
      next: sql<number>`coalesce(
        max(cast(nullif(regexp_substr(${numberColumn}, '[0-9]+$'), '') as integer)),
        0
      ) + 1`,
    })
    .from(table)
    .where(scope);
  const row = rows[0];
  return row === undefined ? 1 : row.next;
}

const formatNumber = (prefix: string, sequence: number): string =>
  `${prefix}-${String(sequence).padStart(4, "0")}`;

/**
 * The stored overdue transition, run before every list and dashboard read. Excludes invoices
 * under a live deferral — a deferral is a decision, not a date comparison, so both the invoice's
 * `deferred_until` and any approved `fee_deferrals` row suspend the flip (`isEligibleForOverdue`).
 */
async function refreshOverdue(executor: DbLike, institutionId: string): Promise<void> {
  // Step 1: an invoice whose deferral window has expired falls back to the un-deferred state.
  // It is NOT marked `overdue` here even when its due date is past — step 2 catches it in the
  // same refresh, which keeps the overdue rule in one place. `deferred_until` is cleared so the
  // `fee_invoices_deferral_pair` check still holds once the status leaves `deferred`.
  await executor
    .update(feeInvoices)
    .set({ status: "pending", deferredUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(feeInvoices.institutionId, institutionId),
        eq(feeInvoices.status, "deferred"),
        sql`(${feeInvoices.deferredUntil} is null or ${feeInvoices.deferredUntil} < CURRENT_DATE)`,
        sql`not exists (
          select 1 from fee_deferrals d
          where d.invoice_id = ${feeInvoices.id}
            and d.is_approved = true
            and d.requested_until >= CURRENT_DATE
        )`,
      ),
    );
  // Step 2: pending/partial invoices past `due_on` become overdue. A live deferral suspends the
  // flip no matter how far past due the invoice is — a deferral is a decision, not a date
  // comparison. Written as a second statement rather than one CASE because an all-literal CASE
  // resolves to `text` and can fail the implicit cast back to the status enum.
  await executor
    .update(feeInvoices)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(feeInvoices.institutionId, institutionId),
        inArray(feeInvoices.status, ["pending", "partial"]),
        sql`${feeInvoices.dueOn} < CURRENT_DATE`,
        sql`(${feeInvoices.deferredUntil} is null or ${feeInvoices.deferredUntil} < CURRENT_DATE)`,
        sql`not exists (
          select 1 from fee_deferrals d
          where d.invoice_id = ${feeInvoices.id}
            and d.is_approved = true
            and d.requested_until >= CURRENT_DATE
        )`,
      ),
    );
}

/**
 * Build a store over any {@link DbLike} — the pooled client for ambient work, or a transaction
 * for work that must share one. Every multi-table command opens its own transaction; the module
 * barrel wires the ambient instance.
 */
export function createFeeStore(executor: DbLike): FeeStore {
  return {
    /* ---- Fee structures ---------------------------------------------------- */

    async listStructures(institutionId, isActive = null) {
      // Items via a LEFT JOIN — never a scalar subquery. Interpolating a column reference inside
      // correlated-subquery brackets makes Drizzle render it bare (`"id"`), which then silently
      // compares an item's `fee_structure_id` to its own `id`: an always-false predicate that
      // reads 0 for every structure and never errors (the item table has an `id` column to
      // resolve against). A join centres the outer query, so the column renders qualified.
      const rows = await executor
        .select({
          structure: feeStructures,
          itemCount: sql<number>`count(${feeStructureItems.id})::int`,
        })
        .from(feeStructures)
        .leftJoin(feeStructureItems, eq(feeStructureItems.feeStructureId, feeStructures.id))
        .where(
          and(
            eq(feeStructures.institutionId, institutionId),
            isActive == null ? sql`true` : eq(feeStructures.isActive, isActive),
          ),
        )
        .groupBy(feeStructures.id)
        .orderBy(asc(feeStructures.name));
      return rows.map((row) => toStructureListRow(row.structure, row.itemCount));
    },

    async getStructure(institutionId, structureId) {
      const rows = await executor
        .select()
        .from(feeStructures)
        .where(
          and(eq(feeStructures.id, structureId), eq(feeStructures.institutionId, institutionId)),
        )
        .limit(1);
      const structure = rows[0];
      if (structure === undefined) return null;
      const [items, auditRows] = await Promise.all([
        executor
          .select()
          .from(feeStructureItems)
          .where(eq(feeStructureItems.feeStructureId, structureId))
          .orderBy(asc(feeStructureItems.sortOrder)),
        // The structure above was read under the tenant guard, so keying the trail by its id
        // inherits that guard — the same child-read pattern as `getInvoice`'s lines. The left
        // join to `users` is not an FK (the table stores a plain uuid): a deleted account must
        // not delete the rows it wrote, so the name degrades to null instead.
        executor
          .select({ audit: feeStructureAudit, changedByName: users.name })
          .from(feeStructureAudit)
          .leftJoin(users, eq(users.id, feeStructureAudit.changedByUserId))
          .where(eq(feeStructureAudit.feeStructureId, structureId))
          .orderBy(desc(feeStructureAudit.changedAt))
          .limit(50),
      ]);
      return toStructureDetailRow(
        structure,
        items,
        auditRows.map((row) => toStructureAuditRow(row.audit, row.changedByName)),
      );
    },

    async createStructure(values, actorUserId) {
      try {
        return await executor.transaction(async (tx) => {
          const inserted = await tx
            .insert(feeStructures)
            .values({
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
            })
            .returning({ id: feeStructures.id, version: feeStructures.version });
          const structure = inserted[0];
          if (structure === undefined) {
            throw new InternalError("fee_structures insert returned no row");
          }
          if (values.items.length > 0) {
            await tx.insert(feeStructureItems).values(
              values.items.map((item) => ({
                feeStructureId: structure.id,
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
            );
          }
          await tx.insert(feeStructureAudit).values({
            feeStructureId: structure.id,
            action: "created",
            snapshot: {
              before: null,
              after: { ...values, id: structure.id, version: structure.version },
            },
            changedByUserId: actorUserId,
          });
          return structure;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A fee structure with this identity already exists.", {
            userMessage: "That fee structure was created by someone else. Refresh and try again.",
          });
        }
        throw error;
      }
    },

    async updateStructure(values: FeeStructureUpdate, actorUserId) {
      try {
        return await executor.transaction(async (tx) => {
          const currentRows = await tx
            .select()
            .from(feeStructures)
            .where(
              and(
                eq(feeStructures.id, values.id),
                eq(feeStructures.institutionId, values.institutionId),
              ),
            )
            .limit(1);
          const current = currentRows[0];
          if (current === undefined) {
            throw new NotFoundError("Fee structure does not exist.");
          }
          const beforeItems = await tx
            .select()
            .from(feeStructureItems)
            .where(eq(feeStructureItems.feeStructureId, values.id))
            .orderBy(asc(feeStructureItems.sortOrder));

          const updated = await tx
            .update(feeStructures)
            .set({
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
              updatedAt: new Date(),
              version: sql`${feeStructures.version} + 1`,
            })
            .where(
              and(
                eq(feeStructures.id, values.id),
                eq(feeStructures.institutionId, values.institutionId),
                eq(feeStructures.version, values.expectedVersion),
              ),
            )
            .returning({ id: feeStructures.id, version: feeStructures.version });
          await expectVersionedRow(updated, "Fee structure");
          const nextVersion = updated[0]?.version;
          if (nextVersion === undefined) {
            throw new InternalError("fee_structures update returned no row");
          }

          // Reconcile the item set by position rather than delete-and-reinsert. An issued
          // `fee_invoice_lines` row keeps a reference to the structure item it was generated
          // from (`onDelete: set null` would silently drop it), and generation's dedupe
          // (`resolveAppliedStructures`) joins through that same link — so reissuing every item
          // with a fresh id would break "already invoiced" detection and let a re-run bill a
          // student twice. Survivors keep their ids and are updated in place; items beyond the
          // incoming count are removed, and a removal is refused when an issued invoice line
          // still points at the item (the Critical Rule: corrections are credit notes, not
          // catalogue edits that rewrite an issued document's provenance).
          //
          // Matching is positional: `beforeItems` is ordered by `sort_order`, and the incoming
          // array carries the editor's order. Removing a middle row therefore shifts the ids of
          // the rows after it onto the remaining items — a documented limitation of positional
          // reconciliation.
          const survivorCount = Math.min(beforeItems.length, values.items.length);
          for (let index = 0; index < survivorCount; index += 1) {
            const existing = beforeItems[index];
            const incoming = values.items[index];
            if (existing === undefined || incoming === undefined) continue;
            await tx
              .update(feeStructureItems)
              .set({
                name: incoming.name,
                amount: incoming.amount,
                discountAmount: incoming.discountAmount,
                frequency: incoming.frequency,
                installmentCount: incoming.installmentCount,
                category: incoming.category,
                overrideAmount: incoming.overrideAmount,
                isMandatory: incoming.isMandatory,
                sortOrder: incoming.sortOrder,
                description: incoming.description,
              })
              .where(eq(feeStructureItems.id, existing.id));
          }
          if (values.items.length > survivorCount) {
            await tx.insert(feeStructureItems).values(
              values.items.slice(survivorCount).map((item) => ({
                feeStructureId: values.id,
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
            );
          }
          const removedItems = beforeItems.slice(survivorCount);
          if (removedItems.length > 0) {
            const removedIds = removedItems.map((item) => item.id);
            const invoicedRefs = await tx
              .selectDistinct({ feeStructureItemId: feeInvoiceLines.feeStructureItemId })
              .from(feeInvoiceLines)
              .where(inArray(feeInvoiceLines.feeStructureItemId, removedIds));
            if (invoicedRefs.length > 0) {
              throw new ConflictError(
                "This fee item has already been invoiced and cannot be removed.",
                { userMessage: "This item has already been invoiced and cannot be removed." },
              );
            }
            await tx.delete(feeStructureItems).where(inArray(feeStructureItems.id, removedIds));
          }

          const action =
            !values.isActive && current.isActive
              ? "deactivated"
              : values.effectiveFrom !== current.effectiveFrom ||
                  values.effectiveTo !== current.effectiveTo
                ? "effective_window_changed"
                : "updated";
          await tx.insert(feeStructureAudit).values({
            feeStructureId: values.id,
            action,
            snapshot: {
              before: { ...current, items: beforeItems },
              after: { ...values, version: nextVersion },
            },
            changedByUserId: actorUserId,
          });
          return { id: values.id, version: nextVersion };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Fee structure identity conflict.", {
            userMessage: "That fee structure was changed by someone else. Refresh and try again.",
          });
        }
        throw error;
      }
    },

    /* ---- Generation & invoices -------------------------------------------- */

    async resolveAppliedStructures(institutionId, academicSessionId, feeStructureId = null) {
      const structureRows = await executor
        .select()
        .from(feeStructures)
        .where(
          and(
            eq(feeStructures.institutionId, institutionId),
            eq(feeStructures.isActive, true),
            sql`(${feeStructures.academicSessionId} is null or ${feeStructures.academicSessionId} = ${academicSessionId})`,
            feeStructureId == null ? sql`true` : eq(feeStructures.id, feeStructureId),
          ),
        )
        .orderBy(asc(feeStructures.name));

      const structureIds = structureRows.map((row) => row.id);
      const itemRows =
        structureIds.length > 0
          ? await executor
              .select()
              .from(feeStructureItems)
              .where(inArray(feeStructureItems.feeStructureId, structureIds))
              .orderBy(asc(feeStructureItems.sortOrder))
          : [];
      const itemsByStructure = new Map<string, ItemRecord[]>();
      for (const item of itemRows) {
        const list = itemsByStructure.get(item.feeStructureId) ?? [];
        list.push(item);
        itemsByStructure.set(item.feeStructureId, list);
      }
      // The generation read renders scope and counts only, never the trail, so it passes an empty
      // audit collection instead of buying one extra query per structure — `getStructure` above
      // is the sole reader of the trail.
      const structures: FeeStructureDetailRow[] = structureRows.map((row) =>
        toStructureDetailRow(row, itemsByStructure.get(row.id) ?? [], []),
      );

      // Enrollments are the session roster; the placement (and through it, the section's group)
      // supplies the class/group/section a structure's scope matches against.
      const studentRows = await executor
        .select({
          studentId: students.id,
          studentName: studentNameSql,
          classId: studentPlacements.classId,
          groupId: sections.groupId,
          sectionId: studentPlacements.sectionId,
        })
        .from(studentEnrollments)
        .innerJoin(
          students,
          and(
            eq(students.id, studentEnrollments.studentId),
            eq(students.institutionId, studentEnrollments.institutionId),
          ),
        )
        .leftJoin(
          studentPlacements,
          and(
            eq(studentPlacements.studentId, studentEnrollments.studentId),
            eq(studentPlacements.academicSessionId, studentEnrollments.academicSessionId),
          ),
        )
        .leftJoin(sections, eq(sections.id, studentPlacements.sectionId))
        .where(
          and(
            eq(studentEnrollments.institutionId, institutionId),
            eq(studentEnrollments.academicSessionId, academicSessionId),
          ),
        );
      const students_ = studentRows.map((row): ApplicableStudent => ({
        studentId: row.studentId,
        studentName: row.studentName,
        classId: row.classId,
        groupId: row.groupId,
        sectionId: row.sectionId,
      }));

      // A (student, structure) pair is "already invoiced" when any non-cancelled invoice in this
      // session carries a line whose structure item belongs to that structure.
      const keyRows = await executor
        .selectDistinct({
          invoiceId: feeInvoices.id,
          studentId: feeInvoices.studentId,
          feeStructureId: feeStructureItems.feeStructureId,
        })
        .from(feeInvoices)
        .innerJoin(feeInvoiceLines, eq(feeInvoiceLines.invoiceId, feeInvoices.id))
        .innerJoin(feeStructureItems, eq(feeStructureItems.id, feeInvoiceLines.feeStructureItemId))
        .where(
          and(
            eq(feeInvoices.institutionId, institutionId),
            eq(feeInvoices.academicSessionId, academicSessionId),
            sql`${feeInvoices.status} <> 'cancelled'`,
            sql`${feeStructureItems.feeStructureId} is not null`,
          ),
        );
      const existingInvoiceKeys = keyRows.flatMap((row) =>
        row.feeStructureId === null
          ? []
          : [
              {
                invoiceId: row.invoiceId,
                studentId: row.studentId,
                feeStructureId: row.feeStructureId,
              },
            ],
      );

      return {
        structures,
        students: students_,
        existingInvoiceKeys,
      } satisfies AppliedStructuresResult;
    },

    async generateInvoices(values) {
      try {
        return await executor.transaction(async (tx) => {
          // Serialise number minting for this (institution, session) pair. `nextNumberSequence`
          // reads MAX(number)+1 then inserts; two concurrent runs of the same generation would
          // both read the same max and collide on `fee_invoices_number_key`. A transaction-scoped
          // advisory lock (released at commit/rollback) closes that window without a table lock.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${values.institutionId}::text || ':' || ${values.academicSessionId}::text, 0))`,
          );
          const first = await nextNumberSequence(
            tx,
            feeInvoices,
            feeInvoices.invoiceNumber,
            and(
              eq(feeInvoices.institutionId, values.institutionId),
              eq(feeInvoices.academicSessionId, values.academicSessionId),
            ),
          );
          let sequence = first;
          for (const invoice of values.invoices) {
            const inserted = await tx
              .insert(feeInvoices)
              .values({
                institutionId: values.institutionId,
                academicSessionId: values.academicSessionId,
                studentId: invoice.studentId,
                invoiceNumber: formatNumber("INV", sequence),
                totalAmount: invoice.totalAmount,
                currency: invoice.currency,
                status: "pending",
                issuedOn: values.issuedOn,
                dueOn: values.dueOn,
                kind: "regular",
                notes: values.note,
                issuedByUserId: values.issuedByUserId,
              })
              .returning({ id: feeInvoices.id });
            sequence += 1;
            const row = inserted[0];
            if (row === undefined) throw new InternalError("fee_invoices insert returned no row");
            if (invoice.lines.length > 0) {
              await tx.insert(feeInvoiceLines).values(
                invoice.lines.map((line) => ({
                  invoiceId: row.id,
                  feeStructureItemId: line.feeStructureItemId,
                  name: line.name,
                  amount: line.amount,
                  category: line.category,
                })),
              );
            }
          }
          // Insert-only by construction: no UPDATE against fee_invoices or fee_invoice_lines
          // exists on this path — the Critical Rule (`RULES.md` §36).
          return { createdCount: values.invoices.length };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Invoices were already generated for this run.", {
            userMessage:
              "Invoices were already generated for these students. Nothing was changed — refresh and review the list.",
          });
        }
        throw error;
      }
    },

    async listInvoices(institutionId, filters = {}) {
      await refreshOverdue(executor, institutionId);
      const studentId = filters.studentId ?? null;
      const academicSessionId = filters.academicSessionId ?? null;
      const status = filters.status ?? null;
      const conditions = [eq(feeInvoices.institutionId, institutionId)];
      if (studentId !== null) conditions.push(eq(feeInvoices.studentId, studentId));
      if (academicSessionId !== null) {
        conditions.push(eq(feeInvoices.academicSessionId, academicSessionId));
      }
      if (status !== null) conditions.push(eq(feeInvoices.status, status));
      const rows = await executor
        .select({
          invoice: feeInvoices,
          studentName: studentNameSql,
          allocatedSum: allocatedSumSql,
          concessionSum: concessionSumSql,
          feeStructureId: derivedStructureIdSql,
        })
        .from(feeInvoices)
        .leftJoin(students, eq(students.id, feeInvoices.studentId))
        .where(and(...conditions))
        .orderBy(asc(feeInvoices.invoiceNumber));
      return rows.map(toInvoiceListRow);
    },

    async getInvoice(institutionId, invoiceId) {
      const rows = await executor
        .select({
          invoice: feeInvoices,
          studentName: studentNameSql,
          allocatedSum: allocatedSumSql,
          concessionSum: concessionSumSql,
          feeStructureId: derivedStructureIdSql,
        })
        .from(feeInvoices)
        .leftJoin(students, eq(students.id, feeInvoices.studentId))
        .where(and(eq(feeInvoices.id, invoiceId), eq(feeInvoices.institutionId, institutionId)))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      const [lineRows, allocationRows, concessionRows, deferralRows] = await Promise.all([
        executor
          .select({
            id: feeInvoiceLines.id,
            feeStructureItemId: feeInvoiceLines.feeStructureItemId,
            name: feeInvoiceLines.name,
            amount: feeInvoiceLines.amount,
            category: feeInvoiceLines.category,
            isTaxable: feeInvoiceLines.isTaxable,
          })
          .from(feeInvoiceLines)
          .where(eq(feeInvoiceLines.invoiceId, invoiceId))
          .orderBy(asc(feeInvoiceLines.createdAt)),
        executor
          .select({
            paymentId: paymentAllocations.paymentId,
            paymentNumber: payments.paymentNumber,
            allocatedAmount: paymentAllocations.allocatedAmount,
            method: payments.method,
            paymentStatus: payments.status,
            receivedOn: payments.receivedOn,
            referenceNumber: payments.referenceNumber,
          })
          .from(paymentAllocations)
          .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
          .where(eq(paymentAllocations.invoiceId, invoiceId))
          .orderBy(asc(paymentAllocations.allocatedAt)),
        executor
          .select({
            id: feeConcessions.id,
            kind: feeConcessions.kind,
            percentage: feeConcessions.percentage,
            amount: feeConcessions.amount,
            reason: feeConcessions.reason,
            grantedAt: feeConcessions.grantedAt,
          })
          .from(feeConcessions)
          .where(eq(feeConcessions.invoiceId, invoiceId))
          .orderBy(asc(feeConcessions.grantedAt)),
        executor
          .select({
            id: feeDeferrals.id,
            reason: feeDeferrals.reason,
            requestedFrom: feeDeferrals.requestedFrom,
            requestedUntil: feeDeferrals.requestedUntil,
            isApproved: feeDeferrals.isApproved,
            approvedByUserId: feeDeferrals.approvedByUserId,
            decisionNotes: feeDeferrals.decisionNotes,
          })
          .from(feeDeferrals)
          .where(eq(feeDeferrals.invoiceId, invoiceId))
          .orderBy(asc(feeDeferrals.createdAt)),
      ]);

      const base: InvoiceListRow = toInvoiceListRow(row);
      const concessions: InvoiceConcessionRow[] = concessionRows.map((concession) => ({
        ...concession,
        kind: toConcessionKind(concession.kind),
      }));
      const allocations: InvoiceAllocationRow[] = allocationRows;
      const deferrals: InvoiceDeferralRow[] = deferralRows;
      return {
        ...base,
        lines: lineRows,
        allocations,
        concessions,
        deferrals,
        waiverReason: row.invoice.waiverReason,
        notes: row.invoice.notes,
        issuedByUserId: row.invoice.issuedByUserId,
        updatedAt: row.invoice.updatedAt,
        version: row.invoice.version,
      } satisfies InvoiceDetailRow;
    },

    /* ---- Money in --------------------------------------------------------- */

    async recordPayment(values: RecordPaymentWrite, actorUserId: string) {
      try {
        return await executor.transaction(async (tx) => {
          let allocated = zero(values.currency);
          for (const allocation of values.allocations) {
            allocated = add(allocated, fromDecimalText(allocation.amount, values.currency));
          }
          assertAllocationWithinPayment(
            values.amount,
            "0.00",
            toDecimalText(allocated),
            values.currency,
          );

          for (const allocation of values.allocations) {
            const invoiceRows = await tx
              .select({
                id: feeInvoices.id,
                studentId: feeInvoices.studentId,
                currency: feeInvoices.currency,
                status: feeInvoices.status,
                totalAmount: feeInvoices.totalAmount,
                allocatedSum: allocatedSumSql,
                concessionSum: concessionSumSql,
              })
              .from(feeInvoices)
              .where(
                and(
                  eq(feeInvoices.id, allocation.invoiceId),
                  eq(feeInvoices.institutionId, values.institutionId),
                ),
              )
              .limit(1);
            const invoice = invoiceRows[0];
            if (invoice === undefined) throw new NotFoundError("Invoice does not exist.");
            if (invoice.studentId !== values.studentId) {
              throw new BusinessRuleError("Allocation references another student's invoice.", {
                userMessage: "Every allocated invoice must belong to the student paying.",
              });
            }
            if (invoice.currency !== values.currency) {
              throw new BusinessRuleError(
                `Cannot allocate a ${values.currency} payment to a ${invoice.currency} invoice.`,
                {
                  userMessage: `The payment is in ${values.currency} but the invoice is in ${invoice.currency}.`,
                },
              );
            }
            // A settled or cancelled invoice has nothing left to allocate against. `waived` is in
            // this set for the same reason: the institution forgave the balance rather than
            // collecting it, and taking money anyway would be a data-entry error, not a payment.
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
            const requested = fromDecimalText(allocation.amount, invoice.currency);
            if (compare(requested, balance) > 0) {
              throw new ValidationError("Allocation exceeds the invoice's outstanding balance.", {
                allocations: [
                  `Allocation on invoice ${allocation.invoiceId} is ${allocation.amount}, more than the outstanding ${toDecimalText(balance)}.`,
                ],
              });
            }
          }

          const paymentSequence = await nextNumberSequence(
            tx,
            payments,
            payments.paymentNumber,
            eq(payments.institutionId, values.institutionId),
          );
          const paymentNumber = formatNumber("PAY", paymentSequence);
          const overpayment = subtract(fromDecimalText(values.amount, values.currency), allocated);
          const inserted = await tx
            .insert(payments)
            .values({
              institutionId: values.institutionId,
              studentId: values.studentId,
              academicSessionId: values.academicSessionId,
              paymentNumber,
              amount: values.amount,
              currency: values.currency,
              overpaymentAmount: isZero(overpayment) ? null : toDecimalText(overpayment),
              method: values.method,
              status: "completed",
              referenceNumber: values.referenceNumber,
              receivedOn: values.receivedOn,
              receivedByUserId: actorUserId,
              notes: values.notes,
            })
            .returning({ id: payments.id });
          const payment = inserted[0];
          if (payment === undefined) throw new InternalError("payments insert returned no row");

          await tx.insert(paymentAllocations).values(
            values.allocations.map((allocation) => ({
              paymentId: payment.id,
              invoiceId: allocation.invoiceId,
              allocatedAmount: allocation.amount,
              allocatedByUserId: actorUserId,
            })),
          );

          for (const allocation of values.allocations) {
            const [sumRow] = await tx
              .select({
                allocated: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount}), '0.00')`,
              })
              .from(paymentAllocations)
              .where(eq(paymentAllocations.invoiceId, allocation.invoiceId));
            const invoiceRows = await tx
              .select({
                totalAmount: feeInvoices.totalAmount,
                currency: feeInvoices.currency,
                concessionSum: concessionSumSql,
              })
              .from(feeInvoices)
              .where(
                and(
                  eq(feeInvoices.id, allocation.invoiceId),
                  eq(feeInvoices.institutionId, values.institutionId),
                ),
              )
              .limit(1);
            const invoice = invoiceRows[0];
            if (invoice === undefined) throw new NotFoundError("Invoice does not exist.");
            const total = fromDecimalText(invoice.totalAmount, invoice.currency);
            const already = fromDecimalText(sumRow?.allocated ?? "0.00", invoice.currency);
            const concessions = fromDecimalText(invoice.concessionSum, invoice.currency);
            const outstanding = invoiceBalance(total, already, concessions);
            const settled = isZero(outstanding);
            const hasMoney = compare(already, zero(invoice.currency)) > 0;
            if (!settled && !hasMoney) continue;
            // Status only — never `total_amount` and never a `fee_invoice_lines` row. The billed
            // total and its lines are frozen at issue (the Critical Rule); payments settle them,
            // they do not rewrite them.
            await tx
              .update(feeInvoices)
              .set({
                status: settled ? "paid" : "partial",
                updatedAt: new Date(),
                version: sql`${feeInvoices.version} + 1`,
              })
              .where(
                and(
                  eq(feeInvoices.id, allocation.invoiceId),
                  eq(feeInvoices.institutionId, values.institutionId),
                ),
              );
          }

          const receiptSequence = await nextNumberSequence(
            tx,
            receipts,
            receipts.receiptNumber,
            eq(receipts.institutionId, values.institutionId),
          );
          await tx.insert(receipts).values({
            paymentId: payment.id,
            institutionId: values.institutionId,
            receiptNumber: formatNumber("RCP", receiptSequence),
            amount: values.amount,
            currency: values.currency,
            issuedByUserId: actorUserId,
          });

          // One transaction, one truth: the receipt and its ledger journal land together
          // (`RULES.md` §16). `postFeeCollectionWithin` re-creates the finance store over *this*
          // transaction, so a failure anywhere below rolls the payment back too — a receipt
          // that reached the cash box but never reached the ledger is worse than a failed
          // request. It is idempotent on `paymentId`, so a retry cannot double-post the income.
          // The journal attributes the income by fee head when every allocated invoice line
          // shares one category; a mixed basket has no single head to name, so the journal
          // carries no `fee_category` rather than a guess.
          let feeCategory: string | null = null;
          if (values.allocations.length > 0) {
            const categoryRows = await tx
              .selectDistinct({ category: feeInvoiceLines.category })
              .from(feeInvoiceLines)
              .where(
                inArray(
                  feeInvoiceLines.invoiceId,
                  values.allocations.map((allocation) => allocation.invoiceId),
                ),
              );
            const categories = categoryRows.map((row) => row.category);
            feeCategory = categories.length === 1 ? (categories[0] ?? null) : null;
          }
          await postFeeCollectionWithin(
            tx,
            {
              institutionId: values.institutionId,
              paymentId: payment.id,
              amount: values.amount,
              currency: values.currency,
              transactionOn: values.receivedOn,
              method: values.method,
              // The payment form names no cash account yet; resolution goes through
              // `payment_methods.ledgerAccountId` and the method's default inside the store.
              accountId: null,
              feeCategory,
              description: `Fee payment ${paymentNumber}`,
            },
            actorUserId,
          );

          return { paymentId: payment.id };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Payment number is already in use.", {
            userMessage: "This payment collided with another. Refresh and try again.",
          });
        }
        throw error;
      }
    },

    async grantConcession(values: ConcessionWrite, grantedByUserId: string) {
      // `fee_concessions.currency` is NOT NULL (ADR-0003: no money row may lack a currency), but
      // a percentage concession has no amount, so the port sends `currency: null`. The boundary
      // schema guarantees exactly one of invoice/structure is present — borrow that target's
      // currency rather than inventing a default.
      let currency = values.currency;
      if (currency === null && values.invoiceId !== null) {
        const rows = await executor
          .select({ currency: feeInvoices.currency })
          .from(feeInvoices)
          .where(eq(feeInvoices.id, values.invoiceId))
          .limit(1);
        currency = rows[0]?.currency ?? null;
      }
      if (currency === null && values.feeStructureId !== null) {
        const rows = await executor
          .select({ currency: feeStructures.currency })
          .from(feeStructures)
          .where(eq(feeStructures.id, values.feeStructureId))
          .limit(1);
        currency = rows[0]?.currency ?? null;
      }
      if (currency === null) {
        throw new InternalError("Concession target has no currency to record against.");
      }
      const inserted = await executor
        .insert(feeConcessions)
        .values({
          studentId: values.studentId,
          invoiceId: values.invoiceId,
          feeStructureId: values.feeStructureId,
          kind: values.kind,
          percentage: values.percentage,
          amount: values.amount,
          currency,
          reason: values.reason,
          grantedByUserId,
        })
        .returning({ id: feeConcessions.id });
      const row = inserted[0];
      if (row === undefined) throw new InternalError("fee_concessions insert returned no row");
      return { id: row.id };
    },

    async createCreditNote(values: CreditNoteWrite, actorUserId: string) {
      try {
        return await executor.transaction(async (tx) => {
          const originalRows = await tx
            .select({
              id: feeInvoices.id,
              studentId: feeInvoices.studentId,
              academicSessionId: feeInvoices.academicSessionId,
            })
            .from(feeInvoices)
            .where(
              and(
                eq(feeInvoices.id, values.invoiceId),
                eq(feeInvoices.institutionId, values.institutionId),
              ),
            )
            .limit(1);
          const original = originalRows[0];
          if (original === undefined) throw new NotFoundError("Invoice does not exist.");

          const sequence = await nextNumberSequence(
            tx,
            feeInvoices,
            feeInvoices.invoiceNumber,
            and(
              eq(feeInvoices.institutionId, values.institutionId),
              eq(feeInvoices.academicSessionId, original.academicSessionId),
            ),
          );
          const today = calendarDateString(new Date());
          // A credit note is a *new* audited document that offsets a charge; the original
          // invoice's total and lines are never touched (the Critical Rule). Its own
          // `total_amount` is the credit figure (non-negative per `fee_invoices_total_positive`),
          // and `kind = 'credit_note'` is what excludes it from every charge roll-up. The
          // original invoice is referenced in `notes`, the only free-text column on the row.
          const inserted = await tx
            .insert(feeInvoices)
            .values({
              institutionId: values.institutionId,
              academicSessionId: original.academicSessionId,
              studentId: original.studentId,
              invoiceNumber: formatNumber("INV", sequence),
              totalAmount: values.amount,
              currency: values.currency,
              status: "paid",
              issuedOn: today,
              dueOn: null,
              kind: "credit_note",
              notes: `Credit note against invoice ${values.invoiceId}: ${values.reason}`,
              issuedByUserId: actorUserId,
            })
            .returning({ id: feeInvoices.id });
          const note = inserted[0];
          if (note === undefined) throw new InternalError("fee_invoices insert returned no row");

          await tx.insert(feeInvoiceLines).values({
            invoiceId: note.id,
            feeStructureItemId: null,
            name: "Credit note",
            amount: values.amount,
            category: "other",
          });
          return { id: note.id };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Credit note number is already in use.", {
            userMessage: "This credit note collided with another. Refresh and try again.",
          });
        }
        throw error;
      }
    },

    /* ---- Deferrals -------------------------------------------------------- */

    async requestDeferral(values: DeferralWrite) {
      return executor.transaction(async (tx) => {
        const invoiceRows = await tx
          .select({ id: feeInvoices.id, version: feeInvoices.version })
          .from(feeInvoices)
          .where(eq(feeInvoices.id, values.invoiceId))
          .limit(1);
        const invoice = invoiceRows[0];
        if (invoice === undefined) throw new NotFoundError("Invoice does not exist.");

        const approved = values.approvedByUserId != null;
        const inserted = await tx
          .insert(feeDeferrals)
          .values({
            invoiceId: values.invoiceId,
            requestedByUserId: values.requestedByUserId,
            reason: values.reason,
            requestedFrom: values.requestedFrom,
            requestedUntil: values.requestedUntil,
            isApproved: approved,
            approvedByUserId: values.approvedByUserId ?? null,
            approvedAt: approved ? new Date() : null,
            decisionNotes: values.decisionNotes ?? null,
          })
          .returning({ id: feeDeferrals.id });
        const row = inserted[0];
        if (row === undefined) throw new InternalError("fee_deferrals insert returned no row");

        if (approved) {
          // An approval filed with the request suspends collection immediately: the invoice
          // carries the decision's date (`fee_invoices_deferral_pair` requires the pair).
          await tx
            .update(feeInvoices)
            .set({
              status: "deferred",
              deferredUntil: values.requestedUntil,
              updatedAt: new Date(),
              version: sql`${feeInvoices.version} + 1`,
            })
            .where(
              and(eq(feeInvoices.id, values.invoiceId), eq(feeInvoices.version, invoice.version)),
            );
        }
        return { id: row.id };
      });
    },

    async decideDeferral(values: DeferralDecision) {
      // `fee_deferrals` carries no `version` column of its own; the optimistic-concurrency token
      // is the invoice's, which the service read through `getInvoice` before deciding. The whole
      // decision runs in one transaction with the invoice row locked (`FOR UPDATE`) so two
      // approvers cannot both pass the version check and then both mutate the window.
      return await executor.transaction(async (tx) => {
        const invoiceRows = await tx
          .select({
            id: feeInvoices.id,
            version: feeInvoices.version,
            status: feeInvoices.status,
            deferredUntil: feeInvoices.deferredUntil,
            dueOn: feeInvoices.dueOn,
          })
          .from(feeInvoices)
          .where(eq(feeInvoices.id, values.invoiceId))
          .for("update")
          .limit(1);
        const invoice = invoiceRows[0];
        if (invoice === undefined) throw new NotFoundError("Invoice does not exist.");
        if (invoice.version !== values.expectedVersion) {
          throw new ConflictError("This deferral was changed by someone else.", {
            userMessage:
              "This deferral was changed by someone else. Refresh the page and try again.",
          });
        }

        const deferralRows = await tx
          .select({ id: feeDeferrals.id, requestedUntil: feeDeferrals.requestedUntil })
          .from(feeDeferrals)
          .where(
            and(
              eq(feeDeferrals.id, values.deferralId),
              eq(feeDeferrals.invoiceId, values.invoiceId),
            ),
          )
          .for("update")
          .limit(1);
        const deferral = deferralRows[0];
        if (deferral === undefined) throw new NotFoundError("Deferral does not exist.");

        const rows = await tx
          .update(feeDeferrals)
          .set({
            isApproved: values.isApproved,
            approvedByUserId: values.isApproved ? values.approverUserId : null,
            approvedAt: values.isApproved ? values.now : null,
            decisionNotes: values.decisionNotes,
            updatedAt: values.now,
          })
          .where(
            and(
              eq(feeDeferrals.id, values.deferralId),
              eq(feeDeferrals.invoiceId, values.invoiceId),
            ),
          )
          .returning({ id: feeDeferrals.id });
        await expectVersionedRow(rows, "This deferral");

        if (values.isApproved) {
          // Approving re-asserts the window the student was granted, even if the invoice was
          // already deferred by an earlier decision — a reversal back to approve must take
          // effect. The version bump is what invalidates a concurrent decider's token.
          await tx
            .update(feeInvoices)
            .set({
              status: "deferred",
              deferredUntil: deferral.requestedUntil,
              updatedAt: values.now,
              version: sql`${feeInvoices.version} + 1`,
            })
            .where(eq(feeInvoices.id, values.invoiceId));
        } else if (
          invoice.status === "deferred" &&
          invoice.deferredUntil === deferral.requestedUntil
        ) {
          // Rejecting only clears the window if the invoice currently reflects *this* deferral;
          // rejecting a pending request (or one superseded by a later window) must not disturb
          // the invoice. A cleared past-due invoice falls straight back to overdue.
          const overdue = invoice.dueOn !== null && invoice.dueOn < calendarDateString(values.now);
          await tx
            .update(feeInvoices)
            .set({
              status: overdue ? "overdue" : "pending",
              deferredUntil: null,
              updatedAt: values.now,
              version: sql`${feeInvoices.version} + 1`,
            })
            .where(eq(feeInvoices.id, values.invoiceId));
        }
        return { id: values.deferralId };
      });
    },

    /* ---- Read models ------------------------------------------------------ */

    async getDashboardStats(institutionId, academicSessionId = null) {
      await refreshOverdue(executor, institutionId);
      const conditions = [eq(feeInvoices.institutionId, institutionId)];
      if (academicSessionId != null) {
        conditions.push(eq(feeInvoices.academicSessionId, academicSessionId));
      }
      // Credit notes ride this query — they are the only source of `creditNoteSum` — so the old
      // `kind <> 'credit_note'` WHERE clause gives way to per-aggregate conditions, the same shape
      // `listStudentFees` already uses. Every charge figure below therefore states its own kind
      // filter, and only `creditNoteSum` reads the correction rows.
      const rows = await executor
        .select({
          currency: feeInvoices.currency,
          // A cancelled invoice was billed in error; it must not inflate what the institution
          // reported as invoiced. A credit note is a correction of a charge, not a charge. Every
          // other status, including deferred and waived, counts.
          totalInvoiced: sql<string>`coalesce(
            sum(case when ${feeInvoices.kind} <> 'credit_note' and ${feeInvoices.status} <> 'cancelled'
              then ${feeInvoices.totalAmount} else '0.00' end),
            '0.00'
          )`,
          totalAllocated: sql<string>`coalesce(sum(
            case when ${feeInvoices.kind} <> 'credit_note' then ${allocatedSumSql} else '0.00' end
          ), '0.00')`,
          concessionSum: sql<string>`coalesce(sum(
            case when ${feeInvoices.kind} <> 'credit_note' then ${concessionSumSql} else '0.00' end
          ), '0.00')`,
          // The mirror image of the figure above: only correction rows contribute, so the
          // dashboard can subtract them from what was billed without double-counting.
          creditNoteSum: sql<string>`coalesce(sum(
            case when ${feeInvoices.kind} = 'credit_note' then ${feeInvoices.totalAmount} else '0.00' end
          ), '0.00')`,
          overdueTotal: sql<string>`coalesce(
            sum(
              case when ${feeInvoices.kind} <> 'credit_note' and ${feeInvoices.status} = 'overdue'
                then greatest(${feeInvoices.totalAmount} - ${allocatedSumSql} - ${concessionSumSql}, 0)
                else '0.00'
              end
            ),
            '0.00'
          )`,
          openInvoiceCount: sql<number>`count(*) filter (
            where ${feeInvoices.kind} <> 'credit_note'
              and ${feeInvoices.status} in ('pending', 'partial', 'overdue')
          )::int`,
          overdueInvoiceCount: sql<number>`count(*) filter (
            where ${feeInvoices.kind} <> 'credit_note'
              and ${feeInvoices.status} = 'overdue'
          )::int`,
        })
        .from(feeInvoices)
        .where(and(...conditions))
        .groupBy(feeInvoices.currency)
        // One institution transacts in one currency in practice; where a second appears, the
        // largest book wins the headline rather than silently mixing incompatible sums.
        .orderBy(sql`count(*) desc`)
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        return {
          currency: "PKR",
          totalInvoiced: "0.00",
          totalAllocated: "0.00",
          concessionSum: "0.00",
          creditNoteSum: "0.00",
          overdueTotal: "0.00",
          openInvoiceCount: 0,
          overdueInvoiceCount: 0,
        };
      }
      return {
        currency: row.currency,
        totalInvoiced: row.totalInvoiced,
        totalAllocated: row.totalAllocated,
        concessionSum: row.concessionSum,
        creditNoteSum: row.creditNoteSum,
        overdueTotal: row.overdueTotal,
        openInvoiceCount: row.openInvoiceCount,
        overdueInvoiceCount: row.overdueInvoiceCount,
      } satisfies DashboardStatsRow;
    },

    async listStudentFees(institutionId, studentId, academicSessionId = null) {
      await refreshOverdue(executor, institutionId);
      const conditions = [
        eq(feeInvoices.institutionId, institutionId),
        eq(feeInvoices.studentId, studentId),
      ];
      if (academicSessionId != null) {
        conditions.push(eq(feeInvoices.academicSessionId, academicSessionId));
      }
      // Credit notes now appear here too, as their own `kind = 'credit_note'` invoices, so the
      // roll-up can subtract them from what is still collectable. Each aggregate is conditional:
      // charges (and their allocations/concessions) count once, and the credit-note total is its
      // own figure rather than being netted into `totalInvoiced` — the columns stay honest.
      const rows = await executor
        .select({
          currency: feeInvoices.currency,
          studentName: studentNameSql,
          totalInvoiced: sql<string>`coalesce(sum(
            case when ${feeInvoices.kind} <> 'credit_note' and ${feeInvoices.status} <> 'cancelled'
              then ${feeInvoices.totalAmount} else '0.00' end
          ), '0.00')`,
          totalAllocated: sql<string>`coalesce(sum(
            case when ${feeInvoices.kind} <> 'credit_note' then ${allocatedSumSql} else '0.00' end
          ), '0.00')`,
          concessionSum: sql<string>`coalesce(sum(
            case when ${feeInvoices.kind} <> 'credit_note' then ${concessionSumSql} else '0.00' end
          ), '0.00')`,
          creditNoteSum: sql<string>`coalesce(sum(
            case when ${feeInvoices.kind} = 'credit_note' then ${feeInvoices.totalAmount} else '0.00' end
          ), '0.00')`,
          openInvoiceCount: sql<number>`count(*) filter (
            where ${feeInvoices.kind} <> 'credit_note'
              and ${feeInvoices.status} in ('pending', 'partial', 'overdue')
          )::int`,
          overdueInvoiceCount: sql<number>`count(*) filter (
            where ${feeInvoices.status} = 'overdue'
          )::int`,
        })
        .from(feeInvoices)
        .innerJoin(
          students,
          and(eq(students.id, feeInvoices.studentId), eq(students.institutionId, institutionId)),
        )
        .where(and(...conditions))
        .groupBy(feeInvoices.currency, students.id, students.firstName, students.lastName)
        .orderBy(sql`count(*) desc`)
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      const summary: StudentFeeSummaryRow = {
        studentId,
        studentName: row.studentName,
        currency: row.currency,
        totalInvoiced: row.totalInvoiced,
        totalAllocated: row.totalAllocated,
        concessionSum: row.concessionSum,
        creditNoteSum: row.creditNoteSum,
        openInvoiceCount: row.openInvoiceCount,
        overdueInvoiceCount: row.overdueInvoiceCount,
      };
      return summary;
    },

    async sumStudentOutstanding(institutionId, studentId) {
      // What the student still owes on charges they were actually billed: billed total less
      // payments, live concessions, and credit notes already issued. Credit notes are subtracted
      // so the cap on a new note is the *remaining* balance — otherwise a second note could
      // over-credit charges a first note had already offset. Cancelled invoices are ignored.
      const rows = await executor
        .select({
          outstanding: sql<string>`greatest(coalesce(sum(
            case when ${feeInvoices.kind} <> 'credit_note' and ${feeInvoices.status} <> 'cancelled'
              then ${feeInvoices.totalAmount} - ${allocatedSumSql} - ${concessionSumSql}
              else 0 end
          ), 0) - coalesce(sum(
            case when ${feeInvoices.kind} = 'credit_note' then ${feeInvoices.totalAmount} else 0 end
          ), 0), 0)`,
        })
        .from(feeInvoices)
        .where(
          and(eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.studentId, studentId)),
        );
      return rows[0]?.outstanding ?? "0.00";
    },
  };
}

/** The ambient store — the wiring in `index.ts` uses this. */
export const drizzleFeeStore = createFeeStore(db);
