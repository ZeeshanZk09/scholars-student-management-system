import { describe, expect, it } from "vitest";

import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  assertAcknowledgementPair,
  assertAssignmentDeadline,
  assertAssignmentPair,
  assertCanCoverSyllabusTopic,
  assertCanModifyDiary,
  assertCanTransitionDiaryStatus,
  assertClosedPair,
  assertDiaryContent,
  assertDiaryScope,
  assertHomeworkAssignmentTarget,
  assertParentCanAcknowledge,
  assertQuietHoursPair,
  assertReadVia,
  assertReadViewer,
  assertValidAttachment,
  assertValidDiaryDate,
  assertValidSyllabusTopic,
  calculateReadMetrics,
  calculateSyllabusCoverage,
  determineReadStatus,
  formatAttachmentSize,
  formatDiaryDisplayDate,
  generateNotificationIdempotencyKey,
  getAttachmentTypeLabel,
  groupSyllabusByChapter,
  isAssignmentPastDue,
  isWithinQuietHours,
  MAX_ATTACHMENT_SIZE_BYTES,
  type SyllabusTopic,
} from "./diary-rules";

describe("diary domain rules", () => {
  describe("assertValidDiaryDate", () => {
    it("accepts a well-formatted calendar date", () => {
      expect(() => assertValidDiaryDate("2026-10-30")).not.toThrow();
    });

    it("rejects non-date formats", () => {
      expect(() => assertValidDiaryDate("30-10-2026")).toThrow(ValidationError);
      expect(() => assertValidDiaryDate("2026/10/30")).toThrow(ValidationError);
      expect(() => assertValidDiaryDate("invalid")).toThrow(ValidationError);
    });

    it("rejects impossible calendar dates", () => {
      expect(() => assertValidDiaryDate("2026-02-30")).toThrow(ValidationError);
      expect(() => assertValidDiaryDate("2026-04-31")).toThrow(ValidationError);
      expect(() => assertValidDiaryDate("2026-13-01")).toThrow(ValidationError);
    });

    it("enforces past boundary when maxPastDays is defined", () => {
      const fixedNow = new Date("2026-10-30T12:00:00Z");
      // 10 days in past is fine with maxPastDays: 30
      expect(() =>
        assertValidDiaryDate("2026-10-20", { maxPastDays: 30, now: fixedNow }),
      ).not.toThrow();

      // 40 days in past throws BusinessRuleError
      expect(() =>
        assertValidDiaryDate("2026-09-15", { maxPastDays: 30, now: fixedNow }),
      ).toThrow(BusinessRuleError);
    });

    it("enforces future boundary when maxFutureDays is defined", () => {
      const fixedNow = new Date("2026-10-30T12:00:00Z");
      // 5 days ahead is fine
      expect(() =>
        assertValidDiaryDate("2026-11-04", { maxFutureDays: 14, now: fixedNow }),
      ).not.toThrow();

      // 20 days ahead throws BusinessRuleError
      expect(() =>
        assertValidDiaryDate("2026-11-25", { maxFutureDays: 14, now: fixedNow }),
      ).toThrow(BusinessRuleError);
    });
  });

  describe("assertAssignmentDeadline and isAssignmentPastDue", () => {
    it("accepts deadline on or after diary date", () => {
      expect(() => assertAssignmentDeadline("2026-10-30", "2026-10-30T23:59:59Z")).not.toThrow();
      expect(() => assertAssignmentDeadline("2026-10-30", new Date("2026-11-01T08:00:00Z"))).not.toThrow();
    });

    it("refuses deadline earlier than diary date", () => {
      expect(() => assertAssignmentDeadline("2026-10-30", "2026-10-29T23:59:59Z")).toThrow(
        BusinessRuleError,
      );
    });

    it("refuses invalid deadline timestamp", () => {
      expect(() => assertAssignmentDeadline("2026-10-30", "not-a-date")).toThrow(ValidationError);
    });

    it("correctly identifies overdue assignments", () => {
      const now = new Date("2026-10-31T12:00:00Z");
      expect(isAssignmentPastDue("2026-10-30T00:00:00Z", now)).toBe(true);
      expect(isAssignmentPastDue("2026-11-05T00:00:00Z", now)).toBe(false);
    });
  });

  describe("assertDiaryScope", () => {
    it("accepts when classId is supplied", () => {
      expect(() => assertDiaryScope({ classId: "class-1" })).not.toThrow();
    });

    it("accepts when sectionId is supplied", () => {
      expect(() => assertDiaryScope({ sectionId: "sec-1" })).not.toThrow();
    });

    it("accepts when both are supplied", () => {
      expect(() => assertDiaryScope({ classId: "class-1", sectionId: "sec-1" })).not.toThrow();
    });

    it("refuses when neither is supplied", () => {
      expect(() => assertDiaryScope({})).toThrow(ValidationError);
      expect(() => assertDiaryScope({ classId: "", sectionId: "  " })).toThrow(ValidationError);
    });
  });

  describe("assertDiaryContent", () => {
    it("accepts valid title and content", () => {
      expect(() =>
        assertDiaryContent({
          title: "Math Chapter 4 Exercises",
          content: "Solve problems 1 through 10 on page 42.",
        }),
      ).not.toThrow();
    });

    it("rejects empty title", () => {
      expect(() => assertDiaryContent({ title: "", content: "Homework" })).toThrow(
        ValidationError,
      );
      expect(() => assertDiaryContent({ title: "   ", content: "Homework" })).toThrow(
        ValidationError,
      );
    });

    it("rejects title exceeding 200 characters", () => {
      expect(() =>
        assertDiaryContent({ title: "A".repeat(201), content: "Homework" }),
      ).toThrow(ValidationError);
    });

    it("rejects empty content", () => {
      expect(() => assertDiaryContent({ title: "Math", content: "   " })).toThrow(
        ValidationError,
      );
    });
  });

  describe("status state machine and edit permissions", () => {
    it("allows standard forward transitions", () => {
      expect(() => assertCanTransitionDiaryStatus("draft", "draft")).not.toThrow();
      expect(() => assertCanTransitionDiaryStatus("draft", "assigned")).not.toThrow();
      expect(() => assertCanTransitionDiaryStatus("draft", "closed")).not.toThrow();
      expect(() => assertCanTransitionDiaryStatus("assigned", "assigned")).not.toThrow();
      expect(() => assertCanTransitionDiaryStatus("assigned", "closed")).not.toThrow();
    });

    it("refuses reverting assigned back to draft", () => {
      expect(() => assertCanTransitionDiaryStatus("assigned", "draft")).toThrow(
        BusinessRuleError,
      );
    });

    it("refuses mutating or transitioning closed entries", () => {
      expect(() => assertCanTransitionDiaryStatus("closed", "draft")).toThrow(
        BusinessRuleError,
      );
      expect(() => assertCanTransitionDiaryStatus("closed", "assigned")).toThrow(
        BusinessRuleError,
      );
      expect(() => assertCanModifyDiary("closed")).toThrow(BusinessRuleError);
      expect(() => assertCanModifyDiary("draft")).not.toThrow();
      expect(() => assertCanModifyDiary("assigned")).not.toThrow();
    });

    it("enforces assignment pair invariant", () => {
      expect(() => assertAssignmentPair("draft", null, null)).not.toThrow();
      expect(() => assertAssignmentPair("assigned", new Date(), "teacher-1")).not.toThrow();
      expect(() => assertAssignmentPair("assigned", null, "teacher-1")).toThrow(
        BusinessRuleError,
      );
      expect(() => assertAssignmentPair("assigned", new Date(), null)).toThrow(
        BusinessRuleError,
      );
    });

    it("enforces closed pair invariant", () => {
      expect(() => assertClosedPair("draft", null)).not.toThrow();
      expect(() => assertClosedPair("assigned", null)).not.toThrow();
      expect(() => assertClosedPair("closed", new Date())).not.toThrow();
      expect(() => assertClosedPair("closed", null)).toThrow(BusinessRuleError);
    });
  });

  describe("acknowledgement and read receipts", () => {
    it("enforces acknowledgement pair invariant", () => {
      expect(() => assertAcknowledgementPair(null, null)).not.toThrow();
      expect(() => assertAcknowledgementPair(new Date(), "user-1")).not.toThrow();
      expect(() => assertAcknowledgementPair(new Date(), null)).toThrow(BusinessRuleError);
      expect(() => assertAcknowledgementPair(null, "user-1")).toThrow(BusinessRuleError);
    });

    it("validates viewer kind", () => {
      expect(() => assertReadViewer("student", "stud-1")).not.toThrow();
      expect(() => assertReadViewer("guardian", "guard-1")).not.toThrow();
      expect(() => assertReadViewer("admin", "admin-1")).toThrow(ValidationError);
      expect(() => assertReadViewer("student", "")).toThrow(ValidationError);
    });

    it("validates read via channel", () => {
      expect(() => assertReadVia("portal")).not.toThrow();
      expect(() => assertReadVia("email_link")).not.toThrow();
      expect(() => assertReadVia("mobile_app")).not.toThrow();
      expect(() => assertReadVia("sms")).toThrow(ValidationError);
    });

    it("calculates read metrics accurately", () => {
      const metrics = calculateReadMetrics(100, 75, 50);
      expect(metrics.total).toBe(100);
      expect(metrics.readCount).toBe(75);
      expect(metrics.acknowledgedCount).toBe(50);
      expect(metrics.readRate).toBe(75);
      expect(metrics.ackRate).toBe(50);

      // handles zero totals
      const zero = calculateReadMetrics(0, 0, 0);
      expect(zero.readRate).toBe(0);
      expect(zero.ackRate).toBe(0);
    });

    it("determines read status badge tone", () => {
      expect(determineReadStatus(false, null).status).toBe("unread");
      expect(determineReadStatus(false, null).tone).toBe("neutral");

      expect(determineReadStatus(true, null).status).toBe("read");
      expect(determineReadStatus(true, null).tone).toBe("info");

      expect(determineReadStatus(true, new Date()).status).toBe("acknowledged");
      expect(determineReadStatus(true, new Date()).tone).toBe("success");
    });
  });

  describe("attachments validation", () => {
    it("accepts a valid file worksheet attachment", () => {
      expect(() =>
        assertValidAttachment({
          label: "Algebra Chapter 2",
          attachmentType: "worksheet",
          storageKey: "uploads/worksheets/alg2.pdf",
          sizeBytes: 1024 * 500,
        }),
      ).not.toThrow();
    });

    it("accepts a valid external link attachment", () => {
      expect(() =>
        assertValidAttachment({
          label: "Khan Academy Reference",
          attachmentType: "link",
          externalUrl: "https://khanacademy.org/math/algebra",
        }),
      ).not.toThrow();
    });

    it("refuses attachment with neither file key nor link", () => {
      expect(() =>
        assertValidAttachment({
          label: "Missing source",
          attachmentType: "worksheet",
        }),
      ).toThrow(ValidationError);
    });

    it("refuses attachment with both file key and link", () => {
      expect(() =>
        assertValidAttachment({
          label: "Both sources",
          attachmentType: "worksheet",
          storageKey: "key.pdf",
          externalUrl: "https://example.com/file.pdf",
        }),
      ).toThrow(ValidationError);
    });

    it("refuses link with non-http(s) schema", () => {
      expect(() =>
        assertValidAttachment({
          label: "Bad link",
          attachmentType: "link",
          externalUrl: "ftp://example.com/file",
        }),
      ).toThrow(ValidationError);
    });

    it("refuses non-link attachment without storage key", () => {
      expect(() =>
        assertValidAttachment({
          label: "Handout link mismatch",
          attachmentType: "handout",
          externalUrl: "https://example.com/doc",
        }),
      ).toThrow(ValidationError);
    });

    it("refuses zero or negative size bytes", () => {
      expect(() =>
        assertValidAttachment({
          label: "Zero size",
          attachmentType: "handout",
          storageKey: "key.pdf",
          sizeBytes: 0,
        }),
      ).toThrow(ValidationError);
    });

    it("refuses file exceeding max size limit", () => {
      expect(() =>
        assertValidAttachment({
          label: "Huge file",
          attachmentType: "handout",
          storageKey: "large.pdf",
          sizeBytes: MAX_ATTACHMENT_SIZE_BYTES + 1,
        }),
      ).toThrow(BusinessRuleError);
    });
  });

  describe("notification idempotency and quiet hours", () => {
    it("generates stable idempotency key", () => {
      const key = generateNotificationIdempotencyKey("asgn-123", "guard-456");
      expect(key).toBe("diary-notif:asgn-123:guard-456");
    });

    it("enforces quiet hours pair constraints", () => {
      expect(() => assertQuietHoursPair(null, null)).not.toThrow();
      expect(() => assertQuietHoursPair("21:00", "07:00")).not.toThrow();
      expect(() => assertQuietHoursPair("21:00", null)).toThrow(ValidationError);
      expect(() => assertQuietHoursPair(null, "07:00")).toThrow(ValidationError);
      expect(() => assertQuietHoursPair("9pm", "7am")).toThrow(ValidationError);
    });

    it("evaluates daytime and overnight quiet hours correctly", () => {
      // Daytime window: 13:00 to 15:00
      expect(isWithinQuietHours("14:30", "13:00", "15:00")).toBe(true);
      expect(isWithinQuietHours("12:59", "13:00", "15:00")).toBe(false);
      expect(isWithinQuietHours("15:00", "13:00", "15:00")).toBe(false);

      // Overnight window: 22:00 to 07:00
      expect(isWithinQuietHours("23:15", "22:00", "07:00")).toBe(true);
      expect(isWithinQuietHours("03:30", "22:00", "07:00")).toBe(true);
      expect(isWithinQuietHours("06:59", "22:00", "07:00")).toBe(true);
      expect(isWithinQuietHours("07:00", "22:00", "07:00")).toBe(false);
      expect(isWithinQuietHours("12:00", "22:00", "07:00")).toBe(false);
    });
  });

  describe("homework assignment targets and parent authorization", () => {
    it("enforces non-empty student roster for homework assignment", () => {
      expect(() => assertHomeworkAssignmentTarget(["student-1", "student-2"])).not.toThrow();
      expect(() => assertHomeworkAssignmentTarget([])).toThrow(BusinessRuleError);
    });

    it("authorizes parent when user matches linked guardian", () => {
      expect(() => assertParentCanAcknowledge("guardian-1", "guardian-1")).not.toThrow();
    });

    it("refuses acknowledgement when guardian is missing or unlinked", () => {
      expect(() => assertParentCanAcknowledge(null, "guardian-1")).toThrow(BusinessRuleError);
      expect(() => assertParentCanAcknowledge("", "guardian-1")).toThrow(BusinessRuleError);
    });

    it("refuses acknowledgement when actor is not the linked guardian", () => {
      expect(() => assertParentCanAcknowledge("guardian-1", "guardian-2")).toThrow(
        BusinessRuleError,
      );
    });
  });

  describe("syllabus coverage tracking", () => {
    const sampleTopics: readonly SyllabusTopic[] = [
      {
        id: "top-1",
        subjectId: "subj-1",
        chapterNumber: 1,
        chapterTitle: "Quadratic Equations",
        topicNumber: 1,
        topicTitle: "Standard Form and Factorization",
        estimatedPeriods: 2,
        status: "covered",
        coveredDate: "2026-10-25",
        coveredByTeacherUserId: "teacher-1",
      },
      {
        id: "top-2",
        subjectId: "subj-1",
        chapterNumber: 1,
        chapterTitle: "Quadratic Equations",
        topicNumber: 2,
        topicTitle: "Completing the Square",
        estimatedPeriods: 3,
        status: "covered",
        coveredDate: "2026-10-28",
        coveredByTeacherUserId: "teacher-1",
      },
      {
        id: "top-3",
        subjectId: "subj-1",
        chapterNumber: 2,
        chapterTitle: "Matrices and Determinants",
        topicNumber: 1,
        topicTitle: "Matrix Addition and Multiplication",
        estimatedPeriods: 3,
        status: "in_progress",
      },
      {
        id: "top-4",
        subjectId: "subj-1",
        chapterNumber: 2,
        chapterTitle: "Matrices and Determinants",
        topicNumber: 2,
        topicTitle: "Cramer's Rule",
        estimatedPeriods: 2,
        status: "pending",
      },
    ];

    it("validates valid syllabus topic input", () => {
      expect(() =>
        assertValidSyllabusTopic({
          chapterNumber: 1,
          chapterTitle: "Cell Biology",
          topicNumber: 1,
          topicTitle: "Plant and Animal Cells",
          estimatedPeriods: 2,
        }),
      ).not.toThrow();
    });

    it("rejects invalid syllabus topic values", () => {
      expect(() =>
        assertValidSyllabusTopic({
          chapterNumber: 0,
          chapterTitle: "Valid",
          topicNumber: 1,
          topicTitle: "Valid",
          estimatedPeriods: 1,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        assertValidSyllabusTopic({
          chapterNumber: 1,
          chapterTitle: "",
          topicNumber: 1,
          topicTitle: "Valid",
          estimatedPeriods: 1,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        assertValidSyllabusTopic({
          chapterNumber: 1,
          chapterTitle: "Valid",
          topicNumber: -1,
          topicTitle: "Valid",
          estimatedPeriods: 1,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        assertValidSyllabusTopic({
          chapterNumber: 1,
          chapterTitle: "Valid",
          topicNumber: 1,
          topicTitle: "",
          estimatedPeriods: 1,
        }),
      ).toThrow(ValidationError);

      expect(() =>
        assertValidSyllabusTopic({
          chapterNumber: 1,
          chapterTitle: "Valid",
          topicNumber: 1,
          topicTitle: "Valid",
          estimatedPeriods: 0,
        }),
      ).toThrow(ValidationError);
    });

    it("validates topic completion preconditions", () => {
      const pendingTopic: SyllabusTopic = {
        id: "top-10",
        subjectId: "subj-1",
        chapterNumber: 1,
        chapterTitle: "Kinematics",
        topicNumber: 1,
        topicTitle: "Velocity and Acceleration",
        estimatedPeriods: 2,
        status: "pending",
      };

      expect(() =>
        assertCanCoverSyllabusTopic(pendingTopic, "2026-10-30", "teacher-1"),
      ).not.toThrow();

      expect(() =>
        assertCanCoverSyllabusTopic(pendingTopic, "bad-date", "teacher-1"),
      ).toThrow(ValidationError);

      expect(() =>
        assertCanCoverSyllabusTopic(pendingTopic, "2026-10-30", ""),
      ).toThrow(ValidationError);
    });

    it("refuses marking already covered topic on a conflicting date", () => {
      const alreadyCovered: SyllabusTopic = {
        id: "top-11",
        subjectId: "subj-1",
        chapterNumber: 1,
        chapterTitle: "Kinematics",
        topicNumber: 1,
        topicTitle: "Speed vs Velocity",
        estimatedPeriods: 2,
        status: "covered",
        coveredDate: "2026-10-20",
        coveredByTeacherUserId: "teacher-1",
      };

      expect(() =>
        assertCanCoverSyllabusTopic(alreadyCovered, "2026-10-25", "teacher-1"),
      ).toThrow(BusinessRuleError);
      // Same date is fine
      expect(() =>
        assertCanCoverSyllabusTopic(alreadyCovered, "2026-10-20", "teacher-1"),
      ).not.toThrow();
    });

    it("calculates syllabus coverage percentage and pace", () => {
      // 2 covered out of 4 = 50%
      const summary = calculateSyllabusCoverage(sampleTopics, 0.50);
      expect(summary.totalTopics).toBe(4);
      expect(summary.coveredTopics).toBe(2);
      expect(summary.inProgressTopics).toBe(1);
      expect(summary.pendingTopics).toBe(1);
      expect(summary.percentageCovered).toBe(50);
      expect(summary.pace).toBe("on_track");

      // Behind schedule test (expected 80%, covered 50%)
      const behind = calculateSyllabusCoverage(sampleTopics, 0.80);
      expect(behind.pace).toBe("behind");

      // Ahead of schedule test (expected 20%, covered 50%)
      const ahead = calculateSyllabusCoverage(sampleTopics, 0.20);
      expect(ahead.pace).toBe("ahead");
    });

    it("handles empty syllabus topics gracefully", () => {
      const emptySummary = calculateSyllabusCoverage([]);
      expect(emptySummary.totalTopics).toBe(0);
      expect(emptySummary.percentageCovered).toBe(0);
      expect(emptySummary.pace).toBe("on_track");
    });

    it("groups topics by chapter with accurate chapter coverage", () => {
      const groups = groupSyllabusByChapter(sampleTopics);
      expect(groups).toHaveLength(2);

      const ch1 = groups.find((g) => g.chapterNumber === 1);
      expect(ch1).toBeDefined();
      expect(ch1!.chapterTitle).toBe("Quadratic Equations");
      expect(ch1!.totalTopics).toBe(2);
      expect(ch1!.coveredTopics).toBe(2);
      expect(ch1!.percentageCovered).toBe(100);

      const ch2 = groups.find((g) => g.chapterNumber === 2);
      expect(ch2).toBeDefined();
      expect(ch2!.chapterTitle).toBe("Matrices and Determinants");
      expect(ch2!.totalTopics).toBe(2);
      expect(ch2!.coveredTopics).toBe(0);
      expect(ch2!.percentageCovered).toBe(0);
    });
  });

  describe("human-friendly formatting helpers", () => {
    it("formats diary display dates cleanly", () => {
      const formatted = formatDiaryDisplayDate("2026-10-30");
      expect(formatted).toContain("October");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("30");
    });

    it("formats attachment sizes nicely", () => {
      expect(formatAttachmentSize(0)).toBe("0 B");
      expect(formatAttachmentSize(500)).toBe("500 B");
      expect(formatAttachmentSize(1024 * 350)).toBe("350 KB");
      expect(formatAttachmentSize(1024 * 1024 * 3.5)).toBe("3.5 MB");
    });

    it("provides human-readable labels for attachment types", () => {
      expect(getAttachmentTypeLabel("worksheet")).toBe("Worksheet");
      expect(getAttachmentTypeLabel("handout")).toBe("Handout");
      expect(getAttachmentTypeLabel("link")).toBe("Web Resource");
      expect(getAttachmentTypeLabel("image")).toBe("Image");
      expect(getAttachmentTypeLabel("other")).toBe("Reference Document");
    });
  });
});
