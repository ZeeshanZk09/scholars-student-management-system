import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { DailyTestService } from "./daily-test-service";
import { FakeDailyTestStore } from "./testing/fakes";

describe("DailyTestService", () => {
  let store: FakeDailyTestStore;
  let service: DailyTestService;

  const institutionId = "550e8400-e29b-41d4-a716-446655440000";
  const academicSessionId = "550e8400-e29b-41d4-a716-446655440001";
  const subjectId = "550e8400-e29b-41d4-a716-446655440002";
  const classId = "550e8400-e29b-41d4-a716-446655440003";
  const sectionId = "550e8400-e29b-41d4-a716-446655440004";
  const teacherUserId = "550e8400-e29b-41d4-a716-446655440005";
  const student1Id = "550e8400-e29b-41d4-a716-446655440006";
  const student2Id = "550e8400-e29b-41d4-a716-446655440007";

  beforeEach(() => {
    store = new FakeDailyTestStore();
    service = new DailyTestService(store);

    store.seedStudent({
      id: student1Id,
      name: "Ahmed Ali",
      rollNumber: "101",
    });
    store.seedStudent({
      id: student2Id,
      name: "Sara Khan",
      rollNumber: "102",
    });
  });

  describe("createDailyTest", () => {
    it("creates a daily test successfully with valid input", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Math Quiz 1",
          testDate: "2026-11-01",
          totalMarks: 25,
          classId,
          sectionId,
          instructions: "No calculators allowed.",
        },
        teacherUserId,
      );

      expect(test.id).toBeDefined();
      expect(test.title).toBe("Math Quiz 1");
      expect(test.totalMarks).toBe(25);
      expect(test.status).toBe("draft");
      expect(test.createdByTeacherUserId).toBe(teacherUserId);
    });

    it("rejects test when neither classId nor sectionId is specified", async () => {
      await expect(
        service.createDailyTest(
          {
            institutionId,
            academicSessionId,
            subjectId,
            title: "Math Quiz 1",
            testDate: "2026-11-01",
            totalMarks: 25,
            instructions: "No calculators allowed.",
          },
          teacherUserId,
        ),
      ).rejects.toThrow();
    });

    it("prevents duplicate test creation by same teacher on same day for same subject", async () => {
      await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Morning Math Quiz",
          testDate: "2026-11-01",
          totalMarks: 20,
          classId,
        },
        teacherUserId,
      );

      await expect(
        service.createDailyTest(
          {
            institutionId,
            academicSessionId,
            subjectId,
            title: "Afternoon Math Quiz",
            testDate: "2026-11-01",
            totalMarks: 20,
            classId,
          },
          teacherUserId,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("batchEnterEvaluations", () => {
    it("enters marks and calculates percentage for present students", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Physics Daily Test",
          testDate: "2026-11-02",
          totalMarks: 20,
          classId,
        },
        teacherUserId,
      );

      const result = await service.batchEnterEvaluations(
        {
          dailyTestId: test.id,
          evaluations: [
            {
              studentId: student1Id,
              status: "present",
              obtainedMarks: 18,
            },
            {
              studentId: student2Id,
              status: "absent",
              obtainedMarks: null,
            },
          ],
        },
        teacherUserId,
      );

      expect(result.savedCount).toBe(2);

      const ev1 = await store.getEvaluationByStudent(test.id, student1Id);
      expect(ev1?.obtainedMarks).toBe(18);
      expect(ev1?.percentage).toBe(90);
      expect(ev1?.status).toBe("present");

      const ev2 = await store.getEvaluationByStudent(test.id, student2Id);
      expect(ev2?.obtainedMarks).toBeNull();
      expect(ev2?.percentage).toBeNull();
      expect(ev2?.status).toBe("absent");
    });

    it("rejects marks if absent student has numeric marks", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Physics Daily Test",
          testDate: "2026-11-02",
          totalMarks: 20,
          classId,
        },
        teacherUserId,
      );

      await expect(
        service.batchEnterEvaluations(
          {
            dailyTestId: test.id,
            evaluations: [
              {
                studentId: student1Id,
                status: "absent",
                obtainedMarks: 10,
              },
            ],
          },
          teacherUserId,
        ),
      ).rejects.toThrow("Only present students can carry marks");
    });

    it("requires reason when student status is excused", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Physics Daily Test",
          testDate: "2026-11-02",
          totalMarks: 20,
          classId,
        },
        teacherUserId,
      );

      await expect(
        service.batchEnterEvaluations(
          {
            dailyTestId: test.id,
            evaluations: [
              {
                studentId: student1Id,
                status: "excused",
                obtainedMarks: null,
                statusReason: "",
              },
            ],
          },
          teacherUserId,
        ),
      ).rejects.toThrow("reason is required");
    });
  });

  describe("recordCorrection", () => {
    it("records mark correction with audit trail and updates percentage", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "English Vocab Test",
          testDate: "2026-11-03",
          totalMarks: 50,
          classId,
        },
        teacherUserId,
      );

      await service.batchEnterEvaluations(
        {
          dailyTestId: test.id,
          evaluations: [
            {
              studentId: student1Id,
              status: "present",
              obtainedMarks: 40,
            },
          ],
        },
        teacherUserId,
      );

      const ev = await store.getEvaluationByStudent(test.id, student1Id);
      expect(ev).not.toBeNull();

      const correction = await service.recordCorrection(
        {
          dailyTestEvaluationId: ev!.id,
          correctedMarks: 45,
          reason: "Recounted spelling question points",
        },
        teacherUserId,
      );

      expect(correction.previousMarks).toBe(40);
      expect(correction.correctedMarks).toBe(45);
      expect(correction.reason).toBe("Recounted spelling question points");

      const updatedEv = await store.getEvaluation(ev!.id);
      expect(updatedEv?.obtainedMarks).toBe(45);
      expect(updatedEv?.percentage).toBe(90);
    });

    it("rejects correction when new marks equal previous marks", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "English Vocab Test",
          testDate: "2026-11-03",
          totalMarks: 50,
          classId,
        },
        teacherUserId,
      );

      await service.batchEnterEvaluations(
        {
          dailyTestId: test.id,
          evaluations: [
            {
              studentId: student1Id,
              status: "present",
              obtainedMarks: 40,
            },
          ],
        },
        teacherUserId,
      );

      const ev = await store.getEvaluationByStudent(test.id, student1Id);

      await expect(
        service.recordCorrection(
          {
            dailyTestEvaluationId: ev!.id,
            correctedMarks: 40,
            reason: "Checking again",
          },
          teacherUserId,
        ),
      ).rejects.toThrow("Corrected marks must be different from previous marks");
    });
  });

  describe("publishDailyTest & lockDailyTest", () => {
    it("publishes test and records publication channels", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "History Quiz",
          testDate: "2026-11-04",
          totalMarks: 10,
          classId,
        },
        teacherUserId,
      );

      const published = await service.publishDailyTest(
        {
          dailyTestId: test.id,
          channels: ["student_portal", "guardian_portal"],
        },
        teacherUserId,
      );

      expect(published.status).toBe("published");
      expect(published.publishedAt).not.toBeNull();
      expect(store.publications.length).toBe(2);
    });

    it("locks test and forbids modifications", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "History Quiz",
          testDate: "2026-11-04",
          totalMarks: 10,
          classId,
        },
        teacherUserId,
      );

      await service.publishDailyTest(
        {
          dailyTestId: test.id,
          channels: ["student_portal"],
        },
        teacherUserId,
      );

      const locked = await service.lockDailyTest(
        { dailyTestId: test.id },
        teacherUserId,
      );
      expect(locked.status).toBe("locked");
      expect(locked.lockedAt).not.toBeNull();

      // Attempting to enter marks on a locked test must throw BusinessRuleError
      await expect(
        service.batchEnterEvaluations(
          {
            dailyTestId: test.id,
            evaluations: [
              {
                studentId: student1Id,
                status: "present",
                obtainedMarks: 8,
              },
            ],
          },
          teacherUserId,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("forbids locking a test directly from draft status", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Draft Quiz",
          testDate: "2026-11-05",
          totalMarks: 10,
          classId,
        },
        teacherUserId,
      );

      await expect(
        service.lockDailyTest({ dailyTestId: test.id }, teacherUserId),
      ).rejects.toThrow("must be published before it can be locked");
    });
  });

  describe("getDailyTestSheet", () => {
    it("returns complete test sheet with student details, grades, and passing indicators", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Chemistry Quiz",
          testDate: "2026-11-06",
          totalMarks: 20,
          classId,
        },
        teacherUserId,
      );

      await service.batchEnterEvaluations(
        {
          dailyTestId: test.id,
          evaluations: [
            {
              studentId: student1Id,
              status: "present",
              obtainedMarks: 19, // 95% -> A+, passing
            },
            {
              studentId: student2Id,
              status: "present",
              obtainedMarks: 6, // 30% -> F, not passing
            },
          ],
        },
        teacherUserId,
      );

      const sheet = await service.getDailyTestSheet(test.id);
      expect(sheet.test.id).toBe(test.id);
      expect(sheet.evaluations.length).toBe(2);

      const s1 = sheet.evaluations.find((e) => e.student.id === student1Id);
      expect(s1?.student.name).toBe("Ahmed Ali");
      expect(s1?.grade).toBe("A+");
      expect(s1?.isPassing).toBe(true);

      const s2 = sheet.evaluations.find((e) => e.student.id === student2Id);
      expect(s2?.student.name).toBe("Sara Khan");
      expect(s2?.grade).toBe("F");
      expect(s2?.isPassing).toBe(false);
    });

    it("throws NotFoundError when test does not exist", async () => {
      await expect(
        service.getDailyTestSheet("550e8400-e29b-41d4-a716-446655440099"),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getStudentDailyTests", () => {
    it("retrieves tests and marks for a student across subjects", async () => {
      const test = await service.createDailyTest(
        {
          institutionId,
          academicSessionId,
          subjectId,
          title: "Biology Quiz",
          testDate: "2026-11-07",
          totalMarks: 10,
          classId,
        },
        teacherUserId,
      );

      await service.batchEnterEvaluations(
        {
          dailyTestId: test.id,
          evaluations: [
            {
              studentId: student1Id,
              status: "present",
              obtainedMarks: 9,
            },
          ],
        },
        teacherUserId,
      );

      const studentTests = await service.getStudentDailyTests(student1Id);
      expect(studentTests.length).toBe(1);
      expect(studentTests[0]?.test.title).toBe("Biology Quiz");
      expect(studentTests[0]?.evaluation.obtainedMarks).toBe(9);
      expect(studentTests[0]?.grade).toBe("A+");
      expect(studentTests[0]?.isPassing).toBe(true);
    });
  });
});
