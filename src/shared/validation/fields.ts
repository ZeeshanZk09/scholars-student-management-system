/**
 * Field primitives shared across every module's boundary schemas.
 *
 * These are deliberately *shape* rules only. Anything that depends on institution policy — what a
 * valid student number looks like, which fee codes exist — belongs to the module that owns it
 * (`RULES.md` section 7.3 restricts `shared/` to genuinely reusable code), not here.
 */
import { z } from "zod";

/** Trimmed, non-empty. The baseline for every text field. */
export const nonEmptyText = (label: string, max = 255) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

/**
 * An email address, normalized to lowercase so uniqueness is case-insensitive.
 *
 * Normalization runs *before* the format check. `z.email()` is a format schema, so it validates whatever
 * it is given at that point in the chain: `z.email().trim()` rejects `" a@b.co "` for the leading space
 * it is supposed to remove. Piping the normalized value into the check is what makes a pasted address
 * with stray whitespace — the common case — validate instead of failing.
 */
export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .max(254, "Email must be at most 254 characters.")
  .pipe(z.email("Enter a valid email address."));

/**
 * A phone number in digits, spaces, `+`, `-` and parentheses.
 *
 * Stored normalized to digits with a leading `+`, so `+92 300 1234567` and `0300-1234567` cannot
 * become two different contacts.
 */
export const phoneNumber = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number.")
  .max(20, "Phone number must be at most 20 characters.")
  .regex(/^\+?[\d\s()-]+$/, "Phone number may only contain digits, spaces and + - ( ).");

/** Reduce a phone number to `+` and digits, or `+` and the last 10 digits when a `0` prefix remains. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!hasPlus && digits.startsWith("0") && digits.length > 10) {
    return `+${digits.slice(-10)}`;
  }
  return hasPlus ? `+${digits}` : digits;
}

/**
 * A date of birth / admission date, as a calendar date.
 *
 * Zoned out of the UTC instant: a student born on the 1st must not shift to the previous day
 * because the server is east of Greenwich.
 */
export const calendarDate = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be in YYYY-MM-DD format.`)
    .refine(
      (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
      `${label} is not a real date.`,
    );

/** A whole number within an inclusive range. */
export const wholeNumber = (label: string, min: number, max: number) =>
  z
    .number()
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`);

/**
 * An amount in decimal text, as produced by `toDecimalText` in `shared/money`.
 *
 * Validated as text rather than a JS number, because a `number` cannot hold every cent — the same
 * reason a `numeric` column is read back as text rather than a JS number.
 */
export const decimalAmount = z
  .string()
  .trim()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "Enter an amount with at most 2 decimal places.");

/** A non-negative decimal amount. */
export const nonNegativeAmount = decimalAmount.refine(
  (value) => !value.startsWith("-"),
  "Amount cannot be negative.",
);

/** An ISO 4217 alphabetic currency code. */
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Enter a 3-letter ISO 4217 currency code, e.g. PKR.");

/** An opaque identifier, e.g. `STU-2026-0001`. */
export const identifier = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(64, `${label} must be at most 64 characters.`)
    .regex(/^[A-Za-z0-9._:-]+$/, `${label} contains unsupported characters.`);

/* -------------------------------------------------------------------------- */
/* Optional form fields                                                       */
/* -------------------------------------------------------------------------- */

/*
 * The next five helpers normalise to `null` — never `undefined` — so a service can pass a value
 * straight to the store without `?? null` at every call site. They started life in
 * `src/modules/academic/application/field-helpers.ts`; they moved here when the student module
 * (Phase 7) became a second consumer, and the header of that file already described them as
 * generic shape rules rather than academic ones.
 */

/** A positive integer, or an empty string meaning "not set". */
export function optionalPositiveIntOrNull(label: string, max = 1_000_000) {
  return z
    .union([z.literal(""), z.string().trim()])
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(
      z.union([z.null(), z.number().int().min(1, `${label} must be a whole number.`).max(max)]),
    );
}

/** An optional UUID reference — a `string | null` either way, never `undefined`. */
export const optionalId = z
  .union([z.string().uuid("Select a valid option."), z.literal(""), z.undefined(), z.null()])
  .optional()
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));

/** A generic optional text field, normalised to `null`. */
const optionalTextHelper = (max: number, message: string) =>
  z
    .union([z.string().trim().max(max, message), z.literal(""), z.undefined(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === "" ? null : value));

/** Optional free text up to `max` characters, or `null`. */
export const optionalText = (max: number) =>
  optionalTextHelper(max, `Must be at most ${max} characters.`);

/** An optional email address, normalised to `null`. */
export const optionalEmail = optionalTextHelper(320, "Email must be at most 320 characters.").pipe(
  z
    .union([z.literal(null), z.string().trim().toLowerCase().pipe(z.email("Enter a valid email."))])
    .transform((value) => value ?? null),
);

/** An optional `YYYY-MM-DD` calendar date, or `null`. */
export const optionalCalendarDate = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
    z.literal(""),
    z.undefined(),
    z.null(),
  ])
  .optional()
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));

/**
 * An optional phone number, normalised to `null`.
 *
 * The same shape rule as {@link phoneNumber}, expressed for the fields a form may leave blank —
 * a student's phone or a guardian's alternate number. `null` (set later) is different from `""`
 * (cleared), which is why this normalises rather than accepting both.
 */
export const optionalPhone = z
  .union([
    z
      .string()
      .trim()
      .min(7, "Enter a valid phone number.")
      .max(20, "Phone number must be at most 20 characters.")
      .regex(/^\+?[\d\s()-]+$/, "Phone number may only contain digits, spaces and + - ( )."),
    z.literal(""),
    z.undefined(),
    z.null(),
  ])
  .optional()
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));
