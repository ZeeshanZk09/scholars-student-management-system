/**
 * Use-case tests for the admission service, run against an in-memory {@link FakeAdmissionStore}.
 *
 * These cover the decisions that live in the service layer: boundary validation, the actor gate
 * every command demands, the state machine applied to a real row, the once-only outcome
 * timestamps, the conversion pre-conditions and the payload it assembles, the advisory duplicate
 * rule, and the password policy a guardian account is born with. Store-level integrity (tenant
 * guards, unique-violation translation, the conversion's transaction) is exercised by the Drizzle
 * store and out of scope here.
 */
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";

import { createAdmissionService, type AdmissionService } from "./admission-service";
import { FakeAdmissionStore } from "./testing/fakes";

const GHOST = "33333333-3333-4333-8333-333333333333";
const ACTOR = { userId: randomUUID() };
const SESSION = randomUUID();
const SECTION = randomUUID();

let INST: string;
let store: FakeAdmissionStore;
let svc: AdmissionService;

const applicationInput = (overrides: Record<string, unknown> = {}) => ({
  institutionId: INST,
  firstName: "Amina",
  lastName: "Khan",
  appliedGradeLevel: "5",
  ...overrides,
});

const decideInput = (
  admission: { id: string; version: number },
  overrides: Record<string, unknown> = {},
) => ({
  institutionId: INST,
  admissionId: admission.id,
  version: admission.version,
  to: "approved",
  ...overrides,
});

const convertInput = (
  admission: {
    id: string;
    version: number;
    applicationNumber: string;
    firstName: string;
    lastName: string;
  },
  overrides: Record<string, unknown> = {},
) => ({
  institutionId: INST,
  admissionId: admission.id,
  version: admission.version,
  admissionNumber: admission.applicationNumber,
  firstName: admission.firstName,
  lastName: admission.lastName,
  email: "amina.khan@school.edu",
  academicSessionId: SESSION,
  sectionId: SECTION,
  academicYear: "2026-2027",
  gradeLevel: "5",
  enrolledOn: "2026-10-08",
  ...overrides,
});

beforeEach(() => {
  INST = randomUUID();
  store = new FakeAdmissionStore();
  store.seedInstitution(INST);
  store.seedSession({ id: SESSION, name: "2026", isCurrent: true, closedAt: null });
  svc = createAdmissionService(store, store);
});

describe("admission service — application (tasks 1, 2)", () => {
  it("creates an application, minting the number, slug and initial history row", async () => {
    const created = await svc.createAdmission(applicationInput(), ACTOR);
    expect(created.applicationNumber).toMatch(/^ADM-\d{8}-[0-9A-F]{6}$/);
    const detail = await svc.getAdmission({ institutionId: INST, admissionId: created.id });
    expect(detail.admission.status).toBe("submitted");
    expect(detail.admission.slug).toBe("amina-khan");
    expect(detail.admission.version).toBe(1);
    expect(detail.admission.submittedAt).toBeInstanceOf(Date);
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]?.fromStatus).toBeNull();
    expect(detail.history[0]?.toStatus).toBe("submitted");
    expect(detail.history[0]?.changedByUserId).toBe(ACTOR.userId);
  });

  it("honours a supplied application number", async () => {
    const created = await svc.createAdmission(
      applicationInput({ applicationNumber: "ADM-CUSTOM-1" }),
      ACTOR,
    );
    expect(created.applicationNumber).toBe("ADM-CUSTOM-1");
  });

  it("turns a raced application number into a ConflictError, not a 500", async () => {
    await svc.createAdmission(applicationInput({ applicationNumber: "ADM-20261001-DUP" }), ACTOR);
    await expect(
      svc.createAdmission(applicationInput({ applicationNumber: "ADM-20261001-DUP" }), ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a scope-less application — the DB check stated at the form", async () => {
    try {
      await svc.createAdmission(applicationInput({ appliedGradeLevel: undefined }), ACTOR);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.appliedGradeLevel?.join(" ")).toContain(
        "class, group",
      );
    }
  });

  it("accepts a class-scoped application without a grade level", async () => {
    const created = await svc.createAdmission(
      applicationInput({ appliedGradeLevel: undefined, appliedClassId: randomUUID() }),
      ACTOR,
    );
    const detail = await svc.getAdmission({ institutionId: INST, admissionId: created.id });
    expect(detail.admission.appliedClassId).not.toBeNull();
  });

  it("refuses an unknown institution before any write", async () => {
    await expect(
      svc.createAdmission(applicationInput({ institutionId: GHOST }), ACTOR),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires an authenticated actor — history names a real user", async () => {
    await expect(svc.createAdmission(applicationInput(), { userId: null })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("mints a free slug when the applicant's name is already taken", async () => {
    await svc.createAdmission(applicationInput(), ACTOR);
    const second = await svc.createAdmission(
      applicationInput({ applicationNumber: "ADM-SLUG-2" }),
      ACTOR,
    );
    const detail = await svc.getAdmission({ institutionId: INST, admissionId: second.id });
    expect(detail.admission.slug).toBe("amina-khan-2");
  });

  it("treats blank optional fields as absence: mints the number, stores null scores", async () => {
    const created = await svc.createAdmission(
      applicationInput({ applicationNumber: "", gender: "", testScore: "", interviewScore: "" }),
      ACTOR,
    );
    expect(created.applicationNumber).toMatch(/^ADM-\d{8}-[0-9A-F]{6}$/);
    const detail = await svc.getAdmission({ institutionId: INST, admissionId: created.id });
    expect(detail.admission.gender).toBeNull();
    expect(detail.admission.testScore).toBeNull();
    expect(detail.admission.interviewScore).toBeNull();
  });
});

describe("admission service — advisory duplicates (task 9)", () => {
  it("returns a same-name candidate and vetoes a date-of-birth mismatch", async () => {
    store.seedAdmission({
      institutionId: INST,
      firstName: "Amina",
      lastName: "Khan",
      dateOfBirth: "2014-05-06",
    });
    const same = await svc.previewDuplicates(applicationInput({ dateOfBirth: "2014-05-06" }));
    expect(same).toHaveLength(1);

    const differentDob = await svc.previewDuplicates(
      applicationInput({ dateOfBirth: "2015-01-01" }),
    );
    expect(differentDob).toHaveLength(0);
  });

  it("returns nothing for a different name", async () => {
    store.seedAdmission({ institutionId: INST, firstName: "Amina", lastName: "Khan" });
    const other = await svc.previewDuplicates(
      applicationInput({ firstName: "Bilal", lastName: "Ahmed" }),
    );
    expect(other).toHaveLength(0);
  });

  it("keeps the match when the query has no date of birth to veto with", async () => {
    store.seedAdmission({
      institutionId: INST,
      firstName: "Amina",
      lastName: "Khan",
      dateOfBirth: "2014-05-06",
    });
    const absent = await svc.previewDuplicates({
      institutionId: INST,
      firstName: "Amina",
      lastName: "Khan",
    });
    expect(absent).toHaveLength(1);
    const blank = await svc.previewDuplicates({
      institutionId: INST,
      firstName: "Amina",
      lastName: "Khan",
      dateOfBirth: "",
    });
    expect(blank).toHaveLength(1);
  });
});

describe("admission service — update and editability (task 2)", () => {
  it("edits an open application and bumps the version", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, version: 1 });
    await svc.updateAdmission({
      institutionId: INST,
      admissionId: seeded.id,
      version: 1,
      firstName: "Amina",
      lastName: "Khan",
      dateOfBirth: null,
      gender: null,
      email: null,
      phone: null,
      address: "12 Lake View",
      academicSessionId: null,
      appliedClassId: null,
      appliedGroupId: null,
      appliedGradeLevel: "6",
      testScore: null,
      interviewScore: null,
    });
    const after = await store.getAdmission(INST, seeded.id);
    expect(after?.admission.address).toBe("12 Lake View");
    expect(after?.admission.version).toBe(2);
  });

  it("freezes a decided application — an approved record is an audit fact", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await expect(
      svc.updateAdmission({
        institutionId: INST,
        admissionId: seeded.id,
        version: 2,
        firstName: "Sneaky",
        lastName: "Edit",
        dateOfBirth: null,
        gender: null,
        email: null,
        phone: null,
        address: null,
        academicSessionId: null,
        appliedClassId: null,
        appliedGroupId: null,
        appliedGradeLevel: "5",
        testScore: null,
        interviewScore: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a stale version rather than clobbering", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, version: 1 });
    await expect(
      svc.updateAdmission({
        institutionId: INST,
        admissionId: seeded.id,
        version: seeded.version + 5,
        firstName: "Amina",
        lastName: "Khan",
        dateOfBirth: null,
        gender: null,
        email: null,
        phone: null,
        address: null,
        academicSessionId: null,
        appliedClassId: null,
        appliedGroupId: null,
        appliedGradeLevel: "5",
        testScore: null,
        interviewScore: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("admission service — decisions (tasks 10, 11)", () => {
  it("stamps decidedAt once: under_review is not a decision", async () => {
    const seeded = store.seedAdmission({ institutionId: INST });
    await svc.decide(decideInput(seeded, { to: "under_review" }), ACTOR);
    const reviewing = await store.getAdmission(INST, seeded.id);
    expect(reviewing?.admission.status).toBe("under_review");
    expect(reviewing?.admission.decidedAt).toBeNull();

    await svc.decide(
      decideInput({ id: seeded.id, version: reviewing!.admission.version }, { to: "approved" }),
      ACTOR,
    );
    const approved = await store.getAdmission(INST, seeded.id);
    expect(approved?.admission.decidedAt).toBeInstanceOf(Date);
    const stamped = approved?.admission.decidedAt;
    expect(approved?.history).toHaveLength(2);
    expect(approved?.history[1]?.fromStatus).toBe("under_review");
    expect(approved?.history[1]?.toStatus).toBe("approved");
    expect(stamped).toBeInstanceOf(Date);
  });

  it("refuses a rejection without a reason, with the appeal-facing message", async () => {
    const seeded = store.seedAdmission({ institutionId: INST });
    try {
      await svc.decide(decideInput(seeded, { to: "rejected" }), ACTOR);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toContain("reason");
    }
  });

  it("rejects with a reason and records it on the row", async () => {
    const seeded = store.seedAdmission({ institutionId: INST });
    await svc.decide(
      decideInput(seeded, {
        to: "rejected",
        rejectionReason: "Placed out of seats in this grade.",
      }),
      ACTOR,
    );
    const after = await store.getAdmission(INST, seeded.id);
    expect(after?.admission.status).toBe("rejected");
    expect(after?.admission.rejectionReason).toBe("Placed out of seats in this grade.");
    expect(after?.admission.decidedAt).toBeInstanceOf(Date);
  });

  it("treats rejected as terminal", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "rejected", version: 2 });
    await expect(svc.decide(decideInput(seeded, { to: "approved" }), ACTOR)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("refuses a no-op transition to the current state", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "under_review" });
    await expect(
      svc.decide(decideInput(seeded, { to: "under_review" }), ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a decision without an authenticated actor", async () => {
    const seeded = store.seedAdmission({ institutionId: INST });
    await expect(svc.decide(decideInput(seeded), { userId: null })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("keeps conversion out of the decide vocabulary — it has its own command", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    try {
      await svc.decide(decideInput(seeded, { to: "converted" }), ACTOR);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.to?.length).toBeGreaterThan(0);
    }
  });

  it("refuses a stale version instead of overwriting a decision", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, version: 1 });
    await expect(
      svc.decide(decideInput(seeded, { version: seeded.version + 4 }), ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("admission service — conversion (tasks 3, 4, 5, 7)", () => {
  it("refuses anything that is not approved", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "submitted" });
    await expect(svc.convert(convertInput(seeded), ACTOR)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("refuses a closed session — RULES §44 through the shared placement rule", async () => {
    const closed = randomUUID();
    store.seedSession({ id: closed, name: "2025", isCurrent: false, closedAt: new Date() });
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await expect(
      svc.convert(convertInput(seeded, { academicSessionId: closed }), ACTOR),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("converts atomically in shape: student, placement, enrollment, flip and history", async () => {
    const seeded = store.seedAdmission({
      institutionId: INST,
      status: "approved",
      version: 2,
      applicationNumber: "ADM-20261008-ABC123",
    });
    const result = await svc.convert(convertInput(seeded), ACTOR);
    expect(result.studentId).not.toBe("");

    const conversion = store.conversions[0];
    expect(conversion).toBeDefined();
    expect(conversion?.student.admissionNumber).toBe("ADM-20261008-ABC123");
    // The seeded applicant is Jane Doe; the student's canonical slug is minted from that name.
    expect(conversion?.student.slug).toBe("jane-doe");
    expect(conversion?.student.email).toBe("amina.khan@school.edu");
    expect(conversion?.placement).toEqual({
      academicSessionId: SESSION,
      sectionId: SECTION,
    });
    expect(conversion?.enrollment).toEqual({
      academicYear: "2026-2027",
      gradeLevel: 5,
      departmentId: null,
      enrolledOn: "2026-10-08",
    });
    expect(conversion?.guardian).toBeNull();
    expect(conversion?.previousSchool).toBeNull();

    const after = await store.getAdmission(INST, seeded.id);
    expect(after?.admission.status).toBe("converted");
    expect(after?.admission.studentId).toBe(result.studentId);
    expect(after?.admission.convertedAt).toBeInstanceOf(Date);
    expect(after?.admission.version).toBe(3);
    const flip = after?.history.at(-1);
    expect(flip?.fromStatus).toBe("approved");
    expect(flip?.toStatus).toBe("converted");
    expect(flip?.changedByUserId).toBe(ACTOR.userId);
    expect(store.studentSlugs.has("jane-doe")).toBe(true);
  });

  it("provisions a guardian account with a hashed credential, never plaintext", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await svc.convert(
      convertInput(seeded, {
        guardianFirstName: "Nadia",
        guardianLastName: "Khan",
        guardianEmail: "nadia.khan@example.test",
        guardianRelationship: "mother",
        guardianPassword: "correct-horse-battery-42",
      }),
      ACTOR,
    );
    const guardian = store.conversions[0]?.guardian;
    expect(guardian?.link.relationship).toBe("mother");
    expect(guardian?.profile.credential).not.toBeNull();
    expect(guardian?.profile.credential?.passwordHash).not.toBe("correct-horse-battery-42");
  });

  it("provisions a passwordless guardian as invited (credential null)", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await svc.convert(
      convertInput(seeded, {
        guardianFirstName: "Nadia",
        guardianLastName: "Khan",
        guardianEmail: "nadia.khan@example.test",
        guardianRelationship: "mother",
      }),
      ACTOR,
    );
    expect(store.conversions[0]?.guardian?.profile.credential).toBeNull();
  });

  it("refuses a half-filled guardian section", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    try {
      await svc.convert(
        convertInput(seeded, { guardianFirstName: "Nadia", guardianEmail: null }),
        ACTOR,
      );
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.guardianLastName?.join(" ")).toContain(
        "last name",
      );
    }
  });

  it("treats the fee-payer toggle as a touched guardian section", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    try {
      await svc.convert(convertInput(seeded, { guardianIsFeePayer: true }), ACTOR);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.guardianFirstName?.join(" ")).toContain(
        "first name",
      );
    }
  });

  it("rejects a weak guardian password through the auth policy", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    try {
      await svc.convert(
        convertInput(seeded, {
          guardianFirstName: "Nadia",
          guardianLastName: "Khan",
          guardianEmail: "nadia.khan@example.test",
          guardianRelationship: "mother",
          guardianPassword: "short",
        }),
        ACTOR,
      );
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.guardianPassword?.length).toBeGreaterThan(0);
    }
  });

  it("carries a previous school through when provided", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await svc.convert(
      convertInput(seeded, {
        previousSchoolName: "Green Valley School",
        previousSchoolAddress: "Block C, Model Town",
        previousSchoolTcNumber: "TC-77",
      }),
      ACTOR,
    );
    expect(store.conversions[0]?.previousSchool).toEqual({
      name: "Green Valley School",
      address: "Block C, Model Town",
      phone: null,
      classAttended: null,
      tcNumber: "TC-77",
    });
  });

  it("refuses previous-school details without the school's name", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await expect(
      svc.convert(convertInput(seeded, { previousSchoolAddress: "Only an address" }), ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a stale version instead of double-converting", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await expect(
      svc.convert(convertInput(seeded, { version: seeded.version + 3 }), ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a conversion without an authenticated actor", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await expect(svc.convert(convertInput(seeded), { userId: null })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses to convert the same application twice", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await svc.convert(convertInput(seeded), ACTOR);
    try {
      await svc.convert(convertInput(seeded), ACTOR);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).userMessage).toContain("already been converted");
    }
    expect(store.conversions).toHaveLength(1);
  });

  it("refuses a session that does not exist, not just a closed one", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await expect(
      svc.convert(convertInput(seeded, { academicSessionId: GHOST }), ACTOR),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("avoids a student slug that is already taken", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    store.studentSlugs.add("jane-doe");
    await svc.convert(convertInput(seeded), ACTOR);
    expect(store.conversions[0]?.student.slug).toBe("jane-doe-2");
  });

  it("treats blank form fields as absence: no password policy, no grade level", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, status: "approved", version: 2 });
    await svc.convert(
      convertInput(seeded, {
        gradeLevel: "",
        guardianFirstName: "Nadia",
        guardianLastName: "Khan",
        guardianEmail: "nadia.khan@example.test",
        guardianRelationship: "mother",
        guardianPassword: "",
      }),
      ACTOR,
    );
    expect(store.conversions[0]?.enrollment.gradeLevel).toBeNull();
    expect(store.conversions[0]?.guardian?.profile.credential).toBeNull();
  });
});

describe("admission service — documents (task 6)", () => {
  const seedDocument = async () => {
    const seeded = store.seedAdmission({ institutionId: INST, version: 1 });
    const created = await svc.registerDocument(
      { institutionId: INST, admissionId: seeded.id, documentType: "b_form" },
      ACTOR,
    );
    return { seeded, documentId: created.id };
  };

  it("mints a module-scoped storage key the client never chose", async () => {
    const { seeded, documentId } = await seedDocument();
    const detail = await store.getAdmission(INST, seeded.id);
    const document = detail?.documents.find((row) => row.id === documentId);
    expect(document?.storageKey).toBe(
      `institutions/${INST}/admissions/${seeded.id}/documents/${document?.storageKey.split("/").at(-1)}`,
    );
    expect(document?.status).toBe("pending_verification");
  });

  it("refuses to register against an unknown application", async () => {
    await expect(
      svc.registerDocument(
        { institutionId: INST, admissionId: GHOST, documentType: "b_form" },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("verifies a pending document and stamps the time", async () => {
    const { seeded, documentId } = await seedDocument();
    await svc.decideDocument(
      { institutionId: INST, admissionId: seeded.id, documentId, decision: "verified" },
      ACTOR,
    );
    const detail = await store.getAdmission(INST, seeded.id);
    const document = detail?.documents.find((row) => row.id === documentId);
    expect(document?.status).toBe("verified");
    expect(document?.verifiedAt).toBeInstanceOf(Date);
  });

  it("refuses to decide an already-decided document", async () => {
    const { seeded, documentId } = await seedDocument();
    await svc.decideDocument(
      { institutionId: INST, admissionId: seeded.id, documentId, decision: "verified" },
      ACTOR,
    );
    await expect(
      svc.decideDocument(
        { institutionId: INST, admissionId: seeded.id, documentId, decision: "rejected" },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("requires a reason to reject a document", async () => {
    const { seeded, documentId } = await seedDocument();
    await expect(
      svc.decideDocument(
        { institutionId: INST, admissionId: seeded.id, documentId, decision: "rejected" },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects with a reason, storing it on the row", async () => {
    const { seeded, documentId } = await seedDocument();
    await svc.decideDocument(
      {
        institutionId: INST,
        admissionId: seeded.id,
        documentId,
        decision: "rejected",
        rejectionReason: "Photo is illegible.",
      },
      ACTOR,
    );
    const detail = await store.getAdmission(INST, seeded.id);
    expect(detail?.documents[0]?.rejectionReason).toBe("Photo is illegible.");
    expect(detail?.documents[0]?.verifiedAt).toBeNull();
  });

  it("refuses a document that does not belong to the application", async () => {
    const seeded = store.seedAdmission({ institutionId: INST });
    await expect(
      svc.decideDocument(
        { institutionId: INST, admissionId: seeded.id, documentId: GHOST, decision: "verified" },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses document writes without an authenticated actor", async () => {
    const seeded = store.seedAdmission({ institutionId: INST, version: 1 });
    await expect(
      svc.registerDocument(
        { institutionId: INST, admissionId: seeded.id, documentType: "b_form" },
        { userId: null },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const created = await svc.registerDocument(
      { institutionId: INST, admissionId: seeded.id, documentType: "b_form" },
      ACTOR,
    );
    await expect(
      svc.decideDocument(
        {
          institutionId: INST,
          admissionId: seeded.id,
          documentId: created.id,
          decision: "verified",
        },
        { userId: null },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("drops a stale rejection reason when the document is verified", async () => {
    const { seeded, documentId } = await seedDocument();
    await svc.decideDocument(
      {
        institutionId: INST,
        admissionId: seeded.id,
        documentId,
        decision: "verified",
        rejectionReason: "Left over from the reject tab.",
      },
      ACTOR,
    );
    const detail = await store.getAdmission(INST, seeded.id);
    expect(detail?.documents[0]?.status).toBe("verified");
    expect(detail?.documents[0]?.rejectionReason).toBeNull();
    expect(detail?.documents[0]?.verifiedAt).toBeInstanceOf(Date);
  });
});

describe("admission service — reads", () => {
  it("filters the roster by status", async () => {
    store.seedAdmission({ institutionId: INST, status: "submitted" });
    store.seedAdmission({ institutionId: INST, status: "approved", applicationNumber: "ADM-B" });
    const approved = await store.listAdmissions(INST, "approved");
    expect(approved).toHaveLength(1);
    expect(approved[0]?.status).toBe("approved");
  });

  it("fails an unknown application with an actionable message", async () => {
    await expect(
      svc.getAdmission({ institutionId: INST, admissionId: GHOST }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("serves the roster through the service, filtered by status when asked", async () => {
    store.seedAdmission({ institutionId: INST, status: "submitted" });
    store.seedAdmission({ institutionId: INST, status: "approved", applicationNumber: "ADM-B" });
    expect(await svc.listAdmissions(INST)).toHaveLength(2);
    const approved = await svc.listAdmissions(INST, "approved");
    expect(approved).toHaveLength(1);
    expect(approved[0]?.status).toBe("approved");
  });

  it("fails a malformed detail request at the boundary", async () => {
    await expect(
      svc.getAdmission({ institutionId: INST, admissionId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
