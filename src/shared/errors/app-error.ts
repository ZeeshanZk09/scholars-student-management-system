/**
 * Standardized application error model.
 *
 * Every error crossing a module or layer boundary is an `AppError`. The split matters:
 * `AppError` is what the domain and application layers throw and catch, while
 * `toClientError()` is the only projection allowed to reach a user. Internal detail
 * (stack, cause, database text) stays inside the server — see RULES.md section 35.
 */

export const ERROR_CODES = {
  /** Input failed boundary validation. */
  VALIDATION: "VALIDATION",
  /** No authenticated principal, or the session is missing/expired. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** Authenticated, but the principal lacks the required permission or scope. */
  FORBIDDEN: "FORBIDDEN",
  /** The addressed resource does not exist, or is not visible to this principal. */
  NOT_FOUND: "NOT_FOUND",
  /** The request collides with existing state (duplicate, stale write). */
  CONFLICT: "CONFLICT",
  /** A domain invariant or state-machine transition was violated. */
  BUSINESS_RULE: "BUSINESS_RULE",
  /** Unexpected failure. Never disclose its cause to a user. */
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Field-level messages, keyed by field path. Only ever set for VALIDATION. */
export type FieldErrors = Readonly<Record<string, readonly string[]>>;

/**
 * The only error shape that may cross the server boundary to a user.
 * Deliberately contains no `stack`, no `cause`, and no internal `details`.
 */
export interface ClientError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly fieldErrors?: FieldErrors;
}

export interface AppErrorOptions {
  /**
   * What happened and what the user can do next. Required — RULES.md section 35
   * forbids opaque user-facing errors.
   */
  readonly userMessage: string;
  /** Server-side context for logs. Must never contain secrets. */
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

/**
 * Options for a category that supplies its own default `userMessage`.
 * Callers may still override it, but are not forced to restate the default.
 */
export type DefaultableOptions = Omit<AppErrorOptions, "userMessage"> & {
  readonly userMessage?: string;
};

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;

  readonly userMessage: string;
  readonly details: Readonly<Record<string, unknown>>;

  protected constructor(message: string, options: AppErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.userMessage = options.userMessage;
    this.details = options.details ?? {};
    // Preserve the prototype chain when targeting ES2017 output.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Narrow, safe projection for transport to a user. */
  toClientError(): ClientError {
    return { code: this.code, message: this.userMessage };
  }
}

/** Resolve an optional `userMessage` against a category default. */
function withDefault(options: DefaultableOptions, fallback: string): AppErrorOptions {
  return {
    userMessage: options.userMessage ?? fallback,
    ...(options.cause === undefined ? {} : { cause: options.cause }),
    ...(options.details === undefined ? {} : { details: options.details }),
  };
}

const DEFAULT_MESSAGES = {
  VALIDATION:
    "Some of the information provided is not valid. Please review the highlighted fields and try again.",
  UNAUTHORIZED: "You need to sign in to continue. Please sign in and try again.",
  FORBIDDEN:
    "You do not have permission to perform this action. If you believe this is a mistake, contact an administrator.",
  NOT_FOUND:
    "The requested record could not be found. It may have been removed, or you may not have access to it.",
  CONFLICT: "This change conflicts with existing data. Refresh the page and try again.",
  INTERNAL:
    "Something went wrong on our side. Please try again. If the problem continues, contact an administrator.",
} as const;

export class ValidationError extends AppError {
  readonly code = ERROR_CODES.VALIDATION;
  readonly status = 400;

  readonly fieldErrors: FieldErrors;

  constructor(
    message: string,
    fieldErrors: FieldErrors,
    options: DefaultableOptions = {},
  ) {
    super(message, withDefault(options, DEFAULT_MESSAGES.VALIDATION));
    this.fieldErrors = fieldErrors;
  }

  override toClientError(): ClientError {
    return { code: this.code, message: this.userMessage, fieldErrors: this.fieldErrors };
  }
}

export class UnauthorizedError extends AppError {
  readonly code = ERROR_CODES.UNAUTHORIZED;
  readonly status = 401;

  constructor(message = "Not authenticated", options: DefaultableOptions = {}) {
    super(message, withDefault(options, DEFAULT_MESSAGES.UNAUTHORIZED));
  }
}

export class ForbiddenError extends AppError {
  readonly code = ERROR_CODES.FORBIDDEN;
  readonly status = 403;

  constructor(message = "Forbidden", options: DefaultableOptions = {}) {
    super(message, withDefault(options, DEFAULT_MESSAGES.FORBIDDEN));
  }
}

export class NotFoundError extends AppError {
  readonly code = ERROR_CODES.NOT_FOUND;
  readonly status = 404;

  constructor(message = "Not found", options: DefaultableOptions = {}) {
    super(message, withDefault(options, DEFAULT_MESSAGES.NOT_FOUND));
  }
}

export class ConflictError extends AppError {
  readonly code = ERROR_CODES.CONFLICT;
  readonly status = 409;

  constructor(message = "Conflict", options: DefaultableOptions = {}) {
    super(message, withDefault(options, DEFAULT_MESSAGES.CONFLICT));
  }
}

/**
 * A domain invariant or state-machine transition was violated. The message is
 * domain-specific, so there is no usable default.
 */
export class BusinessRuleError extends AppError {
  readonly code = ERROR_CODES.BUSINESS_RULE;
  readonly status = 422;

  constructor(
    message: string,
    options: Pick<AppErrorOptions, "userMessage" | "cause" | "details">,
  ) {
    super(message, options);
  }
}

export class InternalError extends AppError {
  readonly code = ERROR_CODES.INTERNAL;
  readonly status = 500;

  constructor(message = "Internal error", options: DefaultableOptions = {}) {
    super(message, withDefault(options, DEFAULT_MESSAGES.INTERNAL));
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Normalize any thrown value into a `ClientError`.
 *
 * Anything not already an `AppError` is treated as internal: its message and
 * stack are never surfaced, because an unknown throw may embed a database
 * error string or credential detail (RULES.md section 35).
 */
export function toClientError(value: unknown): ClientError {
  if (isAppError(value)) {
    return value.toClientError();
  }
  return new InternalError().toClientError();
}
