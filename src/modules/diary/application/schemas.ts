/**
 * Daily Diary application schemas (`PRD.md` MODULE 23/24, `src/db/schema/diary.ts`).
 */
import { z } from "zod";

import {
  VALID_ATTACHMENT_TYPES,
  VALID_DIARY_FREQUENCIES,
  VALID_DIARY_STATUSES,
  VALID_READ_VIAS,
  VALID_VIEWER_KINDS,
  type DiaryAttachmentType,
  type DiaryFrequency,
  type DiaryReadVia,
  type DiaryStatus,
  type DiaryViewerKind,
} from "../domain/diary-rules";

export const diaryAttachmentInputSchema = z
  .object({
    label: z.string().trim().min(1, "Attachment label is required.").max(200),
    attachmentType: z.enum(VALID_ATTACHMENT_TYPES as unknown as [DiaryAttachmentType, ...DiaryAttachmentType[]]),
    storageKey: z.string().trim().max(512).optional().nullable(),
    externalUrl: z.string().trim().url("Invalid URL format.").max(2048).optional().nullable(),
    contentType: z.string().trim().max(120).optional().nullable(),
    sizeBytes: z.number().int().positive("File size must be positive.").optional().nullable(),
    uploadedByUserId: z.string().uuid("Invalid user ID."),
  })
  .refine(
    (data) => {
      const hasStorage = Boolean(data.storageKey && data.storageKey.trim() !== "");
      const hasUrl = Boolean(data.externalUrl && data.externalUrl.trim() !== "");
      return hasStorage !== hasUrl;
    },
    {
      message: "Provide either a file storage key or an external URL, but not both.",
      path: ["storageKey"],
    },
  )
  .refine(
    (data) => {
      if (data.attachmentType === "link") {
        return Boolean(data.externalUrl && data.externalUrl.trim() !== "");
      }
      return Boolean(data.storageKey && data.storageKey.trim() !== "");
    },
    {
      message: "Link attachments require an external URL; file attachments require a storage key.",
      path: ["attachmentType"],
    },
  );

export type DiaryAttachmentInput = z.infer<typeof diaryAttachmentInputSchema>;

export const uploadAttachmentSchema = diaryAttachmentInputSchema.extend({
  diaryId: z.string().uuid("Invalid diary ID."),
});

export type UploadAttachmentInput = z.infer<typeof uploadAttachmentSchema>;

export const postDiaryEntrySchema = z
  .object({
    institutionId: z.string().uuid("Invalid institution ID."),
    academicSessionId: z.string().uuid("Invalid academic session ID."),
    subjectId: z.string().uuid("Invalid subject ID."),
    diaryDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format."),
    title: z.string().trim().min(1, "Title is required.").max(200),
    content: z.string().trim().min(1, "Homework content is required."),
    classId: z.string().uuid("Invalid class ID.").optional().nullable(),
    sectionId: z.string().uuid("Invalid section ID.").optional().nullable(),
    status: z.enum(VALID_DIARY_STATUSES as unknown as [DiaryStatus, ...DiaryStatus[]]).default("draft"),
    assignedAt: z.date().optional().nullable(),
    assignedByTeacherUserId: z.string().uuid("Invalid teacher user ID.").optional().nullable(),
    attachments: z.array(diaryAttachmentInputSchema).optional().default([]),
  })
  .refine(
    (data) => {
      const hasClass = Boolean(data.classId && data.classId.trim() !== "");
      const hasSection = Boolean(data.sectionId && data.sectionId.trim() !== "");
      return hasClass || hasSection;
    },
    {
      message: "At least one of classId or sectionId must be specified.",
      path: ["sectionId"],
    },
  );

export type PostDiaryEntryInput = z.infer<typeof postDiaryEntrySchema>;

export const updateDiaryEntrySchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty.").max(200).optional(),
  content: z.string().trim().min(1, "Content cannot be empty.").optional(),
  classId: z.string().uuid("Invalid class ID.").optional().nullable(),
  sectionId: z.string().uuid("Invalid section ID.").optional().nullable(),
  status: z.enum(VALID_DIARY_STATUSES as unknown as [DiaryStatus, ...DiaryStatus[]]).optional(),
  closedAt: z.date().optional().nullable(),
});

export type UpdateDiaryEntryInput = z.infer<typeof updateDiaryEntrySchema>;

export const assignDiarySchema = z.object({
  diaryId: z.string().uuid("Invalid diary ID."),
  assignedByTeacherUserId: z.string().uuid("Invalid assigning teacher user ID."),
});

export type AssignDiaryInput = z.infer<typeof assignDiarySchema>;

export const markDiaryReadSchema = z.object({
  diaryId: z.string().uuid("Invalid diary ID."),
  viewerKind: z.enum(VALID_VIEWER_KINDS as unknown as [DiaryViewerKind, ...DiaryViewerKind[]]),
  viewerId: z.string().uuid("Invalid viewer ID."),
  via: z.enum(VALID_READ_VIAS as unknown as [DiaryReadVia, ...DiaryReadVia[]]).default("portal"),
});

export type MarkDiaryReadInput = z.infer<typeof markDiaryReadSchema>;

export const acknowledgeDiarySchema = z.object({
  diaryAssignmentId: z.string().uuid("Invalid assignment ID."),
  acknowledgedByUserId: z.string().uuid("Invalid user ID."),
});

export type AcknowledgeDiaryInput = z.infer<typeof acknowledgeDiarySchema>;

export const listDiariesFilterSchema = z.object({
  institutionId: z.string().uuid("Invalid institution ID."),
  academicSessionId: z.string().uuid("Invalid academic session ID.").optional(),
  classId: z.string().uuid("Invalid class ID.").optional(),
  sectionId: z.string().uuid("Invalid section ID.").optional(),
  subjectId: z.string().uuid("Invalid subject ID.").optional(),
  diaryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format.")
    .optional(),
  startDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format.")
    .optional(),
  endDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format.")
    .optional(),
  status: z.enum(VALID_DIARY_STATUSES as unknown as [DiaryStatus, ...DiaryStatus[]]).optional(),
  query: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export type ListDiariesFilter = z.infer<typeof listDiariesFilterSchema>;

export const setNotificationPreferenceSchema = z
  .object({
    guardianUserId: z.string().uuid("Invalid guardian user ID."),
    subjectId: z.string().uuid("Invalid subject ID.").optional().nullable(),
    emailEnabled: z.boolean().default(true),
    diaryFrequency: z.enum(VALID_DIARY_FREQUENCIES as unknown as [DiaryFrequency, ...DiaryFrequency[]]).default("daily"),
    quietHoursStart: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM in 24-hour format.")
      .optional()
      .nullable(),
    quietHoursEnd: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM in 24-hour format.")
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      const hasStart = Boolean(data.quietHoursStart && data.quietHoursStart.trim() !== "");
      const hasEnd = Boolean(data.quietHoursEnd && data.quietHoursEnd.trim() !== "");
      return hasStart === hasEnd;
    },
    {
      message: "Quiet hours start and end must both be set or both omitted.",
      path: ["quietHoursStart"],
    },
  );

export type SetNotificationPreferenceInput = z.infer<typeof setNotificationPreferenceSchema>;

export const createSyllabusTopicSchema = z.object({
  subjectId: z.string().uuid("Invalid subject ID."),
  classId: z.string().uuid("Invalid class ID.").optional().nullable(),
  chapterNumber: z.number().int().positive("Chapter number must be positive."),
  chapterTitle: z.string().trim().min(1, "Chapter title is required.").max(200),
  topicNumber: z.number().int().positive("Topic number must be positive."),
  topicTitle: z.string().trim().min(1, "Topic title is required.").max(200),
  learningObjectives: z.string().trim().optional().nullable(),
  estimatedPeriods: z.number().int().positive("Estimated periods must be at least 1.").default(1),
});

export type CreateSyllabusTopicInput = z.infer<typeof createSyllabusTopicSchema>;

export const markTopicCoveredSchema = z.object({
  topicId: z.string().uuid("Invalid topic ID."),
  coveredDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format."),
  diaryId: z.string().uuid("Invalid diary ID.").optional().nullable(),
  coveredByTeacherUserId: z.string().uuid("Invalid teacher user ID."),
  notes: z.string().trim().optional().nullable(),
});

export type MarkTopicCoveredInput = z.infer<typeof markTopicCoveredSchema>;

export const getSyllabusCoverageFilterSchema = z.object({
  subjectId: z.string().uuid("Invalid subject ID."),
  classId: z.string().uuid("Invalid class ID.").optional().nullable(),
  expectedProgressRatio: z.number().min(0).max(1).optional().nullable(),
});

export type GetSyllabusCoverageFilter = z.infer<typeof getSyllabusCoverageFilterSchema>;

