"use server";

/**
 * Attendance server actions (`ARCHITECTURE.md` §17–§18, `PRD.md` MODULE 17).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  openAttendanceSession,
  recordAttendanceCorrection,
  saveAttendanceMarks,
} from "@/modules/attendance";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
  console.error("attendance action error:", error);
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
  return { status: "error", message: "Something went wrong. Please try again." };
}

async function authorizeAttendanceMark(
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation("attendance.mark", institutionId);
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

async function authorizeAttendanceUpdate(
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation("attendance.update", institutionId);
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

export async function openAttendanceSessionAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeAttendanceMark(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const sectionId = field(formData, "sectionId");
    const academicSessionId = field(formData, "academicSessionId");
    const attendanceDate = field(formData, "attendanceDate");
    const timeSlotId = field(formData, "timeSlotId");

    await openAttendanceSession(
      {
        sectionId,
        academicSessionId,
        attendanceDate,
        timeSlotId,
      },
      auth.principal.userId,
    );

    revalidatePath("/attendance");
    revalidatePath(`/attendance/${sectionId}`);
    return { status: "done", message: "Attendance register opened successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function saveAttendanceMarksDirectAction(payload: {
  institutionId: string;
  sectionId: string;
  academicSessionId: string;
  attendanceDate: string;
  timeSlotId: string;
  scheduleId?: string | null | undefined;
  marks: Array<{
    studentId: string;
    status: "present" | "absent" | "late" | "leave";
    minutesLate?: number | null | undefined;
    leaveRequestId?: string | null | undefined;
    remarks?: string | null | undefined;
  }>;
  isSubmitting?: boolean | undefined;
}): Promise<{ ok: boolean; message: string }> {
  const auth = await authorizeAttendanceMark(payload.institutionId);
  if (!auth.ok) {
    return { ok: false, message: auth.state.status === "error" ? auth.state.message : "Unauthorized" };
  }

  try {
    await saveAttendanceMarks(
      {
        sectionId: payload.sectionId,
        academicSessionId: payload.academicSessionId,
        attendanceDate: payload.attendanceDate,
        timeSlotId: payload.timeSlotId,
        scheduleId: payload.scheduleId ?? null,
        marks: payload.marks,
        isSubmitting: payload.isSubmitting ?? false,
      },
      auth.principal.userId,
    );

    revalidatePath("/attendance");
    revalidatePath(`/attendance/${payload.sectionId}`);
    return {
      ok: true,
      message: payload.isSubmitting
        ? "Attendance register finalized and published."
        : "Attendance marks saved as draft.",
    };
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: error.userMessage };
    }
    return { ok: false, message: "Failed to save attendance marks." };
  }
}

export async function recordAttendanceCorrectionAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeAttendanceUpdate(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const sectionId = field(formData, "sectionId");
    const attendanceDate = field(formData, "attendanceDate");
    const timeSlotId = field(formData, "timeSlotId");
    const studentId = field(formData, "studentId");
    const afterStatus = field(formData, "afterStatus") as "present" | "absent" | "late" | "leave";
    const reason = field(formData, "reason");

    await recordAttendanceCorrection(
      {
        sectionId,
        attendanceDate,
        timeSlotId,
        studentId,
        afterStatus,
        reason,
      },
      auth.principal.userId,
    );

    revalidatePath("/attendance");
    revalidatePath(`/attendance/${sectionId}`);
    return { status: "done", message: "Attendance correction recorded successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}
