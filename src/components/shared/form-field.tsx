/**
 * A labelled block for a single form control (`PHASES.md` §13 task 7: the FormField/FormGroup
 * pattern). Server-safe; the actual control is `children`, so this stays agnostic to inputs,
 * selects, file pickers and date fields.
 *
 * The hint and error paragraphs are id'd but *this* component cannot attach them to a control it
 * does not own — so {@link fieldAria} hands the referencing props to whoever renders the control
 * (see `text-field.tsx` / `select-field.tsx`). Without that, the message is only ever seen, never
 * announced.
 */
import { Label } from "@/components/ui/label";
import { cn } from "cn";

export interface FormFieldProps {
  readonly label: string;
  /** The `id` of the control that this label points at. Required for a11y. */
  readonly htmlFor: string;
  readonly hint?: string | undefined;
  /** A message for failed validation. Rendered as a live region so SR users hear it immediately. */
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly className?: string | undefined;
  readonly children: React.ReactNode;
}

/** The ids this field renders, as an `aria-describedby` payload for the control inside it.
 *
 * Mirrors exactly when {@link FormField} mounts each paragraph — hint while there is no error,
 * error in its place — so the reference never points at an id that is not in the DOM.
 */
export function fieldAria(
  htmlFor: string,
  { hint, error }: { hint?: string | undefined; error?: string | undefined },
): { "aria-describedby"?: string } {
  const ids = [error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : ""].filter(
    (id) => id.length > 0,
  );
  return ids.length > 0 ? { "aria-describedby": ids.join(" ") } : {};
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
