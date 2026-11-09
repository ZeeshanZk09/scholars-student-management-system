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

  // PRD 5.2/5.3 — admissions. Approving (and rejecting/converting) is separated from recording
  // and editing an application: SECURITY.md §14 lists `admissions.approve` as its own key, so a
  // receptionist who files paperwork cannot also decide it.
  "admissions.view",
  "admissions.create",
  "admissions.update",
  "admissions.approve",

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
  // PRD MODULE 6 splits the rest three ways: reading (view), configuring the price list and
  // generating invoices (manage — the automated calculation path), and moving an issued invoice's
  // economics by hand (adjust — concessions, deferrals, corrections; RULES §19 `fee.adjust`).
  // Keeping adjust separate from record means a cashier who takes money cannot silently rewrite
  // what was owed, and RULES §38's "controlled adjustments rather than destructive rewriting"
  // has a key to hang its audit on.
  "fees.view",
  "fees.record",
  "fees.adjust",
  "fees.manage",
  "fees.refund",
  "payments.record",

  // PRD 5.5 / MODULE 7 — the institute-wide ledger. Reading the ledger is deliberately separate
  // from reading fees (`fees.view`): a cashier who reconciles a till does not automatically get
  // the institution's whole income-and-expense picture. `finance.record` books a movement
  // (expense, income), `finance.manage` approves one, and `finance.adjust` corrects posted
  // history — which, per ARCHITECTURE.md §54, is always a *reversal*, never an edit, so the
  // key that can unwind the ledger is its own grant with its own audit.
  "finance.view",
  "finance.record",
  "finance.manage",
  "finance.adjust",

  // PRD MODULE 8 / PHASE 11 — the employee (HR) record. Reading the staff directory
  // (`employees.view`) is deliberately separate from creating or editing one: a floor in-charge
  // needs to see who is on shift without being able to hire. `employees.manage` gates the
  // money-adjacent and structural acts — salary structures, salary assignments and status
  // transitions (resign/terminate/retire) — because those decide what a person is paid and
  // whether they still work here, so they get their own grant with their own audit.
  "employees.view",
  "employees.create",
  "employees.update",
  "employees.manage",

  // PRD MODULE 9 / PHASE 12 — payroll. Reading a run is not the same as calculating it, and
  // calculating it is not the same as approving it: `ARCHITECTURE.md` §20 separates configuration,
  // calculation, adjustment and the final record, and each step is its own grant so a payslip
  // cannot be produced, amended and settled by an account that only needs to see it. `` is the
  // accountant's alone (`PRD.md` MODULE 10 makes bulk salary payment an accountant act), which is
  // why the run's status machine has a `paid` step at all.
  "payroll.view",
  "payroll.calculate",
  "payroll.approve",
  "payroll.process",

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
