/**
 * In-memory `JobStore` for testing the jobs module without a database (`src/modules/README.md`: ports in, Drizzle out).
 *
 * Faithfully mirrors database constraints:
 * - Unique idempotency keys
 * - Visibility timeouts and lease reclamation
 * - State machine transitions
 * - Dead-letter incidents
 * - Run logging and schedule tracking
 */
import { ConflictError, NotFoundError } from "@/shared/errors";
import {
  assertValidJobStatusTransition,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_VISIBILITY_TIMEOUT_MS,
  isJobClaimExpired,
} from "../../domain/job-rules";
import type {
  CreateJobData,
  DeadLetterJobRow,
  JobDefinitionRow,
  JobRow,
  JobRunRow,
  JobScheduleRow,
  JobStore,
  UpsertJobDefinitionData,
} from "../ports";
import type {
  JobQueryFilters,
  RecordJobRunInput,
  RegisterScheduleInput,
} from "../schemas";

export function createFakeJobStore(): JobStore {
  const jobsMap = new Map<string, JobRow>();
  const runsMap = new Map<string, JobRunRow>();
  const schedulesMap = new Map<string, JobScheduleRow>();
  const definitionsMap = new Map<string, JobDefinitionRow>();
  const deadLettersMap = new Map<string, DeadLetterJobRow>();

  return {
    async findJobById(id: string): Promise<JobRow | null> {
      return jobsMap.get(id) ?? null;
    },

    async findJobByIdempotencyKey(key: string): Promise<JobRow | null> {
      for (const job of jobsMap.values()) {
        if (job.idempotencyKey === key) {
          return job;
        }
      }
      return null;
    },

    async listJobs(filters?: JobQueryFilters): Promise<readonly JobRow[]> {
      let list = Array.from(jobsMap.values());

      if (filters?.status) {
        list = list.filter((j) => j.status === filters.status);
      }
      if (filters?.jobType) {
        list = list.filter((j) => j.jobType === filters.jobType);
      }
      if (filters?.institutionId) {
        list = list.filter((j) => j.institutionId === filters.institutionId);
      }

      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const offset = filters?.offset ?? 0;
      const limit = filters?.limit ?? 20;
      return list.slice(offset, offset + limit);
    },

    async createJob(input: CreateJobData): Promise<JobRow> {
      for (const existing of jobsMap.values()) {
        if (existing.idempotencyKey === input.idempotencyKey) {
          throw new ConflictError("A job with this idempotency key already exists.", {
            userMessage: "This task has already been submitted and duplicate processing is prevented.",
          });
        }
      }

      const id = crypto.randomUUID();
      const now = new Date();
      const isRecurring = input.isRecurring ?? false;
      const deduplicateScope = isRecurring
        ? null
        : (input.deduplicateScope ?? input.idempotencyKey);

      const job: JobRow = {
        id,
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
        claimedBy: null,
        claimedAt: null,
        heartbeatAt: null,
        visibilityTimeoutMs: input.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS,
        attemptCount: 0,
        nextAttemptAt: input.nextAttemptAt ?? null,
        startedAt: null,
        completedAt: null,
        deadLetteredAt: null,
        deadLetterReason: null,
        lastError: null,
        result: null,
        progressNote: null,
        durationMs: null,
        requestedByUserId: input.requestedByUserId ?? null,
        correlationId: input.correlationId ?? null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      jobsMap.set(id, job);
      return job;
    },

    async claimJobs(params: {
      readonly workerId: string;
      readonly limit: number;
      readonly now?: Date;
    }): Promise<readonly JobRow[]> {
      const now = params.now ?? new Date();
      const candidateJobs: JobRow[] = [];

      for (const job of jobsMap.values()) {
        if (job.status !== "queued") continue;
        if (job.nextAttemptAt && job.nextAttemptAt.getTime() > now.getTime()) continue;
        candidateJobs.push(job);
      }

      // Sort by nextAttemptAt asc nulls first, then createdAt asc
      candidateJobs.sort((a, b) => {
        const timeA = a.nextAttemptAt ? a.nextAttemptAt.getTime() : 0;
        const timeB = b.nextAttemptAt ? b.nextAttemptAt.getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      const claimed: JobRow[] = [];
      const toClaim = candidateJobs.slice(0, params.limit);

      for (const job of toClaim) {
        assertValidJobStatusTransition(job.status, "running");
        const updated: JobRow = {
          ...job,
          status: "running",
          claimedBy: params.workerId,
          claimedAt: now,
          startedAt: job.startedAt ?? now,
          updatedAt: now,
          version: job.version + 1,
        };
        jobsMap.set(job.id, updated);
        claimed.push(updated);
      }

      return claimed;
    },

    async heartbeatJob(jobId: string, workerId: string, now: Date = new Date()): Promise<boolean> {
      const job = jobsMap.get(jobId);
      if (!job || job.status !== "running" || job.claimedBy !== workerId) {
        return false;
      }
      const updated: JobRow = {
        ...job,
        heartbeatAt: now,
        updatedAt: now,
      };
      jobsMap.set(jobId, updated);
      return true;
    },

    async completeJob(params: {
      readonly jobId: string;
      readonly workerId: string;
      readonly result?: Record<string, unknown>;
      readonly durationMs: number;
      readonly now?: Date;
    }): Promise<JobRow> {
      const now = params.now ?? new Date();
      const job = jobsMap.get(params.jobId);
      if (!job) {
        throw new NotFoundError(`Job with ID ${params.jobId} not found.`);
      }

      assertValidJobStatusTransition(job.status, "completed");

      const updated: JobRow = {
        ...job,
        status: "completed",
        completedAt: now,
        durationMs: params.durationMs,
        result: params.result ?? null,
        claimedBy: null,
        claimedAt: null,
        updatedAt: now,
        version: job.version + 1,
      };

      jobsMap.set(params.jobId, updated);
      return updated;
    },

    async failJob(
      params: Parameters<JobStore["failJob"]>[0],
    ): Promise<{ readonly job: JobRow; readonly deadLetter?: DeadLetterJobRow }> {
      const now = params.now ?? new Date();
      const job = jobsMap.get(params.jobId);
      if (!job) {
        throw new NotFoundError(`Job with ID ${params.jobId} not found.`);
      }

      if (params.outcome.outcome === "retry") {
        assertValidJobStatusTransition(job.status, "failed");

        const updated: JobRow = {
          ...job,
          status: "failed",
          attemptCount: params.outcome.nextAttemptNumber
            ? params.outcome.nextAttemptNumber - 1
            : job.attemptCount + 1,
          nextAttemptAt: params.outcome.nextAttemptAt ?? null,
          lastError: params.errorMessage,
          claimedBy: null,
          claimedAt: null,
          updatedAt: now,
          version: job.version + 1,
        };
        jobsMap.set(params.jobId, updated);
        return { job: updated };
      }

      // Dead letter outcome
      assertValidJobStatusTransition(job.status, "dead_letter");

      const deadLetteredAt = params.outcome.deadLetteredAt ?? now;
      const deadLetterReason =
        params.outcome.deadLetterReason ?? `Job failed: ${params.errorMessage}`;

      const updated: JobRow = {
        ...job,
        status: "dead_letter",
        attemptCount: job.attemptCount + 1,
        deadLetteredAt,
        deadLetterReason,
        lastError: params.errorMessage,
        claimedBy: null,
        claimedAt: null,
        updatedAt: now,
        version: job.version + 1,
      };
      jobsMap.set(params.jobId, updated);

      const incidentId = crypto.randomUUID();
      const deadLetter: DeadLetterJobRow = {
        id: incidentId,
        jobId: job.id,
        jobType: job.jobType,
        institutionId: job.institutionId,
        attemptCount: job.attemptCount + 1,
        errorMessage: params.errorMessage,
        errorType: params.errorType,
        deadLetteredAt,
        acknowledgedByUserId: null,
        acknowledgedAt: null,
        acknowledgementNote: null,
        resolution: null,
        resolvedAt: null,
        resolvedByUserId: null,
        replayedAsJobId: null,
        resolutionNote: null,
      };
      deadLettersMap.set(incidentId, deadLetter);

      return { job: updated, deadLetter };
    },

    async reclaimStaleClaims(now: Date = new Date()): Promise<number> {
      let reclaimedCount = 0;

      for (const job of jobsMap.values()) {
        if (job.status !== "running" || !job.claimedAt) continue;

        if (isJobClaimExpired(job.claimedAt, job.visibilityTimeoutMs, now, job.heartbeatAt)) {
          const updated: JobRow = {
            ...job,
            status: "queued",
            claimedBy: null,
            claimedAt: null,
            heartbeatAt: null,
            updatedAt: now,
            version: job.version + 1,
          };
          jobsMap.set(job.id, updated);
          reclaimedCount++;
        }
      }

      return reclaimedCount;
    },

    async recordJobRun(input: RecordJobRunInput): Promise<JobRunRow> {
      const id = crypto.randomUUID();
      const run: JobRunRow = {
        id,
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
      };

      runsMap.set(id, run);
      return run;
    },

    async listRunsForJob(jobId: string): Promise<readonly JobRunRow[]> {
      const list = Array.from(runsMap.values()).filter((r) => r.jobId === jobId);
      list.sort((a, b) => a.attemptNumber - b.attemptNumber);
      return list;
    },

    async listRecentRuns(limit: number = 50): Promise<readonly JobRunRow[]> {
      const list = Array.from(runsMap.values());
      list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return list.slice(0, limit);
    },

    async findDeadLetterByJobId(jobId: string): Promise<DeadLetterJobRow | null> {
      for (const dl of deadLettersMap.values()) {
        if (dl.jobId === jobId) return dl;
      }
      return null;
    },

    async findDeadLetterById(id: string): Promise<DeadLetterJobRow | null> {
      return deadLettersMap.get(id) ?? null;
    },

    async listDeadLetters(filters?: {
      readonly institutionId?: string;
      readonly unresolvedOnly?: boolean;
      readonly limit?: number;
      readonly offset?: number;
    }): Promise<readonly DeadLetterJobRow[]> {
      let list = Array.from(deadLettersMap.values());

      if (filters?.institutionId) {
        list = list.filter((dl) => dl.institutionId === filters.institutionId);
      }
      if (filters?.unresolvedOnly) {
        list = list.filter((dl) => dl.resolvedAt === null);
      }

      list.sort((a, b) => a.deadLetteredAt.getTime() - b.deadLetteredAt.getTime());

      const offset = filters?.offset ?? 0;
      const limit = filters?.limit ?? 50;
      return list.slice(offset, offset + limit);
    },

    async acknowledgeDeadLetter(
      incidentId: string,
      userId: string,
      note?: string,
      now: Date = new Date(),
    ): Promise<DeadLetterJobRow> {
      const incident = deadLettersMap.get(incidentId);
      if (!incident) {
        throw new NotFoundError(`Dead letter incident ${incidentId} not found.`);
      }

      const updated: DeadLetterJobRow = {
        ...incident,
        acknowledgedByUserId: userId,
        acknowledgedAt: now,
        acknowledgementNote: note ?? null,
      };
      deadLettersMap.set(incidentId, updated);
      return updated;
    },

    async resolveDeadLetter(
      incidentId: string,
      userId: string,
      resolution: "replayed" | "fixed" | "abandoned",
      note: string,
      replayedAsJobId?: string,
      now: Date = new Date(),
    ): Promise<DeadLetterJobRow> {
      const incident = deadLettersMap.get(incidentId);
      if (!incident) {
        throw new NotFoundError(`Dead letter incident ${incidentId} not found.`);
      }

      const updated: DeadLetterJobRow = {
        ...incident,
        resolution,
        resolutionNote: note,
        resolvedByUserId: userId,
        resolvedAt: now,
        replayedAsJobId: replayedAsJobId ?? null,
      };
      deadLettersMap.set(incidentId, updated);
      return updated;
    },

    async findJobDefinition(jobType: string): Promise<JobDefinitionRow | null> {
      return definitionsMap.get(jobType) ?? null;
    },

    async upsertJobDefinition(definition: UpsertJobDefinitionData): Promise<JobDefinitionRow> {
      const existing = definitionsMap.get(definition.jobType);
      const row: JobDefinitionRow = {
        id: existing?.id ?? crypto.randomUUID(),
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
      };

      definitionsMap.set(definition.jobType, row);
      return row;
    },

    async listJobDefinitions(): Promise<readonly JobDefinitionRow[]> {
      return Array.from(definitionsMap.values());
    },

    async createSchedule(input: RegisterScheduleInput): Promise<JobScheduleRow> {
      for (const existing of schedulesMap.values()) {
        if (
          existing.institutionId === (input.institutionId ?? null) &&
          existing.name.toLowerCase() === input.name.toLowerCase()
        ) {
          throw new ConflictError("A schedule with this name already exists for this institution.", {
            userMessage: "A recurring schedule with this name already exists.",
          });
        }
      }

      const id = crypto.randomUUID();
      const now = new Date();
      const schedule: JobScheduleRow = {
        id,
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
        lastEnqueuedAt: null,
        nextRunAt: new Date(0),
        lastRunAt: null,
        lastJobId: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      schedulesMap.set(id, schedule);
      return schedule;
    },

    async findScheduleById(id: string): Promise<JobScheduleRow | null> {
      return schedulesMap.get(id) ?? null;
    },

    async listDueSchedules(now: Date = new Date()): Promise<readonly JobScheduleRow[]> {
      const due: JobScheduleRow[] = [];
      for (const schedule of schedulesMap.values()) {
        if (!schedule.isActive) continue;
        if (schedule.nextRunAt && schedule.nextRunAt.getTime() <= now.getTime()) {
          due.push(schedule);
        }
      }
      due.sort((a, b) => {
        const timeA = a.nextRunAt ? a.nextRunAt.getTime() : 0;
        const timeB = b.nextRunAt ? b.nextRunAt.getTime() : 0;
        return timeA - timeB;
      });
      return due;
    },

    async advanceSchedule(
      id: string,
      lastJobId: string,
      nextRunAt: Date | null,
      now: Date = new Date(),
    ): Promise<JobScheduleRow> {
      const schedule = schedulesMap.get(id);
      if (!schedule) {
        throw new NotFoundError(`Schedule ${id} not found.`);
      }

      const updated: JobScheduleRow = {
        ...schedule,
        lastJobId,
        lastEnqueuedAt: now,
        lastRunAt: now,
        nextRunAt,
        updatedAt: now,
        version: schedule.version + 1,
      };

      schedulesMap.set(id, updated);
      return updated;
    },
  };
}
