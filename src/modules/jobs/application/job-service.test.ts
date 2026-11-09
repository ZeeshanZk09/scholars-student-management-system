/**
 * Unit tests for {@link JobService} use cases.
 */
import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import { createFakeJobStore } from "./testing/fakes";
import { createJobService } from "./job-service";

describe("JobService application operations", () => {
  it("enqueues a job with validated schema and generated idempotency key", async () => {
    const store = createFakeJobStore();
    const service = createJobService(store);

    const job = await service.enqueueJob({
      jobType: "bulk_sms",
      payload: { message: "School closed tomorrow", studentCount: 150 },
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe("queued");
    expect(job.idempotencyKey).toMatch(/^bulk_sms:/);
    expect(job.deduplicateScope).toBe(job.idempotencyKey);
  });

  it("prevents duplicate job submission with identical idempotency key", async () => {
    const store = createFakeJobStore();
    const service = createJobService(store);

    await service.enqueueJob({
      jobType: "fee_reminder",
      idempotencyKey: "fee:invoice-999",
      payload: { invoiceId: "999" },
    });

    await expect(
      service.enqueueJob({
        jobType: "fee_reminder",
        idempotencyKey: "fee:invoice-999",
        payload: { invoiceId: "999" },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("fails boundary validation on invalid jobType or inputs", async () => {
    const store = createFakeJobStore();
    const service = createJobService(store);

    await expect(
      service.enqueueJob({
        jobType: "", // empty job type
        payload: {},
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("supports operator dead-letter acknowledgement and resolution", async () => {
    const store = createFakeJobStore();
    const service = createJobService(store);

    // Create a job and dead-letter it
    const job = await store.createJob({
      jobType: "payroll_batch",
      idempotencyKey: "pay:oct-2026",
      payload: {},
    });

    const failed = await store.failJob({
      jobId: job.id,
      workerId: "w-1",
      errorType: "validation",
      errorMessage: "Tax configuration missing",
      outcome: {
        outcome: "dead_letter",
        deadLetterReason: "Tax configuration missing",
        deadLetteredAt: new Date(),
      },
      durationMs: 120,
    });

    const incidentId = failed.deadLetter!.id;

    // Acknowledge incident
    const acknowledged = await service.acknowledgeDeadLetter(
      {
        incidentId,
        note: "Finance department contacted regarding tax rules",
      },
      "user-finance-admin",
    );

    expect(acknowledged.acknowledgedByUserId).toBe("user-finance-admin");
    expect(acknowledged.acknowledgementNote).toBe("Finance department contacted regarding tax rules");

    // Resolve incident as fixed
    const resolved = await service.resolveDeadLetter(
      {
        incidentId,
        resolution: "fixed",
        resolutionNote: "Tax config updated for session 2026",
      },
      "user-finance-admin",
    );

    expect(resolved.resolution).toBe("fixed");
    expect(resolved.resolutionNote).toBe("Tax config updated for session 2026");
    expect(resolved.resolvedByUserId).toBe("user-finance-admin");
  });

  it("replays a dead-lettered job by spawning a replacement job and linking IDs", async () => {
    const store = createFakeJobStore();
    const service = createJobService(store);

    const job = await store.createJob({
      jobType: "report_card_render",
      idempotencyKey: "rc:student-42",
      payload: { studentId: "std-42", examTerm: "Term 1" },
    });

    const failed = await store.failJob({
      jobId: job.id,
      workerId: "w-1",
      errorType: "timeout",
      errorMessage: "Renderer timed out after 300s",
      outcome: {
        outcome: "dead_letter",
        deadLetterReason: "Retries exhausted",
        deadLetteredAt: new Date(),
      },
      durationMs: 300_000,
    });

    const incidentId = failed.deadLetter!.id;

    const replayResult = await service.replayDeadLetter(
      {
        incidentId,
        reason: "Replaying after renderer timeout increased",
      },
      "operator-123",
    );

    expect(replayResult.replacementJob).toBeDefined();
    expect(replayResult.replacementJob.jobType).toBe("report_card_render");
    expect(replayResult.replacementJob.payload).toEqual({ studentId: "std-42", examTerm: "Term 1" });
    expect(replayResult.incident.resolution).toBe("replayed");
    expect(replayResult.incident.replayedAsJobId).toBe(replayResult.replacementJob.id);
  });

  it("registers recurring schedules with schema validation", async () => {
    const store = createFakeJobStore();
    const service = createJobService(store);

    const schedule = await service.registerSchedule({
      jobType: "cache_pruning",
      name: "Hourly Cache Prune",
      intervalSeconds: 3600,
      payloadTemplate: {},
    });

    expect(schedule.name).toBe("Hourly Cache Prune");
    expect(schedule.intervalSeconds).toBe(3600);

    const fetched = await service.getSchedule(schedule.id);
    expect(fetched.id).toBe(schedule.id);
  });

  it("throws NotFoundError when querying non-existent job or dead-letter", async () => {
    const store = createFakeJobStore();
    const service = createJobService(store);

    await expect(service.getJob("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      service.getDeadLetter("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(NotFoundError);
  });
});
