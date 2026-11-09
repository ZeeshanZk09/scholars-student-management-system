/**
 * A labelled `<input>` — label, control, hint and error assembled in one place so every form in
 * the app wires them up the same way, including the `aria-describedby` link between them
 * (`WCAG 1.3.1`; a message a screen reader cannot reach is decoration).
 *
 * Deliberately dumb: no state, no validation, no `onChange`. The server action is the source of
 * truth for what is valid (`RULES.md` §19), so this only carries values the action returned.
 */
import { FormField, fieldAria } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  /** Field name sent to the action. Defaults to {@link id}. */
  readonly name?: string | undefined;
  readonly type?:
    "text" | "email" | "password" | "url" | "tel" | "date" | "time" | "number" | "hidden";
  readonly defaultValue?: string | number | undefined;
  readonly placeholder?: string | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly autoComplete?: string | undefined;
  readonly inputMode?: React.ComponentProps<"input">["inputMode"];
  readonly min?: string | number;
  readonly max?: string | number;
  readonly step?: string | number;
  readonly className?: string | undefined;
  /** Render only the control — for values that live inside an already-labelled group. */
  readonly bare?: boolean;
}

export function TextField({
  id,
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
  autoComplete,
  inputMode,
  min,
  max,
  step,
  className,
  bare = false,
}: Readonly<TextFieldProps>) {
  const control = (
    <Input
      id={id}
      name={name ?? id}
      type={type}
      defaultValue={defaultValue}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoComplete={autoComplete}
      inputMode={inputMode}
      min={min}
      max={max}
      step={step}
      aria-invalid={error ? true : undefined}
      {...fieldAria(id, { hint, error })}
    />
  );

  if (bare) {
    return control;
  }

  return (
    <FormField
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {control}
    </FormField>
  );
}

export interface TextareaFieldProps {
  readonly id: string;
  readonly label: string;
  readonly name?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /** Rows before the textarea starts scrolling; descriptions read best around four. */
  readonly rows?: number;
  readonly maxLength?: number;
  readonly className?: string | undefined;
}

/**
 * A labelled `<textarea>` for the optional prose fields (descriptions, notes). Same wiring as
 * {@link TextField}, including the `aria-describedby` link to its hint and error.
 */
export function TextareaField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
  rows = 4,
  maxLength,
  className,
}: Readonly<TextareaFieldProps>) {
  return (
    <FormField
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <Textarea
        id={id}
        name={name ?? id}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        {...fieldAria(id, { hint, error })}
      />
    </FormField>
  );
}
