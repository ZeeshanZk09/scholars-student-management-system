/**
 * In-memory test fakes for communication module ports.
 *
 * Layer rules (`src/modules/README.md`): Used for pure application testing.
 */

import type {
  AnnouncementAudienceRow,
  AnnouncementReceiptRow,
  AnnouncementRow,
  CommunicationStore,
  NotificationDeliveryRow,
  NotificationPreferenceRow,
  NotificationRow,
  RecipientResolverPort,
  ResolvedRecipient,
} from "../ports";
import type {
  AnnouncementStatus,
  MatchMode,
  NotificationAudience,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
} from "../../domain/communication-rules";

export class FakeRecipientResolver implements RecipientResolverPort {
  public recipientsByAudience: Map<string, ResolvedRecipient[]> = new Map();

  setRecipients(audienceType: NotificationAudience, audienceId: string | null, recipients: ResolvedRecipient[]): void {
    const key = `${audienceType}:${audienceId ?? "all"}`;
    this.recipientsByAudience.set(key, recipients);
  }

  async resolveRecipientsForAudience(params: {
    readonly institutionId: string;
    readonly audienceType: NotificationAudience;
    readonly audienceId?: string | null;
  }): Promise<readonly ResolvedRecipient[]> {
    const key = `${params.audienceType}:${params.audienceId ?? "all"}`;
    return this.recipientsByAudience.get(key) ?? [];
  }
}

export class FakeCommunicationStore implements CommunicationStore {
  public notifications: Map<string, NotificationRow> = new Map();
  public deliveries: Map<string, NotificationDeliveryRow> = new Map();
  public announcements: Map<string, AnnouncementRow> = new Map();
  public announcementAudiences: Map<string, AnnouncementAudienceRow[]> = new Map();
  public announcementReceipts: Map<string, AnnouncementReceiptRow> = new Map();
  public preferences: Map<string, NotificationPreferenceRow> = new Map();

  private nextId(_prefix?: string): string {
    void _prefix;
    return crypto.randomUUID();
  }

  // Notifications
  async createNotification(
    data: Omit<NotificationRow, "id" | "createdAt" | "updatedAt" | "version">,
  ): Promise<NotificationRow> {
    const id = this.nextId("notif");
    const now = new Date();
    const row: NotificationRow = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.notifications.set(id, row);
    return row;
  }

  async getNotificationById(id: string): Promise<NotificationRow | null> {
    return this.notifications.get(id) ?? null;
  }

  async findNotificationByIdempotency(
    eventKey: string,
    relatedEntityId: string | null,
    channel: NotificationChannel,
  ): Promise<NotificationRow | null> {
    for (const notif of this.notifications.values()) {
      if (
        notif.eventKey === eventKey &&
        notif.relatedEntityId === relatedEntityId &&
        notif.channel === channel &&
        notif.scheduledFor === null
      ) {
        return notif;
      }
    }
    return null;
  }

  // Deliveries
  async createDeliveries(
    deliveries: readonly Omit<NotificationDeliveryRow, "id" | "createdAt" | "updatedAt" | "version">[],
  ): Promise<readonly NotificationDeliveryRow[]> {
    const created: NotificationDeliveryRow[] = [];
    const now = new Date();
    for (const d of deliveries) {
      const id = this.nextId("del");
      const notif = this.notifications.get(d.notificationId);
      const row: NotificationDeliveryRow = {
        ...d,
        id,
        createdAt: now,
        updatedAt: now,
        version: 1,
        notificationTitle: notif?.title,
        notificationBody: notif?.body,
        notificationActionUrl: notif?.actionUrl,
      };
      this.deliveries.set(id, row);
      created.push(row);
    }
    return created;
  }

  async listDeliveriesForUser(
    userId: string,
    options?: {
      readonly status?: NotificationDeliveryStatus;
      readonly limit?: number;
      readonly offset?: number;
    },
  ): Promise<{ readonly deliveries: readonly NotificationDeliveryRow[]; readonly total: number }> {
    const all = Array.from(this.deliveries.values()).filter(
      (d) => d.recipientUserId === userId && (!options?.status || d.status === options.status),
    );
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return {
      deliveries: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  async markDeliveryAsRead(deliveryId: string, userId: string): Promise<NotificationDeliveryRow> {
    const existing = this.deliveries.get(deliveryId);
    if (!existing || existing.recipientUserId !== userId) {
      throw new Error("Delivery record not found.");
    }
    const updated: NotificationDeliveryRow = {
      ...existing,
      status: "read",
      deliveredAt: existing.deliveredAt ?? new Date(),
      readAt: new Date(),
      updatedAt: new Date(),
      version: existing.version + 1,
    };
    this.deliveries.set(deliveryId, updated);
    return updated;
  }

  async markAllDeliveriesAsRead(userId: string): Promise<number> {
    let count = 0;
    const now = new Date();
    for (const [id, d] of this.deliveries.entries()) {
      if (d.recipientUserId === userId && d.status !== "read" && d.status !== "suppressed") {
        this.deliveries.set(id, {
          ...d,
          status: "read",
          deliveredAt: d.deliveredAt ?? now,
          readAt: now,
          updatedAt: now,
          version: d.version + 1,
        });
        count++;
      }
    }
    return count;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return Array.from(this.deliveries.values()).filter(
      (d) => d.recipientUserId === userId && d.status !== "read" && d.status !== "suppressed",
    ).length;
  }

  // Announcements
  async createAnnouncement(
    data: Omit<
      AnnouncementRow,
      "id" | "createdAt" | "updatedAt" | "version" | "publishedAt" | "archivedAt" | "notificationId"
    >,
    audiences?: readonly {
      readonly audienceType: NotificationAudience;
      readonly audienceId?: string | null;
      readonly matchMode?: MatchMode;
    }[],
  ): Promise<AnnouncementRow> {
    const id = this.nextId("ann");
    const now = new Date();
    const row: AnnouncementRow = {
      ...data,
      id,
      notificationId: null,
      publishedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.announcements.set(id, row);

    if (audiences && audiences.length > 0) {
      const audRows: AnnouncementAudienceRow[] = audiences.map((a) => ({
        id: this.nextId("aud"),
        announcementId: id,
        audienceType: a.audienceType,
        audienceId: a.audienceId ?? null,
        matchMode: a.matchMode ?? "any",
      }));
      this.announcementAudiences.set(id, audRows);
    }

    return row;
  }

  async getAnnouncement(id: string): Promise<AnnouncementRow | null> {
    return this.announcements.get(id) ?? null;
  }

  async getAnnouncementAudiences(announcementId: string): Promise<readonly AnnouncementAudienceRow[]> {
    return this.announcementAudiences.get(announcementId) ?? [];
  }

  async listAnnouncements(filters: {
    readonly institutionId: string;
    readonly status?: AnnouncementStatus;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<readonly AnnouncementRow[]> {
    const all = Array.from(this.announcements.values()).filter(
      (a) => a.institutionId === filters.institutionId && (!filters.status || a.status === filters.status),
    );
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    return all.slice(offset, offset + limit);
  }

  async updateAnnouncementStatus(
    id: string,
    update: {
      readonly status: AnnouncementStatus;
      readonly publishedAt?: Date | null;
      readonly archivedAt?: Date | null;
      readonly notificationId?: string | null;
    },
  ): Promise<AnnouncementRow> {
    const existing = this.announcements.get(id);
    if (!existing) throw new Error("Announcement not found.");
    const updated: AnnouncementRow = {
      ...existing,
      status: update.status,
      publishedAt: update.publishedAt !== undefined ? update.publishedAt : existing.publishedAt,
      archivedAt: update.archivedAt !== undefined ? update.archivedAt : existing.archivedAt,
      notificationId:
        update.notificationId !== undefined ? update.notificationId : existing.notificationId,
      updatedAt: new Date(),
      version: existing.version + 1,
    };
    this.announcements.set(id, updated);
    return updated;
  }

  // Announcement Receipts
  async createAnnouncementReceipts(
    receipts: readonly {
      readonly announcementId: string;
      readonly userId: string;
      readonly deliveredAt?: Date | null;
    }[],
  ): Promise<void> {
    const now = new Date();
    for (const r of receipts) {
      const key = `${r.announcementId}:${r.userId}`;
      this.announcementReceipts.set(key, {
        id: this.nextId("rcpt"),
        announcementId: r.announcementId,
        userId: r.userId,
        deliveredAt: r.deliveredAt ?? now,
        readAt: null,
        acknowledgedAt: null,
        acknowledgementNote: null,
        createdAt: now,
      });
    }
  }

  async recordAnnouncementReceipt(
    announcementId: string,
    userId: string,
    update: {
      readonly readAt?: Date | null;
      readonly acknowledgedAt?: Date | null;
      readonly note?: string | null;
    },
  ): Promise<AnnouncementReceiptRow> {
    const key = `${announcementId}:${userId}`;
    const existing = this.announcementReceipts.get(key);
    const now = new Date();
    const row: AnnouncementReceiptRow = {
      id: existing?.id ?? this.nextId("rcpt"),
      announcementId,
      userId,
      deliveredAt: existing?.deliveredAt ?? now,
      readAt: update.readAt !== undefined ? update.readAt : (existing?.readAt ?? now),
      acknowledgedAt:
        update.acknowledgedAt !== undefined ? update.acknowledgedAt : (existing?.acknowledgedAt ?? null),
      acknowledgementNote:
        update.note !== undefined ? update.note : (existing?.acknowledgementNote ?? null),
      createdAt: existing?.createdAt ?? now,
    };
    this.announcementReceipts.set(key, row);
    return row;
  }

  async getAnnouncementReceipt(announcementId: string, userId: string): Promise<AnnouncementReceiptRow | null> {
    const key = `${announcementId}:${userId}`;
    return this.announcementReceipts.get(key) ?? null;
  }

  async listAnnouncementReceipts(announcementId: string): Promise<readonly AnnouncementReceiptRow[]> {
    return Array.from(this.announcementReceipts.values()).filter(
      (r) => r.announcementId === announcementId,
    );
  }

  // Preferences
  async getNotificationPreferences(
    userId: string,
    category?: string | null,
  ): Promise<NotificationPreferenceRow | null> {
    const key = `${userId}:${category ?? "default"}`;
    return this.preferences.get(key) ?? null;
  }

  async upsertNotificationPreferences(
    userId: string,
    preference: {
      readonly category?: string | null;
      readonly inAppEnabled: boolean;
      readonly emailEnabled: boolean;
      readonly quietHoursStart?: string | null;
      readonly quietHoursEnd?: string | null;
      readonly minimumPriority: NotificationPriority;
    },
  ): Promise<NotificationPreferenceRow> {
    const key = `${userId}:${preference.category ?? "default"}`;
    const existing = this.preferences.get(key);
    const now = new Date();
    const row: NotificationPreferenceRow = {
      id: existing?.id ?? this.nextId("pref"),
      userId,
      category: preference.category ?? null,
      inAppEnabled: preference.inAppEnabled,
      emailEnabled: preference.emailEnabled,
      quietHoursStart: preference.quietHoursStart ?? null,
      quietHoursEnd: preference.quietHoursEnd ?? null,
      minimumPriority: preference.minimumPriority,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      version: (existing?.version ?? 0) + 1,
    };
    this.preferences.set(key, row);
    return row;
  }

  // Delivery Logs
  async listDeliveryLogs(filters: {
    readonly institutionId?: string;
    readonly notificationId?: string;
    readonly recipientUserId?: string;
    readonly status?: NotificationDeliveryStatus;
    readonly limit?: number;
    readonly offset?: number;
  }): Promise<{ readonly deliveries: readonly NotificationDeliveryRow[]; readonly total: number }> {
    let all = Array.from(this.deliveries.values());
    if (filters.notificationId) {
      all = all.filter((d) => d.notificationId === filters.notificationId);
    }
    if (filters.recipientUserId) {
      all = all.filter((d) => d.recipientUserId === filters.recipientUserId);
    }
    if (filters.status) {
      all = all.filter((d) => d.status === filters.status);
    }

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    return {
      deliveries: all.slice(offset, offset + limit),
      total: all.length,
    };
  }
}
