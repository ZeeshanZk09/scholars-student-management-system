/**
 * The HR module's use cases (`PRD.md` MODULE 8, `PHASES.md` #19 Phase 11).
 *
 * Workflow tests against the in-memory `HrStore` — no database, exactly like the fee, admission
 * and finance service tests. What is asserted here is the module's three promises: an employee is
 * created *with* the account they sign in as (`ADR-0002`), their employment history only grows
 * (`RULES.md` §51), and salary configuration is dated rather than edited
 * (`ARCHITECTURE.md` §20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";

import { createHrService } from "./hr-service";
import { createFakeHrStore, type FakeHrStore } from "./testing/fakes";
import type { StoredCredential } from "./ports";
import { calendarDateString } from "../domain/employee-rules";

const INSTITUTION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const ACTOR = "5f6d4c8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const DEPARTMENT = { id: "11111111-1111-4111-8111-111111111111", name: "Academics" };
const DESIGNATION = { id: "22222222-2222-4222-8222-222222222222", name: "Senior Teacher" };

/** A stand-in for the auth module's Argon2 hasher: never stores the plaintext, never reverses. */
async function hashPassword(password: string): Promise<StoredCredential> {
  const digest = Buffer.from(password, "utf8").toString("base64");
  return {
    passwordHash: `argon2id$${digest}`,
    algorithm: "argon2id",
    parameters: {},
  };
}

const hr = (store: FakeHrStore) => createHrService(store, { hashPassword });

function newEmployee(overrides: Record<string, unknown> = {}) {
  return {
    institutionId: INSTITUTION_ID,
    email: "ayesha.khan@example.edu",
    fullName: "Ayesha Khan",
    initialPassword: "correct horse battery",
    employeeType: "teacher",
    employmentType: "full_time",
    joiningDate: "2026-02-01",
    ...overrides,
  };
}

describe("creating an employee creates the account they sign in with", () => {
  let store: FakeHrStore;

  beforeEach(() => {
    store = createFakeHrStore();
  });

  it("provisions the account, the credential and the employment record together", async () => {
    const service = hr(store);
    const created = await service.createEmployee(newEmployee(), { userId: ACTOR });

    expect(created.employeeCode).toMatch(/^EP-\d{6}$/);

    const [user] = store.users;
    expect(user).toBeDefined();
    expect(user?.email).toBe("ayesha.khan@example.edu");
    expect(user?.passwordHash).not.toContain("correct horse battery");
    expect(user?.passwordHash.startsWith("argon2id$")).toBe(true);
    expect(user?.algorithm).toBe("argon2id");
    expect(user?.roleSlug).toBe("teacher");

    const detail = await service.getEmployee({
      institutionId: INSTITUTION_ID,
      employeeId: created.id,
    });
    expect(detail.status).toBe("active");
    expect(detail.joiningDate).toBe("2026-02-01");
    expect(detail.statusHistory).toHaveLength(1);
    expect(detail.statusHistory[0]?.fromStatus).toBeNull();
    expect(detail.statusHistory[0]?.toStatus).toBe("active");
  });

  it("numbers staff in the institution's own sequence, and honours a typed code", async () => {
    const service = hr(store);
    const first = await service.createEmployee(newEmployee(), { userId: ACTOR });
    const second = await service.createEmployee(
      newEmployee({ email: "other@example.edu", fullName: "Other Person" }),
      { userId: ACTOR },
    );

    expect(first.employeeCode).toBe("EP-000001");
    expect(second.employeeCode).toBe("EP-000002");

    const typed = await service.createEmployee(
      newEmployee({
        email: "typed@example.edu",
        fullName: "Typed Code",
        employeeCode: "EP-0100",
      }),
      { userId: ACTOR },
    );
    expect(typed.employeeCode).toBe("EP-0100");
  });

  it("maps every employee type to its role bundle", async () => {
    const service = hr(store);
    const types = [
      ["teacher", "teacher"],
      ["accountant", "accountant"],
      ["floor_incharge", "floor-incharge"],
      ["hr", "hr"],
      ["admin", "admin"],
      ["other_staff", "other-staff"],
    ] as const;

    let index = 0;
    for (const [employeeType, roleSlug] of types) {
      const created = await service.createEmployee(
        newEmployee({ employeeType, email: `${employeeType}@example.edu`, fullName: employeeType }),
        { userId: ACTOR },
      );
      const detail = await service.getEmployee({
        institutionId: INSTITUTION_ID,
        employeeId: created.id,
      });
      expect(detail.roleSlug).toBe(roleSlug);
      index += 1;
    }
    expect(index).toBe(types.length);
  });

  it("refuses a second account with the same email", async () => {
    const service = hr(store);
    await service.createEmployee(newEmployee(), { userId: ACTOR });
    await expect(
      service.createEmployee(newEmployee({ employeeType: "accountant", fullName: "Same Email" }), {
        userId: ACTOR,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a staff number the institution already uses", async () => {
    const service = hr(store);
    await service.createEmployee(newEmployee({ employeeCode: "EP-9000" }), { userId: ACTOR });
    await expect(
      service.createEmployee(
        newEmployee({ email: "duplicate@example.edu", employeeCode: "EP-9000" }),
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a hiring date that is a typo, and a password the policy will not accept", async () => {
    const service = hr(store);
    await expect(
      service.createEmployee(newEmployee({ joiningDate: "2028-06-01" }), { userId: ACTOR }),
    ).rejects.toThrow(ValidationError);
    await expect(
      service.createEmployee(newEmployee({ initialPassword: "short" }), { userId: ACTOR }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses an unauthenticated creation", async () => {
    const service = hr(store);
    await expect(service.createEmployee(newEmployee(), { userId: null })).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("editing an employee profile", () => {
  let store: FakeHrStore;
  let employeeId: string;

  beforeEach(async () => {
    store = createFakeHrStore();
    store.seedOptions([DEPARTMENT], [DESIGNATION]);
    const created = await hr(store).createEmployee(newEmployee(), { userId: ACTOR });
    employeeId = created.id;
  });

  it("edits the employment record and bumps its version", async () => {
    const service = hr(store);
    const result = await service.updateEmployeeProfile(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        employeeType: "teacher",
        employmentType: "part_time",
        departmentId: DEPARTMENT.id,
        designationId: DESIGNATION.id,
        bankAccountIban: "PK36SCBL0000001123456702",
        emergencyContactName: "Bilal Khan",
        emergencyContactPhone: "+923001234567",
        notes: "Teaches mathematics.",
        expectedVersion: 1,
      },
      { userId: ACTOR },
    );

    expect(result.version).toBe(2);

    const detail = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(detail.employmentType).toBe("part_time");
    expect(detail.departmentName).toBe("Academics");
    expect(detail.designationName).toBe("Senior Teacher");
    expect(detail.bankAccountIban).toBe("PK36SCBL0000001123456702");
    expect(detail.notes).toBe("Teaches mathematics.");
  });

  it("never moves the staff number, the start date or the status", async () => {
    const service = hr(store);
    await service.updateEmployeeProfile(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        employeeType: "teacher",
        employmentType: "part_time",
        departmentId: null,
        designationId: null,
        bankAccountIban: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        expectedVersion: 1,
        employeeCode: "EP-XXXXXX",
        joiningDate: "2020-05-01",
        status: "resigned",
      },
      { userId: ACTOR },
    );

    const detail = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(detail.employeeCode).toMatch(/^EP-\d{6}$/);
    expect(detail.joiningDate).toBe("2026-02-01");
    expect(detail.status).toBe("active");
  });

  it("refuses a stale write", async () => {
    const service = hr(store);
    await expect(
      service.updateEmployeeProfile(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          employeeType: "teacher",
          employmentType: "full_time",
          departmentId: null,
          designationId: null,
          bankAccountIban: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          notes: null,
          expectedVersion: 99,
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses an employee that is not there", async () => {
    const service = hr(store);
    await expect(
      service.updateEmployeeProfile(
        {
          institutionId: INSTITUTION_ID,
          employeeId: "00000000-0000-4000-8000-000000000000",
          employeeType: "teacher",
          employmentType: "full_time",
          departmentId: null,
          designationId: null,
          bankAccountIban: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          notes: null,
          expectedVersion: 1,
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("employment status changes", () => {
  let store: FakeHrStore;
  let service: ReturnType<typeof hr>;
  let employeeId: string;

  beforeEach(async () => {
    store = createFakeHrStore();
    service = hr(store);
    const created = await service.createEmployee(newEmployee(), { userId: ACTOR });
    employeeId = created.id;
  });

  it("records a leave of absence and the return from it", async () => {
    await service.changeEmployeeStatus(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        toStatus: "on_leave",
        expectedVersion: 1,
      },
      { userId: ACTOR },
    );
    const onLeave = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(onLeave.status).toBe("on_leave");
    expect(onLeave.leavingDate).toBeNull();

    await service.changeEmployeeStatus(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        toStatus: "active",
        expectedVersion: 2,
      },
      { userId: ACTOR },
    );
    const back = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(back.status).toBe("active");
    // The leave is not undone by editing a row: both directions are in the trail.
    expect(back.statusHistory.map((event) => event.toStatus)).toEqual([
      "active",
      "on_leave",
      "active",
    ]);
  });

  it("dates a departure on the day it is recorded", async () => {
    const today = calendarDateString(new Date());
    await service.changeEmployeeStatus(
      { institutionId: INSTITUTION_ID, employeeId, toStatus: "resigned", expectedVersion: 1 },
      { userId: ACTOR },
    );

    const resigned = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(resigned.status).toBe("resigned");
    expect(resigned.leavingDate).toBe(today);
    expect(resigned.statusHistory.at(-1)?.fromStatus).toBe("active");
  });

  it("refuses a leaving date on an employee who has not left", async () => {
    await expect(
      service.changeEmployeeStatus(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          toStatus: "on_leave",
          leavingDate: "2026-08-31",
          expectedVersion: 1,
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts an explicit leaving date on a departure", async () => {
    await service.changeEmployeeStatus(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        toStatus: "terminated",
        leavingDate: "2026-08-31",
        expectedVersion: 1,
      },
      { userId: ACTOR },
    );
    const terminated = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(terminated.leavingDate).toBe("2026-08-31");
    expect(terminated.statusHistory.at(-1)?.notes).toBeNull();
  });

  it("treats a departure as final", async () => {
    await service.changeEmployeeStatus(
      { institutionId: INSTITUTION_ID, employeeId, toStatus: "retired", expectedVersion: 1 },
      { userId: ACTOR },
    );
    await expect(
      service.changeEmployeeStatus(
        { institutionId: INSTITUTION_ID, employeeId, toStatus: "active", expectedVersion: 2 },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("refuses a repeated transition to the same status", async () => {
    await expect(
      service.changeEmployeeStatus(
        { institutionId: INSTITUTION_ID, employeeId, toStatus: "active", expectedVersion: 1 },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("refuses a stale write", async () => {
    await expect(
      service.changeEmployeeStatus(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          toStatus: "on_leave",
          expectedVersion: 42,
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ConflictError);
  });
});

describe("salary configuration", () => {
  let store: FakeHrStore;
  let service: ReturnType<typeof hr>;
  let employeeId: string;

  beforeEach(async () => {
    store = createFakeHrStore();
    store.seedOptions([DEPARTMENT], [DESIGNATION]);
    service = hr(store);
    const created = await service.createEmployee(newEmployee(), { userId: ACTOR });
    employeeId = created.id;
  });

  const fixedStructure = {
    institutionId: INSTITUTION_ID,
    name: "Teacher pay",
    structure: "fixed",
    designationId: DESIGNATION.id,
    amount: "60000.00",
    currency: "PKR",
    effectiveFrom: "2026-01-01",
  };

  it("creates a structure and lists it with its dimension", async () => {
    const created = await service.createSalaryStructure(fixedStructure, { userId: ACTOR });
    const structures = await service.listSalaryStructures({ institutionId: INSTITUTION_ID });

    expect(structures).toHaveLength(1);
    expect(structures[0]?.id).toBe(created.id);
    expect(structures[0]?.designationName).toBe("Senior Teacher");
    expect(structures[0]?.amount).toBe("60000.00");
    expect(structures[0]?.effectiveTo).toBeNull();
  });

  it("requires every denominator of a unit-based structure", async () => {
    for (const missing of ["unitRate", "periodsPerDay", "workingDaysPerMonth"] as const) {
      await expect(
        service.createSalaryStructure(
          {
            ...fixedStructure,
            name: `Unit based ${missing}`,
            structure: "unit_based",
            employeeType: "teacher",
            unitRate: "1200.00",
            periodsPerDay: 8,
            workingDaysPerMonth: 26,
            [missing]: null,
          },
          { userId: ACTOR },
        ),
      ).rejects.toThrow(ValidationError);
    }
    const accepted = await service.createSalaryStructure(
      {
        ...fixedStructure,
        name: "Unit based",
        structure: "unit_based",
        employeeType: "teacher",
        unitRate: "1200.00",
        periodsPerDay: 8,
        workingDaysPerMonth: 26,
      },
      { userId: ACTOR },
    );
    expect(accepted.id).toBeDefined();
  });

  it("refuses a structure that points at nothing", async () => {
    await expect(
      service.createSalaryStructure(
        { ...fixedStructure, name: "Everyone", designationId: null, departmentId: null },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("edits a dated structure, and refuses a stale edit", async () => {
    const created = await service.createSalaryStructure(fixedStructure, { userId: ACTOR });
    const edited = await service.updateSalaryStructure(
      {
        institutionId: INSTITUTION_ID,
        salaryStructureId: created.id,
        expectedVersion: 1,
        name: "Teacher pay (2026)",
        structure: "fixed",
        designationId: DESIGNATION.id,
        departmentId: null,
        employeeType: null,
        amount: "64000.00",
        currency: "PKR",
        unitRate: null,
        periodsPerDay: null,
        workingDaysPerMonth: null,
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
      },
      { userId: ACTOR },
    );
    expect(edited.version).toBe(2);

    await expect(
      service.updateSalaryStructure(
        {
          institutionId: INSTITUTION_ID,
          salaryStructureId: created.id,
          expectedVersion: 1,
          name: "Reverted",
          structure: "fixed",
          designationId: DESIGNATION.id,
          departmentId: null,
          employeeType: null,
          amount: "60000.00",
          currency: "PKR",
          unitRate: null,
          periodsPerDay: null,
          workingDaysPerMonth: null,
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("assigns a structure, then lets an override replace its figure", async () => {
    const structureId = await service.createSalaryStructure(fixedStructure, { userId: ACTOR });
    const assigned = await service.assignSalary(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        salaryStructureId: structureId.id,
        currency: "PKR",
        overridesStructure: false,
        effectiveFrom: "2026-02-01",
      },
      { userId: ACTOR },
    );

    let detail = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(detail.currentSalary).toHaveLength(1);
    expect(detail.currentSalary[0]?.amount).toBeNull();
    expect(detail.currentSalary[0]?.salaryStructureName).toBe("Teacher pay");

    await service.endSalaryAssignment(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        salaryAssignmentId: assigned.id,
        effectiveTo: "2026-06-30",
        expectedUpdatedAt: store.assignments[0]?.updatedAt,
      },
      { userId: ACTOR },
    );

    const override = await service.assignSalary(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        salaryStructureId: structureId.id,
        amount: "72000.00",
        currency: "PKR",
        overridesStructure: true,
        effectiveFrom: "2026-07-01",
      },
      { userId: ACTOR },
    );
    expect(override.id).toBeDefined();

    detail = await service.getEmployee({ institutionId: INSTITUTION_ID, employeeId });
    expect(detail.currentSalary[0]?.amount).toBe("72000.00");
    expect(detail.currentSalary[0]?.overridesStructure).toBe(true);
    // The replaced assignment is closed, not deleted — the payslip that named it still resolves.
    const ended = store.assignments.filter((row) => row.effectiveTo !== null);
    expect(ended).toHaveLength(1);
    expect(ended[0]?.effectiveTo).toBe("2026-06-30");
  });

  it("refuses an override that does not name its figure, and a second current assignment", async () => {
    const structureId = await service.createSalaryStructure(fixedStructure, { userId: ACTOR });
    await expect(
      service.assignSalary(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          salaryStructureId: structureId.id,
          currency: "PKR",
          overridesStructure: true,
          effectiveFrom: "2026-02-01",
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ValidationError);

    await service.assignSalary(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        salaryStructureId: structureId.id,
        currency: "PKR",
        overridesStructure: false,
        effectiveFrom: "2026-02-01",
      },
      { userId: ACTOR },
    );
    await expect(
      service.assignSalary(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          salaryStructureId: structureId.id,
          currency: "PKR",
          overridesStructure: false,
          effectiveFrom: "2026-03-01",
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a structure or an employee that does not exist", async () => {
    await expect(
      service.assignSalary(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          salaryStructureId: "00000000-0000-4000-8000-000000000000",
          currency: "PKR",
          overridesStructure: false,
          effectiveFrom: "2026-02-01",
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(NotFoundError);

    await expect(
      service.assignSalary(
        {
          institutionId: INSTITUTION_ID,
          employeeId: "00000000-0000-4000-8000-000000000000",
          salaryStructureId: null,
          currency: "PKR",
          overridesStructure: false,
          effectiveFrom: "2026-02-01",
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses ending an assignment that is not current", async () => {
    await expect(
      service.endSalaryAssignment(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          salaryAssignmentId: "00000000-0000-4000-8000-000000000000",
          effectiveTo: "2026-06-30",
          expectedUpdatedAt: new Date(),
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses an end date on or before the day the assignment began", async () => {
    // `salary_assignments_effective_order_check` is the database's word for it; this is the
    // service's, said while the assignment is in hand.
    const structureId = await service.createSalaryStructure(fixedStructure, { userId: ACTOR });
    const assigned = await service.assignSalary(
      {
        institutionId: INSTITUTION_ID,
        employeeId,
        salaryStructureId: structureId.id,
        amount: "64000.00",
        currency: "PKR",
        overridesStructure: true,
        effectiveFrom: "2026-03-01",
      },
      { userId: ACTOR },
    );

    await expect(
      service.endSalaryAssignment(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          salaryAssignmentId: assigned.id,
          effectiveTo: "2026-03-01",
          expectedUpdatedAt: store.assignments[0]?.updatedAt,
        },
        { userId: ACTOR },
      ),
    ).rejects.toThrow(ValidationError);

    // The day after is the earliest the check admits, and the assignment survives the refusal.
    await expect(
      service.endSalaryAssignment(
        {
          institutionId: INSTITUTION_ID,
          employeeId,
          salaryAssignmentId: assigned.id,
          effectiveTo: "2026-03-02",
          expectedUpdatedAt: store.assignments[0]?.updatedAt,
        },
        { userId: ACTOR },
      ),
    ).resolves.toEqual({ id: assigned.id });
  });
});

describe("the read models", () => {
  it("lists the institution's staff in staff-number order, not in creation order", async () => {
    const store = createFakeHrStore();
    const service = hr(store);
    await service.createEmployee(newEmployee({ email: "second@example.edu", fullName: "Second" }), {
      userId: ACTOR,
    });
    await service.createEmployee(newEmployee({ email: "first@example.edu", fullName: "First" }), {
      userId: ACTOR,
    });

    const rows = await service.listEmployees({ institutionId: INSTITUTION_ID });
    // "Second" was hired first and holds EP-000001; the list follows the institution's own
    // numbering rather than the order the names happen to satisfy a reader.
    expect(rows.map((row) => row.employeeCode)).toEqual(["EP-000001", "EP-000002"]);
    expect(rows.map((row) => row.fullName)).toEqual(["Second", "First"]);
  });

  it("refuses an employee from another institution's scope", async () => {
    const store = createFakeHrStore();
    const service = hr(store);
    const created = await service.createEmployee(newEmployee(), { userId: ACTOR });

    await expect(
      service.getEmployee({
        institutionId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        employeeId: created.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
