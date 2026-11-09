/**
 * In-memory {@link SchedulingStore} for use cases and service unit tests.
 *
 * Simulates persistence, transactional isolation, and unique constraint conflicts
 * without connecting to PostgreSQL or Drizzle.
 */

import { randomUUID } from "node:crypto";

import { NotFoundError } from "@/shared/errors";

import type {
  CreateScheduleData,
  LockSchedulesParams,
  PublishSchedulesParams,
  SchedulePublishHistoryRow,
  ScheduleRow,
  ScheduleViewRow,
  SchedulingStore,
  TimeSlotRow,
  UpdateScheduleData,
} from "../ports";

export interface FakeSchedulingStore extends SchedulingStore {
  readonly schedules: ScheduleRow[];
  readonly timeSlots: TimeSlotRow[];
  readonly publishHistory: SchedulePublishHistoryRow[];
  seedTimeSlot(slot: TimeSlotRow): void;
  seedSchedule(schedule: ScheduleRow): void;
}

export function createFakeSchedulingStore(
  initialSlots: readonly TimeSlotRow[] = [],
  initialSchedules: readonly ScheduleRow[] = [],
): FakeSchedulingStore {
  const timeSlots: TimeSlotRow[] = [...initialSlots];
  const schedules: ScheduleRow[] = [...initialSchedules];
  const publishHistory: SchedulePublishHistoryRow[] = [];

  const store: FakeSchedulingStore = {
    schedules,
    timeSlots,
    publishHistory,

    seedTimeSlot(slot: TimeSlotRow) {
      timeSlots.push(slot);
    },

    seedSchedule(schedule: ScheduleRow) {
      schedules.push(schedule);
    },

    async getScheduleById(id: string): Promise<ScheduleRow | null> {
      const found = schedules.find((s) => s.id === id);
      return found ?? null;
    },

    async getScheduleViewById(id: string): Promise<ScheduleViewRow | null> {
      const found = schedules.find((s) => s.id === id);
      if (!found) return null;
      const slot = timeSlots.find((t) => t.id === found.timeSlotId);

      return {
        ...found,
        timeSlotName: slot?.name ?? null,
        timeSlotStartTime: slot?.startTime ?? null,
        timeSlotEndTime: slot?.endTime ?? null,
        timeSlotSequence: slot?.sequence ?? null,
        timeSlotIsBreak: slot?.isBreak ?? null,
      };
    },

    async findScheduleBySectionAndSlot(
      sectionId: string,
      academicSessionId: string,
      timeSlotId: string,
    ): Promise<ScheduleRow | null> {
      const found = schedules.find(
        (s) =>
          s.sectionId === sectionId &&
          s.academicSessionId === academicSessionId &&
          s.timeSlotId === timeSlotId,
      );
      return found ?? null;
    },

    async listActiveSchedulesForSlot(
      academicSessionId: string,
      timeSlotId: string,
    ): Promise<readonly ScheduleRow[]> {
      return schedules.filter(
        (s) => s.academicSessionId === academicSessionId && s.timeSlotId === timeSlotId,
      );
    },

    async listSchedulesBySection(
      sectionId: string,
      academicSessionId: string,
    ): Promise<readonly ScheduleViewRow[]> {
      const matched = schedules.filter(
        (s) => s.sectionId === sectionId && s.academicSessionId === academicSessionId,
      );

      return matched.map((sched) => {
        const slot = timeSlots.find((t) => t.id === sched.timeSlotId);
        return {
          ...sched,
          timeSlotName: slot?.name ?? null,
          timeSlotStartTime: slot?.startTime ?? null,
          timeSlotEndTime: slot?.endTime ?? null,
          timeSlotSequence: slot?.sequence ?? null,
          timeSlotIsBreak: slot?.isBreak ?? null,
        };
      });
    },

    async listSchedulesBySession(
      academicSessionId: string,
    ): Promise<readonly ScheduleViewRow[]> {
      const matched = schedules.filter((s) => s.academicSessionId === academicSessionId);

      return matched.map((sched) => {
        const slot = timeSlots.find((t) => t.id === sched.timeSlotId);
        return {
          ...sched,
          timeSlotName: slot?.name ?? null,
          timeSlotStartTime: slot?.startTime ?? null,
          timeSlotEndTime: slot?.endTime ?? null,
          timeSlotSequence: slot?.sequence ?? null,
          timeSlotIsBreak: slot?.isBreak ?? null,
        };
      });
    },

    async listSchedulesByTeacher(
      teacherId: string,
      academicSessionId: string,
    ): Promise<readonly ScheduleViewRow[]> {
      const matched = schedules.filter(
        (s) => s.teacherId === teacherId && s.academicSessionId === academicSessionId,
      );

      return matched.map((sched) => {
        const slot = timeSlots.find((t) => t.id === sched.timeSlotId);
        return {
          ...sched,
          timeSlotName: slot?.name ?? null,
          timeSlotStartTime: slot?.startTime ?? null,
          timeSlotEndTime: slot?.endTime ?? null,
          timeSlotSequence: slot?.sequence ?? null,
          timeSlotIsBreak: slot?.isBreak ?? null,
        };
      });
    },

    async listSchedulesByFloor(
      floorId: string,
      academicSessionId: string,
    ): Promise<readonly ScheduleViewRow[]> {
      const matched = schedules.filter(
        (s) => s.floorId === floorId && s.academicSessionId === academicSessionId,
      );

      return matched.map((sched) => {
        const slot = timeSlots.find((t) => t.id === sched.timeSlotId);
        return {
          ...sched,
          timeSlotName: slot?.name ?? null,
          timeSlotStartTime: slot?.startTime ?? null,
          timeSlotEndTime: slot?.endTime ?? null,
          timeSlotSequence: slot?.sequence ?? null,
          timeSlotIsBreak: slot?.isBreak ?? null,
        };
      });
    },

    async getTimeSlot(id: string): Promise<TimeSlotRow | null> {
      const found = timeSlots.find((t) => t.id === id);
      return found ?? null;
    },

    async listTimeSlots(
      institutionId: string,
      academicSessionId?: string | null,
    ): Promise<readonly TimeSlotRow[]> {
      return timeSlots.filter(
        (t) =>
          t.institutionId === institutionId &&
          (academicSessionId === undefined ||
            t.academicSessionId === null ||
            t.academicSessionId === academicSessionId),
      );
    },

    async assignScheduleSlot(data: CreateScheduleData): Promise<ScheduleRow> {
      const existingIndex = schedules.findIndex(
        (s) =>
          s.sectionId === data.sectionId &&
          s.academicSessionId === data.academicSessionId &&
          s.timeSlotId === data.timeSlotId,
      );

      const now = new Date();

      if (existingIndex >= 0) {
        const existing = schedules[existingIndex];
        if (!existing) throw new NotFoundError("Schedule row missing.");

        const updated: ScheduleRow = {
          ...existing,
          subjectId: data.subjectId ?? null,
          teacherId: data.teacherId ?? null,
          floorId: data.floorId ?? null,
          kind: data.kind ?? existing.kind,
          status: data.status ?? existing.status,
          updatedAt: now,
          version: existing.version + 1,
        };
        schedules[existingIndex] = updated;
        return updated;
      }

      const created: ScheduleRow = {
        id: randomUUID(),
        institutionId: data.institutionId,
        academicSessionId: data.academicSessionId,
        sectionId: data.sectionId,
        subjectId: data.subjectId ?? null,
        teacherId: data.teacherId ?? null,
        timeSlotId: data.timeSlotId,
        floorId: data.floorId ?? null,
        kind: data.kind ?? "lesson",
        status: data.status ?? "draft",
        replacementAssignmentId: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };

      schedules.push(created);
      return created;
    },

    async updateScheduleSlot(id: string, data: UpdateScheduleData): Promise<ScheduleRow> {
      const index = schedules.findIndex((s) => s.id === id);
      if (index === -1) {
        throw new NotFoundError(`Schedule with id "${id}" does not exist.`);
      }

      const current = schedules[index];
      if (!current) throw new NotFoundError("Schedule row missing.");

      const updated: ScheduleRow = {
        ...current,
        ...(data.subjectId !== undefined ? { subjectId: data.subjectId } : {}),
        ...(data.teacherId !== undefined ? { teacherId: data.teacherId } : {}),
        ...(data.floorId !== undefined ? { floorId: data.floorId } : {}),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        updatedAt: new Date(),
        version: current.version + 1,
      };

      schedules[index] = updated;
      return updated;
    },

    async deleteScheduleSlot(id: string): Promise<void> {
      const index = schedules.findIndex((s) => s.id === id);
      if (index === -1) {
        throw new NotFoundError(`Schedule with id "${id}" does not exist.`);
      }
      schedules.splice(index, 1);
    },

    async publishSchedules(
      params: PublishSchedulesParams,
    ): Promise<{ readonly publishedCount: number }> {
      let count = 0;
      const now = new Date();

      for (let i = 0; i < schedules.length; i++) {
        const sched = schedules[i];
        if (!sched) continue;

        if (
          sched.academicSessionId === params.academicSessionId &&
          sched.institutionId === params.institutionId &&
          sched.status === "draft" &&
          (params.sectionId === undefined || sched.sectionId === params.sectionId)
        ) {
          schedules[i] = {
            ...sched,
            status: "published",
            updatedAt: now,
            version: sched.version + 1,
          };

          publishHistory.push({
            id: randomUUID(),
            scheduleId: sched.id,
            academicSessionId: params.academicSessionId,
            fromStatus: "draft",
            toStatus: "published",
            publishedAt: now,
            publishedByUserId: params.publishedByUserId,
            reason: params.reason ?? null,
          });

          count++;
        }
      }

      return { publishedCount: count };
    },

    async lockSchedules(params: LockSchedulesParams): Promise<{ readonly lockedCount: number }> {
      let count = 0;
      const now = new Date();

      for (let i = 0; i < schedules.length; i++) {
        const sched = schedules[i];
        if (!sched) continue;

        if (
          sched.academicSessionId === params.academicSessionId &&
          sched.institutionId === params.institutionId &&
          sched.status !== "locked"
        ) {
          const fromStatus = sched.status;
          schedules[i] = {
            ...sched,
            status: "locked",
            updatedAt: now,
            version: sched.version + 1,
          };

          publishHistory.push({
            id: randomUUID(),
            scheduleId: sched.id,
            academicSessionId: params.academicSessionId,
            fromStatus,
            toStatus: "locked",
            publishedAt: now,
            publishedByUserId: params.lockedByUserId,
            reason: params.reason ?? null,
          });

          count++;
        }
      }

      return { lockedCount: count };
    },

    async batchAssignSlots(
      academicSessionId: string,
      institutionId: string,
      slots: readonly CreateScheduleData[],
    ): Promise<readonly ScheduleRow[]> {
      const results: ScheduleRow[] = [];
      for (const slot of slots) {
        const assigned = await store.assignScheduleSlot({
          ...slot,
          academicSessionId,
          institutionId,
        });
        results.push(assigned);
      }
      return results;
    },

    async listPublishHistory(
      academicSessionId: string,
      scheduleId?: string,
    ): Promise<readonly SchedulePublishHistoryRow[]> {
      return publishHistory.filter(
        (h) =>
          h.academicSessionId === academicSessionId &&
          (scheduleId === undefined || h.scheduleId === scheduleId),
      );
    },
  };

  return store;
}
