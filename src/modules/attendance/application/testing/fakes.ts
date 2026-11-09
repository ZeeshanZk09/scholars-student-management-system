/**
 * In-memory `AttendanceStore` for testing the attendance service without a database
 * (`src/modules/README.md`: ports in, Drizzle out). Mirrors the database's integrity rules
 * — composite keys, leave/absence pairing, corrections append-only — so a service test against
 * this fake is a service test against the real contract.
 */
import type {
  AttendanceCorrectionRow,
  AttendanceRecordRow,
  AttendanceSessionRow,
  AttendanceStore,
  DailyAttendanceSummaryRow,
  StudentSectionRosterItem,
} from "../ports";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function markKey(
  sectionId: string,
  attendanceDate: string,
  timeSlotId: string,
  studentId: string,
): string {
  return [sectionId, attendanceDate, timeSlotId, studentId].join("\u0000");
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createFakeAttendanceStore(): AttendanceStore {
  const sessions = new Map<string, AttendanceSessionRow>();
  const records = new Map<string, AttendanceRecordRow>();
  const corrections = new Map<string, AttendanceCorrectionRow>();
  const summaries = new Map<string, DailyAttendanceSummaryRow>();
  const rosterCache = new Map<string, readonly StudentSectionRosterItem[]>();

  return {
    /* ---- Sessions ------------------------------------------------------ */

    async findSession(sectionId, attendanceDate, timeSlotId) {
      return (
        [...sessions.values()].find(
          (s) =>
            s.sectionId === sectionId &&
            s.attendanceDate === attendanceDate &&
            s.timeSlotId === timeSlotId,
        ) ?? null
      );
    },

    async getMarkingSession(_institutionId: string, sectionId: string, attendanceDate: string, timeSlotId: string) {
      return this.findSession(sectionId, attendanceDate, timeSlotId);
    },

    async openSession(data, openedByUserId) {
      const existing = await this.findSession(data.sectionId, data.attendanceDate, data.timeSlotId);
      if (existing !== null) {
        return existing;
      }

      const id = crypto.randomUUID();
      const now = new Date();
      const session: AttendanceSessionRow = {
        id,
        institutionId: "",
        sectionId: data.sectionId,
        academicSessionId: data.academicSessionId,
        attendanceDate: data.attendanceDate,
        timeSlotId: data.timeSlotId,
        scheduleId: data.scheduleId ?? null,
        status: "in_progress",
        totalStudents: data.totalStudents,
        markedCount: 0,
        openedByUserId,
        openedAt: now,
        submittedByUserId: null,
        submittedAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      sessions.set(id, session);
      return session;
    },

    async submitSession(write) {
      const session = [...sessions.values()].find(
        (s) =>
          s.sectionId === write.sectionId &&
          s.attendanceDate === write.attendanceDate &&
          s.timeSlotId === write.timeSlotId,
      );
      if (session === undefined) {
        throw new Error("session not found");
      }
      const updatedSession: AttendanceSessionRow = {
        ...session,
        status: "submitted",
        submittedByUserId: write.submittedByUserId,
        submittedAt: new Date(),
        updatedAt: new Date(),
        version: session.version + 1,
      };
      sessions.set(session.id, updatedSession);
      return { version: updatedSession.version };
    },

    /* ---- Marks --------------------------------------------------------- */

    async saveMarks(data, userId) {
      let written = 0;
      let corrected = 0;

      for (const mark of data.marks) {
        const key = markKey(data.sectionId, data.attendanceDate, data.timeSlotId, mark.studentId);
        const now = new Date();
        const existing = records.get(key);

        const record: AttendanceRecordRow = {
          sectionId: data.sectionId,
          attendanceDate: data.attendanceDate,
          timeSlotId: data.timeSlotId,
          studentId: mark.studentId,
          status: mark.status,
          source: mark.source ?? "manual",
          leaveRequestId: mark.leaveRequestId ?? null,
          biometricTransactionId: null,
          minutesLate: mark.minutesLate ?? null,
          markedByUserId: userId,
          markedAt: now,
          remarks: mark.remarks ?? null,
          createdAt: now,
          updatedAt: now,
          version: existing ? existing.version + 1 : 1,
        };

        if (existing === undefined) {
          records.set(key, record);
          written += 1;
        } else {
          corrections.set(
            markKey(data.sectionId, data.attendanceDate, data.timeSlotId, mark.studentId),
            {
              id: crypto.randomUUID(),
              sectionId: data.sectionId,
              attendanceDate: data.attendanceDate,
              timeSlotId: data.timeSlotId,
              studentId: mark.studentId,
              beforeStatus: existing.status,
              afterStatus: mark.status,
              reason: "Duplicate submit — corrected to new status.",
              correctedByUserId: userId,
              correctedAt: now,
              guardianDisputedAt: null,
            },
          );
          records.set(key, record);
          corrected += 1;
        }
      }

      let session = [...sessions.values()].find(
        (s) =>
          s.sectionId === data.sectionId &&
          s.attendanceDate === data.attendanceDate &&
          s.timeSlotId === data.timeSlotId,
      );
      if (session === undefined) {
        session = await this.openSession(
          {
            sectionId: data.sectionId,
            academicSessionId: data.academicSessionId,
            attendanceDate: data.attendanceDate,
            timeSlotId: data.timeSlotId,
            scheduleId: data.scheduleId ?? null,
            totalStudents: data.marks.length,
          },
          userId,
        );
      } else {
        session = {
          ...session,
          markedCount: Math.min(data.marks.length, session.totalStudents),
          updatedAt: new Date(),
        };
        sessions.set(session.id, session);
      }

      return {
        session,
        recordsCount: data.marks.length,
        writtenCount: written,
        correctedCount: corrected,
      };
    },

    async listMarks(_institutionId, sectionId, attendanceDate, timeSlotId) {
      return [...records.values()].filter(
        (m) =>
          m.sectionId === sectionId &&
          m.attendanceDate === attendanceDate &&
          m.timeSlotId === timeSlotId,
      );
    },

    async listStudentMarks(_institutionId, studentId, fromDate, toDate) {
      return [...records.values()].filter(
        (m) =>
          m.studentId === studentId && m.attendanceDate >= fromDate && m.attendanceDate <= toDate,
      );
    },

    async getAttendanceRecord(sectionId, attendanceDate, timeSlotId, studentId) {
      return records.get(markKey(sectionId, attendanceDate, timeSlotId, studentId)) ?? null;
    },

    /* ---- Corrections --------------------------------------------------- */

    async recordCorrection(data, beforeStatus, correctedByUserId) {
      const key = markKey(data.sectionId, data.attendanceDate, data.timeSlotId, data.studentId);
      const existing = records.get(key);
      if (existing === undefined) {
        throw new Error("mark not found");
      }

      const now = new Date();
      const updatedRecord: AttendanceRecordRow = {
        ...existing,
        status: data.afterStatus,
        updatedAt: now,
        version: existing.version + 1,
      };
      records.set(key, updatedRecord);

      const correction: AttendanceCorrectionRow = {
        id: crypto.randomUUID(),
        sectionId: data.sectionId,
        attendanceDate: data.attendanceDate,
        timeSlotId: data.timeSlotId,
        studentId: data.studentId,
        beforeStatus,
        afterStatus: data.afterStatus,
        reason: data.reason,
        correctedByUserId,
        correctedAt: now,
        guardianDisputedAt: null,
      };
      corrections.set(key, correction);

      return correction;
    },

    async listCorrections(sectionId, attendanceDate, timeSlotId, studentId) {
      return [...corrections.values()].filter(
        (c) =>
          c.sectionId === sectionId &&
          c.attendanceDate === attendanceDate &&
          c.timeSlotId === timeSlotId &&
          (!studentId || c.studentId === studentId),
      );
    },

    /* ---- Sheet / roster / summary -------------------------------------- */

    async getSectionAttendanceSheet(sectionId, attendanceDate, timeSlotId) {
      const session = await this.findSession(sectionId, attendanceDate, timeSlotId);
      const recordList = await this.listMarks("", sectionId, attendanceDate, timeSlotId);
      const roster = await this.listSectionRoster(sectionId);
      const correctionList = await this.listCorrections(sectionId, attendanceDate, timeSlotId);
      return {
        session,
        records: recordList,
        roster,
        corrections: correctionList,
      };
    },

    async listSectionRoster(sectionId) {
      const cached = rosterCache.get(sectionId);
      if (cached !== undefined) {
        return cached;
      }
      const list: StudentSectionRosterItem[] = [];
      rosterCache.set(sectionId, list);
      return list;
    },

    async getStudentMonthlySummary(studentId, month) {
      return summaries.get([studentId, month].join("\u0000")) ?? null;
    },

    async getStudentMonthSummary(_institutionId, studentId, month, academicSessionId) {
      return this.getStudentMonthlySummary(studentId, month, academicSessionId);
    },

    async recomputeStudentMonthSummary(write) {
      const key = [write.studentId, write.month].join("\u0000");
      const existing = summaries.get(key);
      if (existing === undefined) {
        summaries.set(key, {
          studentId: write.studentId,
          month: write.month,
          academicSessionId: write.academicSessionId,
          markedPeriods: 0,
          presentCount: 0,
          absentCount: 0,
          lateCount: 0,
          leaveCount: 0,
          isComplete: false,
          calculatedAt: new Date(),
        });
        return;
      }
      summaries.set(key, { ...existing, calculatedAt: new Date() });
    },

    async listDailySessions(sectionIds, date) {
      if (sectionIds.length === 0) {
        return [];
      }
      return [...sessions.values()].filter(
        (s) => sectionIds.includes(s.sectionId) && s.attendanceDate === date,
      );
    },
  };
}

export type FakeAttendanceStore = ReturnType<typeof createFakeAttendanceStore>;
