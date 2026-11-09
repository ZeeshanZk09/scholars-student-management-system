/**
 * Teacher application schemas (`PRD.md` MODULE 20, `src/db/schema/teacher.ts`).
 */
import { z } from "zod";

export const createTeacherSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),
  institutionId: z.string().uuid("Invalid institution ID."),
  employeeCode: z.string().trim().max(64).optional().nullable(),
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().email("Invalid email address.").optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  departmentId: z.string().uuid("Invalid department ID.").optional().nullable(),
  subjectIds: z.array(z.string().uuid()).default([]),
  registrationNumber: z.string().trim().max(64).optional().nullable(),
  qualification: z.string().trim().max(160).optional().nullable(),
  maxPeriodsPerDay: z.number().int().positive("Must be a positive integer.").optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  photoUrl: z.string().trim().url().max(512).optional().nullable(),
  hiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format.").optional().nullable(),
});

export type CreateTeacherInput = z.input<typeof createTeacherSchema>;

export const updateTeacherSchema = createTeacherSchema.partial().omit({
  userId: true,
  institutionId: true,
});

export type UpdateTeacherInput = z.input<typeof updateTeacherSchema>;

export const createTeacherAssignmentSchema = z
  .object({
    institutionId: z.string().uuid("Invalid institution ID."),
    teacherId: z.string().uuid("Invalid teacher user ID."),
    academicSessionId: z.string().uuid("Invalid academic session ID."),
    subjectId: z.string().uuid("Invalid subject ID.").optional().nullable(),
    classId: z.string().uuid("Invalid class ID.").optional().nullable(),
    groupId: z.string().uuid("Invalid group ID.").optional().nullable(),
    sectionId: z.string().uuid("Invalid section ID.").optional().nullable(),
    isClassTeacher: z.boolean().default(false),
    assignedFrom: z.date().default(() => new Date()),
    assignedUntil: z.date().optional().nullable(),
  })
  .refine(
    (data) => {
      const nonNulls = [data.classId, data.groupId, data.sectionId].filter(Boolean);
      return nonNulls.length === 1;
    },
    {
      message: "Exactly one of class, group, or section must be specified.",
      path: ["sectionId"],
    },
  );

export type CreateTeacherAssignmentInput = z.input<typeof createTeacherAssignmentSchema>;

export const addTeacherSubjectSchema = z.object({
  teacherUserId: z.string().uuid("Invalid teacher user ID."),
  subjectId: z.string().uuid("Invalid subject ID."),
  isVerified: z.boolean().default(false),
  verifiedByUserId: z.string().uuid().optional().nullable(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format."),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format.").optional().nullable(),
});

export type AddTeacherSubjectInput = z.input<typeof addTeacherSubjectSchema>;

export const listTeachersFilterSchema = z.object({
  institutionId: z.string().uuid("Invalid institution ID."),
  departmentId: z.string().uuid().optional(),
  query: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export type ListTeachersFilter = z.input<typeof listTeachersFilterSchema>;

export const listTeacherAssignmentsFilterSchema = z.object({
  institutionId: z.string().uuid("Invalid institution ID."),
  teacherId: z.string().uuid().optional(),
  academicSessionId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});

export type ListTeacherAssignmentsFilter = z.input<typeof listTeacherAssignmentsFilterSchema>;
