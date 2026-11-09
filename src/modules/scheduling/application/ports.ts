/**
 * Scheduling ports: application dependencies on persistence and data access (`PRD.md` MODULE 17/18).
 *
 * Defines the contract that {@link SchedulingService} expects from its store.
 * Decouples use cases and domain conflict detection from direct SQL or ORM dependencies.
 */

import type { ScheduleKind, ScheduleStatus } from "../domain/schedule-rules";

/* -------------------------------------------------------------------------- */
/* Persistence Models & Row Types                                             */
/* -------------------------------------------------------------------------- */

export interface ScheduleRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly sectionId: string;
  readonly subjectId: string | null;
  readonly teacherId: string | null;
  readonly timeSlotId: string;
  readonly floorId: string | null;
  readonly kind: ScheduleKind;
  readonly status: ScheduleStatus;
  readonly replacementAssignmentId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ScheduleViewRow extends ScheduleRow {
  readonly sectionName?: string | null;
  readonly className?: string | null;
  readonly groupName?: string | null;
  readonly subjectName?: string | null;
  readonly subjectCode?: string | null;
  readonly teacherName?: string | null;
  readonly floorName?: string | null;
  readonly timeSlotName?: string | null;
  readonly timeSlotStartTime?: string | null;
  readonly timeSlotEndTime?: string | null;
  readonly timeSlotSequence?: number | null;
  readonly timeSlotIsBreak?: boolean | null;
}

export interface SchedulePublishHistoryRow {
  readonly id: string;
  readonly scheduleId: string;
  readonly academicSessionId: string;
  readonly fromStatus: ScheduleStatus;
  readonly toStatus: ScheduleStatus;
  readonly publishedAt: Date;
  readonly publishedByUserId: string | null;
  readonly reason: string | null;
}

export interface TimeSlotRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string | null;
  readonly name: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly sequence: number;
  readonly isBreak: boolean;
}

/* -------------------------------------------------------------------------- */
/* Store Mutation Inputs                                                      */
/* -------------------------------------------------------------------------- */

export interface CreateScheduleData {
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly sectionId: string;
  readonly timeSlotId: string;
  readonly subjectId?: string | null | undefined;
  readonly teacherId?: string | null | undefined;
  readonly floorId?: string | null | undefined;
  readonly kind?: ScheduleKind | undefined;
  readonly status?: ScheduleStatus | undefined;
}

export interface UpdateScheduleData {
  readonly subjectId?: string | null | undefined;
  readonly teacherId?: string | null | undefined;
  readonly floorId?: string | null | undefined;
  readonly kind?: ScheduleKind | undefined;
}

export interface PublishSchedulesParams {
  readonly academicSessionId: string;
  readonly institutionId: string;
  readonly sectionId?: string | undefined;
  readonly publishedByUserId: string;
  readonly reason?: string | undefined;
}

export interface LockSchedulesParams {
  readonly academicSessionId: string;
  readonly institutionId: string;
  readonly lockedByUserId: string;
  readonly reason?: string | undefined;
}

/* -------------------------------------------------------------------------- */
/* SchedulingStore Interface                                                  */
/* -------------------------------------------------------------------------- */

export interface SchedulingStore {
  // Single-record lookups
  getScheduleById(id: string): Promise<ScheduleRow | null>;
  getScheduleViewById(id: string): Promise<ScheduleViewRow | null>;
  findScheduleBySectionAndSlot(
    sectionId: string,
    academicSessionId: string,
    timeSlotId: string,
  ): Promise<ScheduleRow | null>;

  // Conflict checking queries
  listActiveSchedulesForSlot(
    academicSessionId: string,
    timeSlotId: string,
  ): Promise<readonly ScheduleRow[]>;

  // Grid and timetable queries
  listSchedulesBySection(
    sectionId: string,
    academicSessionId: string,
  ): Promise<readonly ScheduleViewRow[]>;
  listSchedulesBySession(
    academicSessionId: string,
  ): Promise<readonly ScheduleViewRow[]>;
  listSchedulesByTeacher(
    teacherId: string,
    academicSessionId: string,
  ): Promise<readonly ScheduleViewRow[]>;
  listSchedulesByFloor(
    floorId: string,
    academicSessionId: string,
  ): Promise<readonly ScheduleViewRow[]>;

  // Time slot queries
  getTimeSlot(id: string): Promise<TimeSlotRow | null>;
  listTimeSlots(
    institutionId: string,
    academicSessionId?: string | null,
  ): Promise<readonly TimeSlotRow[]>;

  // Mutations
  assignScheduleSlot(data: CreateScheduleData): Promise<ScheduleRow>;
  updateScheduleSlot(id: string, data: UpdateScheduleData): Promise<ScheduleRow>;
  deleteScheduleSlot(id: string): Promise<void>;

  // Publication & History
  publishSchedules(params: PublishSchedulesParams): Promise<{ readonly publishedCount: number }>;
  lockSchedules(params: LockSchedulesParams): Promise<{ readonly lockedCount: number }>;
  batchAssignSlots(
    academicSessionId: string,
    institutionId: string,
    slots: readonly CreateScheduleData[],
  ): Promise<readonly ScheduleRow[]>;
  listPublishHistory(
    academicSessionId: string,
    scheduleId?: string,
  ): Promise<readonly SchedulePublishHistoryRow[]>;
}
