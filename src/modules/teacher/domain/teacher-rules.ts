/**
 * Teacher domain rules (`PRD.md` MODULE 20, `src/db/schema/teacher.ts`, `ADR-0002`).
 *
 * Pure domain logic — zero I/O, zero Drizzle, zero Zod.
 * Enforces business invariants for teacher profiles, subject competence, and teaching assignments.
 */
import { BusinessRuleError, ValidationError } from "@/shared/errors";

export interface TeacherNameInput {
  readonly firstName: string;
  readonly lastName?: string | null | undefined;
}

/** Format a teacher's display name consistently across all UI surfaces. */
export function formatTeacherName(input: TeacherNameInput): string {
  const first = input.firstName.trim();
  const last = input.lastName?.trim();
  return last ? `${first} ${last}` : first;
}

/**
 * Asserts the single-scope invariant from `class_teacher_assignments_single_scope_check`:
 * Exactly one of `classId`, `groupId`, or `sectionId` must be non-null.
 */
export function assertAssignmentScope(scope: {
  readonly classId?: string | null | undefined;
  readonly groupId?: string | null | undefined;
  readonly sectionId?: string | null | undefined;
}): void {
  const nonNulls = [scope.classId, scope.groupId, scope.sectionId].filter(
    (val) => val !== null && val !== undefined && val !== "",
  );
  if (nonNulls.length !== 1) {
    throw new ValidationError(
      "A teaching assignment must scope to exactly one target: a class, a group, or a section.",
      { scope: ["Choose exactly one of class, group, or section."] },
      { userMessage: "Please choose exactly one assignment target: class, group, or section." },
    );
  }
}

/**
 * Asserts that the assignment date range is chronological.
 */
export function assertAssignmentDateRange(from: Date, until?: Date | null | undefined): void {
  if (until && until.getTime() < from.getTime()) {
    throw new BusinessRuleError(
      "The assignment end date cannot precede the assignment start date.",
      {
        userMessage: "The assignment end date must be on or after the start date.",
      },
    );
  }
}

/**
 * Asserts valid max periods per day. Must be positive if defined.
 */
export function assertMaxPeriodsPerDay(max?: number | null | undefined): void {
  if (max !== undefined && max !== null && max <= 0) {
    throw new ValidationError(
      "Maximum periods per day must be a positive integer.",
      { maxPeriodsPerDay: ["Must be a positive integer."] },
      { userMessage: "Maximum periods per day must be greater than zero." },
    );
  }
}

/**
 * Checks whether assigning an additional period exceeds the teacher's configured daily cap.
 */
export function isDailyPeriodCapExceeded(currentPeriods: number, maxPeriodsPerDay?: number | null): boolean {
  if (maxPeriodsPerDay === null || maxPeriodsPerDay === undefined) {
    return false;
  }
  return currentPeriods >= maxPeriodsPerDay;
}

/**
 * Formats teacher status badge tone based on active assignments.
 */
export function teacherAssignmentBadgeTone(assignedCount: number): "neutral" | "info" | "success" | "warning" {
  if (assignedCount === 0) return "neutral";
  if (assignedCount <= 2) return "info";
  return "success";
}
