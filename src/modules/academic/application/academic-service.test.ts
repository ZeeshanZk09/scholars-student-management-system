/**
 * Use-case tests for the academic service, run against an in-memory {@link FakeAcademicStore}.
 *
 * These cover the decisions that live in the service layer: input validation, session-lifecycle
 * policy, slug minting and acting-institution resolution. Store-level integrity (tenant guards,
 * unique-violation translation) is exercised by the Drizzle store itself and out of scope here.
 */
import { describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";

import { createAcademicService } from "./academic-service";
import { FakeAcademicStore } from "./testing/fakes";

const GHOST = "33333333-3333-4333-8333-333333333333";

function makeService(store: FakeAcademicStore = new FakeAcademicStore()) {
  return createAcademicService(store);
}

describe("academic service — institution & acting scope", () => {
  it("mints a globally unique institution slug when the name is taken", async () => {
    const store = new FakeAcademicStore();
    store.seedInstitution({
      name: "Green Hills School",
      slug: "green-hills-school",
    });
    const svc = makeService(store);

    const created = await svc.createInstitution({
      name: "Green Hills School",
      kind: "school",
      email: "office@green-hills.org",
    });

    const record = await store.getInstitution(created.id);
    expect(record?.slug).toBe("green-hills-school-2");
    expect(record?.email).toBe("office@green-hills.org");
  });

  it("rejects an institution without a name or email", async () => {
    const svc = makeService();
    await expect(svc.createInstitution({ name: "", kind: "college" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("returns the sole institution as the acting institution", async () => {
    const store = new FakeAcademicStore();
    const seeded = store.seedInstitution({ name: "Lone Star School", slug: "lone-star" });
    const acting = await makeService(store).resolveActingInstitution(null);
    expect(acting?.id).toBe(seeded.id);
  });

  it("prefers the acting institution over the sole institution", async () => {
    const store = new FakeAcademicStore();
    const sole = store.seedInstitution({ name: "Sole School", slug: "sole" });
    const acting = await makeService(store).resolveActingInstitution(sole.id);
    expect(acting?.id).toBe(sole.id);
  });

  it("returns null when no institution is preferred and several exist", async () => {
    const store = new FakeAcademicStore();
    store.seedInstitution({ name: "First School", slug: "first" });
    store.seedInstitution({ name: "Second School", slug: "second" });
    expect(await makeService(store).resolveActingInstitution(null)).toBeNull();
  });

  it("refuses commands for an institution that does not exist", async () => {
    const svc = makeService();
    await expect(
      svc.createCampus({ institutionId: GHOST, name: "Main Campus" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("academic service — scoped slug minting", () => {
  it("scopes campus slugs to the institution", async () => {
    const store = new FakeAcademicStore();
    const first = store.seedInstitution({ name: "First School", slug: "first" });
    const second = store.seedInstitution({ name: "Second School", slug: "second" });
    const svc = makeService(store);

    await svc.createCampus({ institutionId: first.id, name: "Main Campus" });
    await svc.createCampus({ institutionId: first.id, name: "Main Campus" });
    await svc.createCampus({ institutionId: second.id, name: "Main Campus" });

    const firstCampuses = await store.listCampuses(first.id);
    const secondCampuses = await store.listCampuses(second.id);
    expect(firstCampuses.map((c) => c.slug)).toEqual(["main-campus", "main-campus-2"]);
    expect(secondCampuses.map((c) => c.slug)).toEqual(["main-campus"]);
  });

  it("normalises submitted names in the stored slug", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const created = await makeService(store).createDepartment({
      institutionId: inst.id,
      name: "  Science & Math  ",
    });
    const rows = await store.listDepartments(inst.id);
    expect(rows[0]?.id).toBe(created.id);
    expect(rows[0]?.slug).toBe("science-math");
  });
});

describe("academic service — session lifecycle", () => {
  it("makes the first session current automatically", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const created = await makeService(store).createAcademicSession({
      institutionId: inst.id,
      name: "Session 2024",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    expect(created.isCurrent).toBe(true);
  });

  it("rejects out-of-order session dates", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    await expect(
      makeService(store).createAcademicSession({
        institutionId: inst.id,
        name: "Backwards",
        startDate: "2025-06-01",
        endDate: "2025-01-01",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("moves current status to the successor session", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const svc = makeService(store);
    const first = await svc.createAcademicSession({
      institutionId: inst.id,
      name: "Session 2024",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    const second = await svc.createAcademicSession({
      institutionId: inst.id,
      name: "Session 2025",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
    expect(first.isCurrent).toBe(true);

    await svc.setCurrentSession({ institutionId: inst.id, sessionId: second.id });

    expect((await store.getSession(inst.id, second.id))?.isCurrent).toBe(true);
    expect((await store.getSession(inst.id, first.id))?.isCurrent).toBe(false);
  });

  it("refuses to close the current session", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const svc = makeService(store);
    const first = await svc.createAcademicSession({
      institutionId: inst.id,
      name: "Session 2024",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    await expect(
      svc.closeSession({ institutionId: inst.id, sessionId: first.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("closes a non-current session and makes it read-only", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const svc = makeService(store);
    await svc.createAcademicSession({
      institutionId: inst.id,
      name: "Session 2024",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    const second = await svc.createAcademicSession({
      institutionId: inst.id,
      name: "Session 2025",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });

    await svc.closeSession({ institutionId: inst.id, sessionId: second.id });

    await expect(
      svc.setCurrentSession({ institutionId: inst.id, sessionId: second.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      svc.setCurrentSession({ institutionId: inst.id, sessionId: second.id }),
    ).rejects.toThrow(/closed/);
  });

  it("refuses to close a session that is already closed", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const session = store.seedSession({
      institutionId: inst.id,
      name: "Archive",
      closedAt: new Date("2024-12-31T00:00:00Z"),
    });
    await expect(
      makeService(store).closeSession({ institutionId: inst.id, sessionId: session.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("academic service — classes, groups and sections", () => {
  it("refuses to create a class in a closed session", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const closed = store.seedSession({
      institutionId: inst.id,
      name: "Archive",
      closedAt: new Date("2024-12-31T00:00:00Z"),
    });
    await expect(
      makeService(store).createClass({
        institutionId: inst.id,
        academicSessionId: closed.id,
        name: "Grade 6",
        gradeLevel: "6",
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("creates the groups atomically with an open class", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const session = store.seedSession({ institutionId: inst.id, name: "Session 2025" });
    const svc = makeService(store);

    const created = await svc.createClass({
      institutionId: inst.id,
      academicSessionId: session.id,
      name: "Grade 6",
      gradeLevel: "6",
      groupNames: ["A", "A", "B"],
    });

    const tree = await svc.listClassTree(inst.id, session.id);
    const klass = tree.find((item) => item.id === created.id);
    expect(klass?.name).toBe("Grade 6");
    expect(klass?.groups.map((g) => g.slug)).toEqual(["a", "a-2", "b"]);
  });

  it("does not place a class in a sibling session", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    const session = store.seedSession({ institutionId: inst.id, name: "Session 2025" });
    const other = store.seedSession({ institutionId: inst.id, name: "Session 2026" });
    const created = await makeService(store).createClass({
      institutionId: inst.id,
      academicSessionId: session.id,
      name: "Grade 6",
      gradeLevel: 6,
    });

    const otherTree = await store.listClassTree(inst.id, other.id);
    expect(otherTree.find((item) => item.id === created.id)).toBeUndefined();
  });
});

describe("academic service — subjects and time slots", () => {
  it("normalises a subject code to upper case", async () => {
    const store = new FakeAcademicStore();
    const inst = store.seedInstitution({ name: "First School", slug: "first" });
    await makeService(store).createSubject({
      institutionId: inst.id,
      name: "Mathematics",
      code: "  mat  ",
      kind: "both",
    });
    const subjects = await store.listSubjects(inst.id);
    expect(subjects[0]?.code).toBe("MAT");
    expect(subjects[0]?.slug).toBe("mathematics");
  });

  describe("academic service — time slot ordering", () => {
    it("rejects a time slot that ends before it starts", async () => {
      const store = new FakeAcademicStore();
      const inst = store.seedInstitution({ name: "First School", slug: "first" });
      await expect(
        makeService(store).createTimeSlot({
          institutionId: inst.id,
          name: "First Period",
          startTime: "08:00",
          endTime: "07:59",
          sequence: 1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("accepts a well-ordered time slot", async () => {
      const store = new FakeAcademicStore();
      const inst = store.seedInstitution({ name: "First School", slug: "first" });
      const created = await makeService(store).createTimeSlot({
        institutionId: inst.id,
        name: "  First Period  ",
        startTime: "08:00",
        endTime: "08:40",
        sequence: 1,
        isBreak: false,
      });
      expect(created.id).toBeTruthy();
      expect((await store.listTimeSlots(inst.id))[0]?.name).toBe("First Period");
    });
  });
});
