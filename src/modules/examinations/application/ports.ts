/**
 * Ports and read models for the examinations domain (`ARCHITECTURE.md` §15/§23).
 */
import type {
  ExamMarkStatus,
  ExamRegistrationStatus,
  ExaminationType,
  PublicationStatus,
  ResultStatus,
} from "../domain/exam-rules";
import type { CreateExaminationInput } from "./schemas";

export interface ExaminationRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly subjectId: string;
  readonly title: string;
  readonly examinationType: ExaminationType;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly totalMarks: number;
  readonly passMarks: number | null;
  readonly timeSlotId: string | null;
  readonly examDate: string;
  readonly status: PublicationStatus;
  readonly publishedAt: Date | null;
  readonly lockedAt: Date | null;
  readonly setByTeacherUserId: string | null;
  readonly questionPaperStorageKey: string | null;
  readonly submissionDeadline: Date | null;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ExaminationMarkRow {
  readonly id: string;
  readonly examinationId: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly subjectId: string;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly status: ExamMarkStatus;
  readonly obtainedMarks: number | null;
  readonly totalMarks: number;
  readonly enteredByUserId: string | null;
  readonly enteredAt: Date | null;
  readonly scriptStorageKey: string | null;
  readonly statusReason: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface ExaminationRegistrationRow {
  readonly id: string;
  readonly examinationId: string;
  readonly studentId: string;
  readonly status: ExamRegistrationStatus;
  readonly seatNumber: string | null;
  readonly registeredAt: Date;
  readonly withdrawnByUserId: string | null;
  readonly withdrawalReason: string | null;
}

export interface ExamMarksCorrectionRow {
  readonly id: string;
  readonly examinationMarkId: string;
  readonly previousMarks: number | null;
  readonly correctedMarks: number;
  readonly reason: string;
  readonly correctedByUserId: string;
  readonly correctedAt: Date;
  readonly approvedByUserId: string | null;
  readonly approvedAt: Date | null;
}

export interface GradingSchemeRow {
  readonly id: string;
  readonly institutionId: string;
  readonly name: string;
  readonly academicSessionId: string | null;
  readonly subjectId: string | null;
  readonly basis: "percentage" | "absolute";
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly description: string | null;
}

export interface GradingBandRow {
  readonly id: string;
  readonly gradingSchemeId: string;
  readonly grade: string;
  readonly minPercentage: number | null;
  readonly minMarks: number | null;
  readonly gradePoint: number | null;
  readonly displayOrder: number;
  readonly isPass: boolean;
}

export interface StudentResultRow {
  readonly id: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly gradingSchemeId: string | null;
  readonly totalObtainedMarks: number | null;
  readonly totalMaximumMarks: number | null;
  readonly percentage: number | null;
  readonly grade: string | null;
  readonly gradePoint: number | null;
  readonly resultStatus: ResultStatus;
  readonly subjectsPassed: number | null;
  readonly subjectsConsidered: number | null;
  readonly subjectBreakdown: Record<string, { obtained: number; total: number; grade: string | null }>;
  readonly status: PublicationStatus;
  readonly publishedAt: Date | null;
  readonly computedFrom: Record<string, unknown> | null;
}

export interface ResultPublicationLogRow {
  readonly id: string;
  readonly studentResultId: string;
  readonly channel: "in_app" | "email" | "portal" | "printed";
  readonly publishedAt: Date;
  readonly publishedByUserId: string | null;
  readonly resendReason: string | null;
  readonly status: "queued" | "sent" | "delivered" | "failed";
  readonly failureReason: string | null;
}

export interface StudentRosterItem {
  readonly studentId: string;
  readonly rollNumber: string | null;
  readonly firstName: string;
  readonly lastName: string;
}

export interface ExaminationSheetView {
  readonly examination: ExaminationRow;
  readonly marks: readonly ExaminationMarkRow[];
  readonly roster: readonly StudentRosterItem[];
  readonly registrations: readonly ExaminationRegistrationRow[];
}

export interface ExaminationStore {
  createExamination(data: CreateExaminationInput, setByTeacherUserId?: string | null): Promise<ExaminationRow>;
  getExamination(id: string): Promise<ExaminationRow | null>;
  listExaminations(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly subjectId?: string | undefined;
    readonly status?: PublicationStatus | undefined;
  }): Promise<readonly ExaminationRow[]>;
  updateExaminationStatus(id: string, status: PublicationStatus, actorUserId: string): Promise<ExaminationRow>;

  registerStudents(examinationId: string, studentIds: readonly string[]): Promise<number>;
  listRegistrations(examinationId: string): Promise<readonly ExaminationRegistrationRow[]>;

  batchEnterMarks(
    examinationId: string,
    marks: readonly {
      readonly studentId: string;
      readonly status: ExamMarkStatus;
      readonly obtainedMarks: number | null;
      readonly statusReason?: string | null | undefined;
      readonly notes?: string | null | undefined;
    }[],
    enteredByUserId: string,
    finalize?: boolean,
  ): Promise<{ readonly savedCount: number; readonly updatedCount: number }>;

  listMarks(examinationId: string): Promise<readonly ExaminationMarkRow[]>;
  getMark(examinationMarkId: string): Promise<ExaminationMarkRow | null>;
  getMarkByStudent(examinationId: string, studentId: string): Promise<ExaminationMarkRow | null>;

  recordCorrection(
    data: {
      readonly examinationMarkId: string;
      readonly previousMarks: number | null;
      readonly correctedMarks: number;
      readonly reason: string;
    },
    correctedByUserId: string,
  ): Promise<ExamMarksCorrectionRow>;

  listCorrections(examinationMarkId: string): Promise<readonly ExamMarksCorrectionRow[]>;

  getExaminationSheet(examinationId: string): Promise<ExaminationSheetView>;

  getGradingSchemeWithBands(schemeId: string): Promise<{ scheme: GradingSchemeRow; bands: readonly GradingBandRow[] } | null>;
  getDefaultGradingScheme(institutionId: string, subjectId?: string): Promise<{ scheme: GradingSchemeRow; bands: readonly GradingBandRow[] } | null>;

  saveStudentResult(data: {
    readonly studentId: string;
    readonly academicSessionId: string;
    readonly classId: string | null;
    readonly sectionId: string | null;
    readonly gradingSchemeId: string | null;
    readonly totalObtainedMarks: number;
    readonly totalMaximumMarks: number;
    readonly percentage: number;
    readonly grade: string;
    readonly gradePoint: number | null;
    readonly resultStatus: ResultStatus;
    readonly subjectsPassed: number;
    readonly subjectsConsidered: number;
    readonly subjectBreakdown: Record<string, { obtained: number; total: number; grade: string | null }>;
    readonly status: PublicationStatus;
    readonly publishedAt?: Date | null | undefined;
    readonly computedFrom?: Record<string, unknown> | null | undefined;
  }): Promise<StudentResultRow>;

  getStudentResult(studentId: string, academicSessionId: string): Promise<StudentResultRow | null>;
  listStudentResultsByScope(filters: {
    readonly academicSessionId: string;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly studentId?: string | undefined;
  }): Promise<readonly StudentResultRow[]>;

  logPublication(data: {
    readonly studentResultId: string;
    readonly channel: "in_app" | "email" | "portal" | "printed";
    readonly publishedByUserId?: string | null | undefined;
    readonly resendReason?: string | null | undefined;
    readonly status?: "queued" | "sent" | "delivered" | "failed" | undefined;
    readonly failureReason?: string | null | undefined;
  }): Promise<ResultPublicationLogRow>;
}