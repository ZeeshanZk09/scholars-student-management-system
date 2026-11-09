/**
 * Ports and read models for the Daily Diary domain (`ARCHITECTURE.md` §23, `PRD.md` MODULE 23/24).
 *
 * Domain-driven application boundary. Pure interfaces — zero Drizzle imports, zero database coupling.
 */
import type {
  DiaryAttachmentType,
  DiaryFrequency,
  DiaryReadVia,
  DiaryStatus,
  DiaryViewerKind,
  SyllabusTopic,
} from "../domain/diary-rules";
import type {
  CreateSyllabusTopicInput,
  ListDiariesFilter,
  MarkTopicCoveredInput,
  PostDiaryEntryInput,
  SetNotificationPreferenceInput,
  UpdateDiaryEntryInput,
  UploadAttachmentInput,
} from "./schemas";

/* -------------------------------------------------------------------------- */
/* Read models (mapped from domain and database tables)                       */
/* -------------------------------------------------------------------------- */

export interface DiaryRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly subjectId: string;
  readonly diaryDate: string;
  readonly title: string;
  readonly content: string;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly status: DiaryStatus;
  readonly assignedAt: Date | null;
  readonly assignedByTeacherUserId: string | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface DiaryAssignmentRow {
  readonly id: string;
  readonly diaryId: string;
  readonly studentId: string;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly assignedAt: Date;
  readonly guardianUserId: string;
  readonly acknowledgedAt: Date | null;
  readonly acknowledgedByUserId: string | null;
}

export interface DiaryAttachmentRow {
  readonly id: string;
  readonly diaryId: string;
  readonly label: string;
  readonly attachmentType: DiaryAttachmentType;
  readonly storageKey: string | null;
  readonly externalUrl: string | null;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly uploadedByUserId: string;
  readonly createdAt: Date;
}

export interface DiaryNotificationRow {
  readonly id: string;
  readonly diaryId: string;
  readonly studentId: string;
  readonly guardianUserId: string;
  readonly diaryAssignmentId: string;
  readonly status: string;
  readonly idempotencyKey: string;
  readonly attemptCount: number;
  readonly lastAttemptAt: Date | null;
  readonly sentAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly failureReason: string | null;
  readonly subjectLine: string | null;
  readonly createdAt: Date;
}

export interface DiaryNotificationPreferenceRow {
  readonly id: string;
  readonly guardianUserId: string;
  readonly subjectId: string | null;
  readonly emailEnabled: boolean;
  readonly diaryFrequency: DiaryFrequency;
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface DiaryReadRow {
  readonly id: string;
  readonly diaryId: string;
  readonly viewerKind: DiaryViewerKind;
  readonly viewerId: string;
  readonly readAt: Date;
  readonly via: DiaryReadVia;
}

export interface StudentRosterCandidate {
  readonly studentId: string;
  readonly guardianUserId: string;
  readonly classId?: string | null;
  readonly sectionId?: string | null;
  readonly studentName?: string;
  readonly rollNumber?: string | null;
}

export interface DiaryAssignmentWithStudentView extends DiaryAssignmentRow {
  readonly studentName: string;
  readonly rollNumber: string | null;
  readonly guardianName: string | null;
  readonly isRead: boolean;
  readonly readAt: Date | null;
  readonly diary?: DiaryRow | undefined;
}

export interface DiaryDetailView {
  readonly diary: DiaryRow;
  readonly subjectName?: string | undefined;
  readonly className?: string | undefined;
  readonly sectionName?: string | undefined;
  readonly attachments: readonly DiaryAttachmentRow[];
  readonly assignments: readonly DiaryAssignmentWithStudentView[];
  readonly reads: readonly DiaryReadRow[];
  readonly syllabusTopics: readonly SyllabusTopic[];
  readonly readRate: number;
  readonly ackRate: number;
}

/* -------------------------------------------------------------------------- */
/* Store Port                                                                 */
/* -------------------------------------------------------------------------- */

export interface DiaryStore {
  createDiary(entry: PostDiaryEntryInput, teacherUserId: string): Promise<DiaryRow>;
  getDiary(id: string): Promise<DiaryRow | null>;
  listDiaries(filter: ListDiariesFilter): Promise<{ items: readonly DiaryRow[]; totalCount: number }>;
  updateDiary(id: string, update: UpdateDiaryEntryInput): Promise<DiaryRow>;
  assignDiary(
    diaryId: string,
    teacherUserId: string,
    roster: readonly StudentRosterCandidate[],
  ): Promise<{ assignedCount: number; notificationsQueued: number }>;
  closeDiary(diaryId: string, closedAt: Date): Promise<DiaryRow>;

  addAttachment(attachment: UploadAttachmentInput): Promise<DiaryAttachmentRow>;
  listAttachments(diaryId: string): Promise<readonly DiaryAttachmentRow[]>;

  recordReadReceipt(
    diaryId: string,
    viewerKind: DiaryViewerKind,
    viewerId: string,
    via: DiaryReadVia,
  ): Promise<DiaryReadRow>;

  acknowledgeAssignment(
    diaryAssignmentId: string,
    acknowledgedByUserId: string,
    acknowledgedAt: Date,
  ): Promise<DiaryAssignmentRow>;

  getAssignment(assignmentId: string): Promise<DiaryAssignmentRow | null>;
  getDiaryDetail(diaryId: string): Promise<DiaryDetailView | null>;

  listStudentAssignments(
    studentId: string,
    date?: string,
  ): Promise<readonly DiaryAssignmentWithStudentView[]>;

  listGuardianAssignments(
    guardianUserId: string,
    date?: string,
  ): Promise<readonly DiaryAssignmentWithStudentView[]>;

  getNotificationPreference(
    guardianUserId: string,
    subjectId?: string | null,
  ): Promise<DiaryNotificationPreferenceRow | null>;

  setNotificationPreference(
    pref: SetNotificationPreferenceInput,
  ): Promise<DiaryNotificationPreferenceRow>;

  getSectionStudentRoster(
    classId?: string | null,
    sectionId?: string | null,
  ): Promise<readonly StudentRosterCandidate[]>;

  listSyllabusTopics(subjectId: string, classId?: string | null): Promise<readonly SyllabusTopic[]>;
  saveSyllabusTopic(topic: CreateSyllabusTopicInput): Promise<SyllabusTopic>;
  markSyllabusTopicCovered(input: MarkTopicCoveredInput): Promise<SyllabusTopic>;
}

/* -------------------------------------------------------------------------- */
/* Notification Dispatcher Port                                               */
/* -------------------------------------------------------------------------- */

export interface NotificationDispatcherPort {
  queueDiaryNotification(params: {
    readonly diaryAssignmentId: string;
    readonly diaryId: string;
    readonly studentId: string;
    readonly guardianUserId: string;
    readonly subjectLine: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
}
