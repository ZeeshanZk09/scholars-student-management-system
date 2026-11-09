/**
 * Scheduling domain rules (`PRD.md` MODULE 17/18, `PHASES.md` §25 Phase 17).
 *
 * Pure business rules for timetable slots, conflict prevention, and schedule publication.
 * Knows nothing of Next.js, Drizzle, or PostgreSQL — only what makes a schedule valid,
 * what constitutes a conflict, and how schedules transition through their lifecycle.
 *
 * ## Conflict Prevention Core Rules
 *
 * 1. **Teacher Double-Booking Prevention**: A teacher cannot be scheduled to teach
 *    in two different rooms or sections during the same time slot.
 * 2. **Room / Floor Double-Booking Prevention**: A room or floor cannot host two
 *    different classes/sections during the same time slot.
 * 3. **Section Double-Booking Prevention**: A class section cannot have two different
 *    lessons assigned to the same time slot.
 * 4. **Break Slots Are Non-Teachable**: Break slots (e.g., lunch, recess, assembly)
 *    cannot have academic lessons assigned.
 * 5. **Free Periods Are Non-Conflicting**: A period marked `kind === "free"` explicitly
 *    signifies unallocated time, allowing the Floor-Incharge to view open cells without
 *    triggering false positive conflict blocks.
 * 6. **Lock Immutability**: Once locked, a schedule is read-only academic history
 *    (`RULES.md` §44). It cannot be modified, deleted, or republished.
 */

import { BusinessRuleError, ConflictError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Domain Types                                                               */
/* -------------------------------------------------------------------------- */

export const SCHEDULE_KINDS = ["lesson", "free", "extra", "exam"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const SCHEDULE_STATUSES = ["draft", "published", "locked"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export interface SchedulePeriod {
  readonly id?: string | undefined;
  readonly academicSessionId: string;
  readonly sectionId: string;
  readonly timeSlotId: string;
  readonly subjectId?: string | null | undefined;
  readonly teacherId?: string | null | undefined;
  readonly floorId?: string | null | undefined;
  readonly kind: ScheduleKind;
  readonly status?: ScheduleStatus | undefined;
  readonly timeSlot?: TimeSlotBoundary | undefined;
}

export interface TimeSlotBoundary {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly sequence: number;
  readonly isBreak: boolean;
  readonly name?: string | undefined;
}

export type SlotBoundaryResolver =
  | ((slotId: string) => TimeSlotBoundary | undefined)
  | ReadonlyMap<string, TimeSlotBoundary>
  | readonly TimeSlotBoundary[];

/**
 * Resolves a time slot boundary from a lookup resolver (function, map, or array).
 */
export function resolveSlotBoundary(
  slotId: string,
  resolver?: SlotBoundaryResolver | null,
): TimeSlotBoundary | undefined {
  if (!resolver) return undefined;
  if (typeof resolver === "function") {
    return resolver(slotId);
  }
  if (resolver instanceof Map) {
    return resolver.get(slotId);
  }
  if (Array.isArray(resolver)) {
    return resolver.find((s) => s.id === slotId);
  }
  return undefined;
}

export type ScheduleConflictType =
  | "teacher_double_booked"
  | "room_double_booked"
  | "section_double_booked"
  | "break_slot_conflict";

export interface ScheduleConflict {
  readonly type: ScheduleConflictType;
  readonly message: string;
  readonly userMessage: string;
  readonly conflictingScheduleId?: string | undefined;
  readonly timeSlotId: string;
  readonly sectionId: string;
  readonly teacherId?: string | null | undefined;
  readonly floorId?: string | null | undefined;
}

/* -------------------------------------------------------------------------- */
/* Time Slot Boundary Rules                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Parse a clock time string ("HH:MM" or "HH:MM:SS") into total minutes from midnight.
 */
export function parseTimeToMinutes(timeStr: string): number {
  const trimmed = timeStr.trim();
  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new ValidationError(`Invalid time format: "${timeStr}". Expected HH:MM or HH:MM:SS.`, {
      time: ["Format must be HH:MM or HH:MM:SS."],
    });
  }

  const hoursStr = parts[0];
  const minutesStr = parts[1];
  if (hoursStr === undefined || minutesStr === undefined) {
    throw new ValidationError(`Invalid time format: "${timeStr}".`, {
      time: ["Hours and minutes are required."],
    });
  }

  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new ValidationError(`Invalid time value: "${timeStr}".`, {
      time: ["Hours must be 0-23 and minutes 0-59."],
    });
  }

  return hours * 60 + minutes;
}

/**
 * Validate that a time slot's start time strictly precedes its end time.
 */
export function validateTimeSlotBoundaries(startTime: string, endTime: string): void {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (endMinutes <= startMinutes) {
    throw new BusinessRuleError("Time slot end time must be strictly after start time.", {
      userMessage: "The period end time must be after its start time.",
      details: {
        startTime: "Start time must precede end time.",
        endTime: "End time must be after start time.",
      },
    });
  }
}

/**
 * Check if two time intervals [startA, endA) and [startB, endB) overlap.
 */
export function doTimeIntervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = parseTimeToMinutes(startA);
  const aEnd = parseTimeToMinutes(endA);
  const bStart = parseTimeToMinutes(startB);
  const bEnd = parseTimeToMinutes(endB);

  return aStart < bEnd && bStart < aEnd;
}

/**
 * Asserts that a slot is not a break slot when attempting to schedule lessons or exams.
 */
export function assertNotBreakSlot(slot: { isBreak: boolean; name?: string | undefined }): void {
  if (slot.isBreak) {
    throw new BusinessRuleError(
      `Cannot schedule classes during break slot "${slot.name ?? "Break"}".`,
      {
        userMessage: "Classes cannot be scheduled during break, lunch, or assembly periods.",
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Conflict Detection Rules                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Detects if a candidate period is mistakenly scheduled during a break slot.
 */
export function detectBreakSlotConflict(
  candidate: SchedulePeriod,
  slot?: { isBreak: boolean; name?: string | undefined } | null,
): ScheduleConflict | null {
  const isBreak = slot?.isBreak ?? candidate.timeSlot?.isBreak ?? false;
  if (isBreak && candidate.kind !== "free") {
    const slotName = slot?.name ?? candidate.timeSlot?.name ?? candidate.timeSlotId;
    return {
      type: "break_slot_conflict",
      message: `Cannot schedule ${candidate.kind} period during break slot "${slotName}".`,
      userMessage: "Classes cannot be scheduled during break, lunch, or assembly periods.",
      conflictingScheduleId: undefined,
      timeSlotId: candidate.timeSlotId,
      sectionId: candidate.sectionId,
      teacherId: candidate.teacherId,
      floorId: candidate.floorId,
    };
  }
  return null;
}

/**
 * Detect a conflict between an incoming candidate period and an existing scheduled period.
 * Returns null if there is no conflict.
 */
export function detectPeriodConflict(
  candidate: SchedulePeriod,
  existing: SchedulePeriod,
  resolver?: SlotBoundaryResolver | null,
): ScheduleConflict | null {
  // Same row identity (when updating an existing period): no self-conflict
  if (candidate.id && existing.id && candidate.id === existing.id) {
    return null;
  }

  // Must be in the same academic session to conflict
  if (candidate.academicSessionId !== existing.academicSessionId) {
    return null;
  }

  // Free periods are explicitly unallocated and do not generate conflicts
  if (candidate.kind === "free" || existing.kind === "free") {
    return null;
  }

  // Check whether candidate and existing occur at the same time:
  // 1. Same time slot ID: always simultaneous.
  // 2. Different time slot IDs: check if slot boundaries overlap (if boundary info is available).
  let areSimultaneous = candidate.timeSlotId === existing.timeSlotId;

  if (!areSimultaneous) {
    const candidateSlot = candidate.timeSlot ?? resolveSlotBoundary(candidate.timeSlotId, resolver);
    const existingSlot = existing.timeSlot ?? resolveSlotBoundary(existing.timeSlotId, resolver);

    if (candidateSlot && existingSlot) {
      areSimultaneous = doTimeIntervalsOverlap(
        candidateSlot.startTime,
        candidateSlot.endTime,
        existingSlot.startTime,
        existingSlot.endTime,
      );
    }
  }

  if (!areSimultaneous) {
    return null;
  }

  // 1. Section double-booking: A section cannot have two classes at the same time
  if (candidate.sectionId === existing.sectionId) {
    return {
      type: "section_double_booked",
      message: `Section "${candidate.sectionId}" already has a period assigned in time slot "${candidate.timeSlotId}".`,
      userMessage: "This class section already has another period scheduled at this time.",
      conflictingScheduleId: existing.id,
      timeSlotId: candidate.timeSlotId,
      sectionId: candidate.sectionId,
      teacherId: candidate.teacherId,
      floorId: candidate.floorId,
    };
  }

  // 2. Teacher double-booking: A teacher cannot teach two classes at the same time
  if (
    candidate.teacherId &&
    existing.teacherId &&
    candidate.teacherId === existing.teacherId
  ) {
    return {
      type: "teacher_double_booked",
      message: `Teacher "${candidate.teacherId}" is already assigned to another period in time slot "${candidate.timeSlotId}".`,
      userMessage: "This teacher is already scheduled to teach another class during this time period.",
      conflictingScheduleId: existing.id,
      timeSlotId: candidate.timeSlotId,
      sectionId: candidate.sectionId,
      teacherId: candidate.teacherId,
      floorId: candidate.floorId,
    };
  }

  // 3. Room / Floor double-booking: A room/floor cannot host two classes at the same time
  if (
    candidate.floorId &&
    existing.floorId &&
    candidate.floorId === existing.floorId
  ) {
    return {
      type: "room_double_booked",
      message: `Room/Floor "${candidate.floorId}" is already occupied in time slot "${candidate.timeSlotId}".`,
      userMessage: "This room or floor is already occupied by another class during this time period.",
      conflictingScheduleId: existing.id,
      timeSlotId: candidate.timeSlotId,
      sectionId: candidate.sectionId,
      teacherId: candidate.teacherId,
      floorId: candidate.floorId,
    };
  }

  return null;
}

/**
 * Detect all conflicts between a candidate period and an array of existing scheduled periods.
 */
export function detectAllConflicts(
  candidate: SchedulePeriod,
  existingPeriods: readonly SchedulePeriod[],
  resolver?: SlotBoundaryResolver | null,
): readonly ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  const candidateSlot = candidate.timeSlot ?? resolveSlotBoundary(candidate.timeSlotId, resolver);
  const breakConflict = detectBreakSlotConflict(candidate, candidateSlot);
  if (breakConflict !== null) {
    conflicts.push(breakConflict);
  }

  for (const existing of existingPeriods) {
    const conflict = detectPeriodConflict(candidate, existing, resolver);
    if (conflict !== null) {
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Detect conflicts in a batch of candidate periods, validating against both:
 * 1. Each other (preventing duplicate assignments inside the proposed batch)
 * 2. Already existing schedules in the database
 */
export function detectBatchConflicts(
  candidates: readonly SchedulePeriod[],
  existingPeriods: readonly SchedulePeriod[],
  resolver?: SlotBoundaryResolver | null,
): readonly ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Check candidates against existing
  for (const candidate of candidates) {
    const periodConflicts = detectAllConflicts(candidate, existingPeriods, resolver);
    conflicts.push(...periodConflicts);
  }

  // Check candidates against each other
  for (let i = 0; i < candidates.length; i++) {
    const current = candidates[i];
    if (!current) continue;

    for (let j = i + 1; j < candidates.length; j++) {
      const other = candidates[j];
      if (!other) continue;

      const batchConflict = detectPeriodConflict(current, other, resolver);
      if (batchConflict !== null) {
        conflicts.push(batchConflict);
      }
    }
  }

  return conflicts;
}

/**
 * Assert that no conflicts exist. Throws ConflictError if any conflict is found.
 */
export function assertNoConflicts(conflicts: readonly ScheduleConflict[]): void {
  if (conflicts.length > 0) {
    const first = conflicts[0];
    if (!first) return;

    throw new ConflictError(first.message, {
      userMessage: first.userMessage,
      details: {
        conflictType: first.type,
        timeSlotId: first.timeSlotId,
        sectionId: first.sectionId,
        ...(first.teacherId ? { teacherId: first.teacherId } : {}),
        ...(first.floorId ? { floorId: first.floorId } : {}),
      },
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Status Lifecycle Guards                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Asserts that a schedule can be modified. Locked schedules are immutable.
 */
export function assertCanModifySchedule(status: ScheduleStatus): void {
  if (status === "locked") {
    throw new BusinessRuleError("Cannot modify a locked schedule.", {
      userMessage: "This timetable has been archived and locked. It is read-only academic history.",
    });
  }
}

/**
 * Asserts that a schedule can be published.
 */
export function assertCanPublishSchedule(status: ScheduleStatus): void {
  if (status === "locked") {
    throw new BusinessRuleError("Cannot publish a locked schedule.", {
      userMessage: "This timetable is locked and cannot be republished.",
    });
  }
}

/**
 * Asserts that a schedule can be locked.
 */
export function assertCanLockSchedule(status: ScheduleStatus): void {
  if (status === "locked") {
    throw new ConflictError("This timetable is already locked.", {
      userMessage: "This timetable is already locked.",
    });
  }
}
