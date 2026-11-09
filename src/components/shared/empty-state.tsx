/**
 * The shared empty state (`PHASES.md` §13 task 11). One consistent "there is nothing here yet"
 * surface for tables, lists and filtered results — copy guides the user to the action.
 */
import type { NavIcon } from "@/lib/navigation";
import { cn } from "cn";

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: NavIcon;
  /** The primary action (a button or a link) shown under the copy. */
  readonly action?: React.ReactNode;
  readonly className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: Readonly<EmptyStateProps>) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-none border border-dashed bg-muted/25 px-4 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className="mb-1 flex size-10 items-center justify-center rounded-none bg-muted *:size-5 *:text-muted-foreground"
        >
          <Icon />
        </span>
      )}
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="max-w-sm text-xs text-balance text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
