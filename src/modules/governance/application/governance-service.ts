/**
 * Governance application service (`PRD.md` MODULE 31/32, `RULES.md` §37).
 *
 * Coordinates audit logging, centralized system configurations, and audited manual overrides.
 */

import { NotFoundError, ValidationError } from "@/shared/errors";

import {
  formatSettingValue,
  SYSTEM_SETTING_CATALOG,
  validateSettingInput,
  type SettingCategory,
  type SettingChangeRecord,
  type SystemSettingRecord,
} from "../domain/system-settings";
import {
  validateAuditEvent,
  type AuditRecord,
  type NewAuditEventInput,
} from "../domain/audit-trail";
import type {
  AuditLogQueryFilter,
  EffectiveSettingView,
  GovernanceStore,
  PaginatedAuditResult,
} from "./ports";
import type { OverrideSettingInput, ResetSettingInput } from "./schemas";

export class GovernanceService {
  constructor(private readonly store: GovernanceStore) {}

  /**
   * Append an immutable audit event to the system log.
   */
  async recordAuditEvent(input: NewAuditEventInput): Promise<AuditRecord> {
    const validated = validateAuditEvent(input);

    return this.store.appendAuditEvent({
      ...input,
      actorDisplayName: validated.actorDisplayName,
      beforeState: validated.beforeState,
      afterState: validated.afterState,
      context: validated.context,
    });
  }

  /**
   * Query the immutable audit trail with criteria filters.
   */
  async queryAuditTrail(filter: AuditLogQueryFilter): Promise<PaginatedAuditResult> {
    return this.store.queryAuditEvents(filter);
  }

  /**
   * Retrieve effective institution settings, combining predefined catalog defaults
   * with authorized institution overrides.
   */
  async getInstitutionSettings(
    institutionId: string,
    category?: SettingCategory,
  ): Promise<readonly EffectiveSettingView[]> {
    const catalogItems = category
      ? SYSTEM_SETTING_CATALOG.filter((item) => item.category === category)
      : SYSTEM_SETTING_CATALOG;

    const storedSettings = await this.store.listSettings(institutionId, category);
    const storedMap = new Map<string, SystemSettingRecord>();
    for (const s of storedSettings) {
      storedMap.set(s.settingKey, s);
    }

    return catalogItems.map((def): EffectiveSettingView => {
      const stored = storedMap.get(def.key);
      if (stored) {
        let effectiveVal: unknown;
        switch (stored.settingValueType) {
          case "string":
            effectiveVal = stored.stringValue;
            break;
          case "number":
            effectiveVal = stored.numberValue;
            break;
          case "boolean":
            effectiveVal = stored.booleanValue;
            break;
          case "json":
          case "date":
            effectiveVal = stored.jsonValue;
            break;
        }

        return {
          key: def.key,
          category: def.category,
          label: def.label,
          description: stored.description || def.description,
          type: stored.settingValueType,
          numberUnit: stored.numberUnit ?? def.numberUnit,
          effectiveValue: effectiveVal,
          displayValue: formatSettingValue(stored),
          isOverridden: stored.defaultSource === "manual",
          defaultSource: stored.defaultSource,
          updatedAt: stored.updatedAt,
          updatedByUserId: stored.updatedByUserId,
        };
      }

      // Catalog default fallback
      const display =
        def.type === "number"
          ? `${String(def.defaultValue)}${def.numberUnit ? ` ${def.numberUnit}` : ""}`
          : def.type === "boolean"
            ? def.defaultValue ? "Enabled" : "Disabled"
            : String(def.defaultValue);

      return {
        key: def.key,
        category: def.category,
        label: def.label,
        description: def.description,
        type: def.type,
        numberUnit: def.numberUnit,
        effectiveValue: def.defaultValue,
        displayValue: display,
        isOverridden: false,
        defaultSource: "system",
        updatedAt: null,
        updatedByUserId: null,
      };
    });
  }

  /**
   * Apply an authorized manual override to an institution setting.
   * Enforces non-empty business reason, preserves change history, and generates an audit record.
   */
  async overrideSetting(
    input: OverrideSettingInput,
    actorUserId: string,
  ): Promise<SystemSettingRecord> {
    validateSettingInput({
      ...input,
      defaultSource: "manual",
    });

    const existing = await this.store.getSetting(input.institutionId, input.settingKey);
    const catalogDef = SYSTEM_SETTING_CATALOG.find((d) => d.key === input.settingKey);

    const previousValueText = existing
      ? formatSettingValue(existing)
      : catalogDef
        ? String(catalogDef.defaultValue)
        : null;

    const newValueText = formatSettingValue({
      settingValueType: input.settingValueType,
      stringValue: input.stringValue,
      numberValue: input.numberValue,
      booleanValue: input.booleanValue,
      jsonValue: input.jsonValue,
      numberUnit: input.numberUnit,
    });

    if (previousValueText === newValueText) {
      throw new ValidationError("No configuration change detected", {
        settingKey: ["The new value is identical to the current configuration."],
      });
    }

    const updated = await this.store.upsertSetting({
      institutionId: input.institutionId,
      settingKey: input.settingKey,
      settingValueType: input.settingValueType,
      settingCategory: input.settingCategory,
      stringValue: input.stringValue,
      numberValue: input.numberValue,
      booleanValue: input.booleanValue,
      jsonValue: input.jsonValue,
      numberUnit: input.numberUnit,
      defaultSource: "manual",
      updatedByUserId: actorUserId,
    });

    // Immutable record of setting change
    await this.store.recordSettingChange({
      institutionId: input.institutionId,
      settingKey: input.settingKey,
      previousValue: previousValueText,
      newValue: newValueText,
      typedValues: {
        previous: existing?.stringValue ?? existing?.numberValue ?? existing?.booleanValue,
        next: input.stringValue ?? input.numberValue ?? input.booleanValue,
      },
      overrideReason: input.overrideReason,
      changedByUserId: actorUserId,
    });

    // Append to immutable audit trail
    await this.recordAuditEvent({
      institutionId: input.institutionId,
      actorUserId,
      action: "configuration.override",
      result: "success",
      targetType: "system_setting",
      targetId: input.settingKey,
      beforeState: existing
        ? {
            settingKey: existing.settingKey,
            value: previousValueText,
            defaultSource: existing.defaultSource,
          }
        : null,
      afterState: {
        settingKey: updated.settingKey,
        value: newValueText,
        defaultSource: updated.defaultSource,
      },
      context: {
        overrideReason: input.overrideReason,
        category: input.settingCategory,
      },
    });

    return updated;
  }

  /**
   * Reset an institution override back to system default.
   */
  async resetSettingToDefault(
    input: ResetSettingInput,
    actorUserId: string,
  ): Promise<SystemSettingRecord> {
    const catalogDef = SYSTEM_SETTING_CATALOG.find((d) => d.key === input.settingKey);
    if (!catalogDef) {
      throw new NotFoundError(`System configuration '${input.settingKey}' does not exist.`);
    }

    const existing = await this.store.getSetting(input.institutionId, input.settingKey);
    const previousValueText = existing ? formatSettingValue(existing) : null;
    const defaultVal = catalogDef.defaultValue;

    const updated = await this.store.upsertSetting({
      institutionId: input.institutionId,
      settingKey: catalogDef.key,
      settingValueType: catalogDef.type,
      settingCategory: catalogDef.category,
      stringValue: catalogDef.type === "string" ? String(defaultVal) : null,
      numberValue: catalogDef.type === "number" ? Number(defaultVal) : null,
      booleanValue: catalogDef.type === "boolean" ? Boolean(defaultVal) : null,
      jsonValue: catalogDef.type === "json" || catalogDef.type === "date" ? defaultVal : null,
      numberUnit: catalogDef.numberUnit ?? null,
      defaultSource: "system",
      updatedByUserId: actorUserId,
    });

    const newValueText = formatSettingValue(updated);

    await this.store.recordSettingChange({
      institutionId: input.institutionId,
      settingKey: catalogDef.key,
      previousValue: previousValueText,
      newValue: newValueText,
      overrideReason: input.resetReason,
      changedByUserId: actorUserId,
    });

    await this.recordAuditEvent({
      institutionId: input.institutionId,
      actorUserId,
      action: "configuration.reset",
      result: "success",
      targetType: "system_setting",
      targetId: catalogDef.key,
      beforeState: existing ? { value: previousValueText } : null,
      afterState: { value: newValueText, defaultSource: "system" },
      context: { resetReason: input.resetReason },
    });

    return updated;
  }

  /**
   * Retrieve historical changes for settings within an institution.
   */
  async getSettingHistory(
    institutionId: string,
    settingKey?: string,
  ): Promise<readonly SettingChangeRecord[]> {
    return this.store.listSettingChanges(institutionId, settingKey);
  }
}
