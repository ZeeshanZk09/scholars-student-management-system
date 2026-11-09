/**
 * Drizzle implementation of FloorOperationsStore (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import {
  attendanceSessions,
  classes,
  extraPeriods,
  floorAssignments,
  floorIncidentReports,
  floorLiveSnapshots,
  floors,
  groups,
  schedules,
  sections,
  subjects,
  teacherAbsences,
  timeSlots,
  users,
} from "@/db/schema";
import { ConflictError, NotFoundError } from "@/shared/errors";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

export function uniqueConflictError(error: unknown): ConflictError | null {
  if (!isUniqueViolation(error)) return null;
  const msg = error instanceof Error ? error.message : "";

  if (msg.includes("teacher_absences_employee_date_key")) {
    return new ConflictError(
      "An absence record for this teacher on this date has already been filed.",
      { userMessage: "An absence record for this teacher on this date has already been filed." },
    );
  }

  if (msg.includes("floor_assignments_floor_user_key")) {
    return new ConflictError(
      "This staff member is already assigned to this floor.",
      { userMessage: "This supervisor is already assigned to this floor." },
    );
  }

  if (msg.includes("floor_live_snapshots_unique")) {
    return new ConflictError(
      "A live period snapshot for this room on this date is already recorded.",
      { userMessage: "A live period snapshot for this room on this date is already recorded." },
    );
  }

  return new ConflictError("Operation conflicts with existing records.", {
    userMessage: "This record conflicts with an existing entry. Please review and try again.",
  });
}

import type {
  ExtraPeriodReason,
  FloorLiveSnapshotStatus,
  IncidentKind,
  IncidentSeverity,
  ReplacementResolution,
  TeacherAbsenceScope,
  TeacherAbsenceSource,
} from "../domain/floor-rules";
import type {
  ExtraPeriodRow,
  FloorAssignmentRow,
  FloorIncidentReportRow,
  FloorLiveSnapshotRow,
  FloorOperationsStore,
  FloorRoomWalkthroughItem,
  TeacherAbsenceRow,
} from "../application/ports";
import type {
  AssignFloorInchargeInput,
  CaptureLiveSnapshotInput,
  CreateExtraPeriodInput,
  CreateIncidentReportInput,
  RecordTeacherAbsenceInput,
} from "../application/schemas";

export class DrizzleFloorOperationsStore implements FloorOperationsStore {
  constructor(private readonly client: DbLike = db) {}

  /* -------------------------------------------------------------------------- */
  /* Row mappers                                                                */
  /* -------------------------------------------------------------------------- */

  private mapSnapshot(r: typeof floorLiveSnapshots.$inferSelect): FloorLiveSnapshotRow {
    return {
      id: r.id,
      floorId: r.floorId,
      scheduleId: r.scheduleId,
      attendanceDate: r.attendanceDate,
      timeSlotId: r.timeSlotId,
      sectionId: r.sectionId,
      subjectId: r.subjectId,
      teacherId: r.teacherId,
      substituteTeacherId: r.substituteTeacherId,
      status: r.status as FloorLiveSnapshotStatus,
      attendanceSubmitted: r.attendanceSubmitted,
      asAt: r.asAt,
    };
  }

  private mapAbsence(r: typeof teacherAbsences.$inferSelect): TeacherAbsenceRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      employeeId: r.employeeId,
      absenceDate: r.absenceDate,
      scope: r.scope as TeacherAbsenceScope,
      startTimeSlotId: r.startTimeSlotId,
      endTimeSlotId: r.endTimeSlotId,
      reason: r.reason,
      source: r.source as TeacherAbsenceSource,
      leaveRequestId: r.leaveRequestId,
      reportedByUserId: r.reportedByUserId,
      reportedAt: r.reportedAt,
      createdAt: r.createdAt,
    };
  }

  private mapExtraPeriod(r: typeof extraPeriods.$inferSelect): ExtraPeriodRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      academicSessionId: r.academicSessionId,
      replacesScheduleId: r.replacesScheduleId,
      teacherId: r.teacherId,
      sectionId: r.sectionId,
      timeSlotId: r.timeSlotId,
      extraDate: r.extraDate,
      reason: r.reason as ExtraPeriodReason,
      resolution: (r.resolution as ReplacementResolution) ?? null,
      isPayable: r.isPayable,
      approvedByUserId: r.approvedByUserId,
      approvedAt: r.approvedAt,
      absenceId: r.absenceId,
      consumedByPayLineId: r.consumedByPayLineId,
      notes: r.notes,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version,
    };
  }

  private mapIncident(r: typeof floorIncidentReports.$inferSelect): FloorIncidentReportRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      campusId: r.campusId,
      floorId: r.floorId,
      sectionId: r.sectionId,
      reportedByUserId: r.reportedByUserId,
      severity: r.severity as IncidentSeverity,
      kind: r.kind as IncidentKind,
      description: r.description,
      occurredAt: r.occurredAt,
      reportedAt: r.reportedAt,
      escalatedAt: r.escalatedAt,
      escalatedToUserId: r.escalatedToUserId,
      resolvedAt: r.resolvedAt,
      resolvedByUserId: r.resolvedByUserId,
      resolutionNotes: r.resolutionNotes,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapAssignment(r: typeof floorAssignments.$inferSelect): FloorAssignmentRow {
    return {
      id: r.id,
      institutionId: r.institutionId,
      floorId: r.floorId,
      userId: r.userId,
      assignedFrom: r.assignedFrom,
      assignedUntil: r.assignedUntil,
      createdAt: r.createdAt,
    };
  }

  /* -------------------------------------------------------------------------- */
  /* Live Snapshots                                                             */
  /* -------------------------------------------------------------------------- */

  async upsertLiveSnapshot(data: CaptureLiveSnapshotInput): Promise<FloorLiveSnapshotRow> {
    const [row] = await this.client
      .insert(floorLiveSnapshots)
      .values({
        floorId: data.floorId,
        scheduleId: data.scheduleId,
        attendanceDate: data.attendanceDate,
        timeSlotId: data.timeSlotId,
        sectionId: data.sectionId ?? null,
        subjectId: data.subjectId ?? null,
        teacherId: data.teacherId ?? null,
        substituteTeacherId: data.substituteTeacherId ?? null,
        status: data.status,
        attendanceSubmitted: data.attendanceSubmitted ?? null,
        asAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [floorLiveSnapshots.floorId, floorLiveSnapshots.scheduleId, floorLiveSnapshots.attendanceDate],
        set: {
          timeSlotId: data.timeSlotId,
          sectionId: data.sectionId ?? null,
          subjectId: data.subjectId ?? null,
          teacherId: data.teacherId ?? null,
          substituteTeacherId: data.substituteTeacherId ?? null,
          status: data.status,
          attendanceSubmitted: data.attendanceSubmitted ?? null,
          asAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to record floor live snapshot.");
    }

    return this.mapSnapshot(row);
  }

  async listLiveSnapshots(
    floorId: string,
    attendanceDate: string,
    timeSlotId?: string,
  ): Promise<readonly FloorLiveSnapshotRow[]> {
    const conditions = [
      eq(floorLiveSnapshots.floorId, floorId),
      eq(floorLiveSnapshots.attendanceDate, attendanceDate),
    ];

    if (timeSlotId) {
      conditions.push(eq(floorLiveSnapshots.timeSlotId, timeSlotId));
    }

    const rows = await this.client
      .select()
      .from(floorLiveSnapshots)
      .where(and(...conditions));

    return rows.map((r) => this.mapSnapshot(r));
  }

  async getLiveSnapshot(
    floorId: string,
    scheduleId: string,
    attendanceDate: string,
  ): Promise<FloorLiveSnapshotRow | null> {
    const [row] = await this.client
      .select()
      .from(floorLiveSnapshots)
      .where(
        and(
          eq(floorLiveSnapshots.floorId, floorId),
          eq(floorLiveSnapshots.scheduleId, scheduleId),
          eq(floorLiveSnapshots.attendanceDate, attendanceDate),
        ),
      )
      .limit(1);

    return row ? this.mapSnapshot(row) : null;
  }

  /* -------------------------------------------------------------------------- */
  /* Teacher Absences                                                           */
  /* -------------------------------------------------------------------------- */

  async recordTeacherAbsence(
    data: RecordTeacherAbsenceInput,
    reportedByUserId: string,
  ): Promise<TeacherAbsenceRow> {
    try {
      const [row] = await this.client
        .insert(teacherAbsences)
        .values({
          institutionId: data.institutionId,
          employeeId: data.employeeId,
          absenceDate: data.absenceDate,
          scope: data.scope,
          startTimeSlotId: data.startTimeSlotId ?? null,
          endTimeSlotId: data.endTimeSlotId ?? null,
          reason: data.reason ?? null,
          source: data.source,
          leaveRequestId: data.leaveRequestId ?? null,
          reportedByUserId: data.source === "biometric" ? null : reportedByUserId,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to record teacher absence.");
      }

      return this.mapAbsence(row);
    } catch (error) {
      const conflict = uniqueConflictError(error);
      if (conflict) throw conflict;
      throw error;
    }
  }

  async listTeacherAbsences(
    institutionId: string,
    absenceDate: string,
    employeeId?: string,
  ): Promise<readonly TeacherAbsenceRow[]> {
    const conditions = [
      eq(teacherAbsences.institutionId, institutionId),
      eq(teacherAbsences.absenceDate, absenceDate),
    ];

    if (employeeId) {
      conditions.push(eq(teacherAbsences.employeeId, employeeId));
    }

    const rows = await this.client
      .select()
      .from(teacherAbsences)
      .where(and(...conditions));

    return rows.map((r) => this.mapAbsence(r));
  }

  /* -------------------------------------------------------------------------- */
  /* Extra Periods                                                              */
  /* -------------------------------------------------------------------------- */

  async createExtraPeriod(
    data: CreateExtraPeriodInput,
    createdByUserId: string,
  ): Promise<ExtraPeriodRow> {
    const [row] = await this.client
      .insert(extraPeriods)
      .values({
        institutionId: data.institutionId,
        academicSessionId: data.academicSessionId,
        replacesScheduleId: data.replacesScheduleId ?? null,
        teacherId: data.teacherId ?? null,
        sectionId: data.sectionId ?? null,
        timeSlotId: data.timeSlotId,
        extraDate: data.extraDate,
        reason: data.reason,
        resolution: data.resolution ?? null,
        isPayable: data.isPayable ?? false,
        notes: data.notes ?? null,
        createdByUserId,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to record extra period.");
    }

    return this.mapExtraPeriod(row);
  }

  async getExtraPeriod(extraPeriodId: string): Promise<ExtraPeriodRow | null> {
    const [row] = await this.client
      .select()
      .from(extraPeriods)
      .where(eq(extraPeriods.id, extraPeriodId))
      .limit(1);

    return row ? this.mapExtraPeriod(row) : null;
  }

  async approveExtraPeriod(
    extraPeriodId: string,
    approvedByUserId: string,
    approvedAt: Date,
  ): Promise<ExtraPeriodRow> {
    const [row] = await this.client
      .update(extraPeriods)
      .set({
        isPayable: true,
        approvedByUserId,
        approvedAt,
        updatedAt: new Date(),
        version: sql`${extraPeriods.version} + 1`,
      })
      .where(eq(extraPeriods.id, extraPeriodId))
      .returning();

    if (!row) {
      throw new NotFoundError(`Extra period "${extraPeriodId}" not found.`);
    }

    return this.mapExtraPeriod(row);
  }

  async listExtraPeriods(
    institutionId: string,
    extraDate: string,
    teacherId?: string,
  ): Promise<readonly ExtraPeriodRow[]> {
    const conditions = [
      eq(extraPeriods.institutionId, institutionId),
      eq(extraPeriods.extraDate, extraDate),
    ];

    if (teacherId) {
      conditions.push(eq(extraPeriods.teacherId, teacherId));
    }

    const rows = await this.client
      .select()
      .from(extraPeriods)
      .where(and(...conditions));

    return rows.map((r) => this.mapExtraPeriod(r));
  }

  /* -------------------------------------------------------------------------- */
  /* Floor Incident Reports                                                     */
  /* -------------------------------------------------------------------------- */

  async createIncidentReport(
    data: CreateIncidentReportInput,
    reportedByUserId: string,
  ): Promise<FloorIncidentReportRow> {
    const [row] = await this.client
      .insert(floorIncidentReports)
      .values({
        institutionId: data.institutionId,
        campusId: data.campusId ?? null,
        floorId: data.floorId ?? null,
        sectionId: data.sectionId ?? null,
        reportedByUserId,
        severity: data.severity,
        kind: data.kind,
        description: data.description,
        occurredAt: data.occurredAt ?? new Date(),
      })
      .returning();

    if (!row) {
      throw new Error("Failed to log incident report.");
    }

    return this.mapIncident(row);
  }

  async escalateIncidentReport(
    incidentId: string,
    escalatedToUserId: string,
    escalatedAt: Date,
  ): Promise<FloorIncidentReportRow> {
    const [row] = await this.client
      .update(floorIncidentReports)
      .set({
        escalatedAt,
        escalatedToUserId,
        updatedAt: new Date(),
      })
      .where(eq(floorIncidentReports.id, incidentId))
      .returning();

    if (!row) {
      throw new NotFoundError(`Incident report "${incidentId}" not found.`);
    }

    return this.mapIncident(row);
  }

  async resolveIncidentReport(
    incidentId: string,
    resolvedByUserId: string,
    resolutionNotes: string,
    resolvedAt: Date,
  ): Promise<FloorIncidentReportRow> {
    const [row] = await this.client
      .update(floorIncidentReports)
      .set({
        resolvedAt,
        resolvedByUserId,
        resolutionNotes,
        updatedAt: new Date(),
      })
      .where(eq(floorIncidentReports.id, incidentId))
      .returning();

    if (!row) {
      throw new NotFoundError(`Incident report "${incidentId}" not found.`);
    }

    return this.mapIncident(row);
  }

  async listIncidentReports(
    institutionId: string,
    filters?: {
      readonly floorId?: string;
      readonly resolved?: boolean;
      readonly severity?: IncidentSeverity;
    },
  ): Promise<readonly FloorIncidentReportRow[]> {
    const conditions = [eq(floorIncidentReports.institutionId, institutionId)];

    if (filters?.floorId) {
      conditions.push(eq(floorIncidentReports.floorId, filters.floorId));
    }

    if (filters?.severity) {
      conditions.push(eq(floorIncidentReports.severity, filters.severity));
    }

    if (filters?.resolved !== undefined) {
      conditions.push(
        filters.resolved
          ? sql`${floorIncidentReports.resolvedAt} is not null`
          : isNull(floorIncidentReports.resolvedAt),
      );
    }

    const rows = await this.client
      .select()
      .from(floorIncidentReports)
      .where(and(...conditions))
      .orderBy(desc(floorIncidentReports.occurredAt));

    return rows.map((r) => this.mapIncident(r));
  }

  async getIncidentReport(incidentId: string): Promise<FloorIncidentReportRow | null> {
    const [row] = await this.client
      .select()
      .from(floorIncidentReports)
      .where(eq(floorIncidentReports.id, incidentId))
      .limit(1);

    return row ? this.mapIncident(row) : null;
  }

  /* -------------------------------------------------------------------------- */
  /* Floor Assignments                                                          */
  /* -------------------------------------------------------------------------- */

  async assignFloorIncharge(data: AssignFloorInchargeInput): Promise<FloorAssignmentRow> {
    const [row] = await this.client
      .insert(floorAssignments)
      .values({
        institutionId: data.institutionId,
        floorId: data.floorId,
        userId: data.userId,
        assignedFrom: data.assignedFrom ?? new Date(),
        assignedUntil: data.assignedUntil ?? null,
      })
      .onConflictDoUpdate({
        target: [floorAssignments.floorId, floorAssignments.userId],
        set: {
          assignedFrom: data.assignedFrom ?? new Date(),
          assignedUntil: data.assignedUntil ?? null,
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to assign floor supervisor.");
    }

    return this.mapAssignment(row);
  }

  async listFloorAssignments(
    institutionId: string,
    floorId?: string,
    userId?: string,
  ): Promise<readonly FloorAssignmentRow[]> {
    const conditions = [eq(floorAssignments.institutionId, institutionId)];

    if (floorId) {
      conditions.push(eq(floorAssignments.floorId, floorId));
    }

    if (userId) {
      conditions.push(eq(floorAssignments.userId, userId));
    }

    const rows = await this.client
      .select()
      .from(floorAssignments)
      .where(and(...conditions));

    return rows.map((r) => this.mapAssignment(r));
  }

  /* -------------------------------------------------------------------------- */
  /* Room Walkthrough Composite Read                                            */
  /* -------------------------------------------------------------------------- */

  async getFloorWalkthrough(
    floorId: string,
    attendanceDate: string,
    timeSlotId: string,
  ): Promise<readonly FloorRoomWalkthroughItem[]> {
    // 1. Fetch timetable schedule entries for this floor and timeSlot
    const scheduleRows = await this.client
      .select({
        scheduleId: schedules.id,
        floorId: floors.id,
        floorName: floors.name,
        timeSlotId: timeSlots.id,
        timeSlotName: timeSlots.name,
        startTime: timeSlots.startTime,
        endTime: timeSlots.endTime,
        sectionId: sections.id,
        sectionName: sections.name,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        subjectId: subjects.id,
        subjectName: subjects.name,
        teacherId: schedules.teacherId,
        teacherName: users.name,
      })
      .from(schedules)
      .innerJoin(floors, eq(floors.id, schedules.floorId))
      .innerJoin(timeSlots, eq(timeSlots.id, schedules.timeSlotId))
      .leftJoin(sections, eq(sections.id, schedules.sectionId))
      .leftJoin(groups, eq(groups.id, sections.groupId))
      .leftJoin(classes, eq(classes.id, groups.classId))
      .leftJoin(subjects, eq(subjects.id, schedules.subjectId))
      .leftJoin(users, eq(users.id, schedules.teacherId))
      .where(
        and(
          eq(schedules.floorId, floorId),
          eq(schedules.timeSlotId, timeSlotId),
        ),
      );

    if (scheduleRows.length === 0) {
      return [];
    }

    // 2. Fetch live snapshot for these schedules if recorded
    const liveSnapshotsList = await this.listLiveSnapshots(floorId, attendanceDate, timeSlotId);
    const snapshotByScheduleId = new Map(
      liveSnapshotsList.map((s) => [s.scheduleId, s]),
    );

    // 3. Substitute teachers lookup
    const substituteTeacherIds = liveSnapshotsList
      .map((s) => s.substituteTeacherId)
      .filter((id): id is string => Boolean(id));

    const subTeachersMap = new Map<string, string>();
    if (substituteTeacherIds.length > 0) {
      const subUsers = await this.client
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(
          sql`${users.id} in (${sql.join(
            substituteTeacherIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        );
      for (const u of subUsers) {
        subTeachersMap.set(u.id, u.name);
      }
    }

    // 4. Open incidents count by section on this floor
    const incidentRows = await this.client
      .select({
        sectionId: floorIncidentReports.sectionId,
        count: sql<number>`count(*)::int`,
      })
      .from(floorIncidentReports)
      .where(
        and(
          eq(floorIncidentReports.floorId, floorId),
          isNull(floorIncidentReports.resolvedAt),
        ),
      )
      .groupBy(floorIncidentReports.sectionId);

    const incidentsBySection = new Map<string, number>();
    for (const inc of incidentRows) {
      if (inc.sectionId) {
        incidentsBySection.set(inc.sectionId, Number(inc.count));
      }
    }

    // 5. Attendance sessions info
    const sectionIds = scheduleRows
      .map((s) => s.sectionId)
      .filter((id): id is string => Boolean(id));

    const sessionInfoBySection = new Map<
      string,
      { submitted: boolean; markedCount: number; totalStudents: number }
    >();

    if (sectionIds.length > 0) {
      const attSessions = await this.client
        .select({
          sectionId: attendanceSessions.sectionId,
          status: attendanceSessions.status,
          totalStudents: attendanceSessions.totalStudents,
          markedCount: attendanceSessions.markedCount,
        })
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.attendanceDate, attendanceDate),
            eq(attendanceSessions.timeSlotId, timeSlotId),
            sql`${attendanceSessions.sectionId} in (${sql.join(
              sectionIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
          ),
        );

      for (const sess of attSessions) {
        sessionInfoBySection.set(sess.sectionId, {
          submitted: sess.status === "submitted",
          markedCount: sess.markedCount,
          totalStudents: sess.totalStudents,
        });
      }
    }

    // Assemble walkthrough items
    return scheduleRows.map((sched) => {
      const snap = snapshotByScheduleId.get(sched.scheduleId);
      const subName = snap?.substituteTeacherId
        ? subTeachersMap.get(snap.substituteTeacherId) ?? null
        : null;
      const attSession = sched.sectionId ? sessionInfoBySection.get(sched.sectionId) : undefined;
      const openIncidents = sched.sectionId
        ? (incidentsBySection.get(sched.sectionId) ?? 0)
        : 0;

      // Status priority: snapshot status if recorded, else attendance submitted/unmarked
      let status: FloorLiveSnapshotStatus = "as_scheduled";
      if (snap) {
        status = snap.status;
      } else if (attSession) {
        status = attSession.submitted ? "as_scheduled" : "unmarked";
      }

      const attendanceSubmitted =
        snap?.attendanceSubmitted ?? (attSession ? attSession.submitted : null);

      return {
        scheduleId: sched.scheduleId,
        floorId: sched.floorId,
        floorName: sched.floorName,
        timeSlotId: sched.timeSlotId,
        timeSlotName: sched.timeSlotName,
        startTime: sched.startTime,
        endTime: sched.endTime,
        sectionId: sched.sectionId,
        sectionName: sched.sectionName,
        className: sched.className,
        gradeLevel: sched.gradeLevel,
        subjectId: sched.subjectId,
        subjectName: sched.subjectName,
        teacherId: sched.teacherId,
        teacherName: sched.teacherName,
        substituteTeacherId: snap?.substituteTeacherId ?? null,
        substituteTeacherName: subName,
        status,
        attendanceSubmitted,
        markedCount: attSession?.markedCount ?? null,
        totalStudents: attSession?.totalStudents ?? null,
        openIncidentsCount: openIncidents,
        asAt: snap?.asAt ?? null,
      };
    });
  }
}
