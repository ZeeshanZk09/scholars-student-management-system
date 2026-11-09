/**
 * Structured logger, per `RULES.md` section 36: structured logging where practical, with useful
 * context and no sensitive information.
 *
 * Emits one JSON object per event so log aggregation can index fields, and carries a correlation ID
 * through every event of a request. Every value passes through `redact` on the way out, so a
 * forgotten field name cannot leak a token.
 */
import { isAppError, toClientError } from "../errors";
import { redact } from "./redact";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogFields = Readonly<Record<string, unknown>>;

/** A single emitted event, before it becomes a JSON line. */
export interface LogEvent {
  readonly level: LogLevel;
  /** Dotted event name, e.g. `fee.payment.recorded`. Stable and greppable. */
  readonly event: string;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly context: LogFields;
  readonly fields: LogFields;
}

/** Where formatted events go. Injectable so tests never print and production can use a real sink. */
export type LogSink = (line: string, event: LogEvent) => void;

export const defaultSink: LogSink = (line) => {
  console.log(line);
};

let sequence = 0;

/**
 * A correlation ID for one unit of work (a request, a job run, a test).
 *
 * Prefixed so an ID is identifiable by eye in a log, and monotonic within the process so IDs sort in
 * issue order.
 */
export function newCorrelationId(prefix = "req"): string {
  sequence += 1;
  const time = Date.now().toString(36);
  const counter = sequence.toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}_${counter}_${random}`;
}

export interface Logger {
  readonly level: LogLevel;
  readonly correlationId: string;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Derive a logger that adds `context` to every event, keeping level, sink and correlation ID. */
  child(context: LogFields, correlationId?: string): Logger;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly sink: LogSink;
  readonly correlationId: string;
  readonly context: LogFields;
  /** Injectable for deterministic tests. */
  readonly now: () => Date;
}

export function createLogger(options: Partial<LoggerOptions> = {}): Logger {
  const level = options.level ?? "info";
  const sink = options.sink ?? defaultSink;
  const correlationId = options.correlationId ?? newCorrelationId();
  const context = options.context ?? {};
  const now = options.now ?? (() => new Date());
  const threshold = LEVEL_RANK[level];

  function write(candidate: LogLevel, event: string, fields: LogFields): void {
    if (LEVEL_RANK[candidate] < threshold) return;

    const record: LogEvent = {
      level: candidate,
      event,
      timestamp: now().toISOString(),
      correlationId,
      context: redact(context) as LogFields,
      fields: redact(fields) as LogFields,
    };

    sink(JSON.stringify(record), record);
  }

  return {
    level,
    correlationId,
    debug: (event, fields = {}) => write("debug", event, fields),
    info: (event, fields = {}) => write("info", event, fields),
    warn: (event, fields = {}) => write("warn", event, fields),
    error: (event, fields = {}) => write("error", event, fields),
    child: (extra, nextCorrelationId) =>
      createLogger({
        level,
        sink,
        correlationId: nextCorrelationId ?? correlationId,
        context: { ...context, ...extra },
        now,
      }),
  };
}

/**
 * Reduce a thrown value to something safe to log.
 *
 * An `AppError` keeps its code and category, which is what makes a failure searchable. The internal
 * message and stack stay server-side. Anything else is reduced to its constructor name, because an
 * unknown throw may be a database error carrying a connection string.
 */
export function loggableError(value: unknown): LogFields {
  if (isAppError(value)) {
    return { errorType: value.name, errorCode: value.code, errorMessage: value.message };
  }
  if (value instanceof Error) {
    return { errorType: value.name, errorMessage: value.message };
  }
  return { errorType: typeof value, errorMessage: String(value) };
}

export { toClientError };
