/**
 * Monthly Reports Application Ports (`ARCHITECTURE.md` §26–28, `src/modules/README.md`).
 *
 * Defines the contract that the application service requires from the persistence infrastructure.
 * Decoupled from Drizzle ORM, PostgreSQL, or Next.js.
 */
import type {
  MonthlyReportStatus,
  TestBreakdownEntry,
} from "../domain/report-rules";
import type { QueryMonthlyReportsInput } from "./schemas";

/* -------------------------------------------------------------------------- */
/* Read Models                                                                */
/* -------------------------------------------------------------------------- */

export interface MonthlyTestReportRow {
  readonly id: string;
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly studentId: string;
  readonly subjectId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly testsCounted: number;
  readonly averagePercentage: number | null;
  readonly classId: string | null;
  readonly sectionId: string | null;
  readonly status: MonthlyReportStatus;
  readonly publishedAt: Date | null;
  readonly emailSentAt: Date | null;
  readonly emailIdempotencyKey: string | null;
  readonly supersededByReportId: string | null;
  readonly testBreakdown: Record<string, TestBreakdownEntry> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface MonthlyTestReportItemRow {
  readonly id: string;
  readonly monthlyTestReportId: string;
  readonly dailyTestId: string;
  readonly dailyTestEvaluationId: string;
  readonly usedPercentage: number | null;
  readonly weight: number | null;
}

export interface DailyTestEvaluationWithTest {
  readonly dailyTestId: string;
  readonly subjectId: string;
  readonly title: string;
  readonly testDate: string;
  readonly totalMarks: number;
  readonly testStatus: string;
  readonly dailyTestEvaluationId: string;
  readonly studentId: string;
  readonly evaluationStatus: string;
  readonly obtainedMarks: number | null;
  readonly percentage: number | null;
}

export interface SubjectReportCardItem {
  readonly reportId: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly subjectCode: string;
  readonly testsCounted: number;
  readonly averagePercentage: number | null;
  readonly status: MonthlyReportStatus;
  readonly publishedAt: Date | null;
  readonly breakdown: Record<string, TestBreakdownEntry> | null;
}

export interface StudentMonthlyReportCard {
  readonly institutionId: string;
  readonly institutionName: string;
  readonly academicSessionId: string;
  readonly sessionName: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly admissionNumber: string;
  readonly rollNumber: string | null;
  readonly className: string;
  readonly sectionName: string | null;
  readonly periodMonth: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly subjects: readonly SubjectReportCardItem[];
  readonly overallPercentage: number | null;
  readonly totalTestsSat: number;
  readonly performanceRating?: string | null;
  readonly gradeBand?: string | null;
  readonly remarks?: string | null;
  readonly generatedAt: Date;
}

export interface CreateMonthlyReportParams {
  readonly institutionId: string;
  readonly academicSessionId: string;
  readonly studentId: string;
  readonly subjectId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly testsCounted: number;
  readonly averagePercentage: number;
  readonly classId?: string | null | undefined;
  readonly sectionId?: string | null | undefined;
  readonly status?: MonthlyReportStatus | undefined;
  readonly publishedAt?: Date | null | undefined;
  readonly testBreakdown: Record<string, TestBreakdownEntry>;
  readonly items: readonly {
    readonly dailyTestId: string;
    readonly dailyTestEvaluationId: string;
    readonly usedPercentage: number;
    readonly weight: number;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Store Interface                                                            */
/* -------------------------------------------------------------------------- */

export interface MonthlyReportStore {
  /**
   * Finds the currently live (non-superseded) report for a student, subject, session, and month.
   */
  findLiveReport(
    studentId: string,
    subjectId: string,
    academicSessionId: string,
    periodStart: string,
  ): Promise<MonthlyTestReportRow | null>;

  /**
   * Retrieves a report by its primary UUID.
   */
  getReportById(id: string): Promise<MonthlyTestReportRow | null>;

  /**
   * Retrieves a report along with its individual contributing test items.
   */
  getReportWithItems(
    id: string,
  ): Promise<{ report: MonthlyTestReportRow; items: readonly MonthlyTestReportItemRow[] } | null>;

  /**
   * Queries reports matching the given filters.
   */
  listReports(query: QueryMonthlyReportsInput): Promise<readonly MonthlyTestReportRow[]>;

  /**
   * Finds daily test evaluations for a student and subject within the given date bounds.
   * Only evaluations from published or locked daily tests are returned.
   */
  findDailyTestEvaluations(params: {
    studentId: string;
    subjectId: string;
    academicSessionId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<readonly DailyTestEvaluationWithTest[]>;

  /**
   * Finds students enrolled in a class (and optional section).
   */
  findStudentsInScope(params: {
    institutionId: string;
    academicSessionId: string;
    classId: string;
    sectionId?: string | null | undefined;
  }): Promise<readonly { studentId: string; classId: string; sectionId: string | null }[]>;

  /**
   * Finds subjects assigned to a class.
   */
  findSubjectsForClass(
    institutionId: string,
    classId: string,
  ): Promise<readonly { subjectId: string; subjectName: string; subjectCode: string }[]>;

  /**
   * Creates a new monthly test report with its contributing test items in a single transaction.
   */
  createReportWithItems(params: CreateMonthlyReportParams): Promise<MonthlyTestReportRow>;

  /**
   * Marks an old report as superseded by pointing its `supersededByReportId` to `newReportId`.
   */
  supersedeReport(oldReportId: string, newReportId: string): Promise<void>;

  /**
   * Sets the status of the specified reports to 'published' and updates `publishedAt`.
   * Returns the count of rows updated.
   */
  publishReports(reportIds: readonly string[], publishedAt: Date): Promise<number>;

  /**
   * Sets the status of the specified reports to 'locked' and updates `updatedAt`.
   * Returns the count of rows updated.
   */
  lockReports(reportIds: readonly string[]): Promise<number>;

  /**
   * Records that the consolidated guardian email has been dispatched for this report.
   */
  markEmailSent(reportId: string, emailIdempotencyKey: string, emailSentAt: Date): Promise<void>;

  /**
   * Compiles the printable monthly report card data for a student across all subjects.
   */
  getStudentReportCard(
    studentId: string,
    periodStart: string,
    periodEnd: string,
    canViewUnpublished?: boolean,
  ): Promise<StudentMonthlyReportCard | null>;
}
