import { describe, expect, it } from "vitest";

import { BusinessRuleError, ConflictError, ValidationError } from "@/shared/errors";

import {
  assertCanLockSchedule,
  assertCanModifySchedule,
  assertCanPublishSchedule,
  assertNoConflicts,
  assertNotBreakSlot,
  detectAllConflicts,
  detectBatchConflicts,
  detectBreakSlotConflict,
  detectPeriodConflict,
  doTimeIntervalsOverlap,
  parseTimeToMinutes,
  validateTimeSlotBoundaries,
  type SchedulePeriod,
  type TimeSlotBoundary,
} from "./schedule-rules";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const SLOT_1 = "33333333-3333-4333-8333-333333333331";
const SLOT_2 = "33333333-3333-4333-8333-333333333332";

const SECTION_ALPHA = "44444444-4444-4444-8444-444444444441";
const SECTION_BETA = "44444444-4444-4444-8444-444444444442";

const TEACHER_AHMED = "55555555-5555-4555-8555-555555555551";
const TEACHER_FATIMA = "55555555-5555-4555-8555-555555555552";

const ROOM_101 = "66666666-6666-4666-8666-666666666661";
const ROOM_102 = "66666666-6666-4666-8666-666666666662";

describe("schedule-rules domain logic", () => {
  describe("time parsing and boundaries", () => {
    it("parses valid 24h clock times into minutes from midnight", () => {
      expect(parseTimeToMinutes("08:00")).toBe(480);
      expect(parseTimeToMinutes("08:45:00")).toBe(525);
      expect(parseTimeToMinutes("13:30")).toBe(810);
      expect(parseTimeToMinutes("00:00")).toBe(0);
      expect(parseTimeToMinutes("23:59")).toBe(1439);
    });

    it("refuses invalid time formats and out-of-range values", () => {
      expect(() => parseTimeToMinutes("invalid")).toThrow(ValidationError);
      expect(() => parseTimeToMinutes("25:00")).toThrow(ValidationError);
      expect(() => parseTimeToMinutes("12:60")).toThrow(ValidationError);
      expect(() => parseTimeToMinutes("-1:20")).toThrow(ValidationError);
    });

    it("validates time slot order (start must precede end)", () => {
      expect(() => validateTimeSlotBoundaries("08:00", "08:45")).not.toThrow();
      expect(() => validateTimeSlotBoundaries("08:45", "08:00")).toThrow(BusinessRuleError);
      expect(() => validateTimeSlotBoundaries("09:00", "09:00")).toThrow(BusinessRuleError);
    });

    it("correctly identifies overlapping and non-overlapping time intervals", () => {
      // Overlap: 08:00-09:00 and 08:30-09:30
      expect(doTimeIntervalsOverlap("08:00", "09:00", "08:30", "09:30")).toBe(true);
      // Abutting intervals do not overlap: 08:00-09:00 and 09:00-10:00
      expect(doTimeIntervalsOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
      // Disjoint intervals: 08:00-08:45 and 10:00-10:45
      expect(doTimeIntervalsOverlap("08:00", "08:45", "10:00", "10:45")).toBe(false);
    });

    it("refuses scheduling classes in break slots", () => {
      expect(() => assertNotBreakSlot({ isBreak: false, name: "Period 1" })).not.toThrow();
      expect(() => assertNotBreakSlot({ isBreak: true, name: "Lunch Break" })).toThrow(
        BusinessRuleError,
      );
    });
  });

  describe("conflict detection", () => {
    const existingPeriod: SchedulePeriod = {
      id: "77777777-7777-4777-8777-777777777771",
      academicSessionId: SESSION_A,
      sectionId: SECTION_ALPHA,
      timeSlotId: SLOT_1,
      teacherId: TEACHER_AHMED,
      floorId: ROOM_101,
      kind: "lesson",
      status: "draft",
    };

    it("detects teacher double-booking when teacher is scheduled in 2 places simultaneously", () => {
      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_BETA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_102,
        kind: "lesson",
      };

      const conflict = detectPeriodConflict(candidate, existingPeriod);
      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe("teacher_double_booked");
      expect(conflict?.userMessage).toContain("This teacher is already scheduled");
    });

    it("detects room double-booking when room hosts 2 classes simultaneously", () => {
      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_BETA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_FATIMA,
        floorId: ROOM_101,
        kind: "lesson",
      };

      const conflict = detectPeriodConflict(candidate, existingPeriod);
      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe("room_double_booked");
      expect(conflict?.userMessage).toContain("This room or floor is already occupied");
    });

    it("detects section double-booking when section has 2 periods simultaneously", () => {
      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_FATIMA,
        floorId: ROOM_102,
        kind: "lesson",
      };

      const conflict = detectPeriodConflict(candidate, existingPeriod);
      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe("section_double_booked");
      expect(conflict?.userMessage).toContain("This class section already has another period scheduled");
    });

    it("allows non-conflicting periods in different slots", () => {
      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_2, // Different slot
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "lesson",
      };

      const conflict = detectPeriodConflict(candidate, existingPeriod);
      expect(conflict).toBeNull();
    });

    it("allows non-conflicting periods in different sessions", () => {
      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_B, // Different academic session
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "lesson",
      };

      const conflict = detectPeriodConflict(candidate, existingPeriod);
      expect(conflict).toBeNull();
    });

    it("exempts free periods from generating conflicts", () => {
      const freeCandidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_BETA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "free",
      };

      expect(detectPeriodConflict(freeCandidate, existingPeriod)).toBeNull();

      const freeExisting: SchedulePeriod = {
        ...existingPeriod,
        kind: "free",
      };
      const lessonCandidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "lesson",
      };

      expect(detectPeriodConflict(lessonCandidate, freeExisting)).toBeNull();
    });

    it("does not report conflict against itself when updating", () => {
      const selfUpdate: SchedulePeriod = {
        id: existingPeriod.id, // Same ID
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "lesson",
      };

      expect(detectPeriodConflict(selfUpdate, existingPeriod)).toBeNull();
    });

    it("detects all conflicts against an array of existing periods", () => {
      const existingList: SchedulePeriod[] = [
        existingPeriod,
        {
          id: "77777777-7777-4777-8777-777777777772",
          academicSessionId: SESSION_A,
          sectionId: SECTION_BETA,
          timeSlotId: SLOT_1,
          teacherId: TEACHER_FATIMA,
          floorId: ROOM_102,
          kind: "lesson",
        },
      ];

      // Conflicts with section alpha in slot 1
      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_1,
        teacherId: null,
        floorId: null,
        kind: "lesson",
      };

      const conflicts = detectAllConflicts(candidate, existingList);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.type).toBe("section_double_booked");
    });

    it("assertNoConflicts throws ConflictError when conflicts exist", () => {
      const conflicts = [
        {
          type: "teacher_double_booked" as const,
          message: "Teacher is double booked.",
          userMessage: "Teacher is double booked.",
          timeSlotId: SLOT_1,
          sectionId: SECTION_ALPHA,
        },
      ];

      expect(() => assertNoConflicts(conflicts)).toThrow(ConflictError);
    });

    it("assertNoConflicts does not throw when conflicts list is empty", () => {
      expect(() => assertNoConflicts([])).not.toThrow();
    });

    it("detects teacher double-booking across overlapping time slots", () => {
      const slotA: TimeSlotBoundary = {
        id: SLOT_1,
        startTime: "08:00",
        endTime: "09:00",
        sequence: 1,
        isBreak: false,
      };
      const slotB: TimeSlotBoundary = {
        id: SLOT_2,
        startTime: "08:30",
        endTime: "09:30",
        sequence: 2,
        isBreak: false,
      };

      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_BETA,
        timeSlotId: SLOT_2,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_102,
        kind: "lesson",
        timeSlot: slotB,
      };

      const existingWithSlot: SchedulePeriod = {
        ...existingPeriod,
        timeSlot: slotA,
      };

      const conflict = detectPeriodConflict(candidate, existingWithSlot);
      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe("teacher_double_booked");
      expect(conflict?.userMessage).toBe(
        "This teacher is already scheduled to teach another class during this time period.",
      );
    });

    it("detects room collision across overlapping time slots", () => {
      const slotA: TimeSlotBoundary = {
        id: SLOT_1,
        startTime: "08:00",
        endTime: "09:00",
        sequence: 1,
        isBreak: false,
      };
      const slotB: TimeSlotBoundary = {
        id: SLOT_2,
        startTime: "08:30",
        endTime: "09:30",
        sequence: 2,
        isBreak: false,
      };

      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_BETA,
        timeSlotId: SLOT_2,
        teacherId: TEACHER_FATIMA,
        floorId: ROOM_101, // Same room
        kind: "lesson",
        timeSlot: slotB,
      };

      const existingWithSlot: SchedulePeriod = {
        ...existingPeriod,
        timeSlot: slotA,
      };

      const conflict = detectPeriodConflict(candidate, existingWithSlot);
      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe("room_double_booked");
      expect(conflict?.userMessage).toBe(
        "This room or floor is already occupied by another class during this time period.",
      );
    });

    it("detects section double-booking across overlapping time slots", () => {
      const slotA: TimeSlotBoundary = {
        id: SLOT_1,
        startTime: "08:00",
        endTime: "09:00",
        sequence: 1,
        isBreak: false,
      };
      const slotB: TimeSlotBoundary = {
        id: SLOT_2,
        startTime: "08:30",
        endTime: "09:30",
        sequence: 2,
        isBreak: false,
      };

      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA, // Same section
        timeSlotId: SLOT_2,
        teacherId: TEACHER_FATIMA,
        floorId: ROOM_102,
        kind: "lesson",
        timeSlot: slotB,
      };

      const existingWithSlot: SchedulePeriod = {
        ...existingPeriod,
        timeSlot: slotA,
      };

      const conflict = detectPeriodConflict(candidate, existingWithSlot);
      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe("section_double_booked");
      expect(conflict?.userMessage).toBe(
        "This class section already has another period scheduled at this time.",
      );
    });

    it("does not report conflict when different time slots do not overlap", () => {
      const slotA: TimeSlotBoundary = {
        id: SLOT_1,
        startTime: "08:00",
        endTime: "09:00",
        sequence: 1,
        isBreak: false,
      };
      const slotB: TimeSlotBoundary = {
        id: SLOT_2,
        startTime: "09:00", // Abutting, non-overlapping
        endTime: "10:00",
        sequence: 2,
        isBreak: false,
      };

      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_2,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "lesson",
        timeSlot: slotB,
      };

      const existingWithSlot: SchedulePeriod = {
        ...existingPeriod,
        timeSlot: slotA,
      };

      const conflict = detectPeriodConflict(candidate, existingWithSlot);
      expect(conflict).toBeNull();
    });

    it("detects break slot conflict via detectBreakSlotConflict", () => {
      const breakSlot: TimeSlotBoundary = {
        id: SLOT_1,
        startTime: "12:00",
        endTime: "12:45",
        sequence: 5,
        isBreak: true,
        name: "Lunch Break",
      };

      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "lesson",
        timeSlot: breakSlot,
      };

      const conflict = detectBreakSlotConflict(candidate);
      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe("break_slot_conflict");
      expect(conflict?.userMessage).toBe(
        "Classes cannot be scheduled during break, lunch, or assembly periods.",
      );

      // Free period does not trigger break conflict
      const freeCandidate: SchedulePeriod = {
        ...candidate,
        kind: "free",
      };
      expect(detectBreakSlotConflict(freeCandidate)).toBeNull();
    });

    it("includes break slot conflicts when running detectAllConflicts with slot resolver", () => {
      const breakSlot: TimeSlotBoundary = {
        id: SLOT_1,
        startTime: "12:00",
        endTime: "12:45",
        sequence: 5,
        isBreak: true,
        name: "Lunch Break",
      };

      const candidate: SchedulePeriod = {
        academicSessionId: SESSION_A,
        sectionId: SECTION_ALPHA,
        timeSlotId: SLOT_1,
        teacherId: TEACHER_AHMED,
        floorId: ROOM_101,
        kind: "lesson",
      };

      const conflicts = detectAllConflicts(candidate, [], [breakSlot]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.type).toBe("break_slot_conflict");
    });
  });

  describe("batch conflict detection", () => {
    it("detects conflicts between candidates themselves within the proposed batch", () => {
      const batchCandidates: SchedulePeriod[] = [
        {
          academicSessionId: SESSION_A,
          sectionId: SECTION_ALPHA,
          timeSlotId: SLOT_1,
          teacherId: TEACHER_AHMED,
          floorId: ROOM_101,
          kind: "lesson",
        },
        {
          academicSessionId: SESSION_A,
          sectionId: SECTION_BETA,
          timeSlotId: SLOT_1,
          teacherId: TEACHER_AHMED, // Same teacher in same slot
          floorId: ROOM_102,
          kind: "lesson",
        },
      ];

      const conflicts = detectBatchConflicts(batchCandidates, []);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.type).toBe("teacher_double_booked");
    });
  });

  describe("lifecycle status guards", () => {
    it("allows modifying and publishing draft or published schedules", () => {
      expect(() => assertCanModifySchedule("draft")).not.toThrow();
      expect(() => assertCanModifySchedule("published")).not.toThrow();
      expect(() => assertCanPublishSchedule("draft")).not.toThrow();
      expect(() => assertCanPublishSchedule("published")).not.toThrow();
    });

    it("prevents modifying or publishing locked schedules", () => {
      expect(() => assertCanModifySchedule("locked")).toThrow(BusinessRuleError);
      expect(() => assertCanPublishSchedule("locked")).toThrow(BusinessRuleError);
    });

    it("prevents locking an already locked schedule", () => {
      expect(() => assertCanLockSchedule("draft")).not.toThrow();
      expect(() => assertCanLockSchedule("published")).not.toThrow();
      expect(() => assertCanLockSchedule("locked")).toThrow(ConflictError);
    });
  });
});
