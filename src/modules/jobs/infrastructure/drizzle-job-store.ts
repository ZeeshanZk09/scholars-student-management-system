/**
 * Drizzle ORM implementation of {@link JobStore} (`PRD.md` MODULE 34, `RULES.md` §48–§49, `ARCHITECTURE.md` §33–§34).
 *
 * Implements durable PostgreSQL job ledger:
 * - Atomic `FOR UPDATE SKIP LOCKED` worker claims
 * - Visibility timeout lease expiry & reclamation
 * - State machine transitions
 * - Dead-letter incidents and retry scheduling
 * - Unique constraint conflict translations
 */
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import {
  deadLetterJobs,
  jobDefinitions,
  jobRuns,
  jobs,
  jobSchedules,
} from "@/db/schema";
import { ConflictError, NotFoundError } from "@/shared/errors";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_VISIBILITY_TIMEOUT_MS,
  type CatchUpPolicy,
  type DeadLetterResolution,
  type ErrorType,
  type FailureOutcome,
  type JobStatus,
} from "../domain/job-rules";
import type {
  CreateJobData,
  DeadLetterJobRow,
  JobDefinitionRow,
  JobRow,
  JobRunRow,
  JobScheduleRow,
  JobStore,
  UpsertJobDefinitionData,
} from "../application/ports";
import type {
  JobQueryFilters,
  RecordJobRunInput,
  RegisterScheduleInput,
} from "../application/schemas";

/* -------------------------------------------------------------------------- */
/* Unique Violation Helpers                                                   */
/* -------------------------------------------------------------------------- */

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "23505"
  );
}

export function constraintOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const message =
    "message" in error ? (error as { readonly message?: unknown }).message : undefined;
  if (typeof message !== "string") return undefined;
  const match = /unique constraint "([^"]+)"/i.exec(message);
  return match?.[1];
}

export function uniqueConflictError(error: unknown): ConflictError | undefined {
  if (!isUniqueViolation(error)) return undefined;
  const constraint = constraintOf(error);
  if (!constraint) return undefined;

  if (constraint.includes("jobs_idempotency_key_unique")) {
    return new ConflictError("A job with this idempotency key already exists.", {
      userMessage: "This task has already been submitted and duplicate processing is prevented.",
    });
  }

  if (constraint.includes("dead_letter_jobs_job_unique")) {
    return new ConflictError("A dead letter incident already exists for this job.", {
      userMessage: "An incident report has already been logged for this failed job.",
    });
  }

  if (constraint.includes("job_schedules_name_unique")) {
    return new ConflictError("A schedule with this name already exists for this institution.", {
      userMessage: "A recurring schedule with this name already exists.",
    });
  }

  if (constraint.includes("job_definitions_type_unique")) {
    return new ConflictError("A job definition already exists for this job type.", {
      userMessage: "A job definition for this job type is already registered.",
    });
  }

  if (constraint.includes("job_runs_job_attempt_unique")) {
    return new ConflictError("A run log for this job attempt has already been recorded.", {
      userMessage: "A log for this job attempt has already been recorded.",
    });
  }

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Mappers                                                                    */
/* -------------------------------------------------------------------------- */

function toJobRow(row: typeof jobs.$inferSelect): JobRow {
  return {
    id: row.id,
    institutionId: row.institutionId,
    jobType: row.jobType,
    idempotencyKey: row.idempotencyKey,
    status: row.status as JobStatus,
    payload: row.payload ?? {},
    payloadSchemaVersion: row.payloadSchemaVersion,
    deduplicateScope: row.deduplicateScope,
    isRecurring: row.isRecurring,
    scheduleId: row.scheduleId,
    maxAttempts: row.maxAttempts,
    claimedBy: row.claimedBy,
    claimedAt: row.claimedAt,
    heartbeatAt: row.heartbeatAt,
    visibilityTimeoutMs: row.visibilityTimeoutMs,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    deadLetteredAt: row.deadLetteredAt,
    deadLetterReason: row.deadLetterReason,
    lastError: row.lastError,
    result: row.result,
    progressNote: row.progressNote,
    durationMs: row.durationMs,
    requestedByUserId: row.requestedByUserId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toJobRunRow(row: typeof jobRuns.$inferSelect): JobRunRow {
  return {
    id: row.id,
    jobId: row.jobId,
    attemptNumber: row.attemptNumber,
    workerId: row.workerId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    succeeded: row.succeeded,
    errorType: (row.errorType as ErrorType) ?? null,
    errorMessage: row.errorMessage,
    errorStack: row.errorStack,
    logContext: row.logContext,
    result: row.result,
    logLines: row.logLines,
    correlationId: row.correlationId,
  };
}

function toJobScheduleRow(row: typeof jobSchedules.$inferSelect): JobScheduleRow {
  return {
    id: row.id,
    institutionId: row.institutionId,
    jobType: row.jobType,
    name: row.name,
    cronExpression: row.cronExpression,
    intervalSeconds: row.intervalSeconds,
    timezone: row.timezone,
    isActive: row.isActive,
    payloadTemplate: row.payloadTemplate ?? {},
    maxAttempts: row.maxAttempts,
    catchUpPolicy: row.catchUpPolicy as CatchUpPolicy,
    lastEnqueuedAt: row.lastEnqueuedAt,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastJobId: row.lastJobId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toDeadLetterJobRow(row: typeof deadLetterJobs.$inferSelect): DeadLetterJobRow {
  return {
    id: row.id,
    jobId: row.jobId,
    jobType: row.jobType,
    institutionId: row.institutionId,
    attemptCount: row.attemptCount,
    errorMessage: row.errorMessage,
    errorType: row.errorType,
    deadLetteredAt: row.deadLetteredAt,
    acknowledgedByUserId: row.acknowledgedByUserId,
    acknowledgedAt: row.acknowledgedAt,
    acknowledgementNote: row.acknowledgementNote,
    resolution: (row.resolution as DeadLetterResolution) ?? null,
    resolvedAt: row.resolvedAt,
    resolvedByUserId: row.resolvedByUserId,
    replayedAsJobId: row.replayedAsJobId,
    resolutionNote: row.resolutionNote,
  };
}

function toJobDefinitionRow(row: typeof jobDefinitions.$inferSelect): JobDefinitionRow {
  return {
    id: row.id,
    jobType: row.jobType,
    handlerName: row.handlerName,
    displayName: row.displayName,
    description: row.description,
    defaultMaxAttempts: row.defaultMaxAttempts,
    defaultVisibilityTimeoutMs: row.defaultVisibilityTimeoutMs,
    retryBackoffMs: row.retryBackoffMs,
    retryBackoffIsExponential: row.retryBackoffIsExponential,
    allowsConcurrency: row.allowsConcurrency,
    maxConcurrentRuns: row.maxConcurrentRuns,
    requiresInstitutionScope: row.requiresInstitutionScope,
    isActive: row.isActive,
    estimatedDurationMs: row.estimatedDurationMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Store Implementation                                                       */
/* -------------------------------------------------------------------------- */

export function createDrizzleJobStore(client: DbLike = db): JobStore {
  return {
    async findJobById(id: string): Promise<JobRow | null> {
      const rows = await client.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      const first = rows[0];
      return first ? toJobRow(first) : null;
    },

    async findJobByIdempotencyKey(key: string): Promise<JobRow | null> {
      const rows = await client.select().from(jobs).where(eq(jobs.idempotencyKey, key)).limit(1);
      const first = rows[0];
      return first ? toJobRow(first) : null;
    },

    async listJobs(filters?: JobQueryFilters): Promise<readonly JobRow[]> {
      const conditions = [];

      if (filters?.status) {
        conditions.push(eq(jobs.status, filters.status));
      }
      if (filters?.jobType) {
        conditions.push(eq(jobs.jobType, filters.jobType));
      }
      if (filters?.institutionId) {
        conditions.push(eq(jobs.institutionId, filters.institutionId));
      }

      const query = client
        .select()
        .from(jobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(jobs.createdAt))
        .limit(filters?.limit ?? 20)
        .offset(filters?.offset ?? 0);

      const rows = await query;
      return rows.map(toJobRow);
    },

    async createJob(input: CreateJobData): Promise<JobRow> {
      try {
        const isRecurring = input.isRecurring ?? false;
        const deduplicateScope = isRecurring
          ? null
          : (input.deduplicateScope ?? input.idempotencyKey);

        const inserted = await client
          .insert(jobs)
          .values({
            institutionId: input.institutionId ?? null,
            jobType: input.jobType,
            idempotencyKey: input.idempotencyKey,
            status: "queued",
            payload: input.payload,
            payloadSchemaVersion: input.payloadSchemaVersion ?? 1,
            deduplicateScope,
            isRecurring,
            scheduleId: input.scheduleId ?? null,
            maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            visibilityTimeoutMs: input.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS,
            nextAttemptAt: input.nextAttemptAt ?? null,
            correlationId: input.correlationId ?? null,
            requestedByUserId: input.requestedByUserId ?? null,
          })
          .returning();

        const row = inserted[0];
        if (!row) {
          throw new Error("Failed to insert job row");
        }
        return toJobRow(row);
      } catch (error: unknown) {
        const conflict = uniqueConflictError(error);
        if (conflict) throw conflict;
        throw error;
      }
    },

    async claimJobs(params: {
      readonly workerId: string;
      readonly limit: number;
      readonly now?: Date;
    }): Promise<readonly JobRow[]> {
      const now = params.now ?? new Date();

      return client.transaction(async (tx) => {
        // Query IDs with FOR UPDATE SKIP LOCKED
        const candidateRows = await tx.execute<{ id: string }>(sql`
          SELECT ${jobs.id} AS id
          FROM ${jobs}
          WHERE ${jobs.status} = 'queued'
            AND (${jobs.nextAttemptAt} IS NULL OR ${jobs.nextAttemptAt} <= ${now})
          ORDER BY ${jobs.nextAttemptAt} ASC NULLS FIRST, ${jobs.createdAt} ASC
          LIMIT ${params.limit}
          FOR UPDATE SKIP LOCKED
        `);

        const candidateIds = candidateRows.rows.map((r: { id: string }) => r.id);
        if (candidateIds.length === 0) return [];

        const updatedRows = await tx
          .update(jobs)
          .set({
            status: "running",
            claimedBy: params.workerId,
            claimedAt: now,
            startedAt: sql`COALESCE(${jobs.startedAt}, ${now})`,
            updatedAt: now,
            version: sql`${jobs.version} + 1`,
          })
          .where(inArray(jobs.id, candidateIds))
          .returning();

        return updatedRows.map(toJobRow);
      });
    },

    async heartbeatJob(jobId: string, workerId: string, now: Date = new Date()): Promise<boolean> {
      const updated = await client
        .update(jobs)
        .set({
          heartbeatAt: now,
          updatedAt: now,
        })
        .where(and(eq(jobs.id, jobId), eq(jobs.claimedBy, workerId), eq(jobs.status, "running")))
        .returning({ id: jobs.id });

      return updated.length > 0;
    },

    async completeJob(params: {
      readonly jobId: string;
      readonly workerId: string;
      readonly result?: Record<string, unknown>;
      readonly durationMs: number;
      readonly now?: Date;
    }): Promise<JobRow> {
      const now = params.now ?? new Date();
      const updated = await client
        .update(jobs)
        .set({
          status: "completed",
          completedAt: now,
          durationMs: params.durationMs,
          result: params.result ?? null,
          claimedBy: null,
          claimedAt: null,
          updatedAt: now,
          version: sql`${jobs.version} + 1`,
        })
        .where(eq(jobs.id, params.jobId))
        .returning();

      const first = updated[0];
      if (!first) {
        throw new NotFoundError(`Job ${params.jobId} not found.`);
      }
      return toJobRow(first);
    },

    async failJob(params: {
      readonly jobId: string;
      readonly workerId: string;
      readonly errorType: ErrorType;
      readonly errorMessage: string;
      readonly errorStack?: string;
      readonly outcome: FailureOutcome;
      readonly durationMs: number;
      readonly now?: Date;
    }): Promise<{ readonly job: JobRow; readonly deadLetter?: DeadLetterJobRow }> {
      const now = params.now ?? new Date();

      return client.transaction(async (tx) => {
        if (params.outcome.outcome === "retry") {
          const updated = await tx
            .update(jobs)
            .set({
              status: "failed",
              attemptCount: params.outcome.nextAttemptNumber - 1,
              nextAttemptAt: params.outcome.nextAttemptAt,
              lastError: params.errorMessage,
              claimedBy: null,
              claimedAt: null,
              updatedAt: now,
              version: sql`${jobs.version} + 1`,
            })
            .where(eq(jobs.id, params.jobId))
            .returning();

          const first = updated[0];
          if (!first) {
            throw new NotFoundError(`Job ${params.jobId} not found.`);
          }
          return { job: toJobRow(first) };
        }

        // Dead letter outcome
        const deadLetteredAt = params.outcome.deadLetteredAt;
        const deadLetterReason = params.outcome.deadLetterReason;

        const updated = await tx
          .update(jobs)
          .set({
            status: "dead_letter",
            attemptCount: sql`${jobs.attemptCount} + 1`,
            deadLetteredAt,
            deadLetterReason,
            lastError: params.errorMessage,
            claimedBy: null,
            claimedAt: null,
            updatedAt: now,
            version: sql`${jobs.version} + 1`,
          })
          .where(eq(jobs.id, params.jobId))
          .returning();

        const first = updated[0];
        if (!first) {
          throw new NotFoundError(`Job ${params.jobId} not found.`);
        }

        const deadLetterRows = await tx
          .insert(deadLetterJobs)
          .values({
            jobId: first.id,
            jobType: first.jobType,
            institutionId: first.institutionId,
            attemptCount: first.attemptCount,
            errorMessage: params.errorMessage,
            errorType: params.errorType,
            deadLetteredAt,
          })
          .returning();

        const deadLetterFirst = deadLetterRows[0];
        if (!deadLetterFirst) {
          throw new Error("Failed to record dead letter job incident");
        }

        return {
          job: toJobRow(first),
          deadLetter: toDeadLetterJobRow(deadLetterFirst),
        };
      });
    },

    async reclaimStaleClaims(now: Date = new Date()): Promise<number> {
      const reclaimed = await client.execute<{ id: string }>(sql`
        UPDATE ${jobs}
        SET
          status = 'queued',
          claimed_by = NULL,
          claimed_at = NULL,
          heartbeat_at = NULL,
          updated_at = ${now},
          version = ${jobs.version} + 1
        WHERE ${jobs.status} = 'running'
          AND ${jobs.claimedAt} IS NOT NULL
          AND (
            (${jobs.heartbeatAt} IS NOT NULL AND ${jobs.heartbeatAt} + (${jobs.visibilityTimeoutMs} || ' milliseconds')::interval <= ${now})
            OR
            (${jobs.heartbeatAt} IS NULL AND ${jobs.claimedAt} + (${jobs.visibilityTimeoutMs} || ' milliseconds')::interval <= ${now})
          )
        RETURNING ${jobs.id} AS id
      `);

      return reclaimed.rows.length;
    },

    async recordJobRun(input: RecordJobRunInput): Promise<JobRunRow> {
      try {
        const inserted = await client
          .insert(jobRuns)
          .values({
            jobId: input.jobId,
            attemptNumber: input.attemptNumber,
            workerId: input.workerId,
            startedAt: input.startedAt,
            finishedAt: input.finishedAt ?? null,
            durationMs: input.durationMs ?? null,
            succeeded: input.succeeded,
            errorType: input.errorType ?? null,
            errorMessage: input.errorMessage ?? null,
            errorStack: input.errorStack ?? null,
            logContext: input.logContext ?? null,
            result: input.result ?? null,
            logLines: input.logLines ?? null,
            correlationId: input.correlationId ?? null,
          })
          .returning();

        const first = inserted[0];
        if (!first) {
          throw new Error("Failed to insert job run row");
        }
        return toJobRunRow(first);
      } catch (error: unknown) {
        const conflict = uniqueConflictError(error);
        if (conflict) throw conflict;
        throw error;
      }
    },

    async listRunsForJob(jobId: string): Promise<readonly JobRunRow[]> {
      const rows = await client
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.jobId, jobId))
        .orderBy(asc(jobRuns.attemptNumber));

      return rows.map(toJobRunRow);
    },

    async listRecentRuns(limit: number = 50): Promise<readonly JobRunRow[]> {
      const rows = await client
        .select()
        .from(jobRuns)
        .orderBy(desc(jobRuns.startedAt))
        .limit(limit);

      return rows.map(toJobRunRow);
    },

    async findDeadLetterByJobId(jobId: string): Promise<DeadLetterJobRow | null> {
      const rows = await client
        .select()
        .from(deadLetterJobs)
        .where(eq(deadLetterJobs.jobId, jobId))
        .limit(1);

      const first = rows[0];
      return first ? toDeadLetterJobRow(first) : null;
    },

    async findDeadLetterById(id: string): Promise<DeadLetterJobRow | null> {
      const rows = await client
        .select()
        .from(deadLetterJobs)
        .where(eq(deadLetterJobs.id, id))
        .limit(1);

      const first = rows[0];
      return first ? toDeadLetterJobRow(first) : null;
    },

    async listDeadLetters(filters?: {
      readonly institutionId?: string;
      readonly unresolvedOnly?: boolean;
      readonly limit?: number;
      readonly offset?: number;
    }): Promise<readonly DeadLetterJobRow[]> {
      const conditions = [];

      if (filters?.institutionId) {
        conditions.push(eq(deadLetterJobs.institutionId, filters.institutionId));
      }
      if (filters?.unresolvedOnly) {
        conditions.push(isNull(deadLetterJobs.resolvedAt));
      }

      const rows = await client
        .select()
        .from(deadLetterJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(deadLetterJobs.deadLetteredAt))
        .limit(filters?.limit ?? 50)
        .offset(filters?.offset ?? 0);

      return rows.map(toDeadLetterJobRow);
    },

    async acknowledgeDeadLetter(
      incidentId: string,
      userId: string,
      note?: string,
      now: Date = new Date(),
    ): Promise<DeadLetterJobRow> {
      const updated = await client
        .update(deadLetterJobs)
        .set({
          acknowledgedByUserId: userId,
          acknowledgedAt: now,
          acknowledgementNote: note ?? null,
        })
        .where(eq(deadLetterJobs.id, incidentId))
        .returning();

      const first = updated[0];
      if (!first) {
        throw new NotFoundError(`Dead letter incident ${incidentId} not found.`);
      }
      return toDeadLetterJobRow(first);
    },

    async resolveDeadLetter(
      incidentId: string,
      userId: string,
      resolution: DeadLetterResolution,
      note: string,
      replayedAsJobId?: string,
      now: Date = new Date(),
    ): Promise<DeadLetterJobRow> {
      const updated = await client
        .update(deadLetterJobs)
        .set({
          resolution,
          resolutionNote: note,
          resolvedByUserId: userId,
          resolvedAt: now,
          replayedAsJobId: replayedAsJobId ?? null,
        })
        .where(eq(deadLetterJobs.id, incidentId))
        .returning();

      const first = updated[0];
      if (!first) {
        throw new NotFoundError(`Dead letter incident ${incidentId} not found.`);
      }
      return toDeadLetterJobRow(first);
    },

    async findJobDefinition(jobType: string): Promise<JobDefinitionRow | null> {
      const rows = await client
        .select()
        .from(jobDefinitions)
        .where(eq(jobDefinitions.jobType, jobType))
        .limit(1);

      const first = rows[0];
      return first ? toJobDefinitionRow(first) : null;
    },

    async upsertJobDefinition(definition: UpsertJobDefinitionData): Promise<JobDefinitionRow> {
      const updated = await client
        .insert(jobDefinitions)
        .values({
          jobType: definition.jobType,
          handlerName: definition.handlerName,
          displayName: definition.displayName,
          description: definition.description ?? null,
          defaultMaxAttempts: definition.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          defaultVisibilityTimeoutMs:
            definition.defaultVisibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS,
          retryBackoffMs: definition.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS,
          retryBackoffIsExponential: definition.retryBackoffIsExponential ?? false,
          allowsConcurrency: definition.allowsConcurrency ?? false,
          maxConcurrentRuns: definition.maxConcurrentRuns ?? null,
          requiresInstitutionScope: definition.requiresInstitutionScope ?? true,
          isActive: definition.isActive ?? true,
          estimatedDurationMs: definition.estimatedDurationMs ?? null,
        })
        .onConflictDoUpdate({
          target: jobDefinitions.jobType,
          set: {
            handlerName: definition.handlerName,
            displayName: definition.displayName,
            description: definition.description ?? null,
            defaultMaxAttempts: definition.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            defaultVisibilityTimeoutMs:
              definition.defaultVisibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS,
            retryBackoffMs: definition.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS,
            retryBackoffIsExponential: definition.retryBackoffIsExponential ?? false,
            allowsConcurrency: definition.allowsConcurrency ?? false,
            maxConcurrentRuns: definition.maxConcurrentRuns ?? null,
            requiresInstitutionScope: definition.requiresInstitutionScope ?? true,
            isActive: definition.isActive ?? true,
            estimatedDurationMs: definition.estimatedDurationMs ?? null,
          },
        })
        .returning();

      const first = updated[0];
      if (!first) {
        throw new Error("Failed to upsert job definition");
      }
      return toJobDefinitionRow(first);
    },

    async listJobDefinitions(): Promise<readonly JobDefinitionRow[]> {
      const rows = await client.select().from(jobDefinitions);
      return rows.map(toJobDefinitionRow);
    },

    async createSchedule(input: RegisterScheduleInput): Promise<JobScheduleRow> {
      try {
        const inserted = await client
          .insert(jobSchedules)
          .values({
            institutionId: input.institutionId ?? null,
            jobType: input.jobType,
            name: input.name,
            cronExpression: input.cronExpression ?? null,
            intervalSeconds: input.intervalSeconds ?? null,
            timezone: input.timezone ?? "UTC",
            isActive: input.isActive ?? true,
            payloadTemplate: input.payloadTemplate ?? {},
            maxAttempts: input.maxAttempts ?? null,
            catchUpPolicy: input.catchUpPolicy ?? "skip",
            nextRunAt: new Date(),
          })
          .returning();

        const first = inserted[0];
        if (!first) {
          throw new Error("Failed to insert schedule row");
        }
        return toJobScheduleRow(first);
      } catch (error: unknown) {
        const conflict = uniqueConflictError(error);
        if (conflict) throw conflict;
        throw error;
      }
    },

    async findScheduleById(id: string): Promise<JobScheduleRow | null> {
      const rows = await client
        .select()
        .from(jobSchedules)
        .where(eq(jobSchedules.id, id))
        .limit(1);

      const first = rows[0];
      return first ? toJobScheduleRow(first) : null;
    },

    async listDueSchedules(now: Date = new Date()): Promise<readonly JobScheduleRow[]> {
      const rows = await client
        .select()
        .from(jobSchedules)
        .where(
          and(
            eq(jobSchedules.isActive, true),
            lte(jobSchedules.nextRunAt, now),
          ),
        )
        .orderBy(asc(jobSchedules.nextRunAt));

      return rows.map(toJobScheduleRow);
    },

    async advanceSchedule(
      id: string,
      lastJobId: string,
      nextRunAt: Date | null,
      now: Date = new Date(),
    ): Promise<JobScheduleRow> {
      const updated = await client
        .update(jobSchedules)
        .set({
          lastJobId,
          lastEnqueuedAt: now,
          lastRunAt: now,
          nextRunAt,
          updatedAt: now,
          version: sql`${jobSchedules.version} + 1`,
        })
        .where(eq(jobSchedules.id, id))
        .returning();

      const first = updated[0];
      if (!first) {
        throw new NotFoundError(`Schedule ${id} not found.`);
      }
      return toJobScheduleRow(first);
    },
  };
}
