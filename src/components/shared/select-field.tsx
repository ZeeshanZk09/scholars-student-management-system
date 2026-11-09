/**
 * A labelled Base UI `Select` bound into a native form.
 *
 * `name` goes on the primitive's root, which renders the hidden input that actually submits — so
 * the value reaches the server action through ordinary `FormData`, the same path as every other
 * field, rather than through a React state tree the action never sees.
 *
 * The `items` map is what makes the trigger show **"School"** instead of **"school"**: Base UI
 * renders the raw value otherwise.
 */
import { FormField, fieldAria } from "@/components/shared/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectFieldProps {
  readonly id: string;
  readonly label: string;
  /** Field name submitted to the action. Defaults to {@link id}. */
  readonly name?: string | undefined;
  readonly options: readonly SelectOption[];
  readonly defaultValue?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string | undefined;
}

export function SelectField({
  id,
  label,
  name,
  options,
  defaultValue,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
  className,
}: Readonly<SelectFieldProps>) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label])) as Record<
    string,
    string
  >;

  return (
    <FormField
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <Select
        name={name ?? id}
        items={items}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={error ? true : undefined}
          {...fieldAria(id, { hint, error })}
        >
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
