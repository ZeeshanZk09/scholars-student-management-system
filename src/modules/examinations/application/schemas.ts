/**
 * Input validation schemas for examination and marks workflows (`PRD.md` MODULE 20).
 */
import { z } from "zod";

import { calendarDate, nonEmptyText } from "@/shared/validation/fields";
import {
  EXAM_MARK_STATUSES,
  EXAMINATION_TYPES,
} from "../domain/exam-rules";

export const CreateExaminationData = z
  .object({
    institutionId: z.string().uuid("A valid institution reference is required."),
    academicSessionId: z.string().uuid("A valid academic session reference is required."),
    subjectId: z.string().uuid("A valid subject reference is required."),
    title: nonEmptyText("Exam title", 200),
    examinationType: z.enum(EXAMINATION_TYPES),
    classId: z.string().uuid().nullish(),
    sectionId: z.string().uuid().nullish(),
    totalMarks: z.number().positive("Total marks must be greater than zero.").max(10000),
    passMarks: z.number().min(0, "Pass marks cannot be negative.").nullish(),
    timeSlotId: z.string().uuid().nullish(),
    examDate: calendarDate("Exam date"),
    setByTeacherUserId: z.string().uuid().nullish(),
    submissionDeadline: z.string().datetime().nullish(),
    description: z.string().trim().max(1000).nullish(),
  })
  .refine(
    (data) => Boolean(data.classId || data.sectionId),
    {
      message: "An examination must specify at least a class or a section scope.",
      path: ["classId"],
    },
  )
  .refine(
    (data) => data.passMarks === null || data.passMarks === undefined || data.passMarks <= data.totalMarks,
    {
      message: "Pass marks cannot exceed total marks.",
      path: ["passMarks"],
    },
  );

export type CreateExaminationInput = z.infer<typeof CreateExaminationData>;

export const EnterMarksBatchData = z.object({
  examinationId: z.string().uuid("A valid examination reference is required."),
  marks: z
    .array(
      z.object({
        studentId: z.string().uuid("A valid student reference is required."),
        status: z.enum(EXAM_MARK_STATUSES),
        obtainedMarks: z.number().min(0, "Marks cannot be negative.").nullish(),
        statusReason: z.string().trim().max(500).nullish(),
        notes: z.string().trim().max(500).nullish(),
      }),
    )
    .min(1, "At least one student mark must be provided."),
  finalize: z.boolean().default(false),
});

export type EnterMarksBatchInput = z.infer<typeof EnterMarksBatchData>;

export const RecordExamMarkCorrectionData = z.object({
  examinationMarkId: z.string().uuid("A valid mark reference is required."),
  correctedMarks: z.number().min(0, "Corrected marks cannot be negative."),
  reason: nonEmptyText("Correction reason", 1000),
});

export type RecordExamMarkCorrectionInput = z.infer<typeof RecordExamMarkCorrectionData>;

export const PublishExaminationData = z.object({
  examinationId: z.string().uuid("A valid examination reference is required."),
});

export type PublishExaminationInput = z.infer<typeof PublishExaminationData>;

export const PublishStudentResultsData = z.object({
  academicSessionId: z.string().uuid("A valid academic session reference is required."),
  classId: z.string().uuid().nullish(),
  sectionId: z.string().uuid().nullish(),
  studentId: z.string().uuid().nullish(),
  gradingSchemeId: z.string().uuid().nullish(),
  channel: z.enum(["in_app", "email", "portal", "printed"]).default("in_app"),
});

export type PublishStudentResultsInput = z.infer<typeof PublishStudentResultsData>;