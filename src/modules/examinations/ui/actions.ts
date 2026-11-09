"use server";

/**
 * Server Actions for Examinations & Marks (`ARCHITECTURE.md` §15/§23, `PRD.md` MODULE 20).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  createExamination,
  enterMarksBatch,
  publishExamination,
  recordExamMarkCorrection,
} from "@/modules/examinations";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
  console.error("examinations action error:", error);
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

async function authorizeExamManage(
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation("attendance.update", institutionId);
    return { ok: true, principal };
  } catch (error) {
    return { ok: false, state: stateFrom(error) };
  }
}

export async function createExaminationAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeExamManage(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const academicSessionId = field(formData, "academicSessionId");
    const subjectId = field(formData, "subjectId");
    const title = field(formData, "title");
    const examinationType = field(formData, "examinationType") as
      | "monthly_test"
      | "grand_test"
      | "midterm"
      | "annual"
      | "quiz"
      | "practical";
    const classId = field(formData, "classId") || null;
    const sectionId = field(formData, "sectionId") || null;
    const totalMarks = Number(field(formData, "totalMarks"));
    const passMarksStr = field(formData, "passMarks");
    const passMarks = passMarksStr ? Number(passMarksStr) : null;
    const examDate = field(formData, "examDate");

    const created = await createExamination(
      {
        institutionId,
        academicSessionId,
        subjectId,
        title,
        examinationType,
        classId,
        sectionId,
        totalMarks,
        passMarks,
        examDate,
      },
      auth.principal.userId,
    );

    revalidatePath("/examinations");
    return { status: "done", message: `Examination "${created.title}" scheduled successfully.` };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function enterMarksBatchAction(payload: {
  readonly institutionId: string;
  readonly examinationId: string;
  readonly marks: readonly {
    readonly studentId: string;
    readonly status: "pending" | "absent" | "submitted" | "malpractice" | "withheld";
    readonly obtainedMarks: number | null;
    readonly statusReason?: string | null;
    readonly notes?: string | null;
  }[];
  readonly finalize?: boolean;
}): Promise<{ readonly ok: boolean; readonly message: string }> {
  const auth = await authorizeExamManage(payload.institutionId);
  if (!auth.ok) {
    const errorMsg = "message" in auth.state && typeof auth.state.message === "string" ? auth.state.message : "Authorization denied.";
    return { ok: false, message: errorMsg };
  }

  try {
    const result = await enterMarksBatch(
      {
        examinationId: payload.examinationId,
        marks: payload.marks,
        finalize: payload.finalize ?? false,
      },
      auth.principal.userId,
    );

    revalidatePath("/examinations");
    revalidatePath(`/examinations/${payload.examinationId}`);
    return {
      ok: true,
      message: `Marks recorded successfully (${result.savedCount} saved, ${result.updatedCount} updated).`,
    };
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: error.userMessage };
    }
    return { ok: false, message: "Failed to record marks." };
  }
}

export async function recordExamMarkCorrectionAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeExamManage(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const examinationMarkId = field(formData, "examinationMarkId");
    const correctedMarks = Number(field(formData, "correctedMarks"));
    const reason = field(formData, "reason");

    await recordExamMarkCorrection(
      {
        examinationMarkId,
        correctedMarks,
        reason,
      },
      auth.principal.userId,
    );

    revalidatePath("/examinations");
    return { status: "done", message: "Mark correction recorded successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function publishExaminationAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeExamManage(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const examinationId = field(formData, "examinationId");
    await publishExamination({ examinationId }, auth.principal.userId);

    revalidatePath("/examinations");
    revalidatePath(`/examinations/${examinationId}`);
    return { status: "done", message: "Examination results published successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}
