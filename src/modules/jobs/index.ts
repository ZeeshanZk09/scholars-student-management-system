/**
 * Background Jobs & Worker Infrastructure module public API (`PRD.md` MODULE 34, `RULES.md` §48–§49, `ARCHITECTURE.md` §33–§34).
 *
 * Provides:
 * 1. Domain rules & invariants (pure, zero I/O)
 * 2. Zod boundary schemas for job triggers, runs, schedules, and dead-letter handling
 * 3. Application ports & interfaces (JobStore, JobWorker, JobScheduler, JobService)
 * 4. Worker execution engine with retry backoff, lease management, and dead-letter routing
 * 5. Self-hosted recurrence scheduler supporting intervals and standard cron expressions
 * 6. Drizzle ORM store backed by PostgreSQL FOR UPDATE SKIP LOCKED
 * 7. In-memory fake store for zero-database test suites
 */

// Domain Layer
export {
  CATCH_UP_POLICIES,
  DEAD_LETTER_RESOLUTION_LABELS,
  DEAD_LETTER_RESOLUTIONS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_VISIBILITY_TIMEOUT_MS,
  ERROR_TYPE_LABELS,
  ERROR_TYPES,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  MAX_RETRY_BACKOFF_MS,
  MIN_VISIBILITY_TIMEOUT_MS,
  assertValidJobStatusTransition,
  calculateLeaseExpiry,
  calculateNextAttemptAt,
  calculateNextScheduleRunAt,
  calculateRetryDelayMs,
  classifyJobError,
  determineFailureOutcome,
  generateJobIdempotencyKey,
  isJobClaimExpired,
  isTerminalErrorType,
  isValidJobStatusTransition,
  parseCronField,
} from "./domain/job-rules";

export type {
  CatchUpPolicy,
  ClassifiedJobError,
  DeadLetterResolution,
  ErrorType,
  FailureOutcome,
  JobStatus,
  NextScheduleRunOptions,
} from "./domain/job-rules";

// Application Layer: Schemas
export {
  acknowledgeDeadLetterSchema,
  jobQueryFiltersSchema,
  recordJobRunSchema,
  registerScheduleSchema,
  replayDeadLetterSchema,
  resolveDeadLetterSchema,
  triggerJobSchema,
} from "./application/schemas";

export type {
  AcknowledgeDeadLetterInput,
  JobQueryFilters,
  RecordJobRunInput,
  RegisterScheduleInput,
  ReplayDeadLetterInput,
  ResolveDeadLetterInput,
  TriggerJobInput,
} from "./application/schemas";

// Application Layer: Ports
export type {
  CreateJobData,
  DeadLetterJobRow,
  JobDefinitionRow,
  JobExecutionContext,
  JobHandler,
  JobProcessResult,
  JobRow,
  JobRunRow,
  JobScheduleRow,
  JobStore,
  JobWorker,
  UpsertJobDefinitionData,
} from "./application/ports";

// Application Layer: Worker & Scheduler
export { createJobWorker } from "./application/job-worker";
export { createJobScheduler } from "./application/job-scheduler";
export type {
  JobScheduler,
  ScheduleDispatchItem,
  ScheduleDispatchSummary,
} from "./application/job-scheduler";

// Application Layer: Service
export { createJobService } from "./application/job-service";
export type { JobService, ReplayDeadLetterResult } from "./application/job-service";

// Application Layer: Testing Fakes
export { createFakeJobStore } from "./application/testing/fakes";

// Infrastructure Layer: Drizzle Store
export {
  constraintOf,
  createDrizzleJobStore,
  isUniqueViolation,
  uniqueConflictError,
} from "./infrastructure/drizzle-job-store";
