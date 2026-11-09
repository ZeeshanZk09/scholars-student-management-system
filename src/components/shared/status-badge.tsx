/**
 * A caption badge for domain status values (`PHASES.md` §13 task 6 support: status presentation).
 *
 * Map a module's enum value to a `StatusTone` at the call site (e.g. `active → "success"`,
 * `suspended → "danger"`) and keep this component data-agnostic. Subtle Tailwind status tints —
 * the same family the Phase 4 capability list already used — so the monochrome shell gets legible
 * semantics without new tokens.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const DOT: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground",
};

const TEXT: Record<StatusTone, string> = {
  success: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "",
  info: "text-sky-700 dark:text-sky-400",
  neutral: "",
};

export interface StatusBadgeProps {
  readonly tone?: StatusTone;
  /** Show a leading status dot (default true). Turn off for dense tables. */
  readonly dot?: boolean;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function StatusBadge({
  tone = "neutral",
  dot = true,
  children,
  className,
}: Readonly<StatusBadgeProps>) {
  return (
    <Badge
      variant={tone === "danger" ? "destructive" : "secondary"}
      className={cn(TEXT[tone], className)}
    >
      {dot && (
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      )}
      {children}
    </Badge>
  );
}
