/**
 * Application service for Background Jobs & Worker module (`PRD.md` MODULE 34, `RULES.md` §48–§49).
 *
 * Orchestrates:
 * 1. Boundary validation via Zod schemas
 * 2. Job dispatching & idempotency key generation
 * 3. Dead-letter triage & manual replay workflows
 * 4. Schedule registration
 */
import { NotFoundError } from "@/shared/errors";
import { parseOrThrow } from "@/shared/validation";
import { generateJobIdempotencyKey } from "../domain/job-rules";
import type {
  DeadLetterJobRow,
  JobRow,
  JobRunRow,
  JobScheduleRow,
  JobStore,
} from "./ports";
import {
  acknowledgeDeadLetterSchema,
  jobQueryFiltersSchema,
  recordJobRunSchema,
  registerScheduleSchema,
  replayDeadLetterSchema,
  resolveDeadLetterSchema,
  triggerJobSchema,
  type JobQueryFilters,
} from "./schemas";

export interface ReplayDeadLetterResult {
  readonly incident: DeadLetterJobRow;
  readonly replacementJob: JobRow;
}

export interface JobService {
  enqueueJob(rawInput: unknown): Promise<JobRow>;
  getJob(id: string): Promise<JobRow>;
  listJobs(rawFilters?: JobQueryFilters): Promise<readonly JobRow[]>;
  listJobRuns(jobId: string): Promise<readonly JobRunRow[]>;
  recordRun(rawInput: unknown): Promise<JobRunRow>;

  getDeadLetter(incidentId: string): Promise<DeadLetterJobRow>;
  listDeadLetters(filters?: {
    readonly institutionId?: string;
    readonly unresolvedOnly?: boolean;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<readonly DeadLetterJobRow[]>;
  acknowledgeDeadLetter(
    rawInput: unknown,
    userId: string,
  ): Promise<DeadLetterJobRow>;
  resolveDeadLetter(
    rawInput: unknown,
    userId: string,
  ): Promise<DeadLetterJobRow>;
  replayDeadLetter(
    rawInput: unknown,
    userId: string,
  ): Promise<ReplayDeadLetterResult>;

  registerSchedule(rawInput: unknown): Promise<JobScheduleRow>;
  getSchedule(id: string): Promise<JobScheduleRow>;
}

export function createJobService(store: JobStore): JobService {
  return {
    async enqueueJob(rawInput: unknown): Promise<JobRow> {
      const input = parseOrThrow(triggerJobSchema, rawInput);
      const idempotencyKey =
        input.idempotencyKey ??
        generateJobIdempotencyKey(input.jobType, crypto.randomUUID());

      return store.createJob({
        institutionId: input.institutionId,
        jobType: input.jobType,
        idempotencyKey,
        payload: input.payload,
        payloadSchemaVersion: input.payloadSchemaVersion,
        deduplicateScope: input.deduplicateScope,
        isRecurring: input.isRecurring,
        scheduleId: input.scheduleId,
        maxAttempts: input.maxAttempts,
        visibilityTimeoutMs: input.visibilityTimeoutMs,
        correlationId: input.correlationId,
        requestedByUserId: input.requestedByUserId,
      });
    },

    async getJob(id: string): Promise<JobRow> {
      const job = await store.findJobById(id);
      if (!job) {
        throw new NotFoundError(`Job with ID ${id} not found.`);
      }
      return job;
    },

    async listJobs(rawFilters?: JobQueryFilters): Promise<readonly JobRow[]> {
      const filters = rawFilters
        ? parseOrThrow(jobQueryFiltersSchema, rawFilters)
        : undefined;
      return store.listJobs(filters);
    },

    async listJobRuns(jobId: string): Promise<readonly JobRunRow[]> {
      return store.listRunsForJob(jobId);
    },

    async recordRun(rawInput: unknown): Promise<JobRunRow> {
      const input = parseOrThrow(recordJobRunSchema, rawInput);
      return store.recordJobRun(input);
    },

    async getDeadLetter(incidentId: string): Promise<DeadLetterJobRow> {
      const incident = await store.findDeadLetterById(incidentId);
      if (!incident) {
        throw new NotFoundError(`Dead letter incident ${incidentId} not found.`);
      }
      return incident;
    },

    async listDeadLetters(filters?: {
      readonly institutionId?: string;
      readonly unresolvedOnly?: boolean;
      readonly limit?: number;
      readonly offset?: number;
    }): Promise<readonly DeadLetterJobRow[]> {
      return store.listDeadLetters(filters);
    },

    async acknowledgeDeadLetter(
      rawInput: unknown,
      userId: string,
    ): Promise<DeadLetterJobRow> {
      const input = parseOrThrow(acknowledgeDeadLetterSchema, rawInput);
      return store.acknowledgeDeadLetter(input.incidentId, userId, input.note);
    },

    async resolveDeadLetter(
      rawInput: unknown,
      userId: string,
    ): Promise<DeadLetterJobRow> {
      const input = parseOrThrow(resolveDeadLetterSchema, rawInput);
      return store.resolveDeadLetter(
        input.incidentId,
        userId,
        input.resolution,
        input.resolutionNote,
        input.replayedAsJobId,
      );
    },

    async replayDeadLetter(
      rawInput: unknown,
      userId: string,
    ): Promise<ReplayDeadLetterResult> {
      const input = parseOrThrow(replayDeadLetterSchema, rawInput);
      const incident = await store.findDeadLetterById(input.incidentId);
      if (!incident) {
        throw new NotFoundError(`Dead letter incident ${input.incidentId} not found.`);
      }

      const originalJob = await store.findJobById(incident.jobId);
      if (!originalJob) {
        throw new NotFoundError(`Original job ${incident.jobId} not found.`);
      }

      const replacementKey = generateJobIdempotencyKey(
        originalJob.jobType,
        `replay:${incident.id}:${Date.now()}`,
      );

      const replacementJob = await store.createJob({
        institutionId: originalJob.institutionId,
        jobType: originalJob.jobType,
        idempotencyKey: replacementKey,
        payload: originalJob.payload,
        payloadSchemaVersion: originalJob.payloadSchemaVersion,
        deduplicateScope: replacementKey,
        maxAttempts: originalJob.maxAttempts,
        visibilityTimeoutMs: originalJob.visibilityTimeoutMs,
        requestedByUserId: userId,
      });

      const resolvedIncident = await store.resolveDeadLetter(
        incident.id,
        userId,
        "replayed",
        input.reason,
        replacementJob.id,
      );

      return {
        incident: resolvedIncident,
        replacementJob,
      };
    },

    async registerSchedule(rawInput: unknown): Promise<JobScheduleRow> {
      const input = parseOrThrow(registerScheduleSchema, rawInput);
      return store.createSchedule(input);
    },

    async getSchedule(id: string): Promise<JobScheduleRow> {
      const schedule = await store.findScheduleById(id);
      if (!schedule) {
        throw new NotFoundError(`Schedule with ID ${id} not found.`);
      }
      return schedule;
    },
  };
}
