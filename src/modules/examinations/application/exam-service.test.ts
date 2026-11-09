/**
 * Application service unit tests for Examinations (`PRD.md` MODULE 20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError } from "@/shared/errors";
import { ExaminationService } from "./exam-service";
import { FakeExaminationStore } from "./testing/fakes";

const INSTITUTION_ID = "00000000-0000-4000-8000-000000000001";
const ACADEMIC_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const SUBJECT_ID = "00000000-0000-4000-8000-000000000003";
const CLASS_ID = "00000000-0000-4000-8000-000000000004";
const SECTION_ID = "00000000-0000-4000-8000-000000000005";
const TEACHER_USER_ID = "00000000-0000-4000-8000-000000000006";
const STUDENT_1 = "00000000-0000-4000-8000-000000000010";
const STUDENT_2 = "00000000-0000-4000-8000-000000000011";

describe("ExaminationService", () => {
  let store: FakeExaminationStore;
  let service: ExaminationService;

  beforeEach(() => {
    store = new FakeExaminationStore();
    service = new ExaminationService(store);
  });

  describe("creating examinations", () => {
    it("creates an examination with class scope and positive marks", async () => {
      const exam = await service.createExamination(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: ACADEMIC_SESSION_ID,
          subjectId: SUBJECT_ID,
          title: "Midterm Physics 2026",
          examinationType: "midterm",
          classId: CLASS_ID,
          totalMarks: 100,
          passMarks: 40,
          examDate: "2026-11-15",
        },
        TEACHER_USER_ID,
      );

      expect(exam.id).toBeDefined();
      expect(exam.title).toBe("Midterm Physics 2026");
      expect(exam.status).toBe("draft");
      expect(exam.totalMarks).toBe(100);
    });

    it("refuses examination without class or section scope", async () => {
      await expect(
        service.createExamination(
          {
            institutionId: INSTITUTION_ID,
            academicSessionId: ACADEMIC_SESSION_ID,
            subjectId: SUBJECT_ID,
            title: "Unscoped Exam",
            examinationType: "quiz",
            totalMarks: 50,
            examDate: "2026-11-15",
          },
          TEACHER_USER_ID,
        ),
      ).rejects.toThrow();
    });
  });

  describe("registering candidates", () => {
    it("registers students for a draft examination", async () => {
      const exam = await service.createExamination(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: ACADEMIC_SESSION_ID,
          subjectId: SUBJECT_ID,
          title: "Quiz 1",
          examinationType: "quiz",
          classId: CLASS_ID,
          totalMarks: 25,
          examDate: "2026-11-15",
        },
        TEACHER_USER_ID,
      );

      const count = await service.registerStudents(exam.id, [STUDENT_1, STUDENT_2]);
      expect(count).toBe(2);
    });
  });

  describe("entering batch marks", () => {
    it("enters marks for 50 students in one atomic write", async () => {
      const exam = await service.createExamination(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: ACADEMIC_SESSION_ID,
          subjectId: SUBJECT_ID,
          title: "Annual Mathematics",
          examinationType: "annual",
          classId: CLASS_ID,
          sectionId: SECTION_ID,
          totalMarks: 100,
          examDate: "2026-11-20",
        },
        TEACHER_USER_ID,
      );

      const batch = [
        { studentId: STUDENT_1, status: "submitted" as const, obtainedMarks: 88 },
        { studentId: STUDENT_2, status: "absent" as const, obtainedMarks: null },
      ];

      const res = await service.enterMarksBatch({ examinationId: exam.id, marks: batch }, TEACHER_USER_ID);
      expect(res.savedCount).toBe(2);

      const marks = await store.listMarks(exam.id);
      expect(marks).toHaveLength(2);
      expect(marks.find((m) => m.studentId === STUDENT_1)?.obtainedMarks).toBe(88);
      expect(marks.find((m) => m.studentId === STUDENT_2)?.status).toBe("absent");
    });

    it("refuses mark entry on a locked examination", async () => {
      const exam = await service.createExamination(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: ACADEMIC_SESSION_ID,
          subjectId: SUBJECT_ID,
          title: "Past Exam",
          examinationType: "annual",
          classId: CLASS_ID,
          totalMarks: 100,
          examDate: "2026-05-20",
        },
        TEACHER_USER_ID,
      );

      await store.updateExaminationStatus(exam.id, "published");
      await service.lockExamination(exam.id, TEACHER_USER_ID);

      await expect(
        service.enterMarksBatch(
          {
            examinationId: exam.id,
            marks: [{ studentId: STUDENT_1, status: "submitted", obtainedMarks: 75 }],
          },
          TEACHER_USER_ID,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("recording post-publication corrections", () => {
    it("records an audited mark correction", async () => {
      const exam = await service.createExamination(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: ACADEMIC_SESSION_ID,
          subjectId: SUBJECT_ID,
          title: "Chemistry Grand Test",
          examinationType: "grand_test",
          classId: CLASS_ID,
          totalMarks: 100,
          examDate: "2026-11-22",
        },
        TEACHER_USER_ID,
      );

      await service.enterMarksBatch(
        {
          examinationId: exam.id,
          marks: [{ studentId: STUDENT_1, status: "submitted", obtainedMarks: 45 }],
        },
        TEACHER_USER_ID,
      );

      const mark = await store.getMarkByStudent(exam.id, STUDENT_1);
      expect(mark).toBeDefined();

      const correction = await service.recordCorrection(
        {
          examinationMarkId: mark!.id,
          correctedMarks: 52,
          reason: "Marking error on Question 4",
        },
        TEACHER_USER_ID,
      );

      expect(correction.previousMarks).toBe(45);
      expect(correction.correctedMarks).toBe(52);

      const updatedMark = await store.getMark(mark!.id);
      expect(updatedMark?.obtainedMarks).toBe(52);
    });
  });

  describe("publishing examination results", () => {
    it("publishes examination when marks are complete", async () => {
      const exam = await service.createExamination(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: ACADEMIC_SESSION_ID,
          subjectId: SUBJECT_ID,
          title: "Biology Midterm",
          examinationType: "midterm",
          classId: CLASS_ID,
          totalMarks: 75,
          examDate: "2026-11-25",
        },
        TEACHER_USER_ID,
      );

      await service.enterMarksBatch(
        {
          examinationId: exam.id,
          marks: [{ studentId: STUDENT_1, status: "submitted", obtainedMarks: 60 }],
        },
        TEACHER_USER_ID,
      );

      const published = await service.publishExamination({ examinationId: exam.id }, TEACHER_USER_ID);
      expect(published.status).toBe("published");
      expect(published.publishedAt).toBeDefined();
    });
  });
});