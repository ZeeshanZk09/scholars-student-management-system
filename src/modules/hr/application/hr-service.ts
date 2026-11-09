/**
 * The HR module's use cases (`PRD.md` MODULE 8, `PHASES.md` #19 Phase 11 tasks 1–13).
 *
 * Every command does the same three things, in the same order — the fee, admission and finance
 * modules' rhythm (`src/modules/README.md` §5), so a reader who knows one module knows the other:
 *
 * 1. **Validate** the raw payload against its zod boundary schema (`parseOrThrow`), so a malformed
 *    request dies before it touches the store.
 * 2. **Check policy** against current state — the transition must be an edge of the employment
 *    state machine, a departure must be dated, a joining date must be plausible, an override must
 *    say what it overrides with. These are pure functions in `../domain/employee-rules.ts` plus
 *    checks that need rows the service just loaded.
 * 3. **Write**, letting the store's version and unique-violation handling turn conflicts the rules
 *    cannot foresee into `ConflictError`. Store `ConflictError`/`ValidationError` are never caught
 *    here — they propagate, because a server action maps `AppError` to a user response already.
 *
 * Three invariants this file exists to protect:
 *
 * - **`ADR-0002`: an employee is an account.** `createEmployee` provisions the `users` row, the
 *   credential, the role their employee type implies and the employment record in one store call,
 *   and the first `employee_status_history` row is part of that call. There is no path that
 *   creates a profile with nobody to sign in as.
 * - **Employment history is append-only** (`RULES.md` §51). `changeEmployeeStatus` never edits or
 *   deletes a history row; the only way to change an employee's status is to write the transition
 *   that records it. Returning from leave is a new row, not the removal of the one before it.
 * - **Salary configuration is dated, never edited** (`ARCHITECTURE.md` §20). Nothing here
 *   overwrites the amount a previous payslip named: a new assignment or a new structure row with a
 *   later `effectiveFrom` is the only way pay changes, so a reproducible calculation is still
 *   possible for a period that has closed.
 *
 * Authorization is the caller's: a server action checks the principal's permission before it
 * builds an `Actor`, so every write here demands a *named* actor (see `requireActorUserId`) but
 * never re-decides *whether* that actor may act.
 */
import { NotFoundError, ValidationError } from "@/shared/errors";
import { parseOrThrow } from "@/shared/validation";

import {
  assertEmployeeStatusTransition,
  assertLeavingDatePair,
  assertPlausibleJoiningDate,
  calendarDateString,
  EMPLOYEE_TYPE_TO_ROLE_SLUG,
  isTerminalEmployeeStatus,
  nextEmployeeCode,
} from "../domain/employee-rules";
import * as s from "./schemas";
import type {
  EmployeeDetailRow,
  EmployeeListRow,
  EmployeeProfileUpdate,
  EmployeeStatusChange,
  HrStore,
  NewEmployee,
  ReferenceOption,
  SalaryAssignmentWrite,
  SalaryStructureRow,
  SalaryStructureWrite,
  StoredCredential,
} from "./ports";

/** Who is performing a write. Every HR write demands a named one — see `requireActorUserId`. */
export interface Actor {
  readonly userId: string | null;
}

/** The pure functions the HR service needs from another module (the auth module, by ADR). */
export interface HrDependencies {
  readonly hashPassword: (password: string) => Promise<StoredCredential>;
}

export interface HrService {
  /* ---- Employees --------------------------------------------------------- */

  /** Provisions the account and the employment record together (`ADR-0002`). */
  createEmployee(
    input: unknown,
    actor: Actor,
  ): Promise<{ readonly id: string; readonly employeeCode: string }>;
  updateEmployeeProfile(input: unknown, actor: Actor): Promise<{ readonly version: number }>;
  changeEmployeeStatus(input: unknown, actor: Actor): Promise<{ readonly version: number }>;

  /* ---- Salary configuration ---------------------------------------------- */

  createSalaryStructure(input: unknown, actor: Actor): Promise<{ readonly id: string }>;
  updateSalaryStructure(input: unknown, actor: Actor): Promise<{ readonly version: number }>;
  assignSalary(input: unknown, actor: Actor): Promise<{ readonly id: string }>;
  endSalaryAssignment(input: unknown, actor: Actor): Promise<{ readonly id: string }>;

  /* ---- Read models ------------------------------------------------------- */

  listEmployees(input: unknown): Promise<readonly EmployeeListRow[]>;
  getEmployee(input: unknown): Promise<EmployeeDetailRow>;
  listSalaryStructures(input: unknown): Promise<readonly SalaryStructureRow[]>;
  listDepartmentOptions(input: unknown): Promise<readonly ReferenceOption[]>;
  listDesignationOptions(input: unknown): Promise<readonly ReferenceOption[]>;
}

export function createHrService(store: HrStore, dependencies: HrDependencies): HrService {
  /** Every write names a real HR operator, approver or the account holder themselves. */
  function requireActorUserId(actor: Actor): string {
    if (actor.userId === null) {
      throw new ValidationError("An authenticated user must perform this action.", {
        actor: ["Sign in before recording this change."],
      });
    }
    return actor.userId;
  }

  async function requireEmployee(institutionId: string, employeeId: string) {
    const employee = await store.getEmployee(institutionId, employeeId);
    if (employee === null) {
      throw new NotFoundError("Employee does not exist.", {
        userMessage: "That employee is no longer available. Refresh the list and try again.",
      });
    }
    return employee;
  }

  async function requireSalaryStructure(
    institutionId: string,
    salaryStructureId: string,
  ): Promise<SalaryStructureRow> {
    const structures = await store.listSalaryStructures(institutionId);
    const structure = structures.find((candidate) => candidate.id === salaryStructureId);
    if (structure === undefined) {
      throw new NotFoundError("Salary structure does not exist.", {
        userMessage: "That salary structure is no longer available. Choose another one.",
      });
    }
    return structure;
  }

  return {
    /* ---- Employees -------------------------------------------------------- */

    async createEmployee(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.createEmployeeSchema, input, "employee");
      assertPlausibleJoiningDate(data.joiningDate, new Date());
      // The staff number is the institution's own sequence: the next one after the last employee
      // created, or the one HR typed. A race is caught by `employees_institution_code_key` and
      // surfaces as a conflict rather than a silent duplicate.
      const serial = (await store.employeeSerial(data.institutionId)) + 1;
      const employeeCode = data.employeeCode ?? nextEmployeeCode(serial);
      const credential = await dependencies.hashPassword(data.initialPassword);
      const created = await store.createEmployee({
        institutionId: data.institutionId,
        email: data.email,
        fullName: data.fullName,
        credential,
        roleSlug: EMPLOYEE_TYPE_TO_ROLE_SLUG[data.employeeType],
        employeeCode,
        employeeType: data.employeeType,
        employmentType: data.employmentType,
        departmentId: data.departmentId,
        designationId: data.designationId,
        joiningDate: data.joiningDate,
        bankAccountIban: data.bankAccountIban,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        notes: data.notes,
        createdByUserId: userId,
      } satisfies NewEmployee);
      return { id: created.id, employeeCode };
    },

    async updateEmployeeProfile(input, actor) {
      requireActorUserId(actor);
      const data = parseOrThrow(s.updateEmployeeProfileSchema, input, "employee profile");
      await requireEmployee(data.institutionId, data.employeeId);
      const update: EmployeeProfileUpdate = {
        institutionId: data.institutionId,
        employeeId: data.employeeId,
        expectedVersion: data.expectedVersion,
        employeeType: data.employeeType,
        employmentType: data.employmentType,
        departmentId: data.departmentId,
        designationId: data.designationId,
        bankAccountIban: data.bankAccountIban,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        notes: data.notes,
      };
      return store.updateEmployeeProfile(update);
    },

    async changeEmployeeStatus(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.changeEmployeeStatusSchema, input, "employment status");
      const employee = await requireEmployee(data.institutionId, data.employeeId);
      assertEmployeeStatusTransition(employee.status, data.toStatus);
      // A date on a transition that does not end the employment is a mistake worth surfacing
      // rather than silently dropping: the caller submitted a fact that will not be stored.
      if (!isTerminalEmployeeStatus(data.toStatus) && data.leavingDate !== null) {
        throw new ValidationError("A still-employed employee has no leaving date.", {
          leavingDate: ["Clear the leaving date for an employee who has not left."],
        });
      }
      // A departure is dated on the day it is recorded unless HR says otherwise; returning from
      // leave drops the date, because the pairing is what an offboarding is judged by.
      const leavingDate = isTerminalEmployeeStatus(data.toStatus)
        ? (data.leavingDate ?? calendarDateString(new Date()))
        : null;
      assertLeavingDatePair(data.toStatus, leavingDate);
      const change: EmployeeStatusChange = {
        institutionId: data.institutionId,
        employeeId: data.employeeId,
        expectedVersion: data.expectedVersion,
        toStatus: data.toStatus,
        leavingDate,
        notes: data.notes,
        changedByUserId: userId,
      };
      return store.changeEmployeeStatus(change);
    },

    /* ---- Salary configuration --------------------------------------------- */

    async createSalaryStructure(input, actor) {
      requireActorUserId(actor);
      const data = parseOrThrow(s.createSalaryStructureSchema, input, "salary structure");
      const write: SalaryStructureWrite = {
        institutionId: data.institutionId,
        name: data.name,
        structure: data.structure,
        designationId: data.designationId,
        departmentId: data.departmentId,
        employeeType: data.employeeType,
        amount: data.amount,
        currency: data.currency,
        unitRate: data.unitRate ?? null,
        periodsPerDay: data.periodsPerDay ?? null,
        workingDaysPerMonth: data.workingDaysPerMonth ?? null,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
      };
      return store.createSalaryStructure(write);
    },

    async updateSalaryStructure(input, actor) {
      requireActorUserId(actor);
      const data = parseOrThrow(s.updateSalaryStructureSchema, input, "salary structure");
      await requireSalaryStructure(data.institutionId, data.salaryStructureId);
      return store.updateSalaryStructure({
        institutionId: data.institutionId,
        salaryStructureId: data.salaryStructureId,
        expectedVersion: data.expectedVersion,
        name: data.name,
        structure: data.structure,
        designationId: data.designationId,
        departmentId: data.departmentId,
        employeeType: data.employeeType,
        amount: data.amount,
        currency: data.currency,
        unitRate: data.unitRate ?? null,
        periodsPerDay: data.periodsPerDay ?? null,
        workingDaysPerMonth: data.workingDaysPerMonth ?? null,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
      });
    },

    async assignSalary(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.assignSalarySchema, input, "salary assignment");
      await requireEmployee(data.institutionId, data.employeeId);
      if (data.salaryStructureId !== null) {
        await requireSalaryStructure(data.institutionId, data.salaryStructureId);
      }
      // `salary_assignments_override_requires_amount`: an override that does not name its amount
      // is a raise with no figure. Stated here so the form shows a message rather than the
      // database raising one.
      if (data.overridesStructure && (data.amount === null || data.amount === undefined)) {
        throw new ValidationError("An override must say what it overrides with.", {
          amount: ["Enter the amount this assignment overrides the structure with."],
        });
      }
      const write: SalaryAssignmentWrite = {
        institutionId: data.institutionId,
        employeeId: data.employeeId,
        salaryStructureId: data.salaryStructureId,
        amount: data.amount ?? null,
        currency: data.currency,
        overridesStructure: data.overridesStructure,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
        approvedByUserId: userId,
      };
      return store.assignSalary(write);
    },

    async endSalaryAssignment(input, actor) {
      requireActorUserId(actor);
      const data = parseOrThrow(s.endSalaryAssignmentSchema, input, "salary assignment");
      // `salary_assignments_effective_order_check` says an assignment may not end on or before
      // the day it begins. The service states it against the row it is about to close, so the
      // answer is a field message rather than a constraint violation from the driver.
      const employee = await requireEmployee(data.institutionId, data.employeeId);
      const assignment = employee.currentSalary.find(
        (candidate) => candidate.id === data.salaryAssignmentId,
      );
      if (assignment === undefined) {
        throw new NotFoundError("Salary assignment does not exist.", {
          userMessage: "That assignment is no longer current. Refresh the page and try again.",
        });
      }
      if (data.effectiveTo <= assignment.effectiveFrom) {
        throw new ValidationError("An assignment cannot end on or before the day it begins.", {
          effectiveTo: [`Choose a date after ${assignment.effectiveFrom}.`],
        });
      }
      const ended = await store.endSalaryAssignment({
        institutionId: data.institutionId,
        salaryAssignmentId: data.salaryAssignmentId,
        effectiveTo: data.effectiveTo,
        expectedUpdatedAt: data.expectedUpdatedAt,
      });
      if (ended === null) {
        throw new NotFoundError("Salary assignment does not exist.", {
          userMessage: "That assignment is no longer current. Refresh the page and try again.",
        });
      }
      return ended;
    },

    /* ---- Read models ------------------------------------------------------ */

    async listEmployees(input) {
      const data = parseOrThrow(s.listEmployeesSchema, input, "employee list");
      return store.listEmployees(data.institutionId);
    },

    async getEmployee(input) {
      const data = parseOrThrow(s.employeeDetailSchema, input, "employee");
      const employee = await store.getEmployee(data.institutionId, data.employeeId);
      if (employee === null) {
        throw new NotFoundError("Employee does not exist.", {
          userMessage: "That employee is no longer available. Refresh the list and try again.",
        });
      }
      return employee;
    },

    async listSalaryStructures(input) {
      const data = parseOrThrow(s.listSalaryStructuresSchema, input, "salary structures");
      return store.listSalaryStructures(data.institutionId);
    },

    async listDepartmentOptions(input) {
      const data = parseOrThrow(s.referenceOptionsSchema, input, "departments");
      return store.listDepartmentOptions(data.institutionId);
    },

    async listDesignationOptions(input) {
      const data = parseOrThrow(s.referenceOptionsSchema, input, "designations");
      return store.listDesignationOptions(data.institutionId);
    },
  };
}
