/**
 * Unit tests for recurring schedule evaluation and dispatching in {@link JobScheduler}.
 */
import { describe, expect, it } from "vitest";

import { createFakeJobStore } from "./testing/fakes";
import { createJobScheduler } from "./job-scheduler";

describe("JobScheduler loop & recurrence", () => {
  it("dispatches due schedules and advances their nextRunAt", async () => {
    const store = createFakeJobStore();
    const scheduler = createJobScheduler(store);

    const now = new Date("2026-10-30T10:00:00.000Z");

    // Register an interval schedule (every 300s = 5m)
    const schedule = await store.createSchedule({
      jobType: "biometric_sync",
      name: "Sync Biometric Logs",
      intervalSeconds: 300,
      payloadTemplate: { deviceId: "zk-k50" },
      timezone: "UTC",
      isActive: true,
      catchUpPolicy: "skip",
    });

    // Schedule nextRunAt is initialized to creation time (which is now)
    const summary = await scheduler.pollAndDispatchDueSchedules(now);

    expect(summary.evaluatedCount).toBe(1);
    expect(summary.dispatchedCount).toBe(1);
    expect(summary.items[0]?.jobType).toBe("biometric_sync");

    // Verify job created in store
    const createdJob = await store.findJobById(summary.items[0]!.jobId);
    expect(createdJob).toBeDefined();
    expect(createdJob?.isRecurring).toBe(true);
    expect(createdJob?.scheduleId).toBe(schedule.id);
    expect(createdJob?.deduplicateScope).toBeNull();
    expect(createdJob?.payload).toEqual({ deviceId: "zk-k50" });

    // Verify schedule advanced: next run should be now + 300s
    const advancedSchedule = await store.findScheduleById(schedule.id);
    expect(advancedSchedule?.lastJobId).toBe(createdJob?.id);
    expect(advancedSchedule?.lastEnqueuedAt).toBe(now);
    expect(advancedSchedule?.nextRunAt?.toISOString()).toBe("2026-10-30T10:05:00.000Z");

    // Polling again immediately should find zero due schedules
    const secondPoll = await scheduler.pollAndDispatchDueSchedules(now);
    expect(secondPoll.dispatchedCount).toBe(0);
  });

  it("handles standard cron expressions for schedules", async () => {
    const store = createFakeJobStore();
    const scheduler = createJobScheduler(store);

    const pollTime = new Date("2026-10-30T06:59:00.000Z");

    // Every day at 07:00 UTC
    const schedule = await store.createSchedule({
      jobType: "daily_attendance_summary",
      name: "Daily Morning Attendance",
      cronExpression: "0 7 * * *",
      timezone: "UTC",
      isActive: true,
      payloadTemplate: {},
      catchUpPolicy: "skip",
    });

    const summary = await scheduler.pollAndDispatchDueSchedules(pollTime);
    expect(summary.dispatchedCount).toBe(1);

    const updated = await store.findScheduleById(schedule.id);
    // Next run should be 07:00 UTC
    expect(updated?.nextRunAt?.toISOString()).toBe("2026-10-30T07:00:00.000Z");
  });

  it("does not dispatch inactive schedules", async () => {
    const store = createFakeJobStore();
    const scheduler = createJobScheduler(store);

    await store.createSchedule({
      jobType: "nightly_cleanup",
      name: "Nightly Cleanup",
      intervalSeconds: 600,
      isActive: false,
      timezone: "UTC",
      payloadTemplate: {},
      catchUpPolicy: "skip",
    });

    const summary = await scheduler.pollAndDispatchDueSchedules();
    expect(summary.evaluatedCount).toBe(0);
    expect(summary.dispatchedCount).toBe(0);
  });

  it("allows immediate manual trigger of a schedule", async () => {
    const store = createFakeJobStore();
    const scheduler = createJobScheduler(store);

    const schedule = await store.createSchedule({
      jobType: "manual_export",
      name: "Manual Export",
      intervalSeconds: 3600,
      payloadTemplate: { format: "csv" },
      timezone: "UTC",
      isActive: true,
      catchUpPolicy: "skip",
    });

    const job = await scheduler.triggerScheduleImmediately(schedule.id);
    expect(job).toBeDefined();
    expect(job.jobType).toBe("manual_export");
    expect(job.isRecurring).toBe(true);
    expect(job.scheduleId).toBe(schedule.id);
  });
});
