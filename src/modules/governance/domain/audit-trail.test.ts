import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  assertAuditTrailImmutable,
  formatAuditActionLabel,
  formatAuditDescription,
  validateAuditEvent,
} from "./audit-trail";

describe("Audit Trail Domain", () => {
  describe("validateAuditEvent", () => {
    it("accepts a valid audit event with before and after state", () => {
      const result = validateAuditEvent({
        action: "attendance.change",
        result: "success",
        targetType: "attendance_mark",
        targetId: "mark-123",
        actorUserId: "user-456",
        beforeState: { status: "absent" },
        afterState: { status: "present" },
      });

      expect(result.actorDisplayName).toBe("User");
      expect(result.beforeState).toEqual({ status: "absent" });
      expect(result.afterState).toEqual({ status: "present" });
    });

    it("redacts sensitive fields in state and context", () => {
      const result = validateAuditEvent({
        action: "user.update",
        result: "success",
        targetType: "user_account",
        targetId: "user-999",
        actorDisplayName: "admin",
        afterState: {
          username: "staff_member",
          passwordHash: "$2b$10$supersecretcredentials",
        },
        context: {
          sessionToken: "bearer-token-12345",
        },
      });

      expect(result.afterState?.["username"]).toBe("staff_member");
      expect(result.afterState?.["passwordHash"]).toBe("[redacted]");
      expect(result.context?.["sessionToken"]).toBe("[redacted]");
    });

    it("defaults actor to 'system' when no user or name is given", () => {
      const result = validateAuditEvent({
        action: "salary.calculate",
        result: "success",
        targetType: "payroll_slip",
        targetId: "slip-001",
        afterState: { grossSalary: 50000 },
      });

      expect(result.actorDisplayName).toBe("system");
    });

    it("permits login/logout actions without explicit state snapshots", () => {
      expect(() =>
        validateAuditEvent({
          action: "auth.login",
          result: "success",
          targetType: "user_account",
          targetId: "user-123",
          actorUserId: "user-123",
        }),
      ).not.toThrow();
    });

    it("rejects non-auth actions lacking both before and after states", () => {
      expect(() =>
        validateAuditEvent({
          action: "student.update",
          result: "success",
          targetType: "student",
          targetId: "student-1",
          actorUserId: "admin-1",
        }),
      ).toThrow(BusinessRuleError);
    });

    it("rejects blank action or targets", () => {
      expect(() =>
        validateAuditEvent({
          action: "",
          result: "success",
          targetType: "student",
          targetId: "stu-1",
          afterState: {},
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateAuditEvent({
          action: "student.create",
          result: "success",
          targetType: "",
          targetId: "",
          afterState: {},
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("assertAuditTrailImmutable", () => {
    it("permits insert operations", () => {
      expect(() => assertAuditTrailImmutable("insert")).not.toThrow();
    });

    it("throws a BusinessRuleError when an update or delete is attempted", () => {
      expect(() => assertAuditTrailImmutable("update")).toThrow(BusinessRuleError);
      expect(() => assertAuditTrailImmutable("delete")).toThrow(BusinessRuleError);
    });
  });

  describe("formatAuditActionLabel & formatAuditDescription", () => {
    it("translates machine actions to human labels without database jargon", () => {
      expect(formatAuditActionLabel("attendance.change")).toBe("Attendance Record Corrected");
      expect(formatAuditActionLabel("configuration.override")).toBe("Institution Setting Overridden");
      expect(formatAuditActionLabel("fee.adjust")).toBe("Manual Fee Adjustment");
    });

    it("formats configuration overrides with key and human explanation", () => {
      const desc = formatAuditDescription({
        action: "configuration.override",
        targetType: "system_setting",
        targetId: "attendance.grace_period_minutes",
        afterState: { settingKey: "attendance.grace_period_minutes", numberValue: 20 },
        context: { overrideReason: "Winter weather delay" },
      });

      expect(desc).toBe(
        "Configuration 'attendance.grace_period_minutes' set to 20 (Reason: Winter weather delay)",
      );
    });

    it("formats attendance changes in natural terms", () => {
      const desc = formatAuditDescription({
        action: "attendance.change",
        targetType: "attendance_mark",
        targetId: "mark-1",
        beforeState: { status: "absent" },
        afterState: { status: "present" },
      });

      expect(desc).toBe("Attendance updated from absent to present");
    });

    it("formats fee adjustments clearly with amounts", () => {
      const desc = formatAuditDescription({
        action: "fee.adjust",
        targetType: "fee_invoice",
        targetId: "inv-001",
        beforeState: { amount: 5000 },
        afterState: { amount: 4500 },
      });

      expect(desc).toBe("Fee amount adjusted from PKR 5000 to PKR 4500");
    });
  });
});
