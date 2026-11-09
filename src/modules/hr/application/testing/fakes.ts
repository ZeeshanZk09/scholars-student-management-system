/**
 * An in-memory {@link HrStore} for service tests.
 *
 * It mirrors the Drizzle store's *observable* behaviour for what the service and its tests care
 * about — the staff number sequence, the account provisioned alongside the employment record, the
 * role bundle implied by the employee type, version-guarded writes, the transition history row,
 * the salary structure and its assignment — and nothing more. Where a rule lives in the *service*
 * (plausible joining dates, the state machine as an argument, the leaving-date pairing, the
 * override-without-amount refusal) the fake deliberately does not repeat it: a test that passed
 * because the fake was lenient would be worse than no test.
 *
 * Two promises belong to the real store and are only *shaped* here: transactional atomicity
 * (every fake write is single-step by construction, so nothing needs rolling back) and
 * unique-violation mapping — a duplicated e-mail, a duplicated staff number, a second current
 * assignment per employee and a stale `expectedVersion` are raised as `ConflictError`, which is
 * how the database would present them to a racing writer anyway. The *uniqueness* rules are real,
 * because a service that cannot rely on them is a service with a bug the tests would never find.
 */
import { randomUUID } from "node:crypto";

import { ConflictError, NotFoundError } from "@/shared/errors";

import type {
  EmployeeDetailRow,
  EmployeeListRow,
  EmployeeProfileUpdate,
  EmployeeStatusChange,
  EmployeeStatusEvent,
  HrStore,
  NewEmployee,
  ReferenceOption,
  SalaryAssignmentEnd,
  SalaryAssignmentRow,
  SalaryAssignmentWrite,
  SalaryStructureRow,
  SalaryStructureUpdate,
  SalaryStructureWrite,
} from "../ports";

interface FakeUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly algorithm: string | null;
  readonly roleSlug: string;
}

interface FakeEmployee {
  readonly id: string;
  readonly institutionId: string;
  readonly userId: string;
  readonly employeeCode: string;
  employeeType: EmployeeListRow["employeeType"];
  employmentType: EmployeeListRow["employmentType"];
  status: EmployeeListRow["status"];
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationName: string | null;
  joiningDate: string;
  leavingDate: string | null;
  bankAccountIban: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  version: number;
  updatedAt: Date;
}

interface FakeStructure {
  readonly id: string;
  readonly institutionId: string;
  name: string;
  structure: SalaryStructureRow["structure"];
  designationId: string | null;
  designationName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  employeeType: SalaryStructureRow["employeeType"];
  amount: string;
  currency: string;
  unitRate: string | null;
  periodsPerDay: number | null;
  workingDaysPerMonth: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: number;
  updatedAt: Date;
}

interface FakeAssignment {
  readonly id: string;
  readonly institutionId: string;
  readonly employeeId: string;
  readonly salaryStructureId: string | null;
  readonly salaryStructureName: string | null;
  amount: string | null;
  currency: string | null;
  overridesStructure: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedByUserName: string | null;
  updatedAt: Date;
}

/**
 * The same conflict a racing writer would get from the database. Accepts a bare user message or a
 * detail map, because a test's wording is not worth a helper that outgrew it.
 */
const conflict = (
  message: string,
  details: string | { readonly userMessage: string },
): ConflictError =>
  new ConflictError(message, {
    userMessage: typeof details === "string" ? details : details.userMessage,
  });

export interface FakeHrStore extends HrStore {
  /** The accounts provisioned with an employee, for assertions about the credential and role. */
  readonly users: readonly FakeUser[];
  /** Every history row, oldest first. */
  readonly history: readonly EmployeeStatusEvent[];
  /** Every assignment, current and ended. */
  readonly assignments: readonly SalaryAssignmentRow[];
  /** Every structure, for assertions about a dated configuration. */
  readonly structures: readonly SalaryStructureRow[];

  reset(): void;
  /** Pre-place a department or designation, so a test can bind an employee to one. */
  seedOptions(
    departments: readonly ReferenceOption[],
    designations: readonly ReferenceOption[],
  ): void;
  /** Pre-place a structure without going through the service, and return its id. */
  seedStructure(overrides?: Partial<SalaryStructureWrite> & { readonly id?: string }): string;
}

const INSTITUTION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

export function createFakeHrStore(): FakeHrStore {
  const users = new Map<string, FakeUser>();
  const employees = new Map<string, FakeEmployee>();
  const structures = new Map<string, FakeStructure>();
  const assignments = new Map<string, FakeAssignment>();
  const history: EmployeeStatusEvent[] = [];
  /** A history row's owner — kept beside the row, not on it, so the read model stays printable. */
  const historyOwners = new Map<string, string>();
  let departments: ReferenceOption[] = [];
  let designations: ReferenceOption[] = [];

  function departmentName(id: string | null): string | null {
    if (id === null) return null;
    return departments.find((department) => department.id === id)?.name ?? null;
  }

  function designationName(id: string | null): string | null {
    if (id === null) return null;
    return designations.find((designation) => designation.id === id)?.name ?? null;
  }

  function structureRow(structure: FakeStructure): SalaryStructureRow {
    return {
      id: structure.id,
      institutionId: structure.institutionId,
      name: structure.name,
      structure: structure.structure,
      designationId: structure.designationId,
      designationName: designationName(structure.designationId),
      departmentId: structure.departmentId,
      departmentName: departmentName(structure.departmentId),
      employeeType: structure.employeeType,
      amount: structure.amount,
      currency: structure.currency,
      unitRate: structure.unitRate,
      periodsPerDay: structure.periodsPerDay,
      workingDaysPerMonth: structure.workingDaysPerMonth,
      effectiveFrom: structure.effectiveFrom,
      effectiveTo: structure.effectiveTo,
      updatedAt: structure.updatedAt,
      version: structure.version,
    };
  }

  function assignmentRow(assignment: FakeAssignment): SalaryAssignmentRow {
    return {
      id: assignment.id,
      institutionId: assignment.institutionId,
      employeeId: assignment.employeeId,
      salaryStructureId: assignment.salaryStructureId,
      salaryStructureName: assignment.salaryStructureName,
      amount: assignment.amount,
      currency: assignment.currency,
      overridesStructure: assignment.overridesStructure,
      effectiveFrom: assignment.effectiveFrom,
      effectiveTo: assignment.effectiveTo,
      approvedByUserName: assignment.approvedByUserName,
      updatedAt: assignment.updatedAt,
    };
  }

  function currentAssignment(employeeId: string): FakeAssignment | undefined {
    return [...assignments.values()].find(
      (candidate) => candidate.employeeId === employeeId && candidate.effectiveTo === null,
    );
  }

  function toListRow(employee: FakeEmployee): EmployeeListRow {
    const user = users.get(employee.userId);
    if (user === undefined) throw new NotFoundError("Employee has no account.");
    const current = currentAssignment(employee.id);
    return {
      id: employee.id,
      institutionId: employee.institutionId,
      userId: employee.userId,
      fullName: user.name,
      email: user.email,
      employeeCode: employee.employeeCode,
      employeeType: employee.employeeType,
      employmentType: employee.employmentType,
      status: employee.status,
      departmentId: employee.departmentId,
      departmentName: employee.departmentName,
      designationId: employee.designationId,
      designationName: employee.designationName,
      joiningDate: employee.joiningDate,
      leavingDate: employee.leavingDate,
      bankAccountIban: employee.bankAccountIban,
      emergencyContactName: employee.emergencyContactName,
      emergencyContactPhone: employee.emergencyContactPhone,
      notes: employee.notes,
      currentSalaryAmount: current?.amount ?? null,
      currentSalaryCurrency: current?.currency ?? null,
      roleSlug: user.roleSlug,
      updatedAt: employee.updatedAt,
      version: employee.version,
    };
  }

  function toDetailRow(employee: FakeEmployee): EmployeeDetailRow {
    const events = history
      .filter((event) => historyOwners.get(event.id) === employee.id)
      .sort((left, right) => left.changedAt.getTime() - right.changedAt.getTime());
    const current = currentAssignment(employee.id);
    return {
      ...toListRow(employee),
      statusHistory: events,
      currentSalary: current === undefined ? [] : [assignmentRow(current)],
    };
  }

  return {
    get users() {
      return [...users.values()];
    },

    get history() {
      return [...history].sort(
        (left, right) => left.changedAt.getTime() - right.changedAt.getTime(),
      );
    },

    get assignments() {
      return [...assignments.values()].map(assignmentRow);
    },

    get structures() {
      return [...structures.values()].map(structureRow);
    },

    reset() {
      users.clear();
      employees.clear();
      structures.clear();
      assignments.clear();
      history.length = 0;
      historyOwners.clear();
      departments = [];
      designations = [];
    },

    seedOptions(nextDepartments, nextDesignations) {
      departments = [...nextDepartments];
      designations = [...nextDesignations];
      for (const structure of structures.values()) {
        structure.departmentName = departmentName(structure.departmentId);
        structure.designationName = designationName(structure.designationId);
      }
    },

    seedStructure(overrides = {}) {
      const id = overrides.id ?? randomUUID();
      structures.set(id, {
        id,
        institutionId: overrides.institutionId ?? INSTITUTION_ID,
        name: overrides.name ?? "Teacher structure",
        structure: overrides.structure ?? "fixed",
        designationId: overrides.designationId ?? null,
        designationName: designationName(overrides.designationId ?? null),
        departmentId: overrides.departmentId ?? null,
        departmentName: departmentName(overrides.departmentId ?? null),
        employeeType: overrides.employeeType ?? "teacher",
        amount: overrides.amount ?? "60000.00",
        currency: overrides.currency ?? "PKR",
        unitRate: overrides.unitRate ?? null,
        periodsPerDay: overrides.periodsPerDay ?? null,
        workingDaysPerMonth: overrides.workingDaysPerMonth ?? null,
        effectiveFrom: overrides.effectiveFrom ?? "2026-01-01",
        effectiveTo: overrides.effectiveTo ?? null,
        version: 1,
        updatedAt: new Date(),
      });
      return id;
    },

    async listEmployees(institutionId) {
      return [...employees.values()]
        .filter((employee) => employee.institutionId === institutionId)
        .map(toListRow)
        .sort((left, right) => left.employeeCode.localeCompare(right.employeeCode));
    },

    async getEmployee(institutionId, employeeId) {
      const employee = employees.get(employeeId);
      if (employee === undefined || employee.institutionId !== institutionId) return null;
      return toDetailRow(employee);
    },

    async listSalaryStructures(institutionId) {
      return [...structures.values()]
        .filter((structure) => structure.institutionId === institutionId)
        .map(structureRow);
    },

    async listDepartmentOptions(institutionId) {
      return institutionId === INSTITUTION_ID ? departments : [];
    },

    async listDesignationOptions(institutionId) {
      return institutionId === INSTITUTION_ID ? designations : [];
    },

    async employeeSerial(institutionId) {
      return [...employees.values()].filter((employee) => employee.institutionId === institutionId)
        .length;
    },

    async createEmployee(employee: NewEmployee) {
      const email = employee.email.toLowerCase();
      if ([...users.values()].some((user) => user.email.toLowerCase() === email)) {
        // The database enforces this on `lower(email)`; a service-level pre-check would race it.
        throw conflict(
          "An account with this email already exists.",
          "An account with this email already exists.",
        );
      }
      if (
        [...employees.values()].some(
          (candidate) =>
            candidate.institutionId === employee.institutionId &&
            candidate.employeeCode === employee.employeeCode,
        )
      ) {
        throw conflict("This employee code is already in use.", {
          userMessage: "This employee code is already in use. Choose another one.",
        });
      }
      const user: FakeUser = {
        id: randomUUID(),
        email: employee.email,
        name: employee.fullName,
        passwordHash: employee.credential.passwordHash,
        algorithm: employee.credential.algorithm,
        roleSlug: employee.roleSlug,
      };
      const employeeRow: FakeEmployee = {
        id: randomUUID(),
        institutionId: employee.institutionId,
        userId: user.id,
        employeeCode: employee.employeeCode,
        employeeType: employee.employeeType,
        employmentType: employee.employmentType,
        status: "active",
        departmentId: employee.departmentId,
        departmentName: departmentName(employee.departmentId),
        designationId: employee.designationId,
        designationName: designationName(employee.designationId),
        joiningDate: employee.joiningDate,
        leavingDate: null,
        bankAccountIban: employee.bankAccountIban,
        emergencyContactName: employee.emergencyContactName,
        emergencyContactPhone: employee.emergencyContactPhone,
        notes: employee.notes,
        version: 1,
        updatedAt: new Date(),
      };
      users.set(user.id, user);
      employees.set(employeeRow.id, employeeRow);
      // The initial appointment: `to_status` is where the employee starts, with no predecessor.
      const initial: EmployeeStatusEvent = {
        id: randomUUID(),
        fromStatus: null,
        toStatus: "active",
        changedAt: new Date(),
        changedByUserName: null,
        notes: null,
      };
      history.push(initial);
      historyOwners.set(initial.id, employeeRow.id);
      return { id: employeeRow.id, userId: user.id };
    },

    async updateEmployeeProfile(update: EmployeeProfileUpdate) {
      const employee = employees.get(update.employeeId);
      if (
        employee === undefined ||
        employee.institutionId !== update.institutionId ||
        employee.version !== update.expectedVersion
      ) {
        throw conflict("This employee was changed by someone else.", {
          userMessage: "This employee was changed by someone else. Refresh the page and try again.",
        });
      }
      employee.employeeType = update.employeeType;
      employee.employmentType = update.employmentType;
      employee.departmentId = update.departmentId;
      employee.departmentName = departmentName(update.departmentId);
      employee.designationId = update.designationId;
      employee.designationName = designationName(update.designationId);
      employee.bankAccountIban = update.bankAccountIban;
      employee.emergencyContactName = update.emergencyContactName;
      employee.emergencyContactPhone = update.emergencyContactPhone;
      employee.notes = update.notes;
      employee.version += 1;
      employee.updatedAt = new Date();
      return { version: employee.version };
    },

    async changeEmployeeStatus(change: EmployeeStatusChange) {
      const employee = employees.get(change.employeeId);
      if (
        employee === undefined ||
        employee.institutionId !== change.institutionId ||
        employee.version !== change.expectedVersion
      ) {
        throw conflict("This employee was changed by someone else.", {
          userMessage: "This employee was changed by someone else. Refresh the page and try again.",
        });
      }
      const from = employee.status;
      employee.status = change.toStatus;
      employee.leavingDate = change.leavingDate;
      employee.version += 1;
      employee.updatedAt = new Date();
      const event: EmployeeStatusEvent = {
        id: randomUUID(),
        fromStatus: from,
        toStatus: change.toStatus,
        changedAt: new Date(),
        changedByUserName: null,
        notes: change.notes,
      };
      history.push(event);
      historyOwners.set(event.id, employee.id);
      return { version: employee.version };
    },

    async createSalaryStructure(write: SalaryStructureWrite) {
      const id = randomUUID();
      structures.set(id, {
        id,
        institutionId: write.institutionId,
        name: write.name,
        structure: write.structure,
        designationId: write.designationId,
        designationName: designationName(write.designationId),
        departmentId: write.departmentId,
        departmentName: departmentName(write.departmentId),
        employeeType: write.employeeType,
        amount: write.amount,
        currency: write.currency,
        unitRate: write.unitRate,
        periodsPerDay: write.periodsPerDay,
        workingDaysPerMonth: write.workingDaysPerMonth,
        effectiveFrom: write.effectiveFrom,
        effectiveTo: write.effectiveTo,
        version: 1,
        updatedAt: new Date(),
      });
      return { id };
    },

    async updateSalaryStructure(update: SalaryStructureUpdate) {
      const structure = structures.get(update.salaryStructureId);
      if (
        structure === undefined ||
        structure.institutionId !== update.institutionId ||
        structure.version !== update.expectedVersion
      ) {
        throw conflict("This salary structure was changed by someone else.", {
          userMessage:
            "This salary structure was changed by someone else. Refresh the page and try again.",
        });
      }
      structure.name = update.name;
      structure.structure = update.structure;
      structure.designationId = update.designationId;
      structure.designationName = designationName(update.designationId);
      structure.departmentId = update.departmentId;
      structure.departmentName = departmentName(update.departmentId);
      structure.employeeType = update.employeeType;
      structure.amount = update.amount;
      structure.currency = update.currency;
      structure.unitRate = update.unitRate;
      structure.periodsPerDay = update.periodsPerDay;
      structure.workingDaysPerMonth = update.workingDaysPerMonth;
      structure.effectiveFrom = update.effectiveFrom;
      structure.effectiveTo = update.effectiveTo;
      structure.version += 1;
      structure.updatedAt = new Date();
      return { version: structure.version };
    },

    async assignSalary(write: SalaryAssignmentWrite) {
      const employee = [...employees.values()].find(
        (candidate) =>
          candidate.id === write.employeeId && candidate.institutionId === write.institutionId,
      );
      if (employee === undefined) {
        throw new NotFoundError("Employee does not exist.");
      }
      if (currentAssignment(write.employeeId) !== undefined) {
        // `salary_assignments_one_current_key`: end the current assignment before making another.
        throw conflict("This employee already has a current salary assignment.", {
          userMessage: "End the current salary assignment before assigning a new one.",
        });
      }
      const structure =
        write.salaryStructureId === null ? null : structures.get(write.salaryStructureId);
      const id = randomUUID();
      assignments.set(id, {
        id,
        institutionId: write.institutionId,
        employeeId: write.employeeId,
        salaryStructureId: write.salaryStructureId,
        salaryStructureName: structure?.name ?? null,
        amount: write.amount,
        currency: write.currency,
        overridesStructure: write.overridesStructure,
        effectiveFrom: write.effectiveFrom,
        effectiveTo: write.effectiveTo,
        approvedByUserName: null,
        updatedAt: new Date(),
      });
      return { id };
    },

    async endSalaryAssignment(end: SalaryAssignmentEnd) {
      const assignment = assignments.get(end.salaryAssignmentId);
      if (assignment === undefined || assignment.institutionId !== end.institutionId) return null;
      if (assignment.updatedAt.getTime() !== end.expectedUpdatedAt.getTime()) {
        throw conflict("This assignment was changed by someone else.", {
          userMessage:
            "This salary assignment was changed by someone else. Refresh the page and try again.",
        });
      }
      assignment.effectiveTo = end.effectiveTo;
      assignment.updatedAt = new Date();
      return { id: assignment.id };
    },
  };
}
