"use server";

/**
 * Server Actions for Monthly Test Reports (`PRD.md` MODULE 22, `RULES.md` §43/§46/§47).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";
import { DrizzleMonthlyReportStore } from "../infrastructure/drizzle-store";
import { MonthlyReportService } from "../application/monthly-report-service";

const defaultStore = new DrizzleMonthlyReportStore();
const service = new MonthlyReportService(defaultStore);

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
  return { status: "error", message: "Something went wrong while generating the report. Please try again." };
}

async function authorizeResultsMutation(
  permission: "results.enter" | "results.publish",
  institutionId: string,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation(permission, institutionId);
    return { ok: true, principal };
  } catch (error) {
    return { ok: false, state: stateFrom(error) };
  }
}

/**
 * Generates a monthly test report for a single student and subject.
 */
export async function generateMonthlyReportAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeResultsMutation("results.enter", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const academicSessionId = field(formData, "academicSessionId");
    const studentId = field(formData, "studentId");
    const subjectId = field(formData, "subjectId");
    const periodMonth = field(formData, "periodMonth");
    const classId = field(formData, "classId") || null;
    const sectionId = field(formData, "sectionId") || null;

    const res = await service.generateReport(
      {
        institutionId,
        academicSessionId,
        studentId,
        subjectId,
        periodMonth,
        classId,
        sectionId,
      },
      auth.principal.userId,
    );

    revalidatePath("/reports");
    const supersededMsg = res.supersededReportId ? " (superseded previous version)" : "";
    return {
      status: "done",
      message: `Monthly report compiled successfully with ${res.report.testsCounted} tests counted${supersededMsg}.`,
    };
  } catch (error) {
    return stateFrom(error);
  }
}

/**
 * Batch generates monthly test reports for all enrolled students in a class.
 */
export async function batchGenerateMonthlyReportsAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  const auth = await authorizeResultsMutation("results.enter", institutionId);
  if (!auth.ok) return auth.state;

  try {
    const academicSessionId = field(formData, "academicSessionId");
    const classId = field(formData, "classId");
    const sectionId = field(formData, "sectionId") || null;
    const periodMonth = field(formData, "periodMonth");
    const subjectId = field(formData, "subjectId") || null;

    const res = await service.batchGenerateReports(
      {
        institutionId,
        academicSessionId,
        classId,
        sectionId,
        periodMonth,
        subjectId,
      },
      auth.principal.userId,
    );

    revalidatePath("/reports");
    return {
      status: "done",
      message: `Batch compilation complete: ${res.generatedCount} generated (${res.supersededCount} superseded), ${res.skippedCount} skipped due to no tests sat.`,
    };
  } catch (error) {
    return stateFrom(error);
  }
}

/**
 * Publishes a batch of monthly test reports.
 */
export async function publishMonthlyReportsAction(payload: {
  readonly institutionId: string;
  readonly reportIds: readonly string[];
  readonly sendEmail?: boolean | undefined;
}): Promise<FormState> {
  const auth = await authorizeResultsMutation("results.publish", payload.institutionId);
  if (!auth.ok) return auth.state;

  try {
    const res = await service.publishReports(
      {
        institutionId: payload.institutionId,
        reportIds: payload.reportIds,
        sendEmail: payload.sendEmail ?? false,
      },
      auth.principal.userId,
    );

    revalidatePath("/reports");
    return {
      status: "done",
      message: `Published ${res.publishedCount} monthly test reports successfully.`,
    };
  } catch (error) {
    return stateFrom(error);
  }
}

/**
 * Locks a batch of monthly test reports for permanent immutability.
 */
export async function lockMonthlyReportsAction(payload: {
  readonly institutionId: string;
  readonly reportIds: readonly string[];
}): Promise<FormState> {
  const auth = await authorizeResultsMutation("results.publish", payload.institutionId);
  if (!auth.ok) return auth.state;

  try {
    const res = await service.lockReports(
      {
        institutionId: payload.institutionId,
        reportIds: payload.reportIds,
      },
      auth.principal.userId,
    );

    revalidatePath("/reports");
    return {
      status: "done",
      message: `Locked ${res.lockedCount} monthly test reports. They are now permanent and cannot be modified.`,
    };
  } catch (error) {
    return stateFrom(error);
  }
}
