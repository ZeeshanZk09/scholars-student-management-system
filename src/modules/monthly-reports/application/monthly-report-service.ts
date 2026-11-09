/**
 * Monthly Test Reports Application Service (`PRD.md` MODULE 22, `RULES.md` §43/§46/§47).
 *
 * Coordinates test report compilation, marks aggregation, supersession, publication, and report card generation.
 */
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import {
  calculateMonthlyRollup,
  calculateReportCardMetrics,
  deriveMonthBounds,
  validateLocking,
  validatePublication,
  validateSupersession,
} from "../domain/report-rules";
import type {
  MonthlyReportStore,
  MonthlyTestReportItemRow,
  MonthlyTestReportRow,
  StudentMonthlyReportCard,
} from "./ports";
import {
  BatchGenerateMonthlyReportsSchema,
  GenerateMonthlyReportSchema,
  LockMonthlyReportsBatchSchema,
  PublishMonthlyReportsBatchSchema,
  QueryMonthlyReportsSchema,
} from "./schemas";

export class MonthlyReportService {
  constructor(private readonly store: MonthlyReportStore) {}

  /**
   * Compiles and creates a monthly test report for a single student and subject.
   * If a live report already exists for this period, it is superseded by the new report.
   */
  async generateReport(
    input: unknown,
    _actorUserId?: string,
  ): Promise<{ report: MonthlyTestReportRow; supersededReportId: string | null }> {
    void _actorUserId;
    const parsed = GenerateMonthlyReportSchema.parse(input);
    const { periodStart, periodEnd } = deriveMonthBounds(parsed.periodMonth);

    // Check for existing live report
    const existing = await this.store.findLiveReport(
      parsed.studentId,
      parsed.subjectId,
      parsed.academicSessionId,
      periodStart,
    );

    if (existing && existing.status === "locked") {
      throw new BusinessRuleError(
        `Report ${existing.id} is locked and cannot be recomputed or superseded.`,
        {
          userMessage: "This monthly report is locked and cannot be recomputed.",
        },
      );
    }

    // Retrieve published/locked daily tests and evaluations
    const evaluations = await this.store.findDailyTestEvaluations({
      studentId: parsed.studentId,
      subjectId: parsed.subjectId,
      academicSessionId: parsed.academicSessionId,
      periodStart,
      periodEnd,
    });

    if (evaluations.length === 0) {
      throw new BusinessRuleError("No daily test evaluations found for this period and subject.", {
        userMessage: "No test records were found for this subject and month.",
      });
    }

    // Pure domain rollup calculation
    const rollup = calculateMonthlyRollup(
      evaluations.map((ev) => ({
        dailyTestId: ev.dailyTestId,
        evaluationId: ev.dailyTestEvaluationId,
        title: ev.title,
        testDate: ev.testDate,
        totalMarks: ev.totalMarks,
        status: ev.evaluationStatus,
        obtainedMarks: ev.obtainedMarks,
        percentage: ev.percentage,
      })),
    );

    // Create the new report
    const newReport = await this.store.createReportWithItems({
      institutionId: parsed.institutionId,
      academicSessionId: parsed.academicSessionId,
      studentId: parsed.studentId,
      subjectId: parsed.subjectId,
      periodStart,
      periodEnd,
      testsCounted: rollup.testsCounted,
      averagePercentage: rollup.averagePercentage,
      classId: parsed.classId ?? null,
      sectionId: parsed.sectionId ?? null,
      status: "draft",
      testBreakdown: rollup.breakdown,
      items: rollup.items.map((item) => ({
        dailyTestId: item.dailyTestId,
        dailyTestEvaluationId: item.evaluationId,
        usedPercentage: item.usedPercentage,
        weight: item.weight,
      })),
    });

    // Handle supersession if an active previous version was present
    let supersededReportId: string | null = null;
    if (existing) {
      validateSupersession(existing, newReport.id);
      await this.store.supersedeReport(existing.id, newReport.id);
      supersededReportId = existing.id;
    }

    return { report: newReport, supersededReportId };
  }

  /**
   * Batch compiles monthly test reports for all enrolled students in a class or section.
   */
  async batchGenerateReports(
    input: unknown,
    actorUserId?: string,
  ): Promise<{
    generatedCount: number;
    supersededCount: number;
    skippedCount: number;
    errors: readonly string[];
  }> {
    const parsed = BatchGenerateMonthlyReportsSchema.parse(input);

    const students = await this.store.findStudentsInScope({
      institutionId: parsed.institutionId,
      academicSessionId: parsed.academicSessionId,
      classId: parsed.classId,
      sectionId: parsed.sectionId ?? undefined,
    });

    if (students.length === 0) {
      return {
        generatedCount: 0,
        supersededCount: 0,
        skippedCount: 0,
        errors: ["No students found in the selected class and section scope."],
      };
    }

    let subjects: readonly { subjectId: string; subjectName: string; subjectCode: string }[];
    if (parsed.subjectId) {
      subjects = [{ subjectId: parsed.subjectId, subjectName: "Selected Subject", subjectCode: "SEL" }];
    } else {
      subjects = await this.store.findSubjectsForClass(parsed.institutionId, parsed.classId);
    }

    let generatedCount = 0;
    let supersededCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const student of students) {
      for (const subject of subjects) {
        try {
          const res = await this.generateReport(
            {
              institutionId: parsed.institutionId,
              academicSessionId: parsed.academicSessionId,
              studentId: student.studentId,
              subjectId: subject.subjectId,
              periodMonth: parsed.periodMonth,
              classId: student.classId,
              sectionId: student.sectionId,
            },
            actorUserId,
          );
          generatedCount += 1;
          if (res.supersededReportId) {
            supersededCount += 1;
          }
        } catch (err) {
          if (err instanceof BusinessRuleError) {
            // Students without test records in this subject are skipped
            skippedCount += 1;
          } else {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`Student ${student.studentId}, Subject ${subject.subjectCode}: ${message}`);
          }
        }
      }
    }

    return {
      generatedCount,
      supersededCount,
      skippedCount,
      errors,
    };
  }

  /**
   * Batch publishes reports, making them visible to students and guardians.
   */
  async publishReports(
    input: unknown,
    _actorUserId?: string,
  ): Promise<{ publishedCount: number }> {
    void _actorUserId;
    const parsed = PublishMonthlyReportsBatchSchema.parse(input);

    // Validate each report before applying updates
    for (const reportId of parsed.reportIds) {
      const report = await this.store.getReportById(reportId);
      if (!report) {
        throw new NotFoundError(`Monthly report ${reportId} not found.`);
      }
      validatePublication(report);
    }

    const now = new Date();
    const publishedCount = await this.store.publishReports(parsed.reportIds, now);

    if (parsed.sendEmail) {
      for (const reportId of parsed.reportIds) {
        const idempotencyKey = `monthly_report:${reportId}`;
        await this.store.markEmailSent(reportId, idempotencyKey, now);
      }
    }

    return { publishedCount };
  }

  /**
   * Batch locks published reports, guaranteeing immutability.
   */
  async lockReports(
    input: unknown,
    _actorUserId?: string,
  ): Promise<{ lockedCount: number }> {
    void _actorUserId;
    const parsed = LockMonthlyReportsBatchSchema.parse(input);

    for (const reportId of parsed.reportIds) {
      const report = await this.store.getReportById(reportId);
      if (!report) {
        throw new NotFoundError(`Monthly report ${reportId} not found.`);
      }
      validateLocking(report);
    }

    const lockedCount = await this.store.lockReports(parsed.reportIds);
    return { lockedCount };
  }

  /**
   * Generates a printable, comprehensive monthly report card for a student across all subjects.
   */
  async getStudentReportCard(
    studentId: string,
    periodMonth: string,
    canViewUnpublished = false,
  ): Promise<StudentMonthlyReportCard> {
    const { periodStart, periodEnd } = deriveMonthBounds(periodMonth);

    const card = await this.store.getStudentReportCard(
      studentId,
      periodStart,
      periodEnd,
      canViewUnpublished,
    );

    if (!card) {
      throw new NotFoundError(`Student monthly report card not found for ${studentId}.`);
    }

    const metrics = calculateReportCardMetrics(card.subjects);

    return {
      ...card,
      overallPercentage: metrics.overallPercentage,
      totalTestsSat: metrics.totalTestsSat,
      performanceRating: metrics.performanceRating,
      gradeBand: metrics.gradeBand,
      remarks: metrics.remarks,
    };
  }

  /**
   * Retrieves single report details with its individual contributing tests.
   */
  async getReportDetails(
    reportId: string,
  ): Promise<{ report: MonthlyTestReportRow; items: readonly MonthlyTestReportItemRow[] }> {
    const details = await this.store.getReportWithItems(reportId);
    if (!details) {
      throw new NotFoundError(`Monthly report ${reportId} not found.`);
    }
    return details;
  }

  /**
   * Queries reports matching given filter criteria.
   */
  async listReports(queryInput: unknown): Promise<readonly MonthlyTestReportRow[]> {
    const parsed = QueryMonthlyReportsSchema.parse(queryInput);
    return this.store.listReports(parsed);
  }
}
