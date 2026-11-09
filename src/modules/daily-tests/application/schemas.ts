/**
 * Input validation schemas for Daily Tests workflows (`PRD.md` MODULE 21, `ARCHITECTURE.md` §23).
 *
 * All validation errors are user-facing, friendly, and non-technical.
 */
import { z } from "zod";

import { calendarDate, nonEmptyText } from "@/shared/validation/fields";
import { EVALUATION_STATUSES } from "../domain/daily-test-rules";

export const CreateDailyTestData = z
  .object({
    institutionId: z.string().uuid("Please select a valid institution."),
    academicSessionId: z.string().uuid("Please select a valid academic session."),
    subjectId: z.string().uuid("Please select a valid subject."),
    title: nonEmptyText("Test title", 200),
    testDate: calendarDate("Test date"),
    totalMarks: z
      .number()
      .positive("Total marks must be greater than zero.")
      .max(1000, "Total marks cannot exceed 1000."),
    classId: z.string().uuid().nullish(),
    sectionId: z.string().uuid().nullish(),
    instructions: z.string().trim().max(1000, "Instructions cannot exceed 1000 characters.").nullish(),
    paperStorageKey: z.string().trim().max(512).nullish(),
  })
  .refine(
    (data) => Boolean((data.classId && data.classId.trim() !== "") || (data.sectionId && data.sectionId.trim() !== "")),
    {
      message: "Please choose either a class or a section for this test.",
      path: ["classId"],
    },
  );

export type CreateDailyTestInput = z.infer<typeof CreateDailyTestData>;

export const BatchEnterEvaluationsData = z.object({
  dailyTestId: z.string().uuid("Please select a valid daily test."),
  evaluations: z
    .array(
      z.object({
        studentId: z.string().uuid("Please select a valid student."),
        status: z.enum(EVALUATION_STATUSES),
        obtainedMarks: z
          .number()
          .min(0, "Obtained marks cannot be negative.")
          .nullish(),
        statusReason: z.string().trim().max(500, "Reason cannot exceed 500 characters.").nullish(),
        notes: z.string().trim().max(500, "Notes cannot exceed 500 characters.").nullish(),
      }),
    )
    .min(1, "Please provide test results for at least one student."),
});

export type BatchEnterEvaluationsInput = z.infer<typeof BatchEnterEvaluationsData>;

export const RecordDailyTestCorrectionData = z.object({
  dailyTestEvaluationId: z.string().uuid("Please select a valid evaluation record."),
  correctedMarks: z
    .number()
    .min(0, "Corrected marks cannot be negative."),
  reason: nonEmptyText("Correction reason", 500),
});

export type RecordDailyTestCorrectionInput = z.infer<typeof RecordDailyTestCorrectionData>;

export const PublishDailyTestData = z.object({
  dailyTestId: z.string().uuid("Please select a valid daily test."),
  channels: z
    .array(z.enum(["student_portal", "guardian_portal", "print", "export"]))
    .default(["student_portal", "guardian_portal"]),
});

export type PublishDailyTestInput = z.infer<typeof PublishDailyTestData>;

export const LockDailyTestData = z.object({
  dailyTestId: z.string().uuid("Please select a valid daily test."),
});

export type LockDailyTestInput = z.infer<typeof LockDailyTestData>;
