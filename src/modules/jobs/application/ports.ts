/**
 * Application ports for Background Jobs & Worker module (`PRD.md` MODULE 34, `RULES.md` §48–§49, `ADR-0002`).
 *
 * Defines the read/write models, the JobStore persistence port, and the JobWorker execution port.
 */
import type {
  CatchUpPolicy,
  DeadLetterResolution,
  ErrorType,
  FailureOutcome,
  JobStatus,
} from "../domain/job-rules";
import type {
  JobQueryFilters,
  RecordJobRunInput,
  RegisterScheduleInput,
} from "./schemas";

/* -------------------------------------------------------------------------- */
/* Read Models                                                                */
/* -------------------------------------------------------------------------- */

export interface JobDefinitionRow {
  readonly id: string;
  readonly jobType: string;
  readonly handlerName: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly defaultMaxAttempts: number;
  readonly defaultVisibilityTimeoutMs: number;
  readonly retryBackoffMs: number;
  readonly retryBackoffIsExponential: boolean;
  readonly allowsConcurrency: boolean;
  readonly maxConcurrentRuns: number | null;
  readonly requiresInstitutionScope: boolean;
  readonly isActive: boolean;
  readonly estimatedDurationMs: number | null;
}

export interface JobRow {
  readonly id: string;
  readonly institutionId: string | null;
  readonly jobType: string;
  readonly idempotencyKey: string;
  readonly status: JobStatus;
  readonly payload: Record<string, unknown>;
  readonly payloadSchemaVersion: number;
  readonly deduplicateScope: string | null;
  readonly isRecurring: boolean;
  readonly scheduleId: string | null;
  readonly maxAttempts: number | null;
  readonly claimedBy: string | null;
  readonly claimedAt: Date | null;
  readonly heartbeatAt: Date | null;
  readonly visibilityTimeoutMs: number;
  readonly attemptCount: number;
  readonly nextAttemptAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly deadLetteredAt: Date | null;
  readonly deadLetterReason: string | null;
  readonly lastError: string | null;
  readonly result: Record<string, unknown> | null;
  readonly progressNote: string | null;
  readonly durationMs: number | null;
  readonly requestedByUserId: string | null;
  readonly correlationId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface JobRunRow {
  readonly id: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly workerId: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly durationMs: number | null;
  readonly succeeded: boolean;
  readonly errorType: ErrorType | null;
  readonly errorMessage: string | null;
  readonly errorStack: string | null;
  readonly logContext: Record<string, unknown> | null;
  readonly result: Record<string, unknown> | null;
  readonly logLines:
    | Array<{ level: string; message: string; at: string; data?: Record<string, unknown> | undefined }>
    | null;
  readonly correlationId: string | null;
}

export interface JobScheduleRow {
  readonly id: string;
  readonly institutionId: string | null;
  readonly jobType: string;
  readonly name: string;
  readonly cronExpression: string | null;
  readonly intervalSeconds: number | null;
  readonly timezone: string;
  readonly isActive: boolean;
  readonly payloadTemplate: Record<string, unknown>;
  readonly maxAttempts: number | null;
  readonly catchUpPolicy: CatchUpPolicy;
  readonly lastEnqueuedAt: Date | null;
  readonly nextRunAt: Date | null;
  readonly lastRunAt: Date | null;
  readonly lastJobId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface DeadLetterJobRow {
  readonly id: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly institutionId: string | null;
  readonly attemptCount: number;
  readonly errorMessage: string | null;
  readonly errorType: string | null;
  readonly deadLetteredAt: Date;
  readonly acknowledgedByUserId: string | null;
  readonly acknowledgedAt: Date | null;
  readonly acknowledgementNote: string | null;
  readonly resolution: DeadLetterResolution | null;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly replayedAsJobId: string | null;
  readonly resolutionNote: string | null;
}

/* -------------------------------------------------------------------------- */
/* Creation & Update DTOs                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateJobData {
  readonly institutionId?: string | null | undefined;
  readonly jobType: string;
  readonly idempotencyKey: string;
  readonly payload: Record<string, unknown>;
  readonly payloadSchemaVersion?: number | undefined;
  readonly deduplicateScope?: string | null | undefined;
  readonly isRecurring?: boolean | undefined;
  readonly scheduleId?: string | null | undefined;
  readonly maxAttempts?: number | null | undefined;
  readonly visibilityTimeoutMs?: number | undefined;
  readonly correlationId?: string | null | undefined;
  readonly requestedByUserId?: string | null | undefined;
  readonly nextAttemptAt?: Date | null | undefined;
}

export interface UpsertJobDefinitionData {
  readonly jobType: string;
  readonly handlerName: string;
  readonly displayName: string;
  readonly description?: string | null | undefined;
  readonly defaultMaxAttempts?: number | undefined;
  readonly defaultVisibilityTimeoutMs?: number | undefined;
  readonly retryBackoffMs?: number | undefined;
  readonly retryBackoffIsExponential?: boolean | undefined;
  readonly allowsConcurrency?: boolean | undefined;
  readonly maxConcurrentRuns?: number | null | undefined;
  readonly requiresInstitutionScope?: boolean | undefined;
  readonly isActive?: boolean | undefined;
  readonly estimatedDurationMs?: number | null | undefined;
}

/* -------------------------------------------------------------------------- */
/* Store Port                                                                 */
/* -------------------------------------------------------------------------- */

export interface JobStore {
  // Job operations
  findJobById(id: string): Promise<JobRow | null>;
  findJobByIdempotencyKey(key: string): Promise<JobRow | null>;
  listJobs(filters?: JobQueryFilters): Promise<readonly JobRow[]>;
  createJob(input: CreateJobData): Promise<JobRow>;

  // Worker lock / lease / execution
  claimJobs(params: {
    readonly workerId: string;
    readonly limit: number;
    readonly now?: Date;
  }): Promise<readonly JobRow[]>;

  heartbeatJob(jobId: string, workerId: string, now?: Date): Promise<boolean>;

  completeJob(params: {
    readonly jobId: string;
    readonly workerId: string;
    readonly result?: Record<string, unknown> | undefined;
    readonly durationMs: number;
    readonly now?: Date | undefined;
  }): Promise<JobRow>;

  failJob(params: {
    readonly jobId: string;
    readonly workerId: string;
    readonly errorType: ErrorType;
    readonly errorMessage: string;
    readonly errorStack?: string | undefined;
    readonly outcome: FailureOutcome;
    readonly durationMs: number;
    readonly now?: Date | undefined;
  }): Promise<{ readonly job: JobRow; readonly deadLetter?: DeadLetterJobRow }>;

  reclaimStaleClaims(now?: Date): Promise<number>;

  // Run history & audit logs
  recordJobRun(input: RecordJobRunInput): Promise<JobRunRow>;
  listRunsForJob(jobId: string): Promise<readonly JobRunRow[]>;
  listRecentRuns(limit?: number): Promise<readonly JobRunRow[]>;

  // Dead letters & incident management
  findDeadLetterByJobId(jobId: string): Promise<DeadLetterJobRow | null>;
  findDeadLetterById(id: string): Promise<DeadLetterJobRow | null>;
  listDeadLetters(filters?: {
    readonly institutionId?: string;
    readonly unresolvedOnly?: boolean;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<readonly DeadLetterJobRow[]>;

  acknowledgeDeadLetter(
    incidentId: string,
    userId: string,
    note?: string,
    now?: Date,
  ): Promise<DeadLetterJobRow>;

  resolveDeadLetter(
    incidentId: string,
    userId: string,
    resolution: DeadLetterResolution,
    note: string,
    replayedAsJobId?: string,
    now?: Date,
  ): Promise<DeadLetterJobRow>;

  // Job definition catalogue
  findJobDefinition(jobType: string): Promise<JobDefinitionRow | null>;
  upsertJobDefinition(definition: UpsertJobDefinitionData): Promise<JobDefinitionRow>;
  listJobDefinitions(): Promise<readonly JobDefinitionRow[]>;

  // Recurring schedules
  createSchedule(input: RegisterScheduleInput): Promise<JobScheduleRow>;
  findScheduleById(id: string): Promise<JobScheduleRow | null>;
  listDueSchedules(now?: Date): Promise<readonly JobScheduleRow[]>;
  advanceSchedule(
    id: string,
    lastJobId: string,
    nextRunAt: Date | null,
    now?: Date,
  ): Promise<JobScheduleRow>;
}

/* -------------------------------------------------------------------------- */
/* Worker Execution Port                                                      */
/* -------------------------------------------------------------------------- */

export interface JobExecutionContext<T = Record<string, unknown>> {
  readonly jobId: string;
  readonly jobType: string;
  readonly payload: T;
  readonly attemptNumber: number;
  readonly institutionId: string | null;
  readonly correlationId: string | null;
  readonly heartbeat: () => Promise<void>;
  readonly log: (level: string, message: string, data?: Record<string, unknown>) => void;
}

export type JobHandler<T = Record<string, unknown>> = (
  context: JobExecutionContext<T>,
) => Promise<Record<string, unknown> | void>;

export interface JobProcessResult {
  readonly jobId: string;
  readonly jobType: string;
  readonly attemptNumber: number;
  readonly succeeded: boolean;
  readonly status: JobStatus;
  readonly durationMs: number;
  readonly result?: Record<string, unknown> | undefined;
  readonly error?: {
    readonly type: ErrorType;
    readonly message: string;
    readonly stack?: string | undefined;
  } | undefined;
}

export interface JobWorker {
  readonly workerId: string;
  registerHandler<T = Record<string, unknown>>(jobType: string, handler: JobHandler<T>): void;
  hasHandler(jobType: string): boolean;
  processNextJobs(limit?: number): Promise<readonly JobProcessResult[]>;
  processJob(job: JobRow): Promise<JobProcessResult>;
  reclaimAbandonedJobs(): Promise<number>;
}
