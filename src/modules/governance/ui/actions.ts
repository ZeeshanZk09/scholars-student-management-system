"use server";

/**
 * System Governance server actions (`PRD.md` MODULE 31/32, `ARCHITECTURE.md` §30/§40–§42).
 *
 * Implements institution-scoped setting overrides and history tracking.
 */

import { revalidatePath } from "next/cache";

import { requireInstitutionMutation, requireInstitutionRead } from "@/lib/permissions-server";
import {
  overrideSetting,
  resetSettingToDefault,
  getSettingHistory,
  type SettingChangeRecord,
} from "@/modules/governance";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";
import {
  overrideSettingSchema,
  resetSettingSchema,
} from "../application/schemas";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
  console.error("Governance action error:", error);
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

/**
 * Server action to manually override an institution configuration setting.
 */
export async function overrideSettingAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  let principal;
  try {
    principal = await requireInstitutionMutation("settings.manage", institutionId);
  } catch (error) {
    return stateFrom(error);
  }

  try {
    const rawValue = field(formData, "value");
    const settingKey = field(formData, "settingKey");
    const settingCategory = field(formData, "settingCategory");
    const settingValueType = field(formData, "settingValueType");
    const numberUnit = field(formData, "numberUnit");
    const overrideReason = field(formData, "overrideReason");

    let stringValue: string | null = null;
    let numberValue: number | null = null;
    let booleanValue: boolean | null = null;
    let jsonValue: unknown | null = null;

    switch (settingValueType) {
      case "string":
        stringValue = rawValue;
        break;
      case "number":
        numberValue = Number.parseInt(rawValue, 10);
        break;
      case "boolean":
        booleanValue = rawValue === "true" || rawValue === "1" || rawValue === "on";
        break;
      case "json":
      case "date":
        try {
          jsonValue = JSON.parse(rawValue);
        } catch {
          jsonValue = rawValue;
        }
        break;
    }

    const parsed = overrideSettingSchema.parse({
      institutionId,
      settingKey,
      settingCategory,
      settingValueType,
      stringValue,
      numberValue,
      booleanValue,
      jsonValue,
      numberUnit: numberUnit || null,
      overrideReason,
    });

    await overrideSetting(parsed, principal.userId);

    revalidatePath("/admin/settings");
    return {
      status: "done",
      message: "Institution setting has been customized and logged to the audit trail.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}

/**
 * Server action to reset an institution setting back to its system default.
 */
export async function resetSettingAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const institutionId = field(formData, "institutionId");
  let principal;
  try {
    principal = await requireInstitutionMutation("settings.manage", institutionId);
  } catch (error) {
    return stateFrom(error);
  }

  try {
    const settingKey = field(formData, "settingKey");
    const resetReason = field(formData, "resetReason");

    const parsed = resetSettingSchema.parse({
      institutionId,
      settingKey,
      resetReason,
    });

    await resetSettingToDefault(parsed, principal.userId);

    revalidatePath("/admin/settings");
    return {
      status: "done",
      message: "Setting restored to system default value.",
    };
  } catch (error) {
    return stateFrom(error);
  }
}

/**
 * Server action to fetch change audit history for a setting.
 */
export async function getSettingHistoryAction(
  institutionId: string,
  settingKey?: string,
): Promise<{ ok: true; history: readonly SettingChangeRecord[] } | { ok: false; message: string }> {
  try {
    await requireInstitutionRead("settings.manage", institutionId);
    const history = await getSettingHistory(institutionId, settingKey);
    return { ok: true, history };
  } catch (error) {
    if (isAppError(error)) {
      return { ok: false, message: error.userMessage };
    }
    return { ok: false, message: "Could not load setting history." };
  }
}
