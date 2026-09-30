/**
 * Boundary validation helpers, per `ARCHITECTURE.md` section 29.
 *
 * Validation exists at four boundaries with four different jobs:
 *
 * ```text
 * UI validation        -> responsiveness only, never authoritative
 * application input    -> authoritative shape/type validation (this module)
 * domain validation    -> invariants and state transitions
 * database constraints -> integrity, last line of defence
 * ```
 *
 * The reusable part is not a schema library — that is Zod's job. It is the bridge from a Zod failure
 * to this application's error model, so a rejected request produces the same `ValidationError` shape
 * everywhere instead of each use case inventing its own.
 */
import { z } from "zod";
import { ValidationError, type FieldErrors } from "../errors";

/**
 * Convert a Zod failure into a `ValidationError` whose `fieldErrors` are keyed by field path.
 *
 * Dotted paths are flattened (`address.city`) so a form can map a message back to its input. Only
 * the first message per field is kept: a user needs to be told what is wrong, not every way it could
 * be wrong.
 */
export function toValidationError(error: z.ZodError, subject = "request"): ValidationError {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : subject;
    (fieldErrors[key] ??= []).push(issue.message);
  }

  for (const key of Object.keys(fieldErrors)) {
    const messages = fieldErrors[key];
    if (messages !== undefined && messages.length > 1) {
      fieldErrors[key] = [messages[0] ?? "Invalid value."];
    }
  }

  return new ValidationError(`Validation failed for ${subject}`, fieldErrors satisfies FieldErrors);
}

export interface ParseResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: ValidationError;
}

/**
 * Parse `input` against `schema`, throwing `ValidationError` on failure.
 *
 * Throwing rather than returning a union is the right default inside the application layer: a
 * use case that ignored the failure would be a type error, not a silent bug. Use `safeParse` at the
 * edge, where a failure is an expected outcome to be reported rather than thrown.
 */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  input: unknown,
  subject = "request",
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw toValidationError(result.error, subject);
  }
  return result.data;
}

/**
 * Parse without throwing.
 *
 * For boundaries where rejection is an expected response — a route handler turning it into a 400,
 * or a form resolving a field-level error state.
 */
export function safeParse<T extends z.ZodType>(
  schema: T,
  input: unknown,
  subject = "request",
): ParseResult<z.infer<T>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: toValidationError(result.error, subject) };
}

/**
 * Query-string values arrive as strings, so an optional number is `""` or `undefined` rather than
 * absent. This reads an optional positive integer page number, defaulting when absent.
 */
export function optionalPositiveInt(
  raw: string | null | undefined,
  fallback: number,
  max = 1000,
): number {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ValidationError(`Invalid page: ${raw}`, {
      page: [`Must be a whole number between 1 and ${max}.`],
    });
  }
  return parsed;
}
