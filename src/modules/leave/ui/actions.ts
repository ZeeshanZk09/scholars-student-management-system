"use server";

/**
 * Server Actions for Leave Requests (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  cancelLeaveRequest,
  reviewLeaveRequest,
  submitStudentLeaveRequest,
} from "@/modules/leave";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
  console.error("leave action error:", error);
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

async function authorizeLeaveAction(
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation("attendance.update", institutionId);
    return { ok: true, principal };
  } catch (error) {
    return { ok: false, state: stateFrom(error) };
  }
}

export async function submitStudentLeaveAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeLeaveAction(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const studentId = field(formData, "studentId");
    const fromDate = field(formData, "fromDate");
    const toDate = field(formData, "toDate");
    const reason = field(formData, "reason");
    const notes = field(formData, "notes") || null;

    const created = await submitStudentLeaveRequest(
      {
        institutionId,
        studentId,
        fromDate,
        toDate,
        reason,
        notes,
      },
      auth.principal.userId,
      "guardian",
    );

    revalidatePath("/leave");
    revalidatePath(`/students/${studentId}`);
    return { status: "done", message: `Leave request for ${created.totalDays} day(s) submitted successfully.` };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function reviewLeaveRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeLeaveAction(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const leaveRequestId = field(formData, "leaveRequestId");
    const status = field(formData, "status") as "approved" | "rejected" | "cancelled";
    const decisionNotes = field(formData, "decisionNotes") || null;

    const updated = await reviewLeaveRequest(
      {
        leaveRequestId,
        status,
        decisionNotes,
      },
      auth.principal.userId,
    );

    revalidatePath("/leave");
    return { status: "done", message: `Leave request marked as ${updated.status}.` };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function cancelLeaveRequestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeLeaveAction(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const leaveRequestId = field(formData, "leaveRequestId");

    await cancelLeaveRequest(
      { leaveRequestId },
      auth.principal.userId,
    );

    revalidatePath("/leave");
    return { status: "done", message: "Leave request cancelled successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}
