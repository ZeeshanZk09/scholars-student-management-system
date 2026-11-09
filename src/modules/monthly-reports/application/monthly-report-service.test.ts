import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { MonthlyReportService } from "./monthly-report-service";
import { FakeMonthlyReportStore, type FakeStudent, type FakeSubject } from "./testing/fakes";

describe("MonthlyReportService", () => {
  let store: FakeMonthlyReportStore;
  let service: MonthlyReportService;

  const institutionId = randomUUID();
  const academicSessionId = randomUUID();
  const classId = randomUUID();
  const sectionId = randomUUID();
  const studentId = randomUUID();
  const mathSubjectId = randomUUID();
  const englishSubjectId = randomUUID();

  const student: FakeStudent = {
    id: studentId,
    institutionId,
    admissionNumber: "SCH-2026-001",
    firstName: "Ahmed",
    lastName: "Khan",
    rollNumber: "12",
    classId,
    className: "Grade 10",
    sectionId,
    sectionName: "Section A",
  };

  const mathSubject: FakeSubject = {
    id: mathSubjectId,
    institutionId,
    name: "Mathematics",
    code: "MATH-10",
  };

  const englishSubject: FakeSubject = {
    id: englishSubjectId,
    institutionId,
    name: "English",
    code: "ENG-10",
  };

  beforeEach(() => {
    store = new FakeMonthlyReportStore();
    service = new MonthlyReportService(store);

    store.students.set(studentId, student);
    store.subjects.set(mathSubjectId, mathSubject);
    store.subjects.set(englishSubjectId, englishSubject);
  });

  describe("generateReport", () => {
    it("successfully compiles a monthly report from daily tests", async () => {
      // Add daily test evaluations for Math
      store.evaluations.push(
        {
          dailyTestId: randomUUID(),
          subjectId: mathSubjectId,
          title: "Math Quiz 1",
          testDate: "2026-10-05",
          totalMarks: 20,
          testStatus: "published",
          dailyTestEvaluationId: randomUUID(),
          studentId,
          evaluationStatus: "present",
          obtainedMarks: 18,
          percentage: 90,
        },
        {
          dailyTestId: randomUUID(),
          subjectId: mathSubjectId,
          title: "Math Quiz 2",
          testDate: "2026-10-18",
          totalMarks: 30,
          testStatus: "published",
          dailyTestEvaluationId: randomUUID(),
          studentId,
          evaluationStatus: "present",
          obtainedMarks: 24,
          percentage: 80,
        },
      );

      const result = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
        classId,
        sectionId,
      });

      expect(result.report).toBeDefined();
      expect(result.report.testsCounted).toBe(2);
      // Weighted average: (90*20 + 80*30) / 50 = (1800 + 2400) / 50 = 4200 / 50 = 84%
      expect(result.report.averagePercentage).toBe(84);
      expect(result.report.status).toBe("draft");
      expect(result.supersededReportId).toBeNull();
      expect(store.items).toHaveLength(2);
    });

    it("throws BusinessRuleError when no evaluations exist for the month", async () => {
      await expect(
        service.generateReport({
          institutionId,
          academicSessionId,
          studentId,
          subjectId: mathSubjectId,
          periodMonth: "2026-10",
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("supersedes existing live report on regeneration", async () => {
      const testId1 = randomUUID();
      const evalId1 = randomUUID();
      store.evaluations.push({
        dailyTestId: testId1,
        subjectId: mathSubjectId,
        title: "Math Test 1",
        testDate: "2026-10-05",
        totalMarks: 20,
        testStatus: "published",
        dailyTestEvaluationId: evalId1,
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 15,
        percentage: 75,
      });

      // 1. Initial report generation
      const first = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });
      expect(first.supersededReportId).toBeNull();

      // 2. Add another test in the same month
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Math Test 2 (Post-correction)",
        testDate: "2026-10-22",
        totalMarks: 20,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 19,
        percentage: 95,
      });

      // 3. Re-generate report
      const second = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });

      expect(second.supersededReportId).toBe(first.report.id);
      expect(second.report.id).not.toBe(first.report.id);
      expect(second.report.testsCounted).toBe(2);

      // Check that the first report is now marked superseded
      const oldReport = await store.getReportById(first.report.id);
      expect(oldReport?.supersededByReportId).toBe(second.report.id);
    });

    it("prevents supersession and recomputation if active report is locked", async () => {
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Test",
        testDate: "2026-10-05",
        totalMarks: 20,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 16,
        percentage: 80,
      });

      const first = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });

      // Lock the report
      await service.lockReports({
        institutionId,
        reportIds: [first.report.id],
      });

      // Attempting to regenerate should throw BusinessRuleError
      await expect(
        service.generateReport({
          institutionId,
          academicSessionId,
          studentId,
          subjectId: mathSubjectId,
          periodMonth: "2026-10",
        }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("batchGenerateReports", () => {
    it("generates reports across enrolled students in class and skips empty subjects", async () => {
      // Add evaluations for student in Math
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Math Test",
        testDate: "2026-10-10",
        totalMarks: 25,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 20,
        percentage: 80,
      });

      // English has no tests yet
      const batchResult = await service.batchGenerateReports({
        institutionId,
        academicSessionId,
        classId,
        periodMonth: "2026-10",
      });

      // Math should be generated (1), English should be skipped (1)
      expect(batchResult.generatedCount).toBe(1);
      expect(batchResult.skippedCount).toBe(1);
      expect(batchResult.errors).toHaveLength(0);
    });
  });

  describe("publishReports and lockReports", () => {
    it("publishes draft reports and records email idempotency key", async () => {
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Test",
        testDate: "2026-10-10",
        totalMarks: 20,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 18,
        percentage: 90,
      });

      const rep = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });

      const publishResult = await service.publishReports({
        institutionId,
        reportIds: [rep.report.id],
        sendEmail: true,
      });

      expect(publishResult.publishedCount).toBe(1);

      const published = await store.getReportById(rep.report.id);
      expect(published?.status).toBe("published");
      expect(published?.publishedAt).toBeInstanceOf(Date);
      expect(published?.emailSentAt).toBeInstanceOf(Date);
      expect(published?.emailIdempotencyKey).toBe(`monthly_report:${rep.report.id}`);
    });

    it("locks reports permanently", async () => {
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Test",
        testDate: "2026-10-10",
        totalMarks: 20,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 18,
        percentage: 90,
      });

      const rep = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });

      await service.publishReports({
        institutionId,
        reportIds: [rep.report.id],
      });

      const lockResult = await service.lockReports({
        institutionId,
        reportIds: [rep.report.id],
      });

      expect(lockResult.lockedCount).toBe(1);

      const locked = await store.getReportById(rep.report.id);
      expect(locked?.status).toBe("locked");
    });
  });

  describe("getStudentReportCard", () => {
    it("generates student report card compiling multiple subjects with human-friendly metrics", async () => {
      // Add Math test
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Math Test",
        testDate: "2026-10-05",
        totalMarks: 50,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 45,
        percentage: 90,
      });

      // Add English test
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: englishSubjectId,
        title: "English Essay",
        testDate: "2026-10-12",
        totalMarks: 50,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 41,
        percentage: 82,
      });

      const mathReport = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });

      const engReport = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: englishSubjectId,
        periodMonth: "2026-10",
      });

      // Publish both reports
      await service.publishReports({
        institutionId,
        reportIds: [mathReport.report.id, engReport.report.id],
      });

      const card = await service.getStudentReportCard(studentId, "2026-10", false);

      expect(card.studentName).toBe("Ahmed Khan");
      expect(card.admissionNumber).toBe("SCH-2026-001");
      expect(card.rollNumber).toBe("12");
      expect(card.className).toBe("Grade 10");
      expect(card.subjects).toHaveLength(2);
      // Math: 90%, English: 82% -> Mean = 86%
      expect(card.overallPercentage).toBe(86);
      expect(card.totalTestsSat).toBe(2);
      expect(card.performanceRating).toBe("Excellent");
      expect(card.gradeBand).toBe("A");
      expect(card.remarks).toBeDefined();
    });

    it("hides draft reports from report card when canViewUnpublished is false", async () => {
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Math Test",
        testDate: "2026-10-05",
        totalMarks: 50,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 45,
        percentage: 90,
      });

      await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });

      // Report is draft, not published yet.
      const parentViewCard = await service.getStudentReportCard(studentId, "2026-10", false);
      expect(parentViewCard.subjects).toHaveLength(0);
      expect(parentViewCard.overallPercentage).toBeNull();

      // Teacher / Admin preview with canViewUnpublished = true
      const staffViewCard = await service.getStudentReportCard(studentId, "2026-10", true);
      expect(staffViewCard.subjects).toHaveLength(1);
      expect(staffViewCard.overallPercentage).toBe(90);
    });
  });

  describe("getReportDetails and listReports", () => {
    it("retrieves report details with contributing items", async () => {
      store.evaluations.push({
        dailyTestId: randomUUID(),
        subjectId: mathSubjectId,
        title: "Test",
        testDate: "2026-10-05",
        totalMarks: 20,
        testStatus: "published",
        dailyTestEvaluationId: randomUUID(),
        studentId,
        evaluationStatus: "present",
        obtainedMarks: 18,
        percentage: 90,
      });

      const { report } = await service.generateReport({
        institutionId,
        academicSessionId,
        studentId,
        subjectId: mathSubjectId,
        periodMonth: "2026-10",
      });

      const details = await service.getReportDetails(report.id);
      expect(details.report.id).toBe(report.id);
      expect(details.items).toHaveLength(1);
    });

    it("throws NotFoundError when report does not exist", async () => {
      await expect(service.getReportDetails(randomUUID())).rejects.toThrow(NotFoundError);
    });
  });
});
