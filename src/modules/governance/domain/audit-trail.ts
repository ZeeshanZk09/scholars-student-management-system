/**
 * Audit trail domain rules and formatting (`PRD.md` MODULE 31, `ARCHITECTURE.md` §30).
 *
 * Pure business rules for recording, verifying, and presenting audit logs.
 * Immutable: an audit event record cannot be updated, rewritten, or deleted.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import { AUDIT_ACTIONS, AUDIT_RESULTS, type AuditAction, type AuditResult } from "@/shared/logging/audit";
import { redact } from "@/shared/logging/redact";

export { AUDIT_ACTIONS, AUDIT_RESULTS, type AuditAction, type AuditResult };

/** Extended governance actions that augment the baseline AUDIT_ACTIONS. */
export const GOVERNANCE_AUDIT_ACTIONS = {
  ...AUDIT_ACTIONS,
  STUDENT_CREATE: "student.create",
  STUDENT_UPDATE: "student.update",
  ATTENDANCE_MARK: "attendance.mark",
  ATTENDANCE_SESSION_OPEN: "attendance.session.open",
  EXAM_RESULT_ENTER: "result.enter",
  EXAM_RESULT_PUBLISH: "result.publish",
  FEE_INVOICE_CREATE: "fee.invoice.create",
  FEE_PAYMENT_RECORD: "fee.payment.record",
  FEE_ADJUST: "fee.adjust",
  SALARY_CALCULATE: "salary.calculate",
  SALARY_OVERRIDE: "salary.override",
  PAYROLL_APPROVE: "payroll.approve",
  PAYROLL_PROCESS: "payroll.process",
  CONFIGURATION_OVERRIDE: "configuration.override",
  CONFIGURATION_RESET: "configuration.reset",
} as const;

export type GovernanceAuditAction =
  (typeof GOVERNANCE_AUDIT_ACTIONS)[keyof typeof GOVERNANCE_AUDIT_ACTIONS];

/** High-priority audit target entities as listed in MODULE 31. */
export const AUDIT_TARGET_TYPES = [
  "student",
  "fee_invoice",
  "fee_payment",
  "salary_record",
  "payroll_slip",
  "attendance_mark",
  "attendance_session",
  "exam_mark",
  "user_permission",
  "user_account",
  "system_setting",
  "institution",
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number] | (string & {});

/** Plain domain representation of an immutable audit event. */
export interface AuditRecord {
  readonly id: string;
  readonly institutionId: string | null;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string;
  readonly action: string;
  readonly result: AuditResult;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: Date;
  readonly beforeState: Record<string, unknown> | null;
  readonly afterState: Record<string, unknown> | null;
  readonly context: Record<string, unknown> | null;
  readonly correlationId: string | null;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly isImmutable: boolean;
}

/** Input contract for appending a new audit event. */
export interface NewAuditEventInput {
  readonly institutionId?: string | null;
  readonly actorUserId?: string | null;
  readonly actorDisplayName?: string | null;
  readonly action: string;
  readonly result: AuditResult;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt?: Date;
  readonly beforeState?: Record<string, unknown> | null;
  readonly afterState?: Record<string, unknown> | null;
  readonly context?: Record<string, unknown> | null;
  readonly correlationId?: string | null;
  readonly requestId?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

/**
 * Validates domain rules for an audit event prior to persistence.
 *
 * Invariants enforced:
 * 1. Action, targetType, and targetId cannot be blank.
 * 2. Result must be a recognized audit result status.
 * 3. Either an actorUserId or an actorDisplayName must be present (e.g. "system").
 * 4. Must provide either beforeState, afterState, or belong to login/logout actions.
 * 5. Sensitive data inside states and context is automatically redacted.
 */
export function validateAuditEvent(input: NewAuditEventInput): {
  readonly actorDisplayName: string;
  readonly beforeState: Record<string, unknown> | null;
  readonly afterState: Record<string, unknown> | null;
  readonly context: Record<string, unknown> | null;
} {
  const action = input.action?.trim();
  if (!action || action.length === 0) {
    throw new ValidationError("Audit action is required", {
      action: ["Audit event must have a defined action."],
    });
  }

  const targetType = input.targetType?.trim();
  const targetId = input.targetId?.trim();
  if (!targetType || targetType.length === 0 || !targetId || targetId.length === 0) {
    throw new ValidationError("Audit target is required", {
      target: ["Audit event must have a valid target type and target identifier."],
    });
  }

  if (!AUDIT_RESULTS.includes(input.result)) {
    throw new ValidationError("Invalid audit result", {
      result: [`Result must be one of: ${AUDIT_RESULTS.join(", ")}.`],
    });
  }

  const actorUserId = input.actorUserId?.trim();
  const actorDisplayName = input.actorDisplayName?.trim() || (actorUserId ? "User" : "system");

  const hasBefore = input.beforeState !== null && input.beforeState !== undefined;
  const hasAfter = input.afterState !== null && input.afterState !== undefined;
  const isAuthAction = action === "auth.login" || action === "auth.logout" || action === "auth.login.failed";

  if (!hasBefore && !hasAfter && !isAuthAction) {
    throw new BusinessRuleError(
      "Audit event must capture state transition (beforeState or afterState) for non-session actions.",
      {
        userMessage:
          "Audit event must capture what changed (previous or new state) for this operation.",
      },
    );
  }

  // Sanitize states and context using standard redaction rules
  const sanitizedBefore = hasBefore ? (redact(input.beforeState!) as Record<string, unknown>) : null;
  const sanitizedAfter = hasAfter ? (redact(input.afterState!) as Record<string, unknown>) : null;
  const sanitizedContext = input.context ? (redact(input.context) as Record<string, unknown>) : null;

  return {
    actorDisplayName,
    beforeState: sanitizedBefore,
    afterState: sanitizedAfter,
    context: sanitizedContext,
  };
}

/**
 * Enforces audit trail immutability.
 * Calling update or delete on an audit log is a structural violation of governance principles.
 */
export function assertAuditTrailImmutable(operation: "insert" | "update" | "delete"): void {
  if (operation !== "insert") {
    throw new BusinessRuleError(
      `Audit logs are strictly immutable: ${operation} operations are forbidden by System Governance rules.`,
      {
        userMessage:
          "Audit trail records are permanent and immutable. Changes or deletions are not permitted by system policy.",
      },
    );
  }
}

/**
 * Formats an audit action into a natural, human-readable sentence for non-technical users.
 * Avoids database jargon, UUIDs, and cryptic codes.
 */
export function formatAuditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "auth.login": "User Sign In",
    "auth.logout": "User Sign Out",
    "auth.login.failed": "Failed Sign In Attempt",
    "auth.permission.change": "Permission Role Modification",
    "user.create": "Account Created",
    "user.update": "Account Updated",
    "student.create": "Student Enrolled",
    "student.update": "Student Profile Updated",
    "student.delete": "Student Record Removed",
    "attendance.mark": "Attendance Marked",
    "attendance.change": "Attendance Record Corrected",
    "attendance.session.open": "Attendance Register Opened",
    "result.enter": "Exam Marks Entered",
    "result.change": "Exam Marks Corrected",
    "result.publish": "Exam Results Published",
    "fee.invoice.create": "Fee Voucher Issued",
    "fee.payment.record": "Fee Payment Recorded",
    "fee.change": "Fee Structure Modified",
    "fee.adjust": "Manual Fee Adjustment",
    "fee.refund": "Fee Payment Refunded",
    "salary.calculate": "Payroll Calculated",
    "salary.override": "Manual Salary Adjustment",
    "payroll.approve": "Payroll Approved",
    "payroll.process": "Salary Disbursed",
    "configuration.change": "System Setting Updated",
    "configuration.override": "Institution Setting Overridden",
    "configuration.reset": "Setting Restored to Default",
  };

  return labels[action] ?? action.replace(/_/g, " ").replace(/\./g, " — ");
}

/**
 * Produces a clear, readable description of the change without technical jargon.
 */
export function formatAuditDescription(event: {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly beforeState?: Record<string, unknown> | null;
  readonly afterState?: Record<string, unknown> | null;
  readonly context?: Record<string, unknown> | null;
}): string {
  const actionLabel = formatAuditActionLabel(event.action);

  if (event.action === "configuration.change" || event.action === "configuration.override") {
    const key = String(event.afterState?.["settingKey"] ?? event.targetId);
    const newVal = event.afterState?.["stringValue"] ?? event.afterState?.["numberValue"] ?? event.afterState?.["booleanValue"];
    const reason = event.context?.["overrideReason"] ? ` (Reason: ${event.context["overrideReason"]})` : "";
    return `Configuration '${key}' set to ${String(newVal)}${reason}`;
  }

  if (event.action === "configuration.reset") {
    return `Configuration '${event.targetId}' reverted back to default`;
  }

  if (event.action === "attendance.change") {
    const oldStatus = event.beforeState?.["status"] ?? "unknown";
    const newStatus = event.afterState?.["status"] ?? "unknown";
    return `Attendance updated from ${String(oldStatus)} to ${String(newStatus)}`;
  }

  if (event.action === "fee.adjust") {
    const prev = event.beforeState?.["amount"] ?? event.beforeState?.["totalDue"];
    const next = event.afterState?.["amount"] ?? event.afterState?.["totalDue"];
    if (prev !== undefined && next !== undefined) {
      return `Fee amount adjusted from PKR ${String(prev)} to PKR ${String(next)}`;
    }
  }

  if (event.action === "salary.override") {
    const prev = event.beforeState?.["netSalary"];
    const next = event.afterState?.["netSalary"];
    if (prev !== undefined && next !== undefined) {
      return `Salary adjusted from PKR ${String(prev)} to PKR ${String(next)}`;
    }
  }

  const cleanTargetType = event.targetType.replace(/_/g, " ");
  return `${actionLabel} on ${cleanTargetType}`;
}
