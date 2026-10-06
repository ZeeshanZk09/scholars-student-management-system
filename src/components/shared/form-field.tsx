/**
 * A labelled block for a single form control (`PHASES.md` §13 task 7: the FormField/FormGroup
 * pattern). Server-safe; the actual control is `children`, so this stays agnostic to inputs,
 * selects, file pickers and date fields.
 */
import { Label } from "@/components/ui/label";
import { cn } from "cn";

export interface FormFieldProps {
  readonly label: string;
  /** The `id` of the control that this label points at. Required for a11y. */
  readonly htmlFor: string;
  readonly hint?: string;
  /** A message for failed validation. Rendered as a live region so SR users hear it immediately. */
  readonly error?: string;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: Readonly<FormFieldProps>) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
