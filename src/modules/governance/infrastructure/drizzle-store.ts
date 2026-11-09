/**
 * Drizzle ORM implementation of GovernanceStore (`PRD.md` MODULE 31/32).
 *
 * Implements immutable audit event logging, centralized system configurations,
 * and traceable setting overrides using Drizzle ORM.
 */

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import {
  auditEvents,
  settingChanges,
  systemSettings,
} from "@/db/schema/governance";
import { assertAuditTrailImmutable, type AuditRecord } from "../domain/audit-trail";
import type {
  DefaultSource,
  SettingCategory,
  SettingChangeRecord,
  SettingValueType,
  SystemSettingRecord,
} from "../domain/system-settings";
import type {
  AuditLogQueryFilter,
  GovernanceStore,
  InsertSettingChangeInput,
  PaginatedAuditResult,
  UpsertSettingInput,
} from "../application/ports";

export class DrizzleGovernanceStore implements GovernanceStore {
  constructor(private readonly client: DbLike = db) {}

  /**
   * Append an immutable audit event.
   * By architectural contract, auditEvents is strictly append-only.
   */
  async appendAuditEvent(
    event: Parameters<GovernanceStore["appendAuditEvent"]>[0],
  ): Promise<AuditRecord> {
    assertAuditTrailImmutable("insert");

    const [inserted] = await this.client
      .insert(auditEvents)
      .values({
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
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert audit event record.");
    }

    return {
      id: inserted.id,
      institutionId: inserted.institutionId,
      actorUserId: inserted.actorUserId,
      actorDisplayName: inserted.actorDisplayName ?? "system",
      action: inserted.action,
      result: inserted.result,
      targetType: inserted.targetType,
      targetId: inserted.targetId,
      occurredAt: inserted.occurredAt,
      beforeState: inserted.beforeState,
      afterState: inserted.afterState,
      context: inserted.context,
      correlationId: inserted.correlationId,
      requestId: inserted.requestId,
      ipAddress: inserted.ipAddress,
      userAgent: inserted.userAgent,
      isImmutable: inserted.isImmutable,
    };
  }

  /**
   * Query the audit trail with criteria filters and pagination.
   */
  async queryAuditEvents(filter: AuditLogQueryFilter): Promise<PaginatedAuditResult> {
    const conditions = [];

    if (filter.institutionId) {
      conditions.push(eq(auditEvents.institutionId, filter.institutionId));
    }
    if (filter.actorUserId) {
      conditions.push(eq(auditEvents.actorUserId, filter.actorUserId));
    }
    if (filter.action) {
      conditions.push(eq(auditEvents.action, filter.action));
    }
    if (filter.targetType) {
      conditions.push(eq(auditEvents.targetType, filter.targetType));
    }
    if (filter.result) {
      conditions.push(eq(auditEvents.result, filter.result));
    }
    if (filter.startDate) {
      conditions.push(gte(auditEvents.occurredAt, filter.startDate));
    }
    if (filter.endDate) {
      conditions.push(lte(auditEvents.occurredAt, filter.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filter.limit ?? 20;
    const offset = filter.offset ?? 0;

    const [countResult] = await this.client
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(auditEvents)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    const rows = await this.client
      .select()
      .from(auditEvents)
      .where(whereClause)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    const items: AuditRecord[] = rows.map((r) => ({
      id: r.id,
      institutionId: r.institutionId,
      actorUserId: r.actorUserId,
      actorDisplayName: r.actorDisplayName ?? "system",
      action: r.action,
      result: r.result,
      targetType: r.targetType,
      targetId: r.targetId,
      occurredAt: r.occurredAt,
      beforeState: r.beforeState,
      afterState: r.afterState,
      context: r.context,
      correlationId: r.correlationId,
      requestId: r.requestId,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      isImmutable: r.isImmutable,
    }));

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Read an institution setting by key.
   */
  async getSetting(institutionId: string, settingKey: string): Promise<SystemSettingRecord | null> {
    const [row] = await this.client
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.institutionId, institutionId),
          eq(systemSettings.settingKey, settingKey),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      institutionId: row.institutionId,
      settingKey: row.settingKey,
      settingValueType: row.settingValueType as SettingValueType,
      settingCategory: row.settingCategory as SettingCategory,
      stringValue: row.stringValue,
      numberValue: row.numberValue,
      booleanValue: row.booleanValue,
      jsonValue: row.jsonValue,
      numberUnit: row.numberUnit,
      isSecretReference: row.isSecretReference,
      description: row.description,
      isClientReadable: row.isClientReadable,
      defaultSource: row.defaultSource as DefaultSource,
      updatedByUserId: row.updatedByUserId,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * List all stored settings for an institution.
   */
  async listSettings(
    institutionId: string,
    category?: SettingCategory,
  ): Promise<readonly SystemSettingRecord[]> {
    const conditions = [eq(systemSettings.institutionId, institutionId)];
    if (category) {
      conditions.push(eq(systemSettings.settingCategory, category));
    }

    const rows = await this.client
      .select()
      .from(systemSettings)
      .where(and(...conditions))
      .orderBy(systemSettings.settingKey);

    return rows.map((row) => ({
      id: row.id,
      institutionId: row.institutionId,
      settingKey: row.settingKey,
      settingValueType: row.settingValueType as SettingValueType,
      settingCategory: row.settingCategory as SettingCategory,
      stringValue: row.stringValue,
      numberValue: row.numberValue,
      booleanValue: row.booleanValue,
      jsonValue: row.jsonValue,
      numberUnit: row.numberUnit,
      isSecretReference: row.isSecretReference,
      description: row.description,
      isClientReadable: row.isClientReadable,
      defaultSource: row.defaultSource as DefaultSource,
      updatedByUserId: row.updatedByUserId,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Upsert a system setting on (institutionId, settingKey).
   */
  async upsertSetting(input: UpsertSettingInput): Promise<SystemSettingRecord> {
    const [row] = await this.client
      .insert(systemSettings)
      .values({
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
      })
      .onConflictDoUpdate({
        target: [systemSettings.institutionId, systemSettings.settingKey],
        set: {
          settingValueType: input.settingValueType,
          settingCategory: input.settingCategory,
          stringValue: input.stringValue ?? null,
          numberValue: input.numberValue ?? null,
          booleanValue: input.booleanValue ?? null,
          jsonValue: input.jsonValue ?? null,
          numberUnit: input.numberUnit ?? null,
          description: input.description ?? null,
          defaultSource: input.defaultSource,
          updatedByUserId: input.updatedByUserId,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert system setting.");
    }

    return {
      id: row.id,
      institutionId: row.institutionId,
      settingKey: row.settingKey,
      settingValueType: row.settingValueType as SettingValueType,
      settingCategory: row.settingCategory as SettingCategory,
      stringValue: row.stringValue,
      numberValue: row.numberValue,
      booleanValue: row.booleanValue,
      jsonValue: row.jsonValue,
      numberUnit: row.numberUnit,
      isSecretReference: row.isSecretReference,
      description: row.description,
      isClientReadable: row.isClientReadable,
      defaultSource: row.defaultSource as DefaultSource,
      updatedByUserId: row.updatedByUserId,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * Append-only record of a configuration value change.
   */
  async recordSettingChange(input: InsertSettingChangeInput): Promise<SettingChangeRecord> {
    const [row] = await this.client
      .insert(settingChanges)
      .values({
        institutionId: input.institutionId,
        settingKey: input.settingKey,
        previousValue: input.previousValue,
        newValue: input.newValue,
        typedValues: input.typedValues ?? null,
        overrideReason: input.overrideReason,
        changedByUserId: input.changedByUserId,
        changedAt: new Date(),
        correlationId: input.correlationId ?? null,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to insert setting change history record.");
    }

    return {
      id: row.id,
      institutionId: row.institutionId,
      settingKey: row.settingKey,
      previousValue: row.previousValue,
      newValue: row.newValue,
      typedValues: row.typedValues,
      overrideReason: row.overrideReason,
      changedByUserId: row.changedByUserId,
      changedAt: row.changedAt,
      correlationId: row.correlationId,
    };
  }

  /**
   * List change history for an institution setting.
   */
  async listSettingChanges(
    institutionId: string,
    settingKey?: string,
  ): Promise<readonly SettingChangeRecord[]> {
    const conditions = [eq(settingChanges.institutionId, institutionId)];
    if (settingKey) {
      conditions.push(eq(settingChanges.settingKey, settingKey));
    }

    const rows = await this.client
      .select()
      .from(settingChanges)
      .where(and(...conditions))
      .orderBy(desc(settingChanges.changedAt));

    return rows.map((r) => ({
      id: r.id,
      institutionId: r.institutionId,
      settingKey: r.settingKey,
      previousValue: r.previousValue,
      newValue: r.newValue,
      typedValues: r.typedValues,
      overrideReason: r.overrideReason,
      changedByUserId: r.changedByUserId,
      changedAt: r.changedAt,
      correlationId: r.correlationId,
    }));
  }
}
