/**
 * Background jobs and worker domain rules (`PRD.md` MODULE 34, `RULES.md` §48–§49, `ARCHITECTURE.md` §33–§34).
 *
 * Pure domain logic — zero I/O, no Drizzle, no DB dependencies.
 * Contains:
 * 1. Status vocabulary & human-readable labels
 * 2. Lease & execution timeout evaluation
 * 3. Linear & exponential retry backoff calculations
 * 4. Failure outcome & dead-letter routing rules
 * 5. State machine transition invariants
 * 6. Idempotency key generators
 */
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  InternalError,
  UnauthorizedError,
  ValidationError,
} from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Vocabulary & Types                                                         */
/* -------------------------------------------------------------------------- */

export const JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed (Retrying)",
  cancelled: "Cancelled",
  dead_letter: "Dead Letter (Exhausted)",
};

export const ERROR_TYPES = [
  "validation",
  "dependency_unavailable",
  "conflict",
  "permission_denied",
  "timeout",
  "internal",
  "unknown",
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  validation: "Validation Error",
  dependency_unavailable: "Dependency Unavailable",
  conflict: "Concurrency/Data Conflict",
  permission_denied: "Permission Denied",
  timeout: "Execution Timeout",
  internal: "Internal Error",
  unknown: "Unknown Failure",
};

export const DEAD_LETTER_RESOLUTIONS = ["replayed", "fixed", "abandoned"] as const;

export type DeadLetterResolution = (typeof DEAD_LETTER_RESOLUTIONS)[number];

export const DEAD_LETTER_RESOLUTION_LABELS: Record<DeadLetterResolution, string> = {
  replayed: "Replayed as New Job",
  fixed: "Fixed and Resumed",
  abandoned: "Abandoned / Lost Accepted",
};

export const CATCH_UP_POLICIES = ["skip", "fire_all"] as const;

export type CatchUpPolicy = (typeof CATCH_UP_POLICIES)[number];

/* -------------------------------------------------------------------------- */
/* Timeouts & Leases                                                          */
/* -------------------------------------------------------------------------- */

export const MIN_VISIBILITY_TIMEOUT_MS = 1_000;
export const DEFAULT_VISIBILITY_TIMEOUT_MS = 300_000; // 5 minutes
export const DEFAULT_RETRY_BACKOFF_MS = 30_000; // 30 seconds
export const MAX_RETRY_BACKOFF_MS = 86_400_000; // 24 hours
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Checks whether a claimed job lease has expired.
 * A job whose lease has expired without a recent heartbeat is eligible for reclamation.
 */
export function isJobClaimExpired(
  claimedAt: Date,
  visibilityTimeoutMs: number,
  now: Date = new Date(),
  heartbeatAt?: Date | null,
): boolean {
  if (visibilityTimeoutMs < MIN_VISIBILITY_TIMEOUT_MS) {
    throw new ValidationError("Invalid visibility timeout", {
      visibilityTimeoutMs: [`Visibility timeout must be at least ${MIN_VISIBILITY_TIMEOUT_MS}ms`],
    });
  }

  // If a heartbeat was recorded after claim, the lease extends from that heartbeat
  const referenceTime = heartbeatAt && heartbeatAt.getTime() > claimedAt.getTime()
    ? heartbeatAt
    : claimedAt;

  const expiryTimestamp = referenceTime.getTime() + visibilityTimeoutMs;
  return now.getTime() >= expiryTimestamp;
}

/**
 * Calculates the exact lease expiry timestamp.
 */
export function calculateLeaseExpiry(
  claimedAt: Date,
  visibilityTimeoutMs: number,
  heartbeatAt?: Date | null,
): Date {
  const referenceTime = heartbeatAt && heartbeatAt.getTime() > claimedAt.getTime()
    ? heartbeatAt
    : claimedAt;
  return new Date(referenceTime.getTime() + Math.max(MIN_VISIBILITY_TIMEOUT_MS, visibilityTimeoutMs));
}

/* -------------------------------------------------------------------------- */
/* Backoff & Retry Logic                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Calculates the delay before the next retry attempt.
 *
 * @param attemptNumber - The attempt number that just completed (1-based, e.g. 1 after first failure).
 * @param baseBackoffMs - Base backoff interval in milliseconds.
 * @param isExponential - Whether backoff grows exponentially (2^(attempt-1)) or linearly (attempt * base).
 * @param maxBackoffMs - Ceiling clamp for the backoff.
 */
export function calculateRetryDelayMs(
  attemptNumber: number,
  baseBackoffMs: number,
  isExponential: boolean,
  maxBackoffMs: number = MAX_RETRY_BACKOFF_MS,
): number {
  if (attemptNumber < 1) {
    throw new ValidationError("Attempt number must be at least 1", {
      attemptNumber: ["Attempt number must be greater than or equal to 1"],
    });
  }

  const safeBase = Math.max(0, baseBackoffMs);
  let calculatedDelay: number;

  if (isExponential) {
    // 1st attempt failure -> base * 2^0 = base
    // 2nd attempt failure -> base * 2^1 = base * 2
    // 3rd attempt failure -> base * 2^2 = base * 4
    const factor = Math.pow(2, Math.min(attemptNumber - 1, 16)); // cap exponent to prevent overflow
    calculatedDelay = safeBase * factor;
  } else {
    // 1st attempt failure -> base * 1
    // 2nd attempt failure -> base * 2
    calculatedDelay = safeBase * attemptNumber;
  }

  return Math.min(calculatedDelay, maxBackoffMs);
}

/**
 * Calculates the exact future Date for the next attempt.
 */
export function calculateNextAttemptAt(options: {
  attemptNumber: number;
  baseBackoffMs: number;
  isExponential: boolean;
  maxBackoffMs?: number;
  now?: Date;
}): Date {
  const now = options.now ?? new Date();
  const delayMs = calculateRetryDelayMs(
    options.attemptNumber,
    options.baseBackoffMs,
    options.isExponential,
    options.maxBackoffMs,
  );
  return new Date(now.getTime() + delayMs);
}

/* -------------------------------------------------------------------------- */
/* Dead-Letter Routing & Failure Outcomes                                     */
/* -------------------------------------------------------------------------- */

/**
 * Terminal error types should not be retried because re-running with the same
 * inputs will reliably produce the identical error (e.g., malformed payload).
 */
export function isTerminalErrorType(errorType: ErrorType): boolean {
  return errorType === "validation" || errorType === "permission_denied";
}

export type FailureOutcome =
  | {
      readonly outcome: "retry";
      readonly nextAttemptAt: Date;
      readonly nextAttemptNumber: number;
      readonly delayMs: number;
    }
  | {
      readonly outcome: "dead_letter";
      readonly deadLetterReason: string;
      readonly deadLetteredAt: Date;
    };

/**
 * Determines whether a failed job attempt should be retried or routed to dead-letter queue.
 *
 * Rules:
 * 1. If error is terminal (validation/permission_denied), dead-letter immediately.
 * 2. If attempt count reaches or exceeds maxAttempts, dead-letter.
 * 3. Otherwise, retry with calculated backoff.
 */
export function determineFailureOutcome(params: {
  attemptCount: number; // Attempts already executed including this one
  maxAttempts: number;
  errorType: ErrorType;
  errorMessage: string;
  baseBackoffMs: number;
  isExponential: boolean;
  maxBackoffMs?: number;
  now?: Date;
}): FailureOutcome {
  const {
    attemptCount,
    maxAttempts,
    errorType,
    errorMessage,
    baseBackoffMs,
    isExponential,
    maxBackoffMs,
    now = new Date(),
  } = params;

  if (isTerminalErrorType(errorType)) {
    return {
      outcome: "dead_letter",
      deadLetterReason: `Terminal error [${errorType}]: ${errorMessage}`,
      deadLetteredAt: now,
    };
  }

  if (attemptCount >= maxAttempts) {
    return {
      outcome: "dead_letter",
      deadLetterReason: `Retries exhausted (${attemptCount}/${maxAttempts} attempts failed). Last error [${errorType}]: ${errorMessage}`,
      deadLetteredAt: now,
    };
  }

  const nextAttemptNumber = attemptCount + 1;
  const delayMs = calculateRetryDelayMs(attemptCount, baseBackoffMs, isExponential, maxBackoffMs);
  const nextAttemptAt = new Date(now.getTime() + delayMs);

  return {
    outcome: "retry",
    nextAttemptAt,
    nextAttemptNumber,
    delayMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Idempotency & Deduplication                                                */
/* -------------------------------------------------------------------------- */

/**
 * Generates an idempotency key conforming to RULES.md §48:
 * Key is derived from (jobType, businessRowIdentifier).
 */
export function generateJobIdempotencyKey(jobType: string, scopeKey: string): string {
  const sanitizedType = jobType.trim().toLowerCase();
  const sanitizedScope = scopeKey.trim();
  if (sanitizedType.length === 0 || sanitizedScope.length === 0) {
    throw new ValidationError("Invalid idempotency key parts", {
      idempotencyKey: ["jobType and scopeKey must be non-empty strings"],
    });
  }
  const key = `${sanitizedType}:${sanitizedScope}`;
  if (key.length > 200) {
    throw new ValidationError("Idempotency key exceeds 200 characters", {
      idempotencyKey: ["Key length cannot exceed 200 characters"],
    });
  }
  return key;
}

/* -------------------------------------------------------------------------- */
/* State Machine Invariants                                                   */
/* -------------------------------------------------------------------------- */

const ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "completed", "failed", "dead_letter", "cancelled"],
  running: ["completed", "failed", "dead_letter", "cancelled"],
  failed: ["running", "queued", "dead_letter", "cancelled"],
  dead_letter: ["queued", "running"], // When replayed or fixed
  completed: [], // Terminal state
  cancelled: [], // Terminal state
};

/**
 * Asserts whether a status transition is permitted by the job lifecycle machine.
 */
export function isValidJobStatusTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertValidJobStatusTransition(from: JobStatus, to: JobStatus): void {
  if (!isValidJobStatusTransition(from, to)) {
    throw new BusinessRuleError(
      `Invalid job state transition from '${from}' to '${to}'.`,
      {
        userMessage: `Cannot transition job from ${JOB_STATUS_LABELS[from]} to ${JOB_STATUS_LABELS[to]}.`,
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Error Classification                                                       */
/* -------------------------------------------------------------------------- */

export interface ClassifiedJobError {
  readonly type: ErrorType;
  readonly message: string;
  readonly stack?: string | undefined;
}

/**
 * Classifies an arbitrary thrown error into an ErrorType vocabulary recognized by MODULE 34.
 */
export function classifyJobError(error: unknown): ClassifiedJobError {
  if (error instanceof ValidationError) {
    return {
      type: "validation",
      message: error.message,
      stack: error.stack,
    };
  }

  if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
    return {
      type: "permission_denied",
      message: error.message,
      stack: error.stack,
    };
  }

  if (error instanceof ConflictError) {
    return {
      type: "conflict",
      message: error.message,
      stack: error.stack,
    };
  }

  if (error instanceof InternalError) {
    return {
      type: "internal",
      message: error.message,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    let type: ErrorType = "internal";
    if (name.includes("timeout") || msg.includes("timeout") || msg.includes("timed out")) {
      type = "timeout";
    } else if (
      msg.includes("econnrefused") ||
      msg.includes("network") ||
      msg.includes("connection") ||
      msg.includes("unavailable") ||
      msg.includes("fetch failed") ||
      msg.includes("503")
    ) {
      type = "dependency_unavailable";
    } else if (msg.includes("validation") || msg.includes("invalid")) {
      type = "validation";
    } else if (msg.includes("permission") || msg.includes("forbidden") || msg.includes("unauthorized")) {
      type = "permission_denied";
    }

    return {
      type,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return {
      type: "unknown",
      message: error,
    };
  }

  return {
    type: "unknown",
    message: "Unknown error occurred during background job execution",
  };
}

/* -------------------------------------------------------------------------- */
/* Scheduling Loop Calculations                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parses a single cron field component into an expanded set of numbers.
 */
export function parseCronField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();
  const parts = field.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (trimmed.startsWith("*/")) {
      const step = Number.parseInt(trimmed.slice(2), 10);
      if (Number.isNaN(step) || step <= 0) {
        throw new ValidationError(`Invalid step in cron field: ${trimmed}`, {
          cronField: [`Invalid step: ${trimmed}`],
        });
      }
      for (let i = min; i <= max; i += step) result.add(i);
    } else if (trimmed.includes("-")) {
      const [startStr, endAndStep] = trimmed.split("-");
      if (!startStr || !endAndStep) {
        throw new ValidationError(`Invalid range in cron field: ${trimmed}`, {
          cronField: [`Invalid range: ${trimmed}`],
        });
      }
      let endStr = endAndStep;
      let step = 1;
      if (endAndStep.includes("/")) {
        const [subEnd, subStep] = endAndStep.split("/");
        if (!subEnd || !subStep) {
          throw new ValidationError(`Invalid range/step in cron field: ${trimmed}`, {
            cronField: [`Invalid range/step: ${trimmed}`],
          });
        }
        endStr = subEnd;
        step = Number.parseInt(subStep, 10);
      }
      const start = Number.parseInt(startStr, 10);
      const end = Number.parseInt(endStr, 10);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < min || end > max || step <= 0) {
        throw new ValidationError(`Invalid range values in cron field: ${trimmed}`, {
          cronField: [`Invalid range values: ${trimmed}`],
        });
      }
      for (let i = start; i <= end; i += step) result.add(i);
    } else {
      const num = Number.parseInt(trimmed, 10);
      if (Number.isNaN(num) || num < min || num > max) {
        throw new ValidationError(`Invalid number ${trimmed} in cron field (allowed: ${min}-${max})`, {
          cronField: [`Allowed range: ${min}-${max}`],
        });
      }
      result.add(num);
    }
  }

  return result;
}

export interface NextScheduleRunOptions {
  readonly cronExpression?: string | null | undefined;
  readonly intervalSeconds?: number | null | undefined;
  readonly fromTime?: Date | undefined;
  readonly catchUpPolicy?: CatchUpPolicy | undefined;
  readonly lastEnqueuedAt?: Date | null | undefined;
}

/**
 * Calculates the next schedule run date based on either interval seconds or standard 5-field cron.
 */
export function calculateNextScheduleRunAt(options: NextScheduleRunOptions): Date {
  const { cronExpression, intervalSeconds, fromTime = new Date() } = options;

  if (typeof intervalSeconds === "number" && intervalSeconds >= 60) {
    return new Date(fromTime.getTime() + intervalSeconds * 1000);
  }

  if (cronExpression && cronExpression.trim().length > 0) {
    const fields = cronExpression.trim().split(/\s+/);
    if (fields.length !== 5) {
      throw new ValidationError("Cron expression must consist of exactly 5 fields", {
        cronExpression: ["Expected 5 fields: minute hour day-of-month month day-of-week"],
      });
    }

    const minutes = parseCronField(fields[0]!, 0, 59);
    const hours = parseCronField(fields[1]!, 0, 23);
    const daysOfMonth = parseCronField(fields[2]!, 1, 31);
    const months = parseCronField(fields[3]!, 1, 12);
    const daysOfWeek = parseCronField(fields[4]!, 0, 7); // 0 or 7 is Sunday

    const searchDate = new Date(fromTime.getTime());
    searchDate.setUTCSeconds(0, 0);
    searchDate.setUTCMinutes(searchDate.getUTCMinutes() + 1);

    // Limit search to 366 days (527040 minutes) to prevent infinite loops
    for (let i = 0; i < 527040; i++) {
      const month = searchDate.getUTCMonth() + 1; // 1-12
      if (!months.has(month)) {
        searchDate.setUTCDate(1);
        searchDate.setUTCHours(0, 0, 0, 0);
        searchDate.setUTCMonth(searchDate.getUTCMonth() + 1);
        continue;
      }

      const dayOfMonth = searchDate.getUTCDate();
      const dayOfWeek = searchDate.getUTCDay(); // 0 is Sun
      const dayMatches =
        daysOfMonth.has(dayOfMonth) && (daysOfWeek.has(dayOfWeek) || (dayOfWeek === 0 && daysOfWeek.has(7)));
      if (!dayMatches) {
        searchDate.setUTCDate(searchDate.getUTCDate() + 1);
        searchDate.setUTCHours(0, 0, 0, 0);
        continue;
      }

      const hour = searchDate.getUTCHours();
      if (!hours.has(hour)) {
        searchDate.setUTCHours(searchDate.getUTCHours() + 1, 0, 0, 0);
        continue;
      }

      const minute = searchDate.getUTCMinutes();
      if (minutes.has(minute)) {
        return searchDate;
      }

      searchDate.setUTCMinutes(searchDate.getUTCMinutes() + 1);
    }

    throw new ValidationError("Could not find matching date within 1 year for cron expression", {
      cronExpression: ["Cron expression matched no dates in the next year"],
    });
  }

  throw new ValidationError(
    "Schedule requires either intervalSeconds >= 60 or a valid cronExpression",
    { schedule: ["Schedule requires either intervalSeconds >= 60 or a valid cronExpression"] },
  );
}

