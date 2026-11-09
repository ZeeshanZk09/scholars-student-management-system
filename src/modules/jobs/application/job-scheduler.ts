/**
 * Background job scheduling engine (`PRD.md` MODULE 34, `RULES.md` §48–§49, `ARCHITECTURE.md` §33–§34).
 *
 * Self-hosted, application-controlled scheduling:
 * - Polls due recurring schedules
 * - Enforces catch-up policy (`skip` vs `fire_all`)
 * - Deduplicates enqueues via derived idempotency keys
 * - Advances schedules with atomic nextRunAt updates
 */
import {
  calculateNextScheduleRunAt,
  generateJobIdempotencyKey,
} from "../domain/job-rules";
import type { JobRow, JobStore } from "./ports";

export interface ScheduleDispatchItem {
  readonly scheduleId: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly nextRunAt: Date | null;
}

export interface ScheduleDispatchSummary {
  readonly evaluatedCount: number;
  readonly dispatchedCount: number;
  readonly items: readonly ScheduleDispatchItem[];
}

export interface JobScheduler {
  pollAndDispatchDueSchedules(now?: Date): Promise<ScheduleDispatchSummary>;
  triggerScheduleImmediately(scheduleId: string, now?: Date): Promise<JobRow>;
}

export function createJobScheduler(store: JobStore): JobScheduler {
  return {
    async pollAndDispatchDueSchedules(now: Date = new Date()): Promise<ScheduleDispatchSummary> {
      const dueSchedules = await store.listDueSchedules(now);
      const items: ScheduleDispatchItem[] = [];

      for (const schedule of dueSchedules) {
        const scheduleDueTimestamp = (schedule.nextRunAt ?? now).getTime();
        const idempotencyKey = generateJobIdempotencyKey(
          schedule.jobType,
          `sched:${schedule.id}:${scheduleDueTimestamp}`,
        );

        // Enqueue the recurring job
        const job = await store.createJob({
          institutionId: schedule.institutionId,
          jobType: schedule.jobType,
          idempotencyKey,
          payload: schedule.payloadTemplate,
          isRecurring: true,
          scheduleId: schedule.id,
          deduplicateScope: null,
          maxAttempts: schedule.maxAttempts,
        });

        // Compute next run timestamp
        const nextRunAt = calculateNextScheduleRunAt({
          cronExpression: schedule.cronExpression,
          intervalSeconds: schedule.intervalSeconds,
          fromTime: now,
          catchUpPolicy: schedule.catchUpPolicy,
          lastEnqueuedAt: schedule.lastEnqueuedAt,
        });

        // Advance schedule state
        await store.advanceSchedule(schedule.id, job.id, nextRunAt, now);

        items.push({
          scheduleId: schedule.id,
          jobId: job.id,
          jobType: schedule.jobType,
          nextRunAt,
        });
      }

      return {
        evaluatedCount: dueSchedules.length,
        dispatchedCount: items.length,
        items,
      };
    },

    async triggerScheduleImmediately(scheduleId: string, now: Date = new Date()): Promise<JobRow> {
      const schedule = await store.findScheduleById(scheduleId);
      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found.`);
      }

      const idempotencyKey = generateJobIdempotencyKey(
        schedule.jobType,
        `manual:${schedule.id}:${now.getTime()}`,
      );

      const job = await store.createJob({
        institutionId: schedule.institutionId,
        jobType: schedule.jobType,
        idempotencyKey,
        payload: schedule.payloadTemplate,
        isRecurring: true,
        scheduleId: schedule.id,
        deduplicateScope: null,
        maxAttempts: schedule.maxAttempts,
      });

      const nextRunAt = calculateNextScheduleRunAt({
        cronExpression: schedule.cronExpression,
        intervalSeconds: schedule.intervalSeconds,
        fromTime: now,
        catchUpPolicy: schedule.catchUpPolicy,
        lastEnqueuedAt: now,
      });

      await store.advanceSchedule(schedule.id, job.id, nextRunAt, now);
      return job;
    },
  };
}
