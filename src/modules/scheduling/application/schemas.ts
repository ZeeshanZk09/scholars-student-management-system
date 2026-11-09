/**
 * Scheduling boundary validation schemas (`PRD.md` MODULE 17/18, `PHASES.md` §25 Phase 17).
 *
 * Enforces shape, type, and format constraints at the application boundary for slot mapping,
 * draft generation, bulk assignments, and timetable publication.
 */

import { z } from "zod";

import { optionalId, optionalText } from "@/shared/validation/fields";

/* -------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* -------------------------------------------------------------------------- */

export const ScheduleKindSchema = z.enum(["lesson", "free", "extra", "exam"]);
export type ScheduleKindInput = z.infer<typeof ScheduleKindSchema>;

export const ScheduleStatusSchema = z.enum(["draft", "published", "locked"]);
export type ScheduleStatusInput = z.infer<typeof ScheduleStatusSchema>;

/* -------------------------------------------------------------------------- */
/* Command Schemas                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Assign a single timetable slot (creates or replaces period allocation).
 */
export const AssignScheduleSlotSchema = z.object({
  institutionId: z.string().uuid("A valid institution reference is required."),
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  sectionId: z.string().uuid("A valid section reference is required."),
  timeSlotId: z.string().uuid("A valid time slot reference is required."),
  subjectId: optionalId,
  teacherId: optionalId,
  floorId: optionalId,
  kind: ScheduleKindSchema.default("lesson"),
});

export type AssignScheduleSlotInput = z.infer<typeof AssignScheduleSlotSchema>;

/**
 * Update an existing scheduled period (e.g., room change or teacher reassignment).
 */
export const UpdateScheduleSlotSchema = z.object({
  id: z.string().uuid("A valid schedule reference is required."),
  institutionId: z.string().uuid("A valid institution reference is required."),
  subjectId: optionalId,
  teacherId: optionalId,
  floorId: optionalId,
  kind: ScheduleKindSchema.optional(),
});

export type UpdateScheduleSlotInput = z.infer<typeof UpdateScheduleSlotSchema>;

/**
 * Single item inside a bulk slot assignment batch.
 */
export const BulkSlotItemSchema = z.object({
  sectionId: z.string().uuid("A valid section reference is required."),
  timeSlotId: z.string().uuid("A valid time slot reference is required."),
  subjectId: optionalId,
  teacherId: optionalId,
  floorId: optionalId,
  kind: ScheduleKindSchema.default("lesson"),
});

export type BulkSlotItemInput = z.infer<typeof BulkSlotItemSchema>;

/**
 * Bulk slot assignment for mapping a complete section or class draft schedule.
 */
export const BulkAssignScheduleSchema = z.object({
  institutionId: z.string().uuid("A valid institution reference is required."),
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  slots: z.array(BulkSlotItemSchema).min(1, "At least one slot must be provided."),
});

export type BulkAssignScheduleInput = z.infer<typeof BulkAssignScheduleSchema>;

/**
 * Publish timetable: transitions draft periods to published and records audit history.
 */
export const PublishTimetableSchema = z.object({
  institutionId: z.string().uuid("A valid institution reference is required."),
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  sectionId: optionalId,
  reason: optionalText(500),
});

export type PublishTimetableInput = z.infer<typeof PublishTimetableSchema>;

/**
 * Lock timetable: marks completed or archived session timetable as immutable history.
 */
export const LockTimetableSchema = z.object({
  institutionId: z.string().uuid("A valid institution reference is required."),
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  reason: optionalText(500),
});

export type LockTimetableInput = z.infer<typeof LockTimetableSchema>;

/**
 * Remove a period from the timetable.
 */
export const RemoveScheduleSlotSchema = z.object({
  id: z.string().uuid("A valid schedule reference is required."),
  institutionId: z.string().uuid("A valid institution reference is required."),
});

export type RemoveScheduleSlotInput = z.infer<typeof RemoveScheduleSlotSchema>;

/* -------------------------------------------------------------------------- */
/* Query Filter Schemas                                                       */
/* -------------------------------------------------------------------------- */

export const ListSectionSchedulesSchema = z.object({
  institutionId: z.string().uuid("A valid institution reference is required."),
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  sectionId: z.string().uuid("A valid section reference is required."),
});

export type ListSectionSchedulesInput = z.infer<typeof ListSectionSchedulesSchema>;

export const ListTeacherSchedulesSchema = z.object({
  institutionId: z.string().uuid("A valid institution reference is required."),
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  teacherId: z.string().uuid("A valid teacher reference is required."),
});

export type ListTeacherSchedulesInput = z.infer<typeof ListTeacherSchedulesSchema>;

export const ListFloorSchedulesSchema = z.object({
  institutionId: z.string().uuid("A valid institution reference is required."),
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  floorId: z.string().uuid("A valid floor reference is required."),
});

export type ListFloorSchedulesInput = z.infer<typeof ListFloorSchedulesSchema>;
