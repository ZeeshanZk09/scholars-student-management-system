/**
 * Drizzle implementation of MonthlyReportStore (`ARCHITECTURE.md` §15/§23, `PRD.md` MODULE 22).
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import { ConflictError } from "@/shared/errors";
import {
  academicSessions,
  classes,
  classSubjects,
  dailyTestEvaluations,
  dailyTests,
  institutions,
  monthlyTestReportItems,
  monthlyTestReports,
  sections,
  studentPlacements,
  students,
  subjects,
} from "@/db/schema";
import type {
  MonthlyReportStatus,
  TestBreakdownEntry,
} from "../domain/report-rules";
import type {
  CreateMonthlyReportParams,
  DailyTestEvaluationWithTest,
  MonthlyReportStore,
  MonthlyTestReportItemRow,
  MonthlyTestReportRow,
  StudentMonthlyReportCard,
  SubjectReportCardItem,
} from "../application/ports";
import type { QueryMonthlyReportsInput } from "../application/schemas";

export class DrizzleMonthlyReportStore implements MonthlyReportStore {
  constructor(private readonly client: DbLike = db) {}

  private mapReport(r: typeof monthlyTestReports.$inferSelect): MonthlyTestReportRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      academicSessionId: r.academicSessionId,
      studentId: r.studentId,
      subjectId: r.subjectId,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      testsCounted: r.testsCounted,
      averagePercentage: r.averagePercentage !== null ? Number(r.averagePercentage) : null,
      classId: r.classId,
      sectionId: r.sectionId,
      status: r.status as MonthlyReportStatus,
      publishedAt: r.publishedAt,
      emailSentAt: r.emailSentAt,
      emailIdempotencyKey: r.emailIdempotencyKey,
      supersededByReportId: r.supersededByReportId,
      testBreakdown: r.testBreakdown as Record<string, TestBreakdownEntry> | null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  private mapItem(r: typeof monthlyTestReportItems.$inferSelect): MonthlyTestReportItemRow {
    return {
      id: r.id,
      monthlyTestReportId: r.monthlyTestReportId,
      dailyTestId: r.dailyTestId,
      dailyTestEvaluationId: r.dailyTestEvaluationId,
      usedPercentage: r.usedPercentage !== null ? Number(r.usedPercentage) : null,
      weight: r.weight !== null ? Number(r.weight) : null,
    };
  }

  async findLiveReport(
    studentId: string,
    subjectId: string,
    academicSessionId: string,
    periodStart: string,
  ): Promise<MonthlyTestReportRow | null> {
    const [row] = await this.client
      .select()
      .from(monthlyTestReports)
      .where(
        and(
          eq(monthlyTestReports.studentId, studentId),
          eq(monthlyTestReports.subjectId, subjectId),
          eq(monthlyTestReports.academicSessionId, academicSessionId),
          eq(monthlyTestReports.periodStart, periodStart),
          isNull(monthlyTestReports.supersededByReportId),
        ),
      )
      .limit(1);

    return row ? this.mapReport(row) : null;
  }

  async getReportById(id: string): Promise<MonthlyTestReportRow | null> {
    const [row] = await this.client
      .select()
      .from(monthlyTestReports)
      .where(eq(monthlyTestReports.id, id))
      .limit(1);

    return row ? this.mapReport(row) : null;
  }

  async getReportWithItems(
    id: string,
  ): Promise<{ report: MonthlyTestReportRow; items: readonly MonthlyTestReportItemRow[] } | null> {
    const report = await this.getReportById(id);
    if (!report) return null;

    const itemRows = await this.client
      .select()
      .from(monthlyTestReportItems)
      .where(eq(monthlyTestReportItems.monthlyTestReportId, id));

    return {
      report,
      items: itemRows.map(this.mapItem),
    };
  }

  async listReports(query: QueryMonthlyReportsInput): Promise<readonly MonthlyTestReportRow[]> {
    const conditions = [eq(monthlyTestReports.institutionId, query.institutionId)];

    if (query.academicSessionId) {
      conditions.push(eq(monthlyTestReports.academicSessionId, query.academicSessionId));
    }
    if (query.studentId) {
      conditions.push(eq(monthlyTestReports.studentId, query.studentId));
    }
    if (query.subjectId) {
      conditions.push(eq(monthlyTestReports.subjectId, query.subjectId));
    }
    if (query.classId) {
      conditions.push(eq(monthlyTestReports.classId, query.classId));
    }
    if (query.sectionId) {
      conditions.push(eq(monthlyTestReports.sectionId, query.sectionId));
    }
    if (query.periodMonth) {
      conditions.push(gte(monthlyTestReports.periodStart, `${query.periodMonth}-01`));
      conditions.push(lte(monthlyTestReports.periodStart, `${query.periodMonth}-31`));
    }
    if (query.status) {
      conditions.push(eq(monthlyTestReports.status, query.status));
    }
    if (!query.includeSuperseded) {
      conditions.push(isNull(monthlyTestReports.supersededByReportId));
    }

    const rows = await this.client
      .select()
      .from(monthlyTestReports)
      .where(and(...conditions))
      .orderBy(desc(monthlyTestReports.periodStart), asc(monthlyTestReports.createdAt));

    return rows.map((r) => this.mapReport(r));
  }

  async findDailyTestEvaluations(params: {
    studentId: string;
    subjectId: string;
    academicSessionId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<readonly DailyTestEvaluationWithTest[]> {
    const rows = await this.client
      .select({
        dailyTestId: dailyTests.id,
        subjectId: dailyTests.subjectId,
        title: dailyTests.title,
        testDate: dailyTests.testDate,
        totalMarks: dailyTests.totalMarks,
        testStatus: dailyTests.status,
        dailyTestEvaluationId: dailyTestEvaluations.id,
        studentId: dailyTestEvaluations.studentId,
        evaluationStatus: dailyTestEvaluations.status,
        obtainedMarks: dailyTestEvaluations.obtainedMarks,
        percentage: dailyTestEvaluations.percentage,
      })
      .from(dailyTestEvaluations)
      .innerJoin(dailyTests, eq(dailyTestEvaluations.dailyTestId, dailyTests.id))
      .where(
        and(
          eq(dailyTestEvaluations.studentId, params.studentId),
          eq(dailyTests.subjectId, params.subjectId),
          eq(dailyTests.academicSessionId, params.academicSessionId),
          gte(dailyTests.testDate, params.periodStart),
          lte(dailyTests.testDate, params.periodEnd),
          inArray(dailyTests.status, ["published", "locked"]),
        ),
      )
      .orderBy(asc(dailyTests.testDate));

    return rows.map((r) => ({
      dailyTestId: r.dailyTestId,
      subjectId: r.subjectId,
      title: r.title,
      testDate: r.testDate,
      totalMarks: Number(r.totalMarks),
      testStatus: r.testStatus,
      dailyTestEvaluationId: r.dailyTestEvaluationId,
      studentId: r.studentId,
      evaluationStatus: r.evaluationStatus,
      obtainedMarks: r.obtainedMarks !== null ? Number(r.obtainedMarks) : null,
      percentage: r.percentage !== null ? Number(r.percentage) : null,
    }));
  }

  async findStudentsInScope(params: {
    institutionId: string;
    academicSessionId: string;
    classId: string;
    sectionId?: string | null | undefined;
  }): Promise<readonly { studentId: string; classId: string; sectionId: string | null }[]> {
    const conditions = [
      eq(students.institutionId, params.institutionId),
      eq(studentPlacements.academicSessionId, params.academicSessionId),
      eq(studentPlacements.classId, params.classId),
    ];

    if (params.sectionId) {
      conditions.push(eq(studentPlacements.sectionId, params.sectionId));
    }

    const rows = await this.client
      .select({
        studentId: studentPlacements.studentId,
        classId: studentPlacements.classId,
        sectionId: studentPlacements.sectionId,
      })
      .from(studentPlacements)
      .innerJoin(students, eq(studentPlacements.studentId, students.id))
      .where(and(...conditions));

    return rows;
  }

  async findSubjectsForClass(
    institutionId: string,
    classId: string,
  ): Promise<readonly { subjectId: string; subjectName: string; subjectCode: string }[]> {
    const rows = await this.client
      .select({
        subjectId: subjects.id,
        subjectName: subjects.name,
        subjectCode: subjects.code,
      })
      .from(classSubjects)
      .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .where(
        and(
          eq(classSubjects.institutionId, institutionId),
          eq(classSubjects.classId, classId),
        ),
      );

    return rows;
  }

  async createReportWithItems(params: CreateMonthlyReportParams): Promise<MonthlyTestReportRow> {
    return this.client.transaction(async (tx) => {
      const [reportRow] = await tx
        .insert(monthlyTestReports)
        .values({
          institutionId: params.institutionId,
          academicSessionId: params.academicSessionId,
          studentId: params.studentId,
          subjectId: params.subjectId,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          testsCounted: params.testsCounted,
          averagePercentage: params.averagePercentage.toFixed(2),
          classId: params.classId ?? null,
          sectionId: params.sectionId ?? null,
          status: params.status ?? "draft",
          publishedAt: params.publishedAt ?? null,
          testBreakdown: params.testBreakdown,
        })
        .returning();

      if (!reportRow) {
        throw new Error("Failed to insert monthly test report row.");
      }

      if (params.items.length > 0) {
        await tx.insert(monthlyTestReportItems).values(
          params.items.map((item) => ({
            monthlyTestReportId: reportRow.id,
            dailyTestId: item.dailyTestId,
            dailyTestEvaluationId: item.dailyTestEvaluationId,
            usedPercentage: item.usedPercentage.toFixed(2),
            weight: item.weight.toFixed(2),
          })),
        );
      }

      return this.mapReport(reportRow);
    });
  }

  async supersedeReport(oldReportId: string, newReportId: string): Promise<void> {
    await this.client
      .update(monthlyTestReports)
      .set({
        supersededByReportId: newReportId,
        updatedAt: new Date(),
      })
      .where(eq(monthlyTestReports.id, oldReportId));
  }

  async publishReports(reportIds: readonly string[], publishedAt: Date): Promise<number> {
    if (reportIds.length === 0) return 0;
    const updated = await this.client
      .update(monthlyTestReports)
      .set({
        status: "published",
        publishedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(monthlyTestReports.id, reportIds as string[]),
          eq(monthlyTestReports.status, "draft"),
        ),
      )
      .returning({ id: monthlyTestReports.id });

    return updated.length;
  }

  async lockReports(reportIds: readonly string[]): Promise<number> {
    if (reportIds.length === 0) return 0;
    const updated = await this.client
      .update(monthlyTestReports)
      .set({
        status: "locked",
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(monthlyTestReports.id, reportIds as string[]),
          ne(monthlyTestReports.status, "locked"),
        ),
      )
      .returning({ id: monthlyTestReports.id });

    return updated.length;
  }

  async markEmailSent(reportId: string, emailIdempotencyKey: string, emailSentAt: Date): Promise<void> {
    await this.client
      .update(monthlyTestReports)
      .set({
        emailSentAt,
        emailIdempotencyKey,
        updatedAt: new Date(),
      })
      .where(eq(monthlyTestReports.id, reportId));
  }

  async getStudentReportCard(
    studentId: string,
    periodStart: string,
    _periodEnd: string,
    canViewUnpublished = false,
  ): Promise<StudentMonthlyReportCard | null> {
    const [studentInfo] = await this.client
      .select({
        studentId: students.id,
        institutionId: students.institutionId,
        admissionNumber: students.admissionNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        rollNumber: students.rollNumber,
        classId: studentPlacements.classId,
        className: classes.name,
        sectionId: studentPlacements.sectionId,
        sectionName: sections.name,
        institutionName: institutions.name,
        academicSessionId: academicSessions.id,
        sessionName: academicSessions.name,
      })
      .from(students)
      .innerJoin(studentPlacements, eq(students.id, studentPlacements.studentId))
      .innerJoin(classes, eq(studentPlacements.classId, classes.id))
      .leftJoin(sections, eq(studentPlacements.sectionId, sections.id))
      .innerJoin(institutions, eq(students.institutionId, institutions.id))
      .innerJoin(academicSessions, eq(studentPlacements.academicSessionId, academicSessions.id))
      .where(and(eq(students.id, studentId), eq(studentPlacements.isCurrent, true)))
      .limit(1);

    if (!studentInfo) {
      return null;
    }

    const reportConditions = [
      eq(monthlyTestReports.studentId, studentId),
      eq(monthlyTestReports.periodStart, periodStart),
      isNull(monthlyTestReports.supersededByReportId),
    ];

    if (!canViewUnpublished) {
      reportConditions.push(inArray(monthlyTestReports.status, ["published", "locked"]));
    }

    const reportsWithSubjects = await this.client
      .select({
        reportId: monthlyTestReports.id,
        subjectId: monthlyTestReports.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        testsCounted: monthlyTestReports.testsCounted,
        averagePercentage: monthlyTestReports.averagePercentage,
        status: monthlyTestReports.status,
        publishedAt: monthlyTestReports.publishedAt,
        breakdown: monthlyTestReports.testBreakdown,
      })
      .from(monthlyTestReports)
      .innerJoin(subjects, eq(monthlyTestReports.subjectId, subjects.id))
      .where(and(...reportConditions))
      .orderBy(asc(subjects.name));

    const subjectsList: SubjectReportCardItem[] = reportsWithSubjects.map((r) => ({
      reportId: r.reportId,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      testsCounted: r.testsCounted,
      averagePercentage: r.averagePercentage !== null ? Number(r.averagePercentage) : null,
      status: r.status as MonthlyReportStatus,
      publishedAt: r.publishedAt,
      breakdown: r.breakdown as Record<string, TestBreakdownEntry> | null,
    }));

    const periodMonth = periodStart.slice(0, 7);

    return {
      institutionId: studentInfo.institutionId,
      institutionName: studentInfo.institutionName,
      academicSessionId: studentInfo.academicSessionId,
      sessionName: studentInfo.sessionName,
      studentId: studentInfo.studentId,
      studentName: `${studentInfo.firstName} ${studentInfo.lastName}`.trim(),
      admissionNumber: studentInfo.admissionNumber,
      rollNumber: studentInfo.rollNumber,
      className: studentInfo.className,
      sectionName: studentInfo.sectionName,
      periodMonth,
      periodStart,
      periodEnd: _periodEnd,
      subjects: subjectsList,
      overallPercentage: null,
      totalTestsSat: 0,
      generatedAt: new Date(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Conflict Detection & Friendly Error Mapping                                */
/* -------------------------------------------------------------------------- */

interface PgErrorLike {
  readonly code?: string | undefined;
  readonly message?: string | undefined;
  readonly constraint?: string | undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const pgErr = error as PgErrorLike;
  return pgErr.code === "23505";
}

export function uniqueConflictError(error: unknown): ConflictError | null {
  if (!isUniqueViolation(error)) return null;
  const pgErr = error as PgErrorLike;
  const msg = pgErr.message ?? "";

  if (msg.includes("monthly_test_reports_unique")) {
    return new ConflictError(
      "A live monthly report already exists for this student, subject, and month.",
      {
        userMessage:
          "A monthly test report for this student and subject has already been generated. Recomputing will supersede the existing record.",
      },
    );
  }

  if (msg.includes("monthly_test_report_items_unique")) {
    return new ConflictError("Daily test is already included in this report.", {
      userMessage: "A daily test cannot be included more than once in the same monthly report.",
    });
  }

  if (msg.includes("monthly_test_report_items_eval_unique")) {
    return new ConflictError("Evaluation is already included in this report.", {
      userMessage: "A test evaluation cannot be added more than once to the same report.",
    });
  }

  return new ConflictError("The monthly report operation conflicts with existing records.", {
    userMessage: "The monthly report operation conflicts with existing records in the system.",
  });
}
