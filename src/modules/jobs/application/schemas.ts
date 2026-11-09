/**
 * Zod validation schemas for Background Jobs & Worker module (`PRD.md` MODULE 34, `RULES.md` §48–§49).
 */
import { z } from "zod";

import {
  CATCH_UP_POLICIES,
  DEAD_LETTER_RESOLUTIONS,
  ERROR_TYPES,
  JOB_STATUSES,
  MIN_VISIBILITY_TIMEOUT_MS,
} from "../domain/job-rules";

/* -------------------------------------------------------------------------- */
/* Trigger / Enqueue Job                                                      */
/* -------------------------------------------------------------------------- */

export const triggerJobSchema = z.object({
  jobType: z.string().trim().min(1, "Job type is required").max(64, "Job type too long"),
  institutionId: z.string().uuid("Invalid institution ID").nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  payloadSchemaVersion: z.number().int().positive().default(1),
  idempotencyKey: z
    .string()
    .trim()
    .min(1, "Idempotency key cannot be empty")
    .max(200, "Idempotency key cannot exceed 200 characters")
    .optional(),
  maxAttempts: z.number().int().positive("Max attempts must be at least 1").optional(),
  visibilityTimeoutMs: z
    .number()
    .int()
    .min(MIN_VISIBILITY_TIMEOUT_MS, `Visibility timeout must be at least ${MIN_VISIBILITY_TIMEOUT_MS}ms`)
    .optional(),
  correlationId: z.string().trim().max(96).optional(),
  requestedByUserId: z.string().uuid("Invalid requested by user ID").optional(),
  deduplicateScope: z.string().trim().max(200).optional(),
  isRecurring: z.boolean().default(false),
  scheduleId: z.string().uuid("Invalid schedule ID").optional(),
});

export type TriggerJobInput = z.infer<typeof triggerJobSchema>;

/* -------------------------------------------------------------------------- */
/* Register / Manage Schedule                                                 */
/* -------------------------------------------------------------------------- */

export const registerScheduleSchema = z
  .object({
    jobType: z.string().trim().min(1, "Job type is required").max(64),
    name: z.string().trim().min(1, "Schedule name is required").max(120),
    institutionId: z.string().uuid("Invalid institution ID").nullable().optional(),
    cronExpression: z.string().trim().max(120).optional(),
    intervalSeconds: z
      .number()
      .int()
      .min(60, "Interval must be at least 60 seconds")
      .optional(),
    timezone: z.string().trim().default("UTC"),
    isActive: z.boolean().default(true),
    payloadTemplate: z.record(z.string(), z.unknown()).default({}),
    maxAttempts: z.number().int().positive().optional(),
    catchUpPolicy: z.enum(CATCH_UP_POLICIES).default("skip"),
  })
  .refine(
    (data) => {
      const hasCron = Boolean(data.cronExpression && data.cronExpression.trim().length > 0);
      const hasInterval = typeof data.intervalSeconds === "number";
      return (hasCron && !hasInterval) || (!hasCron && hasInterval);
    },
    {
      message: "Schedule must provide either a cron expression or an interval in seconds, not both or neither.",
      path: ["cronExpression"],
    },
  );

export type RegisterScheduleInput = z.infer<typeof registerScheduleSchema>;

/* -------------------------------------------------------------------------- */
/* Job Runs & Logging                                                         */
/* -------------------------------------------------------------------------- */

export const recordJobRunSchema = z
  .object({
    jobId: z.string().uuid("Invalid job ID"),
    attemptNumber: z.number().int().positive("Attempt number must be >= 1"),
    workerId: z.string().trim().min(1, "Worker ID is required").max(128),
    startedAt: z.date().default(() => new Date()),
    finishedAt: z.date().optional(),
    durationMs: z.number().int().min(0).optional(),
    succeeded: z.boolean(),
    errorType: z.enum(ERROR_TYPES).optional(),
    errorMessage: z.string().optional(),
    errorStack: z.string().optional(),
    logContext: z.record(z.string(), z.unknown()).optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    logLines: z
      .array(
        z.object({
          level: z.string(),
          message: z.string(),
          at: z.string(),
          data: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
    correlationId: z.string().trim().max(96).optional(),
  })
  .refine(
    (data) => {
      // If succeeded is true, errorType and errorMessage must be null/absent.
      // If succeeded is false, errorType must be specified.
      if (data.succeeded) {
        return !data.errorType && !data.errorMessage;
      }
      return Boolean(data.errorType);
    },
    {
      message: "Successful runs must not have error details, while failed runs must include an errorType.",
      path: ["succeeded"],
    },
  );

export type RecordJobRunInput = z.infer<typeof recordJobRunSchema>;

/* -------------------------------------------------------------------------- */
/* Dead-Letter Operations                                                     */
/* -------------------------------------------------------------------------- */

export const acknowledgeDeadLetterSchema = z.object({
  incidentId: z.string().uuid("Invalid incident ID"),
  note: z.string().trim().optional(),
});

export type AcknowledgeDeadLetterInput = z.infer<typeof acknowledgeDeadLetterSchema>;

export const resolveDeadLetterSchema = z
  .object({
    incidentId: z.string().uuid("Invalid incident ID"),
    resolution: z.enum(DEAD_LETTER_RESOLUTIONS),
    resolutionNote: z
      .string()
      .trim()
      .min(1, "Resolution note is required to explain incident outcome"),
    replayedAsJobId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.resolution !== "replayed" && data.replayedAsJobId) {
        return false;
      }
      return true;
    },
    {
      message: "Replacement job ID is only valid when resolution is 'replayed'",
      path: ["replayedAsJobId"],
    },
  );

export type ResolveDeadLetterInput = z.infer<typeof resolveDeadLetterSchema>;

export const replayDeadLetterSchema = z.object({
  incidentId: z.string().uuid("Invalid incident ID"),
  reason: z.string().trim().min(1, "Replay reason is required").default("Manual operator replay"),
});

export type ReplayDeadLetterInput = z.infer<typeof replayDeadLetterSchema>;

/* -------------------------------------------------------------------------- */
/* Query Filters                                                              */
/* -------------------------------------------------------------------------- */

export const jobQueryFiltersSchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  jobType: z.string().trim().optional(),
  institutionId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type JobQueryFilters = z.infer<typeof jobQueryFiltersSchema>;
