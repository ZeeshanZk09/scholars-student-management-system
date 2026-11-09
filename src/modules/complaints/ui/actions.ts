"use server";

/**
 * Server Actions for Complaints (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 */

import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  addComplaintComment,
  assignComplaint,
  dismissComplaint,
  escalateComplaint,
  notifyStudentOrGuardian,
  resolveComplaint,
  submitComplaint,
} from "@/modules/complaints";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
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
  return { status: "error", message: "An unexpected error occurred. Please try again." };
}

async function authorizeComplaintMutation(
  institutionId: string,
): Promise<
  | { readonly ok: true; readonly principal: Principal }
  | { readonly ok: false; readonly state: FormState }
> {
  try {
    const principal = await requireInstitutionMutation("students.update", institutionId);
    return { ok: true, principal };
  } catch (error) {
    return { ok: false, state: stateFrom(error) };
  }
}

export async function submitComplaintAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeComplaintMutation(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const academicSessionId = field(formData, "academicSessionId");
    const studentId = field(formData, "studentId");
    const title = field(formData, "title");
    const reason = field(formData, "reason");
    const description = field(formData, "description");
    const reportedDate = field(formData, "reportedDate");
    const severity = (field(formData, "severity") || "medium") as "low" | "medium" | "high" | "critical";
    const classId = field(formData, "classId") || null;
    const sectionId = field(formData, "sectionId") || null;
    const subjectId = field(formData, "subjectId") || null;

    const created = await submitComplaint(
      {
        institutionId,
        academicSessionId,
        studentId,
        title,
        reason,
        description,
        reportedDate,
        severity,
        classId,
        sectionId,
        subjectId,
      },
      auth.principal.userId,
    );

    revalidatePath("/complaints");
    revalidatePath(`/students/${studentId}`);
    return {
      status: "done",
      message: `Complaint "${created.title}" lodged successfully.`,
    };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function assignComplaintAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeComplaintMutation(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const complaintId = field(formData, "complaintId");
    const assignedToUserId = field(formData, "assignedToUserId");

    await assignComplaint(
      {
        complaintId,
        assignedToUserId,
      },
      auth.principal.userId,
    );

    revalidatePath("/complaints");
    revalidatePath(`/complaints/${complaintId}`);
    return {
      status: "done",
      message: "Complaint assigned to investigator successfully.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function resolveComplaintAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeComplaintMutation(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const complaintId = field(formData, "complaintId");
    const actionTaken = field(formData, "actionTaken");
    const details = field(formData, "details") || undefined;

    await resolveComplaint(
      {
        complaintId,
        actionTaken,
        details,
      },
      auth.principal.userId,
    );

    revalidatePath("/complaints");
    revalidatePath(`/complaints/${complaintId}`);
    return {
      status: "done",
      message: "Complaint resolved successfully.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function dismissComplaintAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeComplaintMutation(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const complaintId = field(formData, "complaintId");
    const dismissalReason = field(formData, "dismissalReason");

    await dismissComplaint(
      {
        complaintId,
        dismissalReason,
      },
      auth.principal.userId,
    );

    revalidatePath("/complaints");
    revalidatePath(`/complaints/${complaintId}`);
    return {
      status: "done",
      message: "Complaint dismissed.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function escalateComplaintAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeComplaintMutation(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const complaintId = field(formData, "complaintId");
    const reason = field(formData, "reason");
    const targetAssigneeId = field(formData, "targetAssigneeId") || null;

    await escalateComplaint(
      {
        complaintId,
        reason,
        targetAssigneeId,
      },
      auth.principal.userId,
    );

    revalidatePath("/complaints");
    revalidatePath(`/complaints/${complaintId}`);
    return {
      status: "done",
      message: "Complaint escalated to leadership.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function notifyStudentOrGuardianAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeComplaintMutation(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const complaintId = field(formData, "complaintId");
    const channel = (field(formData, "channel") || "both") as "student" | "guardian" | "both";

    await notifyStudentOrGuardian(
      {
        complaintId,
        channel,
      },
      auth.principal.userId,
    );

    revalidatePath(`/complaints/${complaintId}`);
    return {
      status: "done",
      message: "Notification sent successfully.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function addComplaintCommentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeComplaintMutation(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const complaintId = field(formData, "complaintId");
    const body = field(formData, "body");
    const isInternal = formData.get("isInternal") === "true";
    const parentCommentId = field(formData, "parentCommentId") || null;

    await addComplaintComment(
      {
        complaintId,
        body,
        isInternal,
        parentCommentId,
      },
      auth.principal.userId,
    );

    revalidatePath(`/complaints/${complaintId}`);
    return {
      status: "done",
      message: isInternal ? "Internal staff note saved." : "Feedback comment added.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}
