/**
 * In-memory test fake for DailyTestStore (`ARCHITECTURE.md` §23).
 */
import { randomUUID } from "node:crypto";

import {
  calculateGrade,
  isPassing,
} from "../../domain/daily-test-rules";
import type {
  DailyTestCorrectionRow,
  DailyTestEvaluationRow,
  DailyTestPublicationChannel,
  DailyTestPublicationRow,
  DailyTestRow,
  DailyTestSheetView,
  DailyTestStore,
  StudentRosterItem,
  StudentTestViewItem,
} from "../ports";
import type { CreateDailyTestInput } from "../schemas";

export class FakeDailyTestStore implements DailyTestStore {
  readonly tests = new Map<string, DailyTestRow>();
  readonly evaluations = new Map<string, DailyTestEvaluationRow>();
  readonly corrections: DailyTestCorrectionRow[] = [];
  readonly publications: DailyTestPublicationRow[] = [];
  readonly students = new Map<string, StudentRosterItem>();

  async createDailyTest(
    data: CreateDailyTestInput,
    createdByTeacherUserId: string,
  ): Promise<DailyTestRow> {
    const id = randomUUID();
    const row: DailyTestRow = {
      id,
      institutionId: data.institutionId,
      academicSessionId: data.academicSessionId,
      subjectId: data.subjectId,
      title: data.title,
      testDate: data.testDate,
      totalMarks: data.totalMarks,
      classId: data.classId ?? null,
      sectionId: data.sectionId ?? null,
      createdByTeacherUserId,
      status: "draft",
      publishedAt: null,
      lockedAt: null,
      paperStorageKey: data.paperStorageKey ?? null,
      instructions: data.instructions ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    this.tests.set(id, row);
    return row;
  }

  async getDailyTest(id: string): Promise<DailyTestRow | null> {
    return this.tests.get(id) ?? null;
  }

  async listDailyTests(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly subjectId?: string | undefined;
    readonly teacherUserId?: string | undefined;
    readonly status?: "draft" | "published" | "locked" | undefined;
    readonly testDate?: string | undefined;
  }): Promise<readonly DailyTestRow[]> {
    return Array.from(this.tests.values()).filter((t) => {
      if (t.institutionId !== filters.institutionId) return false;
      if (filters.academicSessionId && t.academicSessionId !== filters.academicSessionId) return false;
      if (filters.classId && t.classId !== filters.classId) return false;
      if (filters.sectionId && t.sectionId !== filters.sectionId) return false;
      if (filters.subjectId && t.subjectId !== filters.subjectId) return false;
      if (filters.teacherUserId && t.createdByTeacherUserId !== filters.teacherUserId) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.testDate && t.testDate !== filters.testDate) return false;
      return true;
    });
  }

  async updateDailyTestStatus(
    id: string,
    status: "draft" | "published" | "locked",
    timestamp: Date,
  ): Promise<DailyTestRow> {
    const existing = this.tests.get(id);
    if (!existing) throw new Error("Daily test not found.");
    const updated: DailyTestRow = {
      ...existing,
      status,
      publishedAt: status === "published" ? timestamp : existing.publishedAt,
      lockedAt: status === "locked" ? timestamp : existing.lockedAt,
      updatedAt: new Date(),
      version: existing.version + 1,
    };
    this.tests.set(id, updated);
    return updated;
  }

  async batchEnterEvaluations(
    dailyTestId: string,
    evaluations: readonly {
      readonly studentId: string;
      readonly status: DailyTestEvaluationRow["status"];
      readonly obtainedMarks: number | null;
      readonly percentage: number | null;
      readonly statusReason?: string | null | undefined;
      readonly notes?: string | null | undefined;
    }[],
    enteredByUserId: string,
  ): Promise<{ readonly savedCount: number; readonly updatedCount: number }> {
    const test = this.tests.get(dailyTestId);
    if (!test) throw new Error("Daily test not found.");

    let saved = 0;
    let updated = 0;

    for (const e of evaluations) {
      const existing = Array.from(this.evaluations.values()).find(
        (ev) => ev.dailyTestId === dailyTestId && ev.studentId === e.studentId,
      );

      if (existing) {
        const up: DailyTestEvaluationRow = {
          ...existing,
          status: e.status,
          obtainedMarks: e.obtainedMarks,
          percentage: e.percentage,
          enteredByUserId,
          enteredAt: new Date(),
          statusReason: e.statusReason ?? null,
          notes: e.notes ?? null,
          updatedAt: new Date(),
          version: existing.version + 1,
        };
        this.evaluations.set(existing.id, up);
        updated++;
      } else {
        const id = randomUUID();
        const row: DailyTestEvaluationRow = {
          id,
          dailyTestId,
          studentId: e.studentId,
          classId: test.classId,
          sectionId: test.sectionId,
          status: e.status,
          obtainedMarks: e.obtainedMarks,
          percentage: e.percentage,
          enteredByUserId,
          enteredAt: new Date(),
          statusReason: e.statusReason ?? null,
          notes: e.notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        };
        this.evaluations.set(id, row);
        saved++;
      }
    }

    return { savedCount: saved, updatedCount: updated };
  }

  async getEvaluation(id: string): Promise<DailyTestEvaluationRow | null> {
    return this.evaluations.get(id) ?? null;
  }

  async getEvaluationByStudent(
    dailyTestId: string,
    studentId: string,
  ): Promise<DailyTestEvaluationRow | null> {
    for (const ev of this.evaluations.values()) {
      if (ev.dailyTestId === dailyTestId && ev.studentId === studentId) {
        return ev;
      }
    }
    return null;
  }

  async getEvaluationsForTest(dailyTestId: string): Promise<readonly DailyTestEvaluationRow[]> {
    return Array.from(this.evaluations.values()).filter((e) => e.dailyTestId === dailyTestId);
  }

  async recordCorrection(params: {
    readonly evaluationId: string;
    readonly previousMarks: number | null;
    readonly correctedMarks: number;
    readonly reason: string;
    readonly correctedByUserId: string;
    readonly newPercentage: number;
  }): Promise<DailyTestCorrectionRow> {
    const ev = this.evaluations.get(params.evaluationId);
    if (!ev) throw new Error("Evaluation record not found.");

    const id = randomUUID();
    const correction: DailyTestCorrectionRow = {
      id,
      dailyTestEvaluationId: params.evaluationId,
      previousMarks: params.previousMarks,
      correctedMarks: params.correctedMarks,
      reason: params.reason,
      correctedByUserId: params.correctedByUserId,
      correctedAt: new Date(),
    };
    this.corrections.push(correction);

    const updated: DailyTestEvaluationRow = {
      ...ev,
      obtainedMarks: params.correctedMarks,
      percentage: params.newPercentage,
      status: "present",
      updatedAt: new Date(),
      version: ev.version + 1,
    };
    this.evaluations.set(params.evaluationId, updated);

    return correction;
  }

  async recordPublication(
    dailyTestId: string,
    channel: DailyTestPublicationChannel,
    publishedByUserId: string | null,
  ): Promise<DailyTestPublicationRow> {
    const existing = this.publications.find(
      (p) => p.dailyTestId === dailyTestId && p.channel === channel,
    );
    if (existing) return existing;

    const row: DailyTestPublicationRow = {
      id: randomUUID(),
      dailyTestId,
      channel,
      publishedAt: new Date(),
      publishedByUserId,
    };
    this.publications.push(row);
    return row;
  }

  async getDailyTestSheet(dailyTestId: string): Promise<DailyTestSheetView | null> {
    const test = this.tests.get(dailyTestId);
    if (!test) return null;

    const evals = Array.from(this.evaluations.values()).filter(
      (e) => e.dailyTestId === dailyTestId,
    );

    const evaluationViews = evals.map((evaluation) => {
      const student = this.students.get(evaluation.studentId) ?? {
        id: evaluation.studentId,
        name: "Student",
        rollNumber: null,
      };

      const pct = evaluation.percentage;
      const grade = pct !== null ? calculateGrade(pct) : null;
      const passing =
        evaluation.obtainedMarks !== null
          ? isPassing(evaluation.obtainedMarks, test.totalMarks)
          : false;

      return {
        evaluation,
        student,
        grade,
        isPassing: passing,
      };
    });

    return {
      test,
      evaluations: evaluationViews,
    };
  }

  async getStudentDailyTests(
    studentId: string,
    options?: {
      readonly subjectId?: string | undefined;
      readonly academicSessionId?: string | undefined;
    },
  ): Promise<readonly StudentTestViewItem[]> {
    const results: StudentTestViewItem[] = [];

    for (const evaluation of this.evaluations.values()) {
      if (evaluation.studentId !== studentId) continue;
      const test = this.tests.get(evaluation.dailyTestId);
      if (!test) continue;
      if (options?.subjectId && test.subjectId !== options.subjectId) continue;
      if (options?.academicSessionId && test.academicSessionId !== options.academicSessionId)
        continue;

      const pct = evaluation.percentage;
      results.push({
        test,
        evaluation,
        grade: pct !== null ? calculateGrade(pct) : null,
        isPassing:
          evaluation.obtainedMarks !== null
            ? isPassing(evaluation.obtainedMarks, test.totalMarks)
            : false,
      });
    }

    return results;
  }

  async getRosterForScope(
    _institutionId: string,
    _academicSessionId: string,
    _classId?: string | null | undefined,
    _sectionId?: string | null | undefined,
  ): Promise<readonly StudentRosterItem[]> {
    void _institutionId;
    void _academicSessionId;
    void _classId;
    void _sectionId;
    return Array.from(this.students.values());
  }

  seedStudent(student: StudentRosterItem): void {
    this.students.set(student.id, student);
  }
}
