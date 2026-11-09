"use client";

/**
 * HR form controls (`PRD.md` MODULE 8 UI).
 *
 * The pattern the fee, admission and finance modules settled on, matched to what each command *is*:
 *
 * - **Hiring an employee** is ordinary creation → `EntityDialog`, with the account fields the
 *   module demands because `ADR-0002` says an employee *is* an authenticated account: an e-mail,
 *   a name, and a provisional password that satisfies the auth module's policy (`schemas.ts`).
 * - **Editing a profile** does not offer the staff number, the start date or the status — those
 *   have their own writes (`ports.ts`), and a form that could move them would make every dates
 *   downstream of `joining_date` silently wrong.
 * - **A lifecycle change** is either one click (leaving for a leave of absence, returning) or a
 *   dated, reasoned departure (`RecordDepartureDialog`). Both are offered by *status* rather than
 *   by grant alone, because the state machine is the other half of what is legal
 *   (`hr-service.ts` re-checks it server-side).
 * - **Salary configuration** is dated data, so its forms state `effectiveFrom` and leave
 *   `effectiveTo` for closing a structure rather than deleting it (`ARCHITECTURE.md` §20).
 * - **Assigning a salary** and **ending one** are inline forms: an assignment names a structure or
 *   not, and ending one is a single dated click. Ending is rendered as a `destructive` trigger in
 *   its own row rather than beside the assignment, because it is the only reversible-looking thing
 *   here and the copy must say it closes the row.
 *
 * `canManage` and `canRecord` come from the page so a grant is not turned into a button the server
 * will refuse — courtesy only (`RULES.md` §19): every action re-checks its key server-side, and
 * the service re-checks the transition, the pairing and the version guards.
 *
 * Values travel as plain `FormData`. Import rule (`index.ts` header): types come from the barrel,
 * every value — labels, tuples — comes from `domain/employee-rules` or this module's
 * `form-options`, so this file never pulls the Drizzle store into the client bundle.
 */
import { useState } from "react";

import { EntityDialog } from "@/components/shared/entity-dialog";
import { useFormActionState, type FormState } from "@/components/shared/form-shell";
import { SelectField, type SelectOption } from "@/components/shared/select-field";
import { TextareaField, TextField } from "@/components/shared/text-field";
import { Button } from "@/components/ui/button";
import type {
  EmployeeDetailRow,
  EmployeeListRow,
  ReferenceOption,
  SalaryStructureRow,
} from "@/modules/hr";
import { IDLE_FORM_STATE } from "@/shared/forms";

import { calendarDateString } from "../domain/employee-rules";

import {
  assignSalaryAction,
  changeEmployeeStatusAction,
  createEmployeeAction,
  createSalaryStructureAction,
  endSalaryAssignmentAction,
  updateEmployeeProfileAction,
  updateSalaryStructureAction,
} from "./actions";
import {
  departmentOptions,
  designationOptions,
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYEE_TYPE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  SALARY_STRUCTURE_OPTIONS,
  salaryStructureOptions,
} from "./form-options";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

/** Today as `YYYY-MM-DD` — the default for a joining date or a dated departure. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The rendered outcome of an inline action, next to the button — the same `role="alert"` /
 * `role="status"` contract `FormShell` renders for a dialog. Duplicated rather than imported
 * because the shell's copy is welded to its submit button, and a table cell needs the message
 * beside its own control.
 */
function InlineOutcome({ state }: Readonly<{ state: FormState }>) {
  if (state.status === "error" && state.message.length > 0) {
    return (
      <>
        <span role="alert" className="text-xs text-destructive">
          {state.message}
        </span>
        {state.issues !== undefined && state.issues.length > 0 && (
          <ul className="list-inside list-disc text-xs text-destructive">
            {state.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </>
    );
  }
  if (state.status === "done") {
    return (
      <span role="status" className="text-xs text-muted-foreground">
        {state.message}
      </span>
    );
  }
  return null;
}

interface TransitionFormProps {
  readonly institutionId: string;
  readonly employeeId: string;
  readonly version: number;
  readonly action: (previous: FormState, formData: FormData) => Promise<FormState>;
  /** The status this one click moves to — the schema's own member, never the button text. */
  readonly toStatus: string;
  readonly label: string;
  readonly pendingLabel: string;
  readonly variant?: "default" | "outline" | "destructive";
}

function EmployeeTransitionForm({
  institutionId,
  employeeId,
  version,
  action,
  toStatus,
  label,
  pendingLabel,
  variant = "outline",
}: Readonly<TransitionFormProps>) {
  const [state, formAction, isPending] = useFormActionState(action, IDLE_FORM_STATE);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2"
      aria-busy={isPending}
      onSubmit={(event) => {
        if (isPending) event.preventDefault();
      }}
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="toStatus" value={toStatus} />
      <input type="hidden" name="version" value={version} />
      <Button
        type="submit"
        variant={variant}
        size="xs"
        aria-disabled={isPending}
        onClick={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        {isPending ? pendingLabel : label}
      </Button>
      <InlineOutcome state={state} />
      {/* Polite live region: pending is announced without the button leaving the tab order. */}
      <p role="status" className="sr-only">
        {isPending ? pendingLabel : ""}
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Hiring                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hiring: the account and the employment record, in one form.
 *
 * The password field is a *provisional* credential — the module's own hints say so, because the
 * person should change it at first sign-in and the form is often filled by HR on a new joiner's
 * behalf. Nothing else in the form is theirs to change once hired except the profile dialog.
 */
export function CreateEmployeeDialog({
  institutionId,
  departments,
  designations,
}: Readonly<{
  institutionId: string;
  departments: readonly ReferenceOption[];
  designations: readonly ReferenceOption[];
}>) {
  const departmentChoices: readonly SelectOption[] = departmentOptions(departments);
  const designationChoices: readonly SelectOption[] = designationOptions(designations);

  return (
    <EntityDialog
      triggerLabel="Hire employee"
      title="Hire an employee"
      description="Creates the employment record and the account they sign in with. The role bundle follows the employee type (a teacher may not log in as an accountant)."
      action={createEmployeeAction}
      submitLabel="Hire employee"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="hr-employee-fullName" name="fullName" label="Full name" required />
        <TextField
          id="hr-employee-email"
          name="email"
          label="Work email"
          type="email"
          hint="The address they sign in with. Must not already exist."
          required
        />
        <TextField
          id="hr-employee-initialPassword"
          name="initialPassword"
          label="Provisional password"
          type="password"
          hint="At least 12 characters. Ask them to change it at first sign-in."
          required
        />
        <TextField
          id="hr-employee-employeeCode"
          name="employeeCode"
          label="Staff number"
          hint="Leave blank to use the next number in this institution's sequence (EP-000001)."
        />
        <SelectField
          id="hr-employee-employeeType"
          name="employeeType"
          label="Employee type"
          options={EMPLOYEE_TYPE_OPTIONS}
          defaultValue="teacher"
          hint="Decides the role bundle their account receives."
          required
        />
        <SelectField
          id="hr-employee-employmentType"
          name="employmentType"
          label="Engagement"
          options={EMPLOYMENT_TYPE_OPTIONS}
          defaultValue="full_time"
        />
        <TextField
          id="hr-employee-joiningDate"
          name="joiningDate"
          label="Joining date"
          type="date"
          defaultValue={today()}
          hint="Back-dating a hire is allowed; a year ahead is not."
          required
        />
        <SelectField
          id="hr-employee-departmentId"
          name="departmentId"
          label="Department"
          options={departmentChoices}
          defaultValue=""
        />
        <SelectField
          id="hr-employee-designationId"
          name="designationId"
          label="Designation"
          options={designationChoices}
          defaultValue=""
        />
        <TextField
          id="hr-employee-bankAccountIban"
          name="bankAccountIban"
          label="Bank account (IBAN)"
        />
      </div>
      <TextField
        id="hr-employee-emergencyContactName"
        name="emergencyContactName"
        label="Emergency contact"
      />
      <TextField
        id="hr-employee-emergencyContactPhone"
        name="emergencyContactPhone"
        label="Emergency phone"
        type="tel"
      />
      <TextareaField
        id="hr-employee-notes"
        name="notes"
        label="Notes"
        hint="Optional; internal only."
        rows={2}
        maxLength={2000}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Editing an employment record.
 *
 * The staff number, the joining date and the status are deliberately absent: each has its own
 * write with its own guarantees (`ports.ts` states which), so a profile edit cannot quietly move
 * a hire date that salary structures and attendance are dated against.
 */
export function EditEmployeeDialog({
  institutionId,
  employee,
  departments,
  designations,
}: Readonly<{
  institutionId: string;
  employee: EmployeeListRow;
  departments: readonly ReferenceOption[];
  designations: readonly ReferenceOption[];
}>) {
  const departmentChoices: readonly SelectOption[] = departmentOptions(departments);
  const designationChoices: readonly SelectOption[] = designationOptions(designations);

  return (
    <EntityDialog
      triggerLabel="Edit profile"
      title={`Edit ${employee.fullName}`}
      description="Employment information and contact details. The staff number, the joining date and the employment status have their own controls — this form does not move them."
      action={updateEmployeeProfileAction}
      submitLabel="Save profile"
      width="md"
      triggerVariant="outline"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="employeeId" value={employee.id} />
      <input type="hidden" name="version" value={employee.version} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="hr-profile-employeeType"
          name="employeeType"
          label="Employee type"
          options={EMPLOYEE_TYPE_OPTIONS}
          defaultValue={employee.employeeType}
          required
        />
        <SelectField
          id="hr-profile-employmentType"
          name="employmentType"
          label="Engagement"
          options={EMPLOYMENT_TYPE_OPTIONS}
          defaultValue={employee.employmentType}
        />
        <SelectField
          id="hr-profile-departmentId"
          name="departmentId"
          label="Department"
          options={departmentChoices}
          defaultValue={employee.departmentId ?? ""}
        />
        <SelectField
          id="hr-profile-designationId"
          name="designationId"
          label="Designation"
          options={designationChoices}
          defaultValue={employee.designationId ?? ""}
        />
        <TextField
          id="hr-profile-bankAccountIban"
          name="bankAccountIban"
          label="Bank account (IBAN)"
          defaultValue={employee.bankAccountIban ?? ""}
        />
      </div>
      <TextField
        id="hr-profile-emergencyContactName"
        name="emergencyContactName"
        label="Emergency contact"
        defaultValue={employee.emergencyContactName ?? ""}
      />
      <TextField
        id="hr-profile-emergencyContactPhone"
        name="emergencyContactPhone"
        label="Emergency phone"
        type="tel"
        defaultValue={employee.emergencyContactPhone ?? ""}
      />
      <TextareaField
        id="hr-profile-notes"
        name="notes"
        label="Notes"
        rows={2}
        maxLength={2000}
        defaultValue={employee.notes ?? ""}
      />
    </EntityDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Employment status                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A departure: which kind, when, and why.
 *
 * A departure is final in the module's rules — a departed employee is a new hire, not a
 * reactivation — so the copy says so and the reason is recorded on the history row that the
 * transition writes (`employee_status_history`).
 */
/**
 * A departure: which kind, when, and why.
 *
 * A departure is final in the module's rules — a departed employee is a new hire, not a
 * reactivation — so the copy says so and the reason is recorded on the history row that the
 * transition writes (`employee_status_history`). Every status is in the list, and the two that are
 * not departures are refused by the service with a field message: showing them costs a round trip,
 * hiding them would hide the state machine.
 */
export function RecordDepartureDialog({
  institutionId,
  employee,
}: Readonly<{ institutionId: string; employee: EmployeeDetailRow }>) {
  return (
    <EntityDialog
      triggerLabel="Record departure"
      title={`Record ${employee.fullName}'s departure`}
      description="Marks the employment as ended on a date you choose and records who recorded it. A departed employee cannot be reactivated — a return is a new employment record."
      action={changeEmployeeStatusAction}
      submitLabel="Record departure"
      width="md"
      triggerVariant="destructive"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="employeeId" value={employee.id} />
      <input type="hidden" name="version" value={employee.version} />
      <SelectField
        id="hr-departure-toStatus"
        name="toStatus"
        label="Reason"
        options={EMPLOYEE_STATUS_OPTIONS}
        defaultValue="resigned"
        hint="A leave of absence is not a departure — use the leave controls, which carry no leaving date."
      />
      <TextField
        id="hr-departure-leavingDate"
        name="leavingDate"
        label="Last day"
        type="date"
        defaultValue={today()}
        hint="Left blank, the transition is dated today."
      />
      <TextareaField
        id="hr-departure-notes"
        name="notes"
        label="Notes"
        hint="Optional; recorded on the employment history."
        rows={2}
        maxLength={2000}
      />
    </EntityDialog>
  );
}

/**
 * The one-click status changes an employee offers, by status and by grant:
 *
 * | status     | offered                    | key                |
 * |------------|----------------------------|--------------------|
 * | `active`   | Record leave, Record departure | `employees.manage` |
 * | `on_leave` | Return to work, Record departure | `employees.manage` |
 * | departed   | nothing (terminal)         | —                  |
 *
 * A departed employee offers nothing rather than a disabled button, for the same reason the fee
 * module renders nothing for a paid expense: a disabled control that explains nothing is worse
 * than a status label that explains everything.
 */
export function EmployeeStatusActions({
  institutionId,
  employee,
  canManage,
}: Readonly<{ institutionId: string; employee: EmployeeListRow; canManage: boolean }>) {
  if (!canManage) return null;

  if (employee.status === "on_leave") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <EmployeeTransitionForm
          institutionId={institutionId}
          employeeId={employee.id}
          version={employee.version}
          action={changeEmployeeStatusAction}
          toStatus="active"
          label="Return to work"
          pendingLabel="Saving…"
        />
        <RecordDepartureDialog institutionId={institutionId} employee={asDetail(employee)} />
      </div>
    );
  }

  if (employee.status === "active") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <EmployeeTransitionForm
          institutionId={institutionId}
          employeeId={employee.id}
          version={employee.version}
          action={changeEmployeeStatusAction}
          toStatus="on_leave"
          label="Record leave"
          pendingLabel="Saving…"
        />
        <RecordDepartureDialog institutionId={institutionId} employee={asDetail(employee)} />
      </div>
    );
  }

  return null;
}

/**
 * A `RecordDepartureDialog` needs the detail row; the list has it.
 *
 * The dialog reads only `id`, `fullName` and `version`, so a copy of the list row is enough — and
 * a second read for a form's chrome would be an N+1 on a list page (`ARCHITECTURE.md` §9).
 */
function asDetail(employee: EmployeeListRow): EmployeeDetailRow {
  return {
    ...employee,
    statusHistory: [],
    currentSalary: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Salary configuration                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The figure fields of a salary structure (`ARCHITECTURE.md` §20).
 *
 * The unit-based denominators are rendered for both kinds rather than revealed by a stateful
 * select, because `SelectField` has no `onChange` to hook: the form shows all five fields and the
 * boundary refuses a unit-based structure missing any of the three
 * (`salary_structures_unit_based_denominators_check`, stated at the form in `schemas.ts` so the
 * failure is a field message rather than a database error). A fixed structure leaves them blank
 * and is unaffected, which is what the hint says.
 */
export function SalaryStructureFields({ idPrefix }: Readonly<{ idPrefix: string }>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${idPrefix}-structure`}
          name="structure"
          label="Structure"
          options={SALARY_STRUCTURE_OPTIONS}
          defaultValue="fixed"
          hint="A unit/period-based structure is paid per period on top of the base amount."
        />
        <TextField
          id={`${idPrefix}-amount`}
          name="amount"
          label="Monthly amount (PKR)"
          type="number"
          min="0"
          step="0.01"
          hint="The fixed figure, or the base a unit/period-based rate is paid on top of."
          required
        />
        <TextField
          id={`${idPrefix}-currency`}
          name="currency"
          label="Currency"
          defaultValue="PKR"
        />
        <TextField
          id={`${idPrefix}-effectiveFrom`}
          name="effectiveFrom"
          label="Effective from"
          type="date"
          defaultValue={today()}
          hint="A raise is a dated structure, so this one stays reproducible."
          required
        />
        <TextField
          id={`${idPrefix}-effectiveTo`}
          name="effectiveTo"
          label="Effective to"
          type="date"
          hint="Leave blank while it is in force."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`${idPrefix}-unitRate`}
          name="unitRate"
          label="Rate per period (PKR)"
          type="number"
          min="0"
          step="0.01"
          hint="Unit/period-based only."
        />
        <TextField
          id={`${idPrefix}-periodsPerDay`}
          name="periodsPerDay"
          label="Periods per day"
          type="number"
          min="1"
          step="1"
          hint="Unit/period-based only."
        />
        <TextField
          id={`${idPrefix}-workingDaysPerMonth`}
          name="workingDaysPerMonth"
          label="Working days per month"
          type="number"
          min="1"
          step="1"
          hint="Unit/period-based only."
        />
      </div>
    </>
  );
}

/** Creating a structure: name, dimension, and the figures. */
export function CreateSalaryStructureDialog({
  institutionId,
  departments,
  designations,
}: Readonly<{
  institutionId: string;
  departments: readonly ReferenceOption[];
  designations: readonly ReferenceOption[];
}>) {
  const departmentChoices: readonly SelectOption[] = departmentOptions(departments);
  const designationChoices: readonly SelectOption[] = designationOptions(designations);

  return (
    <EntityDialog
      triggerLabel="New structure"
      title="New salary structure"
      description="What a role of employee is supposed to earn, from a date. Point it at one dimension — a designation, a department, or an employee type."
      action={createSalaryStructureAction}
      submitLabel="Create structure"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <SalaryStructureFields idPrefix="hr-structure" />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id="hr-structure-name" name="name" label="Name" required />
        <SelectField
          id="hr-structure-designationId"
          name="designationId"
          label="Designation"
          options={designationChoices}
          defaultValue=""
        />
        <SelectField
          id="hr-structure-departmentId"
          name="departmentId"
          label="Department"
          options={departmentChoices}
          defaultValue=""
        />
        <SelectField
          id="hr-structure-employeeType"
          name="employeeType"
          label="Employee type"
          options={[{ value: "", label: "Any" }, ...EMPLOYEE_TYPE_OPTIONS]}
          defaultValue=""
        />
      </div>
    </EntityDialog>
  );
}

/** Editing a structure's figures and effective range. The dimension travels too, restated. */
export function EditSalaryStructureDialog({
  institutionId,
  structure: salaryStructure,
  departments,
  designations,
}: Readonly<{
  institutionId: string;
  structure: SalaryStructureRow;
  departments: readonly ReferenceOption[];
  designations: readonly ReferenceOption[];
}>) {
  const departmentChoices: readonly SelectOption[] = departmentOptions(departments);
  const designationChoices: readonly SelectOption[] = designationOptions(designations);

  return (
    <EntityDialog
      triggerLabel="Edit"
      title={`Edit ${salaryStructure.name}`}
      description="The figures a structure pays, and the range it pays them for. Editing does not rewrite the assignments it was compared against — their effective dates decide which one applies."
      action={updateSalaryStructureAction}
      submitLabel="Save structure"
      width="md"
      triggerVariant="outline"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="salaryStructureId" value={salaryStructure.id} />
      <input type="hidden" name="version" value={salaryStructure.version} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`hr-structure-edit-${salaryStructure.id}-name`}
          name="name"
          label="Name"
          defaultValue={salaryStructure.name}
          required
        />
        <SelectField
          id={`hr-structure-edit-${salaryStructure.id}-designationId`}
          name="designationId"
          label="Designation"
          options={designationChoices}
          defaultValue={salaryStructure.designationId ?? ""}
        />
        <SelectField
          id={`hr-structure-edit-${salaryStructure.id}-departmentId`}
          name="departmentId"
          label="Department"
          options={departmentChoices}
          defaultValue={salaryStructure.departmentId ?? ""}
        />
      </div>
    </EntityDialog>
  );
}

/**
 * Assigning a salary to an employee: the structure they hold, or a negotiated amount.
 *
 * The override's amount is required when the override box is checked, because an override that
 * names no figure is a raise with no number (`schemas.ts` states the same rule at the boundary).
 */
export function AssignSalaryDialog({
  institutionId,
  employeeId,
  structures,
  currency = "PKR",
}: Readonly<{
  institutionId: string;
  employeeId: string;
  structures: readonly SalaryStructureRow[];
  currency?: string;
}>) {
  const structureChoices: readonly SelectOption[] = salaryStructureOptions(structures);
  const [overrides, setOverrides] = useState(false);

  return (
    <EntityDialog
      triggerLabel="Assign salary"
      title="Assign a salary"
      description="Begins a dated assignment. End the current one first — an employee holds at most one current assignment."
      action={assignSalaryAction}
      submitLabel="Assign salary"
      width="md"
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="currency" value={currency} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="hr-assign-structure"
          name="salaryStructureId"
          label="Structure"
          options={structureChoices}
          defaultValue=""
          hint={
            structures.length === 0 ? "No structures yet — assign a negotiated amount." : undefined
          }
        />
        <TextField
          id="hr-assign-effectiveFrom"
          name="effectiveFrom"
          label="Effective from"
          type="date"
          defaultValue={today()}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="overridesStructure"
          checked={overrides}
          onChange={(event) => {
            setOverrides(event.target.checked);
          }}
        />
        This assignment overrides the structure&rsquo;s figures
      </label>
      {overrides ? (
        <TextField
          id="hr-assign-amount"
          name="amount"
          label="Override amount"
          type="number"
          min="0"
          step="0.01"
          hint="The negotiated figure this assignment pays instead of the structure's."
          required
        />
      ) : null}
    </EntityDialog>
  );
}

/**
 * Ending the current assignment: one dated click, marked destructive because it closes the row a
 * payslip may still name (`ARCHITECTURE.md` §20: closed, never deleted).
 */
export function EndSalaryAssignmentForm({
  institutionId,
  employeeId,
  assignmentId,
  effectiveFrom,
  updatedAt,
}: Readonly<{
  institutionId: string;
  employeeId: string;
  assignmentId: string;
  /** When the assignment began, so the end date offered is one the order check will accept. */
  effectiveFrom: string;
  updatedAt: Date;
}>) {
  const [state, formAction, isPending] = useFormActionState(
    endSalaryAssignmentAction,
    IDLE_FORM_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2"
      aria-busy={isPending}
      onSubmit={(event) => {
        if (isPending) event.preventDefault();
      }}
    >
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="salaryAssignmentId" value={assignmentId} />
      <input type="hidden" name="effectiveFrom" value={effectiveFrom} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt.toISOString()} />
      <input type="hidden" name="effectiveTo" value={endsAfter(effectiveFrom)} />
      <Button
        type="submit"
        variant="outline"
        size="xs"
        aria-disabled={isPending}
        onClick={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        {isPending ? "Ending…" : "End assignment"}
      </Button>
      <InlineOutcome state={state} />
      <p role="status" className="sr-only">
        {isPending ? "Ending assignment…" : ""}
      </p>
    </form>
  );
}

/**
 * The earliest date an assignment that began on `effectiveFrom` may end: the day after.
 *
 * `salary_assignments_effective_order_check` refuses an end on or before the start, so a one-click
 * "end today" is not always legal — an assignment created today can only end tomorrow. The service
 * repeats the rule and answers with a field message if some other caller posts earlier; this is
 * what keeps the shortcut honest.
 */
function endsAfter(effectiveFrom: string): string {
  const earliest = new Date(`${effectiveFrom}T00:00:00`);
  earliest.setDate(earliest.getDate() + 1);
  const tomorrow = calendarDateString(earliest);
  return tomorrow > today() ? tomorrow : today();
}
