/**
 * Daily Diary domain rules (`PRD.md` MODULE 23/24, `src/db/schema/diary.ts`, `RULES.md` §44/§47).
 *
 * Pure domain logic — zero I/O, zero Drizzle, zero Next.js, zero Zod.
 * Enforces business invariants for homework entries, status state machines,
 * assignment rosters, attachments, read receipts, and notification idempotency.
 */
import { BusinessRuleError, ValidationError } from "@/shared/errors";

export type DiaryStatus = "draft" | "assigned" | "closed";
export type DiaryAttachmentType = "worksheet" | "handout" | "link" | "image" | "other";
export type DiaryViewerKind = "student" | "guardian";
export type DiaryReadVia = "portal" | "email_link" | "mobile_app";
export type DiaryFrequency = "daily" | "weekly" | "off";
export type DiaryReadStatus = "unread" | "read" | "acknowledged";
export type SyllabusTopicStatus = "pending" | "in_progress" | "covered" | "deferred";
export type SyllabusPaceStatus = "ahead" | "on_track" | "behind";

export const VALID_DIARY_STATUSES: readonly DiaryStatus[] = ["draft", "assigned", "closed"] as const;
export const VALID_ATTACHMENT_TYPES: readonly DiaryAttachmentType[] = [
  "worksheet",
  "handout",
  "link",
  "image",
  "other",
] as const;
export const VALID_VIEWER_KINDS: readonly DiaryViewerKind[] = ["student", "guardian"] as const;
export const VALID_READ_VIAS: readonly DiaryReadVia[] = ["portal", "email_link", "mobile_app"] as const;
export const VALID_DIARY_FREQUENCIES: readonly DiaryFrequency[] = ["daily", "weekly", "off"] as const;
export const VALID_SYLLABUS_TOPIC_STATUSES: readonly SyllabusTopicStatus[] = [
  "pending",
  "in_progress",
  "covered",
  "deferred",
] as const;

/** Syllabus topic structure for tracking lesson and homework curriculum coverage. */
export interface SyllabusTopic {
  readonly id: string;
  readonly subjectId: string;
  readonly classId?: string | null | undefined;
  readonly chapterNumber: number;
  readonly chapterTitle: string;
  readonly topicNumber: number;
  readonly topicTitle: string;
  readonly learningObjectives?: string | null | undefined;
  readonly estimatedPeriods: number;
  readonly status: SyllabusTopicStatus;
  readonly coveredDate?: string | null | undefined;
  readonly diaryId?: string | null | undefined;
  readonly coveredByTeacherUserId?: string | null | undefined;
  readonly notes?: string | null | undefined;
}

/** Summary of syllabus coverage for a subject and class. */
export interface SyllabusCoverageSummary {
  readonly totalTopics: number;
  readonly coveredTopics: number;
  readonly inProgressTopics: number;
  readonly pendingTopics: number;
  readonly deferredTopics: number;
  readonly percentageCovered: number;
  readonly totalEstimatedPeriods: number;
  readonly completedPeriods: number;
  readonly pace: SyllabusPaceStatus;
  readonly paceMessage: string;
}

/** Chapter-level breakdown of syllabus topics. */
export interface ChapterCoverageGroup {
  readonly chapterNumber: number;
  readonly chapterTitle: string;
  readonly totalTopics: number;
  readonly coveredTopics: number;
  readonly percentageCovered: number;
  readonly topics: readonly SyllabusTopic[];
}

/** Maximum allowed file size for diary attachments (25 megabytes). */
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Asserts that the diary date format is YYYY-MM-DD and points to a real calendar date.
 * Optionally guards against backdating too far in the past or scheduling too far in the future.
 */
export function assertValidDiaryDate(
  dateStr: string,
  options?: {
    readonly maxPastDays?: number | undefined;
    readonly maxFutureDays?: number | undefined;
    readonly now?: Date | undefined;
  },
): void {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new ValidationError(
      `Invalid diary date format "${dateStr}". Expected YYYY-MM-DD.`,
      { diaryDate: ["Diary date must be in YYYY-MM-DD format."] },
      { userMessage: "Please provide a valid diary date in YYYY-MM-DD format." },
    );
  }

  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError(
      `Calendar date "${dateStr}" does not exist.`,
      { diaryDate: ["Date does not exist on the calendar."] },
      { userMessage: "Please enter a valid calendar date." },
    );
  }

  const referenceDate = options?.now ?? new Date();
  const currentUtcMidnight = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );
  const targetUtcMidnight = parsed.getTime();
  const diffDays = Math.round((targetUtcMidnight - currentUtcMidnight) / (24 * 60 * 60 * 1000));

  if (options?.maxPastDays !== undefined && diffDays < -options.maxPastDays) {
    throw new BusinessRuleError(
      `Diary date "${dateStr}" is too far in the past (${Math.abs(diffDays)} days ago, maximum is ${options.maxPastDays}).`,
      { userMessage: `Diary entries cannot be recorded more than ${options.maxPastDays} days in the past.` },
    );
  }

  if (options?.maxFutureDays !== undefined && diffDays > options.maxFutureDays) {
    throw new BusinessRuleError(
      `Diary date "${dateStr}" is too far in the future (${diffDays} days ahead, maximum is ${options.maxFutureDays}).`,
      { userMessage: `Diary entries cannot be scheduled more than ${options.maxFutureDays} days in advance.` },
    );
  }
}

/**
 * Asserts that an assignment deadline is on or after the diary date.
 */
export function assertAssignmentDeadline(diaryDate: string, deadline: string | Date): void {
  const diaryTime = new Date(`${diaryDate}T00:00:00Z`).getTime();
  const deadlineTime = typeof deadline === "string" ? new Date(deadline).getTime() : deadline.getTime();

  if (Number.isNaN(deadlineTime)) {
    throw new ValidationError(
      "Invalid deadline timestamp.",
      { deadline: ["Deadline timestamp is invalid."] },
      { userMessage: "Please specify a valid deadline." },
    );
  }

  if (deadlineTime < diaryTime) {
    throw new BusinessRuleError(
      "Assignment deadline cannot be earlier than the diary date.",
      { userMessage: "The homework submission deadline must be on or after the diary date." },
    );
  }
}

/**
 * Checks whether an assignment is overdue relative to now.
 */
export function isAssignmentPastDue(deadline: string | Date, now?: Date): boolean {
  const deadlineTime = typeof deadline === "string" ? new Date(deadline).getTime() : deadline.getTime();
  const currentTime = (now ?? new Date()).getTime();
  return currentTime > deadlineTime;
}

/**
 * Asserts scope constraint matching `diaries_scope_check`:
 * At least one of classId or sectionId must be non-null.
 */
export function assertDiaryScope(scope: {
  readonly classId?: string | null | undefined;
  readonly sectionId?: string | null | undefined;
}): void {
  const hasClass = scope.classId !== null && scope.classId !== undefined && scope.classId.trim() !== "";
  const hasSection = scope.sectionId !== null && scope.sectionId !== undefined && scope.sectionId.trim() !== "";

  if (!hasClass && !hasSection) {
    throw new ValidationError(
      "A diary entry must be scoped to at least a class or a section.",
      { scope: ["Select at least one class or section."] },
      { userMessage: "Please choose a class or section for this diary entry." },
    );
  }
}

/**
 * Asserts diary title and content invariants.
 */
export function assertDiaryContent(input: {
  readonly title: string;
  readonly content: string;
}): void {
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length === 0) {
    throw new ValidationError(
      "Diary title cannot be empty.",
      { title: ["Title is required."] },
      { userMessage: "Please provide a title for the diary entry." },
    );
  }
  if (trimmedTitle.length > 200) {
    throw new ValidationError(
      `Diary title exceeds maximum length of 200 characters (received ${trimmedTitle.length}).`,
      { title: ["Title cannot exceed 200 characters."] },
      { userMessage: "Diary title cannot exceed 200 characters." },
    );
  }

  const trimmedContent = input.content.trim();
  if (trimmedContent.length === 0) {
    throw new ValidationError(
      "Diary content cannot be empty.",
      { content: ["Homework content is required."] },
      { userMessage: "Please enter the homework or diary instructions." },
    );
  }
}

/**
 * Status state machine transitions for `diaries.status`:
 * - draft -> draft (no-op)
 * - draft -> assigned (allowed: assigns homework to students)
 * - draft -> closed (allowed: closes entry without assigning)
 * - assigned -> assigned (no-op)
 * - assigned -> closed (allowed: end of day, marks as history)
 * - closed -> * (forbidden: historical preservation `RULES.md` §44)
 * - assigned -> draft (forbidden: cannot un-distribute homework that reached students/guardians)
 */
export function assertCanTransitionDiaryStatus(currentStatus: DiaryStatus, nextStatus: DiaryStatus): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (currentStatus === "closed") {
    throw new BusinessRuleError(
      `Cannot transition diary status from "closed" to "${nextStatus}". Closed diary entries are immutable history.`,
      { userMessage: "This diary entry has been closed and cannot be reopened or edited." },
    );
  }

  if (currentStatus === "assigned" && nextStatus === "draft") {
    throw new BusinessRuleError(
      "Cannot revert an assigned diary entry back to draft. It has already been assigned to students.",
      { userMessage: "Assigned diary entries cannot be reverted to draft." },
    );
  }
}

/**
 * Asserts that a diary can be edited. A closed diary is history and cannot be mutated.
 */
export function assertCanModifyDiary(currentStatus: DiaryStatus): void {
  if (currentStatus === "closed") {
    throw new BusinessRuleError(
      "A closed diary entry cannot be modified.",
      { userMessage: "This diary entry is closed and locked for historical preservation." },
    );
  }
}

/**
 * Asserts database constraint `diaries_assignment_pair`:
 * When status is not 'draft', `assignedAt` and `assignedByTeacherUserId` must both be present.
 */
export function assertAssignmentPair(
  status: DiaryStatus,
  assignedAt: Date | null | undefined,
  assignedByTeacherUserId: string | null | undefined,
): void {
  if (status === "draft") {
    return;
  }

  const hasAssignedAt = assignedAt !== null && assignedAt !== undefined;
  const hasTeacher = assignedByTeacherUserId !== null && assignedByTeacherUserId !== undefined && assignedByTeacherUserId.trim() !== "";

  if (!hasAssignedAt || !hasTeacher) {
    throw new BusinessRuleError(
      "An assigned or closed diary must record both the assignment timestamp and assigning teacher user ID.",
      { userMessage: "Assignment requires an assigning teacher and assignment timestamp." },
    );
  }
}

/**
 * Asserts database constraint `diaries_closed_pair`:
 * When status is 'closed', `closedAt` must be present.
 */
export function assertClosedPair(status: DiaryStatus, closedAt: Date | null | undefined): void {
  if (status !== "closed") {
    return;
  }

  if (closedAt === null || closedAt === undefined) {
    throw new BusinessRuleError(
      "A closed diary must record a closing timestamp.",
      { userMessage: "Closing a diary entry requires a closing timestamp." },
    );
  }
}

/**
 * Asserts database constraint `diary_assignments_acknowledgement_pair`:
 * `acknowledgedAt` and `acknowledgedByUserId` must either both be present or both be null/undefined.
 */
export function assertAcknowledgementPair(
  acknowledgedAt: Date | null | undefined,
  acknowledgedByUserId: string | null | undefined,
): void {
  const hasAt = acknowledgedAt !== null && acknowledgedAt !== undefined;
  const hasUser = acknowledgedByUserId !== null && acknowledgedByUserId !== undefined && acknowledgedByUserId.trim() !== "";

  if (hasAt !== hasUser) {
    throw new BusinessRuleError(
      "Acknowledgement timestamp and acknowledging user ID must be provided together.",
      { userMessage: "Acknowledgment requires both a timestamp and the acknowledging user." },
    );
  }
}

/**
 * Asserts valid viewer kind for read receipts (`diary_reads_viewer_kind_check`).
 */
export function assertReadViewer(viewerKind: string, viewerId: string): asserts viewerKind is DiaryViewerKind {
  if (!VALID_VIEWER_KINDS.includes(viewerKind as DiaryViewerKind)) {
    throw new ValidationError(
      `Invalid viewer kind "${viewerKind}". Must be "student" or "guardian".`,
      { viewerKind: ["Viewer must be student or guardian."] },
      { userMessage: "Invalid reader category." },
    );
  }

  if (!viewerId || viewerId.trim() === "") {
    throw new ValidationError(
      "Viewer ID is required for recording a diary read receipt.",
      { viewerId: ["Viewer ID is required."] },
      { userMessage: "Reader identity is missing." },
    );
  }
}

/**
 * Asserts valid read via channel (`diary_reads_via_check`).
 */
export function assertReadVia(via: string): asserts via is DiaryReadVia {
  if (!VALID_READ_VIAS.includes(via as DiaryReadVia)) {
    throw new ValidationError(
      `Invalid read via channel "${via}". Must be "portal", "email_link", or "mobile_app".`,
      { via: ["Invalid channel."] },
      { userMessage: "Invalid read channel." },
    );
  }
}

/**
 * Calculates overall read & acknowledgement metrics.
 */
export function calculateReadMetrics(
  totalAssignments: number,
  readCount: number,
  acknowledgedCount: number,
): {
  readonly total: number;
  readonly readCount: number;
  readonly acknowledgedCount: number;
  readonly readRate: number;
  readonly ackRate: number;
} {
  const safeTotal = Math.max(0, totalAssignments);
  const safeRead = Math.min(safeTotal, Math.max(0, readCount));
  const safeAck = Math.min(safeTotal, Math.max(0, acknowledgedCount));

  const readRate = safeTotal === 0 ? 0 : Math.round((safeRead / safeTotal) * 100);
  const ackRate = safeTotal === 0 ? 0 : Math.round((safeAck / safeTotal) * 100);

  return {
    total: safeTotal,
    readCount: safeRead,
    acknowledgedCount: safeAck,
    readRate,
    ackRate,
  };
}

/**
 * Determines badge tone and label for a student's diary read state.
 */
export function determineReadStatus(
  hasRead: boolean,
  acknowledgedAt: Date | null | undefined,
): {
  readonly status: DiaryReadStatus;
  readonly label: string;
  readonly tone: "neutral" | "info" | "success";
} {
  if (acknowledgedAt !== null && acknowledgedAt !== undefined) {
    return { status: "acknowledged", label: "Acknowledged", tone: "success" };
  }
  if (hasRead) {
    return { status: "read", label: "Read", tone: "info" };
  }
  return { status: "unread", label: "Unread", tone: "neutral" };
}

/**
 * Asserts attachment invariants matching `diary_attachments` constraints:
 * - `attachmentType in ('worksheet', 'handout', 'link', 'image', 'other')`
 * - Exactly one of storageKey or externalUrl (`num_nonnulls(storageKey, externalUrl) = 1`)
 * - If attachmentType is 'link', externalUrl must be present (`diary_attachments_link_type_check`)
 * - If attachmentType is not 'link', storageKey must be present (`diary_attachments_file_type_check`)
 * - sizeBytes must be null or > 0 and <= MAX_ATTACHMENT_SIZE_BYTES
 */
export function assertValidAttachment(attachment: {
  readonly label: string;
  readonly attachmentType: string;
  readonly storageKey?: string | null | undefined;
  readonly externalUrl?: string | null | undefined;
  readonly sizeBytes?: number | null | undefined;
}): void {
  const trimmedLabel = attachment.label.trim();
  if (trimmedLabel.length === 0) {
    throw new ValidationError(
      "Attachment label is required.",
      { label: ["Label cannot be empty."] },
      { userMessage: "Please provide a name or label for the attachment." },
    );
  }
  if (trimmedLabel.length > 200) {
    throw new ValidationError(
      `Attachment label exceeds 200 characters (length: ${trimmedLabel.length}).`,
      { label: ["Label cannot exceed 200 characters."] },
      { userMessage: "Attachment label cannot exceed 200 characters." },
    );
  }

  if (!VALID_ATTACHMENT_TYPES.includes(attachment.attachmentType as DiaryAttachmentType)) {
    throw new ValidationError(
      `Invalid attachment type "${attachment.attachmentType}".`,
      { attachmentType: ["Must be worksheet, handout, link, image, or other."] },
      { userMessage: "Invalid attachment type." },
    );
  }

  const hasStorageKey = attachment.storageKey !== null && attachment.storageKey !== undefined && attachment.storageKey.trim() !== "";
  const hasExternalUrl = attachment.externalUrl !== null && attachment.externalUrl !== undefined && attachment.externalUrl.trim() !== "";

  if (hasStorageKey === hasExternalUrl) {
    throw new ValidationError(
      "Attachment must provide either a storage key (for files) or an external URL (for links), never both and never neither.",
      { source: ["Provide exactly one of file storage key or link URL."] },
      { userMessage: "Attachment must be either an uploaded file or an external link." },
    );
  }

  if (attachment.attachmentType === "link") {
    if (!hasExternalUrl) {
      throw new ValidationError(
        "A link attachment must specify an external URL.",
        { externalUrl: ["External URL is required for link attachments."] },
        { userMessage: "Please enter a valid link URL." },
      );
    }
    const urlStr = attachment.externalUrl!.trim();
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      throw new ValidationError(
        "Link URL must start with http:// or https://.",
        { externalUrl: ["URL must start with http:// or https://."] },
        { userMessage: "Link URL must start with http:// or https://." },
      );
    }
  } else {
    if (!hasStorageKey) {
      throw new ValidationError(
        `File attachment of type "${attachment.attachmentType}" must provide a storage key.`,
        { storageKey: ["Storage key is required for file attachments."] },
        { userMessage: "File upload storage key is missing." },
      );
    }
  }

  if (attachment.sizeBytes !== null && attachment.sizeBytes !== undefined) {
    if (attachment.sizeBytes <= 0) {
      throw new ValidationError(
        "Attachment file size must be greater than zero.",
        { sizeBytes: ["Size must be positive."] },
        { userMessage: "Uploaded file is empty." },
      );
    }
    if (attachment.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BusinessRuleError(
        `Attachment size ${attachment.sizeBytes} exceeds maximum permitted size of ${MAX_ATTACHMENT_SIZE_BYTES} bytes.`,
        { userMessage: "Uploaded file exceeds the maximum size limit of 25 MB." },
      );
    }
  }
}

/**
 * Generates a stable idempotency key for diary notification dispatching (`RULES.md` §47).
 */
export function generateNotificationIdempotencyKey(diaryAssignmentId: string, guardianUserId: string): string {
  return `diary-notif:${diaryAssignmentId}:${guardianUserId}`;
}

/**
 * Asserts quiet hours pair matching `diary_notification_preferences_quiet_hours_check`:
 * num_nonnulls(quietHoursStart, quietHoursEnd) in (0, 2).
 */
export function assertQuietHoursPair(start?: string | null | undefined, end?: string | null | undefined): void {
  const hasStart = start !== null && start !== undefined && start.trim() !== "";
  const hasEnd = end !== null && end !== undefined && end.trim() !== "";

  if (hasStart !== hasEnd) {
    throw new ValidationError(
      "Quiet hours start and end must both be specified or both be omitted.",
      { quietHours: ["Both quiet hours start and end are required."] },
      { userMessage: "Please specify both quiet hours start and end, or leave both blank." },
    );
  }

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (hasStart && !timeRegex.test(start!.trim())) {
    throw new ValidationError(
      `Invalid quiet hours start time "${start}". Expected HH:MM 24-hour format.`,
      { quietHoursStart: ["Expected HH:MM in 24-hour format."] },
      { userMessage: "Invalid quiet hours start time." },
    );
  }
  if (hasEnd && !timeRegex.test(end!.trim())) {
    throw new ValidationError(
      `Invalid quiet hours end time "${end}". Expected HH:MM 24-hour format.`,
      { quietHoursEnd: ["Expected HH:MM in 24-hour format."] },
      { userMessage: "Invalid quiet hours end time." },
    );
  }
}

/**
 * Evaluates whether a given time is within quiet hours.
 * Handles both intra-day windows (e.g. 13:00 to 15:00) and overnight windows (e.g. 21:00 to 07:00).
 */
export function isWithinQuietHours(
  currentTime: string,
  quietStart?: string | null | undefined,
  quietEnd?: string | null | undefined,
): boolean {
  if (!quietStart || !quietEnd) {
    return false;
  }

  const parseMinutes = (t: string): number => {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const currentMin = parseMinutes(currentTime);
  const startMin = parseMinutes(quietStart);
  const endMin = parseMinutes(quietEnd);

  if (startMin <= endMin) {
    // Normal window, e.g., 14:00 to 16:00
    return currentMin >= startMin && currentMin < endMin;
  }
  // Overnight window, e.g., 22:00 to 07:00
  return currentMin >= startMin || currentMin < endMin;
}

/**
 * Asserts that the homework assignment roster contains at least one student recipient.
 */
export function assertHomeworkAssignmentTarget(studentIds: readonly string[]): void {
  if (studentIds.length === 0) {
    throw new BusinessRuleError(
      "Cannot assign homework to an empty student roster. At least one enrolled student is required.",
      { userMessage: "No students were found in this class or section to assign homework to." },
    );
  }
}

/**
 * Asserts that the user acknowledging a student's diary assignment is authorized to do so.
 */
export function assertParentCanAcknowledge(
  assignedGuardianUserId: string | null | undefined,
  actorUserId: string,
): void {
  if (!assignedGuardianUserId || assignedGuardianUserId.trim() === "") {
    throw new BusinessRuleError(
      "No guardian is linked to this student assignment to record an acknowledgement.",
      { userMessage: "No parent or guardian is associated with this student's diary assignment." },
    );
  }

  if (assignedGuardianUserId !== actorUserId) {
    throw new BusinessRuleError(
      `User "${actorUserId}" is not the assigned guardian ("${assignedGuardianUserId}") for this diary assignment.`,
      { userMessage: "You can only acknowledge diary entries for students under your guardianship." },
    );
  }
}

/**
 * Asserts that a syllabus topic input is valid.
 */
export function assertValidSyllabusTopic(topic: {
  readonly chapterNumber: number;
  readonly chapterTitle: string;
  readonly topicNumber: number;
  readonly topicTitle: string;
  readonly estimatedPeriods: number;
}): void {
  if (!Number.isInteger(topic.chapterNumber) || topic.chapterNumber <= 0) {
    throw new ValidationError(
      `Invalid chapter number ${topic.chapterNumber}. Must be a positive integer.`,
      { chapterNumber: ["Chapter number must be a positive integer."] },
      { userMessage: "Please provide a valid positive chapter number." },
    );
  }

  const trimmedChapter = topic.chapterTitle.trim();
  if (trimmedChapter.length === 0 || trimmedChapter.length > 200) {
    throw new ValidationError(
      "Chapter title must be between 1 and 200 characters.",
      { chapterTitle: ["Chapter title is required and cannot exceed 200 characters."] },
      { userMessage: "Please enter a valid chapter title (up to 200 characters)." },
    );
  }

  if (!Number.isInteger(topic.topicNumber) || topic.topicNumber <= 0) {
    throw new ValidationError(
      `Invalid topic number ${topic.topicNumber}. Must be a positive integer.`,
      { topicNumber: ["Topic number must be a positive integer."] },
      { userMessage: "Please provide a valid positive topic number." },
    );
  }

  const trimmedTopic = topic.topicTitle.trim();
  if (trimmedTopic.length === 0 || trimmedTopic.length > 200) {
    throw new ValidationError(
      "Topic title must be between 1 and 200 characters.",
      { topicTitle: ["Topic title is required and cannot exceed 200 characters."] },
      { userMessage: "Please enter a valid topic title (up to 200 characters)." },
    );
  }

  if (!Number.isInteger(topic.estimatedPeriods) || topic.estimatedPeriods <= 0) {
    throw new ValidationError(
      `Invalid estimated periods ${topic.estimatedPeriods}. Must be at least 1.`,
      { estimatedPeriods: ["Estimated periods must be at least 1."] },
      { userMessage: "Estimated periods must be at least 1." },
    );
  }
}

/**
 * Asserts syllabus topic covering invariants.
 */
export function assertCanCoverSyllabusTopic(
  topic: SyllabusTopic,
  coveredDate: string,
  teacherUserId: string,
): void {
  assertValidDiaryDate(coveredDate);

  if (!teacherUserId || teacherUserId.trim() === "") {
    throw new ValidationError(
      "Teacher user ID is required when marking a syllabus topic as covered.",
      { teacherUserId: ["Teacher ID is required."] },
      { userMessage: "Teacher ID is missing." },
    );
  }

  if (topic.status === "covered" && topic.coveredDate && topic.coveredDate !== coveredDate) {
    throw new BusinessRuleError(
      `Syllabus topic "${topic.topicTitle}" was already covered on ${topic.coveredDate}.`,
      { userMessage: `This topic has already been marked as covered on ${topic.coveredDate}.` },
    );
  }
}

/**
 * Calculates comprehensive syllabus coverage and pace metrics.
 * @param topics Array of syllabus topics for a subject
 * @param expectedProgressRatio Decimal ratio between 0 and 1 representing expected progress through term/session (optional)
 */
export function calculateSyllabusCoverage(
  topics: readonly SyllabusTopic[],
  expectedProgressRatio?: number | null | undefined,
): SyllabusCoverageSummary {
  const totalTopics = topics.length;
  if (totalTopics === 0) {
    return {
      totalTopics: 0,
      coveredTopics: 0,
      inProgressTopics: 0,
      pendingTopics: 0,
      deferredTopics: 0,
      percentageCovered: 0,
      totalEstimatedPeriods: 0,
      completedPeriods: 0,
      pace: "on_track",
      paceMessage: "No syllabus topics recorded yet for this subject.",
    };
  }

  let coveredTopics = 0;
  let inProgressTopics = 0;
  let pendingTopics = 0;
  let deferredTopics = 0;
  let totalEstimatedPeriods = 0;
  let completedPeriods = 0;

  for (const t of topics) {
    totalEstimatedPeriods += t.estimatedPeriods;
    if (t.status === "covered") {
      coveredTopics++;
      completedPeriods += t.estimatedPeriods;
    } else if (t.status === "in_progress") {
      inProgressTopics++;
      completedPeriods += Math.round(t.estimatedPeriods / 2);
    } else if (t.status === "deferred") {
      deferredTopics++;
    } else {
      pendingTopics++;
    }
  }

  const percentageCovered = Math.round((coveredTopics / totalTopics) * 100);

  let pace: SyllabusPaceStatus = "on_track";
  let paceMessage = `${percentageCovered}% of the syllabus has been covered (${coveredTopics} of ${totalTopics} topics).`;

  if (expectedProgressRatio !== null && expectedProgressRatio !== undefined && !Number.isNaN(expectedProgressRatio)) {
    const clampedExpected = Math.max(0, Math.min(1, expectedProgressRatio));
    const expectedPercentage = Math.round(clampedExpected * 100);

    if (percentageCovered < expectedPercentage - 10) {
      pace = "behind";
      paceMessage = `Behind schedule: ${percentageCovered}% covered versus expected ${expectedPercentage}%.`;
    } else if (percentageCovered > expectedPercentage + 15) {
      pace = "ahead";
      paceMessage = `Ahead of schedule: ${percentageCovered}% covered versus expected ${expectedPercentage}%.`;
    } else {
      pace = "on_track";
      paceMessage = `On track: ${percentageCovered}% covered, matching the expected progress of ${expectedPercentage}%.`;
    }
  }

  return {
    totalTopics,
    coveredTopics,
    inProgressTopics,
    pendingTopics,
    deferredTopics,
    percentageCovered,
    totalEstimatedPeriods,
    completedPeriods,
    pace,
    paceMessage,
  };
}

/**
 * Groups syllabus topics by chapter, calculating coverage rate per chapter.
 */
export function groupSyllabusByChapter(topics: readonly SyllabusTopic[]): readonly ChapterCoverageGroup[] {
  const chapterMap = new Map<number, { title: string; topics: SyllabusTopic[] }>();

  for (const t of topics) {
    const existing = chapterMap.get(t.chapterNumber);
    if (existing) {
      existing.topics.push(t);
    } else {
      chapterMap.set(t.chapterNumber, { title: t.chapterTitle, topics: [t] });
    }
  }

  const groups: ChapterCoverageGroup[] = [];
  const sortedChapterNumbers = Array.from(chapterMap.keys()).sort((a, b) => a - b);

  for (const chNum of sortedChapterNumbers) {
    const data = chapterMap.get(chNum)!;
    const sortedTopics = [...data.topics].sort((a, b) => a.topicNumber - b.topicNumber);
    const coveredCount = sortedTopics.filter((t) => t.status === "covered").length;
    const percentage = sortedTopics.length === 0 ? 0 : Math.round((coveredCount / sortedTopics.length) * 100);

    groups.push({
      chapterNumber: chNum,
      chapterTitle: data.title,
      totalTopics: sortedTopics.length,
      coveredTopics: coveredCount,
      percentageCovered: percentage,
      topics: sortedTopics,
    });
  }

  return groups;
}

/**
 * Formats a calendar date for clean, friendly non-technical display (e.g. "Wednesday, 28 October 2026").
 */
export function formatDiaryDisplayDate(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formats file attachment sizes in human-readable units (e.g. "1.5 MB", "350 KB").
 */
export function formatAttachmentSize(sizeBytes?: number | null | undefined): string {
  if (sizeBytes === null || sizeBytes === undefined || sizeBytes <= 0) {
    return "0 B";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns human-readable label for diary attachment types.
 */
export function getAttachmentTypeLabel(type: DiaryAttachmentType): string {
  switch (type) {
    case "worksheet":
      return "Worksheet";
    case "handout":
      return "Handout";
    case "link":
      return "Web Resource";
    case "image":
      return "Image";
    case "other":
      return "Reference Document";
  }
}

