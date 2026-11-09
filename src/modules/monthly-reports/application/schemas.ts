/**
 * Input schemas for monthly test reports use cases (`PRD.md` MODULE 22, `PHASES.md` Phase 26).
 *
 * Implements strict Zod validation at the application boundary for single and batch report generation,
 * batch publication, locking, and report queries.
 */
import { z } from "zod";

import { MONTHLY_REPORT_STATUSES } from "../domain/report-rules";

const uuid = z.uuid("A valid UUID reference is required.");

export const monthKeySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format (e.g. 2026-10).");

/* -------------------------------------------------------------------------- */
/* Single Student Report Generation Schema                                    */
/* -------------------------------------------------------------------------- */

export const GenerateMonthlyReportSchema = z.object({
  institutionId: uuid,
  academicSessionId: uuid,
  studentId: uuid,
  subjectId: uuid,
  periodMonth: monthKeySchema,
  classId: uuid.nullish(),
  sectionId: uuid.nullish(),
});

export type GenerateMonthlyReportInput = z.infer<typeof GenerateMonthlyReportSchema>;

/* -------------------------------------------------------------------------- */
/* Batch Report Generation Schema                                             */
/* -------------------------------------------------------------------------- */

export const BatchGenerateMonthlyReportsSchema = z.object({
  institutionId: uuid,
  academicSessionId: uuid,
  classId: uuid,
  sectionId: uuid.nullish(),
  periodMonth: monthKeySchema,
  subjectId: uuid.nullish(), // If omitted, generates reports for all active subjects
});

export type BatchGenerateMonthlyReportsInput = z.infer<typeof BatchGenerateMonthlyReportsSchema>;

/* -------------------------------------------------------------------------- */
/* Batch Publication & Locking Schemas                                        */
/* -------------------------------------------------------------------------- */

export const PublishMonthlyReportsBatchSchema = z.object({
  institutionId: uuid,
  reportIds: z.array(uuid).min(1, "At least one report must be selected for publication."),
  sendEmail: z.boolean().default(false),
});

export type PublishMonthlyReportsBatchInput = z.infer<typeof PublishMonthlyReportsBatchSchema>;

export const LockMonthlyReportsBatchSchema = z.object({
  institutionId: uuid,
  reportIds: z.array(uuid).min(1, "At least one report must be selected for locking."),
});

export type LockMonthlyReportsBatchInput = z.infer<typeof LockMonthlyReportsBatchSchema>;

/* -------------------------------------------------------------------------- */
/* Query / Filter Schemas                                                     */
/* -------------------------------------------------------------------------- */

export const QueryMonthlyReportsSchema = z.object({
  institutionId: uuid,
  academicSessionId: uuid.nullish(),
  studentId: uuid.nullish(),
  subjectId: uuid.nullish(),
  classId: uuid.nullish(),
  sectionId: uuid.nullish(),
  periodMonth: monthKeySchema.nullish(),
  status: z.enum(MONTHLY_REPORT_STATUSES).nullish(),
  includeSuperseded: z.boolean().default(false),
});

export type QueryMonthlyReportsInput = z.infer<typeof QueryMonthlyReportsSchema>;
