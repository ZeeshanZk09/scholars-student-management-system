/**
 * Drizzle implementation of DailyTestStore (`ARCHITECTURE.md` §23, `PRD.md` MODULE 21).
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import {
  dailyTestCorrections,
  dailyTestEvaluations,
  dailyTestPublications,
  dailyTests,
  studentPlacements,
  students,
} from "@/db/schema";
import { NotFoundError } from "@/shared/errors";
import {
  calculateGrade,
  isPassing,
  type DailyTestEvaluationStatus,
  type DailyTestPublicationStatus,
} from "../domain/daily-test-rules";
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
} from "../application/ports";
import type { CreateDailyTestInput } from "../application/schemas";

export class DrizzleDailyTestStore implements DailyTestStore {
  constructor(private readonly client: DbLike = db) {}

  private mapTest(r: typeof dailyTests.$inferSelect): DailyTestRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      academicSessionId: r.academicSessionId,
      subjectId: r.subjectId,
      title: r.title,
      testDate: r.testDate,
      totalMarks: Number(r.totalMarks),
      classId: r.classId,
      sectionId: r.sectionId,
      createdByTeacherUserId: r.createdByTeacherUserId,
      status: r.status as DailyTestPublicationStatus,
      publishedAt: r.publishedAt,
      lockedAt: r.lockedAt,
      paperStorageKey: r.paperStorageKey,
      instructions: r.instructions,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  private mapEvaluation(r: typeof dailyTestEvaluations.$inferSelect): DailyTestEvaluationRow {
    return {
      id: r.id,
      dailyTestId: r.dailyTestId,
      studentId: r.studentId,
      classId: r.classId,
      sectionId: r.sectionId,
      status: r.status as DailyTestEvaluationStatus,
      obtainedMarks: r.obtainedMarks !== null ? Number(r.obtainedMarks) : null,
      percentage: r.percentage !== null ? Number(r.percentage) : null,
      enteredByUserId: r.enteredByUserId,
      enteredAt: r.enteredAt,
      statusReason: r.statusReason,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  private mapCorrection(r: typeof dailyTestCorrections.$inferSelect): DailyTestCorrectionRow {
    return {
      id: r.id,
      dailyTestEvaluationId: r.dailyTestEvaluationId,
      previousMarks: r.previousMarks !== null ? Number(r.previousMarks) : null,
      correctedMarks: Number(r.correctedMarks),
      reason: r.reason,
      correctedByUserId: r.correctedByUserId,
      correctedAt: r.correctedAt,
    };
  }

  private mapPublication(r: typeof dailyTestPublications.$inferSelect): DailyTestPublicationRow {
    return {
      id: r.id,
      dailyTestId: r.dailyTestId,
      channel: r.channel as DailyTestPublicationChannel,
      publishedAt: r.publishedAt,
      publishedByUserId: r.publishedByUserId,
    };
  }

  async createDailyTest(
    data: CreateDailyTestInput,
    createdByTeacherUserId: string,
  ): Promise<DailyTestRow> {
    const [row] = await this.client
      .insert(dailyTests)
      .values({
        institutionId: data.institutionId,
        academicSessionId: data.academicSessionId,
        subjectId: data.subjectId,
        title: data.title,
        testDate: data.testDate,
        totalMarks: String(data.totalMarks),
        classId: data.classId ?? null,
        sectionId: data.sectionId ?? null,
        createdByTeacherUserId,
        status: "draft",
        instructions: data.instructions ?? null,
        paperStorageKey: data.paperStorageKey ?? null,
      })
      .returning();

    if (!row) throw new Error("Failed to insert daily test.");
    return this.mapTest(row);
  }

  async getDailyTest(id: string): Promise<DailyTestRow | null> {
    const [row] = await this.client
      .select()
      .from(dailyTests)
      .where(eq(dailyTests.id, id))
      .limit(1);

    return row ? this.mapTest(row) : null;
  }

  async listDailyTests(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly subjectId?: string | undefined;
    readonly teacherUserId?: string | undefined;
    readonly status?: DailyTestPublicationStatus | undefined;
    readonly testDate?: string | undefined;
  }): Promise<readonly DailyTestRow[]> {
    const conditions = [eq(dailyTests.institutionId, filters.institutionId)];

    if (filters.academicSessionId) {
      conditions.push(eq(dailyTests.academicSessionId, filters.academicSessionId));
    }
    if (filters.classId) {
      conditions.push(eq(dailyTests.classId, filters.classId));
    }
    if (filters.sectionId) {
      conditions.push(eq(dailyTests.sectionId, filters.sectionId));
    }
    if (filters.subjectId) {
      conditions.push(eq(dailyTests.subjectId, filters.subjectId));
    }
    if (filters.teacherUserId) {
      conditions.push(eq(dailyTests.createdByTeacherUserId, filters.teacherUserId));
    }
    if (filters.status) {
      conditions.push(eq(dailyTests.status, filters.status));
    }
    if (filters.testDate) {
      conditions.push(eq(dailyTests.testDate, filters.testDate));
    }

    const rows = await this.client
      .select()
      .from(dailyTests)
      .where(and(...conditions))
      .orderBy(desc(dailyTests.testDate), desc(dailyTests.createdAt));

    return rows.map((r) => this.mapTest(r));
  }

  async updateDailyTestStatus(
    id: string,
    status: DailyTestPublicationStatus,
    timestamp: Date,
  ): Promise<DailyTestRow> {
    const values: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (status === "published") {
      values.publishedAt = timestamp;
    } else if (status === "locked") {
      values.lockedAt = timestamp;
    }

    const [updated] = await this.client
      .update(dailyTests)
      .set(values)
      .where(eq(dailyTests.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError("Daily test not found.");
    }

    return this.mapTest(updated);
  }

  async batchEnterEvaluations(
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
  ): Promise<{ readonly savedCount: number; readonly updatedCount: number }> {
    const test = await this.getDailyTest(dailyTestId);
    if (!test) throw new NotFoundError("Daily test not found.");

    let saved = 0;
    let updated = 0;

    for (const e of evaluations) {
      const existing = await this.getEvaluationByStudent(dailyTestId, e.studentId);

      if (existing) {
        await this.client
          .update(dailyTestEvaluations)
          .set({
            status: e.status,
            obtainedMarks: e.obtainedMarks !== null ? String(e.obtainedMarks) : null,
            percentage: e.percentage !== null ? String(e.percentage) : null,
            statusReason: e.statusReason ?? null,
            notes: e.notes ?? null,
            enteredByUserId,
            enteredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dailyTestEvaluations.id, existing.id));

        updated++;
      } else {
        await this.client.insert(dailyTestEvaluations).values({
          dailyTestId,
          studentId: e.studentId,
          classId: test.classId,
          sectionId: test.sectionId,
          status: e.status,
          obtainedMarks: e.obtainedMarks !== null ? String(e.obtainedMarks) : null,
          percentage: e.percentage !== null ? String(e.percentage) : null,
          statusReason: e.statusReason ?? null,
          notes: e.notes ?? null,
          enteredByUserId,
          enteredAt: new Date(),
        });

        saved++;
      }
    }

    return { savedCount: saved, updatedCount: updated };
  }

  async getEvaluation(id: string): Promise<DailyTestEvaluationRow | null> {
    const [row] = await this.client
      .select()
      .from(dailyTestEvaluations)
      .where(eq(dailyTestEvaluations.id, id))
      .limit(1);

    return row ? this.mapEvaluation(row) : null;
  }

  async getEvaluationByStudent(
    dailyTestId: string,
    studentId: string,
  ): Promise<DailyTestEvaluationRow | null> {
    const [row] = await this.client
      .select()
      .from(dailyTestEvaluations)
      .where(
        and(
          eq(dailyTestEvaluations.dailyTestId, dailyTestId),
          eq(dailyTestEvaluations.studentId, studentId),
        ),
      )
      .limit(1);

    return row ? this.mapEvaluation(row) : null;
  }

  async getEvaluationsForTest(dailyTestId: string): Promise<readonly DailyTestEvaluationRow[]> {
    const rows = await this.client
      .select()
      .from(dailyTestEvaluations)
      .where(eq(dailyTestEvaluations.dailyTestId, dailyTestId));

    return rows.map((r) => this.mapEvaluation(r));
  }

  async recordCorrection(params: {
    readonly evaluationId: string;
    readonly previousMarks: number | null;
    readonly correctedMarks: number;
    readonly reason: string;
    readonly correctedByUserId: string;
    readonly newPercentage: number;
  }): Promise<DailyTestCorrectionRow> {
    const [correction] = await this.client
      .insert(dailyTestCorrections)
      .values({
        dailyTestEvaluationId: params.evaluationId,
        previousMarks: params.previousMarks !== null ? String(params.previousMarks) : null,
        correctedMarks: String(params.correctedMarks),
        reason: params.reason,
        correctedByUserId: params.correctedByUserId,
        correctedAt: new Date(),
      })
      .returning();

    if (!correction) throw new Error("Failed to insert correction record.");

    await this.client
      .update(dailyTestEvaluations)
      .set({
        obtainedMarks: String(params.correctedMarks),
        percentage: String(params.newPercentage),
        status: "present",
        updatedAt: new Date(),
      })
      .where(eq(dailyTestEvaluations.id, params.evaluationId));

    return this.mapCorrection(correction);
  }

  async recordPublication(
    dailyTestId: string,
    channel: DailyTestPublicationChannel,
    publishedByUserId: string | null,
  ): Promise<DailyTestPublicationRow> {
    const [existing] = await this.client
      .select()
      .from(dailyTestPublications)
      .where(
        and(
          eq(dailyTestPublications.dailyTestId, dailyTestId),
          eq(dailyTestPublications.channel, channel),
        ),
      )
      .limit(1);

    if (existing) {
      return this.mapPublication(existing);
    }

    const [inserted] = await this.client
      .insert(dailyTestPublications)
      .values({
        dailyTestId,
        channel,
        publishedByUserId,
        publishedAt: new Date(),
      })
      .returning();

    if (!inserted) throw new Error("Failed to record publication.");
    return this.mapPublication(inserted);
  }

  async getDailyTestSheet(dailyTestId: string): Promise<DailyTestSheetView | null> {
    const test = await this.getDailyTest(dailyTestId);
    if (!test) return null;

    const evalRows = await this.client
      .select()
      .from(dailyTestEvaluations)
      .where(eq(dailyTestEvaluations.dailyTestId, dailyTestId));

    if (evalRows.length === 0) {
      return {
        test,
        evaluations: [],
      };
    }

    const studentIds = evalRows.map((e) => e.studentId);
    const studentRows = await this.client
      .select({
        id: students.id,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        rollNumber: students.rollNumber,
      })
      .from(students)
      .where(inArray(students.id, studentIds));

    const studentMap = new Map<string, StudentRosterItem>();
    for (const s of studentRows) {
      const fullName = [s.firstName, s.middleName, s.lastName]
        .filter((part): part is string => Boolean(part && part.trim().length > 0))
        .join(" ");

      studentMap.set(s.id, {
        id: s.id,
        name: fullName || "Student",
        rollNumber: s.rollNumber,
      });
    }

    const evaluations = evalRows.map((e) => {
      const evaluation = this.mapEvaluation(e);
      const student = studentMap.get(e.studentId) ?? {
        id: e.studentId,
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
      evaluations,
    };
  }

  async getStudentDailyTests(
    studentId: string,
    options?: {
      readonly subjectId?: string | undefined;
      readonly academicSessionId?: string | undefined;
    },
  ): Promise<readonly StudentTestViewItem[]> {
    const conditions = [eq(dailyTestEvaluations.studentId, studentId)];

    if (options?.subjectId) {
      conditions.push(eq(dailyTests.subjectId, options.subjectId));
    }
    if (options?.academicSessionId) {
      conditions.push(eq(dailyTests.academicSessionId, options.academicSessionId));
    }

    const rows = await this.client
      .select({
        test: dailyTests,
        evaluation: dailyTestEvaluations,
      })
      .from(dailyTestEvaluations)
      .innerJoin(dailyTests, eq(dailyTestEvaluations.dailyTestId, dailyTests.id))
      .where(and(...conditions))
      .orderBy(desc(dailyTests.testDate));

    return rows.map(({ test, evaluation }) => {
      const mappedTest = this.mapTest(test);
      const mappedEval = this.mapEvaluation(evaluation);
      const pct = mappedEval.percentage;

      return {
        test: mappedTest,
        evaluation: mappedEval,
        grade: pct !== null ? calculateGrade(pct) : null,
        isPassing:
          mappedEval.obtainedMarks !== null
            ? isPassing(mappedEval.obtainedMarks, mappedTest.totalMarks)
            : false,
      };
    });
  }

  async getRosterForScope(
    institutionId: string,
    academicSessionId: string,
    classId?: string | null | undefined,
    sectionId?: string | null | undefined,
  ): Promise<readonly StudentRosterItem[]> {
    const conditions = [
      eq(studentPlacements.academicSessionId, academicSessionId),
      eq(studentPlacements.isCurrent, true),
      eq(students.institutionId, institutionId),
    ];

    if (sectionId) {
      conditions.push(eq(studentPlacements.sectionId, sectionId));
    } else if (classId) {
      conditions.push(eq(studentPlacements.classId, classId));
    }

    const rows = await this.client
      .select({
        id: students.id,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        rollNumber: students.rollNumber,
      })
      .from(studentPlacements)
      .innerJoin(students, eq(studentPlacements.studentId, students.id))
      .where(and(...conditions));

    return rows.map((s) => ({
      id: s.id,
      name:
        [s.firstName, s.middleName, s.lastName]
          .filter((p): p is string => Boolean(p && p.trim().length > 0))
          .join(" ") || "Student",
      rollNumber: s.rollNumber,
    }));
  }
}
