/**
 * Input contracts for every HR use case (`PRD.md` MODULE 8).
 *
 * Boundary schemas (`ARCHITECTURE.md` §29) that turn untrusted form payloads into typed command
 * inputs. Rules that need a row's current state — an employee's status before a transition, the
 * structure an assignment points at — live in `domain/employee-rules.ts` and the service, because
 * zod cannot ask the database anything.
 *
 * Four shapes recur here, each stated at the form so the failure is a field message rather than a
 * 500 from a database check:
 *
 * - **Institution scope** on every command, so the server action can authorize before the use
 *   case runs (`SECURITY.md` §21) — a claim to check, never a value to trust.
 * - **Money as decimal text.** `numeric(18,2)` columns store money as text, so the same text the
 *   column will hold is what the form validates.
 * - **Optimistic concurrency.** Every versioned write carries `expectedVersion`; a stale one is a
 *   `ConflictError`, not a silent overwrite. `salary_assignments` has no version column of its own,
 *   so it is guarded by the store on `updatedAt` instead.
 * - **FormData emptiness**: absent fields arrive as `""`, which `.optional()` alone would not
 *   skip, so optional fields normalise to `null` through the shared helpers.
 *
 * The rules the schema states only partially are deliberately also enforced by the database: a
 * unit-based salary needs all three denominators, an override needs the amount it overrides with,
 * and a departure needs its date. Zod says it as a field message; the `CHECK` constraints keep it
 * true against a writer that bypasses this boundary.
 */
import { z } from "zod";

import {
  calendarDate,
  currencyCode,
  emailAddress,
  nonEmptyText,
  nonNegativeAmount,
  optionalCalendarDate,
  optionalId,
  optionalText,
} from "@/shared/validation/fields";

import {
  EMPLOYEE_TYPES,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUSES,
  SALARY_STRUCTURES,
} from "../domain/employee-rules";

const uuid = z.uuid("A valid reference is required.");

/**
 * The minimum length for a provisional password minted with a new account.
 *
 * Mirrors `PASSWORD_MIN_LENGTH` in the auth module's password policy, which stays the
 * enforcement point at sign-in. It is restated here because the HR boundary may not import
 * another module's domain, and the staff number and the account are created together: an initial
 * password that the policy will later refuse is a credential handed out that can never be used.
 * Revise the two together.
 */
const INITIAL_PASSWORD_MIN_LENGTH = 12;

/**
 * A decimal amount, or nothing — where "not set" means "inherit the structure's figure".
 *
 * `""` is normalised to `null` rather than left to fail the decimal regex: an empty form control is
 * how a browser says "no override", and a field message there would describe the wrong mistake.
 */
const optionalMoneyAmount = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return null;
  return value;
}, nonNegativeAmount.nullable());

/** A typed staff number, or nothing — the institution's sequence fills in when it is absent. */
const optionalEmployeeCode = z.preprocess((value) => {
  if (value === undefined || value === null || value === "" || value === false) return null;
  return value;
}, nonEmptyText("Employee code", 64).nullable());

export const employeeTypeEnum = z.enum(EMPLOYEE_TYPES);
export const employmentTypeEnum = z.enum(EMPLOYMENT_TYPES);
export const employeeStatusEnum = z.enum(EMPLOYEE_STATUSES);
export const salaryStructureEnum = z.enum(SALARY_STRUCTURES);

/** A checkbox: absent means the default, `"on"`/`"true"` means true. */
const checkbox = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (value === "on" || value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value;
  }, z.boolean());

/** A whole number from a body, `null` when the field carries nothing. */
const optionalWholeNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return Number(value);
  return value;
}, z.number().int("Must be a whole number.").positive("Must be a positive whole number.").nullable());

/** An optional enumerated field: an empty form control is "no dimension", not an error. */
const optionalEmployeeType = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return null;
  return value;
}, employeeTypeEnum.nullable());

/* -------------------------------------------------------------------------- */
/* Employees                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Creating an employee creates the account they sign in with (`ADR-0002`): one `users` row, one
 * credential, the role their employee type implies, and the `employees` profile — one transaction,
 * because an employee record with no account, or an account with no employment record, is a state
 * no later operation can repair.
 *
 * `employeeCode` is optional: the institution's own sequence fills it in when HR does not type a
 * number, and the per-institution unique index catches a collision under a race.
 */
export const createEmployeeSchema = z.object({
  institutionId: uuid,
  email: emailAddress,
  fullName: nonEmptyText("Full name", 120),
  initialPassword: nonEmptyText("Password", 128).min(
    INITIAL_PASSWORD_MIN_LENGTH,
    `Password must be at least ${INITIAL_PASSWORD_MIN_LENGTH} characters.`,
  ),
  employeeType: employeeTypeEnum,
  employmentType: employmentTypeEnum.default("full_time"),
  employeeCode: optionalEmployeeCode,
  joiningDate: calendarDate("Joining date"),
  departmentId: optionalId,
  designationId: optionalId,
  bankAccountIban: optionalText(64),
  emergencyContactName: optionalText(160),
  emergencyContactPhone: optionalText(32),
  notes: optionalText(2000),
});

/**
 * Editing an employee's profile.
 *
 * What is deliberately *absent* is as important as what is here: `employeeCode` (the
 * institution's staff number is an identity), `joiningDate` (moving a start date rewrites what
 * every downstream period depended on) and `status` (a lifecycle change, which carries a history
 * row and a leaving date — see `changeEmployeeStatusSchema`). All three have their own write path.
 */
export const updateEmployeeProfileSchema = z.object({
  institutionId: uuid,
  employeeId: uuid,
  employeeType: employeeTypeEnum,
  employmentType: employmentTypeEnum,
  departmentId: optionalId,
  designationId: optionalId,
  bankAccountIban: optionalText(64),
  emergencyContactName: optionalText(160),
  emergencyContactPhone: optionalText(32),
  notes: optionalText(2000),
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
});

/**
 * A lifecycle change. `leavingDate` is optional in the payload because the service defaults it to
 * today for a departure — but it may never be null once the transition lands
 * ({@link assertLeavingDatePair}), and returning from leave clears it.
 */
export const changeEmployeeStatusSchema = z.object({
  institutionId: uuid,
  employeeId: uuid,
  toStatus: employeeStatusEnum,
  leavingDate: optionalCalendarDate,
  notes: optionalText(2000),
  expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
});

/* -------------------------------------------------------------------------- */
/* Salary configuration                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The fields a salary structure carries, before the write that adds its identity.
 *
 * Split out because a refine cannot be carried through `.omit()` in zod v4, so the create and
 * update schemas would otherwise have to state the same cross-field rules twice — and the two
 * copies would drift.
 */
const salaryStructureFields = {
  name: nonEmptyText("Name", 160),
  structure: salaryStructureEnum,
  designationId: optionalId,
  departmentId: optionalId,
  employeeType: optionalEmployeeType,
  amount: nonNegativeAmount,
  currency: currencyCode,
  unitRate: optionalMoneyAmount,
  periodsPerDay: optionalWholeNumber,
  workingDaysPerMonth: optionalWholeNumber,
  effectiveFrom: calendarDate("Effective from"),
  effectiveTo: optionalCalendarDate,
};

/**
 * The cross-field rules `salary_structures_*` states in SQL, said at the form so a bad
 * configuration is a field message rather than a 500 from a database check:
 *
 * - a structure must point at a designation, a department, or an employee type
 *   (`salary_structures_has_dimension_check`);
 * - a unit-based structure needs all three denominators, because a rate with no divisor is not a
 *   salary (`salary_structures_unit_based_denominators_check`).
 */
const absent = (value: unknown): boolean => value === null || value === undefined;

const assertSalaryStructure = (
  data: {
    designationId: string | null;
    departmentId: string | null;
    employeeType: string | null;
    structure: "fixed" | "unit_based";
    unitRate?: string | null | undefined;
    periodsPerDay?: number | null | undefined;
    workingDaysPerMonth?: number | null | undefined;
  },
  ctx: z.RefinementCtx,
): void => {
  if (data.designationId === null && data.departmentId === null && data.employeeType === null) {
    ctx.addIssue({
      code: "custom",
      path: ["designationId"],
      message: "Point the structure at a designation, a department, or an employee type.",
    });
  }
  if (data.structure === "unit_based") {
    if (absent(data.unitRate)) {
      ctx.addIssue({
        code: "custom",
        path: ["unitRate"],
        message: "A unit-based structure needs a rate per unit.",
      });
    }
    if (absent(data.periodsPerDay)) {
      ctx.addIssue({
        code: "custom",
        path: ["periodsPerDay"],
        message: "A unit-based structure needs its periods per day.",
      });
    }
    if (absent(data.workingDaysPerMonth)) {
      ctx.addIssue({
        code: "custom",
        path: ["workingDaysPerMonth"],
        message: "A unit-based structure needs its working days per month.",
      });
    }
  }
};

/**
 * A salary structure: what a role of employee is *supposed* to earn (`ARCHITECTURE.md` §20).
 *
 * `amount` is required for both kinds — it is the figure a fixed salary pays, and for a
 * unit-based one it is the monthly base the rate is paid on top of. A unit-based structure then
 * needs all three denominators (`salary_structures_unit_based_denominators_check`): a rate with
 * no divisor is not a salary.
 */
export const createSalaryStructureSchema = z
  .object({
    institutionId: uuid,
    ...salaryStructureFields,
  })
  .superRefine(assertSalaryStructure);

/** Editing a salary structure. The effective range is data, so a raise is a dated row, not an edit. */
export const updateSalaryStructureSchema = z
  .object({
    institutionId: uuid,
    salaryStructureId: uuid,
    ...salaryStructureFields,
    expectedVersion: z.number().int().positive("expectedVersion must be a positive whole number."),
  })
  .superRefine(assertSalaryStructure);

/**
 * An assignment: which employee holds which structure, and since when.
 *
 * `overridesStructure` distinguishes a restatement of the structure's figures from a negotiated
 * salary that replaces them — without it, "what does this role normally pay?" is unanswerable,
 * so an override must say what it overrides with.
 */
export const assignSalarySchema = z.object({
  institutionId: uuid,
  employeeId: uuid,
  salaryStructureId: optionalId,
  amount: optionalMoneyAmount,
  currency: currencyCode,
  overridesStructure: checkbox(false),
  effectiveFrom: calendarDate("Effective from"),
  effectiveTo: optionalCalendarDate,
});

/**
 * Ending an assignment.
 *
 * `salary_assignments` carries no `version` column of its own — the guarantee it needs is "at
 * most one current assignment per employee", which the store enforces with the
 * `salary_assignments_one_current_key` partial unique index. So the ending write is guarded on
 * the row's `updatedAt` (a stale guard refuses the write) rather than on an optimistic counter.
 */
export const endSalaryAssignmentSchema = z.object({
  institutionId: uuid,
  /** The employee whose assignment is ending — the read the service validates the order against. */
  employeeId: uuid,
  salaryAssignmentId: uuid,
  effectiveTo: calendarDate("Ends on"),
  expectedUpdatedAt: z.coerce.date(),
});

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export const listEmployeesSchema = z.object({
  institutionId: uuid,
});

export const employeeDetailSchema = z.object({
  institutionId: uuid,
  employeeId: uuid,
});

export const listSalaryStructuresSchema = z.object({
  institutionId: uuid,
});

export const referenceOptionsSchema = z.object({
  institutionId: uuid,
});
