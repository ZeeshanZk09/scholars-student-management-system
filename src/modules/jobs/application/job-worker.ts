/**
 * Background job worker and execution engine (`PRD.md` MODULE 34, `RULES.md` §48–§49, `ARCHITECTURE.md` §33–§34).
 *
 * Coordinates:
 * 1. Handler registry & lifecycle invocation
 * 2. Visibility timeout lease enforcement & heartbeat maintenance
 * 3. Linear & exponential retry backoff
 * 4. Error classification & dead-letter incident routing
 * 5. Append-only run logging per attempt
 * 6. Abandoned job reclamation
 */
import {
  classifyJobError,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  determineFailureOutcome,
} from "../domain/job-rules";
import type {
  JobExecutionContext,
  JobHandler,
  JobProcessResult,
  JobRow,
  JobStore,
  JobWorker,
} from "./ports";

export function createJobWorker(
  store: JobStore,
  options?: { readonly workerId?: string },
): JobWorker {
  const workerId = options?.workerId ?? `worker-${crypto.randomUUID().slice(0, 8)}`;
  const handlers = new Map<string, JobHandler<Record<string, unknown>>>();

  return {
    workerId,

    registerHandler<T = Record<string, unknown>>(
      jobType: string,
      handler: JobHandler<T>,
    ): void {
      handlers.set(jobType, handler as unknown as JobHandler<Record<string, unknown>>);
    },

    hasHandler(jobType: string): boolean {
      return handlers.has(jobType);
    },

    async processJob(job: JobRow): Promise<JobProcessResult> {
      const attemptNumber = job.attemptCount + 1;
      const startTime = Date.now();
      const logLines: Array<{
        level: string;
        message: string;
        at: string;
        data?: Record<string, unknown>;
      }> = [];

      const log = (level: string, message: string, data?: Record<string, unknown>): void => {
        logLines.push({
          level,
          message,
          at: new Date().toISOString(),
          ...(data ? { data } : {}),
        });
      };

      const heartbeat = async (): Promise<void> => {
        await store.heartbeatJob(job.id, workerId);
      };

      // Check if handler is registered for this job type
      const handler = handlers.get(job.jobType);
      if (!handler) {
        const errorMessage = `No registered worker handler for job type '${job.jobType}'.`;
        const durationMs = Date.now() - startTime;

        const failureOutcome = determineFailureOutcome({
          attemptCount: attemptNumber,
          maxAttempts: job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          errorType: "validation",
          errorMessage,
          baseBackoffMs: DEFAULT_RETRY_BACKOFF_MS,
          isExponential: false,
        });

        await store.failJob({
          jobId: job.id,
          workerId,
          errorType: "validation",
          errorMessage,
          outcome: failureOutcome,
          durationMs,
        });

        await store.recordJobRun({
          jobId: job.id,
          attemptNumber,
          workerId,
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          durationMs,
          succeeded: false,
          errorType: "validation",
          errorMessage,
          logLines,
          correlationId: job.correlationId ?? undefined,
        });

        return {
          jobId: job.id,
          jobType: job.jobType,
          attemptNumber,
          succeeded: false,
          status: "dead_letter",
          durationMs,
          error: {
            type: "validation",
            message: errorMessage,
          },
        };
      }

      // Lookup definition defaults for backoff and retry limits
      const definition = await store.findJobDefinition(job.jobType);
      const maxAttempts = job.maxAttempts ?? definition?.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      const baseBackoffMs = definition?.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
      const isExponential = definition?.retryBackoffIsExponential ?? false;
      const timeoutMs = job.visibilityTimeoutMs;

      try {
        const context: JobExecutionContext = {
          jobId: job.id,
          jobType: job.jobType,
          payload: job.payload,
          attemptNumber,
          institutionId: job.institutionId,
          correlationId: job.correlationId,
          heartbeat,
          log,
        };

        // Enforce visibility timeout ceiling
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Job execution timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        });

        const handlerPromise = Promise.resolve(handler(context));
        const resultOrVoid = await Promise.race([handlerPromise, timeoutPromise]).finally(() => {
          if (timer) clearTimeout(timer);
        });

        const durationMs = Math.max(0, Date.now() - startTime);
        const result =
          typeof resultOrVoid === "object" && resultOrVoid !== null
            ? (resultOrVoid as Record<string, unknown>)
            : undefined;

        await store.completeJob({
          jobId: job.id,
          workerId,
          result,
          durationMs,
        });

        await store.recordJobRun({
          jobId: job.id,
          attemptNumber,
          workerId,
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          durationMs,
          succeeded: true,
          result,
          logLines,
          correlationId: job.correlationId ?? undefined,
        });

        return {
          jobId: job.id,
          jobType: job.jobType,
          attemptNumber,
          succeeded: true,
          status: "completed",
          durationMs,
          result,
        };
      } catch (err: unknown) {
        const durationMs = Math.max(0, Date.now() - startTime);
        const classified = classifyJobError(err);

        const failureOutcome = determineFailureOutcome({
          attemptCount: attemptNumber,
          maxAttempts,
          errorType: classified.type,
          errorMessage: classified.message,
          baseBackoffMs,
          isExponential,
        });

        await store.failJob({
          jobId: job.id,
          workerId,
          errorType: classified.type,
          errorMessage: classified.message,
          errorStack: classified.stack,
          outcome: failureOutcome,
          durationMs,
        });

        await store.recordJobRun({
          jobId: job.id,
          attemptNumber,
          workerId,
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          durationMs,
          succeeded: false,
          errorType: classified.type,
          errorMessage: classified.message,
          errorStack: classified.stack,
          logLines,
          correlationId: job.correlationId ?? undefined,
        });

        return {
          jobId: job.id,
          jobType: job.jobType,
          attemptNumber,
          succeeded: false,
          status: failureOutcome.outcome === "dead_letter" ? "dead_letter" : "failed",
          durationMs,
          error: {
            type: classified.type,
            message: classified.message,
            ...(classified.stack ? { stack: classified.stack } : {}),
          },
        };
      }
    },

    async processNextJobs(limit: number = 10): Promise<readonly JobProcessResult[]> {
      const claimedJobs = await store.claimJobs({
        workerId,
        limit,
      });

      const results: JobProcessResult[] = [];
      for (const job of claimedJobs) {
        const result = await this.processJob(job);
        results.push(result);
      }

      return results;
    },

    async reclaimAbandonedJobs(): Promise<number> {
      return store.reclaimStaleClaims();
    },
  };
}
