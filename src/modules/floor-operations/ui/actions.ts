"use server";

/**
 * Server Actions for Floor Operations (`ARCHITECTURE.md` §19, `PRD.md` MODULE 15/17/18/19).
 */

import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  approveExtraPeriod,
  assignFloorIncharge,
  captureLiveSnapshot,
  createExtraPeriod,
  createIncidentReport,
  escalateIncidentReport,
  recordTeacherAbsence,
  resolveIncidentReport,
} from "@/modules/floor-operations";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
  console.error("floor operations action error:", error);
  if (isAppError(error)) {
    if (error instanceof ValidationError) {
      return {
        status: "error",
        message: error.userMessage,
        issues: Object.values(error.fieldErrors).flat(),
      };
    }
    return { status: "error", message: error.userMessage };
  }
  return { status: "error", message: "Something went wrong. Please check the values and try again." };
}

async function authorizeFloorMutation(
  permission: "attendance.mark" | "attendance.update" | "academic.manage",
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation(permission, institutionId);
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Live Inspection Snapshots Action                                           */
/* -------------------------------------------------------------------------- */

export async function captureLiveSnapshotAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("attendance.mark", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const floorId = field(formData, "floorId");
    const scheduleId = field(formData, "scheduleId");
    const attendanceDate = field(formData, "attendanceDate");
    const timeSlotId = field(formData, "timeSlotId");
    const sectionId = field(formData, "sectionId") || null;
    const subjectId = field(formData, "subjectId") || null;
    const teacherId = field(formData, "teacherId") || null;
    const substituteTeacherId = field(formData, "substituteTeacherId") || null;
    const status = field(formData, "status") as
      | "as_scheduled"
      | "substitute"
      | "free"
      | "unmarked"
      | "cancelled";
    const attendanceSubmittedStr = field(formData, "attendanceSubmitted");
    const attendanceSubmitted = attendanceSubmittedStr === "" ? null : attendanceSubmittedStr === "true";

    await captureLiveSnapshot({
      floorId,
      scheduleId,
      attendanceDate,
      timeSlotId,
      sectionId,
      subjectId,
      teacherId,
      substituteTeacherId,
      status,
      attendanceSubmitted,
    });

    revalidatePath("/floor-operations");
    return { status: "done", message: "Classroom inspection snapshot updated." };
  } catch (error) {
    return stateFrom(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Teacher Absence Action                                                     */
/* -------------------------------------------------------------------------- */

export async function recordTeacherAbsenceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("attendance.mark", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const employeeId = field(formData, "employeeId");
    const absenceDate = field(formData, "absenceDate");
    const scope = (field(formData, "scope") || "day") as "day" | "period" | "partial";
    const startTimeSlotId = field(formData, "startTimeSlotId") || null;
    const endTimeSlotId = field(formData, "endTimeSlotId") || null;
    const reason = field(formData, "reason") || null;
    const source = (field(formData, "source") || "manual") as "manual" | "biometric" | "leave_request";
    const leaveRequestId = field(formData, "leaveRequestId") || null;

    await recordTeacherAbsence(
      {
        institutionId,
        employeeId,
        absenceDate,
        scope,
        startTimeSlotId,
        endTimeSlotId,
        reason,
        source,
        leaveRequestId,
      },
      auth.principal.userId,
    );

    revalidatePath("/floor-operations");
    return { status: "done", message: "Teacher absence recorded successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Extra Period Actions                                                       */
/* -------------------------------------------------------------------------- */

export async function createExtraPeriodAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("attendance.update", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const academicSessionId = field(formData, "academicSessionId");
    const replacesScheduleId = field(formData, "replacesScheduleId") || null;
    const teacherId = field(formData, "teacherId") || null;
    const sectionId = field(formData, "sectionId") || null;
    const timeSlotId = field(formData, "timeSlotId");
    const extraDate = field(formData, "extraDate");
    const reason = field(formData, "reason") as
      | "replacement"
      | "substitution"
      | "additional_class"
      | "exam_duty"
      | "invigilation"
      | "other";
    const resolution = (field(formData, "resolution") || null) as
      | "replacement_teacher"
      | "alternative_activity"
      | "test"
      | "self_study"
      | "period_cancelled"
      | null;
    const notes = field(formData, "notes") || null;

    await createExtraPeriod(
      {
        institutionId,
        academicSessionId,
        replacesScheduleId,
        teacherId,
        sectionId,
        timeSlotId,
        extraDate,
        reason,
        resolution,
        isPayable: false,
        notes,
      },
      auth.principal.userId,
    );

    revalidatePath("/floor-operations");
    return { status: "done", message: "Extra period cover assigned." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function approveExtraPeriodAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("attendance.update", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const extraPeriodId = field(formData, "extraPeriodId");
    await approveExtraPeriod(
      { extraPeriodId },
      auth.principal.userId,
      new Date(),
    );

    revalidatePath("/floor-operations");
    return { status: "done", message: "Extra period approved for payable calculation." };
  } catch (error) {
    return stateFrom(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Incident Report Actions                                                    */
/* -------------------------------------------------------------------------- */

export async function createIncidentReportAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("attendance.mark", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const campusId = field(formData, "campusId") || null;
    const floorId = field(formData, "floorId") || null;
    const sectionId = field(formData, "sectionId") || null;
    const severity = field(formData, "severity") as "low" | "medium" | "high" | "critical";
    const kind = field(formData, "kind") as
      | "behaviour"
      | "injury"
      | "absence"
      | "device_failure"
      | "security"
      | "other";
    const description = field(formData, "description");
    const occurredAtStr = field(formData, "occurredAt");
    const occurredAt = occurredAtStr ? new Date(occurredAtStr) : new Date();

    await createIncidentReport(
      {
        institutionId,
        campusId,
        floorId,
        sectionId,
        severity,
        kind,
        description,
        occurredAt,
      },
      auth.principal.userId,
    );

    revalidatePath("/floor-operations");
    return { status: "done", message: "Incident logged." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function escalateIncidentReportAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("attendance.mark", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const incidentId = field(formData, "incidentId");
    const escalatedToUserId = field(formData, "escalatedToUserId");

    await escalateIncidentReport(
      { incidentId, escalatedToUserId },
      new Date(),
    );

    revalidatePath("/floor-operations");
    return { status: "done", message: "Incident escalated to supervisor." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function resolveIncidentReportAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("attendance.mark", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const incidentId = field(formData, "incidentId");
    const resolutionNotes = field(formData, "resolutionNotes");

    await resolveIncidentReport(
      { incidentId, resolutionNotes },
      auth.principal.userId,
      new Date(),
    );

    revalidatePath("/floor-operations");
    return { status: "done", message: "Incident marked as resolved." };
  } catch (error) {
    return stateFrom(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Floor Incharge Assignment Action                                           */
/* -------------------------------------------------------------------------- */

export async function assignFloorInchargeAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeFloorMutation("academic.manage", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const floorId = field(formData, "floorId");
    const userId = field(formData, "userId");

    await assignFloorIncharge({
      institutionId,
      floorId,
      userId,
    });

    revalidatePath("/floor-operations");
    return { status: "done", message: "Floor incharge assigned successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}
