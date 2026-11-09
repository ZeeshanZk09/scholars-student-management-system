/**
 * Select-option builders for the HR dialogs (`PRD.md` MODULE 8 UI).
 *
 * Pure values over this module's domain tuples — imported from `domain/employee-rules`, never the
 * barrel, so the file is safe for `"use client"` dialogs (`index.ts` header: the barrel re-exports
 * the Drizzle store, which cannot reach the browser). Labels come from the domain's display maps,
 * where every HR tuple already has one, so the database keeps the key and the form shows the words.
 *
 * The builders that take an argument stay here rather than in the pages: a caller must not rebuild
 * an option list with its own idea of what a designation or a salary structure is.
 */
import type { SelectOption } from "@/components/shared/select-field";

import type { EmployeeListRow, ReferenceOption, SalaryStructureRow } from "../index";
import {
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_TYPES,
  EMPLOYEE_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  SALARY_STRUCTURES,
  SALARY_STRUCTURE_LABELS,
} from "../domain/employee-rules";

/** `PRD.md` MODULE 8 lists exactly these categories of staff. */
export const EMPLOYEE_TYPE_OPTIONS: readonly SelectOption[] = EMPLOYEE_TYPES.map((value) => ({
  value,
  label: EMPLOYEE_TYPE_LABELS[value],
}));

/** The engagement an employee is hired under. */
export const EMPLOYMENT_TYPE_OPTIONS: readonly SelectOption[] = EMPLOYMENT_TYPES.map((value) => ({
  value,
  label: EMPLOYMENT_TYPE_LABELS[value],
}));

/**
 * The status a lifecycle change may target, for the departure dialog.
 *
 * Every status is offered here — the service refuses the edges the state machine does not allow,
 * so the user learns "a resigned employee cannot be reactivated" from an answer rather than from a
 * control that silently is not there.
 */
export const EMPLOYEE_STATUS_OPTIONS: readonly SelectOption[] = EMPLOYEE_STATUSES.map((value) => ({
  value,
  label: EMPLOYEE_STATUS_LABELS[value],
}));

/** How a role of employee is paid. */
export const SALARY_STRUCTURE_OPTIONS: readonly SelectOption[] = SALARY_STRUCTURES.map((value) => ({
  value,
  label: SALARY_STRUCTURE_LABELS[value],
}));

/** A blank means "no department" — a school of 15 often has none (`hr.ts` on `department_id`). */
export function departmentOptions(
  departments: readonly ReferenceOption[],
): readonly SelectOption[] {
  return [{ value: "", label: "No department" }, ...departments.map(toOption)];
}

/** A blank means "no designation" — the title is entered when the institution has none yet. */
export function designationOptions(
  designations: readonly ReferenceOption[],
): readonly SelectOption[] {
  return [{ value: "", label: "No designation" }, ...designations.map(toOption)];
}

/**
 * One option per salary structure, labelled with its dimension so two structures for the same
 * institution are distinguishable at a glance.
 */
export function salaryStructureOptions(
  structures: readonly SalaryStructureRow[],
): readonly SelectOption[] {
  return [
    { value: "", label: "No structure (negotiated amount)" },
    ...structures.map((structure) => ({
      value: structure.id,
      label: `${structure.name} — ${structure.currency} ${structure.amount}`,
    })),
  ];
}

/** The employees an assignment dialog may name — the same list the employees page renders. */
export function employeeOptions(employees: readonly EmployeeListRow[]): readonly SelectOption[] {
  return employees.map((employee) => ({
    value: employee.id,
    label: `${employee.fullName} (${employee.employeeCode})`,
  }));
}

function toOption(reference: ReferenceOption): SelectOption {
  return { value: reference.id, label: reference.name };
}
