/**
 * A labelled checkbox bound into a native form.
 *
 * The **`<label>` wraps the control** rather than pointing at it with `htmlFor`: Base UI's checkbox
 * renders a `<span role="checkbox">` with a hidden input beside it, and Base UI itself resolves the
 * association by looking for a parent `label` (`labelable-provider`). Wrapping is the form that
 * satisfies both that lookup and the native "click the label to toggle" behaviour.
 *
 * Base UI submits the hidden input under `name` only while checked — matching native checkboxes —
 * so an unchecked box submits *nothing*, which is exactly what `formData.has(...)` reads
 * (`src/modules/academic/ui/actions.ts`).
 */
import { Checkbox } from "@/components/ui/checkbox";
import { fieldAria } from "@/components/shared/form-field";
import { cn } from "cn";

export interface CheckboxFieldProps {
  readonly id: string;
  readonly label: string;
  readonly name?: string | undefined;
  readonly defaultChecked?: boolean;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string | undefined;
}

export function CheckboxField({
  id,
  label,
  name,
  defaultChecked = false,
  hint,
  error,
  required = false,
  disabled = false,
  className,
}: Readonly<CheckboxFieldProps>) {
  return (
    <label
      htmlFor={id}
      className={cn("flex items-start gap-2 text-xs leading-none select-none", className)}
    >
      <Checkbox
        id={id}
        name={name ?? id}
        defaultChecked={defaultChecked}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className="mt-0.5"
        {...fieldAria(id, { hint, error })}
      />
      <span className="grid gap-1">
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {hint && !error && (
          <span id={`${id}-hint`} className="font-normal text-muted-foreground">
            {hint}
          </span>
        )}
        {error && (
          <span id={`${id}-error`} role="alert" className="font-medium text-destructive">
            {error}
          </span>
        )}
      </span>
    </label>
  );
}
