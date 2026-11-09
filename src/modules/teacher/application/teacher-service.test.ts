import { beforeEach, describe, expect, it } from "vitest";
import { FakeTeacherStore } from "./testing/fakes";
import { TeacherService } from "./teacher-service";

const INSTITUTION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const TEACHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const SUBJECT_ID = "44444444-4444-4444-8444-444444444444";
const SECTION_ID = "55555555-5555-4555-8555-555555555555";
const CLASS_ID = "66666666-6666-4666-8666-666666666666";

describe("TeacherService", () => {
  let store: FakeTeacherStore;
  let service: TeacherService;

  beforeEach(() => {
    store = new FakeTeacherStore();
    service = new TeacherService(store);
  });

  it("creates and retrieves a teacher profile", async () => {
    const created = await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      employeeCode: "T-001",
      firstName: "Ayesha",
      lastName: "Malik",
      email: "ayesha.malik@example.test",
      maxPeriodsPerDay: 5,
    });

    expect(created.userId).toBe(TEACHER_USER_ID);
    expect(created.firstName).toBe("Ayesha");
    expect(created.employeeCode).toBe("T-001");

    const fetched = await service.getTeacher(TEACHER_USER_ID);
    expect(fetched.email).toBe("ayesha.malik@example.test");
  });

  it("throws NotFoundError when teacher does not exist", async () => {
    await expect(service.getTeacher("99999999-9999-4999-8999-999999999999")).rejects.toThrow(
      "Teacher profile for user",
    );
  });

  it("lists teachers with filtering and pagination", async () => {
    await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      firstName: "Ayesha",
      lastName: "Malik",
    });

    await service.createTeacher({
      userId: "77777777-7777-4777-8777-777777777777",
      institutionId: INSTITUTION_ID,
      firstName: "Bilal",
      lastName: "Ahmed",
    });

    const result = await service.listTeachers({
      institutionId: INSTITUTION_ID,
      page: 1,
      pageSize: 10,
    });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);

    const searchResult = await service.listTeachers({
      institutionId: INSTITUTION_ID,
      query: "ayesha",
      page: 1,
      pageSize: 10,
    });
    expect(searchResult.total).toBe(1);
    expect(searchResult.rows[0]?.firstName).toBe("Ayesha");
  });

  it("updates teacher profile fields", async () => {
    await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      firstName: "Ayesha",
      lastName: "Malik",
    });

    const updated = await service.updateTeacher(TEACHER_USER_ID, {
      bio: "Senior Mathematics teacher with 10 years experience.",
      maxPeriodsPerDay: 6,
    });

    expect(updated.bio).toBe("Senior Mathematics teacher with 10 years experience.");
    expect(updated.maxPeriodsPerDay).toBe(6);
  });

  it("creates a teaching assignment scoped to a section", async () => {
    await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      firstName: "Ayesha",
    });

    const assignment = await service.assignTeacher({
      institutionId: INSTITUTION_ID,
      teacherId: TEACHER_USER_ID,
      academicSessionId: SESSION_ID,
      subjectId: SUBJECT_ID,
      sectionId: SECTION_ID,
      isClassTeacher: true,
      assignedFrom: new Date("2026-08-01"),
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.isClassTeacher).toBe(true);
    expect(assignment.sectionId).toBe(SECTION_ID);
    expect(assignment.classId).toBeNull();

    const list = await service.listAssignments({
      institutionId: INSTITUTION_ID,
      teacherId: TEACHER_USER_ID,
    });
    expect(list).toHaveLength(1);
  });

  it("rejects an assignment with multiple scopes", async () => {
    await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      firstName: "Ayesha",
    });

    await expect(
      service.assignTeacher({
        institutionId: INSTITUTION_ID,
        teacherId: TEACHER_USER_ID,
        academicSessionId: SESSION_ID,
        classId: CLASS_ID,
        sectionId: SECTION_ID,
        assignedFrom: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("removes a teaching assignment", async () => {
    await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      firstName: "Ayesha",
    });

    const assignment = await service.assignTeacher({
      institutionId: INSTITUTION_ID,
      teacherId: TEACHER_USER_ID,
      academicSessionId: SESSION_ID,
      sectionId: SECTION_ID,
      assignedFrom: new Date(),
    });

    await service.removeAssignment(assignment.id);

    const list = await service.listAssignments({
      institutionId: INSTITUTION_ID,
      teacherId: TEACHER_USER_ID,
    });
    expect(list).toHaveLength(0);
  });

  it("computes portal summary for a teacher", async () => {
    await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      firstName: "Ayesha",
      lastName: "Malik",
    });

    await service.assignTeacher({
      institutionId: INSTITUTION_ID,
      teacherId: TEACHER_USER_ID,
      academicSessionId: SESSION_ID,
      subjectId: SUBJECT_ID,
      sectionId: SECTION_ID,
      assignedFrom: new Date(),
    });

    await service.addCompetence({
      teacherUserId: TEACHER_USER_ID,
      subjectId: SUBJECT_ID,
      isVerified: true,
      effectiveFrom: "2026-01-01",
    });

    const summary = await service.getTeacherPortalSummary(TEACHER_USER_ID, SESSION_ID);
    expect(summary.profile.firstName).toBe("Ayesha");
    expect(summary.classCount).toBe(1);
    expect(summary.subjectCount).toBe(1);
    expect(summary.assignments).toHaveLength(1);
    expect(summary.subjects).toHaveLength(1);
  });

  it("prevents cross-tenant IDOR updates, assignments, and competence additions", async () => {
    const OTHER_INSTITUTION_ID = "22222222-2222-4222-8222-222222222222";
    await service.createTeacher({
      userId: TEACHER_USER_ID,
      institutionId: INSTITUTION_ID,
      firstName: "Ayesha",
      lastName: "Malik",
    });

    // 1. Updating with mismatched institutionId must throw NotFoundError
    await expect(
      service.updateTeacher(
        TEACHER_USER_ID,
        { firstName: "Attacker Change" },
        OTHER_INSTITUTION_ID,
      ),
    ).rejects.toThrow();

    // 2. Assigning teacher to another institution must throw ValidationError
    await expect(
      service.assignTeacher({
        institutionId: OTHER_INSTITUTION_ID,
        teacherId: TEACHER_USER_ID,
        academicSessionId: SESSION_ID,
        sectionId: SECTION_ID,
        assignedFrom: new Date(),
      }),
    ).rejects.toThrow();

    // 3. Adding competence scoped to wrong institution must throw ValidationError
    await expect(
      service.addCompetence(
        {
          teacherUserId: TEACHER_USER_ID,
          subjectId: SUBJECT_ID,
          effectiveFrom: "2026-01-01",
        },
        OTHER_INSTITUTION_ID,
      ),
    ).rejects.toThrow();
  });
});
