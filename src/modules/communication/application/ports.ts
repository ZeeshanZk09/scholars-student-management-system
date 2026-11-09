/**
 * Communication Application Ports and Read Models
 *
 * `PRD.md` MODULE 26, 27 and `RULES.md` §45, §46, §47.
 * Layer rules (`src/modules/README.md`): Pure ports, types, and interfaces.
 */

import type {
  AnnouncementStatus,
  AnnouncementType,
  MatchMode,
  NotificationAudience,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
} from "../domain/communication-rules";

/* -------------------------------------------------------------------------- */
/* Read Models & Row Types                                                    */
/* -------------------------------------------------------------------------- */

export interface NotificationRow {
  readonly id: string;
  readonly institutionId: string;
  readonly sourceModule: string;
  readonly eventKey: string;
  readonly relatedEntityId: string | null;
  readonly channel: NotificationChannel;
  readonly audienceType: NotificationAudience;
  readonly audienceId: string | null;
  readonly title: string;
  readonly body: string;
  readonly payload: Record<string, unknown> | null;
  readonly actionUrl: string | null;
  readonly requiredPermissionKey: string | null;
  readonly scheduledFor: Date | null;
  readonly expiresAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface NotificationDeliveryRow {
  readonly id: string;
  readonly notificationId: string;
  readonly recipientUserId: string;
  readonly audienceType: NotificationAudience;
  readonly audienceId: string | null;
  readonly resolutionNote: string | null;
  readonly status: NotificationDeliveryStatus;
  readonly deliveredAt: Date | null;
  readonly readAt: Date | null;
  readonly failedAt: Date | null;
  readonly failureReason: string | null;
  readonly attemptCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  // Optional enriched fields for human-friendly UI display
  readonly notificationTitle?: string | undefined;
  readonly notificationBody?: string | undefined;
  readonly notificationActionUrl?: string | null | undefined;
  readonly recipientName?: string | null | undefined;
  readonly recipientEmail?: string | null | undefined;
}

export interface NotificationPreferenceRow {
  readonly id: string;
  readonly userId: string;
  readonly category: string | null; // null = default settings
  readonly inAppEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
  readonly minimumPriority: NotificationPriority;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface AnnouncementRow {
  readonly id: string;
  readonly institutionId: string;
  readonly campusId: string | null;
  readonly academicSessionId: string | null;
  readonly title: string;
  readonly body: string;
  readonly status: AnnouncementStatus;
  readonly priority: NotificationPriority;
  readonly announcementType: AnnouncementType;
  readonly notificationId: string | null;
  readonly requiresAcknowledgement: boolean;
  readonly acknowledgeBy: Date | null;
  readonly publishAt: Date | null;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly authorUserId: string;
  readonly attachmentKeys: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface AnnouncementAudienceRow {
  readonly id: string;
  readonly announcementId: string;
  readonly audienceType: NotificationAudience;
  readonly audienceId: string | null;
  readonly matchMode: MatchMode;
}

export interface AnnouncementReceiptRow {
  readonly id: string;
  readonly announcementId: string;
  readonly userId: string;
  readonly deliveredAt: Date | null;
  readonly readAt: Date | null;
  readonly acknowledgedAt: Date | null;
  readonly acknowledgementNote: string | null;
  readonly createdAt: Date;
}

export interface ResolvedRecipient {
  readonly userId: string;
  readonly audienceType: NotificationAudience;
  readonly audienceId: string | null;
  readonly resolutionNote?: string;
  readonly email?: string | null;
  readonly name?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Store and Resolver Ports                                                   */
/* -------------------------------------------------------------------------- */

export interface RecipientResolverPort {
  /**
   * Resolves individual user IDs for targeted or broadcast audiences.
   * `ARCHITECTURE.md` §31: Audience resolution through the domain/authorization model.
   */
  resolveRecipientsForAudience(params: {
    readonly institutionId: string;
    readonly audienceType: NotificationAudience;
    readonly audienceId?: string | null;
  }): Promise<readonly ResolvedRecipient[]>;
}

export interface CommunicationStore {
  // Notifications
  createNotification(
    data: Omit<NotificationRow, "id" | "createdAt" | "updatedAt" | "version">,
  ): Promise<NotificationRow>;

  getNotificationById(id: string): Promise<NotificationRow | null>;

  findNotificationByIdempotency(
    eventKey: string,
    relatedEntityId: string | null,
    channel: NotificationChannel,
  ): Promise<NotificationRow | null>;

  // Deliveries
  createDeliveries(
    deliveries: readonly Omit<NotificationDeliveryRow, "id" | "createdAt" | "updatedAt" | "version">[],
  ): Promise<readonly NotificationDeliveryRow[]>;

  listDeliveriesForUser(
    userId: string,
    options?: {
      readonly status?: NotificationDeliveryStatus;
      readonly limit?: number;
      readonly offset?: number;
    },
  ): Promise<{ readonly deliveries: readonly NotificationDeliveryRow[]; readonly total: number }>;

  markDeliveryAsRead(deliveryId: string, userId: string): Promise<NotificationDeliveryRow>;

  markAllDeliveriesAsRead(userId: string): Promise<number>;

  getUnreadCount(userId: string): Promise<number>;

  // Announcements
  createAnnouncement(
    data: Omit<
      AnnouncementRow,
      "id" | "createdAt" | "updatedAt" | "version" | "publishedAt" | "archivedAt" | "notificationId"
    >,
    audiences?: readonly {
      readonly audienceType: NotificationAudience;
      readonly audienceId?: string | null;
      readonly matchMode?: MatchMode;
    }[],
  ): Promise<AnnouncementRow>;

  getAnnouncement(id: string): Promise<AnnouncementRow | null>;

  getAnnouncementAudiences(announcementId: string): Promise<readonly AnnouncementAudienceRow[]>;

  listAnnouncements(filters: {
    readonly institutionId: string;
    readonly status?: AnnouncementStatus | undefined;
    readonly limit?: number | undefined;
    readonly offset?: number | undefined;
  }): Promise<readonly AnnouncementRow[]>;

  updateAnnouncementStatus(
    id: string,
    update: {
      readonly status: AnnouncementStatus;
      readonly publishedAt?: Date | null;
      readonly archivedAt?: Date | null;
      readonly notificationId?: string | null;
    },
  ): Promise<AnnouncementRow>;

  // Announcement Receipts
  createAnnouncementReceipts(
    receipts: readonly {
      readonly announcementId: string;
      readonly userId: string;
      readonly deliveredAt?: Date | null;
    }[],
  ): Promise<void>;

  recordAnnouncementReceipt(
    announcementId: string,
    userId: string,
    update: {
      readonly readAt?: Date | null;
      readonly acknowledgedAt?: Date | null;
      readonly note?: string | null;
    },
  ): Promise<AnnouncementReceiptRow>;

  getAnnouncementReceipt(announcementId: string, userId: string): Promise<AnnouncementReceiptRow | null>;

  listAnnouncementReceipts(announcementId: string): Promise<readonly AnnouncementReceiptRow[]>;

  // Preferences
  getNotificationPreferences(
    userId: string,
    category?: string | null,
  ): Promise<NotificationPreferenceRow | null>;

  upsertNotificationPreferences(
    userId: string,
    preference: {
      readonly category?: string | null;
      readonly inAppEnabled: boolean;
      readonly emailEnabled: boolean;
      readonly quietHoursStart?: string | null;
      readonly quietHoursEnd?: string | null;
      readonly minimumPriority: NotificationPriority;
    },
  ): Promise<NotificationPreferenceRow>;

  // Delivery Audit Logs
  listDeliveryLogs(filters: {
    readonly institutionId?: string | undefined;
    readonly notificationId?: string | undefined;
    readonly recipientUserId?: string | undefined;
    readonly status?: NotificationDeliveryStatus | undefined;
    readonly limit?: number | undefined;
    readonly offset?: number | undefined;
  }): Promise<{ readonly deliveries: readonly NotificationDeliveryRow[]; readonly total: number }>;
}
