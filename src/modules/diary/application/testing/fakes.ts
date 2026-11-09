/**
 * In-memory test fakes for Daily Diary store and notification dispatcher.
 */
import { randomUUID } from "node:crypto";
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
  StudentRosterCandidate,
} from "../ports";
import type {
  CreateSyllabusTopicInput,
  ListDiariesFilter,
  MarkTopicCoveredInput,
  PostDiaryEntryInput,
  SetNotificationPreferenceInput,
  UpdateDiaryEntryInput,
  UploadAttachmentInput,
} from "../schemas";
import {
  calculateReadMetrics,
  type DiaryReadVia,
  type DiaryViewerKind,
  type SyllabusTopic,
} from "../../domain/diary-rules";

export class InMemoryNotificationDispatcher implements NotificationDispatcherPort {
  public readonly queuedNotifications: Array<{
    readonly diaryAssignmentId: string;
    readonly diaryId: string;
    readonly studentId: string;
    readonly guardianUserId: string;
    readonly subjectLine: string;
    readonly idempotencyKey: string;
  }> = [];

  async queueDiaryNotification(params: {
    readonly diaryAssignmentId: string;
    readonly diaryId: string;
    readonly studentId: string;
    readonly guardianUserId: string;
    readonly subjectLine: string;
    readonly idempotencyKey: string;
  }): Promise<void> {
    this.queuedNotifications.push(params);
  }
}

export class InMemoryDiaryStore implements DiaryStore {
  public readonly diaries = new Map<string, DiaryRow>();
  public readonly assignments = new Map<string, DiaryAssignmentRow>();
  public readonly attachments = new Map<string, DiaryAttachmentRow[]>();
  public readonly reads = new Map<string, DiaryReadRow>();
  public readonly preferences = new Map<string, DiaryNotificationPreferenceRow>();
  public readonly syllabusTopics = new Map<string, SyllabusTopic>();
  public rosterCandidates: readonly StudentRosterCandidate[] = [];

  async createDiary(entry: PostDiaryEntryInput, teacherUserId: string): Promise<DiaryRow> {
    const id = randomUUID();
    const now = new Date();
    const row: DiaryRow = {
      id,
      institutionId: entry.institutionId,
      academicSessionId: entry.academicSessionId,
      subjectId: entry.subjectId,
      diaryDate: entry.diaryDate,
      title: entry.title,
      content: entry.content,
      classId: entry.classId ?? null,
      sectionId: entry.sectionId ?? null,
      status: entry.status ?? "draft",
      assignedAt: entry.assignedAt ?? null,
      assignedByTeacherUserId: entry.assignedByTeacherUserId ?? teacherUserId,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.diaries.set(id, row);
    return row;
  }

  async getDiary(id: string): Promise<DiaryRow | null> {
    return this.diaries.get(id) ?? null;
  }

  async listDiaries(filter: ListDiariesFilter): Promise<{ items: readonly DiaryRow[]; totalCount: number }> {
    let all = Array.from(this.diaries.values());

    if (filter.institutionId) {
      all = all.filter((d) => d.institutionId === filter.institutionId);
    }
    if (filter.subjectId) {
      all = all.filter((d) => d.subjectId === filter.subjectId);
    }
    if (filter.classId) {
      all = all.filter((d) => d.classId === filter.classId);
    }
    if (filter.sectionId) {
      all = all.filter((d) => d.sectionId === filter.sectionId);
    }
    if (filter.status) {
      all = all.filter((d) => d.status === filter.status);
    }
    if (filter.diaryDate) {
      all = all.filter((d) => d.diaryDate === filter.diaryDate);
    }

    const totalCount = all.length;
    const offset = (filter.page - 1) * filter.pageSize;
    const items = all.slice(offset, offset + filter.pageSize);

    return { items, totalCount };
  }

  async updateDiary(id: string, update: UpdateDiaryEntryInput): Promise<DiaryRow> {
    const existing = this.diaries.get(id);
    if (!existing) {
      throw new Error(`Diary ${id} not found.`);
    }

    const updated: DiaryRow = {
      ...existing,
      title: update.title ?? existing.title,
      content: update.content ?? existing.content,
      classId: update.classId !== undefined ? update.classId : existing.classId,
      sectionId: update.sectionId !== undefined ? update.sectionId : existing.sectionId,
      status: update.status ?? existing.status,
      closedAt: update.closedAt !== undefined ? update.closedAt : existing.closedAt,
      updatedAt: new Date(),
      version: existing.version + 1,
    };

    this.diaries.set(id, updated);
    return updated;
  }

  async assignDiary(
    diaryId: string,
    teacherUserId: string,
    roster: readonly StudentRosterCandidate[],
  ): Promise<{ assignedCount: number; notificationsQueued: number }> {
    const diary = this.diaries.get(diaryId);
    if (!diary) throw new Error("Diary not found.");

    const now = new Date();
    const updatedDiary: DiaryRow = {
      ...diary,
      status: "assigned",
      assignedAt: now,
      assignedByTeacherUserId: teacherUserId,
      updatedAt: now,
      version: diary.version + 1,
    };
    this.diaries.set(diaryId, updatedDiary);

    let assignedCount = 0;
    let notificationsQueued = 0;

    for (const item of roster) {
      const assignmentId = randomUUID();
      const assignment: DiaryAssignmentRow = {
        id: assignmentId,
        diaryId,
        studentId: item.studentId,
        classId: item.classId ?? diary.classId,
        sectionId: item.sectionId ?? diary.sectionId,
        assignedAt: now,
        guardianUserId: item.guardianUserId,
        acknowledgedAt: null,
        acknowledgedByUserId: null,
      };
      this.assignments.set(assignmentId, assignment);
      assignedCount++;
      if (item.guardianUserId) {
        notificationsQueued++;
      }
    }

    return { assignedCount, notificationsQueued };
  }

  async closeDiary(diaryId: string, closedAt: Date): Promise<DiaryRow> {
    const diary = this.diaries.get(diaryId);
    if (!diary) throw new Error("Diary not found.");

    const updated: DiaryRow = {
      ...diary,
      status: "closed",
      closedAt,
      updatedAt: new Date(),
      version: diary.version + 1,
    };
    this.diaries.set(diaryId, updated);
    return updated;
  }

  async addAttachment(attachment: UploadAttachmentInput): Promise<DiaryAttachmentRow> {
    const id = randomUUID();
    const row: DiaryAttachmentRow = {
      id,
      diaryId: attachment.diaryId,
      label: attachment.label,
      attachmentType: attachment.attachmentType,
      storageKey: attachment.storageKey ?? null,
      externalUrl: attachment.externalUrl ?? null,
      contentType: attachment.contentType ?? null,
      sizeBytes: attachment.sizeBytes ?? null,
      uploadedByUserId: attachment.uploadedByUserId,
      createdAt: new Date(),
    };

    const existing = this.attachments.get(attachment.diaryId) ?? [];
    this.attachments.set(attachment.diaryId, [...existing, row]);
    return row;
  }

  async listAttachments(diaryId: string): Promise<readonly DiaryAttachmentRow[]> {
    return this.attachments.get(diaryId) ?? [];
  }

  async recordReadReceipt(
    diaryId: string,
    viewerKind: DiaryViewerKind,
    viewerId: string,
    via: DiaryReadVia,
  ): Promise<DiaryReadRow> {
    const key = `${diaryId}:${viewerKind}:${viewerId}`;
    const row: DiaryReadRow = {
      id: randomUUID(),
      diaryId,
      viewerKind,
      viewerId,
      readAt: new Date(),
      via,
    };
    this.reads.set(key, row);
    return row;
  }

  async acknowledgeAssignment(
    diaryAssignmentId: string,
    acknowledgedByUserId: string,
    acknowledgedAt: Date,
  ): Promise<DiaryAssignmentRow> {
    const assignment = this.assignments.get(diaryAssignmentId);
    if (!assignment) throw new Error("Assignment not found.");

    const updated: DiaryAssignmentRow = {
      ...assignment,
      acknowledgedAt,
      acknowledgedByUserId,
    };
    this.assignments.set(diaryAssignmentId, updated);
    return updated;
  }

  async getAssignment(assignmentId: string): Promise<DiaryAssignmentRow | null> {
    return this.assignments.get(assignmentId) ?? null;
  }

  async getDiaryDetail(diaryId: string): Promise<DiaryDetailView | null> {
    const diary = this.diaries.get(diaryId);
    if (!diary) return null;

    const attachments = this.attachments.get(diaryId) ?? [];
    const assignmentRows = Array.from(this.assignments.values()).filter((a) => a.diaryId === diaryId);
    const readRows = Array.from(this.reads.values()).filter((r) => r.diaryId === diaryId);

    const detailedAssignments: DiaryAssignmentWithStudentView[] = assignmentRows.map((a) => {
      const read = readRows.find((r) => r.viewerId === a.studentId || r.viewerId === a.guardianUserId);
      return {
        ...a,
        studentName: `Student ${a.studentId}`,
        rollNumber: "101",
        guardianName: `Guardian ${a.guardianUserId}`,
        isRead: Boolean(read),
        readAt: read ? read.readAt : null,
      };
    });

    const metrics = calculateReadMetrics(
      assignmentRows.length,
      readRows.length,
      assignmentRows.filter((a) => a.acknowledgedAt !== null).length,
    );

    const topics = Array.from(this.syllabusTopics.values()).filter(
      (t) => t.subjectId === diary.subjectId,
    );

    return {
      diary,
      subjectName: "General Subject",
      className: "Grade 10",
      sectionName: "A",
      attachments,
      assignments: detailedAssignments,
      reads: readRows,
      syllabusTopics: topics,
      readRate: metrics.readRate,
      ackRate: metrics.ackRate,
    };
  }

  async listStudentAssignments(
    studentId: string,
    date?: string,
  ): Promise<readonly DiaryAssignmentWithStudentView[]> {
    const rows = Array.from(this.assignments.values()).filter((a) => a.studentId === studentId);
    const result: DiaryAssignmentWithStudentView[] = [];

    for (const a of rows) {
      const diary = this.diaries.get(a.diaryId);
      if (date && diary && diary.diaryDate !== date) continue;

      const read = Array.from(this.reads.values()).find(
        (r) => r.diaryId === a.diaryId && (r.viewerId === studentId || r.viewerId === a.guardianUserId),
      );

      result.push({
        ...a,
        studentName: `Student ${studentId}`,
        rollNumber: "101",
        guardianName: `Guardian ${a.guardianUserId}`,
        isRead: Boolean(read),
        readAt: read ? read.readAt : null,
        diary,
      });
    }

    return result;
  }

  async listGuardianAssignments(
    guardianUserId: string,
    date?: string,
  ): Promise<readonly DiaryAssignmentWithStudentView[]> {
    const rows = Array.from(this.assignments.values()).filter((a) => a.guardianUserId === guardianUserId);
    const result: DiaryAssignmentWithStudentView[] = [];

    for (const a of rows) {
      const diary = this.diaries.get(a.diaryId);
      if (date && diary && diary.diaryDate !== date) continue;

      const read = Array.from(this.reads.values()).find(
        (r) => r.diaryId === a.diaryId && (r.viewerId === guardianUserId || r.viewerId === a.studentId),
      );

      result.push({
        ...a,
        studentName: `Student ${a.studentId}`,
        rollNumber: "101",
        guardianName: `Guardian ${guardianUserId}`,
        isRead: Boolean(read),
        readAt: read ? read.readAt : null,
        diary,
      });
    }

    return result;
  }

  async getNotificationPreference(
    guardianUserId: string,
    subjectId?: string | null,
  ): Promise<DiaryNotificationPreferenceRow | null> {
    const key = `${guardianUserId}:${subjectId ?? "all"}`;
    return this.preferences.get(key) ?? null;
  }

  async setNotificationPreference(
    pref: SetNotificationPreferenceInput,
  ): Promise<DiaryNotificationPreferenceRow> {
    const key = `${pref.guardianUserId}:${pref.subjectId ?? "all"}`;
    const now = new Date();
    const row: DiaryNotificationPreferenceRow = {
      id: randomUUID(),
      guardianUserId: pref.guardianUserId,
      subjectId: pref.subjectId ?? null,
      emailEnabled: pref.emailEnabled,
      diaryFrequency: pref.diaryFrequency,
      quietHoursStart: pref.quietHoursStart ?? null,
      quietHoursEnd: pref.quietHoursEnd ?? null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.preferences.set(key, row);
    return row;
  }

  async getSectionStudentRoster(
    _classId?: string | null,
    _sectionId?: string | null,
  ): Promise<readonly StudentRosterCandidate[]> {
    void _classId;
    void _sectionId;
    return this.rosterCandidates;
  }

  async listSyllabusTopics(subjectId: string, classId?: string | null): Promise<readonly SyllabusTopic[]> {
    return Array.from(this.syllabusTopics.values()).filter(
      (t) => t.subjectId === subjectId && (!classId || t.classId === classId),
    );
  }

  async saveSyllabusTopic(topic: CreateSyllabusTopicInput): Promise<SyllabusTopic> {
    const id = randomUUID();
    const saved: SyllabusTopic = {
      id,
      subjectId: topic.subjectId,
      classId: topic.classId ?? null,
      chapterNumber: topic.chapterNumber,
      chapterTitle: topic.chapterTitle,
      topicNumber: topic.topicNumber,
      topicTitle: topic.topicTitle,
      learningObjectives: topic.learningObjectives ?? null,
      estimatedPeriods: topic.estimatedPeriods,
      status: "pending",
    };
    this.syllabusTopics.set(id, saved);
    return saved;
  }

  async markSyllabusTopicCovered(input: MarkTopicCoveredInput): Promise<SyllabusTopic> {
    const existing = this.syllabusTopics.get(input.topicId);
    if (!existing) {
      throw new Error(`Topic ${input.topicId} not found.`);
    }

    const updated: SyllabusTopic = {
      ...existing,
      status: "covered",
      coveredDate: input.coveredDate,
      diaryId: input.diaryId ?? existing.diaryId,
      coveredByTeacherUserId: input.coveredByTeacherUserId,
      notes: input.notes ?? existing.notes,
    };
    this.syllabusTopics.set(input.topicId, updated);
    return updated;
  }
}
