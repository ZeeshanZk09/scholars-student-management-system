/**
 * Audit event shape, per `RULES.md` section 34.
 *
 * "Important operations must be auditable" — login events, permission changes, user creation,
 * student deletion, attendance changes, result changes, fee changes, refunds and configuration
 * changes. Each audit record captures who, what, when, target, result and context.
 *
 * This module defines and validates the shape only. Persistence is a Phase 3 concern, and the
 * `AuditLog` table must be append-only — an audit record that can be updated is not an audit
 * record.
 */
import { ValidationError } from "../errors";
import { redact } from "./redact";

/**
 * The operations `RULES.md` section 34 requires to be auditable. Values are stable identifiers, not
 * prose: they are stored and queried.
 */
export const AUDIT_ACTIONS = {
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  LOGIN_FAILED: "auth.login.failed",
  PERMISSION_CHANGE: "auth.permission.change",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  STUDENT_DELETE: "student.delete",
  ATTENDANCE_CHANGE: "attendance.change",
  RESULT_CHANGE: "result.change",
  FEE_CHANGE: "fee.change",
  REFUND: "fee.refund",
  CONFIGURATION_CHANGE: "configuration.change",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_RESULTS = ["success", "failure", "denied"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export interface AuditEvent {
  /** Who acted. `system` for scheduled jobs, which have no user. */
  readonly actorId: string | null;
  readonly actorRole: string | null;
  readonly action: AuditAction;
  /** When, as an ISO-8601 UTC instant. */
  readonly occurredAt: string;
  /** What was affected, e.g. `student:STU-2026-0001`. */
  readonly targetType: string;
  readonly targetId: string;
  readonly result: AuditResult;
  /** Additional context, already redacted. */
  readonly context: Readonly<Record<string, unknown>>;
  /** Ties the record to the log lines and request that produced it. */
  readonly correlationId: string | null;
}

export interface AuditEventInput {
  readonly actorId?: string | null;
  readonly actorRole?: string | null;
  readonly action: AuditAction;
  readonly targetType: string;
  readonly targetId: string;
  readonly result: AuditResult;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string | null;
  readonly occurredAt?: Date;
}

const SYSTEM_ACTOR = "system";

function required(field: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new ValidationError(`Audit event is missing ${field}`, {
      [field]: ["This field is required on an audit record."],
    });
  }
  return trimmed;
}

/**
 * Build an audit event, rejecting records that could not answer "who did what to what".
 *
 * `actorId` is the one exception: a scheduled job legitimately has no user, and is recorded as
 * `system` so the record is still attributable.
 */
export function createAuditEvent(input: AuditEventInput): AuditEvent {
  const actorId = input.actorId?.trim();

  return {
    actorId: actorId !== undefined && actorId.length > 0 ? actorId : SYSTEM_ACTOR,
    actorRole: input.actorRole?.trim() ?? null,
    action: required("action", input.action) as AuditAction,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    targetType: required("targetType", input.targetType),
    targetId: required("targetId", input.targetId),
    result: required("result", input.result) as AuditResult,
    context: redact(input.context ?? {}) as Readonly<Record<string, unknown>>,
    correlationId: input.correlationId?.trim() ?? null,
  };
}
