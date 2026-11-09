/**
 * In-memory test fake for MonthlyReportStore.
 */
import { randomUUID } from "node:crypto";

import type {
  CreateMonthlyReportParams,
  DailyTestEvaluationWithTest,
  MonthlyReportStore,
  MonthlyTestReportItemRow,
  MonthlyTestReportRow,
  StudentMonthlyReportCard,
  SubjectReportCardItem,
} from "../ports";
import type { QueryMonthlyReportsInput } from "../schemas";

export interface FakeStudent {
  readonly id: string;
  readonly institutionId: string;
  readonly admissionNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly rollNumber: string | null;
  readonly classId: string;
  readonly className: string;
  readonly sectionId: string | null;
  readonly sectionName: string | null;
}

export interface FakeSubject {
  readonly id: string;
  readonly institutionId: string;
  readonly name: string;
  readonly code: string;
}

export class FakeMonthlyReportStore implements MonthlyReportStore {
  readonly reports = new Map<string, MonthlyTestReportRow>();
  readonly items: MonthlyTestReportItemRow[] = [];
  readonly evaluations: DailyTestEvaluationWithTest[] = [];
  readonly students = new Map<string, FakeStudent>();
  readonly subjects = new Map<string, FakeSubject>();
  readonly institutionName = "Scholars Academy";
  readonly sessionName = "2026-2027 Academic Session";

  async findLiveReport(
    studentId: string,
    subjectId: string,
    academicSessionId: string,
    periodStart: string,
  ): Promise<MonthlyTestReportRow | null> {
    for (const r of this.reports.values()) {
      if (
        r.studentId === studentId &&
        r.subjectId === subjectId &&
        r.academicSessionId === academicSessionId &&
        r.periodStart === periodStart &&
        r.supersededByReportId === null
      ) {
        return r;
      }
    }
    return null;
  }

  async getReportById(id: string): Promise<MonthlyTestReportRow | null> {
    return this.reports.get(id) ?? null;
  }

  async getReportWithItems(
    id: string,
  ): Promise<{ report: MonthlyTestReportRow; items: readonly MonthlyTestReportItemRow[] } | null> {
    const report = this.reports.get(id);
    if (!report) return null;
    const reportItems = this.items.filter((item) => item.monthlyTestReportId === id);
    return { report, items: reportItems };
  }

  async listReports(query: QueryMonthlyReportsInput): Promise<readonly MonthlyTestReportRow[]> {
    return Array.from(this.reports.values()).filter((r) => {
      if (r.institutionId !== query.institutionId) return false;
      if (query.academicSessionId && r.academicSessionId !== query.academicSessionId) return false;
      if (query.studentId && r.studentId !== query.studentId) return false;
      if (query.subjectId && r.subjectId !== query.subjectId) return false;
      if (query.classId && r.classId !== query.classId) return false;
      if (query.sectionId && r.sectionId !== query.sectionId) return false;
      if (query.periodMonth && !r.periodStart.startsWith(query.periodMonth)) return false;
      if (query.status && r.status !== query.status) return false;
      if (!query.includeSuperseded && r.supersededByReportId !== null) return false;
      return true;
    });
  }

  async findDailyTestEvaluations(params: {
    studentId: string;
    subjectId: string;
    academicSessionId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<readonly DailyTestEvaluationWithTest[]> {
    return this.evaluations.filter(
      (ev) =>
        ev.studentId === params.studentId &&
        ev.subjectId === params.subjectId &&
        ev.testDate >= params.periodStart &&
        ev.testDate <= params.periodEnd &&
        (ev.testStatus === "published" || ev.testStatus === "locked"),
    );
  }

  async findStudentsInScope(params: {
    institutionId: string;
    academicSessionId: string;
    classId: string;
    sectionId?: string | null | undefined;
  }): Promise<readonly { studentId: string; classId: string; sectionId: string | null }[]> {
    const results: { studentId: string; classId: string; sectionId: string | null }[] = [];
    for (const s of this.students.values()) {
      if (s.institutionId === params.institutionId && s.classId === params.classId) {
        if (params.sectionId && s.sectionId !== params.sectionId) {
          continue;
        }
        results.push({
          studentId: s.id,
          classId: s.classId,
          sectionId: s.sectionId,
        });
      }
    }
    return results;
  }

  async findSubjectsForClass(
    institutionId: string,
    _classId: string,
  ): Promise<readonly { subjectId: string; subjectName: string; subjectCode: string }[]> {
    void _classId;
    const results: { subjectId: string; subjectName: string; subjectCode: string }[] = [];
    for (const sub of this.subjects.values()) {
      if (sub.institutionId === institutionId) {
        results.push({
          subjectId: sub.id,
          subjectName: sub.name,
          subjectCode: sub.code,
        });
      }
    }
    return results;
  }

  async createReportWithItems(params: CreateMonthlyReportParams): Promise<MonthlyTestReportRow> {
    const id = randomUUID();
    const row: MonthlyTestReportRow = {
      id,
      institutionId: params.institutionId,
      academicSessionId: params.academicSessionId,
      studentId: params.studentId,
      subjectId: params.subjectId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      testsCounted: params.testsCounted,
      averagePercentage: params.averagePercentage,
      classId: params.classId ?? null,
      sectionId: params.sectionId ?? null,
      status: params.status ?? "draft",
      publishedAt: params.publishedAt ?? null,
      emailSentAt: null,
      emailIdempotencyKey: null,
      supersededByReportId: null,
      testBreakdown: params.testBreakdown,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    this.reports.set(id, row);

    for (const item of params.items) {
      this.items.push({
        id: randomUUID(),
        monthlyTestReportId: id,
        dailyTestId: item.dailyTestId,
        dailyTestEvaluationId: item.dailyTestEvaluationId,
        usedPercentage: item.usedPercentage,
        weight: item.weight,
      });
    }

    return row;
  }

  async supersedeReport(oldReportId: string, newReportId: string): Promise<void> {
    const old = this.reports.get(oldReportId);
    if (!old) return;
    this.reports.set(oldReportId, {
      ...old,
      supersededByReportId: newReportId,
      updatedAt: new Date(),
      version: old.version + 1,
    });
  }

  async publishReports(reportIds: readonly string[], publishedAt: Date): Promise<number> {
    let count = 0;
    for (const id of reportIds) {
      const rep = this.reports.get(id);
      if (rep && rep.status === "draft") {
        this.reports.set(id, {
          ...rep,
          status: "published",
          publishedAt,
          updatedAt: new Date(),
          version: rep.version + 1,
        });
        count += 1;
      }
    }
    return count;
  }

  async lockReports(reportIds: readonly string[]): Promise<number> {
    let count = 0;
    for (const id of reportIds) {
      const rep = this.reports.get(id);
      if (rep && rep.status !== "locked") {
        this.reports.set(id, {
          ...rep,
          status: "locked",
          updatedAt: new Date(),
          version: rep.version + 1,
        });
        count += 1;
      }
    }
    return count;
  }

  async markEmailSent(reportId: string, emailIdempotencyKey: string, emailSentAt: Date): Promise<void> {
    const rep = this.reports.get(reportId);
    if (rep) {
      this.reports.set(reportId, {
        ...rep,
        emailSentAt,
        emailIdempotencyKey,
        updatedAt: new Date(),
        version: rep.version + 1,
      });
    }
  }

  async getStudentReportCard(
    studentId: string,
    periodStart: string,
    periodEnd: string,
    canViewUnpublished?: boolean,
  ): Promise<StudentMonthlyReportCard | null> {
    const student = this.students.get(studentId);
    if (!student) return null;

    const subjectsList: SubjectReportCardItem[] = [];

    for (const rep of this.reports.values()) {
      if (
        rep.studentId === studentId &&
        rep.periodStart === periodStart &&
        rep.supersededByReportId === null
      ) {
        if (!canViewUnpublished && rep.status === "draft") {
          continue;
        }

        const sub = this.subjects.get(rep.subjectId);
        subjectsList.push({
          reportId: rep.id,
          subjectId: rep.subjectId,
          subjectName: sub?.name ?? "Subject",
          subjectCode: sub?.code ?? "SUB",
          testsCounted: rep.testsCounted,
          averagePercentage: rep.averagePercentage,
          status: rep.status,
          publishedAt: rep.publishedAt,
          breakdown: rep.testBreakdown,
        });
      }
    }

    const periodMonth = periodStart.slice(0, 7);

    return {
      institutionId: student.institutionId,
      institutionName: this.institutionName,
      academicSessionId: randomUUID(),
      sessionName: this.sessionName,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
      className: student.className,
      sectionName: student.sectionName,
      periodMonth,
      periodStart,
      periodEnd,
      subjects: subjectsList,
      overallPercentage: null,
      totalTestsSat: 0,
      generatedAt: new Date(),
    };
  }
}
