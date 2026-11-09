import { beforeEach, describe, expect, it } from "vitest";

import { CommunicationService } from "./communication-service";
import { FakeCommunicationStore, FakeRecipientResolver } from "./testing/fakes";

describe("CommunicationService", () => {
  let store: FakeCommunicationStore;
  let resolver: FakeRecipientResolver;
  let service: CommunicationService;

  const institutionId = "11111111-1111-4111-8111-111111111111";
  const authorUserId = "99999999-9999-4999-8999-999999999999";
  const user1 = "22222222-2222-4222-8222-222222222222";
  const user2 = "33333333-3333-4333-8333-333333333333";
  const user3 = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    store = new FakeCommunicationStore();
    resolver = new FakeRecipientResolver();
    service = new CommunicationService(store, resolver);

    // Setup default fake recipients for broadcast
    resolver.setRecipients("everyone", null, [
      { userId: user1, audienceType: "everyone", audienceId: null },
      { userId: user2, audienceType: "everyone", audienceId: null },
      { userId: user3, audienceType: "everyone", audienceId: null },
    ]);
  });

  describe("Announcement Workflows", () => {
    it("creates a draft announcement successfully", async () => {
      const created = await service.createAnnouncement(
        {
          institutionId,
          title: "Exam Schedule Released",
          body: "The final examination schedule for term 1 is now available.",
          priority: "high",
          announcementType: "all",
          requiresAcknowledgement: false,
        },
        authorUserId,
      );

      expect(created.id).toBeDefined();
      expect(created.status).toBe("draft");
      expect(created.title).toBe("Exam Schedule Released");
      expect(created.authorUserId).toBe(authorUserId);
    });

    it("publishes an announcement to all members and creates deliveries", async () => {
      const created = await service.createAnnouncement(
        {
          institutionId,
          title: "Annual Sports Day",
          body: "Join us for our annual sports festival this Saturday.",
          priority: "normal",
          announcementType: "all",
          requiresAcknowledgement: false,
        },
        authorUserId,
      );

      const result = await service.publishAnnouncement(
        { announcementId: created.id },
        authorUserId,
      );

      expect(result.announcement.status).toBe("published");
      expect(result.announcement.publishedAt).toBeInstanceOf(Date);
      expect(result.deliveriesCount).toBe(3);
      expect(result.suppressedCount).toBe(0);

      // Verify each user has a delivery record
      const inbox1 = await service.getUserInbox(user1);
      expect(inbox1.total).toBe(1);
      expect(inbox1.deliveries[0]?.notificationTitle).toBe("Annual Sports Day");
      expect(inbox1.deliveries[0]?.status).toBe("delivered");
    });

    it("publishes a targeted announcement to specific class/section families", async () => {
      const classId = "55555555-5555-4555-8555-555555555555";
      resolver.setRecipients("class", classId, [
        { userId: user1, audienceType: "class", audienceId: classId, resolutionNote: "Parent of Grade 5" },
        { userId: user2, audienceType: "class", audienceId: classId, resolutionNote: "Parent of Grade 5" },
      ]);

      const created = await service.createAnnouncement(
        {
          institutionId,
          title: "Grade 5 Science Fair",
          body: "Grade 5 students must submit their project outlines by Friday.",
          priority: "normal",
          announcementType: "custom",
          requiresAcknowledgement: false,
          audiences: [
            {
              audienceType: "class",
              audienceId: classId,
              matchMode: "any",
            },
          ],
        },
        authorUserId,
      );

      const result = await service.publishAnnouncement(
        { announcementId: created.id },
        authorUserId,
      );

      expect(result.deliveriesCount).toBe(2);
      expect(result.suppressedCount).toBe(0);

      const inbox1 = await service.getUserInbox(user1);
      expect(inbox1.total).toBe(1);

      const inbox3 = await service.getUserInbox(user3);
      expect(inbox3.total).toBe(0); // Not in Grade 5
    });

    it("respects recipient preferences and suppresses delivery when disabled", async () => {
      // User 2 turned off in-app announcements
      await service.updateNotificationPreferences(user2, {
        category: "announcement",
        inAppEnabled: false,
        emailEnabled: true,
        minimumPriority: "normal",
      });

      // User 3 set minimum priority to urgent ('critical')
      await service.updateNotificationPreferences(user3, {
        category: null, // default
        inAppEnabled: true,
        emailEnabled: true,
        minimumPriority: "critical",
      });

      const created = await service.createAnnouncement(
        {
          institutionId,
          title: "Book Club Meeting",
          body: "The monthly library book club meets tomorrow at 4 PM.",
          priority: "normal",
          announcementType: "all",
          requiresAcknowledgement: false,
        },
        authorUserId,
      );

      const result = await service.publishAnnouncement(
        { announcementId: created.id },
        authorUserId,
      );

      expect(result.deliveriesCount).toBe(1); // user1
      expect(result.suppressedCount).toBe(2); // user2 & user3

      // User 1 received the notification
      const inbox1 = await service.getUserInbox(user1);
      expect(inbox1.total).toBe(1);
      expect(inbox1.deliveries[0]?.status).toBe("delivered");

      // User 2 has a suppressed delivery log
      const logs = await service.getDeliveryLogs({ recipientUserId: user2 });
      expect(logs.total).toBe(1);
      expect(logs.deliveries[0]?.status).toBe("suppressed");
      expect(logs.deliveries[0]?.failureReason).toContain("In-app notifications are disabled");
    });

    it("handles announcement acknowledgement receipts", async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();

      const created = await service.createAnnouncement(
        {
          institutionId,
          title: "Fee Policy Revision",
          body: "Please acknowledge the updated fee payment schedule.",
          priority: "high",
          announcementType: "all",
          requiresAcknowledgement: true,
          acknowledgeBy: tomorrow,
        },
        authorUserId,
      );

      await service.publishAnnouncement({ announcementId: created.id }, authorUserId);

      // User acknowledges receipt
      const receipt = await service.acknowledgeAnnouncement(
        {
          announcementId: created.id,
          note: "Read and understood by parent.",
        },
        user1,
      );

      expect(receipt.userId).toBe(user1);
      expect(receipt.acknowledgedAt).toBeInstanceOf(Date);
      expect(receipt.acknowledgementNote).toBe("Read and understood by parent.");

      // Check notification is marked as read
      const inbox = await service.getUserInbox(user1);
      expect(inbox.deliveries[0]?.status).toBe("read");
    });
  });

  describe("Direct Notifications & Inbox", () => {
    it("dispatches direct notification and prevents duplicate sends via idempotency", async () => {
      const targetUser = "66666666-6666-4666-8666-666666666666";
      resolver.setRecipients("user", targetUser, [
        { userId: targetUser, audienceType: "user", audienceId: targetUser },
      ]);

      const payload = {
        institutionId,
        sourceModule: "attendance",
        eventKey: "absence_notice",
        relatedEntityId: "77777777-7777-4777-8777-777777777777",
        channel: "in_app" as const,
        audienceType: "user" as const,
        audienceId: targetUser,
        title: "Unexcused Absence Alert",
        body: "Your child was marked absent today.",
        actionUrl: "/attendance/details",
      };

      const firstSend = await service.sendDirectNotification(payload, authorUserId);
      expect(firstSend.deliveriesCount).toBe(1);

      // Sending again with the same idempotency key does not duplicate
      const secondSend = await service.sendDirectNotification(payload, authorUserId);
      expect(secondSend.deliveriesCount).toBe(0);
      expect(secondSend.notification.id).toBe(firstSend.notification.id);

      const inbox = await service.getUserInbox(targetUser);
      expect(inbox.total).toBe(1);
    });

    it("marks individual and all notifications as read", async () => {
      resolver.setRecipients("user", user1, [
        { userId: user1, audienceType: "user", audienceId: user1 },
      ]);

      await service.sendDirectNotification(
        {
          institutionId,
          sourceModule: "diary",
          eventKey: "daily_homework_1",
          relatedEntityId: "88888888-8888-4888-8888-888888888888",
          channel: "in_app",
          audienceType: "user",
          audienceId: user1,
          title: "Math Homework Assigned",
          body: "Exercises 1-5 on page 42.",
        },
        authorUserId,
      );

      await service.sendDirectNotification(
        {
          institutionId,
          sourceModule: "diary",
          eventKey: "daily_homework_2",
          relatedEntityId: "88888888-8888-4888-8888-888888888889",
          channel: "in_app",
          audienceType: "user",
          audienceId: user1,
          title: "English Reading",
          body: "Read chapter 3.",
        },
        authorUserId,
      );

      let inbox = await service.getUserInbox(user1);
      expect(inbox.total).toBe(2);
      expect(inbox.unreadCount).toBe(2);

      // Mark single delivery as read
      const firstDeliveryId = inbox.deliveries[0]!.id;
      await service.markNotificationAsRead({ deliveryId: firstDeliveryId }, user1);

      inbox = await service.getUserInbox(user1);
      expect(inbox.unreadCount).toBe(1);

      // Mark all as read
      const updatedCount = await service.markAllNotificationsAsRead(user1);
      expect(updatedCount).toBe(1);

      inbox = await service.getUserInbox(user1);
      expect(inbox.unreadCount).toBe(0);
    });
  });
});
