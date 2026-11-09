/**
 * What the application layer needs from the data layer (`src/modules/README.md`: ports in, Drizzle
 * out). Nothing here imports `db`, `drizzle-orm` or a table — the service is tested against
 * `testing/fakes.ts` without a database, exactly like the fee and finance ports.
 *
 * Five seams deserve naming, because they are what a store implementation has to get right:
 *
 * - **Every method is institution-scoped.** There is no unscoped read or write; `institutionId` is
 *   a claim the server action checks, not a value the caller may move a record out of
 *   (`SECURITY.md` §21). A store that ignores it leaks one institution's payroll to another.
 * - **Creating an employee is one transaction** (`ADR-0002`): the `users` row, the credential that
 *   lets them sign in, the role their employee type implies, the `employees` profile and the first
 *   `employee_status_history` row are written together. An employee with no account cannot
 *   authenticate; an account with no employment record is a staff listing error. Neither state is
 *   repairable by a later request, so neither is reachable.
 * - **Versioned writes take `expectedVersion`** and raise `ConflictError` when the row moved
 *   underneath, the same optimistic concurrency every module here uses. `salary_assignments` has
 *   no version column of its own — its guarantee is "at most one current assignment per employee",
 *   which is a partial unique index — so its ending write is guarded on `updatedAt` instead.
 * - **History is append-only.** `employee_status_history` only ever gains rows; a status change
 *   returns the employee to their previous state by writing a *new* history row, never by editing
 *   the one that recorded the departure.
 * - **Salary configuration is dated, never edited** (`ARCHITECTURE.md` §20): the store closes a
 *   structure or an assignment by setting `effectiveTo`, because a raise must not rewrite the
 *   figure a payslip already named.
 */
import type {
  EmployeeStatus,
  EmployeeType,
  EmploymentType,
  SalaryStructure,
} from "../domain/employee-rules";

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

/** One `employees` row joined with the account it belongs to, for a list row or a detail header. */
export interface EmployeeListRow {
  readonly id: string;
  readonly institutionId: string;
  /** The sign-in identity this employment belongs to. */
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly employeeCode: string;
  readonly employeeType: EmployeeType;
  readonly employmentType: EmploymentType;
  readonly status: EmployeeStatus;
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly designationId: string | null;
  readonly designationName: string | null;
  readonly joiningDate: string;
  /** Set once, on the transition that ended the employment. */
  readonly leavingDate: string | null;
  readonly bankAccountIban: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly notes: string | null;
  /** The locked-on figures in force today, when an assignment exists. */
  readonly currentSalaryAmount: string | null;
  readonly currentSalaryCurrency: string | null;
  /** The role bundle this employee's account holds, for the "access" section. */
  readonly roleSlug: string | null;
  readonly updatedAt: Date;
  /** Optimistic-concurrency token for the status and profile writes. */
  readonly version: number;
}

/**
 * The detail row: the employee plus the ordered trail of their employment lifecycle and the
 * salary structure currently assigned.
 */
export interface EmployeeDetailRow extends EmployeeListRow {
  readonly statusHistory: readonly EmployeeStatusEvent[];
  readonly currentSalary: readonly SalaryAssignmentRow[];
}

/** One employment lifecycle transition, oldest last (the list is ordered by `changed_at`). */
export interface EmployeeStatusEvent {
  readonly id: string;
  /** Null on the initial appointment, which has no predecessor. */
  readonly fromStatus: EmployeeStatus | null;
  readonly toStatus: EmployeeStatus;
  readonly changedAt: Date;
  readonly changedByUserName: string | null;
  readonly notes: string | null;
}

/** One `salary_structures` row, with the dimension names joined for display. */
export interface SalaryStructureRow {
  readonly id: string;
  readonly institutionId: string;
  readonly name: string;
  readonly structure: SalaryStructure;
  readonly designationId: string | null;
  readonly designationName: string | null;
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly employeeType: EmployeeType | null;
  /** The fixed monthly figure, or the base a unit-based structure pays on top of. */
  readonly amount: string;
  readonly currency: string;
  /** For `unit_based`: what one teachable period is worth. */
  readonly unitRate: string | null;
  readonly periodsPerDay: number | null;
  readonly workingDaysPerMonth: number | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly updatedAt: Date;
  /** Optimistic-concurrency token for structure edits. */
  readonly version: number;
}

/**
 * The employee-level counterpart of a salary structure: which employee holds which, and since
 * when. `amount` is null when the assignment restates the structure's own figures rather than
 * overriding them.
 */
export interface SalaryAssignmentRow {
  readonly id: string;
  readonly institutionId: string;
  readonly employeeId: string;
  readonly salaryStructureId: string | null;
  readonly salaryStructureName: string | null;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly overridesStructure: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly approvedByUserName: string | null;
  readonly updatedAt: Date;
}

/** A select option for a master-data reference (`departments`, `designations`). */
export interface ReferenceOption {
  readonly id: string;
  readonly name: string;
}

/** A stored credential, in the shape `user_credentials` holds it. */
export interface StoredCredential {
  readonly passwordHash: string;
  readonly algorithm: string | null;
  readonly parameters: Record<string, number> | null;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** Everything {@link HrStore.createEmployee} writes, in one transaction. */
export interface NewEmployee {
  readonly institutionId: string;
  readonly email: string;
  readonly fullName: string;
  readonly credential: StoredCredential;
  /** The system role bundle this employee type implies. */
  readonly roleSlug: string;
  readonly employeeCode: string;
  readonly employeeType: EmployeeType;
  readonly employmentType: EmploymentType;
  readonly departmentId: string | null;
  readonly designationId: string | null;
  readonly joiningDate: string;
  readonly bankAccountIban: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string;
}

/** An editable subset of `employees` — never the code, the start date or the status. */
export interface EmployeeProfileUpdate {
  readonly institutionId: string;
  readonly employeeId: string;
  readonly expectedVersion: number;
  readonly employeeType: EmployeeType;
  readonly employmentType: EmploymentType;
  readonly departmentId: string | null;
  readonly designationId: string | null;
  readonly bankAccountIban: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly notes: string | null;
}

/** A lifecycle change, with the history row that must accompany it. */
export interface EmployeeStatusChange {
  readonly institutionId: string;
  readonly employeeId: string;
  readonly expectedVersion: number;
  readonly toStatus: EmployeeStatus;
  readonly leavingDate: string | null;
  readonly notes: string | null;
  readonly changedByUserId: string;
}

/** A new salary structure. `amount` is the fixed figure, or the base a `unit_based` rate adds to. */
export interface SalaryStructureWrite {
  readonly institutionId: string;
  readonly name: string;
  readonly structure: SalaryStructure;
  readonly designationId: string | null;
  readonly departmentId: string | null;
  readonly employeeType: EmployeeType | null;
  readonly amount: string;
  readonly currency: string;
  readonly unitRate: string | null;
  readonly periodsPerDay: number | null;
  readonly workingDaysPerMonth: number | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface SalaryStructureUpdate {
  readonly institutionId: string;
  readonly salaryStructureId: string;
  readonly expectedVersion: number;
  readonly name: string;
  readonly structure: SalaryStructure;
  readonly designationId: string | null;
  readonly departmentId: string | null;
  readonly employeeType: EmployeeType | null;
  readonly amount: string;
  readonly currency: string;
  readonly unitRate: string | null;
  readonly periodsPerDay: number | null;
  readonly workingDaysPerMonth: number | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

/**
 * An assignment write. `amount` is null unless this row overrides its structure's figures, which
 * is the one case the row's own `salary_assignments_override_requires_amount` check admits.
 */
export interface SalaryAssignmentWrite {
  readonly institutionId: string;
  readonly employeeId: string;
  readonly salaryStructureId: string | null;
  readonly amount: string | null;
  /** The currency the assignment settles in — the structure's, or the employee's own. */
  readonly currency: string;
  readonly overridesStructure: boolean;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly approvedByUserId: string;
}

/** Ending an assignment, guarded on its `updatedAt` (no version column of its own). */
export interface SalaryAssignmentEnd {
  readonly institutionId: string;
  readonly salaryAssignmentId: string;
  readonly effectiveTo: string;
  readonly expectedUpdatedAt: Date;
}

/* -------------------------------------------------------------------------- */
/* The port                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The data layer the HR service is written against.
 *
 * The `*OrDefault` write methods return the id the caller needs for the next command, and nothing
 * else: whether a write landed is a `ConflictError` (version guard, unique violation) or silence.
 */
export interface HrStore {
  /* ---- Reads ------------------------------------------------------------- */

  listEmployees(institutionId: string): Promise<readonly EmployeeListRow[]>;
  getEmployee(institutionId: string, employeeId: string): Promise<EmployeeDetailRow | null>;
  listSalaryStructures(institutionId: string): Promise<readonly SalaryStructureRow[]>;
  listDepartmentOptions(institutionId: string): Promise<readonly ReferenceOption[]>;
  listDesignationOptions(institutionId: string): Promise<readonly ReferenceOption[]>;
  /** The number of employees this institution already has — the staff number a new one will take. */
  employeeSerial(institutionId: string): Promise<number>;

  /* ---- Writes ------------------------------------------------------------ */

  createEmployee(employee: NewEmployee): Promise<{ readonly id: string; readonly userId: string }>;
  updateEmployeeProfile(update: EmployeeProfileUpdate): Promise<{ readonly version: number }>;
  changeEmployeeStatus(change: EmployeeStatusChange): Promise<{ readonly version: number }>;
  createSalaryStructure(write: SalaryStructureWrite): Promise<{ readonly id: string }>;
  updateSalaryStructure(update: SalaryStructureUpdate): Promise<{ readonly version: number }>;
  assignSalary(write: SalaryAssignmentWrite): Promise<{ readonly id: string }>;
  /** `null` when the assignment was not there, or had already been ended. */
  endSalaryAssignment(end: SalaryAssignmentEnd): Promise<{ readonly id: string } | null>;
}
