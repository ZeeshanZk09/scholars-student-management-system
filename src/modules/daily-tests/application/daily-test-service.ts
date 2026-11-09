/**
 * Daily Tests application service (`PRD.md` MODULE 21, `ARCHITECTURE.md` §23).
 */
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import {
  assertCanCorrectEvaluation,
  assertDailyTestScope,
  assertTotalMarks,
  calculatePercentage,
  evaluateStudentTestScore,
  validateDailyTestStatusTransition,
} from "../domain/daily-test-rules";
import type {
  DailyTestCorrectionRow,
  DailyTestRow,
  DailyTestSheetView,
  DailyTestStore,
  StudentTestViewItem,
} from "./ports";
import {
  BatchEnterEvaluationsData,
  CreateDailyTestData,
  LockDailyTestData,
  PublishDailyTestData,
  RecordDailyTestCorrectionData,
} from "./schemas";

export class DailyTestService {
  constructor(private readonly store: DailyTestStore) {}

  async createDailyTest(input: unknown, actorTeacherUserId: string): Promise<DailyTestRow> {
    const parsed = CreateDailyTestData.parse(input);

    assertDailyTestScope({ classId: parsed.classId, sectionId: parsed.sectionId });
    assertTotalMarks(parsed.totalMarks);

    // One test per subject per day for a given teacher (database uniqueIndex guard & application pre-check)
    const existingSameDay = await this.store.listDailyTests({
      institutionId: parsed.institutionId,
      subjectId: parsed.subjectId,
      teacherUserId: actorTeacherUserId,
      testDate: parsed.testDate,
    });

    if (existingSameDay.length > 0) {
      throw new BusinessRuleError(
        `A test for this subject on ${parsed.testDate} already exists.`,
        {
          userMessage: `You have already scheduled a test for this subject on ${parsed.testDate}.`,
        },
      );
    }

    return this.store.createDailyTest(parsed, actorTeacherUserId);
  }

  async getDailyTest(id: string): Promise<DailyTestRow> {
    const test = await this.store.getDailyTest(id);
    if (!test) {
      throw new NotFoundError("Daily test not found.");
    }
    return test;
  }

  async listDailyTests(filters: {
    readonly institutionId: string;
    readonly academicSessionId?: string | undefined;
    readonly classId?: string | undefined;
    readonly sectionId?: string | undefined;
    readonly subjectId?: string | undefined;
    readonly teacherUserId?: string | undefined;
    readonly status?: DailyTestRow["status"] | undefined;
    readonly testDate?: string | undefined;
  }): Promise<readonly DailyTestRow[]> {
    return this.store.listDailyTests(filters);
  }

  async batchEnterEvaluations(
    input: unknown,
    enteredByUserId: string,
  ): Promise<{ savedCount: number; updatedCount: number }> {
    const parsed = BatchEnterEvaluationsData.parse(input);
    const test = await this.getDailyTest(parsed.dailyTestId);

    if (test.status === "locked") {
      throw new BusinessRuleError("Cannot enter marks for a locked test.", {
        userMessage: "This daily test is permanently locked. Marks cannot be entered or updated.",
      });
    }

    // Validate every student mark via domain rules & score evaluation
    const validatedMarks = parsed.evaluations.map((e) => {
      const evaluation = evaluateStudentTestScore({
        status: e.status,
        obtainedMarks: e.obtainedMarks,
        totalMarks: test.totalMarks,
        statusReason: e.statusReason,
      });

      return {
        studentId: e.studentId,
        status: evaluation.status,
        obtainedMarks: evaluation.obtainedMarks,
        percentage: evaluation.percentage,
        statusReason: e.statusReason ?? null,
        notes: e.notes ?? null,
      };
    });

    return this.store.batchEnterEvaluations(test.id, validatedMarks, enteredByUserId);
  }

  async recordCorrection(
    input: unknown,
    correctedByUserId: string,
  ): Promise<DailyTestCorrectionRow> {
    const parsed = RecordDailyTestCorrectionData.parse(input);
    const evaluation = await this.store.getEvaluation(parsed.dailyTestEvaluationId);
    if (!evaluation) {
      throw new NotFoundError("Evaluation record not found.");
    }

    const test = await this.getDailyTest(evaluation.dailyTestId);
    if (test.status === "locked") {
      throw new BusinessRuleError("Cannot correct marks for a locked daily test.", {
        userMessage: "This test is permanently locked. Marks cannot be corrected.",
      });
    }

    assertCanCorrectEvaluation({
      previousMarks: evaluation.obtainedMarks,
      correctedMarks: parsed.correctedMarks,
      totalMarks: test.totalMarks,
      reason: parsed.reason,
    });

    const newPercentage = calculatePercentage(parsed.correctedMarks, test.totalMarks);

    return this.store.recordCorrection({
      evaluationId: evaluation.id,
      previousMarks: evaluation.obtainedMarks,
      correctedMarks: parsed.correctedMarks,
      reason: parsed.reason,
      correctedByUserId,
      newPercentage,
    });
  }

  async publishDailyTest(input: unknown, actorUserId: string): Promise<DailyTestRow> {
    const parsed = PublishDailyTestData.parse(input);
    const test = await this.getDailyTest(parsed.dailyTestId);

    validateDailyTestStatusTransition(test.status, "published");

    const updated = await this.store.updateDailyTestStatus(test.id, "published", new Date());

    for (const channel of parsed.channels) {
      await this.store.recordPublication(test.id, channel, actorUserId);
    }

    return updated;
  }

  async lockDailyTest(input: unknown, _actorUserId: string): Promise<DailyTestRow> {
    void _actorUserId;
    const parsed = LockDailyTestData.parse(input);
    const test = await this.getDailyTest(parsed.dailyTestId);

    validateDailyTestStatusTransition(test.status, "locked");

    return this.store.updateDailyTestStatus(test.id, "locked", new Date());
  }

  async getDailyTestSheet(dailyTestId: string): Promise<DailyTestSheetView> {
    const sheet = await this.store.getDailyTestSheet(dailyTestId);
    if (!sheet) {
      throw new NotFoundError("Daily test not found.");
    }
    return sheet;
  }

  async getStudentDailyTests(
    studentId: string,
    options?: {
      readonly subjectId?: string | undefined;
      readonly academicSessionId?: string | undefined;
    },
  ): Promise<readonly StudentTestViewItem[]> {
    return this.store.getStudentDailyTests(studentId, options);
  }
}
