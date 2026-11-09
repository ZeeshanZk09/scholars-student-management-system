/**
 * Communication Domain Rules
 *
 * `PRD.md` MODULE 26, 27 and `RULES.md` §45, §46, §47.
 * Layer rules (`src/modules/README.md`): Pure domain logic. May only import from `shared/`.
 *
 * ## Principles
 * 1. **Targeted**: Supports audience types (everyone, role, department, class, section, student, guardian, teacher, user).
 * 2. **Permission-aware**: Being in audience is not authorization; permissions guard delivery.
 * 3. **Context-aware**: Provides deep-link action URLs to landing records.
 * 4. **Trackable**: Explicit delivery states (pending, delivered, read, failed, suppressed) and announcement receipts.
 * 5. **Non-duplicative (Idempotent)**: Stable event keys prevent unintentional duplicate dispatches.
 */

import { BusinessRuleError, ValidationError } from "@/shared/errors";

/* -------------------------------------------------------------------------- */
/* Types and Constants                                                        */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_CHANNELS = ["in_app", "email", "both"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_AUDIENCES = [
  "user",
  "role",
  "department",
  "class",
  "section",
  "student",
  "guardian",
  "teacher",
  "everyone",
] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_DELIVERY_STATUSES = [
  "pending",
  "delivered",
  "read",
  "failed",
  "suppressed",
] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_CATEGORIES = [
  "leave",
  "announcement",
  "grades",
  "attendance",
  "fees",
  "complaint",
  "diary",
  "admission",
  "system",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const ANNOUNCEMENT_STATUSES = ["draft", "published", "archived"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_TYPES = [
  "all",
  "students",
  "guardians",
  "staff",
  "teachers",
  "custom",
] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export const MATCH_MODES = ["any", "all"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

/* -------------------------------------------------------------------------- */
/* Human-readable non-technical labels & tones                                */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_AUDIENCE_LABELS: Readonly<Record<NotificationAudience, string>> = {
  everyone: "All School Members",
  role: "Specific Role",
  department: "Department Staff",
  class: "Class Families",
  section: "Section Families",
  student: "Student",
  guardian: "Parent / Guardian",
  teacher: "Teaching Faculty",
  user: "Individual Account",
};

export const NOTIFICATION_PRIORITY_LABELS: Readonly<Record<NotificationPriority, string>> = {
  low: "Low Priority",
  normal: "Standard",
  high: "Important",
  critical: "Urgent",
};

export const NOTIFICATION_PRIORITY_TONES: Readonly<
  Record<NotificationPriority, "neutral" | "blue" | "amber" | "rose">
> = {
  low: "neutral",
  normal: "blue",
  high: "amber",
  critical: "rose",
};

export const ANNOUNCEMENT_STATUS_LABELS: Readonly<Record<AnnouncementStatus, string>> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const ANNOUNCEMENT_STATUS_TONES: Readonly<
  Record<AnnouncementStatus, "amber" | "emerald" | "neutral">
> = {
  draft: "amber",
  published: "emerald",
  archived: "neutral",
};

export const DELIVERY_STATUS_LABELS: Readonly<Record<NotificationDeliveryStatus, string>> = {
  pending: "Queued",
  delivered: "Delivered",
  read: "Read",
  failed: "Delivery Failed",
  suppressed: "Suppressed by Preferences",
};

export const DELIVERY_STATUS_TONES: Readonly<
  Record<NotificationDeliveryStatus, "amber" | "blue" | "emerald" | "rose" | "neutral">
> = {
  pending: "amber",
  delivered: "blue",
  read: "emerald",
  failed: "rose",
  suppressed: "neutral",
};

export const NOTIFICATION_CATEGORY_LABELS: Readonly<Record<NotificationCategory, string>> = {
  leave: "Leave & Absence Updates",
  announcement: "General Announcements",
  grades: "Academic Marks & Exam Results",
  attendance: "Daily Attendance Alerts",
  fees: "Fee Invoices & Payment Reminders",
  complaint: "Feedback & Complaints",
  diary: "Homework & Daily Diary",
  admission: "Admissions & Inquiries",
  system: "System & Account Notices",
};

/* -------------------------------------------------------------------------- */
/* State Machines                                                             */
/* -------------------------------------------------------------------------- */

const LEGAL_ANNOUNCEMENT_TRANSITIONS: Readonly<Record<AnnouncementStatus, readonly AnnouncementStatus[]>> = {
  draft: ["published", "archived"],
  published: ["archived"],
  archived: [],
};

export function canTransitionAnnouncementStatus(from: AnnouncementStatus, to: AnnouncementStatus): boolean {
  if (from === to) return true;
  const allowed = LEGAL_ANNOUNCEMENT_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

export function assertAnnouncementStatusTransition(from: AnnouncementStatus, to: AnnouncementStatus): void {
  if (!canTransitionAnnouncementStatus(from, to)) {
    const userMessage = `This announcement is already ${ANNOUNCEMENT_STATUS_LABELS[from].toLowerCase()} and cannot be changed to ${ANNOUNCEMENT_STATUS_LABELS[to].toLowerCase()}.`;
    throw new BusinessRuleError(`Illegal announcement transition from '${from}' to '${to}'.`, {
      userMessage,
      details: { status: `Current status "${from}" cannot move to "${to}".` },
    });
  }
}

const LEGAL_DELIVERY_TRANSITIONS: Readonly<
  Record<NotificationDeliveryStatus, readonly NotificationDeliveryStatus[]>
> = {
  pending: ["delivered", "failed", "suppressed"],
  delivered: ["read", "failed"],
  failed: ["pending"], // allows manual retry
  suppressed: [],      // terminal suppression
  read: [],            // terminal read
};

export function canTransitionDeliveryStatus(
  from: NotificationDeliveryStatus,
  to: NotificationDeliveryStatus,
): boolean {
  if (from === to) return true;
  const allowed = LEGAL_DELIVERY_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

export function assertDeliveryStatusTransition(
  from: NotificationDeliveryStatus,
  to: NotificationDeliveryStatus,
): void {
  if (!canTransitionDeliveryStatus(from, to)) {
    const userMessage = `Delivery status cannot change from ${DELIVERY_STATUS_LABELS[from].toLowerCase()} to ${DELIVERY_STATUS_LABELS[to].toLowerCase()}.`;
    throw new BusinessRuleError(`Illegal delivery status transition from '${from}' to '${to}'.`, {
      userMessage,
      details: { status: `Current status "${from}" cannot move to "${to}".` },
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Audience Target Invariants                                                 */
/* -------------------------------------------------------------------------- */

export function assertValidAudienceTarget(
  audienceType: NotificationAudience,
  audienceId: string | null | undefined,
): void {
  if (audienceType === "everyone") {
    if (audienceId !== null && audienceId !== undefined && audienceId.trim().length > 0) {
      throw new ValidationError("An announcement targeted to everyone must not specify an audience identifier.", {
        audienceId: ["Audience ID must be empty when broadcasting to everyone."],
      });
    }
    return;
  }

  if (audienceId === null || audienceId === undefined || audienceId.trim().length === 0) {
    throw new ValidationError(`A specific target must be selected for ${NOTIFICATION_AUDIENCE_LABELS[audienceType].toLowerCase()}.`, {
      audienceId: ["Please select a target group, section, role, or user."],
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Announcement Validation                                                    */
/* -------------------------------------------------------------------------- */

export interface AnnouncementInputCheck {
  readonly title: string;
  readonly body: string;
  readonly priority: NotificationPriority;
  readonly announcementType: AnnouncementType;
  readonly requiresAcknowledgement: boolean;
  readonly acknowledgeBy?: Date | string | null;
  readonly publishAt?: Date | string | null;
}

export function assertValidAnnouncementDraft(data: AnnouncementInputCheck): void {
  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError("Announcement title is required.", {
      title: ["Please enter an announcement title."],
    });
  }

  if (data.title.trim().length > 200) {
    throw new ValidationError("Announcement title must be 200 characters or fewer.", {
      title: ["Title is too long (maximum 200 characters)."],
    });
  }

  if (!data.body || data.body.trim().length === 0) {
    throw new ValidationError("Announcement message content is required.", {
      body: ["Please enter the announcement message content."],
    });
  }

  if (data.requiresAcknowledgement) {
    if (!data.acknowledgeBy) {
      throw new ValidationError("Acknowledgement deadline is required when confirmation is requested.", {
        acknowledgeBy: ["Please select an acknowledgement deadline."],
      });
    }

    const ackDate = new Date(data.acknowledgeBy);
    if (isNaN(ackDate.getTime())) {
      throw new ValidationError("Invalid acknowledgement deadline date.", {
        acknowledgeBy: ["Please provide a valid date and time for acknowledgement."],
      });
    }

    const publishDate = data.publishAt ? new Date(data.publishAt) : new Date();
    if (ackDate.getTime() <= publishDate.getTime()) {
      throw new ValidationError("Acknowledgement deadline must be after the publication date.", {
        acknowledgeBy: ["Deadline must be scheduled in the future."],
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Notification Preferences Evaluation                                        */
/* -------------------------------------------------------------------------- */

export interface UserPreferenceSettings {
  readonly inAppEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
  readonly minimumPriority: NotificationPriority;
}

const PRIORITY_RANKS: Readonly<Record<NotificationPriority, number>> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

export interface PreferenceEvaluationResult {
  readonly shouldDeliver: boolean;
  readonly suppressed: boolean;
  readonly suppressionReason?: string;
  readonly isQuietHours: boolean;
}

/**
 * Checks if a given time "HH:mm" falls inside the quiet hours window.
 */
export function isWithinQuietHours(
  currentTimeStr: string,
  startStr: string | null,
  endStr: string | null,
): boolean {
  if (!startStr || !endStr) return false;

  const toMinutes = (time: string): number => {
    const parts = time.split(":");
    const hours = parseInt(parts[0] ?? "0", 10);
    const mins = parseInt(parts[1] ?? "0", 10);
    return hours * 60 + mins;
  };

  const current = toMinutes(currentTimeStr);
  const start = toMinutes(startStr);
  const end = toMinutes(endStr);

  if (start < end) {
    // Window within the same day e.g. 13:00 to 15:00
    return current >= start && current <= end;
  } else {
    // Window spanning overnight e.g. 22:00 to 07:00
    return current >= start || current <= end;
  }
}

/**
 * Evaluates whether a notification should be delivered or suppressed for a recipient.
 *
 * Rules:
 * 1. Critical notifications always bypass category disabled flags and quiet hours.
 * 2. If notification priority is below recipient's minimum priority threshold, suppress.
 * 3. If the specific channel is disabled in user preferences, suppress.
 * 4. If current time is within quiet hours and priority is not critical/high, suppress with note.
 */
export function evaluateNotificationPreferences(params: {
  readonly preferences: UserPreferenceSettings | null;
  readonly channel: NotificationChannel;
  readonly priority: NotificationPriority;
  readonly currentTime?: Date;
}): PreferenceEvaluationResult {
  const { preferences, channel, priority, currentTime = new Date() } = params;

  if (!preferences) {
    // No custom preferences: default is full delivery
    return { shouldDeliver: true, suppressed: false, isQuietHours: false };
  }

  // 1. Critical priority overrides channel toggles and quiet hours
  if (priority === "critical") {
    return { shouldDeliver: true, suppressed: false, isQuietHours: false };
  }

  // 2. Minimum priority threshold check
  const notificationRank = PRIORITY_RANKS[priority];
  const minimumRank = PRIORITY_RANKS[preferences.minimumPriority];
  if (notificationRank < minimumRank) {
    return {
      shouldDeliver: false,
      suppressed: true,
      suppressionReason: `Priority '${NOTIFICATION_PRIORITY_LABELS[priority]}' is below recipient's minimum threshold '${NOTIFICATION_PRIORITY_LABELS[preferences.minimumPriority]}'`,
      isQuietHours: false,
    };
  }

  // 3. Channel toggles check
  if (channel === "in_app" && !preferences.inAppEnabled) {
    return {
      shouldDeliver: false,
      suppressed: true,
      suppressionReason: "In-app notifications are disabled in recipient settings",
      isQuietHours: false,
    };
  }

  if (channel === "email" && !preferences.emailEnabled) {
    return {
      shouldDeliver: false,
      suppressed: true,
      suppressionReason: "Email notifications are disabled in recipient settings",
      isQuietHours: false,
    };
  }

  // 4. Quiet hours check
  if (preferences.quietHoursStart && preferences.quietHoursEnd) {
    const hours = String(currentTime.getHours()).padStart(2, "0");
    const minutes = String(currentTime.getMinutes()).padStart(2, "0");
    const currentTimeStr = `${hours}:${minutes}`;

    const quiet = isWithinQuietHours(
      currentTimeStr,
      preferences.quietHoursStart,
      preferences.quietHoursEnd,
    );

    if (quiet && priority !== "high") {
      return {
        shouldDeliver: false,
        suppressed: true,
        suppressionReason: `Suppressed during recipient quiet hours (${preferences.quietHoursStart} - ${preferences.quietHoursEnd})`,
        isQuietHours: true,
      };
    }
  }

  return { shouldDeliver: true, suppressed: false, isQuietHours: false };
}

/* -------------------------------------------------------------------------- */
/* Idempotency & Deduplication Helpers                                        */
/* -------------------------------------------------------------------------- */

/**
 * Builds a deterministic idempotency event key for notifications.
 * `RULES.md` §47: the same business event must not generate duplicate notifications.
 */
export function buildNotificationEventKey(
  sourceModule: string,
  eventKey: string,
  relatedEntityId?: string | null,
): string {
  const cleanModule = sourceModule.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");
  const cleanKey = eventKey.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");
  if (relatedEntityId) {
    return `${cleanModule}:${cleanKey}:${relatedEntityId}`;
  }
  return `${cleanModule}:${cleanKey}`;
}

/**
 * Announcement publish event key.
 */
export function buildAnnouncementEventKey(announcementId: string): string {
  return `communication:announcement_published:${announcementId}`;
}
