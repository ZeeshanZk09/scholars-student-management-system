/**
 * The predictable page header every major page leads with (`PHASES.md` §13 task 5, `DESIGN.md`
 * §9–§10): breadcrumb, title, one-line description, then primary actions on the right.
 *
 * Server-safe by design — most headers render on the server with no state. For the odd interactive
 * header, compose this with client children (`actions` may be any nodes).
 */
import type { ReactNode } from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbEntry {
  readonly label: string;
  /** Omit for the final (current) crumb. */
  readonly href?: string;
}

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly breadcrumb?: readonly BreadcrumbEntry[];
  readonly actions?: ReactNode;
}

export function PageHeader({ title, description, breadcrumb, actions }: Readonly<PageHeaderProps>) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        {breadcrumb !== undefined && breadcrumb.length > 0 && (
          <Breadcrumb className="mb-1">
            <BreadcrumbList>
              {breadcrumb.map((entry, index) => {
                const isLast = index === breadcrumb.length - 1;
                return (
                  <BreadcrumbItem key={`${entry.label}:${index}`}>
                    {entry.href !== undefined && !isLast ? (
                      <BreadcrumbLink render={<Link href={entry.href} />}>
                        {entry.label}
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{entry.label}</BreadcrumbPage>
                    )}
                    {!isLast && <BreadcrumbSeparator />}
                  </BreadcrumbItem>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
