/**
 * Input contracts for every academic use case.
 *
 * These are *boundary* schemas (`ARCHITECTURE.md` §29): their job is to turn untrusted form
 * payloads into typed, validated command inputs. The cross-field rules that need an entity's
 * current state (an open session, a free grade level) live in the service, not here — a zod schema
 * cannot ask the database anything.
 */
import { z } from "zod";

import {
  calendarDate,
  emailAddress,
  nonEmptyText,
  optionalCalendarDate,
  optionalId,
  optionalPositiveIntOrNull,
  optionalText,
} from "@/shared/validation/fields";
import { GRADE_LEVEL_NAMES, KNOWN_GRADE_LEVELS } from "../domain/grade-levels";

const uuid = z.string().uuid("A valid reference is required.");

/** The wall-clock time fields of a `time` column, as `HH:MM`. */
export const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM 24-hour format.");

/** A grade-level ordinal from the known list, sent as a number or a numeric string. */
const gradeLevel = z
  .union([z.number(), z.string()])
  .transform((value) => (typeof value === "string" ? Number(value) : value))
  .pipe(
    z
      .number()
      .int()
      .min(0, "Select a valid grade level.")
      .max(GRADE_LEVEL_NAMES.length - 1, "Select a valid grade level."),
  );

export const createInstitutionSchema = z.object({
  name: nonEmptyText("Institution name"),
  kind: z.enum(["school", "college"]),
  email: emailAddress,
  code: optionalText(32),
  phone: optionalText(32),
  address: optionalText(500),
  website: optionalText(2048),
});

export const updateInstitutionSchema = createInstitutionSchema.extend({
  institutionId: uuid,
  version: z.number().int().positive(),
});

export const createCampusSchema = z.object({
  institutionId: uuid,
  name: nonEmptyText("Campus name"),
  address: optionalText(500),
  phone: optionalText(32),
});

export const createBuildingSchema = z.object({
  institutionId: uuid,
  campusId: optionalId,
  name: nonEmptyText("Building name"),
});

export const createFloorSchema = z.object({
  institutionId: uuid,
  buildingId: optionalId,
  name: nonEmptyText("Floor name"),
  level: z.preprocess((value) => (value === "" ? 0 : Number(value)), z.number().int().max(500)),
});

export const createDepartmentSchema = z.object({
  institutionId: uuid,
  name: nonEmptyText("Department name"),
  description: optionalText(2000),
});

export const createDesignationSchema = z.object({
  institutionId: uuid,
  departmentId: optionalId,
  name: nonEmptyText("Designation name"),
  description: optionalText(2000),
});

export const createAcademicSessionSchema = z.object({
  institutionId: uuid,
  name: nonEmptyText("Session name"),
  startDate: calendarDate("Start date"),
  endDate: calendarDate("End date"),
});

export const setCurrentSessionSchema = z.object({
  institutionId: uuid,
  sessionId: uuid,
});

export const closeSessionSchema = z.object({
  institutionId: uuid,
  sessionId: uuid,
});

export const createClassSchema = z.object({
  institutionId: uuid,
  academicSessionId: uuid,
  name: nonEmptyText("Class name"),
  gradeLevel,
  departmentId: optionalId,
  description: optionalText(2000),
  /** Group names created atomically with the class (`DOMAIN-MODEL.md` BR-1). */
  groupNames: z.array(nonEmptyText("Group name")).max(20).default([]),
});

export const createGroupSchema = z.object({
  institutionId: uuid,
  classId: uuid,
  name: nonEmptyText("Group name"),
  description: optionalText(2000),
});

export const createSectionSchema = z.object({
  institutionId: uuid,
  groupId: uuid,
  name: nonEmptyText("Section name"),
  capacity: optionalPositiveIntOrNull("Capacity"),
  floorId: optionalId,
  campusId: optionalId,
});

export const createSubjectSchema = z.object({
  institutionId: uuid,
  name: nonEmptyText("Subject name"),
  code: nonEmptyText("Subject code").max(32),
  kind: z.enum(["theory", "practical", "both"]),
  departmentId: optionalId,
  description: optionalText(2000),
});

export const createTimeSlotSchema = z.object({
  institutionId: uuid,
  academicSessionId: optionalId,
  name: nonEmptyText("Slot name"),
  startTime: clockTime,
  endTime: clockTime,
  sequence: z.preprocess((value) => (value === "" ? 0 : Number(value)), z.number().int().min(1)),
  isBreak: z.boolean().default(false),
});

/** The kind of item a `slug` is being minted for — used to scope collision checks. */
export const slugScope = z.enum([
  "campus",
  "building",
  "department",
  "designation",
  "session",
  "class",
  "group",
  "section",
  "subject",
]);

export type SlugScope = z.infer<typeof slugScope>;

/** Pre-seeded select options shared by class forms and the grade-level registry. */
export const GRADE_LEVEL_OPTIONS = KNOWN_GRADE_LEVELS.map((level) => ({
  value: String(level.ordinal),
  label: level.name,
}));

export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;
export type CreateCampusInput = z.infer<typeof createCampusSchema>;
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;
export type CreateFloorInput = z.infer<typeof createFloorSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type CreateAcademicSessionInput = z.infer<typeof createAcademicSessionSchema>;
export type SetCurrentSessionInput = z.infer<typeof setCurrentSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type CreateTimeSlotInput = z.infer<typeof createTimeSlotSchema>;

export { optionalCalendarDate, optionalId };
