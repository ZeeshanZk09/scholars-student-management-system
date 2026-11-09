/**
 * The fee-structures roster — what the institution charges, before any of it is billed.
 *
 * The list is one `listFeeStructures` read plus one `listAcademicSessions` read, and the session
 * names are only there to label a structure's pin: a structure pinned to a session is the
 * exception (it retires with that session), `null` means it travels with whatever session is
 * current. There is no `frequency` column because frequency belongs to an *item* (`ports.ts`:
 * `FeeStructureItemRow.frequency`), not to the structure — the detail page shows it per line
 * instead of the list inventing a roll-up the domain does not have.
 *
 * "Open" deep-links to `/fees/structures/[structureId]?institution=…` so both halves of the
 * address live in the URL on every page of the flow (`SECURITY.md` §22). Header creation sits
 * behind `fees.manage` and its server action re-checks that key (`ui/actions.ts`), so the gate
 * here is a courtesy rather than the boundary.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { SquaresFourIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAcademicSessions } from "@/modules/academic";
import type { FeeStructureListRow, FeeStructureScope } from "@/modules/fees";
import { listFeeStructures } from "@/modules/fees";
import { hasPermission } from "@/shared/authorization";

import { CreateFeeStructureDialog } from "@/modules/fees/ui/fee-forms";

import { InstitutionPage } from "../../_lib/institution-page";

export default async function FeeStructuresPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="fees.view"
      title="Fee structures"
      description="What the institution charges, and who each structure covers"
      breadcrumb={[
        { label: "Home", href: "/" },
        { label: "Fees", href: "/fees" },
        { label: "Structures" },
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
      actions={(ctx) =>
        ctx.institution === null || !hasPermission(ctx.principal, "fees.manage") ? null : (
          <CreateFeeStructureDialog institutionId={ctx.institution.id} />
        )
      }
      render={async ({ institution, principal }) => {
        const institutionId = institution.id;
        const [structures, sessions] = await Promise.all([
          listFeeStructures({ institutionId }),
          listAcademicSessions(institutionId),
        ]);
        const sessionNames = new Map(sessions.map((session) => [session.id, session.name]));
        const canManage = hasPermission(principal, "fees.manage");

        if (structures.length === 0) {
          return (
            <EmptyState
              icon={SquaresFourIcon}
              title="No fee structures yet"
              description="A structure defines a scope — everyone, one class, one group or one section — and the heads billed to it, with amounts, discounts and instalments. Create the first one, then generate invoices from it."
              action={
                canManage ? <CreateFeeStructureDialog institutionId={institutionId} /> : undefined
              }
            />
          );
        }

        return (
          <div className="overflow-x-auto rounded-none border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Structure</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="hidden sm:table-cell">Session</TableHead>
                  <TableHead className="hidden md:table-cell">Heads</TableHead>
                  <TableHead className="hidden lg:table-cell">Effective</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structures.map((row) => (
                  <StructureRow
                    key={row.id}
                    institutionId={institutionId}
                    row={row}
                    sessionName={
                      row.academicSessionId === null
                        ? "Any session"
                        : (sessionNames.get(row.academicSessionId) ?? "—")
                    }
                  />
                ))}
              </TableBody>
            </Table>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              {structures.length} structure{structures.length === 1 ? "" : "s"} · open one to see
              its fee heads, rates and the sessions it is in force for. Nothing here is billed until
              invoices are generated from it.
            </p>
          </div>
        );
      }}
    />
  );
}

/** Who a structure bills — the same four values the editor offers (`form-options.ts`). */
const SCOPE_LABELS: Record<FeeStructureScope, string> = {
  all: "All students",
  class: "Class",
  group: "Group",
  section: "Section",
};

function StructureRow({
  institutionId,
  row,
  sessionName,
}: Readonly<{
  institutionId: string;
  row: FeeStructureListRow;
  sessionName: string;
}>) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.name}</div>
        {row.description !== null && (
          <div className="max-w-xs truncate text-xs text-muted-foreground">{row.description}</div>
        )}
      </TableCell>
      <TableCell>{SCOPE_LABELS[row.appliesTo]}</TableCell>
      <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
        {sessionName}
      </TableCell>
      <TableCell className="hidden md:table-cell">{row.itemCount}</TableCell>
      <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
        {row.effectiveFrom} → {row.effectiveTo ?? "—"}
      </TableCell>
      <TableCell>
        <StatusBadge tone={row.isActive ? "success" : "neutral"} dot={false}>
          {row.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="xs"
            variant="outline"
            render={
              <Link
                href={`/fees/structures/${row.id}?institution=${encodeURIComponent(institutionId)}`}
              />
            }
          >
            Open
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
