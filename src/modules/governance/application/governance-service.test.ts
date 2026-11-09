import { beforeEach, describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors";
import { GovernanceService } from "./governance-service";
import { FakeGovernanceStore } from "./testing/fakes";

describe("GovernanceService", () => {
  let store: FakeGovernanceStore;
  let service: GovernanceService;
  const institutionId = "11111111-1111-1111-1111-111111111111";
  const userId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    store = new FakeGovernanceStore();
    service = new GovernanceService(store);
  });

  describe("Audit Trail Operations", () => {
    it("appends an audit event to the immutable log", async () => {
      const record = await service.recordAuditEvent({
        institutionId,
        actorUserId: userId,
        action: "student.update",
        result: "success",
        targetType: "student",
        targetId: "stu-001",
        beforeState: { grade: "9th" },
        afterState: { grade: "10th" },
      });

      expect(record.id).toBeDefined();
      expect(record.action).toBe("student.update");
      expect(record.actorUserId).toBe(userId);
      expect(record.isImmutable).toBe(true);

      const queried = await service.queryAuditTrail({ institutionId });
      expect(queried.items).toHaveLength(1);
      expect(queried.items[0]?.id).toBe(record.id);
    });

    it("filters audit events by actor, action, and targetType", async () => {
      await service.recordAuditEvent({
        institutionId,
        actorUserId: userId,
        action: "attendance.mark",
        result: "success",
        targetType: "attendance_mark",
        targetId: "mark-1",
        afterState: { status: "present" },
      });

      await service.recordAuditEvent({
        institutionId,
        actorUserId: "33333333-3333-3333-3333-333333333333",
        action: "fee.adjust",
        result: "success",
        targetType: "fee_invoice",
        targetId: "inv-1",
        afterState: { amount: 5000 },
      });

      const userResults = await service.queryAuditTrail({
        institutionId,
        actorUserId: userId,
      });
      expect(userResults.items).toHaveLength(1);
      expect(userResults.items[0]?.action).toBe("attendance.mark");

      const feeResults = await service.queryAuditTrail({
        institutionId,
        action: "fee.adjust",
      });
      expect(feeResults.items).toHaveLength(1);
      expect(feeResults.items[0]?.targetType).toBe("fee_invoice");
    });
  });

  describe("System Configuration & Institution Overrides", () => {
    it("returns catalog defaults when no institution overrides exist", async () => {
      const settings = await service.getInstitutionSettings(institutionId, "attendance");

      const gracePeriod = settings.find((s) => s.key === "attendance.grace_period_minutes");
      expect(gracePeriod).toBeDefined();
      expect(gracePeriod?.effectiveValue).toBe(15);
      expect(gracePeriod?.displayValue).toBe("15 minutes");
      expect(gracePeriod?.isOverridden).toBe(false);
      expect(gracePeriod?.defaultSource).toBe("system");
    });

    it("allows authorized administrators to manually override a setting with reason", async () => {
      const updated = await service.overrideSetting(
        {
          institutionId,
          settingKey: "attendance.grace_period_minutes",
          settingCategory: "attendance",
          settingValueType: "number",
          numberValue: 20,
          numberUnit: "minutes",
          overrideReason: "Adjusted for winter assembly schedule approved by principal",
        },
        userId,
      );

      expect(updated.numberValue).toBe(20);
      expect(updated.defaultSource).toBe("manual");

      // Verify effective settings reflect override
      const settings = await service.getInstitutionSettings(institutionId, "attendance");
      const gracePeriod = settings.find((s) => s.key === "attendance.grace_period_minutes");
      expect(gracePeriod?.effectiveValue).toBe(20);
      expect(gracePeriod?.displayValue).toBe("20 minutes");
      expect(gracePeriod?.isOverridden).toBe(true);
      expect(gracePeriod?.defaultSource).toBe("manual");

      // Verify setting change record was written
      const history = await service.getSettingHistory(institutionId, "attendance.grace_period_minutes");
      expect(history).toHaveLength(1);
      expect(history[0]?.previousValue).toBe("15");
      expect(history[0]?.newValue).toBe("20 minutes");
      expect(history[0]?.overrideReason).toContain("winter assembly schedule");
      expect(history[0]?.changedByUserId).toBe(userId);

      // Verify audit trail entry was created
      const audit = await service.queryAuditTrail({ institutionId });
      expect(audit.items).toHaveLength(1);
      expect(audit.items[0]?.action).toBe("configuration.override");
      expect(audit.items[0]?.targetId).toBe("attendance.grace_period_minutes");
    });

    it("rejects an override without a sufficient business reason", async () => {
      await expect(
        service.overrideSetting(
          {
            institutionId,
            settingKey: "attendance.grace_period_minutes",
            settingCategory: "attendance",
            settingValueType: "number",
            numberValue: 25,
            numberUnit: "minutes",
            overrideReason: "",
          },
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects an override with an identical value", async () => {
      // First override to 20
      await service.overrideSetting(
        {
          institutionId,
          settingKey: "attendance.grace_period_minutes",
          settingCategory: "attendance",
          settingValueType: "number",
          numberValue: 20,
          numberUnit: "minutes",
          overrideReason: "First adjustment for winter morning schedule",
        },
        userId,
      );

      // Attempting to override to 20 again
      await expect(
        service.overrideSetting(
          {
            institutionId,
            settingKey: "attendance.grace_period_minutes",
            settingCategory: "attendance",
            settingValueType: "number",
            numberValue: 20,
            numberUnit: "minutes",
            overrideReason: "Trying to submit identical value",
          },
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("resets an overridden setting back to catalog default", async () => {
      // Set override
      await service.overrideSetting(
        {
          institutionId,
          settingKey: "academic.passing_percentage",
          settingCategory: "academic",
          settingValueType: "number",
          numberValue: 50,
          numberUnit: "%",
          overrideReason: "Higher bar for trial semester",
        },
        userId,
      );

      // Reset
      const reset = await service.resetSettingToDefault(
        {
          institutionId,
          settingKey: "academic.passing_percentage",
          resetReason: "Returning to standard board curriculum guidelines",
        },
        userId,
      );

      expect(reset.numberValue).toBe(40);
      expect(reset.defaultSource).toBe("system");

      const settings = await service.getInstitutionSettings(institutionId, "academic");
      const passing = settings.find((s) => s.key === "academic.passing_percentage");
      expect(passing?.effectiveValue).toBe(40);
      expect(passing?.isOverridden).toBe(false);

      const history = await service.getSettingHistory(institutionId, "academic.passing_percentage");
      expect(history).toHaveLength(2);
      expect(history[0]?.overrideReason).toBe("Returning to standard board curriculum guidelines");
    });
  });
});
