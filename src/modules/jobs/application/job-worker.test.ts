/**
 * Comprehensive tests for background job execution, retry backoff, dead-letter routing,
 * and lease reclamation in {@link JobWorker}.
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, ValidationError } from "@/shared/errors";
import { createFakeJobStore } from "./testing/fakes";
import { createJobWorker } from "./job-worker";

describe("JobWorker background execution engine", () => {
  it("executes a registered handler successfully and records attempt in jobRuns", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store, { workerId: "test-worker-1" });

    let handlerRan = false;
    worker.registerHandler("email_send", async (ctx) => {
      handlerRan = true;
      ctx.log("info", "Sending email to user");
      return { sent: true, recipient: ctx.payload["recipient"] };
    });

    const job = await store.createJob({
      jobType: "email_send",
      idempotencyKey: "email:user-1",
      payload: { recipient: "user@example.com" },
    });

    const result = await worker.processJob(job);

    expect(handlerRan).toBe(true);
    expect(result.succeeded).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.result).toEqual({ sent: true, recipient: "user@example.com" });

    // Verify stored job status
    const storedJob = await store.findJobById(job.id);
    expect(storedJob?.status).toBe("completed");
    expect(storedJob?.completedAt).toBeInstanceOf(Date);
    expect(storedJob?.durationMs).toBeGreaterThanOrEqual(0);

    // Verify run history
    const runs = await store.listRunsForJob(job.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.attemptNumber).toBe(1);
    expect(runs[0]?.succeeded).toBe(true);
    expect(runs[0]?.workerId).toBe("test-worker-1");
    expect(runs[0]?.logLines?.[0]?.message).toBe("Sending email to user");
  });

  it("handles retry backoff when a transient error occurs", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store, { workerId: "test-worker-2" });

    await store.upsertJobDefinition({
      jobType: "report_generation",
      handlerName: "reportHandler",
      displayName: "Report Generation",
      defaultMaxAttempts: 3,
      retryBackoffMs: 5_000,
      retryBackoffIsExponential: true,
    });

    worker.registerHandler("report_generation", async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });

    const job = await store.createJob({
      jobType: "report_generation",
      idempotencyKey: "report:batch-1",
      payload: { reportId: "rep-101" },
      maxAttempts: 3,
    });

    const result = await worker.processJob(job);

    expect(result.succeeded).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error?.type).toBe("dependency_unavailable");

    const updatedJob = await store.findJobById(job.id);
    expect(updatedJob?.status).toBe("failed");
    expect(updatedJob?.attemptCount).toBe(1);
    expect(updatedJob?.nextAttemptAt).toBeInstanceOf(Date);

    // Verify run history
    const runs = await store.listRunsForJob(job.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.succeeded).toBe(false);
    expect(runs[0]?.errorType).toBe("dependency_unavailable");
  });

  it("routes to dead-letter queue when retries are exhausted", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store);

    worker.registerHandler("data_sync", async () => {
      throw new Error("Remote server 503 Service Unavailable");
    });

    // Create job with attemptCount = 2 and maxAttempts = 3, so this attempt 3 exhausts retries
    const job = await store.createJob({
      jobType: "data_sync",
      idempotencyKey: "sync:batch-9",
      payload: {},
      maxAttempts: 3,
    });

    // Simulate previous 2 failed attempts so attemptCount is 2 in store
    const { job: failedTwiceJob } = await store.failJob({
      jobId: job.id,
      workerId: "prior-worker",
      errorType: "dependency_unavailable",
      errorMessage: "Prior attempt failure",
      outcome: { outcome: "retry", nextAttemptNumber: 3, nextAttemptAt: new Date(), delayMs: 1000 },
      durationMs: 10,
    });

    const result = await worker.processJob(failedTwiceJob);

    expect(result.succeeded).toBe(false);
    expect(result.status).toBe("dead_letter");

    const storedJob = await store.findJobById(job.id);
    expect(storedJob?.status).toBe("dead_letter");
    expect(storedJob?.deadLetteredAt).toBeInstanceOf(Date);
    expect(storedJob?.deadLetterReason).toContain("Retries exhausted (3/3 attempts failed)");

    // Check dead-letter incident creation
    const incident = await store.findDeadLetterByJobId(job.id);
    expect(incident).toBeDefined();
    expect(incident?.jobId).toBe(job.id);
    expect(incident?.attemptCount).toBe(3);
    expect(incident?.errorType).toBe("dependency_unavailable");
    expect(incident?.resolution).toBeNull();
  });

  it("routes terminal validation error immediately to dead-letter on attempt 1", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store);

    worker.registerHandler("payment_reconciliation", async () => {
      throw new ValidationError("Invalid transaction currency: XYZ not supported", {
        currency: ["XYZ not supported"],
      });
    });

    const job = await store.createJob({
      jobType: "payment_reconciliation",
      idempotencyKey: "pay:rec-1",
      payload: {},
      maxAttempts: 5,
    });

    const result = await worker.processJob(job);

    expect(result.succeeded).toBe(false);
    expect(result.status).toBe("dead_letter");

    const storedJob = await store.findJobById(job.id);
    expect(storedJob?.status).toBe("dead_letter");
    expect(storedJob?.deadLetterReason).toContain("Terminal error [validation]");

    const incident = await store.findDeadLetterByJobId(job.id);
    expect(incident).toBeDefined();
    expect(incident?.errorType).toBe("validation");
  });

  it("routes terminal permission_denied error immediately to dead-letter on attempt 1", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store);

    worker.registerHandler("restricted_export", async () => {
      throw new ForbiddenError("Caller lacks EXPORT_AUDIT_LOGS permission");
    });

    const job = await store.createJob({
      jobType: "restricted_export",
      idempotencyKey: "export:audit-1",
      payload: {},
      maxAttempts: 5,
    });

    const result = await worker.processJob(job);
    expect(result.status).toBe("dead_letter");
  });

  it("immediately dead-letters job with unregistered handler", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store);

    const job = await store.createJob({
      jobType: "unregistered_type",
      idempotencyKey: "unreg:1",
      payload: {},
    });

    const result = await worker.processJob(job);
    expect(result.succeeded).toBe(false);
    expect(result.status).toBe("dead_letter");
    expect(result.error?.message).toContain("No registered worker handler");
  });

  it("updates heartbeat during execution", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store, { workerId: "hb-worker" });

    worker.registerHandler("heartbeat_test", async (ctx) => {
      await ctx.heartbeat();
      return { ok: true };
    });

    const job = await store.createJob({
      jobType: "heartbeat_test",
      idempotencyKey: "hb:1",
      payload: {},
    });

    // Claim the job first
    const claimed = await store.claimJobs({ workerId: "hb-worker", limit: 1 });
    expect(claimed).toHaveLength(1);

    await worker.processJob(claimed[0]!);

    const updatedJob = await store.findJobById(job.id);
    expect(updatedJob?.heartbeatAt).toBeInstanceOf(Date);
  });

  it("reclaims abandoned jobs whose lease has expired", async () => {
    const store = createFakeJobStore();

    // Create job with short visibility timeout
    const job = await store.createJob({
      jobType: "heavy_task",
      idempotencyKey: "heavy:1",
      payload: {},
      visibilityTimeoutMs: 2_000, // 2s
    });

    const claimedAt = new Date("2026-10-30T10:00:00.000Z");
    await store.claimJobs({ workerId: "dead-worker", limit: 1, now: claimedAt });

    const claimedJob = await store.findJobById(job.id);
    expect(claimedJob?.status).toBe("running");
    expect(claimedJob?.claimedBy).toBe("dead-worker");

    // Check 1s later: not expired yet
    const check1 = new Date("2026-10-30T10:00:01.000Z");
    const reclaimed1 = await store.reclaimStaleClaims(check1);
    expect(reclaimed1).toBe(0);

    // Check 3s later: lease expired, should be reclaimed to queued
    const check2 = new Date("2026-10-30T10:00:03.000Z");
    const reclaimed2 = await store.reclaimStaleClaims(check2);
    expect(reclaimed2).toBe(1);

    const resetJob = await store.findJobById(job.id);
    expect(resetJob?.status).toBe("queued");
    expect(resetJob?.claimedBy).toBeNull();
    expect(resetJob?.claimedAt).toBeNull();
  });

  it("processNextJobs claims and processes queued jobs", async () => {
    const store = createFakeJobStore();
    const worker = createJobWorker(store);

    let count = 0;
    worker.registerHandler("batch_item", async () => {
      count++;
    });

    await store.createJob({
      jobType: "batch_item",
      idempotencyKey: "b:1",
      payload: {},
    });
    await store.createJob({
      jobType: "batch_item",
      idempotencyKey: "b:2",
      payload: {},
    });

    const results = await worker.processNextJobs(10);
    expect(results).toHaveLength(2);
    expect(count).toBe(2);
    expect(results.every((r) => r.succeeded)).toBe(true);
  });
});
