/**
 * Loading states (`PHASES.md` §13 task 10). Three compositions cover the shell's needs: a full-page
 * loader for `loading.tsx` segments, a skeleton table for data tables, and a skeleton stat grid
 * for dashboards. All server-safe.
 */
import { SpinnerIcon } from "@/components/ui/icons";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

export function PageLoader({ label = "Loading page" }: Readonly<{ label?: string }>) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-2 py-24 text-center"
    >
      <SpinnerIcon aria-hidden="true" className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export interface TableSkeletonProps {
  readonly rows?: number;
  readonly className?: string;
}

export function TableSkeleton({ rows = 5, className }: Readonly<TableSkeletonProps>) {
  return (
    <div aria-hidden="true" className={cn("overflow-hidden rounded-none border", className)}>
      <div className="grid grid-cols-4 gap-4 border-b bg-muted/25 px-4 py-3">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-12" />
        <Skeleton className="h-3.5 w-20" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid grid-cols-4 gap-4 px-4 py-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface StatGridSkeletonProps {
  readonly count?: number;
  readonly className?: string;
}

export function StatGridSkeleton({ count = 4, className }: Readonly<StatGridSkeletonProps>) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="rounded-none shadow-none">
          <CardContent className="grid gap-2 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
