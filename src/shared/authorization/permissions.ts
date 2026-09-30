/**
 * The set of legal permission keys.
 *
 * ## Why a constant rather than strings
 *
 * `ADR-0001` requires `Permission.key` to be declared in code so that keys are type-checked and
 * referenced by name, never written as free-form strings. A typo in a string literal fails at
 * runtime, as a permission that silently never matches — the operation is then denied to everyone
 * who should have been allowed, with no error anywhere. A key that is not in this list does not
 * compile.
 *
 * The same array is the seed list for the `Permission` table, so the database cannot drift from the
 * code. A role may be granted any of these at runtime (`PRD.md` §5.1); nothing outside this list
 * can exist.
 *
 * ## Provenance
 *
 * Every key traces to a documented capability. The grouped comments cite the source, so a reviewer
 * can check the list against the requirement instead of trusting it:
 *
 * - `PRD.md` §5.1 Super Administrator — institution configuration and oversight.
 * - `PRD.md` §5.2 Administrator — day-to-day student, section, guardian, attendance and admissions.
 * - `PRD.md` §5.3 Receptionist / Admission Staff — admissions and contact details.
 * - `PRD.md` §5.4 Teacher — assigned students, attendance, results.
 * - `PRD.md` §5.5 Accountant — fee records, payments, balances, reports.
 * - `PRD.md` §5.6 Parent / Guardian — reading linked students.
 * - `PRD.md` §5.7 Student — reading their own record.
 * - `RULES.md` §19 — the canonical `students.*`, `attendance.*` and `fees.*` examples.
 *
 * Deliberately absent: a wildcard such as `*` or a `students.view_all`. Both would reintroduce the
 * implicit-scope problem `ADR-0001` exists to remove, and a key that means "everything" cannot be
 * reviewed or revoked in isolation.
 */
export const PERMISSION_KEYS = [
  // PRD 5.1 — Super Administrator.
  "users.view",
  "users.manage",
  "roles.view",
  "roles.manage",
  "academic.manage",
  "settings.manage",
  "audit.view",

  // RULES 19 and PRD 5.2/5.3 — the student record.
  "students.view",
  "students.create",
  "students.update",
  "students.delete",

  // PRD 5.2/5.3 — guardian contact information, distinct from a student's own record.
  "guardians.view",
  "guardians.manage",

  // PRD 5.2/5.3 — admissions.
  "admissions.view",
  "admissions.create",
  "admissions.update",

  // RULES 19 and PRD 5.4 — attendance.
  "attendance.view",
  "attendance.mark",
  "attendance.update",

  // PRD 5.4 — results, and RULES 33 which treats publication as a distinct, auditable act.
  "results.view",
  "results.enter",
  "results.publish",

  // RULES 19 and PRD 5.5 — fees and payments. A refund is separated from recording a payment
  // because it moves money the school did not earn, so it needs its own grant and its own audit.
  "fees.view",
  "fees.record",
  "fees.refund",
  "payments.record",

  // PRD 5.1/5.5 — reporting, scoped to an institution rather than global.
  "reports.view",
] as const;

/** A permission key that the application is allowed to check. */
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Every legal key, for seeding the `Permission` table. */
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_KEYS;

/**
 * Narrow an arbitrary string to a `PermissionKey`.
 *
 * Used when reading from the database, where a key is data rather than a literal and may be a
 * leftover from a removed permission.
 */
export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
