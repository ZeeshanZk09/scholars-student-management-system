"use server";

/**
 * HR server actions (PRD MODULE 8).
 *
 * Each action is the single path from `ui/` into the HR module's use cases
 * (`src/modules/README.md`). It runs **two gates before the command** — the fee module's pattern
 * (`../fees/ui/actions.ts`), with the HR module's own permission keys:
 *
 * | command                              | key                 |
 * |--------------------------------------|---------------------|
 * | create an employee (and its account) | `employees.create`  |
 * | edit an employee's profile           | `employees.update`  |
 * | change an employment status          | `employees.manage`  |
 * | create / edit a salary structure     | `employees.manage`  |
 * | assign / end a salary assignment     | `employees.manage`  |
 *
 * 1. the institution gate — `requireInstitutionMutation` resolves the key *at* the institution the
 *    form names and refuses an institution this user does not belong to, so a forged
 *    `institutionId` can never widen a grant (`SECURITY.md` §21, §87).
 * 2. the boundary schema — the zod input the module's use case accepts
 *    (`application/schemas.ts`). Normalisations the schema cannot make from a string arrive here:
 *    `version` becomes the store's `expectedVersion` number, checkboxes become real booleans
 *    (`formData.has` — an unchecked box sends nothing, and `overridesStructure` must be `false`,
 *    not its schema default), and an empty date or amount becomes `null` so "no override" is a
 *    value rather than a message.
 *
 * A refusal from either comes back as a serialisable `FormState` for `useActionState`, not as an
 * error boundary: the user stays on the form and reads why. A `redirect()` (expired session) is
 * deliberately *not* converted — see `gate`.
 *
 * Commands that stamp an actor receive the acting `principal.userId` from the gate itself; the
 * client never supplies the "who did this" field, which is what makes `employee_status_history`
 * attributable (`RULES.md` §51).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import type { PermissionKey, Principal } from "@/shared/authorization";
import { ConflictError, isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";
import {
  assignSalary,
  changeEmployeeStatus,
  createEmployee,
  createSalaryStructure,
  endSalaryAssignment,
  updateEmployeeProfile,
  updateSalaryStructure,
} from "@/modules/hr";

/** Anything naming a route must be a uuid — a raw form value would let an updater purge caches
 *  for paths outside this module, and a malformed one would throw out of the action contract. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The list moves with every write; the detail page and the salary register only when named. */
function revalidateEmployees(formData: FormData): void {
  revalidatePath("/hr/employees");
  const employeeId = field(formData, "employeeId");
  if (UUID_PATTERN.test(employeeId)) revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/salary-structures");
}

/** Raw `FormData` value for a key, or `""` when the part is absent. */
function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** An optimistic-concurrency token the schema wants as a number. */
function version(formData: FormData): number {
  return Number(field(formData, "version"));
}

/** HTML checkboxes send `"on"` when checked and nothing when unchecked. */
function checked(formData: FormData, key: string): boolean {
  return formData.has(key);
}

/** An empty form control is `null`, not `""` — the schema's own decimal/date checks then pass. */
function optionalValue(formData: FormData, key: string): string | null {
  const value = field(formData, key).trim();
  return value === "" ? null : value;
}

/** The staff number's ending token: the guard reads it as a date, so a blank means "not ended". */
function optionalDateFrom(formData: FormData, key: string): string | null {
  return optionalValue(formData, key);
}

/** Normalise a command failure into a serialisable form state. */
function stateFrom(error: unknown): FormState {
  if (isAppError(error)) {
    if (error instanceof ValidationError) {
      return {
        status: "error",
        message: error.userMessage,
        issues: Object.values(error.fieldErrors).flat(),
      };
    }
    return { status: "error", message: error.userMessage };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

type Gate =
  | { readonly ok: true; readonly principal: Principal }
  | { readonly ok: false; readonly state: FormState };

/**
 * Gate: resolve `permission` at the institution the form names, returning the acting principal so
 * caller-stamped commands can use its `userId`.
 *
 * `AppError` becomes the `error` arm of `FormState` — `ForbiddenError`, `ValidationError` and
 * `ConflictError` all carry a safe `userMessage` meant for exactly this. Anything else propagates,
 * and that includes `redirect("/login")` from an expired session: swallowing it would turn "your
 * session ended" into "something went wrong".
 */
async function gate(formData: FormData, permission: PermissionKey): Promise<Gate> {
  try {
    const principal = await requireInstitutionMutation(
      permission,
      field(formData, "institutionId"),
    );
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

/* ---- Employees ------------------------------------------------------------- */

/** Hiring: the command that provisions the sign-in account along with the employment record. */
export async function createEmployeeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "employees.create");
  if (!result.ok) return result.state;
  try {
    const created = await createEmployee(
      {
        institutionId: field(formData, "institutionId"),
        email: field(formData, "email"),
        fullName: field(formData, "fullName"),
        initialPassword: field(formData, "initialPassword"),
        employeeType: field(formData, "employeeType"),
        employmentType: field(formData, "employmentType"),
        employeeCode: optionalValue(formData, "employeeCode"),
        joiningDate: field(formData, "joiningDate"),
        departmentId: optionalValue(formData, "departmentId"),
        designationId: optionalValue(formData, "designationId"),
        bankAccountIban: optionalValue(formData, "bankAccountIban"),
        emergencyContactName: optionalValue(formData, "emergencyContactName"),
        emergencyContactPhone: optionalValue(formData, "emergencyContactPhone"),
        notes: optionalValue(formData, "notes"),
      },
      result.principal.userId,
    );
    revalidatePath("/hr/employees");
    return { status: "done", message: `Employee ${created.employeeCode} created.` };
  } catch (error) {
    return stateFrom(error);
  }
}

/** Editing an employment record: never the staff number, the start date or the status. */
export async function updateEmployeeProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "employees.update");
  if (!result.ok) return result.state;
  try {
    await updateEmployeeProfile(
      {
        institutionId: field(formData, "institutionId"),
        employeeId: field(formData, "employeeId"),
        employeeType: field(formData, "employeeType"),
        employmentType: field(formData, "employmentType"),
        departmentId: optionalValue(formData, "departmentId"),
        designationId: optionalValue(formData, "designationId"),
        bankAccountIban: optionalValue(formData, "bankAccountIban"),
        emergencyContactName: optionalValue(formData, "emergencyContactName"),
        emergencyContactPhone: optionalValue(formData, "emergencyContactPhone"),
        notes: optionalValue(formData, "notes"),
        expectedVersion: version(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    /* A version conflict still refreshes the page: the hidden `version` token must pick up the
       current row, or every retry from the open dialog fails until a hard refresh. */
    if (error instanceof ConflictError) revalidateEmployees(formData);
    return stateFrom(error);
  }
  revalidateEmployees(formData);
  return { status: "done", message: "Employee profile saved." };
}

/**
 * A lifecycle change: a leave of absence, a return from one, or a departure.
 *
 * The `leavingDate` the form names is passed through and the service defaults it to today for a
 * departure; a still-employed transition that carries one is refused with a field message rather
 * than silently dropped (`hr-service.ts`).
 */
export async function changeEmployeeStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "employees.manage");
  if (!result.ok) return result.state;
  try {
    await changeEmployeeStatus(
      {
        institutionId: field(formData, "institutionId"),
        employeeId: field(formData, "employeeId"),
        toStatus: field(formData, "toStatus"),
        leavingDate: optionalDateFrom(formData, "leavingDate"),
        notes: optionalValue(formData, "notes"),
        expectedVersion: version(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidateEmployees(formData);
    return stateFrom(error);
  }
  revalidateEmployees(formData);
  return { status: "done", message: "Employment status updated." };
}

/* ---- Salary configuration -------------------------------------------------- */

export async function createSalaryStructureAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "employees.manage");
  if (!result.ok) return result.state;
  try {
    await createSalaryStructure(
      {
        institutionId: field(formData, "institutionId"),
        name: field(formData, "name"),
        structure: field(formData, "structure"),
        designationId: optionalValue(formData, "designationId"),
        departmentId: optionalValue(formData, "departmentId"),
        employeeType: optionalValue(formData, "employeeType"),
        amount: field(formData, "amount"),
        currency: field(formData, "currency"),
        unitRate: optionalValue(formData, "unitRate"),
        periodsPerDay: optionalValue(formData, "periodsPerDay"),
        workingDaysPerMonth: optionalValue(formData, "workingDaysPerMonth"),
        effectiveFrom: field(formData, "effectiveFrom"),
        effectiveTo: optionalValue(formData, "effectiveTo"),
      },
      result.principal.userId,
    );
    revalidatePath("/hr/salary-structures");
    return { status: "done", message: `Salary structure “${field(formData, "name")}” created.` };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function updateSalaryStructureAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "employees.manage");
  if (!result.ok) return result.state;
  try {
    await updateSalaryStructure(
      {
        institutionId: field(formData, "institutionId"),
        salaryStructureId: field(formData, "salaryStructureId"),
        name: field(formData, "name"),
        structure: field(formData, "structure"),
        designationId: optionalValue(formData, "designationId"),
        departmentId: optionalValue(formData, "departmentId"),
        employeeType: optionalValue(formData, "employeeType"),
        amount: field(formData, "amount"),
        currency: field(formData, "currency"),
        unitRate: optionalValue(formData, "unitRate"),
        periodsPerDay: optionalValue(formData, "periodsPerDay"),
        workingDaysPerMonth: optionalValue(formData, "workingDaysPerMonth"),
        effectiveFrom: field(formData, "effectiveFrom"),
        effectiveTo: optionalValue(formData, "effectiveTo"),
        expectedVersion: version(formData),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidatePath("/hr/salary-structures");
    return stateFrom(error);
  }
  revalidatePath("/hr/salary-structures");
  revalidateEmployees(formData);
  return { status: "done", message: "Salary structure saved." };
}

export async function assignSalaryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "employees.manage");
  if (!result.ok) return result.state;
  try {
    await assignSalary(
      {
        institutionId: field(formData, "institutionId"),
        employeeId: field(formData, "employeeId"),
        salaryStructureId: optionalValue(formData, "salaryStructureId"),
        amount: optionalValue(formData, "amount"),
        currency: field(formData, "currency"),
        overridesStructure: checked(formData, "overridesStructure"),
        effectiveFrom: field(formData, "effectiveFrom"),
        effectiveTo: optionalValue(formData, "effectiveTo"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidateEmployees(formData);
    return stateFrom(error);
  }
  revalidateEmployees(formData);
  return { status: "done", message: "Salary assigned." };
}

/**
 * Ending an assignment.
 *
 * `salary_assignments` has no `expectedVersion` column of its own, so the guard posts the row's
 * `updatedAt` stamp: a stale one refuses the write rather than ending an assignment somebody else
 * already changed (`ports.ts`). The end date must also be *after* the day the assignment began —
 * the service says so, from the row it is closing.
 */
export async function endSalaryAssignmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "employees.manage");
  if (!result.ok) return result.state;
  try {
    await endSalaryAssignment(
      {
        institutionId: field(formData, "institutionId"),
        employeeId: field(formData, "employeeId"),
        salaryAssignmentId: field(formData, "salaryAssignmentId"),
        effectiveTo: field(formData, "effectiveTo"),
        expectedUpdatedAt: field(formData, "expectedUpdatedAt"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidateEmployees(formData);
    return stateFrom(error);
  }
  revalidateEmployees(formData);
  return { status: "done", message: "Salary assignment ended." };
}
