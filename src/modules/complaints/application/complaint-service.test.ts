/**
 * Tests for ComplaintService (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 */

import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { ComplaintService } from "./complaint-service";
import { FakeComplaintStore } from "./testing/fakes";

const INSTITUTION_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000002";
const STUDENT_ID = "00000000-0000-4000-8000-000000000003";
const TEACHER_USER_ID = "00000000-0000-4000-8000-000000000004";
const INVESTIGATOR_USER_ID = "00000000-0000-4000-8000-000000000005";
const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000006";

describe("ComplaintService", () => {
  let store: FakeComplaintStore;
  let service: ComplaintService;

  beforeEach(() => {
    store = new FakeComplaintStore();
    service = new ComplaintService(store);
  });

  describe("Submitting complaints", () => {
    it("submits a well-formed complaint with open status", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Fighting in hallway",
          reason: "Physical Altercation",
          description: "Student engaged in a fight during recess, causing minor property damage.",
          reportedDate: "2026-10-30",
          severity: "high",
        },
        TEACHER_USER_ID,
      );

      expect(created.id).toBeDefined();
      expect(created.status).toBe("open");
      expect(created.severity).toBe("high");
      expect(created.reportedByUserId).toBe(TEACHER_USER_ID);

      const actions = await store.listActions(created.id, true);
      expect(actions).toHaveLength(1);
      expect(actions[0]?.actionType).toBe("created");
    });

    it("rejects invalid input schema", async () => {
      await expect(
        service.submitComplaint(
          {
            institutionId: "not-a-uuid",
            academicSessionId: SESSION_ID,
            studentId: STUDENT_ID,
            title: "Bad",
            reason: "Reason",
            description: "Desc",
            reportedDate: "2026-10-30",
          },
          TEACHER_USER_ID,
        ),
      ).rejects.toThrow();
    });
  });

  describe("Assigning complaints", () => {
    it("assigns an open complaint and moves it to under_review", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Vandalism in chemistry lab",
          reason: "Property Damage",
          description: "Chemical equipment was deliberately damaged after practical session.",
          reportedDate: "2026-10-30",
          severity: "critical",
        },
        TEACHER_USER_ID,
      );

      const assigned = await service.assignComplaint(
        {
          complaintId: created.id,
          assignedToUserId: INVESTIGATOR_USER_ID,
        },
        ADMIN_USER_ID,
      );

      expect(assigned.assignedToUserId).toBe(INVESTIGATOR_USER_ID);
      expect(assigned.status).toBe("under_review");

      const actions = await store.listActions(created.id, true);
      expect(actions.some((a) => a.actionType === "assigned")).toBe(true);
    });

    it("throws NotFoundError when assigning non-existent complaint", async () => {
      await expect(
        service.assignComplaint(
          {
            complaintId: "00000000-0000-4000-8000-999999999999",
            assignedToUserId: INVESTIGATOR_USER_ID,
          },
          ADMIN_USER_ID,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("Resolving and Dismissing complaints", () => {
    it("resolves a complaint with actionTaken", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Homework non-compliance",
          reason: "Academic Misconduct",
          description: "Student repeatedly copied answers from other students.",
          reportedDate: "2026-10-29",
          severity: "low",
        },
        TEACHER_USER_ID,
      );

      const resolved = await service.resolveComplaint(
        {
          complaintId: created.id,
          actionTaken: "Student completed replacement assignment under supervision.",
          details: "Counselled regarding academic honesty.",
        },
        TEACHER_USER_ID,
      );

      expect(resolved.status).toBe("resolved");
      expect(resolved.actionTaken).toContain("replacement assignment");
      expect(resolved.resolvedByUserId).toBe(TEACHER_USER_ID);
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
    });

    it("dismisses an unjustified complaint", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Accidental bump",
          reason: "Disruption",
          description: "Student bumped into desk causing noise.",
          reportedDate: "2026-10-29",
          severity: "low",
        },
        TEACHER_USER_ID,
      );

      const dismissed = await service.dismissComplaint(
        {
          complaintId: created.id,
          dismissalReason: "Purely accidental, no disciplinary action warranted.",
        },
        INVESTIGATOR_USER_ID,
      );

      expect(dismissed.status).toBe("dismissed");
      expect(dismissed.resolvedByUserId).toBe(INVESTIGATOR_USER_ID);
    });

    it("rejects resolving an already resolved complaint directly without reopening", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Dispute",
          reason: "Dispute",
          description: "Dispute between students.",
          reportedDate: "2026-10-29",
          severity: "low",
        },
        TEACHER_USER_ID,
      );

      await service.resolveComplaint(
        {
          complaintId: created.id,
          actionTaken: "Resolved informally.",
        },
        ADMIN_USER_ID,
      );

      await expect(
        service.resolveComplaint(
          {
            complaintId: created.id,
            actionTaken: "Second resolution attempt.",
          },
          ADMIN_USER_ID,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("Escalation and Notifications", () => {
    it("escalates a severe complaint to leadership", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Severe safety violation",
          reason: "Safety Violation",
          description: "Brought prohibited item to premises.",
          reportedDate: "2026-10-30",
          severity: "critical",
        },
        TEACHER_USER_ID,
      );

      const escalated = await service.escalateComplaint(
        {
          complaintId: created.id,
          reason: "Critical safety hazard requires principal disciplinary committee review.",
        },
        INVESTIGATOR_USER_ID,
      );

      expect(escalated.status).toBe("escalated");

      const actions = await store.listActions(created.id, true);
      expect(actions.some((a) => a.actionType === "escalated")).toBe(true);
    });

    it("records notification to student and guardian", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Attendance truancy",
          reason: "Truancy",
          description: "Student left campus without permission during 4th period.",
          reportedDate: "2026-10-30",
          severity: "medium",
        },
        TEACHER_USER_ID,
      );

      const notified = await service.notifyStudentOrGuardian(
        {
          complaintId: created.id,
          channel: "both",
        },
        ADMIN_USER_ID,
      );

      expect(notified.studentNotifiedAt).toBeInstanceOf(Date);

      const actions = await store.listActions(created.id, true);
      expect(actions.some((a) => a.actionType === "student_notified")).toBe(true);
      expect(actions.some((a) => a.actionType === "guardian_notified")).toBe(true);
    });
  });

  describe("Comments and Feedback", () => {
    it("adds staff internal notes and student-visible feedback", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Uniform violation",
          reason: "Dress Code",
          description: "Missing blazer repeatedly.",
          reportedDate: "2026-10-30",
          severity: "low",
        },
        TEACHER_USER_ID,
      );

      // Staff note
      const internalNote = await service.addComment(
        {
          complaintId: created.id,
          body: "Checked with supply office regarding uniform back-orders.",
          isInternal: true,
        },
        INVESTIGATOR_USER_ID,
      );
      expect(internalNote.isInternal).toBe(true);

      // Student/guardian feedback
      const feedback = await service.addComment(
        {
          complaintId: created.id,
          body: "Parent contacted school: replacement uniform arrives tomorrow.",
          isInternal: false,
        },
        STUDENT_ID,
      );
      expect(feedback.isInternal).toBe(false);

      // Student view should only see the non-internal comment
      const studentDetails = await service.getComplaintDetails(created.id, false);
      expect(studentDetails.comments).toHaveLength(1);
      expect(studentDetails.comments[0]?.body).toContain("Parent contacted");

      // Staff view sees both
      const staffDetails = await service.getComplaintDetails(created.id, true);
      expect(staffDetails.comments).toHaveLength(2);
    });
  });

  describe("Visibility grants", () => {
    it("grants explicit visibility to a counselor", async () => {
      const created = await service.submitComplaint(
        {
          institutionId: INSTITUTION_ID,
          academicSessionId: SESSION_ID,
          studentId: STUDENT_ID,
          title: "Emotional distress and behavioral change",
          reason: "Pastoral Care",
          description: "Student appeared unusually withdrawn and hostile towards classmates.",
          reportedDate: "2026-10-30",
          severity: "medium",
        },
        TEACHER_USER_ID,
      );

      const COUNSELOR_USER_ID = "00000000-0000-4000-8000-000000000007";
      const grant = await service.grantVisibility(
        {
          complaintId: created.id,
          userId: COUNSELOR_USER_ID,
          accessLevel: "full",
          reason: "School counselor assigned for pastoral support.",
        },
        ADMIN_USER_ID,
      );

      expect(grant.complaintId).toBe(created.id);
      expect(grant.userId).toBe(COUNSELOR_USER_ID);
      expect(grant.accessLevel).toBe("full");
      expect(grant.grantedByUserId).toBe(ADMIN_USER_ID);
    });
  });
});
