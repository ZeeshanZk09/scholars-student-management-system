/**
 * HR domain rules (`PRD.md` MODULE 8, `src/db/schema/hr.ts`, `ADR-0002`).
 *
 * Pure over `@/shared/errors` — no I/O, no Drizzle, no zod. Five concerns live here rather than in
 * SQL or in the service:
 *
 * 1. **Display vocabulary.** The database stores enum keys (`floor_incharge`, `unit_based`); the
 *    UI shows "Floor-incharge" and "Unit/period based". The label maps are the single source for
 *    that projection, and the tuples feed the zod enums in `application/schemas.ts` — the same
 *    split every module here uses.
 * 2. **What employment status means.** `ARCHITECTURE.md` §51 and the `employee_status` enum say
 *    *nothing* about which edges are legal, and the two halves of an unfinished offboarding are
 *    only partially constrained by SQL (the `employees_status_leaving_pair` check enforces the
 *    date/status pairing, not the order). {@link assertEmployeeStatusTransition} is the state
 *    machine: on the roster, on leave, gone for a reason; gone is final.
 * 3. **Offboarding is dated.** A status of `resigned`/`terminated`/`retired` without a
 *    `leavingDate` is a half-written exit, and an `active` employee with one is a stale fact that
 *    payroll would later read as real. {@link assertLeavingDatePair} states the rule the SQL check
 *    enforces, where a test can reach it and the service can check before a transaction opens.
 * 4. **An employee is an account** (`ADR-0002`), so creating one also decides what that account
 *    may do. {@link EMPLOYEE_TYPE_TO_ROLE_SLUG} is that decision, and it lives here rather than in
 *    the store so a role bundle is a fact of the domain and not of a Drizzle insert.
 * 5. **Staff numbers are generated, not typed.** `employee_code` is the institution's own
 *    sequence (`EP-0007`); {@link nextEmployeeCode} is its single formatting, shared by the store
 *    and the fakes so a test and a real insert agree on what `EP-1` looks like.
 *
 * The date-joining window is deliberate, mirroring the fee module's plausibility rule: a
 * back-dated `joiningDate` is a normal data-entry task (recording a hire from last month today),
 * while a typo'd year is not.
 */
import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/** `employee_type` — `PRD.md` MODULE 8 lists exactly these. */
export const EMPLOYEE_TYPES = [
  "teacher",
  "accountant",
  "floor_incharge",
  "hr",
  "admin",
  "other_staff",
] as const;

export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];

export const EMPLOYEE_TYPE_LABELS: Readonly<Record<EmployeeType, string>> = {
  teacher: "Teacher",
  accountant: "Accountant",
  floor_incharge: "Floor-incharge",
  hr: "HR",
  admin: "Administrative staff",
  other_staff: "Other staff",
};

/** `employment_type` — `PRD.md` MODULE 8. */
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "visiting"] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Readonly<Record<EmploymentType, string>> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  visiting: "Visiting",
};

/**
 * `employee_status` — the staff lifecycle, kept separate from `archived_at`
 * (`DOMAIN-MODEL.md` D-4).
 */
export const EMPLOYEE_STATUSES = [
  "active",
  "on_leave",
  "resigned",
  "terminated",
  "retired",
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_LABELS: Readonly<Record<EmployeeStatus, string>> = {
  active: "Active",
  on_leave: "On leave",
  resigned: "Resigned",
  terminated: "Terminated",
  retired: "Retired",
};

/** `salary_structure` — `PRD.md` MODULE 9 requires both a fixed and a unit-based pay. */
export const SALARY_STRUCTURES = ["fixed", "unit_based"] as const;

export type SalaryStructure = (typeof SALARY_STRUCTURES)[number];

export const SALARY_STRUCTURE_LABELS: Readonly<Record<SalaryStructure, string>> = {
  fixed: "Fixed monthly",
  unit_based: "Unit / period based",
};

/* -------------------------------------------------------------------------- */
/* Employment status                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The role bundle an employee type carries when their account is created.
 *
 * `ADR-0002` says an employee *is* a `users` row with an `employees` profile, so there is no
 * separate decision to record about "what this person may log in as": the role follows the type of
 * work. A teacher who also does accounts is a `teacher` until someone with `users.manage` adds a
 * second grant — role bundles are data (`ADR-0001`), never a single string on the user row.
 */
export const EMPLOYEE_TYPE_TO_ROLE_SLUG: Readonly<Record<EmployeeType, string>> = {
  teacher: "teacher",
  accountant: "accountant",
  floor_incharge: "floor-incharge",
  hr: "hr",
  admin: "admin",
  other_staff: "other-staff",
};

/**
 * Statuses that mean the employee has left for a reason.
 *
 * Each carries a `leavingDate` (see {@link assertLeavingDatePair}) and none has an outgoing
 * transition: a resigned teacher who returns is a *new* employment record, so the history that
 * says "left in August" stays true.
 */
export const TERMINAL_EMPLOYEE_STATUSES = ["resigned", "terminated", "retired"] as const;

/** Whether an employee status ends the employment. */
export function isTerminalEmployeeStatus(status: EmployeeStatus): boolean {
  return (TERMINAL_EMPLOYEE_STATUSES as readonly EmployeeStatus[]).includes(status);
}

/**
 * Every legal status edge. `active` is the state an employee is created in and the state `on_leave`
 * returns to; the three exits are reachable from both of those and from nowhere else.
 *
 * A row that is `resigned`, `terminated` or `retired` has no outgoing edges — not even back to
 * `active`. Reactivating a departed employee is a new hire with its own `joining_date`, and the
 * offboarding trail is the record of the earlier employment.
 */
export const EMPLOYEE_STATUS_TRANSITIONS: Readonly<
  Record<EmployeeStatus, readonly EmployeeStatus[]>
> = {
  active: ["on_leave", "resigned", "terminated", "retired"],
  on_leave: ["active", "resigned", "terminated", "retired"],
  resigned: [],
  terminated: [],
  retired: [],
};

/** Whether `from` may become `to`. */
export function canTransitionEmployeeStatus(from: EmployeeStatus, to: EmployeeStatus): boolean {
  return (EMPLOYEE_STATUS_TRANSITIONS[from] as readonly EmployeeStatus[]).includes(to);
}

/**
 * @throws {BusinessRuleError} When the edge is not in {@link EMPLOYEE_STATUS_TRANSITIONS}.
 */
export function assertEmployeeStatusTransition(from: EmployeeStatus, to: EmployeeStatus): void {
  if (!canTransitionEmployeeStatus(from, to)) {
    throw new BusinessRuleError(`${from} → ${to} is not a legal employment transition.`, {
      userMessage: isTerminalEmployeeStatus(from)
        ? "This employee has already left. Record a new employment to bring them back."
        : "That status change is not allowed from the current status.",
    });
  }
}

/**
 * @throws {ValidationError} When a terminal status has no leaving date, or a still-employed one
 * has one.
 */
export function assertLeavingDatePair(
  status: EmployeeStatus,
  leavingDate: string | null,
  field = "leavingDate",
): void {
  if (isTerminalEmployeeStatus(status) && leavingDate === null) {
    throw new ValidationError("An employee who has left needs a leaving date.", {
      [field]: ["Record the date this employee left."],
    });
  }
  if (!isTerminalEmployeeStatus(status) && leavingDate !== null) {
    throw new ValidationError("Only an employee who has left carries a leaving date.", {
      [field]: ["Clear the leaving date for an employee who is still employed."],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Identifiers and dates                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The institution's staff number for the nth employee: `EP-0007`.
 *
 * Six digits because an institution that hires more than a hundred thousand staff is a filing
 * problem, not a formatting one. The store owns uniqueness (a per-institution unique index
 * catches a race); this owns shape.
 */
export function nextEmployeeCode(serial: number): string {
  return `EP-${String(serial).padStart(6, "0")}`;
}

/** The earliest date any HR record may carry. A hired-on date before it is a typo. */
export const EARLIEST_EMPLOYMENT_DATE = "2000-01-01";

/**
 * Refuse a `joining_date` before 2000 or more than a year after `today`.
 *
 * A hire dated last month is a normal late entry; a hire dated next year is a typo'd year. `today`
 * is a parameter so the rule is testable without freezing time.
 *
 * @throws {ValidationError} When the date is outside the window.
 */
export function assertPlausibleJoiningDate(date: string, today: Date, field = "joiningDate"): void {
  if (date < EARLIEST_EMPLOYMENT_DATE) {
    throw new ValidationError(`${field} is before ${EARLIEST_EMPLOYMENT_DATE}.`, {
      [field]: [`Enter a date on or after ${EARLIEST_EMPLOYMENT_DATE}.`],
    });
  }
  const horizon = new Date(today.getTime());
  horizon.setFullYear(horizon.getFullYear() + 1);
  const year = horizon.getFullYear();
  const month = String(horizon.getMonth() + 1).padStart(2, "0");
  const day = String(horizon.getDate()).padStart(2, "0");
  if (date > `${year}-${month}-${day}`) {
    throw new ValidationError(`${field} is more than a year ahead.`, {
      [field]: ["Enter a date no more than one year from today."],
    });
  }
}

/**
 * The `yyyy-mm-dd` form of a `Date` in local time — the same convention every date column in this
 * schema uses (a UTC shift would render yesterday for anyone east of Greenwich).
 */
export function calendarDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
