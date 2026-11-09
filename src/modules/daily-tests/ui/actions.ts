"use server";

/**
 * Server Actions for Daily Tests & Marks (`ARCHITECTURE.md` §23, `PRD.md` MODULE 21).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  createDailyTest,
  batchEnterEvaluations,
  lockDailyTest,
  publishDailyTest,
  recordDailyTestCorrection,
} from "@/modules/daily-tests";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";
import type { DailyTestEvaluationStatus } from "../domain/daily-test-rules";
import type { DailyTestPublicationChannel } from "../application/ports";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
  console.error("daily-tests action error:", error);
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

async function authorizeTestEnter(
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation("results.enter", institutionId);
    return { ok: true, principal };
  } catch (error) {
    return { ok: false, state: stateFrom(error) };
  }
}

async function authorizeTestPublish(
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation("results.publish", institutionId);
    return { ok: true, principal };
  } catch (error) {
    return { ok: false, state: stateFrom(error) };
  }
}

export async function createDailyTestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeTestEnter(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const academicSessionId = field(formData, "academicSessionId");
    const subjectId = field(formData, "subjectId");
    const title = field(formData, "title");
    const testDate = field(formData, "testDate");
    const totalMarks = Number(field(formData, "totalMarks"));
    const classId = field(formData, "classId") || null;
    const sectionId = field(formData, "sectionId") || null;
    const instructions = field(formData, "instructions") || null;

    const created = await createDailyTest(
      {
        institutionId,
        academicSessionId,
        subjectId,
        title,
        testDate,
        totalMarks,
        classId,
        sectionId,
        instructions,
      },
      auth.principal.userId,
    );

    revalidatePath("/daily-tests");
    return { status: "done", message: `Daily test "${created.title}" created successfully.` };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function batchEnterEvaluationsAction(payload: {
  readonly institutionId: string;
  readonly dailyTestId: string;
  readonly evaluations: readonly {
    readonly studentId: string;
    readonly status: DailyTestEvaluationStatus;
    readonly obtainedMarks: number | null;
    readonly statusReason?: string | null | undefined;
    readonly notes?: string | null | undefined;
  }[];
}): Promise<{ readonly ok: boolean; readonly message: string }> {
  const auth = await authorizeTestEnter(payload.institutionId);
  if (!auth.ok) {
    const errorMsg =
      "message" in auth.state && typeof auth.state.message === "string"
        ? auth.state.message
        : "Authorization denied.";
    return { ok: false, message: errorMsg };
  }

  try {
    const result = await batchEnterEvaluations(
      {
        dailyTestId: payload.dailyTestId,
        evaluations: payload.evaluations,
      },
      auth.principal.userId,
    );

    revalidatePath("/daily-tests");
    revalidatePath(`/daily-tests/${payload.dailyTestId}`);
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

export async function recordDailyTestCorrectionAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeTestEnter(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const dailyTestEvaluationId = field(formData, "dailyTestEvaluationId");
    const correctedMarks = Number(field(formData, "correctedMarks"));
    const reason = field(formData, "reason");

    await recordDailyTestCorrection(
      {
        dailyTestEvaluationId,
        correctedMarks,
        reason,
      },
      auth.principal.userId,
    );

    revalidatePath("/daily-tests");
    return { status: "done", message: "Mark correction recorded successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function publishDailyTestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeTestPublish(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const dailyTestId = field(formData, "dailyTestId");
    const channelsRaw = field(formData, "channels");
    const channels = channelsRaw
      ? (channelsRaw.split(",") as DailyTestPublicationChannel[])
      : (["student_portal", "guardian_portal"] as DailyTestPublicationChannel[]);

    await publishDailyTest({ dailyTestId, channels }, auth.principal.userId);

    revalidatePath("/daily-tests");
    revalidatePath(`/daily-tests/${dailyTestId}`);
    return { status: "done", message: "Daily test published successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function lockDailyTestAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeTestPublish(institutionId);
  if (!auth.ok) return auth.state;

  try {
    const dailyTestId = field(formData, "dailyTestId");
    await lockDailyTest({ dailyTestId }, auth.principal.userId);

    revalidatePath("/daily-tests");
    revalidatePath(`/daily-tests/${dailyTestId}`);
    return { status: "done", message: "Daily test locked successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}
