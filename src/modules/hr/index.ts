/**
 * The HR module's public surface (`src/modules/README.md`): wires the Drizzle store and the auth
 * module's password hasher into the HR service, then exports one-call functions. Nothing outside
 * the module reaches into `application/`, `domain/` or `infrastructure/`.
 *
 * **Callers own the gates.** Every institution-targeted command below is authorized by its caller
 * *before* it arrives — the same contract every module in `src/modules/` states. A server action
 * checks the principal's `employees.*` permission and then hands the action a named `userId`; the
 * service owns policy (the zod boundary, the employment state machine, the leaving-date pairing,
 * the plausible joining date, the override-without-amount refusal) and the store owns integrity
 * (tenant guards, version checks, unique conflicts). Raw `input: unknown` is by design — the
 * boundary schema runs inside the service, so no caller can bypass it.
 *
 * **`hashPassword` comes from the auth module**, because `ADR-0002` says an employee *is* an
 * authenticated account: creating one mints the credential they will sign in with. The HR module
 * asks the auth module for the hash rather than implementing its own, so there is exactly one
 * implementation of password hashing in this codebase (`RULES.md` §23) and the module boundary is
 * crossed in one direction only.
 *
 * **`"use client"` files**: import *types* from this barrel; import value tuples and labels
 * (`EMPLOYEE_STATUSES`, `EMPLOYEE_STATUS_LABELS`, …) from `@/modules/hr/domain/employee-rules`
 * instead. This barrel re-exports the store (`drizzle` → `pg`, none of which exist in a browser),
 * and a **value** import drags the whole graph into the client bundle — a type import is erased,
 * so it does not. The domain module is pure rules over `@/shared/errors`, which is why the
 * presentation vocabulary lives there.
 */
import { hashPassword } from "@/modules/auth";

import { createHrService } from "./application/hr-service";
import { createHrStore, drizzleHrStore } from "./infrastructure/drizzle-store";

const hr = createHrService(drizzleHrStore, { hashPassword });

/* ---- Employees ------------------------------------------------------------ */

/** Provisions the sign-in account and the employment record together (`ADR-0002`). */
export function createEmployee(input: unknown, userId: string) {
  return hr.createEmployee(input, { userId });
}

export function updateEmployeeProfile(input: unknown, userId: string) {
  return hr.updateEmployeeProfile(input, { userId });
}

export function changeEmployeeStatus(input: unknown, userId: string) {
  return hr.changeEmployeeStatus(input, { userId });
}

/* ---- Salary configuration -------------------------------------------------- */

export function createSalaryStructure(input: unknown, userId: string) {
  return hr.createSalaryStructure(input, { userId });
}

export function updateSalaryStructure(input: unknown, userId: string) {
  return hr.updateSalaryStructure(input, { userId });
}

export function assignSalary(input: unknown, userId: string) {
  return hr.assignSalary(input, { userId });
}

export function endSalaryAssignment(input: unknown, userId: string) {
  return hr.endSalaryAssignment(input, { userId });
}

/* ---- Read models ----------------------------------------------------------- */

export function listEmployees(input: unknown) {
  return hr.listEmployees(input);
}

export function getEmployee(input: unknown) {
  return hr.getEmployee(input);
}

export function listSalaryStructures(input: unknown) {
  return hr.listSalaryStructures(input);
}

export function listDepartmentOptions(input: unknown) {
  return hr.listDepartmentOptions(input);
}

export function listDesignationOptions(input: unknown) {
  return hr.listDesignationOptions(input);
}

/* ---- Value re-exports (domain — pure; see the "use client" note above) ----- */

export {
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_TYPE_LABELS,
  EMPLOYEE_TYPES,
  EMPLOYEE_TYPE_TO_ROLE_SLUG,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  SALARY_STRUCTURES,
  SALARY_STRUCTURE_LABELS,
} from "./domain/employee-rules";

export type {
  EmployeeStatus,
  EmployeeType,
  EmploymentType,
  SalaryStructure,
} from "./domain/employee-rules";

/* ---- Types (erased at runtime — safe for `"use client"` imports) ----------- */

export type { Actor } from "./application/hr-service";
export type {
  EmployeeDetailRow,
  EmployeeListRow,
  EmployeeStatusEvent,
  HrStore,
  ReferenceOption,
  SalaryAssignmentRow,
  SalaryStructureRow,
  StoredCredential,
} from "./application/ports";

/**
 * A store bound to a caller's transaction, the seam a later phase uses when a write spans the HR
 * module and another one (the same shape `postFeeCollectionWithin` gives fees).
 */
export { createHrStore };
