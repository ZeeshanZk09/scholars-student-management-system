/**
 * Communication Validation Schemas
 *
 * `PRD.md` MODULE 26, 27 and `RULES.md` §45, §46, §47.
 * Layer rules (`src/modules/README.md`): Boundary validation schemas using Zod.
 */

import { z } from "zod";

import { nonEmptyText, optionalId, optionalText } from "@/shared/validation/fields";
import {
  ANNOUNCEMENT_STATUSES,
  ANNOUNCEMENT_TYPES,
  MATCH_MODES,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_PRIORITIES,
} from "../domain/communication-rules";

const uuid = z.string().uuid("A valid identifier is required.");

/* -------------------------------------------------------------------------- */
/* Audience Schema                                                            */
/* -------------------------------------------------------------------------- */

export const AnnouncementAudienceItemSchema = z
  .object({
    audienceType: z.enum(NOTIFICATION_AUDIENCES),
    audienceId: optionalId,
    matchMode: z.enum(MATCH_MODES).default("any"),
  })
  .refine(
    (data) => {
      if (data.audienceType === "everyone") {
        return !data.audienceId;
      }
      return Boolean(data.audienceId && data.audienceId.length > 0);
    },
    {
      message: "Please select a target group, section, role, or user.",
      path: ["audienceId"],
    },
  );

export type AnnouncementAudienceItemInput = z.infer<typeof AnnouncementAudienceItemSchema>;

/* -------------------------------------------------------------------------- */
/* Create Announcement Schema                                                 */
/* -------------------------------------------------------------------------- */

export const CreateAnnouncementData = z
  .object({
    institutionId: uuid,
    campusId: optionalId,
    academicSessionId: optionalId,
    title: nonEmptyText("Announcement title", 200),
    body: nonEmptyText("Announcement content", 5000),
    priority: z.enum(NOTIFICATION_PRIORITIES).default("normal"),
    announcementType: z.enum(ANNOUNCEMENT_TYPES).default("all"),
    requiresAcknowledgement: z.boolean().default(false),
    acknowledgeBy: z
      .string()
      .nullish()
      .transform((val) => (val && val.trim().length > 0 ? new Date(val) : null)),
    publishAt: z
      .string()
      .nullish()
      .transform((val) => (val && val.trim().length > 0 ? new Date(val) : null)),
    attachmentKeys: z.array(z.string()).default([]),
    audiences: z.array(AnnouncementAudienceItemSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.requiresAcknowledgement) {
        return Boolean(data.acknowledgeBy && !isNaN(data.acknowledgeBy.getTime()));
      }
      return true;
    },
    {
      message: "Please provide an acknowledgement deadline when confirmation is required.",
      path: ["acknowledgeBy"],
    },
  )
  .refine(
    (data) => {
      if (data.requiresAcknowledgement && data.acknowledgeBy) {
        const publishTime = data.publishAt ? data.publishAt.getTime() : Date.now();
        return data.acknowledgeBy.getTime() > publishTime;
      }
      return true;
    },
    {
      message: "Acknowledgement deadline must be scheduled in the future.",
      path: ["acknowledgeBy"],
    },
  );

export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementData>;

/* -------------------------------------------------------------------------- */
/* Publish Announcement Schema                                                */
/* -------------------------------------------------------------------------- */

export const PublishAnnouncementData = z.object({
  announcementId: uuid,
});

export type PublishAnnouncementInput = z.infer<typeof PublishAnnouncementData>;

/* -------------------------------------------------------------------------- */
/* Acknowledge Announcement Schema                                            */
/* -------------------------------------------------------------------------- */

export const AcknowledgeAnnouncementData = z.object({
  announcementId: uuid,
  note: optionalText(500),
});

export type AcknowledgeAnnouncementInput = z.infer<typeof AcknowledgeAnnouncementData>;

/* -------------------------------------------------------------------------- */
/* Send Direct Notification Schema                                            */
/* -------------------------------------------------------------------------- */

export const SendNotificationData = z
  .object({
    institutionId: uuid,
    sourceModule: nonEmptyText("Source module", 32),
    eventKey: nonEmptyText("Event key", 64),
    relatedEntityId: optionalId,
    channel: z.enum(NOTIFICATION_CHANNELS).default("in_app"),
    audienceType: z.enum(NOTIFICATION_AUDIENCES),
    audienceId: optionalId,
    title: nonEmptyText("Notification title", 300),
    body: nonEmptyText("Notification body", 2000),
    payload: z.record(z.string(), z.unknown()).nullish(),
    actionUrl: optionalText(512),
    requiredPermissionKey: optionalText(96),
    scheduledFor: z
      .string()
      .nullish()
      .transform((val) => (val && val.trim().length > 0 ? new Date(val) : null)),
    expiresAt: z
      .string()
      .nullish()
      .transform((val) => (val && val.trim().length > 0 ? new Date(val) : null)),
  })
  .refine(
    (data) => {
      if (data.audienceType !== "everyone") {
        return Boolean(data.audienceId && data.audienceId.length > 0);
      }
      return true;
    },
    {
      message: "An audience identifier is required for targeted notifications.",
      path: ["audienceId"],
    },
  )
  .refine(
    (data) => {
      // Database check constraint: channel <> 'in_app' or scheduled_for is null
      if (data.channel === "in_app" && data.scheduledFor !== null) {
        return false;
      }
      return true;
    },
    {
      message: "In-app notifications cannot be scheduled for deferred delivery.",
      path: ["scheduledFor"],
    },
  );

export type SendNotificationInput = z.infer<typeof SendNotificationData>;

/* -------------------------------------------------------------------------- */
/* Update Notification Preferences Schema                                     */
/* -------------------------------------------------------------------------- */

const timeFormatRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const UpdateNotificationPreferencesData = z
  .object({
    category: z.enum(NOTIFICATION_CATEGORIES).nullish(),
    inAppEnabled: z.boolean().default(true),
    emailEnabled: z.boolean().default(true),
    quietHoursStart: z
      .string()
      .nullish()
      .transform((val) => (val && val.trim().length > 0 ? val.trim() : null)),
    quietHoursEnd: z
      .string()
      .nullish()
      .transform((val) => (val && val.trim().length > 0 ? val.trim() : null)),
    minimumPriority: z.enum(NOTIFICATION_PRIORITIES).default("normal"),
  })
  .refine(
    (data) => {
      // Quiet hours start and end must both be present or both be null
      const hasStart = Boolean(data.quietHoursStart);
      const hasEnd = Boolean(data.quietHoursEnd);
      return (hasStart && hasEnd) || (!hasStart && !hasEnd);
    },
    {
      message: "Both quiet hours start and end times must be provided together.",
      path: ["quietHoursEnd"],
    },
  )
  .refine(
    (data) => {
      if (data.quietHoursStart && !timeFormatRegex.test(data.quietHoursStart)) {
        return false;
      }
      if (data.quietHoursEnd && !timeFormatRegex.test(data.quietHoursEnd)) {
        return false;
      }
      return true;
    },
    {
      message: "Quiet hours time must be in 24-hour HH:mm format (e.g. 22:00).",
      path: ["quietHoursStart"],
    },
  );

export type UpdateNotificationPreferencesInput = z.infer<
  typeof UpdateNotificationPreferencesData
>;

/* -------------------------------------------------------------------------- */
/* Queries & Action Input Schemas                                             */
/* -------------------------------------------------------------------------- */

export const MarkDeliveryReadData = z.object({
  deliveryId: uuid,
});

export type MarkDeliveryReadInput = z.infer<typeof MarkDeliveryReadData>;

export const ListDeliveryLogsQueryData = z.object({
  institutionId: optionalId,
  notificationId: optionalId,
  recipientUserId: optionalId,
  status: z.enum(NOTIFICATION_DELIVERY_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type ListDeliveryLogsQueryInput = z.infer<typeof ListDeliveryLogsQueryData>;

export const ListAnnouncementsQueryData = z.object({
  institutionId: uuid,
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type ListAnnouncementsQueryInput = z.infer<typeof ListAnnouncementsQueryData>;
