/**
 * In-memory test fake for ExaminationStore.
 */
import { randomUUID } from "node:crypto";

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
} from "../ports";
import type { CreateExaminationInput } from "../schemas";

export class FakeExaminationStore implements ExaminationStore {
  readonly exams = new Map<string, ExaminationRow>();
  readonly marks = new Map<string, ExaminationMarkRow>();
  readonly registrations = new Map<string, ExaminationRegistrationRow>();
  readonly corrections: ExamMarksCorrectionRow[] = [];
  readonly studentResults = new Map<string, StudentResultRow>();
  readonly publicationLogs: ResultPublicationLogRow[] = [];
  readonly schemes = new Map<string, GradingSchemeRow>();
  readonly bands = new Map<string, GradingBandRow[]>();
  readonly roster: StudentRosterItem[] = [];

  async createExamination(data: CreateExaminationInput, setByTeacherUserId?: string | null): Promise<ExaminationRow> {
    const id = randomUUID();
    const row: ExaminationRow = {
      id,
      institutionId: data.institutionId,
      academicSessionId: data.academicSessionId,
      subjectId: data.subjectId,
      title: data.title,
      examinationType: data.examinationType,
      classId: data.classId ?? null,
      sectionId: data.sectionId ?? null,
      totalMarks: data.totalMarks,
      passMarks: data.passMarks ?? null,
      timeSlotId: data.timeSlotId ?? null,
      examDate: data.examDate,
      status: "draft",
      publishedAt: null,
      lockedAt: null,
      setByTeacherUserId: setByTeacherUserId ?? null,
      questionPaperStorageKey: null,
      submissionDeadline: data.submissionDeadline ? new Date(data.submissionDeadline) : null,
      description: data.description ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    this.exams.set(id, row);
    return row;
  }

  async getExamination(id: string): Promise<ExaminationRow | null> {
    return this.exams.get(id) ?? null;
  }

  async listExaminations(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly subjectId?: string | undefined;
    readonly status?: "draft" | "published" | "locked" | undefined;
  }): Promise<readonly ExaminationRow[]> {
    return Array.from(this.exams.values()).filter((e) => {
      if (filters.academicSessionId && e.academicSessionId !== filters.academicSessionId) return false;
      if (filters.classId && e.classId !== filters.classId) return false;
      if (filters.sectionId && e.sectionId !== filters.sectionId) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    });
  }

  async updateExaminationStatus(id: string, status: "draft" | "published" | "locked"): Promise<ExaminationRow> {
    const ex = this.exams.get(id);
    if (!ex) throw new Error("Not found");
    const updated: ExaminationRow = {
      ...ex,
      status,
      publishedAt: status === "published" ? new Date() : ex.publishedAt,
      lockedAt: status === "locked" ? new Date() : ex.lockedAt,
      updatedAt: new Date(),
      version: ex.version + 1,
    };
    this.exams.set(id, updated);
    return updated;
  }

  async registerStudents(examinationId: string, studentIds: readonly string[]): Promise<number> {
    let count = 0;
    for (const sid of studentIds) {
      const regId = `${examinationId}-${sid}`;
      this.registrations.set(regId, {
        id: randomUUID(),
        examinationId,
        studentId: sid,
        status: "registered",
        seatNumber: null,
        registeredAt: new Date(),
        withdrawnByUserId: null,
        withdrawalReason: null,
      });
      count += 1;
    }
    return count;
  }

  async listRegistrations(examinationId: string): Promise<readonly ExaminationRegistrationRow[]> {
    return Array.from(this.registrations.values()).filter((r) => r.examinationId === examinationId);
  }

  async batchEnterMarks(
    examinationId: string,
    marksList: readonly {
      readonly studentId: string;
      readonly status: "pending" | "absent" | "submitted" | "malpractice" | "withheld";
      readonly obtainedMarks: number | null;
      readonly statusReason?: string | null | undefined;
      readonly notes?: string | null | undefined;
    }[],
    enteredByUserId: string,
  ): Promise<{ savedCount: number; updatedCount: number }> {
    const exam = this.exams.get(examinationId);
    if (!exam) throw new Error("Exam not found");

    let saved = 0;
    let updated = 0;

    for (const m of marksList) {
      const markKey = `${examinationId}-${m.studentId}`;
      const existing = this.marks.get(markKey);
      if (existing) {
        this.marks.set(markKey, {
          ...existing,
          status: m.status,
          obtainedMarks: m.obtainedMarks,
          statusReason: m.statusReason ?? null,
          notes: m.notes ?? null,
          enteredByUserId,
          enteredAt: new Date(),
          updatedAt: new Date(),
          version: existing.version + 1,
        });
        updated += 1;
      } else {
        this.marks.set(markKey, {
          id: randomUUID(),
          examinationId,
          studentId: m.studentId,
          academicSessionId: exam.academicSessionId,
          subjectId: exam.subjectId,
          classId: exam.classId,
          sectionId: exam.sectionId,
          status: m.status,
          obtainedMarks: m.obtainedMarks,
          totalMarks: exam.totalMarks,
          enteredByUserId,
          enteredAt: new Date(),
          scriptStorageKey: null,
          statusReason: m.statusReason ?? null,
          notes: m.notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        });
        saved += 1;
      }
    }

    return { savedCount: saved, updatedCount: updated };
  }

  async listMarks(examinationId: string): Promise<readonly ExaminationMarkRow[]> {
    return Array.from(this.marks.values()).filter((m) => m.examinationId === examinationId);
  }

  async getMark(examinationMarkId: string): Promise<ExaminationMarkRow | null> {
    for (const m of this.marks.values()) {
      if (m.id === examinationMarkId) return m;
    }
    return null;
  }

  async getMarkByStudent(examinationId: string, studentId: string): Promise<ExaminationMarkRow | null> {
    return this.marks.get(`${examinationId}-${studentId}`) ?? null;
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
    const mark = await this.getMark(data.examinationMarkId);
    if (!mark) throw new Error("Mark not found");

    const row: ExamMarksCorrectionRow = {
      id: randomUUID(),
      examinationMarkId: data.examinationMarkId,
      previousMarks: data.previousMarks,
      correctedMarks: data.correctedMarks,
      reason: data.reason,
      correctedByUserId,
      correctedAt: new Date(),
      approvedByUserId: null,
      approvedAt: null,
    };
    this.corrections.push(row);

    // Apply correction to the mark
    this.marks.set(`${mark.examinationId}-${mark.studentId}`, {
      ...mark,
      obtainedMarks: data.correctedMarks,
      status: "submitted",
      updatedAt: new Date(),
      version: mark.version + 1,
    });

    return row;
  }

  async listCorrections(examinationMarkId: string): Promise<readonly ExamMarksCorrectionRow[]> {
    return this.corrections.filter((c) => c.examinationMarkId === examinationMarkId);
  }

  async getExaminationSheet(examinationId: string): Promise<ExaminationSheetView> {
    const examination = this.exams.get(examinationId);
    if (!examination) throw new Error("Exam not found");
    return {
      examination,
      marks: await this.listMarks(examinationId),
      roster: this.roster,
      registrations: await this.listRegistrations(examinationId),
    };
  }

  async getGradingSchemeWithBands(schemeId: string): Promise<{ scheme: GradingSchemeRow; bands: readonly GradingBandRow[] } | null> {
    const scheme = this.schemes.get(schemeId);
    if (!scheme) return null;
    return { scheme, bands: this.bands.get(schemeId) ?? [] };
  }

  async getDefaultGradingScheme(): Promise<{ scheme: GradingSchemeRow; bands: readonly GradingBandRow[] } | null> {
    const first = Array.from(this.schemes.values())[0];
    if (!first) return null;
    return { scheme: first, bands: this.bands.get(first.id) ?? [] };
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
    readonly resultStatus: "pass" | "fail" | "compartment" | "withheld";
    readonly subjectsPassed: number;
    readonly subjectsConsidered: number;
    readonly subjectBreakdown: Record<string, { obtained: number; total: number; grade: string | null }>;
    readonly status: "draft" | "published" | "locked";
    readonly publishedAt?: Date | null | undefined;
    readonly computedFrom?: Record<string, unknown> | null | undefined;
  }): Promise<StudentResultRow> {
    const key = `${data.studentId}-${data.academicSessionId}`;
    const row: StudentResultRow = {
      id: randomUUID(),
      studentId: data.studentId,
      academicSessionId: data.academicSessionId,
      classId: data.classId,
      sectionId: data.sectionId,
      gradingSchemeId: data.gradingSchemeId,
      totalObtainedMarks: data.totalObtainedMarks,
      totalMaximumMarks: data.totalMaximumMarks,
      percentage: data.percentage,
      grade: data.grade,
      gradePoint: data.gradePoint,
      resultStatus: data.resultStatus,
      subjectsPassed: data.subjectsPassed,
      subjectsConsidered: data.subjectsConsidered,
      subjectBreakdown: data.subjectBreakdown,
      status: data.status,
      publishedAt: data.publishedAt ?? new Date(),
      computedFrom: data.computedFrom ?? null,
    };
    this.studentResults.set(key, row);
    return row;
  }

  async getStudentResult(studentId: string, academicSessionId: string): Promise<StudentResultRow | null> {
    return this.studentResults.get(`${studentId}-${academicSessionId}`) ?? null;
  }

  async listStudentResultsByScope(filters: {
    readonly academicSessionId: string;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly studentId?: string | undefined;
  }): Promise<readonly StudentResultRow[]> {
    return Array.from(this.studentResults.values()).filter((r) => {
      if (r.academicSessionId !== filters.academicSessionId) return false;
      if (filters.classId && r.classId !== filters.classId) return false;
      if (filters.sectionId && r.sectionId !== filters.sectionId) return false;
      if (filters.studentId && r.studentId !== filters.studentId) return false;
      return true;
    });
  }

  async logPublication(data: {
    readonly studentResultId: string;
    readonly channel: "in_app" | "email" | "portal" | "printed";
    readonly publishedByUserId?: string | null | undefined;
    readonly resendReason?: string | null | undefined;
    readonly status?: "queued" | "sent" | "delivered" | "failed" | undefined;
    readonly failureReason?: string | null | undefined;
  }): Promise<ResultPublicationLogRow> {
    const row: ResultPublicationLogRow = {
      id: randomUUID(),
      studentResultId: data.studentResultId,
      channel: data.channel,
      publishedAt: new Date(),
      publishedByUserId: data.publishedByUserId ?? null,
      resendReason: data.resendReason ?? null,
      status: data.status ?? "delivered",
      failureReason: data.failureReason ?? null,
    };
    this.publicationLogs.push(row);
    return row;
  }
}