/**
 * Background jobs, schedules and their run history.
 *
 * `PRD.md` MODULE 34, `ARCHITECTURE.md` §33–§34, `RULES.md` §48–§49.
 *
 * ## The queue is not modelled, and that is deliberate
 *
 * `ARCHITECTURE.md` §33 names BullMQ + Redis as a *potential* stack and then says "Redis is only required if
 * the selected worker implementation uses it" and "Do not introduce worker infrastructure merely for
 * architectural fashion." No queue library is installed, and `RULES.md` §49 forbids making one mandatory.
 *
 * So these tables are a **durable job ledger in PostgreSQL**, not a queue implementation. A worker polls
 * `jobs` with `FOR UPDATE SKIP LOCKED`, claims a row, and runs it. If BullMQ is adopted later, it becomes the
 * dispatch mechanism and these tables remain the record of what ran — which is the part that has to be right
 * either way, because `RULES.md` §48 requires retry, failure handling, logging, status tracking, idempotency
 * and duplicate prevention, and none of those are properties a queue gives you for free.
 *
 * ## `idempotencyKey` is unique, and it is how §48's "duplicate prevention" is satisfied
 *
 * `ARCHITECTURE.md` §34 names monthly reports, diary notifications, emails and biometric imports as the
 * jobs that must be safe to retry. The key is derived from `(jobType, the business row it acts on)`:
 *
 * - `monthly_report` + `monthly_test_reports.id`
 * - `diary_notification` + `diary_notifications.id`
 * - `email_send` + `email_messages.id`
 * - `biometric_import` + the device's batch id
 *
 * A worker that retries inserts nothing new — the insert *is* the conflict. That is why this is a unique
 * index and not a "have I run this before?" lookup: `RULES.md` §47 rejects check-before-act for exactly this
 * reason, because the check and the act are not in one transaction.
 *
 * ## `claimedBy` + `claimedAt` implement the lease
 *
 * Two workers polling the same row is not a theoretical problem. A claim records which worker took the row
 * and when; a claim older than `visibility_timeout` is reclaimable, which is how a job survives a worker
 * crash mid-run without either being lost or run twice forever. `heartbeatAt` distinguishes "still working"
 * from "died holding it".
 *
 * ## `jobs` holds the definition; `job_runs` holds every attempt
 *
 * A job is retried up to `maxAttempts`. Each attempt is a `job_runs` row, so "why did this email go out four
 * times before it worked?" is answerable, which `RULES.md` §48's logging requirement needs. Collapsing runs
 * into a counter on `jobs` would answer "how many times" and not "what happened".
 *
 * `jobStatusEnum` includes `dead_letter` for the state `PRD.md` MODULE 34 explicitly requires: retries
 * exhausted, stopped, and visible to a human instead of retried silently forever.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, description, primaryId, updatedAt, version } from "./_conventions";
import { jobStatusEnum } from "./_enums";
import { institutions } from "./institution";

/**
 * `job_definitions` — the catalogue of what can be queued.
 *
 * ## A catalogue row per job type, not per enqueue
 *
 * `PRD.md` MODULE 34 lists the workflows; a deploy can then show which job types exist, which are currently
 * failing, and what payload each expects — without reading application code. `handlerName` names the
 * registered handler and is validated against the worker registry at startup, so a typo in the catalogue
 * fails loudly instead of leaving a job type that no worker will ever pick up.
 *
 * `defaultMaxAttempts` and `defaultVisibilityTimeoutMs` live here rather than on every `jobs` row because
 * they are properties of the job type. A row may still override them, for the one report that genuinely
 * takes longer than its siblings.
 */
export const jobDefinitions = pgTable(
  "job_definitions",
  {
    id: primaryId(),
    /**
     * The job type. Stable and unique — it appears in `jobs.jobType`, in logs, and in the catalogue UI.
     * e.g. `monthly_test_report`, `diary_notification`, `email_send`, `biometric_import`,
     * `notification_dispatch`, `report_generation`.
     */
    jobType: varchar("job_type", { length: 64 }).notNull(),
    /** The registered handler. Resolved against the worker registry at startup. */
    handlerName: varchar("handler_name", { length: 128 }).notNull(),
    /** Shown in the operations UI. A bare job type name is not an explanation. */
    displayName: varchar("display_name", { length: 120 }).notNull(),
    description: description("description"),
    /** MODULE 34 requires a retry strategy; this is its default. */
    defaultMaxAttempts: integer("default_max_attempts").notNull().default(3),
    /**
     * How long a claim is honoured before the job is considered abandoned. MODULE 34's failure handling:
     * a worker that dies mid-job must not hold the row forever.
     */
    defaultVisibilityTimeoutMs: integer("default_visibility_timeout_ms").notNull().default(300_000),
    /** The backoff between attempts. Stored in ms so the worker needs no per-type code. */
    retryBackoffMs: integer("retry_backoff_ms").notNull().default(30_000),
    /** Whether the backoff grows per attempt. Linear is the safe default. */
    retryBackoffIsExponential: boolean("retry_backoff_is_exponential").notNull().default(false),
    /** The job is safe to run concurrently with itself. False for anything writing money or marks. */
    allowsConcurrency: boolean("allows_concurrency").notNull().default(false),
    /**
     * Concurrency limit across the whole system. Null means unlimited. A monthly-report job that opens a
     * connection per run needs a ceiling; `allowsConcurrency = false` alone only serialises one job.
     */
    maxConcurrentRuns: integer("max_concurrent_runs"),
    /** Payloads must carry `institution_id` so a worker can scope its queries. */
    requiresInstitutionScope: boolean("requires_institution_scope").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    /** Estimated cost, for capacity planning. Not enforced. */
    estimatedDurationMs: integer("estimated_duration_ms"),
  },
  (t) => [
    // `unique`, not `uniqueIndex`: `jobs.job_type` and `job_schedules.job_type` are foreign keys
    // into this column, and drizzle-kit emits `CREATE UNIQUE INDEX` *after* every
    // `ALTER TABLE ... ADD FOREIGN KEY` — an index-only target fails at apply time with
    // "there is no unique constraint matching given keys". An inline UNIQUE constraint is
    // part of the CREATE TABLE, so it always exists before the referencing FKs run.
    unique("job_definitions_type_unique").on(t.jobType),
    index("job_definitions_active_idx").on(t.isActive, t.jobType),
    check("job_definitions_max_attempts_check", sql`${t.defaultMaxAttempts} > 0`),
    check("job_definitions_visibility_timeout_check", sql`${t.defaultVisibilityTimeoutMs} >= 1000`),
    check("job_definitions_backoff_check", sql`${t.retryBackoffMs} >= 0`),
    check(
      "job_definitions_concurrency_check",
      sql`${t.maxConcurrentRuns} is null or ${t.maxConcurrentRuns} > 0`,
    ),
    // A non-concurrent job with a concurrency ceiling of one is the same job stated twice; more
    // importantly, a non-concurrent job must not also advertise parallel capacity.
    check(
      "job_definitions_concurrency_consistency_check",
      sql`${t.allowsConcurrency} or ${t.maxConcurrentRuns} is null or ${t.maxConcurrentRuns} = 1`,
    ),
    check(
      "job_definitions_estimated_duration_check",
      sql`${t.estimatedDurationMs} is null or ${t.estimatedDurationMs} > 0`,
    ),
  ],
);

/**
 * `jobs` — one queued unit of work.
 *
 * ## Why this is a table and not a BullMQ job
 *
 * See the note at the top of this file. The properties `RULES.md` §48 demands — status tracking, idempotency,
 * duplicate prevention, failure handling — are all *persistence* requirements. A queue holds a payload while
 * it is in flight and forgets it; a ledger keeps the evidence after the fact, which is what makes the
 * dead-letter queue and the run history possible at all.
 *
 * ## `payload` is jsonb because it is the worker's input, not a queryable domain fact
 *
 * Everything else in this schema refuses untyped columns, and this is the one place the trade is made the
 * other way: a job payload is an argument list for a handler, it changes whenever the handler's signature
 * changes, and giving it columns would mean re-migrating for every handler change. `payloadSchemaVersion`
 * exists for exactly that change — a handler that cannot read the version it is given fails loudly instead
 * of misreading a field.
 *
 * ## The one-time jobs get `deduplicateScope`, the recurring ones do not
 *
 * A recurring job ("every day at 07:00") is legitimately re-created every day and must not be deduplicated
 * against yesterday's row. A one-time job must be deduplicated, or a double-clicked "Generate report" button
 * produces two reports. `deduplicateScope` is null for recurring and equals `idempotencyKey` for one-time
 * jobs, and the check below enforces that pairing — so "forgot to set the scope" fails at insert rather than
 * producing a duplicate at 3am.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: primaryId(),
    /** Null for a platform-level job; set for anything tenant-scoped. */
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "cascade",
    }),
    jobType: varchar("job_type", { length: 64 })
      .notNull()
      .references(() => jobDefinitions.jobType, { onDelete: "restrict" }),
    /**
     * `RULES.md` §48 / `ARCHITECTURE.md` §34: derived from `(jobType, the business row)`. Unique. See the
     * note at the top of this file.
     */
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    /** The handler's arguments. See the note above. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Bumped when a handler's payload shape changes. See the note above. */
    payloadSchemaVersion: integer("payload_schema_version").notNull().default(1),
    /**
     * Set for a one-time job; null for a recurring one. See the note at the top of this table. The check
     * below ties it to `isRecurring`.
     */
    deduplicateScope: varchar("deduplicate_scope", { length: 200 }),
    isRecurring: boolean("is_recurring").notNull().default(false),
    /** The recurring schedule this job belongs to, when it has one. Self-reference. */
    scheduleId: uuid("schedule_id"),
    /** Overrides the definition's default. See the note at the top of `job_definitions`. */
    maxAttempts: integer("max_attempts"),
    /**
     * The lease. A worker writes its identity and the current time when it claims the row, and a claim
     * older than the timeout is reclaimable.
     */
    claimedBy: varchar("claimed_by", { length: 128 }),
    claimedAt: timestamp("claimed_at", { withTimezone: true, precision: 3 }),
    /** Refreshed during a long run, so "alive" is distinguishable from "crashed". */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true, precision: 3 }),
    /**
     * The lease length for this job. On the row rather than looked up from the definition because a worker
     * claiming it has to know the timeout in the same query that claims it.
     */
    visibilityTimeoutMs: integer("visibility_timeout_ms").notNull().default(300_000),
    /**
     * A manually or automatically retried job carries the attempt it resumes from. A first attempt is 1.
     */
    attemptCount: integer("attempt_count").notNull().default(0),
    /** When the next attempt may start. Backoff lives here so the worker does no arithmetic. */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, precision: 3 }),
    startedAt: timestamp("started_at", { withTimezone: true, precision: 3 }),
    completedAt: timestamp("completed_at", { withTimezone: true, precision: 3 }),
    /**
     * `PRD.md` MODULE 34's dead-letter handling. A job whose retries are exhausted stops here rather than
     * being retried forever, and this is why and when it got there.
     */
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true, precision: 3 }),
    deadLetterReason: text("dead_letter_reason"),
    /** The last error, for triage. The full history is in `job_runs`. */
    lastError: text("last_error"),
    /** The result, for a job whose output is worth keeping. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    /** Free-text trace of which step it reached, for a long multi-step job. */
    progressNote: varchar("progress_note", { length: 300 }),
    /** Succeeded before this many ms. Null until it has finished. Feeds the capacity estimate. */
    durationMs: integer("duration_ms"),
    /**
     * MODULE 34: "long-running operations should not unnecessarily block user-facing requests". A caller
     * that enqueues a job for a 400-student report is not waiting, and this id lets them poll or be told
     * when it is done.
     */
    requestedByUserId: uuid("requested_by_user_id"),
    correlationId: varchar("correlation_id", { length: 96 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    // `RULES.md` §48 duplicate prevention, in one index. See the note at the top of this file.
    uniqueIndex("jobs_idempotency_key_unique").on(t.idempotencyKey),
    // The worker's claim query: due, runnable, unclaimed. This is the hot path.
    index("jobs_claim_idx")
      .on(t.nextAttemptAt, t.createdAt)
      .where(sql`${t.status} = 'queued'`),
    // Lease recovery: a claimed job past its visibility timeout.
    index("jobs_stale_claim_idx")
      .on(t.claimedAt)
      .where(sql`${t.status} = 'running' and ${t.claimedBy} is not null`),
    // The dead-letter queue MODULE 34 requires. Also the operator's dashboard.
    index("jobs_dead_letter_idx")
      .on(t.deadLetteredAt)
      .where(sql`${t.status} = 'dead_letter'`),
    index("jobs_type_status_idx").on(t.jobType, t.status, t.createdAt),
    index("jobs_institution_idx").on(t.institutionId, t.status, t.createdAt),
    index("jobs_schedule_idx").on(t.scheduleId, t.createdAt),
    check("jobs_attempt_count_check", sql`${t.attemptCount} >= 0`),
    check("jobs_max_attempts_check", sql`${t.maxAttempts} is null or ${t.maxAttempts} > 0`),
    check("jobs_visibility_timeout_check", sql`${t.visibilityTimeoutMs} >= 1000`),
    check("jobs_schema_version_check", sql`${t.payloadSchemaVersion} > 0`),
    // Claiming is a pair. A worker identity with no timestamp cannot be aged out.
    check("jobs_claim_pair", sql`num_nonnulls(${t.claimedBy}, ${t.claimedAt}) in (0, 2)`),
    check("jobs_heartbeat_pair", sql`${t.heartbeatAt} is null or ${t.claimedAt} is not null`),
    // A running job has started, and started implies claimed.
    check("jobs_started_pair", sql`${t.startedAt} is null or ${t.claimedBy} is not null`),
    // Completion is a pair, and a finished job knows how long it took.
    check("jobs_completion_pair", sql`num_nonnulls(${t.completedAt}, ${t.durationMs}) in (0, 2)`),
    check(
      "jobs_completed_status_check",
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`,
    ),
    // MODULE 34's dead-letter state must explain itself.
    check(
      "jobs_dead_letter_pair",
      sql`${t.status} <> 'dead_letter' or (${t.deadLetteredAt} is not null and ${t.deadLetterReason} is not null)`,
    ),
    check(
      "jobs_exhausted_check",
      sql`${t.status} <> 'dead_letter' or ${t.maxAttempts} is null or ${t.attemptCount} >= ${t.maxAttempts}`,
    ),
    check(
      "jobs_deduplicate_scope_check",
      sql`(${t.isRecurring} and ${t.deduplicateScope} is null) or (not ${t.isRecurring} and ${t.deduplicateScope} is not null)`,
    ),
    // A recurring job belongs to a schedule; a one-time job does not.
    check("jobs_schedule_pair", sql`${t.isRecurring} = (${t.scheduleId} is not null)`),
  ],
);

/**
 * `job_runs` — one row per attempt.
 *
 * ## Append-only, because `RULES.md` §48 requires logging
 *
 * "Why did this email go out four times before it worked?" is answerable here and nowhere else. `jobs` holds
 * the counters for scheduling; this holds the evidence.
 *
 * `attemptNumber` starts at 1 and is unique per job, which makes "the second attempt" a lookup rather than
 * an ordering assumption. `succeeded` is a boolean rather than a status enum because an attempt has exactly
 * two outcomes plus "crashed", and `crashedAt` distinguishes "the handler was killed" from "the handler
 * returned an error" — a distinction that matters when deciding whether the work was actually interrupted
 * part-way through a transaction.
 */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: primaryId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    /** The worker that ran it. Matches `jobs.claimedBy` at claim time. */
    workerId: varchar("worker_id", { length: 128 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, precision: 3 }),
    durationMs: integer("duration_ms"),
    succeeded: boolean("succeeded").notNull().default(false),
    /**
     * Classified failure, so triage can distinguish "the database was unreachable" from "the report was
     * malformed". `validation`, `dependency_unavailable`, `conflict`, `permission_denied`, `timeout`,
     * `internal`, `unknown`.
     */
    errorType: varchar("error_type", { length: 32 }),
    /** The error. Redacted by `src/shared/logging/redact.ts` — a job payload can contain a PII-bearing row id. */
    errorMessage: text("error_message"),
    /** The stack, bounded. Useful for `internal`, noise for `timeout`. */
    errorStack: text("error_stack"),
    /** Structured log context for the attempt. */
    logContext: jsonb("log_context").$type<Record<string, unknown>>(),
    /** What the handler returned, for a run worth inspecting. */
    result: jsonb("result").$type<Record<string, unknown>>(),
    /** Structured JSON logs for the attempt, per `RULES.md` §52. */
    logLines:
      jsonb("log_lines").$type<
        Array<{ level: string; message: string; at: string; data?: Record<string, unknown> | undefined }>
      >(),
    correlationId: varchar("correlation_id", { length: 96 }),
  },
  (t) => [
    // "The second attempt" is a lookup, not an ordering assumption.
    uniqueIndex("job_runs_job_attempt_unique").on(t.jobId, t.attemptNumber),
    index("job_runs_job_idx").on(t.jobId, t.attemptNumber),
    // The failure dashboard MODULE 34's "failure handling" implies.
    index("job_runs_failure_idx")
      .on(t.errorType, t.startedAt)
      .where(sql`${t.succeeded} = false`),
    index("job_runs_worker_idx").on(t.workerId, t.startedAt),
    check("job_runs_attempt_number_check", sql`${t.attemptNumber} > 0`),
    check("job_runs_duration_pair", sql`num_nonnulls(${t.finishedAt}, ${t.durationMs}) in (0, 2)`),
    // A finished run knows how long it took.
    check("job_runs_duration_check", sql`${t.durationMs} is null or ${t.durationMs} >= 0`),
    // Success has no error, and failure has one. A "successful run with an error" is a broken log.
    check(
      "job_runs_error_pair",
      sql`(${t.succeeded} = true and ${t.errorType} is null and ${t.errorMessage} is null)
        or (${t.succeeded} = false and ${t.errorType} is not null)`,
    ),
    // A run that has not finished has not succeeded. Otherwise "completed" would be unfalsifiable.
    check("job_runs_finished_pair", sql`${t.succeeded} = false or ${t.finishedAt} is not null`),
  ],
);

/**
 * `job_schedules` — the recurring definitions behind MODULE 34.
 *
 * ## Cron in the database, with the provider undecided
 *
 * `PRD.md` MODULE 34 says application-controlled or self-hosted scheduling, and `RULES.md` §49 forbids a
 * mandatory paid cron service. So the schedule is a row here and the trigger is the worker — which is exactly
 * how a system that starts with one Node process and later adds three behaves identically.
 *
 * `cronExpression` is validated by the worker registry at startup rather than by a database check, because
 * the accepted grammar is a library decision and encoding it in a `CHECK` would mean re-migrating every
 * schedule whenever that library changes. The column is nullable because `interval_seconds` is the
 * alternative: "every 15 minutes" should not be written as a cron expression when `900` says the same thing.
 *
 * ## `lastEnqueuedAt` is what stops a restart from double-firing
 *
 * A worker that was down for an hour and restarts must not enqueue every missed occurrence. The schedule's
 * last enqueue is recorded, so a catch-up policy can be explicit — `catchUpPolicy` of `skip` (the default)
 * enqueues one run; `fire_all` would flood the queue after an outage. This is `RULES.md` §48 duplicate
 * prevention applied to the scheduler rather than the job.
 */
export const jobSchedules = pgTable(
  "job_schedules",
  {
    id: primaryId(),
    /** Null for a platform-wide schedule. */
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "cascade",
    }),
    jobType: varchar("job_type", { length: 64 })
      .notNull()
      .references(() => jobDefinitions.jobType, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Standard five-field cron. Mutually exclusive with `intervalSeconds`. See the note above. */
    cronExpression: varchar("cron_expression", { length: 120 }),
    /** A fixed interval, in seconds. Mutually exclusive with `cronExpression`. */
    intervalSeconds: integer("interval_seconds"),
    /** The institution's timezone. A cron that does not name one runs at UTC and surprises somebody. */
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    isActive: boolean("is_active").notNull().default(true),
    /** Payload copied into every job this schedule enqueues. */
    payloadTemplate: jsonb("payload_template")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** Overrides the definition's retry settings for jobs from this schedule. */
    maxAttempts: integer("max_attempts"),
    /** `skip` (default) or `fire_all`. See the note at the top of this table. */
    catchUpPolicy: varchar("catch_up_policy", { length: 8 }).notNull().default("skip"),
    /** When this schedule last enqueued. See the note above. */
    lastEnqueuedAt: timestamp("last_enqueued_at", { withTimezone: true, precision: 3 }),
    /** When the next enqueue is due. The worker's poll query reads this. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true, precision: 3 }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true, precision: 3 }),
    /** The `jobs` row from the most recent enqueue, for "why did it not run?". */
    lastJobId: uuid("last_job_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("job_schedules_name_unique").on(t.institutionId, t.name),
    // The scheduler's poll query. Only active schedules with a due time are in the index.
    index("job_schedules_due_idx")
      .on(t.nextRunAt)
      .where(sql`${t.isActive} = true and ${t.nextRunAt} is not null`),
    index("job_schedules_type_idx").on(t.jobType, t.isActive),
    // A schedule is either a cron or an interval. Never both, never neither: a schedule with no trigger is
    // a row nobody notices until the workflow silently stops.
    check(
      "job_schedules_trigger_check",
      sql`num_nonnulls(${t.cronExpression}, ${t.intervalSeconds}) = 1`,
    ),
    check(
      "job_schedules_interval_check",
      sql`${t.intervalSeconds} is null or ${t.intervalSeconds} >= 60`,
    ),
    check("job_schedules_catch_up_check", sql`${t.catchUpPolicy} in ('skip', 'fire_all')`),
    check(
      "job_schedules_max_attempts_check",
      sql`${t.maxAttempts} is null or ${t.maxAttempts} > 0`,
    ),
    check(
      "job_schedules_last_enqueued_pair",
      sql`${t.lastJobId} is null or ${t.lastEnqueuedAt} is not null`,
    ),
  ],
);

/**
 * `dead_letter_jobs` — MODULE 34's dead-letter handling, as its own table.
 *
 * ## Why `jobs.status = 'dead_letter'` is not enough
 *
 * Because `jobs` describes a job, and this describes an **incident**. Three reasons it is separate:
 *
 * 1. **Acknowledgement.** An incident has a lifecycle the job does not: someone has to look at it, decide,
 *    and record that they did. `acknowledgedByUserId` and `acknowledgedAt` have no meaning on a job row.
 * 2. **Retention.** `jobs` can be pruned once the run history is retained; an unresolved incident cannot.
 * 3. **Resolution.** An incident resolves by replaying, by fixing the cause and re-running, or by accepting
 *    the loss. Each is recorded here with a reason, which is what closes a MODULE 31 audit question about
 *    why a monthly report was missing.
 *
 * One row per dead-lettered job, enforced by a unique index on `jobId`.
 */
export const deadLetterJobs = pgTable(
  "dead_letter_jobs",
  {
    id: primaryId(),
    /** The job that exhausted its retries. One incident per job. */
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** The job type, copied so a triage query does not need the join. */
    jobType: varchar("job_type", { length: 64 }).notNull(),
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "set null",
    }),
    /** How many attempts failed. */
    attemptCount: integer("attempt_count").notNull(),
    /** The last error, so triage starts from the actual failure and not from the job's earlier history. */
    errorMessage: text("error_message"),
    errorType: varchar("error_type", { length: 32 }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /**
     * Someone has looked at it. Null for an unattended incident, which is what an alert is for.
     * Acknowledgement is deliberately not resolution: looking is not fixing.
     */
    acknowledgedByUserId: uuid("acknowledged_by_user_id"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, precision: 3 }),
    acknowledgementNote: text("acknowledgement_note"),
    /**
     * `replayed` (a new job was created), `fixed` (the cause was corrected and the job re-run),
     * `abandoned` (accepted as lost). Null while unresolved.
     */
    resolution: varchar("resolution", { length: 12 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, precision: 3 }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    /** The job created by a replay, so the incident and its replacement are linked. */
    replayedAsJobId: uuid("replayed_as_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    // One incident per job. A second dead-lettering of the same job is the same incident.
    uniqueIndex("dead_letter_jobs_job_unique").on(t.jobId),
    // The operator's queue: unacknowledged incidents, oldest first, which is the order they must be fixed.
    index("dead_letter_jobs_unacknowledged_idx")
      .on(t.deadLetteredAt)
      .where(sql`${t.acknowledgedAt} is null`),
    index("dead_letter_jobs_unresolved_idx")
      .on(t.deadLetteredAt)
      .where(sql`${t.resolvedAt} is null`),
    index("dead_letter_jobs_type_idx").on(t.jobType, t.resolvedAt),
    check("dead_letter_jobs_attempt_count_check", sql`${t.attemptCount} > 0`),
    check(
      "dead_letter_jobs_acknowledgement_pair",
      sql`num_nonnulls(${t.acknowledgedByUserId}, ${t.acknowledgedAt}) in (0, 2)`,
    ),
    check(
      "dead_letter_jobs_resolution_check",
      sql`${t.resolution} is null or ${t.resolution} in ('replayed', 'fixed', 'abandoned')`,
    ),
    check(
      "dead_letter_jobs_resolution_pair",
      sql`${t.resolution} is null or (${t.resolvedAt} is not null and ${t.resolvedByUserId} is not null)`,
    ),
    // A resolution with no reason is the gap MODULE 31's audit would find.
    check(
      "dead_letter_jobs_resolution_note_check",
      sql`${t.resolvedAt} is null or nullif(btrim(${t.resolutionNote}), '') is not null`,
    ),
    // Only a replay can have a replacement job.
    check(
      "dead_letter_jobs_replay_check",
      sql`${t.replayedAsJobId} is null or ${t.resolution} = 'replayed'`,
    ),
  ],
);
