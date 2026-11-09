/**
 * Attendance service tests against the in-memory store — no database, exactly like the fee,
 * admission, finance, HR and payroll service tests.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";

import { createAttendanceService } from "./attendance-service";
import { createFakeAttendanceStore } from "./testing/fakes";

const INSTITUTION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const SESSION_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const ACTOR = "5f6d4c8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const SECTION_ID = "11111111-1111-4111-8111-111111111111";
const TIME_SLOT_ID = "22222222-2222-4222-8222-222222222222";
const DATE = "2026-03-16";
const STUDENT_A = "33333333-3333-4333-8333-333333333333";
const STUDENT_B = "44444444-4444-4444-8444-444444444444";
const NON_EXISTENT_SECTION_ID = "99999999-9999-4999-8999-999999999999";
const NON_EXISTENT_STUDENT_ID = "88888888-8888-4888-8888-888888888888";

function mark(
  studentId: string,
  overrides: {
    status?: string;
    source?: string;
    leaveRequestId?: string | null;
    minutesLate?: number | null;
  } = {},
) {
  return {
    studentId,
    status: overrides.status ?? "present",
    source: overrides.source ?? "manual",
    leaveRequestId: overrides.leaveRequestId ?? null,
    biometricTransactionId: null,
    minutesLate: overrides.minutesLate ?? null,
    remarks: null,
  };
}

function openInput() {
  return {
    institutionId: INSTITUTION_ID,
    sectionId: SECTION_ID,
    academicSessionId: SESSION_ID,
    attendanceDate: DATE,
    timeSlotId: TIME_SLOT_ID,
    totalStudents: 2,
  };
}

function submitInput() {
  return {
    institutionId: INSTITUTION_ID,
    sectionId: SECTION_ID,
    attendanceDate: DATE,
    timeSlotId: TIME_SLOT_ID,
  };
}

describe("opening a marking session", () => {
  let store: ReturnType<typeof createFakeAttendanceStore>;
  let service: ReturnType<typeof createAttendanceService>;

  beforeEach(() => {
    store = createFakeAttendanceStore();
    service = createAttendanceService(store);
  });

  it("opens a session for a section-period", async () => {
    const created = await service.openMarkingSession(openInput(), ACTOR);
    expect(created.id).toBeDefined();

    const session = await store.getMarkingSession(INSTITUTION_ID, SECTION_ID, DATE, TIME_SLOT_ID);
    expect(session).not.toBeNull();
    expect(session!.status).toBe("in_progress");
    expect(session!.totalStudents).toBe(2);
    expect(session!.openedByUserId).toBe(ACTOR);
  });

  it("returns the existing session instead of duplicating it", async () => {
    const first = await service.openMarkingSession(openInput(), ACTOR);
    const second = await service.openMarkingSession(openInput(), ACTOR);
    expect(second.id).toBe(first.id);
  });
});

describe("submitting a session", () => {
  let store: ReturnType<typeof createFakeAttendanceStore>;
  let service: ReturnType<typeof createAttendanceService>;

  beforeEach(async () => {
    store = createFakeAttendanceStore();
    service = createAttendanceService(store);
    await service.openMarkingSession(openInput(), ACTOR);
  });

  it("submits an open session", async () => {
    const result = await service.submitMarkingSession(submitInput(), ACTOR);
    expect(result.version).toBe(2);

    const session = await store.getMarkingSession(INSTITUTION_ID, SECTION_ID, DATE, TIME_SLOT_ID);
    expect(session!.status).toBe("submitted");
    expect(session!.submittedByUserId).toBe(ACTOR);
    expect(session!.submittedAt).not.toBeNull();
  });

  it("refuses to submit twice", async () => {
    await service.submitMarkingSession(submitInput(), ACTOR);
    await expect(service.submitMarkingSession(submitInput(), ACTOR)).rejects.toThrow(ConflictError);
  });

  it("refuses to submit a session that does not exist", async () => {
    await expect(
      service.submitMarkingSession(
        {
          institutionId: INSTITUTION_ID,
          sectionId: NON_EXISTENT_SECTION_ID,
          attendanceDate: DATE,
          timeSlotId: TIME_SLOT_ID,
        },
        ACTOR,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("marking students", () => {
  let store: ReturnType<typeof createFakeAttendanceStore>;
  let service: ReturnType<typeof createAttendanceService>;

  beforeEach(async () => {
    store = createFakeAttendanceStore();
    service = createAttendanceService(store);
    await service.openMarkingSession(openInput(), ACTOR);
  });

  it("marks every student in one write", async () => {
    const result = await service.markStudents(
      {
        ...openInput(),
        marks: [mark(STUDENT_A), mark(STUDENT_B, { status: "absent" })],
      },
      ACTOR,
    );
    expect(result.writtenCount).toBe(2);
    expect(result.correctedCount).toBe(0);

    const rows = await store.listMarks(INSTITUTION_ID, SECTION_ID, DATE, TIME_SLOT_ID);
    expect(rows).toHaveLength(2);
    expect(rows.find((r: { studentId: string; status: string }) => r.studentId === STUDENT_A)!.status).toBe("present");
    expect(rows.find((r: { studentId: string; status: string }) => r.studentId === STUDENT_B)!.status).toBe("absent");
  });

  it("corrects rather than duplicates on a second submit", async () => {
    await service.markStudents({ ...openInput(), marks: [mark(STUDENT_A)] }, ACTOR);
    const result = await service.markStudents(
      { ...openInput(), marks: [mark(STUDENT_A, { status: "late", minutesLate: 8 })] },
      ACTOR,
    );
    expect(result.writtenCount).toBe(0);
    expect(result.correctedCount).toBe(1);

    const rows = await store.listMarks(INSTITUTION_ID, SECTION_ID, DATE, TIME_SLOT_ID);
    expect(rows).toHaveLength(1);
    const firstRow = rows[0]!;
    expect(firstRow.status).toBe("late");
    expect(firstRow.minutesLate).toBe(8);
  });

  it("refuses to mark a submitted session", async () => {
    await service.submitMarkingSession(submitInput(), ACTOR);
    await expect(
      service.markStudents({ ...openInput(), marks: [mark(STUDENT_A)] }, ACTOR),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to mark a session that does not exist", async () => {
    await expect(
      service.markStudents(
        {
          institutionId: INSTITUTION_ID,
          sectionId: NON_EXISTENT_SECTION_ID,
          academicSessionId: SESSION_ID,
          attendanceDate: DATE,
          timeSlotId: TIME_SLOT_ID,
          marks: [mark(STUDENT_A)],
        },
        ACTOR,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses a mark that violates the leave/absence rule", async () => {
    await expect(
      service.markStudents(
        {
          ...openInput(),
          marks: [
            mark(STUDENT_A, {
              status: "leave",
              source: "derived_from_leave",
              leaveRequestId: null,
            }),
          ],
        },
        ACTOR,
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("refuses minutes on a present mark", async () => {
    await expect(
      service.markStudents({ ...openInput(), marks: [mark(STUDENT_A, { minutesLate: 5 })] }, ACTOR),
    ).rejects.toThrow(ValidationError);
  });
});

describe("correcting a mark", () => {
  let store: ReturnType<typeof createFakeAttendanceStore>;
  let service: ReturnType<typeof createAttendanceService>;

  beforeEach(async () => {
    store = createFakeAttendanceStore();
    service = createAttendanceService(store);
    await service.openMarkingSession(openInput(), ACTOR);
    await service.markStudents({ ...openInput(), marks: [mark(STUDENT_A)] }, ACTOR);
  });

  it("corrects present to absent with reason and author", async () => {
    const result = await service.correctMark(
      {
        institutionId: INSTITUTION_ID,
        sectionId: SECTION_ID,
        attendanceDate: DATE,
        timeSlotId: TIME_SLOT_ID,
        studentId: STUDENT_A,
        afterStatus: "absent",
        reason: "Parent called in sick.",
      },
      ACTOR,
    );
    expect(result.correctionId).toBeDefined();
    expect(result.mark.status).toBe("absent");
    expect(result.monthRecomputed).toBe(true);

    const rows = await store.listCorrections(
      SECTION_ID,
      DATE,
      TIME_SLOT_ID,
      STUDENT_A,
    );
    expect(rows).toHaveLength(1);
    const firstRow = rows[0]!;
    expect(firstRow.beforeStatus).toBe("present");
    expect(firstRow.afterStatus).toBe("absent");
    expect(firstRow.correctedByUserId).toBe(ACTOR);
  });

  it("refuses a no-change correction", async () => {
    await expect(
      service.correctMark(
        {
          institutionId: INSTITUTION_ID,
          sectionId: SECTION_ID,
          attendanceDate: DATE,
          timeSlotId: TIME_SLOT_ID,
          studentId: STUDENT_A,
          afterStatus: "present",
          reason: "typo",
        },
        ACTOR,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses correcting a mark that does not exist", async () => {
    await expect(
      service.correctMark(
        {
          institutionId: INSTITUTION_ID,
          sectionId: SECTION_ID,
          attendanceDate: DATE,
          timeSlotId: TIME_SLOT_ID,
          studentId: NON_EXISTENT_STUDENT_ID,
          afterStatus: "absent",
          reason: "nope",
        },
        ACTOR,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
