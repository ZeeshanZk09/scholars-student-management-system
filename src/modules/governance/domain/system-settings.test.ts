import { describe, expect, it } from "vitest";

import { ValidationError } from "@/shared/errors";
import {
  formatSettingValue,
  isValidSettingKey,
  validateSettingInput,
} from "./system-settings";

describe("System Settings Domain", () => {
  describe("isValidSettingKey", () => {
    it("accepts valid dotted lowercase keys", () => {
      expect(isValidSettingKey("attendance.grace_period_minutes")).toBe(true);
      expect(isValidSettingKey("email.smtp.host")).toBe(true);
      expect(isValidSettingKey("fee.daily_late_fine")).toBe(true);
    });

    it("rejects keys without dots or with invalid characters", () => {
      expect(isValidSettingKey("attendance")).toBe(false);
      expect(isValidSettingKey("Fee.Fine")).toBe(false);
      expect(isValidSettingKey("academic..pass")).toBe(false);
      expect(isValidSettingKey("email-smtp")).toBe(false);
    });
  });

  describe("validateSettingInput", () => {
    it("validates a correct number setting", () => {
      expect(() =>
        validateSettingInput({
          settingKey: "attendance.grace_period_minutes",
          settingCategory: "attendance",
          settingValueType: "number",
          numberValue: 15,
          numberUnit: "minutes",
          defaultSource: "system",
        }),
      ).not.toThrow();
    });

    it("requires a unit for a number setting", () => {
      expect(() =>
        validateSettingInput({
          settingKey: "attendance.grace_period_minutes",
          settingCategory: "attendance",
          settingValueType: "number",
          numberValue: 15,
          defaultSource: "system",
        }),
      ).toThrow(ValidationError);
    });

    it("validates boolean and string settings", () => {
      expect(() =>
        validateSettingInput({
          settingKey: "notification.sms_enabled",
          settingCategory: "notification",
          settingValueType: "boolean",
          booleanValue: true,
          defaultSource: "institution",
        }),
      ).not.toThrow();

      expect(() =>
        validateSettingInput({
          settingKey: "institute.name",
          settingCategory: "institute",
          settingValueType: "string",
          stringValue: "Scholars Academy",
          defaultSource: "system",
        }),
      ).not.toThrow();
    });

    it("enforces mandatory override reason for manual source (RULES.md §37)", () => {
      expect(() =>
        validateSettingInput({
          settingKey: "fee.grace_period_days",
          settingCategory: "fee",
          settingValueType: "number",
          numberValue: 14,
          numberUnit: "days",
          defaultSource: "manual",
          overrideReason: "",
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateSettingInput({
          settingKey: "fee.grace_period_days",
          settingCategory: "fee",
          settingValueType: "number",
          numberValue: 14,
          numberUnit: "days",
          defaultSource: "manual",
          overrideReason: "Extended for religious holidays approved by principal",
        }),
      ).not.toThrow();
    });
  });

  describe("formatSettingValue", () => {
    it("formats typed settings for UI presentation", () => {
      expect(
        formatSettingValue({
          settingValueType: "number",
          numberValue: 20,
          numberUnit: "minutes",
        }),
      ).toBe("20 minutes");

      expect(
        formatSettingValue({
          settingValueType: "boolean",
          booleanValue: true,
        }),
      ).toBe("Enabled");

      expect(
        formatSettingValue({
          settingValueType: "string",
          stringValue: "Scholars High",
        }),
      ).toBe("Scholars High");
    });
  });
});
