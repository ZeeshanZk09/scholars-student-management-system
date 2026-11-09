/**
 * In-memory test fake for the GovernanceStore port (`ARCHITECTURE.md` §30, `MODULE 31/32`).
 *
 * Implements strict append-only audit semantics and accurate setting overrides.
 */

import { randomUUID } from "node:crypto";

import { assertAuditTrailImmutable, type AuditRecord } from "../../domain/audit-trail";
import type { SettingChangeRecord, SystemSettingRecord } from "../../domain/system-settings";
import type {
  AuditLogQueryFilter,
  GovernanceStore,
  InsertSettingChangeInput,
  PaginatedAuditResult,
  UpsertSettingInput,
} from "../ports";

export class FakeGovernanceStore implements GovernanceStore {
  readonly auditEvents: AuditRecord[] = [];
  readonly settings: Map<string, SystemSettingRecord> = new Map();
  readonly settingChanges: SettingChangeRecord[] = [];

  private settingStorageKey(institutionId: string, settingKey: string): string {
    return `${institutionId}:${settingKey}`;
  }

  async appendAuditEvent(event: Parameters<GovernanceStore["appendAuditEvent"]>[0]): Promise<AuditRecord> {
    assertAuditTrailImmutable("insert");

    const record: AuditRecord = {
      id: randomUUID(),
      institutionId: event.institutionId ?? null,
      actorUserId: event.actorUserId ?? null,
      actorDisplayName: event.actorDisplayName ?? (event.actorUserId ? "User" : "system"),
      action: event.action,
      result: event.result,
      targetType: event.targetType,
      targetId: event.targetId,
      occurredAt: event.occurredAt ?? new Date(),
      beforeState: event.beforeState ?? null,
      afterState: event.afterState ?? null,
      context: event.context ?? null,
      correlationId: event.correlationId ?? null,
      requestId: event.requestId ?? null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      isImmutable: true,
    };

    this.auditEvents.push(record);
    return record;
  }

  async queryAuditEvents(filter: AuditLogQueryFilter): Promise<PaginatedAuditResult> {
    let matches = [...this.auditEvents];

    if (filter.institutionId) {
      matches = matches.filter((e) => e.institutionId === filter.institutionId);
    }
    if (filter.actorUserId) {
      matches = matches.filter((e) => e.actorUserId === filter.actorUserId);
    }
    if (filter.action) {
      matches = matches.filter((e) => e.action === filter.action);
    }
    if (filter.targetType) {
      matches = matches.filter((e) => e.targetType === filter.targetType);
    }
    if (filter.result) {
      matches = matches.filter((e) => e.result === filter.result);
    }
    if (filter.startDate) {
      matches = matches.filter((e) => e.occurredAt >= filter.startDate!);
    }
    if (filter.endDate) {
      matches = matches.filter((e) => e.occurredAt <= filter.endDate!);
    }

    // Newest first
    matches.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const total = matches.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 20;
    const items = matches.slice(offset, offset + limit);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async getSetting(institutionId: string, settingKey: string): Promise<SystemSettingRecord | null> {
    const key = this.settingStorageKey(institutionId, settingKey);
    return this.settings.get(key) ?? null;
  }

  async listSettings(
    institutionId: string,
    category?: SystemSettingRecord["settingCategory"],
  ): Promise<readonly SystemSettingRecord[]> {
    const results: SystemSettingRecord[] = [];
    for (const record of this.settings.values()) {
      if (record.institutionId === institutionId) {
        if (!category || record.settingCategory === category) {
          results.push(record);
        }
      }
    }
    return results;
  }

  async upsertSetting(input: UpsertSettingInput): Promise<SystemSettingRecord> {
    const key = this.settingStorageKey(input.institutionId, input.settingKey);
    const existing = this.settings.get(key);

    const record: SystemSettingRecord = {
      id: existing ? existing.id : randomUUID(),
      institutionId: input.institutionId,
      settingKey: input.settingKey,
      settingValueType: input.settingValueType,
      settingCategory: input.settingCategory,
      stringValue: input.stringValue ?? null,
      numberValue: input.numberValue ?? null,
      booleanValue: input.booleanValue ?? null,
      jsonValue: input.jsonValue ?? null,
      numberUnit: input.numberUnit ?? null,
      isSecretReference: input.isSecretReference ?? false,
      description: input.description ?? null,
      isClientReadable: input.isClientReadable ?? false,
      defaultSource: input.defaultSource,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date(),
      createdAt: existing ? existing.createdAt : new Date(),
    };

    this.settings.set(key, record);
    return record;
  }

  async recordSettingChange(input: InsertSettingChangeInput): Promise<SettingChangeRecord> {
    const record: SettingChangeRecord = {
      id: randomUUID(),
      institutionId: input.institutionId,
      settingKey: input.settingKey,
      previousValue: input.previousValue,
      newValue: input.newValue,
      typedValues: input.typedValues ?? null,
      overrideReason: input.overrideReason,
      changedByUserId: input.changedByUserId,
      changedAt: new Date(),
      correlationId: input.correlationId ?? null,
    };

    this.settingChanges.push(record);
    return record;
  }

  async listSettingChanges(
    institutionId: string,
    settingKey?: string,
  ): Promise<readonly SettingChangeRecord[]> {
    let matches = this.settingChanges.filter((c) => c.institutionId === institutionId);
    if (settingKey) {
      matches = matches.filter((c) => c.settingKey === settingKey);
    }
    matches.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
    return matches;
  }
}
