/**
 * Drizzle implementation of ExaminationStore (`ARCHITECTURE.md` §15/§23).
 * Atomic bulk mark entries and denormalized historical provenance.
 */
import { and, asc, eq } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import {
  examinationMarks,
  examinationRegistrations,
  examinations,
  examMarksCorrections,
  gradingBands,
  gradingSchemes,
  resultPublicationLog,
  studentPlacements,
  studentResults,
  students,
} from "@/db/schema";
import { NotFoundError } from "@/shared/errors";
import type {
  ExamMarkStatus,
  PublicationStatus,
  ResultStatus,
} from "../domain/exam-rules";
import type {
  ExaminationMarkRow,
  ExaminationRegistrationRow,
  ExaminationRow,
  ExaminationSheetView,
  ExaminationStore,
  ExamMarksCorrectionRow,
  GradingBandRow,
  GradingSchemeRow,
  ResultPublicationLogRow,
  StudentResultRow,
  StudentRosterItem,
} from "../application/ports";
import type { CreateExaminationInput } from "../application/schemas";

export class DrizzleExaminationStore implements ExaminationStore {
  constructor(private readonly client: DbLike = db) {}

  private mapExamination(r: typeof examinations.$inferSelect): ExaminationRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      academicSessionId: r.academicSessionId,
      subjectId: r.subjectId,
      title: r.title,
      examinationType: r.examinationType as ExaminationRow["examinationType"],
      classId: r.classId,
      sectionId: r.sectionId,
      totalMarks: Number(r.totalMarks),
      passMarks: r.passMarks ? Number(r.passMarks) : null,
      timeSlotId: r.timeSlotId,
      examDate: r.examDate,
      status: r.status as PublicationStatus,
      publishedAt: r.publishedAt,
      lockedAt: r.lockedAt,
      setByTeacherUserId: r.setByTeacherUserId,
      questionPaperStorageKey: r.questionPaperStorageKey,
      submissionDeadline: r.submissionDeadline,
      description: r.description,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  private mapMark(r: typeof examinationMarks.$inferSelect): ExaminationMarkRow {
    return {
      id: r.id,
      examinationId: r.examinationId,
      studentId: r.studentId,
      academicSessionId: r.academicSessionId,
      subjectId: r.subjectId,
      classId: r.classId,
      sectionId: r.sectionId,
      status: r.status as ExamMarkStatus,
      obtainedMarks: r.obtainedMarks !== null ? Number(r.obtainedMarks) : null,
      totalMarks: Number(r.totalMarks),
      enteredByUserId: r.enteredByUserId,
      enteredAt: r.enteredAt,
      scriptStorageKey: r.scriptStorageKey,
      statusReason: r.statusReason,
      notes: r.notes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  async createExamination(data: CreateExaminationInput, setByTeacherUserId?: string | null): Promise<ExaminationRow> {
    const [row] = await this.client
      .insert(examinations)
      .values({
        institutionId: data.institutionId,
        academicSessionId: data.academicSessionId,
        subjectId: data.subjectId,
        title: data.title,
        examinationType: data.examinationType,
        classId: data.classId ?? null,
        sectionId: data.sectionId ?? null,
        totalMarks: String(data.totalMarks),
        passMarks: data.passMarks !== null && data.passMarks !== undefined ? String(data.passMarks) : null,
        timeSlotId: data.timeSlotId ?? null,
        examDate: data.examDate,
        status: "draft",
        setByTeacherUserId: setByTeacherUserId ?? null,
        submissionDeadline: data.submissionDeadline ? new Date(data.submissionDeadline) : null,
        description: data.description ?? null,
      })
      .returning();

    if (!row) throw new Error("Failed to insert examination.");
    return this.mapExamination(row);
  }

  async getExamination(id: string): Promise<ExaminationRow | null> {
    const [row] = await this.client
      .select()
      .from(examinations)
      .where(eq(examinations.id, id))
      .limit(1);
    return row ? this.mapExamination(row) : null;
  }

  async listExaminations(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly subjectId?: string | undefined;
    readonly status?: PublicationStatus | undefined;
  }): Promise<readonly ExaminationRow[]> {
    const conditions = [];
    if (filters.institutionId) conditions.push(eq(examinations.institutionId, filters.institutionId));
    if (filters.academicSessionId) conditions.push(eq(examinations.academicSessionId, filters.academicSessionId));
    if (filters.classId) conditions.push(eq(examinations.classId, filters.classId));
    if (filters.sectionId) conditions.push(eq(examinations.sectionId, filters.sectionId));
    if (filters.subjectId) conditions.push(eq(examinations.subjectId, filters.subjectId));
    if (filters.status) conditions.push(eq(examinations.status, filters.status));

    const rows = await this.client
      .select()
      .from(examinations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(examinations.examDate);

    return rows.map((r) => this.mapExamination(r));
  }

  async updateExaminationStatus(
    id: string,
    status: PublicationStatus,
  ): Promise<ExaminationRow> {
    const updatePayload: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (status === "published") updatePayload.publishedAt = new Date();
    if (status === "locked") updatePayload.lockedAt = new Date();

    const [row] = await this.client
      .update(examinations)
      .set(updatePayload)
      .where(eq(examinations.id, id))
      .returning();

    if (!row) throw new NotFoundError(`Examination ${id} not found.`);
    return this.mapExamination(row);
  }

  async registerStudents(examinationId: string, studentIds: readonly string[]): Promise<number> {
    if (studentIds.length === 0) return 0;

    const values = studentIds.map((studentId) => ({
      examinationId,
      studentId,
      status: "registered" as const,
    }));

    const inserted = await this.client
      .insert(examinationRegistrations)
      .values(values)
      .onConflictDoNothing()
      .returning();

    return inserted.length;
  }

  async listRegistrations(examinationId: string): Promise<readonly ExaminationRegistrationRow[]> {
    const rows = await this.client
      .select()
      .from(examinationRegistrations)
      .where(eq(examinationRegistrations.examinationId, examinationId));

    return rows.map((r) => ({
      id: r.id,
      examinationId: r.examinationId,
      studentId: r.studentId,
      status: r.status as ExaminationRegistrationRow["status"],
      seatNumber: r.seatNumber,
      registeredAt: r.registeredAt,
      withdrawnByUserId: r.withdrawnByUserId,
      withdrawalReason: r.withdrawalReason,
    }));
  }

  async batchEnterMarks(
    examinationId: string,
    marks: readonly {
      readonly studentId: string;
      readonly status: ExamMarkStatus;
      readonly obtainedMarks: number | null;
      readonly statusReason?: string | null | undefined;
      readonly notes?: string | null | undefined;
    }[],
    enteredByUserId: string,
  ): Promise<{ readonly savedCount: number; readonly updatedCount: number }> {
    const exam = await this.getExamination(examinationId);
    if (!exam) throw new NotFoundError(`Examination ${examinationId} not found.`);

    let saved = 0;
    let updated = 0;

    for (const m of marks) {
      const existing = await this.getMarkByStudent(examinationId, m.studentId);
      if (existing) {
        await this.client
          .update(examinationMarks)
          .set({
            status: m.status,
            obtainedMarks: m.obtainedMarks !== null ? String(m.obtainedMarks) : null,
            statusReason: m.statusReason ?? null,
            notes: m.notes ?? null,
            enteredByUserId,
            enteredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(examinationMarks.id, existing.id));
        updated++;
      } else {
        await this.client
          .insert(examinationMarks)
          .values({
            examinationId,
            studentId: m.studentId,
            academicSessionId: exam.academicSessionId,
            subjectId: exam.subjectId,
            classId: exam.classId,
            sectionId: exam.sectionId,
            status: m.status,
            obtainedMarks: m.obtainedMarks !== null ? String(m.obtainedMarks) : null,
            totalMarks: String(exam.totalMarks),
            enteredByUserId,
            enteredAt: new Date(),
            statusReason: m.statusReason ?? null,
            notes: m.notes ?? null,
          });
        saved++;
      }
    }

    return { savedCount: saved, updatedCount: updated };
  }

  async listMarks(examinationId: string): Promise<readonly ExaminationMarkRow[]> {
    const rows = await this.client
      .select()
      .from(examinationMarks)
      .where(eq(examinationMarks.examinationId, examinationId));

    return rows.map((r) => this.mapMark(r));
  }

  async getMark(examinationMarkId: string): Promise<ExaminationMarkRow | null> {
    const [row] = await this.client
      .select()
      .from(examinationMarks)
      .where(eq(examinationMarks.id, examinationMarkId))
      .limit(1);

    return row ? this.mapMark(row) : null;
  }

  async getMarkByStudent(examinationId: string, studentId: string): Promise<ExaminationMarkRow | null> {
    const [row] = await this.client
      .select()
      .from(examinationMarks)
      .where(and(eq(examinationMarks.examinationId, examinationId), eq(examinationMarks.studentId, studentId)))
      .limit(1);

    return row ? this.mapMark(row) : null;
  }

  async recordCorrection(
    data: {
      readonly examinationMarkId: string;
      readonly previousMarks: number | null;
      readonly correctedMarks: number;
      readonly reason: string;
    },
    correctedByUserId: string,
  ): Promise<ExamMarksCorrectionRow> {
    const [row] = await this.client
      .insert(examMarksCorrections)
      .values({
        examinationMarkId: data.examinationMarkId,
        previousMarks: data.previousMarks !== null ? String(data.previousMarks) : null,
        correctedMarks: String(data.correctedMarks),
        reason: data.reason,
        correctedByUserId,
      })
      .returning();

    if (!row) throw new Error("Failed to insert correction.");

    await this.client
      .update(examinationMarks)
      .set({
        obtainedMarks: String(data.correctedMarks),
        status: "submitted",
        updatedAt: new Date(),
      })
      .where(eq(examinationMarks.id, data.examinationMarkId));

    return {
      id: row.id,
      examinationMarkId: row.examinationMarkId,
      previousMarks: row.previousMarks !== null ? Number(row.previousMarks) : null,
      correctedMarks: Number(row.correctedMarks),
      reason: row.reason,
      correctedByUserId: row.correctedByUserId,
      correctedAt: row.correctedAt,
      approvedByUserId: row.approvedByUserId,
      approvedAt: row.approvedAt,
    };
  }

  async listCorrections(examinationMarkId: string): Promise<readonly ExamMarksCorrectionRow[]> {
    const rows = await this.client
      .select()
      .from(examMarksCorrections)
      .where(eq(examMarksCorrections.examinationMarkId, examinationMarkId))
      .orderBy(asc(examMarksCorrections.correctedAt));

    return rows.map((r) => ({
      id: r.id,
      examinationMarkId: r.examinationMarkId,
      previousMarks: r.previousMarks !== null ? Number(r.previousMarks) : null,
      correctedMarks: Number(r.correctedMarks),
      reason: r.reason,
      correctedByUserId: r.correctedByUserId,
      correctedAt: r.correctedAt,
      approvedByUserId: r.approvedByUserId,
      approvedAt: r.approvedAt,
    }));
  }

  async getExaminationSheet(examinationId: string): Promise<ExaminationSheetView> {
    const exam = await this.getExamination(examinationId);
    if (!exam) throw new NotFoundError(`Examination ${examinationId} not found.`);

    const marks = await this.listMarks(examinationId);
    const registrations = await this.listRegistrations(examinationId);

    // Get section roster if sectionId exists
    let roster: StudentRosterItem[] = [];
    if (exam.sectionId) {
      const rosterRows = await this.client
        .select({
          studentId: students.id,
          rollNumber: students.rollNumber,
          firstName: students.firstName,
          lastName: students.lastName,
        })
        .from(studentPlacements)
        .innerJoin(students, eq(students.id, studentPlacements.studentId))
        .where(
          and(
            eq(studentPlacements.sectionId, exam.sectionId),
            eq(studentPlacements.academicSessionId, exam.academicSessionId),
            eq(studentPlacements.isCurrent, true),
          ),
        )
        .orderBy(asc(students.rollNumber));

      roster = rosterRows;
    }

    return {
      examination: exam,
      marks,
      roster,
      registrations,
    };
  }

  async getGradingSchemeWithBands(schemeId: string): Promise<{ scheme: GradingSchemeRow; bands: readonly GradingBandRow[] } | null> {
    const [schemeRow] = await this.client
      .select()
      .from(gradingSchemes)
      .where(eq(gradingSchemes.id, schemeId))
      .limit(1);

    if (!schemeRow) return null;

    const bandRows = await this.client
      .select()
      .from(gradingBands)
      .where(eq(gradingBands.gradingSchemeId, schemeId))
      .orderBy(asc(gradingBands.displayOrder));

    return {
      scheme: {
        id: schemeRow.id,
        institutionId: schemeRow.institutionId,
        name: schemeRow.name,
        academicSessionId: schemeRow.academicSessionId,
        subjectId: schemeRow.subjectId,
        basis: schemeRow.basis as "percentage" | "absolute",
        isDefault: schemeRow.isDefault,
        isActive: schemeRow.isActive,
        description: schemeRow.description,
      },
      bands: bandRows.map((b) => ({
        id: b.id,
        gradingSchemeId: b.gradingSchemeId,
        grade: b.grade,
        minPercentage: b.minPercentage !== null ? Number(b.minPercentage) : null,
        minMarks: b.minMarks !== null ? Number(b.minMarks) : null,
        gradePoint: b.gradePoint !== null ? Number(b.gradePoint) : null,
        displayOrder: b.displayOrder,
        isPass: b.isPass,
      })),
    };
  }

  async getDefaultGradingScheme(institutionId: string, subjectId?: string): Promise<{ scheme: GradingSchemeRow; bands: readonly GradingBandRow[] } | null> {
    const conditions = [eq(gradingSchemes.isActive, true)];
    if (institutionId) conditions.push(eq(gradingSchemes.institutionId, institutionId));
    if (subjectId) conditions.push(eq(gradingSchemes.subjectId, subjectId));

    const [schemeRow] = await this.client
      .select()
      .from(gradingSchemes)
      .where(and(...conditions))
      .orderBy(asc(gradingSchemes.isDefault))
      .limit(1);

    if (!schemeRow) return null;
    return this.getGradingSchemeWithBands(schemeRow.id);
  }

  async saveStudentResult(data: {
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
  }): Promise<StudentResultRow> {
    const existing = await this.getStudentResult(data.studentId, data.academicSessionId);

    const values = {
      studentId: data.studentId,
      academicSessionId: data.academicSessionId,
      classId: data.classId,
      sectionId: data.sectionId,
      gradingSchemeId: data.gradingSchemeId,
      totalObtainedMarks: String(data.totalObtainedMarks),
      totalMaximumMarks: String(data.totalMaximumMarks),
      percentage: String(data.percentage),
      grade: data.grade,
      gradePoint: data.gradePoint !== null ? String(data.gradePoint) : null,
      resultStatus: data.resultStatus,
      subjectsPassed: data.subjectsPassed,
      subjectsConsidered: data.subjectsConsidered,
      subjectBreakdown: data.subjectBreakdown,
      status: data.status,
      publishedAt: data.publishedAt ?? new Date(),
      computedFrom: data.computedFrom as Record<string, string | number | null> | undefined,
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await this.client
        .update(studentResults)
        .set(values)
        .where(eq(studentResults.id, existing.id))
        .returning();

      return this.mapStudentResult(updated!);
    }

    const [inserted] = await this.client
      .insert(studentResults)
      .values(values)
      .returning();

    return this.mapStudentResult(inserted!);
  }

  private mapStudentResult(r: typeof studentResults.$inferSelect): StudentResultRow {
    return {
      id: r.id,
      studentId: r.studentId,
      academicSessionId: r.academicSessionId,
      classId: r.classId,
      sectionId: r.sectionId,
      gradingSchemeId: r.gradingSchemeId,
      totalObtainedMarks: r.totalObtainedMarks !== null ? Number(r.totalObtainedMarks) : null,
      totalMaximumMarks: r.totalMaximumMarks !== null ? Number(r.totalMaximumMarks) : null,
      percentage: r.percentage !== null ? Number(r.percentage) : null,
      grade: r.grade,
      gradePoint: r.gradePoint !== null ? Number(r.gradePoint) : null,
      resultStatus: r.resultStatus as ResultStatus,
      subjectsPassed: r.subjectsPassed,
      subjectsConsidered: r.subjectsConsidered,
      subjectBreakdown: r.subjectBreakdown ?? {},
      status: r.status as PublicationStatus,
      publishedAt: r.publishedAt,
      computedFrom: r.computedFrom ?? null,
    };
  }

  async getStudentResult(studentId: string, academicSessionId: string): Promise<StudentResultRow | null> {
    const [row] = await this.client
      .select()
      .from(studentResults)
      .where(and(eq(studentResults.studentId, studentId), eq(studentResults.academicSessionId, academicSessionId)))
      .limit(1);

    return row ? this.mapStudentResult(row) : null;
  }

  async listStudentResultsByScope(filters: {
    readonly academicSessionId: string;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly studentId?: string | undefined;
  }): Promise<readonly StudentResultRow[]> {
    const conditions = [eq(studentResults.academicSessionId, filters.academicSessionId)];
    if (filters.classId) conditions.push(eq(studentResults.classId, filters.classId));
    if (filters.sectionId) conditions.push(eq(studentResults.sectionId, filters.sectionId));
    if (filters.studentId) conditions.push(eq(studentResults.studentId, filters.studentId));

    const rows = await this.client
      .select()
      .from(studentResults)
      .where(and(...conditions));

    return rows.map((r) => this.mapStudentResult(r));
  }

  async logPublication(data: {
    readonly studentResultId: string;
    readonly channel: "in_app" | "email" | "portal" | "printed";
    readonly publishedByUserId?: string | null | undefined;
    readonly resendReason?: string | null | undefined;
    readonly status?: "queued" | "sent" | "delivered" | "failed" | undefined;
    readonly failureReason?: string | null | undefined;
  }): Promise<ResultPublicationLogRow> {
    const [row] = await this.client
      .insert(resultPublicationLog)
      .values({
        studentResultId: data.studentResultId,
        channel: data.channel,
        publishedByUserId: data.publishedByUserId ?? null,
        resendReason: data.resendReason ?? null,
        status: data.status ?? "delivered",
        failureReason: data.failureReason ?? null,
      })
      .returning();

    if (!row) throw new Error("Failed to insert publication log.");

    return {
      id: row.id,
      studentResultId: row.studentResultId,
      channel: row.channel as ResultPublicationLogRow["channel"],
      publishedAt: row.publishedAt,
      publishedByUserId: row.publishedByUserId,
      resendReason: row.resendReason,
      status: row.status as ResultPublicationLogRow["status"],
      failureReason: row.failureReason,
    };
  }
}
