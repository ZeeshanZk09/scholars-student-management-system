/**
 * Domain rules, state machine, and pure business logic for SMTP email infrastructure.
 *
 * `PRD.md` MODULE 28 & `RULES.md` §46, §47.
 * Layer rules (`src/modules/README.md`): Pure domain logic. May only import from `shared/`.
 */

import { BusinessRuleError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Domain Types                                                               */
/* -------------------------------------------------------------------------- */

export type EmailStatus = "queued" | "sending" | "sent" | "failed" | "suppressed";

export type EmailEventType =
  | "accepted"
  | "deferred"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked";

export type EmailContentType = "html" | "plain_text";

export interface BounceClassification {
  readonly category:
    | "accepted"
    | "hard_bounce"
    | "soft_bounce"
    | "transient_error"
    | "rate_limit"
    | "auth_failure"
    | "connection_failure"
    | "unknown";
  readonly isHardBounce: boolean;
  readonly isPermanent: boolean;
  readonly shouldRetry: boolean;
  readonly description: string;
}

/* -------------------------------------------------------------------------- */
/* Delivery Status State Machine                                              */
/* -------------------------------------------------------------------------- */

/**
 * Legal state transitions for email outbox delivery status (`email_messages.status`).
 *
 * Rules:
 * - `queued` can move to `sending`, `suppressed` (if recipient opted out/suppressed), or `failed`.
 * - `sending` can move to `sent` (SMTP 250 accepted), `failed` (hard error or retry exhausted),
 *   `queued` (transient failure requiring backoff retry), or `suppressed`.
 * - `failed` can move to `queued` (manual re-queue or authorized replay).
 * - `sent` is terminal.
 * - `suppressed` is terminal.
 */
const LEGAL_STATUS_TRANSITIONS: Readonly<Record<EmailStatus, readonly EmailStatus[]>> = {
  queued: ["sending", "suppressed", "failed"],
  sending: ["sent", "failed", "queued", "suppressed"],
  failed: ["queued"],
  sent: [],
  suppressed: [],
};

/**
 * Check whether a status transition is permitted by domain invariants.
 */
export function canTransitionEmailStatus(from: EmailStatus, to: EmailStatus): boolean {
  if (from === to) return true;
  const allowed = LEGAL_STATUS_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

/**
 * Enforce a status transition, throwing a BusinessRuleError if forbidden.
 */
export function transitionEmailStatus(from: EmailStatus, to: EmailStatus): EmailStatus {
  if (!canTransitionEmailStatus(from, to)) {
    const message = `Illegal email status transition from '${from}' to '${to}'.`;
    throw new BusinessRuleError(message, { userMessage: message });
  }
  return to;
}

/* -------------------------------------------------------------------------- */
/* Template Variable Substitution                                             */
/* -------------------------------------------------------------------------- */

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Extract all variable names from a template string (e.g. `{{student_name}}` -> `"student_name"`).
 */
export function extractTemplateVariables(template: string): readonly string[] {
  const matches = new Set<string>();
  const regex = new RegExp(VARIABLE_REGEX.source, "g");
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(template)) !== null) {
    const varName = match[1];
    if (varName !== undefined && varName.length > 0) {
      matches.add(varName);
    }
  }
  return Array.from(matches);
}

/**
 * Substitute variables into a template string safely.
 *
 * If a variable is present in `variables`, its string representation is inserted.
 * If a variable is null, undefined, or missing, it evaluates to an empty string.
 */
export function renderTemplate(
  template: string,
  variables: Readonly<Record<string, unknown>>,
): string {
  return template.replace(VARIABLE_REGEX, (_fullMatch, varName: string) => {
    const val = variables[varName];
    if (val === null || val === undefined) {
      return "";
    }
    return String(val);
  });
}

/**
 * Verify whether all required variables declared by a template are supplied.
 */
export function validateTemplateSubstitution(
  template: {
    readonly requiredVariables: readonly string[];
  },
  variables: Readonly<Record<string, unknown>>,
): { readonly isValid: boolean; readonly missingVariables: readonly string[] } {
  const missing: string[] = [];
  for (const reqVar of template.requiredVariables) {
    const val = variables[reqVar];
    if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
      missing.push(reqVar);
    }
  }
  return {
    isValid: missing.length === 0,
    missingVariables: missing,
  };
}

/* -------------------------------------------------------------------------- */
/* Bounce Handling & SMTP Diagnostics Classification                          */
/* -------------------------------------------------------------------------- */

/**
 * Classify an SMTP status code, error code, or provider message to determine
 * whether a delivery failure is transient (retryable) or permanent (hard bounce).
 *
 * Conforms to RFC 5321 and RFC 3463 Enhanced Mail System Status Codes:
 * - 2xx: Success / accepted
 * - 4xx: Persistent transient failure (greylisting, mailbox busy, system storage, network timeout)
 * - 5xx: Permanent failure (user unknown, invalid domain, syntax error, authentication rejection)
 */
export function classifyBounce(
  providerCode?: string | number | null,
  providerMessage?: string | null,
): BounceClassification {
  const codeStr = providerCode !== undefined && providerCode !== null ? String(providerCode).trim() : "";
  const messageStr = providerMessage ? providerMessage.toLowerCase() : "";

  // 1. Check network / socket errors
  if (
    codeStr === "ECONNREFUSED" ||
    codeStr === "ETIMEDOUT" ||
    codeStr === "ENOTFOUND" ||
    codeStr === "EAI_AGAIN" ||
    codeStr === "ECONNRESET" ||
    codeStr === "EHOSTUNREACH" ||
    codeStr === "ENETUNREACH" ||
    messageStr.includes("econnrefused") ||
    messageStr.includes("etimedout") ||
    messageStr.includes("enotfound") ||
    messageStr.includes("econnreset") ||
    messageStr.includes("timed out") ||
    messageStr.includes("timeout") ||
    messageStr.includes("connection closed") ||
    messageStr.includes("connection refused") ||
    messageStr.includes("network unreachable") ||
    messageStr.includes("host unreachable")
  ) {
    return {
      category: "connection_failure",
      isHardBounce: false,
      isPermanent: false,
      shouldRetry: true,
      description: "Connection or network timeout reaching SMTP server.",
    };
  }

  // 2. Parse numeric SMTP code (e.g. "250", "421", "550", or "550 5.1.1")
  const numericMatch = codeStr.match(/\b([245]\d{2})\b/) ?? messageStr.match(/\b([245]\d{2})\b/);
  const numericCode = numericMatch ? Number(numericMatch[1]) : null;

  if (numericCode !== null) {
    // 2xx - Accepted
    if (numericCode >= 200 && numericCode < 300) {
      return {
        category: "accepted",
        isHardBounce: false,
        isPermanent: false,
        shouldRetry: false,
        description: "Message accepted by remote SMTP server.",
      };
    }

    // 4xx - Soft Bounce / Transient
    if (numericCode >= 400 && numericCode < 500) {
      switch (numericCode) {
        case 421:
          return {
            category: "transient_error",
            isHardBounce: false,
            isPermanent: false,
            shouldRetry: true,
            description: "Service not available, closing transmission channel.",
          };
        case 450:
          return {
            category: "soft_bounce",
            isHardBounce: false,
            isPermanent: false,
            shouldRetry: true,
            description: "Mailbox unavailable or busy; retry later.",
          };
        case 451:
          return {
            category: "transient_error",
            isHardBounce: false,
            isPermanent: false,
            shouldRetry: true,
            description: "Local error in processing or greylisted.",
          };
        case 452:
          return {
            category: "rate_limit",
            isHardBounce: false,
            isPermanent: false,
            shouldRetry: true,
            description: "Insufficient system storage or temporary rate limit.",
          };
        default:
          return {
            category: "soft_bounce",
            isHardBounce: false,
            isPermanent: false,
            shouldRetry: true,
            description: `Transient SMTP failure (code ${numericCode}).`,
          };
      }
    }

    // 5xx - Hard Bounce / Permanent
    if (numericCode >= 500 && numericCode < 600) {
      if (numericCode === 535) {
        return {
          category: "auth_failure",
          isHardBounce: false,
          isPermanent: true,
          shouldRetry: false,
          description: "SMTP authentication failed. Check credentials.",
        };
      }

      switch (numericCode) {
        case 550:
          return {
            category: "hard_bounce",
            isHardBounce: true,
            isPermanent: true,
            shouldRetry: false,
            description: "Mailbox unavailable or address not found (hard bounce).",
          };
        case 551:
          return {
            category: "hard_bounce",
            isHardBounce: true,
            isPermanent: true,
            shouldRetry: false,
            description: "User not local; recipient rejected.",
          };
        case 552:
          return {
            category: "hard_bounce",
            isHardBounce: true,
            isPermanent: true,
            shouldRetry: false,
            description: "Exceeded storage allocation.",
          };
        case 553:
          return {
            category: "hard_bounce",
            isHardBounce: true,
            isPermanent: true,
            shouldRetry: false,
            description: "Mailbox name not allowed or invalid syntax.",
          };
        case 554:
          return {
            category: "hard_bounce",
            isHardBounce: true,
            isPermanent: true,
            shouldRetry: false,
            description: "Transaction failed / message rejected.",
          };
        default:
          return {
            category: "hard_bounce",
            isHardBounce: true,
            isPermanent: true,
            shouldRetry: false,
            description: `Permanent SMTP failure (code ${numericCode}).`,
          };
      }
    }
  }

  // 3. Fallback heuristic from message text
  if (
    messageStr.includes("auth") ||
    messageStr.includes("credential") ||
    messageStr.includes("bad username")
  ) {
    return {
      category: "auth_failure",
      isHardBounce: false,
      isPermanent: true,
      shouldRetry: false,
      description: "SMTP Authentication failure.",
    };
  }

  if (
    messageStr.includes("rate") ||
    messageStr.includes("throttle") ||
    messageStr.includes("too many")
  ) {
    return {
      category: "rate_limit",
      isHardBounce: false,
      isPermanent: false,
      shouldRetry: true,
      description: "Rate limit encountered.",
    };
  }

  return {
    category: "unknown",
    isHardBounce: false,
    isPermanent: false,
    shouldRetry: true,
    description: providerMessage ?? "Unknown email transport error.",
  };
}

/* -------------------------------------------------------------------------- */
/* Retry & Backoff Calculation                                                */
/* -------------------------------------------------------------------------- */

export interface RetryCalculationOptions {
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly baseDelaySeconds?: number;
  readonly maxDelaySeconds?: number;
}

/**
 * Compute the next attempt timestamp using exponential backoff:
 * `delay = min(baseDelay * 2^(attempt - 1), maxDelay)`
 *
 * If `attemptCount >= maxAttempts`, returns `null` (retries exhausted).
 */
export function calculateNextRetryAttempt(options: RetryCalculationOptions): Date | null {
  const {
    attemptCount,
    maxAttempts,
    baseDelaySeconds = 60,
    maxDelaySeconds = 86400, // 24 hours
  } = options;

  if (attemptCount >= maxAttempts) {
    return null;
  }

  const exponent = Math.max(0, attemptCount - 1);
  const delaySec = Math.min(baseDelaySeconds * Math.pow(2, exponent), maxDelaySeconds);
  return new Date(Date.now() + delaySec * 1000);
}

/* -------------------------------------------------------------------------- */
/* Idempotency Key Formulation                                                */
/* -------------------------------------------------------------------------- */

export interface IdempotencyKeyParams {
  readonly eventKey: string;
  readonly relatedEntityId?: string | null;
  readonly toEmail: string;
}

/**
 * Deterministically generate an idempotency key bounded by varchar(160).
 *
 * `RULES.md` §47: Idempotency is derived from the business event so retries
 * and replays do not produce duplicate emails.
 */
export function generateEmailIdempotencyKey(params: IdempotencyKeyParams): string {
  const normalizedEmail = params.toEmail.trim().toLowerCase();
  const entityPart = params.relatedEntityId ?? "none";
  const rawKey = `${params.eventKey}:${entityPart}:${normalizedEmail}`;
  if (rawKey.length <= 160) {
    return rawKey;
  }
  return rawKey.slice(0, 160);
}

/* -------------------------------------------------------------------------- */
/* Suppression List Inspection                                                */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether a recipient address is in the suppression list.
 */
export function isEmailSuppressed(
  email: string,
  suppressedList: readonly string[],
): boolean {
  const normalized = email.trim().toLowerCase();
  return suppressedList.some((item) => item.trim().toLowerCase() === normalized);
}
