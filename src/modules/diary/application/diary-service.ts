/**
 * Daily Diary Application Service (`PRD.md` MODULE 23/24, `ARCHITECTURE.md` §23).
 *
 * Coordinates diary entries, homework assignments, attachments, parent read-receipts,
 * syllabus coverage tracking, and notifications.
 */
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import {
  assertAcknowledgementPair,
  assertAssignmentPair,
  assertCanCoverSyllabusTopic,
  assertCanModifyDiary,
  assertCanTransitionDiaryStatus,
  assertClosedPair,
  assertDiaryContent,
  assertDiaryScope,
  assertHomeworkAssignmentTarget,
  assertParentCanAcknowledge,
  assertQuietHoursPair,
  assertReadVia,
  assertReadViewer,
  assertValidAttachment,
  assertValidDiaryDate,
  assertValidSyllabusTopic,
  calculateSyllabusCoverage,
  groupSyllabusByChapter,
  type ChapterCoverageGroup,
  type SyllabusCoverageSummary,
  type SyllabusTopic,
} from "../domain/diary-rules";
import type {
  DiaryAssignmentRow,
  DiaryAssignmentWithStudentView,
  DiaryAttachmentRow,
  DiaryDetailView,
  DiaryNotificationPreferenceRow,
  DiaryReadRow,
  DiaryRow,
  DiaryStore,
  NotificationDispatcherPort,
} from "./ports";
import {
  acknowledgeDiarySchema,
  assignDiarySchema,
  createSyllabusTopicSchema,
  getSyllabusCoverageFilterSchema,
  listDiariesFilterSchema,
  markDiaryReadSchema,
  markTopicCoveredSchema,
  postDiaryEntrySchema,
  setNotificationPreferenceSchema,
  updateDiaryEntrySchema,
  uploadAttachmentSchema,
} from "./schemas";

export class DiaryService {
  constructor(
    private readonly store: DiaryStore,
    private readonly notificationDispatcher?: NotificationDispatcherPort | undefined,
  ) {}

  /**
   * Creates a new diary entry in draft status.
   */
  async createDiaryEntry(input: unknown, teacherUserId: string): Promise<DiaryRow> {
    const parsed = postDiaryEntrySchema.parse(input);

    assertValidDiaryDate(parsed.diaryDate);
    assertDiaryScope({ classId: parsed.classId, sectionId: parsed.sectionId });
    assertDiaryContent({ title: parsed.title, content: parsed.content });

    const diary = await this.store.createDiary(parsed, teacherUserId);

    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        assertValidAttachment(att);
        await this.store.addAttachment({
          ...att,
          diaryId: diary.id,
        });
      }
    }

    return diary;
  }

  /**
   * Updates an existing diary entry (if not closed).
   */
  async updateDiaryEntry(diaryId: string, input: unknown): Promise<DiaryRow> {
    const diary = await this.store.getDiary(diaryId);
    if (!diary) {
      throw new NotFoundError(`Diary entry with ID "${diaryId}" was not found.`);
    }

    assertCanModifyDiary(diary.status);
    const parsed = updateDiaryEntrySchema.parse(input);

    if (parsed.title !== undefined || parsed.content !== undefined) {
      assertDiaryContent({
        title: parsed.title ?? diary.title,
        content: parsed.content ?? diary.content,
      });
    }

    if (parsed.status !== undefined) {
      assertCanTransitionDiaryStatus(diary.status, parsed.status);
    }

    return this.store.updateDiary(diaryId, parsed);
  }

  /**
   * Assigns a draft diary entry to students in the designated class/section.
   * Creates assignments, registers guardian links, and queues personalized notifications.
   */
  async assignDiary(input: unknown): Promise<{ assignedCount: number; notificationsQueued: number }> {
    const parsed = assignDiarySchema.parse(input);
    const diary = await this.store.getDiary(parsed.diaryId);

    if (!diary) {
      throw new NotFoundError(`Diary entry with ID "${parsed.diaryId}" was not found.`);
    }

    assertCanTransitionDiaryStatus(diary.status, "assigned");
    assertCanModifyDiary(diary.status);

    const now = new Date();
    assertAssignmentPair("assigned", now, parsed.assignedByTeacherUserId);

    // Fetch enrolled students roster for the class/section
    const roster = await this.store.getSectionStudentRoster(diary.classId, diary.sectionId);
    assertHomeworkAssignmentTarget(roster.map((r) => r.studentId));

    const result = await this.store.assignDiary(
      parsed.diaryId,
      parsed.assignedByTeacherUserId,
      roster,
    );

    // If a notification dispatcher is provided, queue the personalized emails
    if (this.notificationDispatcher) {
      for (const item of roster) {
        if (item.guardianUserId) {
          await this.notificationDispatcher.queueDiaryNotification({
            diaryAssignmentId: `${parsed.diaryId}:${item.studentId}`,
            diaryId: parsed.diaryId,
            studentId: item.studentId,
            guardianUserId: item.guardianUserId,
            subjectLine: `Daily Diary Update - ${diary.title}`,
            idempotencyKey: `diary-notif:${parsed.diaryId}:${item.studentId}:${item.guardianUserId}`,
          });
        }
      }
    }

    return result;
  }

  /**
   * Closes a diary entry, marking the school day homework done and locking it as history.
   */
  async closeDiary(diaryId: string): Promise<DiaryRow> {
    const diary = await this.store.getDiary(diaryId);
    if (!diary) {
      throw new NotFoundError(`Diary entry with ID "${diaryId}" was not found.`);
    }

    assertCanTransitionDiaryStatus(diary.status, "closed");
    const now = new Date();
    assertClosedPair("closed", now);

    return this.store.closeDiary(diaryId, now);
  }

  /**
   * Attaches a worksheet, handout, link, or image to a diary entry.
   */
  async addAttachment(input: unknown): Promise<DiaryAttachmentRow> {
    const parsed = uploadAttachmentSchema.parse(input);
    const diary = await this.store.getDiary(parsed.diaryId);

    if (!diary) {
      throw new NotFoundError(`Diary entry with ID "${parsed.diaryId}" was not found.`);
    }

    assertCanModifyDiary(diary.status);
    assertValidAttachment(parsed);

    return this.store.addAttachment(parsed);
  }

  /**
   * Records a passive read receipt when a student or guardian views the diary.
   */
  async recordReadReceipt(input: unknown): Promise<DiaryReadRow> {
    const parsed = markDiaryReadSchema.parse(input);
    const diary = await this.store.getDiary(parsed.diaryId);

    if (!diary) {
      throw new NotFoundError(`Diary entry with ID "${parsed.diaryId}" was not found.`);
    }

    assertReadViewer(parsed.viewerKind, parsed.viewerId);
    assertReadVia(parsed.via);

    return this.store.recordReadReceipt(
      parsed.diaryId,
      parsed.viewerKind,
      parsed.viewerId,
      parsed.via,
    );
  }

  /**
   * Records an explicit parent/guardian acknowledgement for a student's diary assignment.
   */
  async acknowledgeDiaryAssignment(input: unknown): Promise<DiaryAssignmentRow> {
    const parsed = acknowledgeDiarySchema.parse(input);
    const assignment = await this.store.getAssignment(parsed.diaryAssignmentId);

    if (!assignment) {
      throw new NotFoundError(`Diary assignment with ID "${parsed.diaryAssignmentId}" was not found.`);
    }

    assertParentCanAcknowledge(assignment.guardianUserId, parsed.acknowledgedByUserId);
    const now = new Date();
    assertAcknowledgementPair(now, parsed.acknowledgedByUserId);

    return this.store.acknowledgeAssignment(
      parsed.diaryAssignmentId,
      parsed.acknowledgedByUserId,
      now,
    );
  }

  /**
   * Fetches full diary detail view including attachments, student roster, reads, and metrics.
   */
  async getDiaryDetail(diaryId: string): Promise<DiaryDetailView> {
    const detail = await this.store.getDiaryDetail(diaryId);
    if (!detail) {
      throw new NotFoundError(`Diary entry with ID "${diaryId}" was not found.`);
    }
    return detail;
  }

  /**
   * Lists diary entries with optional filters.
   */
  async listDiaries(
    filter: unknown,
  ): Promise<{ items: readonly DiaryRow[]; totalCount: number }> {
    const parsed = listDiariesFilterSchema.parse(filter);
    return this.store.listDiaries(parsed);
  }

  /**
   * Lists diary assignments for a specific student.
   */
  async listStudentAssignments(
    studentId: string,
    date?: string,
  ): Promise<readonly DiaryAssignmentWithStudentView[]> {
    if (!studentId || studentId.trim() === "") {
      throw new BusinessRuleError("Student ID is required.", {
        userMessage: "Student identity is missing.",
      });
    }
    return this.store.listStudentAssignments(studentId, date);
  }

  /**
   * Lists diary assignments for a guardian across all their linked students.
   */
  async listGuardianAssignments(
    guardianUserId: string,
    date?: string,
  ): Promise<readonly DiaryAssignmentWithStudentView[]> {
    if (!guardianUserId || guardianUserId.trim() === "") {
      throw new BusinessRuleError("Guardian user ID is required.", {
        userMessage: "Parent or guardian identity is missing.",
      });
    }
    return this.store.listGuardianAssignments(guardianUserId, date);
  }

  /**
   * Sets or updates guardian notification preferences (quiet hours, frequency).
   */
  async setNotificationPreference(input: unknown): Promise<DiaryNotificationPreferenceRow> {
    const parsed = setNotificationPreferenceSchema.parse(input);
    assertQuietHoursPair(parsed.quietHoursStart, parsed.quietHoursEnd);
    return this.store.setNotificationPreference(parsed);
  }

  /**
   * Registers a syllabus topic in the curriculum tracker.
   */
  async createSyllabusTopic(input: unknown): Promise<SyllabusTopic> {
    const parsed = createSyllabusTopicSchema.parse(input);
    assertValidSyllabusTopic(parsed);
    return this.store.saveSyllabusTopic(parsed);
  }

  /**
   * Marks a syllabus topic as covered in a lesson/diary.
   */
  async markSyllabusTopicCovered(input: unknown): Promise<SyllabusTopic> {
    const parsed = markTopicCoveredSchema.parse(input);
    const topics = await this.store.listSyllabusTopics(parsed.topicId);
    const existing = topics.find((t) => t.id === parsed.topicId);

    if (existing) {
      assertCanCoverSyllabusTopic(
        existing,
        parsed.coveredDate,
        parsed.coveredByTeacherUserId,
      );
    }

    return this.store.markSyllabusTopicCovered(parsed);
  }

  /**
   * Computes syllabus coverage tracking summary, pace status, and chapter breakdown.
   */
  async getSyllabusCoverageReport(filter: unknown): Promise<{
    readonly summary: SyllabusCoverageSummary;
    readonly chapterGroups: readonly ChapterCoverageGroup[];
    readonly topics: readonly SyllabusTopic[];
  }> {
    const parsed = getSyllabusCoverageFilterSchema.parse(filter);
    const topics = await this.store.listSyllabusTopics(parsed.subjectId, parsed.classId);

    const summary = calculateSyllabusCoverage(topics, parsed.expectedProgressRatio);
    const chapterGroups = groupSyllabusByChapter(topics);

    return {
      summary,
      chapterGroups,
      topics,
    };
  }
}
