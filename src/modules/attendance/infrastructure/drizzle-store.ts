/**
 * The Drizzle implementation of {@link AttendanceStore}.
 *
 * Implements data persistence for attendance sessions, records, corrections, and summaries.
 * Maps to `attendance_sessions`, `attendance_records`, `attendance_corrections`, `daily_attendance_summaries`.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import {
  attendanceCorrections,
  attendanceRecords,
  attendanceSessions,
  dailyAttendanceSummaries,
  studentPlacements,
  students,
} from "@/db/schema";
import { ConflictError } from "@/shared/errors";
import type { AttendanceStatus } from "../domain/attendance-rules";

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function uniqueConflictError(error: unknown): ConflictError | null {
  if (!isUniqueViolation(error)) return null;
  const message = error instanceof Error ? error.message : "";

  if (message.includes("attendance_sessions_slot_key")) {
    return new ConflictError(
      "An attendance session already exists for this section, date, and period.",
      {
        userMessage: "An attendance register is already open or submitted for this period today.",
      },
    );
  }

  if (message.includes("attendance_corrections_one_per_mark_key")) {
    return new ConflictError(
      "An attendance correction has already been submitted for this student and period today.",
      {
        userMessage: "A correction has already been recorded for this student in this period.",
      },
    );
  }

  if (message.includes("attendance_records_pkey") || message.includes("attendance_records")) {
    return new ConflictError(
      "An attendance mark already exists for this student and period.",
      {
        userMessage: "This student already has an attendance mark recorded for this period.",
      },
    );
  }

  return new ConflictError("The attendance operation conflicts with existing records.", {
    userMessage: "This attendance record conflicts with existing data.",
  });
}
import type {
  AttendanceCorrectionRow,
  AttendanceRecordRow,
  AttendanceSessionRow,
  AttendanceSheetView,
  AttendanceStore,
  DailyAttendanceSummaryRow,
  OpenAttendanceSessionPortInput,
  RecordAttendanceCorrectionPortInput,
  SaveAttendanceMarksPortInput,
  StudentSectionRosterItem,
} from "../application/ports";

function toAttendanceRecordRow(row: typeof attendanceRecords.$inferSelect): AttendanceRecordRow {
  return {
    sectionId: row.sectionId,
    attendanceDate: row.attendanceDate,
    timeSlotId: row.timeSlotId,
    studentId: row.studentId,
    status: row.status as AttendanceStatus,
    source: row.source,
    leaveRequestId: row.leaveRequestId,
    biometricTransactionId: row.biometricTransactionId,
    minutesLate: row.minutesLate,
    markedByUserId: row.markedByUserId,
    markedAt: row.markedAt,
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toAttendanceSessionRow(row: typeof attendanceSessions.$inferSelect): AttendanceSessionRow {
  return {
    id: row.id,
    sectionId: row.sectionId,
    academicSessionId: row.academicSessionId,
    attendanceDate: row.attendanceDate,
    timeSlotId: row.timeSlotId,
    scheduleId: row.scheduleId,
    status: row.status as "in_progress" | "submitted",
    totalStudents: row.totalStudents,
    markedCount: row.markedCount,
    openedByUserId: row.openedByUserId,
    openedAt: row.openedAt,
    submittedByUserId: row.submittedByUserId,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toAttendanceCorrectionRow(
  row: typeof attendanceCorrections.$inferSelect,
): AttendanceCorrectionRow {
  return {
    id: row.id,
    sectionId: row.sectionId,
    attendanceDate: row.attendanceDate,
    timeSlotId: row.timeSlotId,
    studentId: row.studentId,
    beforeStatus: row.beforeStatus,
    afterStatus: row.afterStatus as AttendanceStatus,
    reason: row.reason,
    correctedByUserId: row.correctedByUserId,
    correctedAt: row.correctedAt,
    guardianDisputedAt: row.guardianDisputedAt,
  };
}

function toDailyAttendanceSummaryRow(
  row: typeof dailyAttendanceSummaries.$inferSelect,
): DailyAttendanceSummaryRow {
  return {
    studentId: row.studentId,
    month: row.month,
    academicSessionId: row.academicSessionId,
    markedPeriods: row.markedPeriods,
    presentCount: row.presentCount,
    absentCount: row.absentCount,
    lateCount: row.lateCount,
    leaveCount: row.leaveCount,
    isComplete: row.isComplete,
    calculatedAt: row.calculatedAt,
  };
}

export class DrizzleAttendanceStore implements AttendanceStore {
  constructor(private readonly client: DbLike = db) {}

  async findSession(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<AttendanceSessionRow | null> {
    const rows = await this.client
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.sectionId, sectionId),
          eq(attendanceSessions.attendanceDate, attendanceDate),
          eq(attendanceSessions.timeSlotId, timeSlotId),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toAttendanceSessionRow(row) : null;
  }

  async getMarkingSession(
    _institutionId: string,
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<AttendanceSessionRow | null> {
    return this.findSession(sectionId, attendanceDate, timeSlotId);
  }

  async openSession(
    data: OpenAttendanceSessionPortInput,
    openedByUserId: string,
  ): Promise<AttendanceSessionRow> {
    const existing = await this.findSession(data.sectionId, data.attendanceDate, data.timeSlotId);
    if (existing) {
      return existing;
    }

    // Determine enrolled count if not supplied
    let totalCount = data.totalStudents;
    if (totalCount <= 0) {
      const roster = await this.listSectionRoster(data.sectionId);
      totalCount = roster.length;
    }

    const [inserted] = await this.client
      .insert(attendanceSessions)
      .values({
        sectionId: data.sectionId,
        academicSessionId: data.academicSessionId,
        attendanceDate: data.attendanceDate,
        timeSlotId: data.timeSlotId,
        scheduleId: data.scheduleId ?? null,
        status: "in_progress",
        totalStudents: totalCount,
        markedCount: 0,
        openedByUserId,
      })
      .returning();

    if (!inserted) {
      throw new ConflictError("Failed to open attendance session.");
    }

    return toAttendanceSessionRow(inserted);
  }

  async submitSession(write: {
    readonly institutionId: string;
    readonly sectionId: string;
    readonly attendanceDate: string;
    readonly timeSlotId: string;
    readonly submittedByUserId: string;
  }): Promise<{ readonly version: number }> {
    const now = new Date();
    const [updated] = await this.client
      .update(attendanceSessions)
      .set({
        status: "submitted",
        submittedByUserId: write.submittedByUserId,
        submittedAt: now,
        updatedAt: now,
        version: sql`${attendanceSessions.version} + 1`,
      })
      .where(
        and(
          eq(attendanceSessions.sectionId, write.sectionId),
          eq(attendanceSessions.attendanceDate, write.attendanceDate),
          eq(attendanceSessions.timeSlotId, write.timeSlotId),
        ),
      )
      .returning({ version: attendanceSessions.version });

    if (!updated) {
      throw new ConflictError("Failed to submit attendance session.");
    }
    return { version: updated.version };
  }

  async saveMarks(
    data: SaveAttendanceMarksPortInput,
    userId: string,
  ): Promise<{
    readonly session: AttendanceSessionRow;
    readonly recordsCount: number;
    readonly writtenCount: number;
    readonly correctedCount: number;
  }> {
    return this.client.transaction(async (tx) => {
      let session = await tx
        .select()
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.sectionId, data.sectionId),
            eq(attendanceSessions.attendanceDate, data.attendanceDate),
            eq(attendanceSessions.timeSlotId, data.timeSlotId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!session) {
        // Open session on the fly
        const roster = await this.listSectionRoster(data.sectionId);
        const totalCount = roster.length > 0 ? roster.length : data.marks.length;

        const [created] = await tx
          .insert(attendanceSessions)
          .values({
            sectionId: data.sectionId,
            academicSessionId: data.academicSessionId,
            attendanceDate: data.attendanceDate,
            timeSlotId: data.timeSlotId,
            scheduleId: data.scheduleId ?? null,
            status: "in_progress",
            totalStudents: totalCount,
            markedCount: 0,
            openedByUserId: userId,
          })
          .returning();
        session = created!;
      }

      const now = new Date();

      // Upsert individual attendance marks
      for (const mark of data.marks) {
        await tx
          .insert(attendanceRecords)
          .values({
            sectionId: data.sectionId,
            attendanceDate: data.attendanceDate,
            timeSlotId: data.timeSlotId,
            studentId: mark.studentId,
            status: mark.status,
            source: mark.source ?? "manual",
            leaveRequestId: mark.leaveRequestId ?? null,
            minutesLate: mark.status === "late" ? (mark.minutesLate ?? 1) : null,
            markedByUserId: userId,
            markedAt: now,
            remarks: mark.remarks ?? null,
          })
          .onConflictDoUpdate({
            target: [
              attendanceRecords.sectionId,
              attendanceRecords.attendanceDate,
              attendanceRecords.timeSlotId,
              attendanceRecords.studentId,
            ],
            set: {
              status: mark.status,
              source: mark.source ?? "manual",
              leaveRequestId: mark.leaveRequestId ?? null,
              minutesLate: mark.status === "late" ? (mark.minutesLate ?? 1) : null,
              markedByUserId: userId,
              markedAt: now,
              remarks: mark.remarks ?? null,
              updatedAt: now,
              version: sql`${attendanceRecords.version} + 1`,
            },
          });
      }

      // Count marks in this period
      const countResult = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sectionId, data.sectionId),
            eq(attendanceRecords.attendanceDate, data.attendanceDate),
            eq(attendanceRecords.timeSlotId, data.timeSlotId),
          ),
        );
      const markedCount = countResult[0]?.total ?? data.marks.length;

      // Update session
      const [updatedSession] = await tx
        .update(attendanceSessions)
        .set({
          markedCount,
          status: data.isSubmitting ? "submitted" : "in_progress",
          submittedByUserId: data.isSubmitting ? userId : session.submittedByUserId,
          submittedAt: data.isSubmitting ? now : session.submittedAt,
          updatedAt: now,
          version: sql`${attendanceSessions.version} + 1`,
        })
        .where(eq(attendanceSessions.id, session.id))
        .returning();

      // Recompute monthly summaries for the affected students
      const month = data.attendanceDate.slice(0, 7);
      for (const mark of data.marks) {
        await this.recalculateStudentSummary(tx, mark.studentId, month, data.academicSessionId);
      }

      return {
        session: toAttendanceSessionRow(updatedSession!),
        recordsCount: data.marks.length,
        writtenCount: data.marks.length,
        correctedCount: 0,
      };
    });
  }

  async recordCorrection(
    data: RecordAttendanceCorrectionPortInput,
    beforeStatus: AttendanceStatus,
    correctedByUserId: string,
  ): Promise<AttendanceCorrectionRow> {
    return this.client.transaction(async (tx) => {
      const now = new Date();

      // Insert audited correction row
      const [correction] = await tx
        .insert(attendanceCorrections)
        .values({
          sectionId: data.sectionId,
          attendanceDate: data.attendanceDate,
          timeSlotId: data.timeSlotId,
          studentId: data.studentId,
          beforeStatus,
          afterStatus: data.afterStatus,
          reason: data.reason,
          correctedByUserId,
          correctedAt: now,
        })
        .returning();

      if (!correction) {
        throw new ConflictError("Failed to record attendance correction.");
      }

      // Update the attendance record
      await tx
        .update(attendanceRecords)
        .set({
          status: data.afterStatus,
          minutesLate: data.afterStatus === "late" ? 10 : null,
          updatedAt: now,
          version: sql`${attendanceRecords.version} + 1`,
        })
        .where(
          and(
            eq(attendanceRecords.sectionId, data.sectionId),
            eq(attendanceRecords.attendanceDate, data.attendanceDate),
            eq(attendanceRecords.timeSlotId, data.timeSlotId),
            eq(attendanceRecords.studentId, data.studentId),
          ),
        );

      // Recompute monthly summary
      const session = await tx
        .select()
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.sectionId, data.sectionId),
            eq(attendanceSessions.attendanceDate, data.attendanceDate),
            eq(attendanceSessions.timeSlotId, data.timeSlotId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (session) {
        const month = data.attendanceDate.slice(0, 7);
        await this.recalculateStudentSummary(tx, data.studentId, month, session.academicSessionId);
      }

      return toAttendanceCorrectionRow(correction);
    });
  }

  async getAttendanceRecord(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
    studentId: string,
  ): Promise<AttendanceRecordRow | null> {
    const rows = await this.client
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sectionId, sectionId),
          eq(attendanceRecords.attendanceDate, attendanceDate),
          eq(attendanceRecords.timeSlotId, timeSlotId),
          eq(attendanceRecords.studentId, studentId),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toAttendanceRecordRow(row) : null;
  }

  async getSectionAttendanceSheet(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<AttendanceSheetView> {
    const [sessionRows, recordRows, roster, correctionRows] = await Promise.all([
      this.client
        .select()
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.sectionId, sectionId),
            eq(attendanceSessions.attendanceDate, attendanceDate),
            eq(attendanceSessions.timeSlotId, timeSlotId),
          ),
        )
        .limit(1),
      this.client
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sectionId, sectionId),
            eq(attendanceRecords.attendanceDate, attendanceDate),
            eq(attendanceRecords.timeSlotId, timeSlotId),
          ),
        ),
      this.listSectionRoster(sectionId),
      this.client
        .select()
        .from(attendanceCorrections)
        .where(
          and(
            eq(attendanceCorrections.sectionId, sectionId),
            eq(attendanceCorrections.attendanceDate, attendanceDate),
            eq(attendanceCorrections.timeSlotId, timeSlotId),
          ),
        ),
    ]);

    const sessionRow = sessionRows[0];

    return {
      session: sessionRow ? toAttendanceSessionRow(sessionRow) : null,
      records: recordRows.map(toAttendanceRecordRow),
      roster,
      corrections: correctionRows.map(toAttendanceCorrectionRow),
    };
  }

  async listSectionRoster(sectionId: string): Promise<StudentSectionRosterItem[]> {
    const rows = await this.client
      .select({
        studentId: students.id,
        rollNumber: students.rollNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        studentStatus: students.lifecycle,
      })
      .from(studentPlacements)
      .innerJoin(students, eq(studentPlacements.studentId, students.id))
      .where(
        and(
          eq(studentPlacements.sectionId, sectionId),
          eq(studentPlacements.isCurrent, true),
          isNull(students.archivedAt),
        ),
      )
      .orderBy(asc(students.rollNumber), asc(students.firstName));

    return rows.map((r) => ({
      studentId: r.studentId,
      rollNumber: r.rollNumber,
      firstName: r.firstName,
      lastName: r.lastName,
      studentStatus: r.studentStatus,
    }));
  }

  async getStudentMonthlySummary(
    studentId: string,
    month: string,
  ): Promise<DailyAttendanceSummaryRow | null> {
    const rows = await this.client
      .select()
      .from(dailyAttendanceSummaries)
      .where(
        and(
          eq(dailyAttendanceSummaries.studentId, studentId),
          eq(dailyAttendanceSummaries.month, month),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? toDailyAttendanceSummaryRow(row) : null;
  }

  async getStudentMonthSummary(
    _institutionId: string,
    studentId: string,
    month: string,
  ): Promise<DailyAttendanceSummaryRow | null> {
    return this.getStudentMonthlySummary(studentId, month);
  }

  async recomputeStudentMonthSummary(write: {
    readonly institutionId: string;
    readonly studentId: string;
    readonly month: string;
    readonly academicSessionId: string;
  }): Promise<void> {
    return this.recalculateStudentSummary(this.client, write.studentId, write.month, write.academicSessionId);
  }

  async listMarks(
    _institutionId: string,
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<readonly AttendanceRecordRow[]> {
    const rows = await this.client
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sectionId, sectionId),
          eq(attendanceRecords.attendanceDate, attendanceDate),
          eq(attendanceRecords.timeSlotId, timeSlotId),
        ),
      );
    return rows.map(toAttendanceRecordRow);
  }

  async listStudentMarks(
    _institutionId: string,
    studentId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly AttendanceRecordRow[]> {
    const rows = await this.client
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          sql`${attendanceRecords.attendanceDate} >= ${fromDate}`,
          sql`${attendanceRecords.attendanceDate} <= ${toDate}`,
        ),
      )
      .orderBy(asc(attendanceRecords.attendanceDate));
    return rows.map(toAttendanceRecordRow);
  }

  async listCorrections(
    sectionId: string,
    attendanceDate: string,
    timeSlotId: string,
    studentId?: string,
  ): Promise<readonly AttendanceCorrectionRow[]> {
    const conditions = [
      eq(attendanceCorrections.sectionId, sectionId),
      eq(attendanceCorrections.attendanceDate, attendanceDate),
      eq(attendanceCorrections.timeSlotId, timeSlotId),
    ];
    if (studentId) {
      conditions.push(eq(attendanceCorrections.studentId, studentId));
    }
    const rows = await this.client
      .select()
      .from(attendanceCorrections)
      .where(and(...conditions))
      .orderBy(asc(attendanceCorrections.correctedAt));
    return rows.map(toAttendanceCorrectionRow);
  }

  async listDailySessions(
    sectionIds: readonly string[],
    date: string,
  ): Promise<readonly AttendanceSessionRow[]> {
    if (sectionIds.length === 0) {
      return [];
    }

    const rows = await this.client
      .select()
      .from(attendanceSessions)
      .where(
        and(
          inArray(attendanceSessions.sectionId, [...sectionIds]),
          eq(attendanceSessions.attendanceDate, date),
        ),
      );

    return rows.map(toAttendanceSessionRow);
  }

  private async recalculateStudentSummary(
    tx: DbLike,
    studentId: string,
    month: string,
    academicSessionId: string,
  ): Promise<void> {
    const rows = await tx
      .select({
        present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
        absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
        late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')::int`,
        leave: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'leave')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.studentId, studentId),
          sql`to_char(${attendanceRecords.attendanceDate}, 'YYYY-MM') = ${month}`,
        ),
      );

    const stat = rows[0] ?? { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
    const now = new Date();

    await tx
      .insert(dailyAttendanceSummaries)
      .values({
        studentId,
        month,
        academicSessionId,
        markedPeriods: stat.total,
        presentCount: stat.present,
        absentCount: stat.absent,
        lateCount: stat.late,
        leaveCount: stat.leave,
        isComplete: true,
        calculatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dailyAttendanceSummaries.studentId, dailyAttendanceSummaries.month],
        set: {
          markedPeriods: stat.total,
          presentCount: stat.present,
          absentCount: stat.absent,
          lateCount: stat.late,
          leaveCount: stat.leave,
          isComplete: true,
          calculatedAt: now,
        },
      });
  }
}
