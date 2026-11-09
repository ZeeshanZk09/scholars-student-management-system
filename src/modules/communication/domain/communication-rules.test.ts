import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  assertAnnouncementStatusTransition,
  assertDeliveryStatusTransition,
  assertValidAnnouncementDraft,
  assertValidAudienceTarget,
  buildAnnouncementEventKey,
  buildNotificationEventKey,
  canTransitionAnnouncementStatus,
  canTransitionDeliveryStatus,
  evaluateNotificationPreferences,
  isWithinQuietHours,
  type UserPreferenceSettings,
} from "./communication-rules";

describe("communication-rules domain", () => {
  describe("announcement status transitions", () => {
    it("permits transitions from draft to published and archived", () => {
      expect(canTransitionAnnouncementStatus("draft", "published")).toBe(true);
      expect(canTransitionAnnouncementStatus("draft", "archived")).toBe(true);
      expect(canTransitionAnnouncementStatus("draft", "draft")).toBe(true);
    });

    it("permits transition from published to archived", () => {
      expect(canTransitionAnnouncementStatus("published", "archived")).toBe(true);
      expect(canTransitionAnnouncementStatus("published", "published")).toBe(true);
    });

    it("forbids published from moving back to draft", () => {
      expect(canTransitionAnnouncementStatus("published", "draft")).toBe(false);
      expect(() => assertAnnouncementStatusTransition("published", "draft")).toThrow(
        BusinessRuleError,
      );
    });

    it("treats archived as terminal", () => {
      expect(canTransitionAnnouncementStatus("archived", "draft")).toBe(false);
      expect(canTransitionAnnouncementStatus("archived", "published")).toBe(false);
      expect(() => assertAnnouncementStatusTransition("archived", "published")).toThrow(
        BusinessRuleError,
      );
    });
  });

  describe("delivery status transitions", () => {
    it("permits pending to move to delivered, failed, or suppressed", () => {
      expect(canTransitionDeliveryStatus("pending", "delivered")).toBe(true);
      expect(canTransitionDeliveryStatus("pending", "failed")).toBe(true);
      expect(canTransitionDeliveryStatus("pending", "suppressed")).toBe(true);
    });

    it("permits delivered to move to read", () => {
      expect(canTransitionDeliveryStatus("delivered", "read")).toBe(true);
    });

    it("permits failed to be retried back to pending", () => {
      expect(canTransitionDeliveryStatus("failed", "pending")).toBe(true);
    });

    it("treats read and suppressed as terminal", () => {
      expect(canTransitionDeliveryStatus("read", "pending")).toBe(false);
      expect(canTransitionDeliveryStatus("read", "delivered")).toBe(false);
      expect(canTransitionDeliveryStatus("suppressed", "pending")).toBe(false);
      expect(() => assertDeliveryStatusTransition("read", "pending")).toThrow(
        BusinessRuleError,
      );
    });
  });

  describe("audience target validation", () => {
    it("requires empty audienceId when broadcasting to everyone", () => {
      expect(() => assertValidAudienceTarget("everyone", null)).not.toThrow();
      expect(() => assertValidAudienceTarget("everyone", undefined)).not.toThrow();
      expect(() => assertValidAudienceTarget("everyone", "")).not.toThrow();

      expect(() =>
        assertValidAudienceTarget("everyone", "some-uuid"),
      ).toThrow(ValidationError);
    });

    it("requires specific non-empty audienceId for specific audience types", () => {
      expect(() => assertValidAudienceTarget("class", "class-123")).not.toThrow();
      expect(() => assertValidAudienceTarget("section", "sec-456")).not.toThrow();
      expect(() => assertValidAudienceTarget("role", "role-789")).not.toThrow();

      expect(() => assertValidAudienceTarget("class", null)).toThrow(ValidationError);
      expect(() => assertValidAudienceTarget("section", "")).toThrow(ValidationError);
      expect(() => assertValidAudienceTarget("role", "   ")).toThrow(ValidationError);
    });
  });

  describe("announcement draft validation", () => {
    it("validates valid standard announcement", () => {
      expect(() =>
        assertValidAnnouncementDraft({
          title: "Winter Break Schedule",
          body: "School will be closed from Dec 24 to Jan 2.",
          priority: "normal",
          announcementType: "all",
          requiresAcknowledgement: false,
        }),
      ).not.toThrow();
    });

    it("rejects empty title or body", () => {
      expect(() =>
        assertValidAnnouncementDraft({
          title: "",
          body: "Content",
          priority: "normal",
          announcementType: "all",
          requiresAcknowledgement: false,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        assertValidAnnouncementDraft({
          title: "Title",
          body: "",
          priority: "normal",
          announcementType: "all",
          requiresAcknowledgement: false,
        }),
      ).toThrow(ValidationError);
    });

    it("validates acknowledgement requirements and future deadlines", () => {
      expect(() =>
        assertValidAnnouncementDraft({
          title: "Important Policy Change",
          body: "Please acknowledge receipt of the revised code of conduct.",
          priority: "high",
          announcementType: "all",
          requiresAcknowledgement: true,
          acknowledgeBy: null,
        }),
      ).toThrow(ValidationError);

      // Past deadline should fail
      const pastDate = new Date(Date.now() - 3600000);
      expect(() =>
        assertValidAnnouncementDraft({
          title: "Important Policy Change",
          body: "Please acknowledge.",
          priority: "high",
          announcementType: "all",
          requiresAcknowledgement: true,
          acknowledgeBy: pastDate,
          publishAt: new Date(),
        }),
      ).toThrow(ValidationError);

      // Future deadline succeeds
      const futureDate = new Date(Date.now() + 86400000);
      expect(() =>
        assertValidAnnouncementDraft({
          title: "Important Policy Change",
          body: "Please acknowledge.",
          priority: "high",
          announcementType: "all",
          requiresAcknowledgement: true,
          acknowledgeBy: futureDate,
          publishAt: new Date(),
        }),
      ).not.toThrow();
    });
  });

  describe("quiet hours calculation", () => {
    it("accurately handles overnight quiet hours (e.g. 22:00 to 07:00)", () => {
      expect(isWithinQuietHours("23:15", "22:00", "07:00")).toBe(true);
      expect(isWithinQuietHours("02:00", "22:00", "07:00")).toBe(true);
      expect(isWithinQuietHours("06:59", "22:00", "07:00")).toBe(true);
      expect(isWithinQuietHours("07:00", "22:00", "07:00")).toBe(true);
      expect(isWithinQuietHours("07:01", "22:00", "07:00")).toBe(false);
      expect(isWithinQuietHours("14:30", "22:00", "07:00")).toBe(false);
    });

    it("accurately handles same-day quiet hours (e.g. 13:00 to 15:00)", () => {
      expect(isWithinQuietHours("12:59", "13:00", "15:00")).toBe(false);
      expect(isWithinQuietHours("13:00", "13:00", "15:00")).toBe(true);
      expect(isWithinQuietHours("14:00", "13:00", "15:00")).toBe(true);
      expect(isWithinQuietHours("15:00", "13:00", "15:00")).toBe(true);
      expect(isWithinQuietHours("15:01", "13:00", "15:00")).toBe(false);
    });

    it("returns false when quiet hours are not fully configured", () => {
      expect(isWithinQuietHours("23:00", null, "07:00")).toBe(false);
      expect(isWithinQuietHours("23:00", "22:00", null)).toBe(false);
    });
  });

  describe("notification preferences evaluation", () => {
    const basePrefs: UserPreferenceSettings = {
      inAppEnabled: true,
      emailEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      minimumPriority: "normal",
    };

    it("allows delivery when no custom preferences are set", () => {
      const res = evaluateNotificationPreferences({
        preferences: null,
        channel: "in_app",
        priority: "normal",
      });
      expect(res.shouldDeliver).toBe(true);
      expect(res.suppressed).toBe(false);
    });

    it("always delivers critical priority regardless of quiet hours or channel toggles", () => {
      const strictPrefs: UserPreferenceSettings = {
        inAppEnabled: false,
        emailEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        minimumPriority: "high",
      };

      const midnight = new Date();
      midnight.setHours(23, 30, 0, 0);

      const res = evaluateNotificationPreferences({
        preferences: strictPrefs,
        channel: "in_app",
        priority: "critical",
        currentTime: midnight,
      });

      expect(res.shouldDeliver).toBe(true);
      expect(res.suppressed).toBe(false);
    });

    it("suppresses notifications when priority is below recipient threshold", () => {
      const res = evaluateNotificationPreferences({
        preferences: {
          ...basePrefs,
          minimumPriority: "high",
        },
        channel: "in_app",
        priority: "normal",
      });

      expect(res.shouldDeliver).toBe(false);
      expect(res.suppressed).toBe(true);
      expect(res.suppressionReason).toContain("below recipient's minimum threshold");
    });

    it("suppresses notifications when channel is disabled", () => {
      const res = evaluateNotificationPreferences({
        preferences: {
          ...basePrefs,
          inAppEnabled: false,
        },
        channel: "in_app",
        priority: "normal",
      });

      expect(res.shouldDeliver).toBe(false);
      expect(res.suppressed).toBe(true);
      expect(res.suppressionReason).toContain("In-app notifications are disabled");
    });

    it("suppresses non-critical notifications during quiet hours", () => {
      const nightTime = new Date();
      nightTime.setHours(23, 30, 0, 0);

      const res = evaluateNotificationPreferences({
        preferences: basePrefs,
        channel: "in_app",
        priority: "normal",
        currentTime: nightTime,
      });

      expect(res.shouldDeliver).toBe(false);
      expect(res.suppressed).toBe(true);
      expect(res.isQuietHours).toBe(true);
      expect(res.suppressionReason).toContain("Suppressed during recipient quiet hours");
    });
  });

  describe("event keys for idempotency", () => {
    it("builds consistent event keys", () => {
      expect(buildNotificationEventKey("attendance", "daily_absence", "stud-123")).toBe(
        "attendance:daily_absence:stud-123",
      );
      expect(buildNotificationEventKey("HR", "Leave Approved", null)).toBe(
        "hr:leave_approved",
      );
      expect(buildAnnouncementEventKey("ann-456")).toBe(
        "communication:announcement_published:ann-456",
      );
    });
  });
});
