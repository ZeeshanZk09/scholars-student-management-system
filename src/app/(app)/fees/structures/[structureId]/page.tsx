/**
 * One fee structure, in full: the scope it bills, the heads it charges, and the sessions it is
 * actually in force for. Addressed by path (`/fees/structures/[structureId]`) while the tenant
 * still travels as `?institution=`, so the URL names both halves (`SECURITY.md` §22); the frame
 * above resolves the capability and the tenant, and the body only ever asks for *this* structure
 * at *that* tenant.
 *
 * The applied-sessions table is the page's reason to exist beyond the item list. It is built
 * from `resolveAppliedFeeStructures` — the same read generation itself uses — one session at a
 * time, so "in force" means exactly what `generateInvoices` would see (active, and pinned to this
 * session or to none). The roster it returns is the session's *whole* roster, so students are
 * filtered here with the service's own scope rule mirrored verbatim; and its "already invoiced"
 * keys span every structure in the session, so only the keys belonging to *this* structure are
 * counted. Generation stays a button elsewhere — this page reads, it never mints.
 *
 * A structure pinned to one session resolves its class/group/section names from that session's
 * tree; an unpinned one resolves against the current session (the store's `listClassTreeByGroup`
 * resolves "current" for the institution), and a name that is not found reads as "—" rather than
 * a guess. The audit trail (`fee_structure_audit`) rides the same detail read — newest first,
 * capped by the store — and renders as the page's last section (PHASES Phase 9). Its `snapshot`
 * is opaque jsonb written by the store, so `auditSummary` parses defensively and diffs only the
 * top-level *scalar* keys of `{ before, after }`: the trail answers "who changed what, when",
 * not "replay the document", and nested rows (`items`) are skipped rather than guessed at.
 */
import Link from "next/link";

import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ClassNode, SessionRow } from "@/modules/academic";
import { listAcademicSessions, listClassTree, listClassTreeByGroup } from "@/modules/academic";
import type {
  FeeStructureDetailRow,
  FeeStructureItemRow,
  FeeStructureScope,
  StructureAuditAction,
  StructureAuditRow,
} from "@/modules/fees";
import { getFeeStructure, resolveAppliedFeeStructures } from "@/modules/fees";
import { FEE_FREQUENCY_LABELS, structureAppliesToStudent } from "@/modules/fees/domain/fee-rules";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { hasPermission } from "@/shared/authorization";

import { EditFeeStructureDialog } from "@/modules/fees/ui/fee-forms";

import { InstitutionPage } from "../../../_lib/institution-page";

export default async function FeeStructureDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ structureId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { structureId } = await params;

  return (
    <InstitutionPage
      permission="fees.view"
      title="Fee structure"
      description="Scope, fee heads and the sessions this structure applies to"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Fees", href: "/fees" },
        { label: "Structures", href: "/fees/structures" },
        { label: "Structure" },
      ]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view fee structures."
      empty={{
        chooseInstitution:
          "You have access to more than one. Pick one in the selector above to see its fee structures.",
        noInstitution:
          "Fee structures belong to an institution. Add one before defining what it charges.",
        noMembership:
          "You are not a member of any institution yet. Ask an administrator to add you to one.",
      }}
      render={async ({ institution, principal }) => {
        const institutionId = institution.id;
        let structure: FeeStructureDetailRow;
        try {
          structure = await getFeeStructure({ institutionId, structureId });
        } catch (error) {
          // A path segment that is not a uuid fails the boundary schema before any row is read:
          // an address that can never name a row answers like a missing structure rather than
          // handing the error boundary a form-shaped validation error. Anything else still throws.
          const badAddress =
            error instanceof ValidationError && error.fieldErrors.structureId !== undefined;
          if (error instanceof NotFoundError || badAddress) {
            return (
              <ErrorState
                title="Fee structure not found"
                description="That fee structure no longer exists at this institution. Pick one from the list instead."
              />
            );
          }
          throw error;
        }

        const [sessions, tree] = await Promise.all([
          listAcademicSessions(institutionId),
          structure.academicSessionId !== null
            ? listClassTree(institutionId, structure.academicSessionId)
            : listClassTreeByGroup(institutionId),
        ]);
        const sessionNames = new Map(sessions.map((session) => [session.id, session.name]));
        const canManage = hasPermission(principal, "fees.manage");

        const targetSessions =
          structure.academicSessionId !== null
            ? sessions.filter((session) => session.id === structure.academicSessionId)
            : sessions;
        const applied = structure.isActive
          ? await Promise.all(
              targetSessions.map(async (session) => {
                const result = await resolveAppliedFeeStructures(
                  institutionId,
                  session.id,
                  structure.id,
                );
                const invoicedStudents = new Set(
                  result.existingInvoiceKeys
                    .filter((key) => key.feeStructureId === structure.id)
                    .map((key) => key.studentId),
                );
                return {
                  session,
                  inForce: result.structures.some((row) => row.id === structure.id),
                  // The scope rule comes from the domain, the same one generation applies — this
                  // page used to keep its own copy of it, which is how two versions of one rule
                  // came to exist at all.
                  inScope: result.students.filter((student) =>
                    structureAppliesToStudent(structure, student),
                  ).length,
                  invoiced: invoicedStudents.size,
                };
              }),
            )
          : [];

        const items = [...structure.items].sort((left, right) => left.sortOrder - right.sortOrder);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  render={
                    <Link
                      href={`/fees/structures?institution=${encodeURIComponent(institutionId)}`}
                    />
                  }
                >
                  ← All structures
                </Button>
                <h1 className="text-xl font-semibold">{structure.name}</h1>
                <StatusBadge tone={structure.isActive ? "success" : "neutral"} dot={false}>
                  {structure.isActive ? "Active" : "Inactive"}
                </StatusBadge>
                <span className="text-xs text-muted-foreground">{structure.currency}</span>
              </div>
              {canManage && (
                <EditFeeStructureDialog institutionId={institutionId} structure={structure} />
              )}
            </div>

            <Section title="Overview" description="Who this structure bills, and while.">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Covers" value={coversText(structure, tree)} />
                <Field
                  label="Session"
                  value={
                    structure.academicSessionId === null
                      ? "Any session — travels with the current one"
                      : (sessionNames.get(structure.academicSessionId) ?? null)
                  }
                />
                <Field label="Currency" value={structure.currency} />
                <Field label="Effective from" value={structure.effectiveFrom} />
                <Field label="Effective to" value={structure.effectiveTo} />
                <Field label="Description" value={structure.description} />
                <Field
                  label="Last updated"
                  value={structure.updatedAt.toISOString().slice(0, 10)}
                />
              </dl>
            </Section>

            <Section
              title="Fee heads"
              description={`${items.length} head${items.length === 1 ? "" : "s"} billed to everyone in scope.`}
            >
              <ItemsView items={items} currency={structure.currency} />
            </Section>

            <Section
              title="Applied sessions"
              description="Where generation would pick this structure up, and who it has already billed."
            >
              <AppliedView isActive={structure.isActive} rows={applied} />
            </Section>

            <Section
              title="Audit trail"
              description="Every recorded change to this structure, newest first — who made it, when, and what moved."
            >
              <AuditView rows={structure.audit} />
            </Section>
          </div>
        );
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Section / field helpers                                                    */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description?: string | undefined;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-none border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description !== undefined && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: Readonly<{ label: string; value: string | null; mono?: boolean | undefined }>) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>
        {value === null || value.length === 0 ? "—" : value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Domain presentation                                                        */
/* -------------------------------------------------------------------------- */

/** The same four values the editor offers (`FeeStructureScope`). */
const SCOPE_LABELS: Record<FeeStructureScope, string> = {
  all: "All students",
  class: "Class",
  group: "Group",
  section: "Section",
};

/** `bank_transfer`-style keys → words, for the category column (no label map exists). */
function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}

/**
 * The structure's scope as one readable line: "All students", "Class 8", or the class · group ·
 * section chain. Missing ids resolve to "—" — a scope pointing at a deleted node shows the gap
 * rather than inventing a name.
 */
function coversText(structure: FeeStructureDetailRow, tree: readonly ClassNode[]): string {
  if (structure.appliesTo === "all") return SCOPE_LABELS.all;

  const classNode =
    structure.classId === null ? undefined : tree.find((node) => node.id === structure.classId);
  const groupNode = classNode?.groups.find((node) => node.id === structure.groupId);
  const sectionNode = groupNode?.sections.find((node) => node.id === structure.sectionId);

  const chain: string[] = [classNode?.name ?? "—"];
  if (structure.appliesTo === "group" || structure.appliesTo === "section") {
    chain.push(groupNode?.name ?? "—");
  }
  if (structure.appliesTo === "section") {
    chain.push(sectionNode?.name ?? "—");
  }
  return chain.join(" · ");
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

function ItemsView({
  items,
  currency,
}: Readonly<{
  items: readonly FeeStructureItemRow[];
  currency: string;
}>) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No fee heads yet — a structure with nothing to bill generates nothing.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fee head</TableHead>
            <TableHead className="hidden sm:table-cell">Frequency</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="hidden md:table-cell">Discount</TableHead>
            <TableHead className="hidden lg:table-cell">Override</TableHead>
            <TableHead className="hidden md:table-cell">Instalments</TableHead>
            <TableHead className="hidden sm:table-cell">Mandatory</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">{humanize(item.category)}</div>
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                {FEE_FREQUENCY_LABELS[item.frequency]}
              </TableCell>
              <TableCell className="whitespace-nowrap">{money(currency, item.amount)}</TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                {item.discountAmount === null ? "—" : money(currency, item.discountAmount)}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                {item.overrideAmount === null ? "—" : money(currency, item.overrideAmount)}
              </TableCell>
              <TableCell className="hidden md:table-cell">{item.installmentCount ?? "—"}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {item.isMandatory ? "Yes" : "Optional"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface AppliedRow {
  readonly session: SessionRow;
  readonly inForce: boolean;
  readonly inScope: number;
  readonly invoiced: number;
}

function AppliedView({
  isActive,
  rows,
}: Readonly<{
  isActive: boolean;
  rows: readonly AppliedRow[];
}>) {
  if (!isActive) {
    return (
      <p className="text-sm text-muted-foreground">
        This structure is inactive, so it is in force for no session and generation skips it.
        Activate it (Edit) to bring it back into scope.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No academic sessions yet — a structure needs a session roster before it can be in force
        anywhere.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session</TableHead>
            <TableHead>In force</TableHead>
            <TableHead>Students in scope</TableHead>
            <TableHead>Already invoiced</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.session.id}>
              <TableCell className="font-medium">
                {row.session.name}
                {row.session.isCurrent && (
                  <span className="ml-2 text-xs text-muted-foreground">current</span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge tone={row.inForce ? "success" : "neutral"} dot={false}>
                  {row.inForce ? "Yes" : "No"}
                </StatusBadge>
              </TableCell>
              <TableCell>{row.inScope}</TableCell>
              <TableCell>{row.invoiced}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        Students in scope counts the enrolled students whose placement this structure covers;
        already invoiced counts distinct students in that session that already carry an invoice for
        this structure — generation skips those pairs and bills the rest.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Audit trail                                                                */
/* -------------------------------------------------------------------------- */

/** The four values the DDL check allows `fee_structure_audit.action` to carry. */
const AUDIT_ACTION_LABELS: Record<StructureAuditAction, string> = {
  created: "Created",
  updated: "Updated",
  deactivated: "Deactivated",
  effective_window_changed: "Effective window changed",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function scalarText(value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (value === "") return '""';
  return String(value);
}

/** `effectiveFrom` → "Effective from": camelCase keys through the page's humanizer. */
function fieldLabel(key: string): string {
  return humanize(key.replace(/\B([A-Z])/g, "_$1").toLowerCase());
}

/**
 * The snapshot is `{ before, after }` exactly as the store writes it, but jsonb types nothing on
 * the way back — so parse defensively: walk only the keys `after` carries, and only where *both*
 * sides are scalars. Nested rows (`items`) and column internals that exist on one side only
 * (`createdAt` is never written back) are skipped rather than guessed at, and a null `before`
 * (creation) prints each new scalar on its own. The cell truncates; the trail says who changed
 * what and when, it does not replay the document.
 */
function auditSummary(snapshot: Record<string, unknown>): string {
  const before = isRecord(snapshot.before) ? snapshot.before : null;
  const after = isRecord(snapshot.after) ? snapshot.after : null;
  if (after === null) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (!isScalar(value)) continue;
    if (before === null || !(key in before)) {
      if (value === null) continue;
      parts.push(`${fieldLabel(key)}: ${scalarText(value)}`);
      continue;
    }
    const previous = before[key];
    if (!isScalar(previous) || Object.is(previous, value)) continue;
    parts.push(`${fieldLabel(key)}: ${scalarText(previous)} → ${scalarText(value)}`);
  }
  return parts.join(" · ");
}

function AuditView({ rows }: Readonly<{ rows: readonly StructureAuditRow[] }>) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No changes recorded yet — every create and edit of this structure lands here with the user
        who made it.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-none border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>By</TableHead>
            <TableHead className="hidden md:table-cell">Change</TableHead>
            <TableHead className="hidden lg:table-cell">Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap font-mono text-xs">
                {row.changedAt.toISOString().replace("T", " ").slice(0, 16)}
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium">
                {AUDIT_ACTION_LABELS[row.action]}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {row.changedByName ?? "—"}
              </TableCell>
              <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">
                {auditSummary(row.snapshot) || "—"}
              </TableCell>
              <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell">
                {row.reason ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        The change column compares the top-level scalar fields of the recorded before/after
        snapshot; nested rows inside the snapshot (the fee-head lines) are deliberately left out
        rather than rendered from an untyped shape.
      </p>
    </div>
  );
}
