/**
 * Use-case tests for the student service, run against an in-memory {@link FakeStudentStore}.
 *
 * These cover the decisions that live in the service layer: boundary validation, the lifecycle
 * state machine as applied to a real row, the open-session gate for placements, guardian-link
 * policy and the password policy the account is born with. Store-level integrity (tenant guards,
 * unique-violation translation, the partial primary index) is exercised by the Drizzle store and
 * out of scope here.
 */
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";

import { createStudentService, type StudentService } from "./student-service";
import { FakeStudentStore } from "./testing/fakes";

const GHOST = "33333333-3333-4333-8333-333333333333";
const ACTOR = { userId: randomUUID() };

const studentInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  admissionNumber: "ADM-001",
  firstName: "Amina",
  lastName: "Khan",
  email: "amina.khan@school.edu",
  ...overrides,
});

let INST: string;
let store: FakeStudentStore;
let svc: StudentService;

beforeEach(() => {
  INST = randomUUID();
  store = new FakeStudentStore();
  store.seedInstitution(INST);
  svc = createStudentService(store, store);
});

describe("student service — profile", () => {
  it("creates a student with a unique, stable slug", async () => {
    store.seedStudent({ institutionId: INST, slug: "amina-khan" });
    const created = await svc.createStudent(studentInput());
    const row = await store.getStudent(INST, created.id);
    expect(row?.slug).toBe("amina-khan-2");
    expect(row?.lifecycle).toBe("admitted");
    expect(row?.version).toBe(1);
  });

  it("requires an e-mail — the column is NOT NULL in the applied schema", async () => {
    await expect(svc.createStudent(studentInput({ email: undefined }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses an unknown institution before any write", async () => {
    await expect(svc.createStudent(studentInput({ institutionId: GHOST }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects a stale version on update rather than clobbering", async () => {
    const seeded = store.seedStudent({ institutionId: INST });
    await expect(
      svc.updateStudent({
        ...studentInput({ admissionNumber: seeded.admissionNumber, studentId: seeded.id }),
        institutionId: INST,
        studentId: seeded.id,
        version: seeded.version + 5,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("student service — lifecycle state machine", () => {
  it("moves admitted → active and stamps admittedAt once", async () => {
    const seeded = store.seedStudent({ institutionId: INST, lifecycle: "admitted" });
    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId: seeded.id,
      lifecycle: "active",
      version: seeded.version,
    });
    const after = await store.getStudent(INST, seeded.id);
    expect(after?.lifecycle).toBe("active");
    expect(after?.admittedAt).toBeInstanceOf(Date);

    const stamped = after?.admittedAt;
    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId: seeded.id,
      lifecycle: "inactive",
      version: after?.version,
    });
    const paused = await store.getStudent(INST, seeded.id);
    expect(paused?.admittedAt).toEqual(stamped);
  });

  it("refuses a terminal state becoming active again", async () => {
    const seeded = store.seedStudent({ institutionId: INST, lifecycle: "graduated" });
    await expect(
      svc.setStudentLifecycle({
        institutionId: INST,
        studentId: seeded.id,
        lifecycle: "active",
        version: seeded.version,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses admitted → graduated: it is not an edge", async () => {
    const seeded = store.seedStudent({ institutionId: INST, lifecycle: "admitted" });
    await expect(
      svc.setStudentLifecycle({
        institutionId: INST,
        studentId: seeded.id,
        lifecycle: "graduated",
        version: seeded.version,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("refuses a no-op transition with a message naming the current state", async () => {
    const seeded = store.seedStudent({ institutionId: INST, lifecycle: "active" });
    await expect(
      svc.setStudentLifecycle({
        institutionId: INST,
        studentId: seeded.id,
        lifecycle: "active",
        version: seeded.version,
      }),
    ).rejects.toThrow(/already active/i);
  });

  it("transitions active → promoted → active upon advancement", async () => {
    const seeded = store.seedStudent({ institutionId: INST, lifecycle: "active" });
    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId: seeded.id,
      lifecycle: "promoted",
      version: seeded.version,
    });
    const promoted = await store.getStudent(INST, seeded.id);
    expect(promoted?.lifecycle).toBe("promoted");

    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId: seeded.id,
      lifecycle: "active",
      version: promoted?.version,
    });
    const activeAgain = await store.getStudent(INST, seeded.id);
    expect(activeAgain?.lifecycle).toBe("active");
  });

  it("transitions active → promoted → graduated upon final graduation", async () => {
    const seeded = store.seedStudent({ institutionId: INST, lifecycle: "active" });
    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId: seeded.id,
      lifecycle: "promoted",
      version: seeded.version,
    });
    const promoted = await store.getStudent(INST, seeded.id);
    expect(promoted?.lifecycle).toBe("promoted");

    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId: seeded.id,
      lifecycle: "graduated",
      version: promoted?.version,
    });
    const graduated = await store.getStudent(INST, seeded.id);
    expect(graduated?.lifecycle).toBe("graduated");
    expect(graduated?.graduatedAt).toBeInstanceOf(Date);
  });
});

describe("student service — archival axis (D-4)", () => {
  it("archives once, then refuses a second archive and refuses edits", async () => {
    const seeded = store.seedStudent({ institutionId: INST });
    await svc.archiveStudent({
      institutionId: INST,
      studentId: seeded.id,
      version: seeded.version,
    });
    const archived = await store.getStudent(INST, seeded.id);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    // The lifecycle is untouched: D-4 keeps the two axes independent.
    expect(archived?.lifecycle).toBe("admitted");

    await expect(
      svc.archiveStudent({
        institutionId: INST,
        studentId: seeded.id,
        version: archived?.version,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.updateStudent({
        studentId: seeded.id,
        version: archived?.version,
        ...studentInput({ admissionNumber: seeded.admissionNumber }),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("restores an archived record", async () => {
    const seeded = store.seedStudent({ institutionId: INST });
    await svc.archiveStudent({
      institutionId: INST,
      studentId: seeded.id,
      version: seeded.version,
    });
    const archived = await store.getStudent(INST, seeded.id);
    await svc.unarchiveStudent({
      institutionId: INST,
      studentId: seeded.id,
      version: archived?.version,
    });
    const restored = await store.getStudent(INST, seeded.id);
    expect(restored?.archivedAt).toBeNull();
  });
});

describe("student service — placement & enrollment", () => {
  let studentId: string;
  let sectionId: string;

  beforeEach(() => {
    studentId = store.seedStudent({ institutionId: INST }).id;
    sectionId = randomUUID();
    store.seedSection({
      id: sectionId,
      classId: randomUUID(),
      institutionId: INST,
      academicSessionId: "",
      className: "Class 9",
      groupName: "Science",
      sectionName: "A",
    });
  });

  const seedSession = (overrides: { isCurrent?: boolean; closedAt?: Date | null } = {}) => {
    const id = randomUUID();
    store.seedSession({
      id,
      name: "2026–27",
      isCurrent: overrides.isCurrent ?? true,
      closedAt: overrides.closedAt ?? null,
    });
    // The section was seeded before the session existed; re-point it at this one.
    store.seedSection({
      id: sectionId,
      classId: "class-9",
      institutionId: INST,
      academicSessionId: id,
      className: "Class 9",
      groupName: "Science",
      sectionName: "A",
    });
    return id;
  };

  it("places into a closed session — RULES §44", async () => {
    const sessionId = seedSession({ closedAt: new Date("2026-02-01T00:00:00Z") });
    await expect(
      svc.placeStudent(
        {
          institutionId: INST,
          studentId,
          academicSessionId: sessionId,
          sectionId,
          placementReason: "admission",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("places into the current session as the current placement, recording the actor", async () => {
    const sessionId = seedSession({ isCurrent: true });
    await svc.placeStudent(
      {
        institutionId: INST,
        studentId,
        academicSessionId: sessionId,
        sectionId,
        placementReason: "admission",
      },
      ACTOR,
    );
    const placements = await store.listPlacements(studentId);
    expect(placements).toHaveLength(1);
    expect(placements[0]?.isCurrent).toBe(true);
    expect(placements[0]?.className).toBe("Class 9");
    const row = await store.getStudent(INST, studentId);
    expect(row?.sectionName).toBe("A");
  });

  it("mirrors a non-current session: backfill does not steal the current placement", async () => {
    const currentSession = seedSession({ isCurrent: true });
    await svc.placeStudent(
      {
        institutionId: INST,
        studentId,
        academicSessionId: currentSession,
        sectionId,
        placementReason: "admission",
      },
      ACTOR,
    );
    const backfill = seedSession({ isCurrent: false });
    await svc.placeStudent(
      {
        institutionId: INST,
        studentId,
        academicSessionId: backfill,
        sectionId,
        placementReason: "promotion",
      },
      ACTOR,
    );
    const placements = await store.listPlacements(studentId);
    expect(placements.filter((row) => row.isCurrent)).toHaveLength(1);
    const current = placements.find((row) => row.academicSessionId === currentSession);
    expect(current?.isCurrent).toBe(true);
  });

  it("refuses to place an archived student", async () => {
    const sessionId = seedSession();
    const seeded = store.getStudent(INST, studentId);
    const fresh = await seeded;
    await svc.archiveStudent({
      institutionId: INST,
      studentId: fresh?.id,
      version: fresh?.version,
    });
    await expect(
      svc.placeStudent(
        {
          institutionId: INST,
          studentId,
          academicSessionId: sessionId,
          sectionId,
          placementReason: "admission",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a duplicate enrollment for the same year and grade", async () => {
    const sessionId = seedSession();
    const enrollment = {
      institutionId: INST,
      studentId,
      academicSessionId: sessionId,
      academicYear: "2026-27",
      gradeLevel: 9,
      enrolledOn: "2026-04-01",
    };
    await svc.enrollStudent(enrollment, ACTOR);
    await expect(svc.enrollStudent(enrollment, ACTOR)).rejects.toBeInstanceOf(ConflictError);
  });

  it("executes full promotion workflow across sessions: promotes, places, enrolls, and activates", async () => {
    // 1. Initial year: Session 1 (Grade 9)
    const session1Id = seedSession({ isCurrent: true });
    await svc.placeStudent(
      {
        institutionId: INST,
        studentId,
        academicSessionId: session1Id,
        sectionId,
        placementReason: "admission",
      },
      ACTOR,
    );
    await svc.enrollStudent(
      {
        institutionId: INST,
        studentId,
        academicSessionId: session1Id,
        academicYear: "2025-26",
        gradeLevel: 9,
        enrolledOn: "2025-04-01",
      },
      ACTOR,
    );

    // Initial student state is active
    let student = await store.getStudent(INST, studentId);
    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId,
      lifecycle: "active",
      version: student?.version,
    });

    // 2. End of term: student is promoted
    student = await store.getStudent(INST, studentId);
    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId,
      lifecycle: "promoted",
      version: student?.version,
    });
    student = await store.getStudent(INST, studentId);
    expect(student?.lifecycle).toBe("promoted");

    // 3. New year: Session 2 (Grade 10) opens and becomes current
    const session2Id = randomUUID();
    const section2Id = randomUUID();
    store.seedSession({
      id: session2Id,
      name: "2026–27",
      isCurrent: true,
      closedAt: null,
    });
    store.seedSection({
      id: section2Id,
      classId: "class-10",
      institutionId: INST,
      academicSessionId: session2Id,
      className: "Class 10",
      groupName: "Science",
      sectionName: "B",
    });

    // Place student in Class 10 with reason 'promotion'
    await svc.placeStudent(
      {
        institutionId: INST,
        studentId,
        academicSessionId: session2Id,
        sectionId: section2Id,
        placementReason: "promotion",
      },
      ACTOR,
    );

    // Enroll student in Grade 10
    await svc.enrollStudent(
      {
        institutionId: INST,
        studentId,
        academicSessionId: session2Id,
        academicYear: "2026-27",
        gradeLevel: 10,
        enrolledOn: "2026-04-01",
      },
      ACTOR,
    );

    // 4. Student starts new session as active
    student = await store.getStudent(INST, studentId);
    await svc.setStudentLifecycle({
      institutionId: INST,
      studentId,
      lifecycle: "active",
      version: student?.version,
    });

    // Verify detail
    const detail = await svc.getStudent(INST, studentId);
    expect(detail.student.lifecycle).toBe("active");
    expect(detail.student.className).toBe("Class 10");
    expect(detail.student.sectionName).toBe("B");
    expect(detail.student.sessionName).toBe("2026–27");

    // Placements retain history: 2 total, session 2 is current, session 1 is demoted
    expect(detail.placements).toHaveLength(2);
    const pCurrent = detail.placements.find((p) => p.isCurrent);
    const pPast = detail.placements.find((p) => !p.isCurrent);
    expect(pCurrent?.academicSessionId).toBe(session2Id);
    expect(pCurrent?.placementReason).toBe("promotion");
    expect(pPast?.academicSessionId).toBe(session1Id);

    // Enrollments retain history: 2 total
    expect(detail.enrollments).toHaveLength(2);
  });
});

describe("student service — guardians (tasks 4–6, 15, 16)", () => {
  let studentId: string;

  beforeEach(() => {
    studentId = store.seedStudent({ institutionId: INST }).id;
  });

  const guardianInput = (overrides: Record<string, unknown> = {}) => ({
    firstName: "Sadia",
    lastName: "Rahman",
    email: "sadia.rahman@example.com",
    ...overrides,
  });

  it("creates an account without a password as invited", async () => {
    const created = await svc.createGuardian(guardianInput(), ACTOR);
    const guardian = await store.getGuardian(created.id);
    expect(guardian?.accountStatus).toBe("invited");
  });

  it("creates an account with a valid password as active", async () => {
    const created = await svc.createGuardian(
      guardianInput({ password: "correct-horse-battery-42" }),
      ACTOR,
    );
    const guardian = await store.getGuardian(created.id);
    expect(guardian?.accountStatus).toBe("active");
  });

  it("rejects a weak password through the auth policy, keyed to the field", async () => {
    try {
      await svc.createGuardian(guardianInput({ password: "short" }), ACTOR);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.password?.length).toBeGreaterThan(0);
    }
  });

  it("rejects a password built from the account's own identity", async () => {
    await expect(
      svc.createGuardian(guardianInput({ password: "sadia-rahman-1" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // FormData encodes absent optional fields as `""`, not `undefined` — the exact shapes a
  // real form submit produces, which plain object inputs never exercise.
  it("treats blank form strings as absent: blank password invites, blank selects skip", async () => {
    const created = await svc.createGuardian(
      guardianInput({ password: "", relationship: "", contactType: "" }),
      ACTOR,
    );
    const guardian = await store.getGuardian(created.id);
    expect(guardian?.accountStatus).toBe("invited");
    expect(await store.getGuardianLink(created.id, studentId)).toBeNull();
  });

  it("rejects a linked guardian whose relationship arrived as a blank string", async () => {
    try {
      await svc.createGuardian(
        guardianInput({ institutionId: INST, studentId, relationship: "" }),
        ACTOR,
      );
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.relationship?.join(" ")).toContain(
        "related to the student",
      );
    }
  });

  it("creates the first link when the form left contact priority blank", async () => {
    const created = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother", contactType: "" }),
      ACTOR,
    );
    const link = await store.getGuardianLink(created.id, studentId);
    expect(link?.isActive).toBe(true);
    expect(link?.relationship).toBe("mother");
  });

  it("creates the account and its first link in one call", async () => {
    const created = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother" }),
      ACTOR,
    );
    const link = await store.getGuardianLink(created.id, studentId);
    expect(link?.isActive).toBe(true);
    expect(link?.relationship).toBe("mother");
  });

  it("refuses a link with no relationship", async () => {
    await expect(
      svc.createGuardian(guardianInput({ institutionId: INST, studentId }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a duplicate e-mail — one account per person", async () => {
    await svc.createGuardian(guardianInput(), ACTOR);
    await expect(svc.createGuardian(guardianInput(), ACTOR)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a second primary guardian for one student", async () => {
    await svc.createGuardian(
      guardianInput({
        institutionId: INST,
        studentId,
        relationship: "father",
        contactType: "primary",
      }),
      ACTOR,
    );
    await expect(
      svc.createGuardian(
        guardianInput({
          email: "other.parent@example.com",
          institutionId: INST,
          studentId,
          relationship: "mother",
          contactType: "primary",
        }),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("links an existing guardian to a second child (siblings)", async () => {
    const created = await svc.createGuardian(guardianInput(), ACTOR);
    const secondChild = store.seedStudent({ institutionId: INST }).id;
    await svc.linkGuardian(
      {
        institutionId: INST,
        guardianUserId: created.id,
        studentId: secondChild,
        relationship: "father",
      },
      ACTOR,
    );
    const guardians = await store.listStudentGuardians(secondChild);
    expect(guardians).toHaveLength(1);
  });

  it("refuses to link a guardian who is already linked to that child", async () => {
    const created = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother" }),
      ACTOR,
    );
    await expect(
      svc.linkGuardian(
        {
          institutionId: INST,
          guardianUserId: created.id,
          studentId,
          relationship: "mother",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("unlinks, then allows the same pair to be linked again", async () => {
    const created = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother" }),
      ACTOR,
    );
    await svc.unlinkGuardian(
      { institutionId: INST, guardianUserId: created.id, studentId, reason: "Custody change" },
      ACTOR,
    );
    expect(store.rawLink(created.id, studentId)?.isActive).toBe(false);

    await svc.linkGuardian(
      {
        institutionId: INST,
        guardianUserId: created.id,
        studentId,
        relationship: "legal_guardian",
      },
      ACTOR,
    );
    const restored = store.rawLink(created.id, studentId);
    expect(restored?.isActive).toBe(true);
    expect(restored?.relationship).toBe("legal_guardian");
    expect(restored?.unlinkReason).toBeNull();
  });

  it("refuses to unlink an already-inactive link", async () => {
    const created = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother" }),
      ACTOR,
    );
    const input = {
      institutionId: INST,
      guardianUserId: created.id,
      studentId,
      reason: null,
    };
    await svc.unlinkGuardian(input, ACTOR);
    await expect(svc.unlinkGuardian(input, ACTOR)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to edit a guardian the acting institution cannot reach (D-9)", async () => {
    const created = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother" }),
      ACTOR,
    );
    const otherInstitution = randomUUID();
    store.seedInstitution(otherInstitution);
    // The person exists — `guardians` is global — but no link ties them to the asking tenant,
    // so the edit must be indistinguishable from "no such guardian" (no existence leak).
    await expect(
      svc.updateGuardian({
        institutionId: otherInstitution,
        guardianUserId: created.id,
        firstName: "Sadia",
        lastName: "Rahman",
        version: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("edits a guardian the acting institution can reach", async () => {
    const created = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother" }),
      ACTOR,
    );
    const before = await store.getGuardian(created.id);
    const result = await svc.updateGuardian({
      institutionId: INST,
      guardianUserId: created.id,
      firstName: "Sadia",
      lastName: "Begum",
      version: before?.version,
    });
    expect(result.id).toBe(created.id);
    const after = await store.getGuardian(created.id);
    expect(after?.lastName).toBe("Begum");
    expect(after?.version).toBe((before?.version ?? 0) + 1);
  });

  it("refuses a cross-tenant link, unlink and seed link (tenant scope is the service's)", async () => {
    // The store's link writes delegate institution scoping to `requireStudent` — these three
    // prove that delegation actually refuses a forged institutionId/studentId pairing.
    const otherInstitution = randomUUID();
    store.seedInstitution(otherInstitution);
    const foreignStudent = store.seedStudent({ institutionId: otherInstitution }).id;
    const created = await svc.createGuardian(guardianInput(), ACTOR);

    await expect(
      svc.linkGuardian(
        {
          institutionId: otherInstitution,
          guardianUserId: created.id,
          studentId: studentId,
          relationship: "mother",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      svc.createGuardian(
        guardianInput({
          email: "seed@example.com",
          institutionId: INST,
          studentId: foreignStudent,
          relationship: "father",
        }),
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    const mine = await svc.createGuardian(
      guardianInput({
        email: "linked.parent@example.com",
        institutionId: INST,
        studentId,
        relationship: "mother",
      }),
      ACTOR,
    );
    await expect(
      svc.unlinkGuardian(
        {
          institutionId: INST,
          guardianUserId: mine.id,
          studentId: foreignStudent,
          reason: null,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only guardians linked to a child of the asking institution", async () => {
    const mine = await svc.createGuardian(
      guardianInput({ institutionId: INST, studentId, relationship: "mother" }),
      ACTOR,
    );
    const otherInstitution = randomUUID();
    store.seedInstitution(otherInstitution);
    const theirChild = store.seedStudent({ institutionId: otherInstitution }).id;
    const theirs = await svc.createGuardian(guardianInput({ email: "theirs@example.com" }), ACTOR);
    await svc.linkGuardian(
      {
        institutionId: otherInstitution,
        guardianUserId: theirs.id,
        studentId: theirChild,
        relationship: "father",
      },
      ACTOR,
    );

    const visible = await store.listGuardians(INST);
    expect(visible.map((row) => row.userId)).toEqual([mine.id]);
    expect(visible[0]?.studentCount).toBe(1);
    expect(visible[0]?.studentNames).toEqual(["Amina Khan"]);
  });
});

describe("student service — documents (task 10)", () => {
  it("mints a storage key the caller cannot choose", async () => {
    const student = store.seedStudent({ institutionId: INST });
    const created = await svc.registerDocument(
      { institutionId: INST, studentId: student.id, documentType: "b_form" },
      ACTOR,
    );
    const document = await store.getDocument(student.id, created.id);
    expect(document?.storageKey).toMatch(
      new RegExp(`^institutions/${INST}/students/${student.id}/documents/`),
    );
    expect(document?.status).toBe("pending_verification");
  });

  it("verifies a pending document, naming the verifying user", async () => {
    const student = store.seedStudent({ institutionId: INST });
    const created = await svc.registerDocument(
      { institutionId: INST, studentId: student.id, documentType: "birth_certificate" },
      ACTOR,
    );
    await svc.decideDocument(
      {
        institutionId: INST,
        studentId: student.id,
        documentId: created.id,
        decision: "verified",
      },
      ACTOR,
    );
    const document = await store.getDocument(student.id, created.id);
    expect(document?.status).toBe("verified");
    expect(document?.verifiedAt).toBeInstanceOf(Date);
  });

  it("refuses to decide the same document twice", async () => {
    const student = store.seedStudent({ institutionId: INST });
    const created = await svc.registerDocument(
      { institutionId: INST, studentId: student.id, documentType: "photo" },
      ACTOR,
    );
    await svc.decideDocument(
      {
        institutionId: INST,
        studentId: student.id,
        documentId: created.id,
        decision: "verified",
      },
      ACTOR,
    );
    await expect(
      svc.decideDocument(
        {
          institutionId: INST,
          studentId: student.id,
          documentId: created.id,
          decision: "rejected",
          rejectionReason: "Blurry",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("requires a reason to reject", async () => {
    const student = store.seedStudent({ institutionId: INST });
    const created = await svc.registerDocument(
      { institutionId: INST, studentId: student.id, documentType: "photo" },
      ACTOR,
    );
    await expect(
      svc.decideDocument(
        {
          institutionId: INST,
          studentId: student.id,
          documentId: created.id,
          decision: "rejected",
          rejectionReason: "   ",
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("student service — detail read", () => {
  it("returns the roster row with placement, enrollment, guardian and document lists", async () => {
    const student = store.seedStudent({ institutionId: INST });
    await svc.createGuardian(
      {
        institutionId: INST,
        studentId: student.id,
        firstName: "Nadia",
        lastName: "Khan",
        email: "nadia@example.com",
        relationship: "mother",
      },
      ACTOR,
    );
    const detail = await svc.getStudent(INST, student.id);
    expect(detail.student.id).toBe(student.id);
    expect(detail.placements).toEqual([]);
    expect(detail.enrollments).toEqual([]);
    expect(detail.documents).toEqual([]);
    expect(detail.guardians).toHaveLength(1);
    expect(detail.guardians[0]?.guardianFirstName).toBe("Nadia");
  });

  it("refuses a student from another institution", async () => {
    const otherInstitution = randomUUID();
    store.seedInstitution(otherInstitution);
    const student = store.seedStudent({ institutionId: otherInstitution });
    await expect(svc.getStudent(INST, student.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
