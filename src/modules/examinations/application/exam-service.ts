/**
 * Examinations application service (`PRD.md` MODULE 20).
 */
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import {
  calculateStudentSessionResult,
  type ExamMarkStatus,
  type GradingBandRule,
  type SubjectMarkInput,
  validateExamMark,
  validateMarkCorrection,
  validatePublicationStatusTransition,
} from "../domain/exam-rules";
import type {
  ExaminationRow,
  ExaminationSheetView,
  ExaminationStore,
  StudentResultRow,
} from "./ports";
import {
  CreateExaminationData,
  EnterMarksBatchData,
  PublishExaminationData,
  PublishStudentResultsData,
  RecordExamMarkCorrectionData,
} from "./schemas";

export class ExaminationService {
  constructor(private readonly store: ExaminationStore) {}

  async createExamination(input: unknown, actorUserId: string): Promise<ExaminationRow> {
    const parsed = CreateExaminationData.parse(input);
    return this.store.createExamination(parsed, parsed.setByTeacherUserId ?? actorUserId);
  }

  async registerStudents(examinationId: string, studentIds: readonly string[]): Promise<number> {
    const exam = await this.store.getExamination(examinationId);
    if (!exam) {
      throw new NotFoundError(`Examination ${examinationId} not found.`);
    }
    if (exam.status === "locked") {
      throw new BusinessRuleError("Cannot register students for a locked examination.", {
        userMessage: "Cannot register students for a locked examination.",
      });
    }
    return this.store.registerStudents(examinationId, studentIds);
  }

  async enterMarksBatch(
    input: unknown,
    enteredByUserId: string,
  ): Promise<{ savedCount: number; updatedCount: number }> {
    const parsed = EnterMarksBatchData.parse(input);
    const exam = await this.store.getExamination(parsed.examinationId);
    if (!exam) {
      throw new NotFoundError(`Examination ${parsed.examinationId} not found.`);
    }

    if (exam.status === "locked") {
      throw new BusinessRuleError("Cannot enter or modify marks for a locked examination.", {
        userMessage: "This paper is permanently locked. Marks cannot be updated.",
      });
    }

    // Validate every mark through pure domain rules
    for (const m of parsed.marks) {
      validateExamMark({
        status: m.status,
        obtainedMarks: m.obtainedMarks ?? null,
        totalMarks: exam.totalMarks,
        statusReason: m.statusReason ?? null,
        enteredByUserId,
      });
    }

    return this.store.batchEnterMarks(
      parsed.examinationId,
      parsed.marks.map((m) => ({
        studentId: m.studentId,
        status: m.status as ExamMarkStatus,
        obtainedMarks: m.obtainedMarks ?? null,
        statusReason: m.statusReason ?? null,
        notes: m.notes ?? null,
      })),
      enteredByUserId,
      parsed.finalize,
    );
  }

  async recordCorrection(input: unknown, correctedByUserId: string) {
    const parsed = RecordExamMarkCorrectionData.parse(input);
    const mark = await this.store.getMark(parsed.examinationMarkId);
    if (!mark) {
      throw new NotFoundError(`Examination mark ${parsed.examinationMarkId} not found.`);
    }

    const exam = await this.store.getExamination(mark.examinationId);
    if (!exam) {
      throw new NotFoundError(`Examination ${mark.examinationId} not found.`);
    }

    validateMarkCorrection({
      previousMarks: mark.obtainedMarks,
      correctedMarks: parsed.correctedMarks,
      totalMarks: mark.totalMarks,
      reason: parsed.reason,
      correctedByUserId,
    });

    return this.store.recordCorrection(
      {
        examinationMarkId: parsed.examinationMarkId,
        previousMarks: mark.obtainedMarks,
        correctedMarks: parsed.correctedMarks,
        reason: parsed.reason,
      },
      correctedByUserId,
    );
  }

  async publishExamination(input: unknown, actorUserId: string): Promise<ExaminationRow> {
    const parsed = PublishExaminationData.parse(input);
    const exam = await this.store.getExamination(parsed.examinationId);
    if (!exam) {
      throw new NotFoundError(`Examination ${parsed.examinationId} not found.`);
    }

    validatePublicationStatusTransition(exam.status, "published");

    const marks = await this.store.listMarks(parsed.examinationId);
    const pendingCount = marks.filter((m) => m.status === "pending").length;
    if (pendingCount > 0) {
      throw new BusinessRuleError(
        `Cannot publish examination: ${pendingCount} students still have pending marks.`,
        {
          userMessage: `Complete marks entry for all students before publishing (${pendingCount} pending).`,
        },
      );
    }

    return this.store.updateExaminationStatus(parsed.examinationId, "published", actorUserId);
  }

  async lockExamination(examinationId: string, actorUserId: string): Promise<ExaminationRow> {
    const exam = await this.store.getExamination(examinationId);
    if (!exam) {
      throw new NotFoundError(`Examination ${examinationId} not found.`);
    }

    validatePublicationStatusTransition(exam.status, "locked");
    return this.store.updateExaminationStatus(examinationId, "locked", actorUserId);
  }

  async consolidateAndPublishStudentResults(
    input: unknown,
    publishedByUserId: string,
  ): Promise<readonly StudentResultRow[]> {
    const parsed = PublishStudentResultsData.parse(input);

    const targetStudents: string[] = [];
    if (parsed.studentId) {
      targetStudents.push(parsed.studentId);
    } else {
      const exams = await this.store.listExaminations({
        institutionId: "", // Scoped through session
        academicSessionId: parsed.academicSessionId,
        classId: parsed.classId ?? undefined,
        sectionId: parsed.sectionId ?? undefined,
      });

      const studentSet = new Set<string>();
      for (const e of exams) {
        const marks = await this.store.listMarks(e.id);
        for (const m of marks) studentSet.add(m.studentId);
      }
      targetStudents.push(...Array.from(studentSet));
    }

    if (targetStudents.length === 0) {
      throw new BusinessRuleError("No students found to consolidate results for.", {
        userMessage: "No students found to consolidate results for.",
      });
    }

    const schemeData = parsed.gradingSchemeId
      ? await this.store.getGradingSchemeWithBands(parsed.gradingSchemeId)
      : await this.store.getDefaultGradingScheme("", undefined);

    const gradingBands: readonly GradingBandRule[] = (schemeData?.bands ?? []).map((b) => ({
      grade: b.grade,
      minPercentage: b.minPercentage,
      minMarks: b.minMarks,
      gradePoint: b.gradePoint,
      isPass: b.isPass,
    }));

    const publishedResults: StudentResultRow[] = [];

    for (const studentId of targetStudents) {
      const exams = await this.store.listExaminations({
        institutionId: "",
        academicSessionId: parsed.academicSessionId,
        classId: parsed.classId ?? undefined,
        sectionId: parsed.sectionId ?? undefined,
      });

      const subjectMarks: SubjectMarkInput[] = [];
      for (const e of exams) {
        const mark = await this.store.getMarkByStudent(e.id, studentId);
        if (mark) {
          subjectMarks.push({
            subjectId: e.subjectId,
            obtainedMarks: mark.obtainedMarks,
            totalMarks: mark.totalMarks,
            passMarks: e.passMarks,
            status: mark.status,
          });
        }
      }

      if (subjectMarks.length === 0) continue;

      const computed = calculateStudentSessionResult({
        marks: subjectMarks,
        gradingBands,
      });

      const saved = await this.store.saveStudentResult({
        studentId,
        academicSessionId: parsed.academicSessionId,
        classId: parsed.classId ?? null,
        sectionId: parsed.sectionId ?? null,
        gradingSchemeId: schemeData?.scheme.id ?? null,
        totalObtainedMarks: computed.totalObtainedMarks,
        totalMaximumMarks: computed.totalMaximumMarks,
        percentage: computed.percentage,
        grade: computed.grade,
        gradePoint: computed.gradePoint,
        resultStatus: computed.resultStatus,
        subjectsPassed: computed.subjectsPassed,
        subjectsConsidered: computed.subjectsConsidered,
        subjectBreakdown: computed.subjectBreakdown,
        status: "published",
        publishedAt: new Date(),
        computedFrom: { marksCount: subjectMarks.length },
      });

      await this.store.logPublication({
        studentResultId: saved.id,
        channel: parsed.channel,
        publishedByUserId,
        status: "delivered",
      });

      publishedResults.push(saved);
    }

    return publishedResults;
  }

  async getExaminationSheet(examinationId: string): Promise<ExaminationSheetView> {
    return this.store.getExaminationSheet(examinationId);
  }

  async getStudentSessionResult(studentId: string, academicSessionId: string): Promise<StudentResultRow | null> {
    return this.store.getStudentResult(studentId, academicSessionId);
  }

  async listExaminations(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly status?: "draft" | "published" | "locked" | undefined;
  }): Promise<readonly ExaminationRow[]> {
    return this.store.listExaminations(filters);
  }
}