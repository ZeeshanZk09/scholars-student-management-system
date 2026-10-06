"use client";

/**
 * The shared data table (`PHASES.md` §13 task 6). A thin, typed shell over TanStack Table v9
 * (feature slots are registered here once): sorting on headers and a page controls row on every
 * table. `ColumnDef` comes from `@tanstack/react-table`; `EmptyState` and skeletons are composed in
 * so every list in the system renders identically.
 */
import * as React from "react";
import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type CellData,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { TableSkeleton } from "@/components/shared/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "cn";

import type { NavIcon } from "@/lib/navigation";

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

/** Column definition compatible with the table's feature set. */
export type DataTableColumn<TData extends RowData> = ColumnDef<typeof features, TData, CellData>;

export interface DataTableProps<TData extends RowData> {
  readonly columns: readonly DataTableColumn<TData>[];
  readonly data: readonly TData[];
  /** Stable row identity (an id or a composite key), used as the `<tr key>`. */
  readonly rowKey: (row: TData) => string;
  readonly loading?: boolean;
  readonly pageSize?: number;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyIcon?: NavIcon;
  readonly emptyAction?: React.ReactNode;
  readonly className?: string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  rowKey,
  loading = false,
  pageSize = 10,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon,
  emptyAction,
  className,
}: Readonly<DataTableProps<TData>>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize });

  const table = useTable<typeof features, TData>({
    features,
    columns: [...columns],
    data: data as TData[],
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId: (row: TData) => rowKey(row),
  });

  const rows = table.getRowModel().rows;
  const firstRow = pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min((pagination.pageIndex + 1) * pagination.pageSize, table.getRowCount());

  return (
    <div className={cn("overflow-hidden rounded-none border", className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={() => header.column.toggleSorting()}
                        aria-label={sorted ? "Remove sort" : "Sort"}
                        className="inline-flex items-center gap-1.5 font-medium outline-none focus-visible:ring-2"
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? (
                          <CaretUpIcon aria-hidden="true" className="size-3.5" />
                        ) : sorted === "desc" ? (
                          <CaretDownIcon aria-hidden="true" className="size-3.5" />
                        ) : (
                          <CaretUpDownIcon aria-hidden="true" className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <TableSkeleton rows={pageSize} className="border-none" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                <EmptyState
                  title={emptyTitle}
                  {...(emptyDescription !== undefined ? { description: emptyDescription } : {})}
                  {...(emptyIcon !== undefined ? { icon: emptyIcon } : {})}
                  {...(emptyAction !== undefined ? { action: emptyAction } : {})}
                  className="border-none bg-transparent py-14"
                />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {firstRow}–{lastRow} of {table.getRowCount()}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <CaretLeftIcon aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <CaretRightIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
