/**
 * A dashboard KPI card (`PHASES.md` §13 task 4 support). Server-safe — no interactivity, so it can
 * render straight from a server query. The value is `ReactNode`, so counts, currency strings and
 * even formatted percentages all fit.
 */
import { Card, CardContent } from "@/components/ui/card";
import type { NavIcon } from "@/lib/navigation";
import { cn } from "cn";

export interface StatCardProps {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly hint?: string;
  readonly icon?: NavIcon;
  readonly className?: string;
}

export function StatCard({ label, value, hint, icon: Icon, className }: Readonly<StatCardProps>) {
  return (
    <Card className={cn("rounded-none shadow-none", className)}>
      <CardContent className={cn("grid gap-2 p-4")}>
        <div className="flex items-center gap-2">
          {Icon && (
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-none bg-muted *:size-4 *:text-muted-foreground"
            >
              <Icon />
            </span>
          )}
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </div>
        <p className="font-heading text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
