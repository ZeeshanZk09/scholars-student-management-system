/**
 * Ports and read models for the Daily Tests domain (`ARCHITECTURE.md` §23, `PRD.md` MODULE 21).
 */
import type {
  DailyTestEvaluationStatus,
  DailyTestPublicationStatus,
} from "../domain/daily-test-rules";
import type { CreateDailyTestInput } from "./schemas";

export type DailyTestPublicationChannel =
  | "student_portal"
  | "guardian_portal"
  | "print"
  | "export";

export interface DailyTestRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly subjectId: string;
  readonly title: string;
  readonly testDate: string;
  readonly totalMarks: number;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly createdByTeacherUserId: string;
  readonly status: DailyTestPublicationStatus;
  readonly publishedAt: Date | null;
  readonly lockedAt: Date | null;
  readonly paperStorageKey: string | null;
  readonly instructions: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface DailyTestEvaluationRow {
  readonly id: string;
  readonly dailyTestId: string;
  readonly studentId: string;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly status: DailyTestEvaluationStatus;
  readonly obtainedMarks: number | null;
  readonly percentage: number | null;
  readonly enteredByUserId: string | null;
  readonly enteredAt: Date | null;
  readonly statusReason: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface DailyTestCorrectionRow {
  readonly id: string;
  readonly dailyTestEvaluationId: string;
  readonly previousMarks: number | null;
  readonly correctedMarks: number;
  readonly reason: string;
  readonly correctedByUserId: string;
  readonly correctedAt: Date;
}

export interface DailyTestPublicationRow {
  readonly id: string;
  readonly dailyTestId: string;
  readonly channel: DailyTestPublicationChannel;
  readonly publishedAt: Date;
  readonly publishedByUserId: string | null;
}

export interface StudentRosterItem {
  readonly id: string;
  readonly name: string;
  readonly rollNumber: string | null;
}

export interface DailyTestStudentEvaluationView {
  readonly evaluation: DailyTestEvaluationRow;
  readonly student: StudentRosterItem;
  readonly grade: string | null;
  readonly isPassing: boolean;
}

export interface DailyTestSheetView {
  readonly test: DailyTestRow;
  readonly evaluations: readonly DailyTestStudentEvaluationView[];
}

export interface StudentTestViewItem {
  readonly test: DailyTestRow;
  readonly evaluation: DailyTestEvaluationRow;
  readonly grade: string | null;
  readonly isPassing: boolean;
}

export interface DailyTestStore {
  createDailyTest(
    data: CreateDailyTestInput,
    createdByTeacherUserId: string,
  ): Promise<DailyTestRow>;

  getDailyTest(id: string): Promise<DailyTestRow | null>;

  listDailyTests(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly subjectId?: string | undefined;
    readonly teacherUserId?: string | undefined;
    readonly status?: DailyTestPublicationStatus | undefined;
    readonly testDate?: string | undefined;
  }): Promise<readonly DailyTestRow[]>;

  updateDailyTestStatus(
    id: string,
    status: DailyTestPublicationStatus,
    timestamp: Date,
  ): Promise<DailyTestRow>;

  batchEnterEvaluations(
    dailyTestId: string,
    evaluations: readonly {
      readonly studentId: string;
      readonly status: DailyTestEvaluationStatus;
      readonly obtainedMarks: number | null;
      readonly percentage: number | null;
      readonly statusReason?: string | null | undefined;
      readonly notes?: string | null | undefined;
    }[],
    enteredByUserId: string,
  ): Promise<{ readonly savedCount: number; readonly updatedCount: number }>;

  getEvaluation(id: string): Promise<DailyTestEvaluationRow | null>;

  getEvaluationByStudent(
    dailyTestId: string,
    studentId: string,
  ): Promise<DailyTestEvaluationRow | null>;

  getEvaluationsForTest(dailyTestId: string): Promise<readonly DailyTestEvaluationRow[]>;

  recordCorrection(params: {
    readonly evaluationId: string;
    readonly previousMarks: number | null;
    readonly correctedMarks: number;
    readonly reason: string;
    readonly correctedByUserId: string;
    readonly newPercentage: number;
  }): Promise<DailyTestCorrectionRow>;

  recordPublication(
    dailyTestId: string,
    channel: DailyTestPublicationChannel,
    publishedByUserId: string | null,
  ): Promise<DailyTestPublicationRow>;

  getDailyTestSheet(dailyTestId: string): Promise<DailyTestSheetView | null>;

  getStudentDailyTests(
    studentId: string,
    options?: {
      readonly subjectId?: string | undefined;
      readonly academicSessionId?: string | undefined;
    },
  ): Promise<readonly StudentTestViewItem[]>;

  getRosterForScope(
    institutionId: string,
    academicSessionId: string,
    classId?: string | null | undefined,
    sectionId?: string | null | undefined,
  ): Promise<readonly StudentRosterItem[]>;
}
