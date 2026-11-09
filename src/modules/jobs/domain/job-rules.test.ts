import { describe, expect, it } from "vitest";

import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/shared/errors";
import {
  assertValidJobStatusTransition,
  calculateLeaseExpiry,
  calculateNextAttemptAt,
  calculateNextScheduleRunAt,
  calculateRetryDelayMs,
  classifyJobError,
  determineFailureOutcome,
  generateJobIdempotencyKey,
  isJobClaimExpired,
  isValidJobStatusTransition,
  MIN_VISIBILITY_TIMEOUT_MS,
  parseCronField,
} from "./job-rules";

describe("isJobClaimExpired", () => {
  const claimedAt = new Date("2026-10-30T10:00:00.000Z");
  const timeoutMs = 60_000; // 1 minute

  it("returns false when the current time is before the lease expiry", () => {
    const now = new Date("2026-10-30T10:00:30.000Z"); // 30s in
    expect(isJobClaimExpired(claimedAt, timeoutMs, now)).toBe(false);
  });

  it("returns true when current time equals or exceeds expiry", () => {
    const exact = new Date("2026-10-30T10:01:00.000Z");
    const past = new Date("2026-10-30T10:01:01.000Z");
    expect(isJobClaimExpired(claimedAt, timeoutMs, exact)).toBe(true);
    expect(isJobClaimExpired(claimedAt, timeoutMs, past)).toBe(true);
  });

  it("honours heartbeat when newer than claimedAt", () => {
    const heartbeatAt = new Date("2026-10-30T10:00:50.000Z");
    const checkTime = new Date("2026-10-30T10:01:10.000Z"); // 70s after claim, but only 20s after heartbeat

    expect(isJobClaimExpired(claimedAt, timeoutMs, checkTime, heartbeatAt)).toBe(false);

    const expiredAfterHeartbeat = new Date("2026-10-30T10:01:50.000Z");
    expect(isJobClaimExpired(claimedAt, timeoutMs, expiredAfterHeartbeat, heartbeatAt)).toBe(true);
  });

  it("throws ValidationError when visibility timeout is under 1000ms", () => {
    expect(() => isJobClaimExpired(claimedAt, 500)).toThrow(ValidationError);
  });
});

describe("calculateLeaseExpiry", () => {
  it("computes exact expiry timestamp based on claim and timeout", () => {
    const claimedAt = new Date("2026-10-30T10:00:00.000Z");
    const expiry = calculateLeaseExpiry(claimedAt, 30_000);
    expect(expiry.toISOString()).toBe("2026-10-30T10:00:30.000Z");
  });

  it("clamps timeout to MIN_VISIBILITY_TIMEOUT_MS", () => {
    const claimedAt = new Date("2026-10-30T10:00:00.000Z");
    const expiry = calculateLeaseExpiry(claimedAt, 100);
    expect(expiry.toISOString()).toBe(
      new Date(claimedAt.getTime() + MIN_VISIBILITY_TIMEOUT_MS).toISOString(),
    );
  });
});

describe("calculateRetryDelayMs", () => {
  const baseMs = 10_000;

  it("calculates linear backoff correctly", () => {
    expect(calculateRetryDelayMs(1, baseMs, false)).toBe(10_000);
    expect(calculateRetryDelayMs(2, baseMs, false)).toBe(20_000);
    expect(calculateRetryDelayMs(3, baseMs, false)).toBe(30_000);
  });

  it("calculates exponential backoff correctly", () => {
    expect(calculateRetryDelayMs(1, baseMs, true)).toBe(10_000); // 10k * 2^0
    expect(calculateRetryDelayMs(2, baseMs, true)).toBe(20_000); // 10k * 2^1
    expect(calculateRetryDelayMs(3, baseMs, true)).toBe(40_000); // 10k * 2^2
    expect(calculateRetryDelayMs(4, baseMs, true)).toBe(80_000); // 10k * 2^3
  });

  it("clamps to maxBackoffMs ceiling", () => {
    const delay = calculateRetryDelayMs(10, baseMs, true, 50_000);
    expect(delay).toBe(50_000);
  });

  it("throws ValidationError for attempt numbers < 1", () => {
    expect(() => calculateRetryDelayMs(0, baseMs, false)).toThrow(ValidationError);
    expect(() => calculateRetryDelayMs(-1, baseMs, true)).toThrow(ValidationError);
  });
});

describe("calculateNextAttemptAt", () => {
  it("adds the computed delay to the reference timestamp", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    const nextAt = calculateNextAttemptAt({
      attemptNumber: 2,
      baseBackoffMs: 15_000,
      isExponential: false,
      now,
    });
    expect(nextAt.toISOString()).toBe("2026-10-30T12:00:30.000Z");
  });
});

describe("determineFailureOutcome & Dead-Letter Routing", () => {
  const now = new Date("2026-10-30T15:00:00.000Z");
  const baseBackoffMs = 10_000;

  it("routes terminal validation error to dead_letter immediately even on attempt 1", () => {
    const outcome = determineFailureOutcome({
      attemptCount: 1,
      maxAttempts: 5,
      errorType: "validation",
      errorMessage: "Invalid payload property: studentId required",
      baseBackoffMs,
      isExponential: false,
      now,
    });

    expect(outcome.outcome).toBe("dead_letter");
    if (outcome.outcome === "dead_letter") {
      expect(outcome.deadLetterReason).toContain("Terminal error [validation]");
      expect(outcome.deadLetteredAt).toBe(now);
    }
  });

  it("routes terminal permission_denied error to dead_letter immediately", () => {
    const outcome = determineFailureOutcome({
      attemptCount: 1,
      maxAttempts: 3,
      errorType: "permission_denied",
      errorMessage: "Tenant access revoked",
      baseBackoffMs,
      isExponential: false,
      now,
    });

    expect(outcome.outcome).toBe("dead_letter");
  });

  it("routes to retry when attempts are below maxAttempts", () => {
    const outcome = determineFailureOutcome({
      attemptCount: 2,
      maxAttempts: 3,
      errorType: "dependency_unavailable",
      errorMessage: "SMTP server down",
      baseBackoffMs,
      isExponential: true,
      now,
    });

    expect(outcome.outcome).toBe("retry");
    if (outcome.outcome === "retry") {
      expect(outcome.nextAttemptNumber).toBe(3);
      expect(outcome.delayMs).toBe(20_000); // 10k * 2^(2-1) = 20k
      expect(outcome.nextAttemptAt.toISOString()).toBe("2026-10-30T15:00:20.000Z");
    }
  });

  it("routes to dead_letter when retries are exhausted", () => {
    const outcome = determineFailureOutcome({
      attemptCount: 3,
      maxAttempts: 3,
      errorType: "timeout",
      errorMessage: "Gateway timeout 504",
      baseBackoffMs,
      isExponential: false,
      now,
    });

    expect(outcome.outcome).toBe("dead_letter");
    if (outcome.outcome === "dead_letter") {
      expect(outcome.deadLetterReason).toContain("Retries exhausted (3/3 attempts failed)");
      expect(outcome.deadLetterReason).toContain("Gateway timeout 504");
    }
  });
});

describe("generateJobIdempotencyKey", () => {
  it("formats key as jobType:scopeKey", () => {
    expect(generateJobIdempotencyKey("monthly_report", "report-12345")).toBe(
      "monthly_report:report-12345",
    );
  });

  it("throws ValidationError for empty type or scope", () => {
    expect(() => generateJobIdempotencyKey("", "123")).toThrow(ValidationError);
    expect(() => generateJobIdempotencyKey("email_send", "  ")).toThrow(ValidationError);
  });

  it("throws ValidationError when key exceeds 200 chars", () => {
    const longString = "a".repeat(200);
    expect(() => generateJobIdempotencyKey("long_type", longString)).toThrow(ValidationError);
  });
});

describe("Job State Machine Transitions", () => {
  it("validates permitted transitions", () => {
    expect(isValidJobStatusTransition("queued", "running")).toBe(true);
    expect(isValidJobStatusTransition("running", "completed")).toBe(true);
    expect(isValidJobStatusTransition("running", "failed")).toBe(true);
    expect(isValidJobStatusTransition("running", "dead_letter")).toBe(true);
    expect(isValidJobStatusTransition("failed", "running")).toBe(true);
    expect(isValidJobStatusTransition("dead_letter", "queued")).toBe(true);
    expect(isValidJobStatusTransition("queued", "cancelled")).toBe(true);
  });

  it("rejects forbidden transitions", () => {
    expect(isValidJobStatusTransition("completed", "running")).toBe(false);
    expect(isValidJobStatusTransition("cancelled", "running")).toBe(false);
    expect(isValidJobStatusTransition("completed", "queued")).toBe(false);
  });

  it("assertValidJobStatusTransition throws BusinessRuleError on illegal transitions", () => {
    expect(() => assertValidJobStatusTransition("completed", "running")).toThrow(BusinessRuleError);
  });
});

describe("classifyJobError", () => {
  it("classifies ValidationError as validation", () => {
    const error = new ValidationError("Payload malformed", { payload: ["Payload malformed"] });
    const classified = classifyJobError(error);
    expect(classified.type).toBe("validation");
    expect(classified.message).toBe("Payload malformed");
  });

  it("classifies ForbiddenError as permission_denied", () => {
    const error = new ForbiddenError("Insufficient rights");
    const classified = classifyJobError(error);
    expect(classified.type).toBe("permission_denied");
  });

  it("classifies ConflictError as conflict", () => {
    const error = new ConflictError("Idempotency conflict");
    const classified = classifyJobError(error);
    expect(classified.type).toBe("conflict");
  });

  it("classifies timeout errors as timeout", () => {
    const error = new Error("Task timed out after 30000ms");
    const classified = classifyJobError(error);
    expect(classified.type).toBe("timeout");
  });

  it("classifies network errors as dependency_unavailable", () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    const classified = classifyJobError(error);
    expect(classified.type).toBe("dependency_unavailable");
  });

  it("classifies string errors as unknown", () => {
    const classified = classifyJobError("Some raw string error");
    expect(classified.type).toBe("unknown");
    expect(classified.message).toBe("Some raw string error");
  });

  it("classifies unknown primitives safely", () => {
    const classified = classifyJobError({ unexpected: 123 });
    expect(classified.type).toBe("unknown");
    expect(classified.message).toContain("Unknown error");
  });
});

describe("Scheduling: parseCronField & calculateNextScheduleRunAt", () => {
  it("parses wildcard and step cron fields", () => {
    const wild = parseCronField("*", 0, 5);
    expect([...wild]).toEqual([0, 1, 2, 3, 4, 5]);

    const step = parseCronField("*/15", 0, 45);
    expect([...step]).toEqual([0, 15, 30, 45]);
  });

  it("parses range cron fields", () => {
    const range = parseCronField("1-5", 1, 10);
    expect([...range]).toEqual([1, 2, 3, 4, 5]);
  });

  it("throws on invalid range or step in cron fields", () => {
    expect(() => parseCronField("*/0", 0, 10)).toThrow(ValidationError);
    expect(() => parseCronField("5-2", 1, 10)).toThrow(ValidationError);
  });

  it("calculates next run with intervalSeconds", () => {
    const fromTime = new Date("2026-10-30T10:00:00.000Z");
    const nextRun = calculateNextScheduleRunAt({
      intervalSeconds: 300,
      fromTime,
    });
    expect(nextRun.toISOString()).toBe("2026-10-30T10:05:00.000Z");
  });

  it("calculates next run for standard cron expression", () => {
    // Every day at 07:00 UTC
    const fromTime = new Date("2026-10-30T06:30:00.000Z");
    const nextRun = calculateNextScheduleRunAt({
      cronExpression: "0 7 * * *",
      fromTime,
    });
    expect(nextRun.toISOString()).toBe("2026-10-30T07:00:00.000Z");
  });

  it("throws ValidationError for invalid cron syntax", () => {
    expect(() =>
      calculateNextScheduleRunAt({
        cronExpression: "* * *", // Only 3 fields
      }),
    ).toThrow(ValidationError);
  });
});

