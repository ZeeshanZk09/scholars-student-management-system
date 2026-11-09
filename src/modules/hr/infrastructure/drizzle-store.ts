/**
 * The Drizzle implementation of {@link HrStore} — the only file in the HR module that imports
 * `@/db/client` or the table objects (`src/modules/README.md`: ports in, Drizzle out). Its
 * responsibilities mirror the fee, admission and finance stores' (`RULES.md` §15: the database is
 * the source of truth for integrity), with four this module states explicitly:
 *
 * 1. **Tenant guards.** Every read and write carries `institution_id` in its own WHERE clause.
 *    There is no unscoped read or write (`SECURITY.md` §21) — an institution may not see, let
 *    alone move, another institution's staff or their salaries.
 * 2. **Creating an employee is one transaction** (`ADR-0002`): the `users` row, the credential, the
 *    live `user_roles` grant for the role the employee type implies, the `employees` profile and
 *    the first `employee_status_history` row. A credential without its account, or an account
 *    without its employment record, is a state no later request can repair, so neither is
 *    reachable — the transaction is what makes that true.
 * 3. **Versioned writes take `expectedVersion`** and re-guard the UPDATE in its WHERE clause, so
 *    a write racing between the load and the update cannot land silently. `salary_assignments`
 *    carries no version column of its own — its guarantee is the
 *    `salary_assignments_one_current_key` partial unique index — so ending one is guarded on its
 *    `updatedAt`, which is the only monotonic stamp it has.
 * 4. **Nothing is deleted.** Status changes append a history row; salary changes close a dated
 *    row by setting `effective_to` (`ARCHITECTURE.md` §20). The only deletes any of this file
 *    issues are none: an `employees` row that cascades is the institution's own teardown.
 *
 * Unique conflicts arrive as PostgreSQL `23505` and are translated to a `ConflictError` that names
 * what collided — {@link uniqueConflictError} reads the constraint out of the driver's message,
 * because the same code covers an e-mail already in use, a staff number already in use, and a
 * second current salary assignment. Everything else propagates.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import type { DbLike } from "@/db/client";
import {
  departments,
  designations,
  employeeStatusHistory,
  employees,
  roles,
  salaryAssignments,
  salaryStructures,
  users,
  userCredentials,
  userRoles,
} from "@/db/schema";
import { ConflictError, InternalError, NotFoundError } from "@/shared/errors";

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
  StoredCredential,
} from "../application/ports";

/**
 * PostgreSQL's unique-violation code.
 *
 * Exported so the store's own unit tests can verify the constraint-to-message mapping without a
 * driver (see `drizzle-store.test.ts`); the mapping is what a user reads when two people file the
 * same staff member at the same moment.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "23505"
  );
}

/** The constraint a `23505` reports, read out of the driver's message. */
function constraintOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const message =
    "message" in error ? (error as { readonly message?: unknown }).message : undefined;
  if (typeof message !== "string") return undefined;
  const match = /unique constraint "([^"]+)"/i.exec(message);
  return match?.[1];
}

/**
 * The user-facing half of a unique violation, by constraint.
 *
 * The alternative — surfacing PostgreSQL's text — says `users_email_lower_key` to somebody who
 * typed a second `ayesha.khan@example.edu`. `undefined` for a constraint this module does not
 * know, so the caller rethrows rather than guessing.
 */
export function uniqueConflictError(error: unknown): ConflictError | undefined {
  const constraint = constraintOf(error);
  switch (constraint) {
    case "users_email_lower_key":
      return new ConflictError("An account with this email already exists.", {
        userMessage: "An account with this email already exists. Use another address.",
      });
    case "employees_institution_code_key":
      return new ConflictError("This employee code is already in use.", {
        userMessage: "This employee code is already in use. Choose another one.",
      });
    case "salary_assignments_one_current_key":
      return new ConflictError("This employee already has a current salary assignment.", {
        userMessage:
          "This employee already has a current salary assignment. End it before assigning another.",
      });
    default:
      return undefined;
  }
}

/** A version-guarded write that touched no row: stale write, or the row is gone. */
async function expectVersionedRow(
  rows: readonly { readonly id: string }[],
  label: string,
): Promise<void> {
  if (rows.length > 0) return;
  throw new ConflictError(`${label} was changed by someone else.`, {
    userMessage: `This ${label.toLowerCase()} was changed by someone else. Refresh the page and try again.`,
  });
}

/**
 * The role bundle an employee's account holds, for the employee list.
 *
 * A user may hold several live grants — a teacher who also does the accounts holds two — so the
 * list shows one: the alphabetically first slug, scoped to this institution or platform-wide.
 * Showing all of them is the roles screen's job (`/admin/roles`), not a staff list's.
 */
const roleSlugOf = (institutionId: string) =>
  sql<string | null>`(
    select min(r.slug)
    from ${userRoles} ur
    inner join ${roles} r on r.id = ur.role_id
    where ur.user_id = ${users.id}
      and ur.revoked_at is null
      and (ur.institution_id = ${institutionId} or ur.institution_id is null)
  )`.as("role_slug");

/** The current assignment's override amount, and its currency — null when none is current. */
const currentAmountOf = sql<
  string | null
>`(select a.amount from ${salaryAssignments} a where a.employee_id = ${employees.id} and a.effective_to is null order by a.effective_from desc limit 1)`.as(
  "current_salary_amount",
);

const currentCurrencyOf = sql<
  string | null
>`(select a.currency from ${salaryAssignments} a where a.employee_id = ${employees.id} and a.effective_to is null order by a.effective_from desc limit 1)`.as(
  "current_salary_currency",
);

export function createHrStore(executor: DbLike): HrStore {
  return {
    /* ---- Reads ------------------------------------------------------------ */

    async listEmployees(institutionId) {
      const rows = await executor
        .select({
          id: employees.id,
          institutionId: employees.institutionId,
          userId: employees.userId,
          fullName: users.name,
          email: users.email,
          employeeCode: employees.employeeCode,
          employeeType: employees.employeeType,
          employmentType: employees.employmentType,
          status: employees.status,
          departmentId: employees.departmentId,
          departmentName: departments.name,
          designationId: employees.designationId,
          designationName: designations.name,
          joiningDate: employees.joiningDate,
          leavingDate: employees.leavingDate,
          bankAccountIban: employees.bankAccountIban,
          emergencyContactName: employees.emergencyContactName,
          emergencyContactPhone: employees.emergencyContactPhone,
          notes: employees.notes,
          currentSalaryAmount: currentAmountOf,
          currentSalaryCurrency: currentCurrencyOf,
          roleSlug: roleSlugOf(institutionId),
          updatedAt: employees.updatedAt,
          version: employees.version,
        })
        .from(employees)
        .innerJoin(users, eq(users.id, employees.userId))
        .leftJoin(departments, eq(departments.id, employees.departmentId))
        .leftJoin(designations, eq(designations.id, employees.designationId))
        .where(eq(employees.institutionId, institutionId))
        .orderBy(asc(employees.employeeCode));

      return rows.map((row): EmployeeListRow => {
        return {
          id: row.id,
          institutionId: row.institutionId,
          userId: row.userId,
          fullName: row.fullName,
          email: row.email,
          employeeCode: row.employeeCode,
          employeeType: row.employeeType,
          employmentType: row.employmentType,
          status: row.status,
          departmentId: row.departmentId,
          departmentName: row.departmentName,
          designationId: row.designationId,
          designationName: row.designationName,
          joiningDate: row.joiningDate,
          leavingDate: row.leavingDate,
          bankAccountIban: row.bankAccountIban,
          emergencyContactName: row.emergencyContactName,
          emergencyContactPhone: row.emergencyContactPhone,
          notes: row.notes,
          currentSalaryAmount: row.currentSalaryAmount,
          currentSalaryCurrency: row.currentSalaryCurrency,
          roleSlug: row.roleSlug,
          updatedAt: row.updatedAt,
          version: row.version,
        };
      });
    },

    async getEmployee(institutionId, employeeId) {
      const rows = await executor
        .select({
          id: employees.id,
          institutionId: employees.institutionId,
          userId: employees.userId,
          fullName: users.name,
          email: users.email,
          employeeCode: employees.employeeCode,
          employeeType: employees.employeeType,
          employmentType: employees.employmentType,
          status: employees.status,
          departmentId: employees.departmentId,
          departmentName: departments.name,
          designationId: employees.designationId,
          designationName: designations.name,
          joiningDate: employees.joiningDate,
          leavingDate: employees.leavingDate,
          bankAccountIban: employees.bankAccountIban,
          emergencyContactName: employees.emergencyContactName,
          emergencyContactPhone: employees.emergencyContactPhone,
          notes: employees.notes,
          currentSalaryAmount: currentAmountOf,
          currentSalaryCurrency: currentCurrencyOf,
          roleSlug: roleSlugOf(institutionId),
          updatedAt: employees.updatedAt,
          version: employees.version,
        })
        .from(employees)
        .innerJoin(users, eq(users.id, employees.userId))
        .leftJoin(departments, eq(departments.id, employees.departmentId))
        .leftJoin(designations, eq(designations.id, employees.designationId))
        .where(and(eq(employees.id, employeeId), eq(employees.institutionId, institutionId)))
        .limit(1);

      const row = rows[0];
      if (row === undefined) return null;

      const [eventRows, assignmentRows] = await Promise.all([
        executor
          .select({
            id: employeeStatusHistory.id,
            fromStatus: employeeStatusHistory.fromStatus,
            toStatus: employeeStatusHistory.toStatus,
            changedAt: employeeStatusHistory.changedAt,
            changedByUserName: users.name,
            notes: employeeStatusHistory.notes,
          })
          .from(employeeStatusHistory)
          .innerJoin(employees, eq(employees.id, employeeStatusHistory.employeeId))
          .leftJoin(users, eq(users.id, employeeStatusHistory.changedByUserId))
          .where(
            and(
              eq(employeeStatusHistory.employeeId, employeeId),
              eq(employees.institutionId, institutionId),
            ),
          )
          .orderBy(asc(employeeStatusHistory.changedAt)),
        executor
          .select({
            id: salaryAssignments.id,
            institutionId: salaryAssignments.institutionId,
            employeeId: salaryAssignments.employeeId,
            salaryStructureId: salaryAssignments.salaryStructureId,
            salaryStructureName: salaryStructures.name,
            amount: salaryAssignments.amount,
            currency: salaryAssignments.currency,
            overridesStructure: salaryAssignments.overridesStructure,
            effectiveFrom: salaryAssignments.effectiveFrom,
            effectiveTo: salaryAssignments.effectiveTo,
            approvedByUserName: users.name,
            updatedAt: salaryAssignments.updatedAt,
          })
          .from(salaryAssignments)
          .leftJoin(salaryStructures, eq(salaryStructures.id, salaryAssignments.salaryStructureId))
          .leftJoin(users, eq(users.id, salaryAssignments.approvedByUserId))
          .where(
            and(
              eq(salaryAssignments.employeeId, employeeId),
              eq(salaryAssignments.institutionId, institutionId),
              isNull(salaryAssignments.effectiveTo),
            ),
          ),
      ]);

      const statusHistory: readonly EmployeeStatusEvent[] = eventRows.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        changedAt: event.changedAt,
        changedByUserName: event.changedByUserName,
        notes: event.notes,
      }));
      const currentSalary: readonly SalaryAssignmentRow[] = assignmentRows.map((assignment) => ({
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
      }));

      const detail: EmployeeDetailRow = {
        id: row.id,
        institutionId: row.institutionId,
        userId: row.userId,
        fullName: row.fullName,
        email: row.email,
        employeeCode: row.employeeCode,
        employeeType: row.employeeType,
        employmentType: row.employmentType,
        status: row.status,
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        designationId: row.designationId,
        designationName: row.designationName,
        joiningDate: row.joiningDate,
        leavingDate: row.leavingDate,
        bankAccountIban: row.bankAccountIban,
        emergencyContactName: row.emergencyContactName,
        emergencyContactPhone: row.emergencyContactPhone,
        notes: row.notes,
        currentSalaryAmount: row.currentSalaryAmount,
        currentSalaryCurrency: row.currentSalaryCurrency,
        roleSlug: row.roleSlug,
        updatedAt: row.updatedAt,
        version: row.version,
        statusHistory,
        currentSalary,
      };
      return detail;
    },

    async listSalaryStructures(institutionId) {
      const rows = await executor
        .select({
          id: salaryStructures.id,
          institutionId: salaryStructures.institutionId,
          name: salaryStructures.name,
          structure: salaryStructures.structure,
          designationId: salaryStructures.designationId,
          designationName: designations.name,
          departmentId: salaryStructures.departmentId,
          departmentName: departments.name,
          employeeType: salaryStructures.employeeType,
          amount: salaryStructures.amount,
          currency: salaryStructures.currency,
          unitRate: salaryStructures.unitRate,
          periodsPerDay: salaryStructures.periodsPerDay,
          workingDaysPerMonth: salaryStructures.workingDaysPerMonth,
          effectiveFrom: salaryStructures.effectiveFrom,
          effectiveTo: salaryStructures.effectiveTo,
          updatedAt: salaryStructures.updatedAt,
          version: salaryStructures.version,
        })
        .from(salaryStructures)
        .leftJoin(designations, eq(designations.id, salaryStructures.designationId))
        .leftJoin(departments, eq(departments.id, salaryStructures.departmentId))
        .where(eq(salaryStructures.institutionId, institutionId))
        .orderBy(asc(salaryStructures.effectiveFrom));

      return rows.map((row): SalaryStructureRow => {
        return {
          id: row.id,
          institutionId: row.institutionId,
          name: row.name,
          structure: row.structure,
          designationId: row.designationId,
          designationName: row.designationName,
          departmentId: row.departmentId,
          departmentName: row.departmentName,
          employeeType: row.employeeType,
          amount: row.amount,
          currency: row.currency,
          unitRate: row.unitRate,
          periodsPerDay: row.periodsPerDay,
          workingDaysPerMonth: row.workingDaysPerMonth,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          updatedAt: row.updatedAt,
          version: row.version,
        };
      });
    },

    async listDepartmentOptions(institutionId) {
      const rows = await executor
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .where(and(eq(departments.institutionId, institutionId), isNull(departments.archivedAt)))
        .orderBy(asc(departments.name));
      return rows.map((row): ReferenceOption => ({ id: row.id, name: row.name }));
    },

    async listDesignationOptions(institutionId) {
      const rows = await executor
        .select({ id: designations.id, name: designations.name })
        .from(designations)
        .where(and(eq(designations.institutionId, institutionId), isNull(designations.archivedAt)))
        .orderBy(asc(designations.name));
      return rows.map((row): ReferenceOption => ({ id: row.id, name: row.name }));
    },

    async employeeSerial(institutionId) {
      const rows = await executor
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.institutionId, institutionId));
      return rows.length;
    },

    /* ---- Writes ----------------------------------------------------------- */

    async createEmployee(employee: NewEmployee) {
      return executor
        .transaction(async (tx) => {
          // `users_email_lower_key` is the backstop; a duplicate arrives here as 23505.
          const createdUsers = await tx
            .insert(users)
            .values({
              email: employee.email,
              name: employee.fullName,
              // `active` rather than the column's `invited` default: this account is provisioned
              // with its credential in the same breath, which is exactly the state `invited`
              // exists to represent *before*.
              status: "active",
              updatedAt: new Date(),
            })
            .returning({ id: users.id });

          const user = createdUsers[0];
          if (user === undefined) throw new InternalError("user insert returned no row");

          const credential: StoredCredential = employee.credential;
          await tx.insert(userCredentials).values({
            userId: user.id,
            passwordHash: credential.passwordHash,
            algorithm: credential.algorithm,
            parameters: credential.parameters,
            rotatedAt: new Date(),
            updatedAt: new Date(),
          });

          const roleRows = await tx
            .select({ id: roles.id })
            .from(roles)
            .where(and(eq(roles.slug, employee.roleSlug), isNull(roles.institutionId)))
            .limit(1);
          const role = roleRows[0];
          if (role === undefined) {
            // The platform seed creates every bundle `EMPLOYEE_TYPE_TO_ROLE_SLUG` names; a missing
            // one is an environment fault, not a user error.
            throw new NotFoundError(`Role ${employee.roleSlug} was not created by the seed.`);
          }

          await tx.insert(userRoles).values({
            userId: user.id,
            roleId: role.id,
            institutionId: employee.institutionId,
            grantedByUserId: employee.createdByUserId,
          });

          const createdEmployees = await tx
            .insert(employees)
            .values({
              institutionId: employee.institutionId,
              userId: user.id,
              employeeCode: employee.employeeCode,
              employeeType: employee.employeeType,
              employmentType: employee.employmentType,
              status: "active",
              departmentId: employee.departmentId,
              designationId: employee.designationId,
              joiningDate: employee.joiningDate,
              leavingDate: null,
              bankAccountIban: employee.bankAccountIban,
              emergencyContactName: employee.emergencyContactName,
              emergencyContactPhone: employee.emergencyContactPhone,
              notes: employee.notes,
              updatedAt: new Date(),
            })
            .returning({ id: employees.id });

          const created = createdEmployees[0];
          if (created === undefined) throw new InternalError("employee insert returned no row");

          // The initial appointment: `to_status` is where the employee starts, with no predecessor.
          await tx.insert(employeeStatusHistory).values({
            employeeId: created.id,
            fromStatus: null,
            toStatus: "active",
            changedByUserId: employee.createdByUserId,
          });

          return { id: created.id, userId: user.id };
        })
        .catch((error: unknown) => {
          // A duplicate e-mail or staff number, as the person who typed it would read it.
          const conflict = uniqueConflictError(error);
          if (conflict !== undefined) throw conflict;
          throw error;
        });
    },

    async updateEmployeeProfile(update: EmployeeProfileUpdate) {
      const updated = await executor
        .update(employees)
        .set({
          employeeType: update.employeeType,
          employmentType: update.employmentType,
          departmentId: update.departmentId,
          designationId: update.designationId,
          bankAccountIban: update.bankAccountIban,
          emergencyContactName: update.emergencyContactName,
          emergencyContactPhone: update.emergencyContactPhone,
          notes: update.notes,
          updatedAt: new Date(),
          version: sql`${employees.version} + 1`,
        })
        .where(
          and(
            eq(employees.id, update.employeeId),
            eq(employees.institutionId, update.institutionId),
            eq(employees.version, update.expectedVersion),
          ),
        )
        .returning({ id: employees.id, version: employees.version });

      await expectVersionedRow(updated, "Employee");
      const row = updated[0];
      if (row === undefined) throw new InternalError("employee update returned no row");
      return { version: row.version };
    },

    async changeEmployeeStatus(change: EmployeeStatusChange) {
      return executor.transaction(async (tx) => {
        const rows = await tx
          .select({ id: employees.id, version: employees.version, status: employees.status })
          .from(employees)
          .where(
            and(
              eq(employees.id, change.employeeId),
              eq(employees.institutionId, change.institutionId),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (row === undefined) {
          throw new NotFoundError("Employee does not exist.", {
            userMessage: "That employee is no longer available. Refresh the list and try again.",
          });
        }
        if (row.version !== change.expectedVersion) {
          throw new ConflictError(
            `Employee version mismatch (expected ${change.expectedVersion}, found ${row.version}).`,
            {
              userMessage:
                "Someone else changed this employee while you had it open. Reload to see the latest state.",
            },
          );
        }

        const updated = await tx
          .update(employees)
          .set({
            status: change.toStatus,
            leavingDate: change.leavingDate,
            updatedAt: new Date(),
            version: sql`${employees.version} + 1`,
          })
          .where(
            and(
              eq(employees.id, change.employeeId),
              eq(employees.institutionId, change.institutionId),
              eq(employees.version, change.expectedVersion),
            ),
          )
          .returning({ id: employees.id, version: employees.version });

        await expectVersionedRow(updated, "Employee");
        // The transition is the record. `update` moves the row; this row is the evidence — and it
        // says where the employee came from, which the row no longer does once it has moved.
        await tx.insert(employeeStatusHistory).values({
          employeeId: change.employeeId,
          fromStatus: row.status,
          toStatus: change.toStatus,
          changedByUserId: change.changedByUserId,
          notes: change.notes,
        });

        const updatedRow = updated[0];
        if (updatedRow === undefined) throw new InternalError("employee update returned no row");
        return { version: updatedRow.version };
      });
    },

    async createSalaryStructure(write: SalaryStructureWrite) {
      const inserted = await executor
        .insert(salaryStructures)
        .values({
          institutionId: write.institutionId,
          name: write.name,
          structure: write.structure,
          designationId: write.designationId,
          departmentId: write.departmentId,
          employeeType: write.employeeType,
          amount: write.amount,
          currency: write.currency,
          unitRate: write.unitRate,
          periodsPerDay: write.periodsPerDay,
          workingDaysPerMonth: write.workingDaysPerMonth,
          effectiveFrom: write.effectiveFrom,
          effectiveTo: write.effectiveTo,
          updatedAt: new Date(),
        })
        .returning({ id: salaryStructures.id });

      const row = inserted[0];
      if (row === undefined) throw new InternalError("salary structure insert returned no row");
      return { id: row.id };
    },

    async updateSalaryStructure(update: SalaryStructureUpdate) {
      const updated = await executor
        .update(salaryStructures)
        .set({
          name: update.name,
          structure: update.structure,
          designationId: update.designationId,
          departmentId: update.departmentId,
          employeeType: update.employeeType,
          amount: update.amount,
          currency: update.currency,
          unitRate: update.unitRate,
          periodsPerDay: update.periodsPerDay,
          workingDaysPerMonth: update.workingDaysPerMonth,
          effectiveFrom: update.effectiveFrom,
          effectiveTo: update.effectiveTo,
          updatedAt: new Date(),
          version: sql`${salaryStructures.version} + 1`,
        })
        .where(
          and(
            eq(salaryStructures.id, update.salaryStructureId),
            eq(salaryStructures.institutionId, update.institutionId),
            eq(salaryStructures.version, update.expectedVersion),
          ),
        )
        .returning({ id: salaryStructures.id, version: salaryStructures.version });

      await expectVersionedRow(updated, "Salary structure");
      const row = updated[0];
      if (row === undefined) throw new InternalError("salary structure update returned no row");
      return { version: row.version };
    },

    async assignSalary(write: SalaryAssignmentWrite) {
      const inserted = await executor
        .insert(salaryAssignments)
        .values({
          institutionId: write.institutionId,
          employeeId: write.employeeId,
          salaryStructureId: write.salaryStructureId,
          amount: write.amount,
          currency: write.currency,
          overridesStructure: write.overridesStructure,
          effectiveFrom: write.effectiveFrom,
          effectiveTo: write.effectiveTo,
          approvedByUserId: write.approvedByUserId,
          updatedAt: new Date(),
        })
        .returning({ id: salaryAssignments.id });

      const row = inserted[0];
      if (row === undefined) throw new InternalError("salary assignment insert returned no row");
      return { id: row.id };
    },

    async endSalaryAssignment(end: SalaryAssignmentEnd) {
      const updated = await executor
        .update(salaryAssignments)
        .set({ effectiveTo: end.effectiveTo, updatedAt: new Date() })
        .where(
          and(
            eq(salaryAssignments.id, end.salaryAssignmentId),
            eq(salaryAssignments.institutionId, end.institutionId),
            eq(salaryAssignments.updatedAt, end.expectedUpdatedAt),
          ),
        )
        .returning({ id: salaryAssignments.id });

      const row = updated[0];
      if (row === undefined) return null;
      return { id: row.id };
    },
  };
}

/** The store the module wires into its service — the pooled client, not a transaction scope. */
export const drizzleHrStore: HrStore = createHrStore(db);
