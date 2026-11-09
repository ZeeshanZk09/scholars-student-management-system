/**
 * Communication Application Service
 *
 * `PRD.md` MODULE 26, 27 and `RULES.md` §45, §46, §47.
 * Layer rules (`src/modules/README.md`): Application use cases. Orchestrates; no framework, no SQL.
 */

import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import {
  assertAnnouncementStatusTransition,
  assertValidAnnouncementDraft,
  buildAnnouncementEventKey,
  buildNotificationEventKey,
  evaluateNotificationPreferences,
  type NotificationAudience,
  type UserPreferenceSettings,
} from "../domain/communication-rules";
import type {
  AnnouncementReceiptRow,
  AnnouncementRow,
  CommunicationStore,
  NotificationDeliveryRow,
  NotificationPreferenceRow,
  NotificationRow,
  RecipientResolverPort,
  ResolvedRecipient,
} from "./ports";
import {
  AcknowledgeAnnouncementData,
  CreateAnnouncementData,
  ListAnnouncementsQueryData,
  ListDeliveryLogsQueryData,
  MarkDeliveryReadData,
  PublishAnnouncementData,
  SendNotificationData,
  UpdateNotificationPreferencesData,
  type AcknowledgeAnnouncementInput,
  type CreateAnnouncementInput,
  type ListAnnouncementsQueryInput,
  type ListDeliveryLogsQueryInput,
  type MarkDeliveryReadInput,
  type PublishAnnouncementInput,
  type SendNotificationInput,
  type UpdateNotificationPreferencesInput,
} from "./schemas";

export class CommunicationService {
  constructor(
    private readonly store: CommunicationStore,
    private readonly recipientResolver: RecipientResolverPort,
  ) {}

  /* -------------------------------------------------------------------------- */
  /* Announcements                                                              */
  /* -------------------------------------------------------------------------- */

  async createAnnouncement(
    rawInput: unknown,
    authorUserId: string,
  ): Promise<AnnouncementRow> {
    const input: CreateAnnouncementInput = CreateAnnouncementData.parse(rawInput);

    assertValidAnnouncementDraft({
      title: input.title,
      body: input.body,
      priority: input.priority,
      announcementType: input.announcementType,
      requiresAcknowledgement: input.requiresAcknowledgement,
      acknowledgeBy: input.acknowledgeBy,
      publishAt: input.publishAt,
    });

    const created = await this.store.createAnnouncement(
      {
        institutionId: input.institutionId,
        campusId: input.campusId ?? null,
        academicSessionId: input.academicSessionId ?? null,
        title: input.title,
        body: input.body,
        status: "draft",
        priority: input.priority,
        announcementType: input.announcementType,
        requiresAcknowledgement: input.requiresAcknowledgement,
        acknowledgeBy: input.acknowledgeBy ?? null,
        publishAt: input.publishAt ?? null,
        authorUserId,
        attachmentKeys: input.attachmentKeys ?? [],
      },
      input.audiences,
    );

    return created;
  }

  async publishAnnouncement(
    rawInput: unknown,
    authorUserId: string,
  ): Promise<{
    readonly announcement: AnnouncementRow;
    readonly deliveriesCount: number;
    readonly suppressedCount: number;
  }> {
    const input: PublishAnnouncementInput = PublishAnnouncementData.parse(rawInput);

    const announcement = await this.store.getAnnouncement(input.announcementId);
    if (!announcement) {
      throw new NotFoundError("Announcement not found.", {
        details: { announcementId: input.announcementId },
      });
    }

    assertAnnouncementStatusTransition(announcement.status, "published");

    // 1. Gather audience definitions
    const audiences = await this.store.getAnnouncementAudiences(announcement.id);
    const audienceTargets: { audienceType: NotificationAudience; audienceId: string | null }[] = [];

    if (audiences.length > 0) {
      for (const aud of audiences) {
        audienceTargets.push({ audienceType: aud.audienceType, audienceId: aud.audienceId });
      }
    } else {
      // Fallback from announcementType
      switch (announcement.announcementType) {
        case "all":
          audienceTargets.push({ audienceType: "everyone", audienceId: null });
          break;
        case "teachers":
          audienceTargets.push({ audienceType: "teacher", audienceId: null });
          break;
        case "guardians":
          audienceTargets.push({ audienceType: "guardian", audienceId: null });
          break;
        case "staff":
          audienceTargets.push({ audienceType: "role", audienceId: null });
          break;
        default:
          audienceTargets.push({ audienceType: "everyone", audienceId: null });
          break;
      }
    }

    // 2. Resolve recipients across all audience targets
    const resolvedMap = new Map<string, ResolvedRecipient>();

    for (const target of audienceTargets) {
      const recipients = await this.recipientResolver.resolveRecipientsForAudience({
        institutionId: announcement.institutionId,
        audienceType: target.audienceType,
        audienceId: target.audienceId,
      });

      for (const r of recipients) {
        if (!resolvedMap.has(r.userId)) {
          resolvedMap.set(r.userId, r);
        }
      }
    }

    const uniqueRecipients = Array.from(resolvedMap.values());

    // 3. Create or retrieve parent notification idempotently
    const eventKey = buildAnnouncementEventKey(announcement.id);
    let notification = await this.store.findNotificationByIdempotency(
      eventKey,
      announcement.id,
      "in_app",
    );

    if (!notification) {
      notification = await this.store.createNotification({
        institutionId: announcement.institutionId,
        sourceModule: "communication",
        eventKey,
        relatedEntityId: announcement.id,
        channel: "in_app",
        audienceType: audiences.length > 0 ? "user" : (audienceTargets[0]?.audienceType ?? "everyone"),
        audienceId: audiences.length > 0 ? null : (audienceTargets[0]?.audienceId ?? null),
        title: announcement.title,
        body: announcement.body,
        payload: { announcementId: announcement.id, priority: announcement.priority },
        actionUrl: `/announcements/${announcement.id}`,
        requiredPermissionKey: null,
        scheduledFor: null,
        expiresAt: null,
        createdByUserId: authorUserId,
      });
    }

    // 4. Create deliveries evaluating recipient notification preferences
    const now = new Date();
    const deliveriesToCreate: Omit<
      NotificationDeliveryRow,
      "id" | "createdAt" | "updatedAt" | "version"
    >[] = [];
    const receiptsToCreate: { announcementId: string; userId: string; deliveredAt: Date | null }[] = [];

    let deliveredCount = 0;
    let suppressedCount = 0;

    for (const recipient of uniqueRecipients) {
      const prefs = await this.store.getNotificationPreferences(recipient.userId, "announcement");
      const defaultPrefs = prefs ?? (await this.store.getNotificationPreferences(recipient.userId, null));

      const userPrefSettings: UserPreferenceSettings | null = defaultPrefs
        ? {
            inAppEnabled: defaultPrefs.inAppEnabled,
            emailEnabled: defaultPrefs.emailEnabled,
            quietHoursStart: defaultPrefs.quietHoursStart,
            quietHoursEnd: defaultPrefs.quietHoursEnd,
            minimumPriority: defaultPrefs.minimumPriority,
          }
        : null;

      const evalResult = evaluateNotificationPreferences({
        preferences: userPrefSettings,
        channel: "in_app",
        priority: announcement.priority,
        currentTime: now,
      });

      if (evalResult.suppressed) {
        suppressedCount++;
        deliveriesToCreate.push({
          notificationId: notification.id,
          recipientUserId: recipient.userId,
          audienceType: recipient.audienceType,
          audienceId: recipient.audienceId,
          resolutionNote: recipient.resolutionNote ?? "Resolved via audience target",
          status: "suppressed",
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          failureReason: evalResult.suppressionReason ?? "Suppressed by recipient notification settings",
          attemptCount: 0,
        });
      } else {
        deliveredCount++;
        deliveriesToCreate.push({
          notificationId: notification.id,
          recipientUserId: recipient.userId,
          audienceType: recipient.audienceType,
          audienceId: recipient.audienceId,
          resolutionNote: recipient.resolutionNote ?? "Resolved via audience target",
          status: "delivered",
          deliveredAt: now,
          readAt: null,
          failedAt: null,
          failureReason: null,
          attemptCount: 1,
        });

        receiptsToCreate.push({
          announcementId: announcement.id,
          userId: recipient.userId,
          deliveredAt: now,
        });
      }
    }

    if (deliveriesToCreate.length > 0) {
      await this.store.createDeliveries(deliveriesToCreate);
    }

    if (receiptsToCreate.length > 0) {
      await this.store.createAnnouncementReceipts(receiptsToCreate);
    }

    // 5. Transition announcement to published
    const updatedAnnouncement = await this.store.updateAnnouncementStatus(announcement.id, {
      status: "published",
      publishedAt: now,
      notificationId: notification.id,
    });

    return {
      announcement: updatedAnnouncement,
      deliveriesCount: deliveredCount,
      suppressedCount,
    };
  }

  async acknowledgeAnnouncement(
    rawInput: unknown,
    userId: string,
  ): Promise<AnnouncementReceiptRow> {
    const input: AcknowledgeAnnouncementInput = AcknowledgeAnnouncementData.parse(rawInput);

    const announcement = await this.store.getAnnouncement(input.announcementId);
    if (!announcement) {
      throw new NotFoundError("Announcement not found.", {
        details: { announcementId: input.announcementId },
      });
    }

    if (!announcement.requiresAcknowledgement) {
      throw new BusinessRuleError("This announcement does not require acknowledgement.", {
        userMessage: "This announcement does not require a confirmation receipt.",
      });
    }

    const now = new Date();
    const receipt = await this.store.recordAnnouncementReceipt(input.announcementId, userId, {
      readAt: now,
      acknowledgedAt: now,
      note: input.note ?? null,
    });

    // Mark delivery as read if linked
    if (announcement.notificationId) {
      const userDeliveries = await this.store.listDeliveriesForUser(userId, { limit: 100 });
      const matchingDelivery = userDeliveries.deliveries.find(
        (d) => d.notificationId === announcement.notificationId,
      );
      if (matchingDelivery && matchingDelivery.status !== "read") {
        await this.store.markDeliveryAsRead(matchingDelivery.id, userId);
      }
    }

    return receipt;
  }

  async listAnnouncements(rawQuery: unknown): Promise<readonly AnnouncementRow[]> {
    const query: ListAnnouncementsQueryInput = ListAnnouncementsQueryData.parse(rawQuery);
    return this.store.listAnnouncements({
      institutionId: query.institutionId,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getAnnouncement(id: string): Promise<AnnouncementRow | null> {
    return this.store.getAnnouncement(id);
  }

  /* -------------------------------------------------------------------------- */
  /* Direct Notifications & Dispatching                                         */
  /* -------------------------------------------------------------------------- */

  async sendDirectNotification(
    rawInput: unknown,
    authorUserId: string,
  ): Promise<{
    readonly notification: NotificationRow;
    readonly deliveriesCount: number;
    readonly suppressedCount: number;
  }> {
    const input: SendNotificationInput = SendNotificationData.parse(rawInput);

    const eventKey = buildNotificationEventKey(
      input.sourceModule,
      input.eventKey,
      input.relatedEntityId,
    );

    // Check idempotency: if already created and non-scheduled, return existing
    const existing = await this.store.findNotificationByIdempotency(
      eventKey,
      input.relatedEntityId ?? null,
      input.channel,
    );
    if (existing) {
      return {
        notification: existing,
        deliveriesCount: 0,
        suppressedCount: 0,
      };
    }

    // Create notification
    const notification = await this.store.createNotification({
      institutionId: input.institutionId,
      sourceModule: input.sourceModule,
      eventKey,
      relatedEntityId: input.relatedEntityId ?? null,
      channel: input.channel,
      audienceType: input.audienceType,
      audienceId: input.audienceId ?? null,
      title: input.title,
      body: input.body,
      payload: (input.payload as Record<string, unknown>) ?? null,
      actionUrl: input.actionUrl ?? null,
      requiredPermissionKey: input.requiredPermissionKey ?? null,
      scheduledFor: input.scheduledFor ?? null,
      expiresAt: input.expiresAt ?? null,
      createdByUserId: authorUserId,
    });

    // Resolve recipients
    const recipients = await this.recipientResolver.resolveRecipientsForAudience({
      institutionId: input.institutionId,
      audienceType: input.audienceType,
      audienceId: input.audienceId,
    });

    const now = new Date();
    const deliveriesToCreate: Omit<
      NotificationDeliveryRow,
      "id" | "createdAt" | "updatedAt" | "version"
    >[] = [];

    let deliveredCount = 0;
    let suppressedCount = 0;

    for (const recipient of recipients) {
      const prefs = await this.store.getNotificationPreferences(
        recipient.userId,
        input.sourceModule,
      );
      const defaultPrefs =
        prefs ?? (await this.store.getNotificationPreferences(recipient.userId, null));

      const userPrefSettings: UserPreferenceSettings | null = defaultPrefs
        ? {
            inAppEnabled: defaultPrefs.inAppEnabled,
            emailEnabled: defaultPrefs.emailEnabled,
            quietHoursStart: defaultPrefs.quietHoursStart,
            quietHoursEnd: defaultPrefs.quietHoursEnd,
            minimumPriority: defaultPrefs.minimumPriority,
          }
        : null;

      const evalResult = evaluateNotificationPreferences({
        preferences: userPrefSettings,
        channel: input.channel,
        priority: "normal",
        currentTime: now,
      });

      if (evalResult.suppressed) {
        suppressedCount++;
        deliveriesToCreate.push({
          notificationId: notification.id,
          recipientUserId: recipient.userId,
          audienceType: recipient.audienceType,
          audienceId: recipient.audienceId,
          resolutionNote: recipient.resolutionNote ?? "Targeted recipient",
          status: "suppressed",
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          failureReason: evalResult.suppressionReason ?? "Suppressed by recipient notification settings",
          attemptCount: 0,
        });
      } else {
        deliveredCount++;
        deliveriesToCreate.push({
          notificationId: notification.id,
          recipientUserId: recipient.userId,
          audienceType: recipient.audienceType,
          audienceId: recipient.audienceId,
          resolutionNote: recipient.resolutionNote ?? "Targeted recipient",
          status: "delivered",
          deliveredAt: now,
          readAt: null,
          failedAt: null,
          failureReason: null,
          attemptCount: 1,
        });
      }
    }

    if (deliveriesToCreate.length > 0) {
      await this.store.createDeliveries(deliveriesToCreate);
    }

    return {
      notification,
      deliveriesCount: deliveredCount,
      suppressedCount,
    };
  }

  /* -------------------------------------------------------------------------- */
  /* User Notification Inbox & Receipts                                         */
  /* -------------------------------------------------------------------------- */

  async getUserInbox(
    userId: string,
    options?: { readonly limit?: number; readonly offset?: number },
  ): Promise<{
    readonly deliveries: readonly NotificationDeliveryRow[];
    readonly total: number;
    readonly unreadCount: number;
  }> {
    const [result, unreadCount] = await Promise.all([
      this.store.listDeliveriesForUser(userId, options),
      this.store.getUnreadCount(userId),
    ]);

    return {
      deliveries: result.deliveries,
      total: result.total,
      unreadCount,
    };
  }

  async markNotificationAsRead(rawInput: unknown, userId: string): Promise<NotificationDeliveryRow> {
    const input: MarkDeliveryReadInput = MarkDeliveryReadData.parse(rawInput);
    return this.store.markDeliveryAsRead(input.deliveryId, userId);
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    return this.store.markAllDeliveriesAsRead(userId);
  }

  /* -------------------------------------------------------------------------- */
  /* Notification Preferences                                                   */
  /* -------------------------------------------------------------------------- */

  async getUserPreferences(
    userId: string,
    category?: string | null,
  ): Promise<NotificationPreferenceRow | null> {
    return this.store.getNotificationPreferences(userId, category);
  }

  async updateNotificationPreferences(
    userId: string,
    rawInput: unknown,
  ): Promise<NotificationPreferenceRow> {
    const input: UpdateNotificationPreferencesInput =
      UpdateNotificationPreferencesData.parse(rawInput);

    return this.store.upsertNotificationPreferences(userId, {
      category: input.category ?? null,
      inAppEnabled: input.inAppEnabled,
      emailEnabled: input.emailEnabled,
      quietHoursStart: input.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd ?? null,
      minimumPriority: input.minimumPriority,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Delivery Logs & Audit                                                      */
  /* -------------------------------------------------------------------------- */

  async getDeliveryLogs(
    rawQuery: unknown,
  ): Promise<{ readonly deliveries: readonly NotificationDeliveryRow[]; readonly total: number }> {
    const query: ListDeliveryLogsQueryInput = ListDeliveryLogsQueryData.parse(rawQuery);
    return this.store.listDeliveryLogs({
      institutionId: query.institutionId ?? undefined,
      notificationId: query.notificationId ?? undefined,
      recipientUserId: query.recipientUserId ?? undefined,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
