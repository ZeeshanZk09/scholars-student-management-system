import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { DiaryService } from "./diary-service";
import { InMemoryDiaryStore, InMemoryNotificationDispatcher } from "./testing/fakes";

describe("DiaryService application service", () => {
  let store: InMemoryDiaryStore;
  let dispatcher: InMemoryNotificationDispatcher;
  let service: DiaryService;

  const teacherUserId = "11111111-1111-4111-8111-111111111110";
  const institutionId = "11111111-1111-4111-8111-111111111111";
  const academicSessionId = "22222222-2222-4222-8222-222222222222";
  const subjectId = "33333333-3333-4333-8333-333333333333";
  const classId = "44444444-4444-4444-8444-444444444444";
  const sectionId = "55555555-5555-4555-8555-555555555555";
  const student1Id = "66666666-6666-4666-8666-666666666661";
  const student2Id = "66666666-6666-4666-8666-666666666662";
  const guardian1Id = "77777777-7777-4777-8777-777777777771";
  const guardian2Id = "77777777-7777-4777-8777-777777777772";

  beforeEach(() => {
    store = new InMemoryDiaryStore();
    dispatcher = new InMemoryNotificationDispatcher();
    service = new DiaryService(store, dispatcher);

    // Setup default roster
    store.rosterCandidates = [
      {
        studentId: student1Id,
        guardianUserId: guardian1Id,
        classId,
        sectionId,
        studentName: "Ali Khan",
        rollNumber: "101",
      },
      {
        studentId: student2Id,
        guardianUserId: guardian2Id,
        classId,
        sectionId,
        studentName: "Fatima Noor",
        rollNumber: "102",
      },
    ];
  });

  describe("createDiaryEntry", () => {
    it("creates a draft diary entry successfully", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Math Chapter 4 - Quadratic Equations",
          content: "Complete exercises 4.1 questions 1 to 5 in workbook.",
          classId,
          sectionId,
        },
        teacherUserId,
      );

      expect(diary).toBeDefined();
      expect(diary.id).toBeDefined();
      expect(diary.status).toBe("draft");
      expect(diary.title).toBe("Math Chapter 4 - Quadratic Equations");
      expect(diary.assignedAt).toBeNull();
    });

    it("creates diary entry with initial attachments", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Physics Lab Preparation",
          content: "Review vernier caliper experiment.",
          classId,
          sectionId,
          attachments: [
            {
              label: "Lab Manual PDF",
              attachmentType: "worksheet",
              storageKey: "files/physics/lab1.pdf",
              sizeBytes: 1024 * 200,
              uploadedByUserId: teacherUserId,
            },
          ],
        },
        teacherUserId,
      );

      const attachments = await store.listAttachments(diary.id);
      expect(attachments).toHaveLength(1);
      expect(attachments[0]?.label).toBe("Lab Manual PDF");
    });

    it("validates scope: requires at least class or section", async () => {
      await expect(
        service.createDiaryEntry(
          {
            institutionId,
            academicSessionId,
            subjectId,
            diaryDate: "2026-10-30",
            title: "General Reading",
            content: "Read news.",
          },
          teacherUserId,
        ),
      ).rejects.toThrow();
    });

    it("rejects invalid calendar dates with friendly error", async () => {
      await expect(
        service.createDiaryEntry(
          {
            institutionId,
            academicSessionId,
            subjectId,
            diaryDate: "2026-02-31",
            title: "Invalid Date Entry",
            content: "Testing calendar bounds.",
            classId,
          },
          teacherUserId,
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("assignDiary and homework rules", () => {
    it("assigns homework to all enrolled students and queues personalized parent notifications", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Chemistry Homework",
          content: "Solve balance equation problems on page 78.",
          classId,
          sectionId,
        },
        teacherUserId,
      );

      const assignResult = await service.assignDiary({
        diaryId: diary.id,
        assignedByTeacherUserId: teacherUserId,
      });

      expect(assignResult.assignedCount).toBe(2);
      expect(assignResult.notificationsQueued).toBe(2);

      // Verify diary status transitioned to 'assigned'
      const updated = await store.getDiary(diary.id);
      expect(updated?.status).toBe("assigned");
      expect(updated?.assignedAt).toBeDefined();

      // Verify personalized emails queued per (guardian, student)
      expect(dispatcher.queuedNotifications).toHaveLength(2);
      expect(dispatcher.queuedNotifications[0]?.guardianUserId).toBe(guardian1Id);
      expect(dispatcher.queuedNotifications[0]?.studentId).toBe(student1Id);
      expect(dispatcher.queuedNotifications[0]?.idempotencyKey).toContain(diary.id);
      expect(dispatcher.queuedNotifications[1]?.guardianUserId).toBe(guardian2Id);
    });

    it("refuses assigning homework to an empty student roster", async () => {
      store.rosterCandidates = []; // no students enrolled

      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "English Essay",
          content: "Write an essay.",
          classId,
        },
        teacherUserId,
      );

      await expect(
        service.assignDiary({
          diaryId: diary.id,
          assignedByTeacherUserId: teacherUserId,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("refuses re-assigning or reverting an assigned diary", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "History Reading",
          content: "Read Chapter 1.",
          classId,
        },
        teacherUserId,
      );

      await service.assignDiary({
        diaryId: diary.id,
        assignedByTeacherUserId: teacherUserId,
      });

      // Trying to revert to draft
      await expect(
        service.updateDiaryEntry(diary.id, { status: "draft" }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("closeDiary", () => {
    it("closes an assigned diary entry, locking it as history", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Biology Diagrams",
          content: "Draw digestive system diagram.",
          classId,
        },
        teacherUserId,
      );

      await service.assignDiary({
        diaryId: diary.id,
        assignedByTeacherUserId: teacherUserId,
      });

      const closed = await service.closeDiary(diary.id);
      expect(closed.status).toBe("closed");
      expect(closed.closedAt).toBeDefined();

      // Verify closed entries cannot be modified
      await expect(
        service.updateDiaryEntry(diary.id, { title: "New Title" }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("attachments", () => {
    it("allows adding external link attachment", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Computer Science Programming",
          content: "Practice loops on online portal.",
          classId,
        },
        teacherUserId,
      );

      const attachment = await service.addAttachment({
        diaryId: diary.id,
        label: "Python Exercises",
        attachmentType: "link",
        externalUrl: "https://python.org/doc",
        uploadedByUserId: teacherUserId,
      });

      expect(attachment.id).toBeDefined();
      expect(attachment.externalUrl).toBe("https://python.org/doc");
      expect(attachment.storageKey).toBeNull();
    });

    it("rejects attachments when diary is closed", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Math",
          content: "Review notes.",
          classId,
        },
        teacherUserId,
      );

      await service.closeDiary(diary.id);

      await expect(
        service.addAttachment({
          diaryId: diary.id,
          label: "Late Worksheet",
          attachmentType: "worksheet",
          storageKey: "files/late.pdf",
          sizeBytes: 1000,
          uploadedByUserId: teacherUserId,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("parent read receipts and acknowledgements", () => {
    it("records passive read receipt for student and guardian", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Urdu Homework",
          content: "Writing practice.",
          classId,
        },
        teacherUserId,
      );

      const receipt = await service.recordReadReceipt({
        diaryId: diary.id,
        viewerKind: "guardian",
        viewerId: guardian1Id,
        via: "email_link",
      });

      expect(receipt.id).toBeDefined();
      expect(receipt.viewerKind).toBe("guardian");
      expect(receipt.via).toBe("email_link");
    });

    it("records parent acknowledgement when authorized", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Geography Map",
          content: "Color South Asian countries on outline map.",
          classId,
        },
        teacherUserId,
      );

      await service.assignDiary({
        diaryId: diary.id,
        assignedByTeacherUserId: teacherUserId,
      });

      const assignment = Array.from(store.assignments.values()).find(
        (a) => a.studentId === student1Id,
      );
      expect(assignment).toBeDefined();

      const ack = await service.acknowledgeDiaryAssignment({
        diaryAssignmentId: assignment!.id,
        acknowledgedByUserId: guardian1Id,
      });

      expect(ack.acknowledgedAt).toBeDefined();
      expect(ack.acknowledgedByUserId).toBe(guardian1Id);
    });

    it("refuses parent acknowledgement from unauthorized user", async () => {
      const diary = await service.createDiaryEntry(
        {
          institutionId,
          academicSessionId,
          subjectId,
          diaryDate: "2026-10-30",
          title: "Art Project",
          content: "Bring watercolor palette tomorrow.",
          classId,
        },
        teacherUserId,
      );

      await service.assignDiary({
        diaryId: diary.id,
        assignedByTeacherUserId: teacherUserId,
      });

      const assignment = Array.from(store.assignments.values()).find(
        (a) => a.studentId === student1Id,
      );
      expect(assignment).toBeDefined();

      // guardian2 attempting to acknowledge student1's assignment
      await expect(
        service.acknowledgeDiaryAssignment({
          diaryAssignmentId: assignment!.id,
          acknowledgedByUserId: guardian2Id,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("throws NotFoundError when acknowledging non-existent assignment", async () => {
      await expect(
        service.acknowledgeDiaryAssignment({
          diaryAssignmentId: "00000000-0000-4000-8000-000000000999",
          acknowledgedByUserId: guardian1Id,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("syllabus coverage tracking", () => {
    it("creates syllabus topics and marks them covered with pace calculation", async () => {
      // 1. Add syllabus topics
      const topic1 = await service.createSyllabusTopic({
        subjectId,
        classId,
        chapterNumber: 1,
        chapterTitle: "Number Systems",
        topicNumber: 1,
        topicTitle: "Rational and Irrational Numbers",
        estimatedPeriods: 2,
      });

      const topic2 = await service.createSyllabusTopic({
        subjectId,
        classId,
        chapterNumber: 1,
        chapterTitle: "Number Systems",
        topicNumber: 2,
        topicTitle: "Real Numbers and Decimals",
        estimatedPeriods: 2,
      });

      expect(topic1.status).toBe("pending");
      expect(topic2.status).toBe("pending");

      // 2. Mark topic 1 as covered in diary
      const coveredTopic = await service.markSyllabusTopicCovered({
        topicId: topic1.id,
        coveredDate: "2026-10-30",
        coveredByTeacherUserId: teacherUserId,
        notes: "Completed all textbook illustrations and sample problems.",
      });

      expect(coveredTopic.status).toBe("covered");
      expect(coveredTopic.coveredDate).toBe("2026-10-30");

      // 3. Generate syllabus coverage report
      const report = await service.getSyllabusCoverageReport({
        subjectId,
        classId,
        expectedProgressRatio: 0.50, // 50% expected
      });

      expect(report.summary.totalTopics).toBe(2);
      expect(report.summary.coveredTopics).toBe(1);
      expect(report.summary.percentageCovered).toBe(50);
      expect(report.summary.pace).toBe("on_track");
      expect(report.chapterGroups).toHaveLength(1);
      expect(report.chapterGroups[0]?.percentageCovered).toBe(50);
    });
  });

  describe("guardian notification preferences", () => {
    it("sets and persists notification preferences with quiet hours", async () => {
      const pref = await service.setNotificationPreference({
        guardianUserId: guardian1Id,
        emailEnabled: true,
        diaryFrequency: "daily",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      });

      expect(pref.guardianUserId).toBe(guardian1Id);
      expect(pref.quietHoursStart).toBe("22:00");
      expect(pref.quietHoursEnd).toBe("07:00");
    });
  });
});
