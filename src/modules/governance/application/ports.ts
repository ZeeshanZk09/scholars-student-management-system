/**
 * Governance application ports and contracts (`PRD.md` MODULE 31/32).
 *
 * Interfaces and types connecting the Governance domain to infrastructure.
 * Free of database-specific dependencies to allow unit testing with in-memory fakes.
 */

import type {
  AuditRecord,
  AuditResult,
  NewAuditEventInput,
} from "../domain/audit-trail";
import type {
  DefaultSource,
  SettingCategory,
  SettingChangeRecord,
  SettingValueType,
  SystemSettingRecord,
} from "../domain/system-settings";

export interface AuditLogQueryFilter {
  readonly institutionId?: string | null;
  readonly actorUserId?: string | null;
  readonly action?: string | null;
  readonly targetType?: string | null;
  readonly result?: AuditResult | null;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PaginatedAuditResult {
  readonly items: readonly AuditRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface UpsertSettingInput {
  readonly institutionId: string;
  readonly settingKey: string;
  readonly settingValueType: SettingValueType;
  readonly settingCategory: SettingCategory;
  readonly stringValue?: string | null | undefined;
  readonly numberValue?: number | null | undefined;
  readonly booleanValue?: boolean | null | undefined;
  readonly jsonValue?: unknown | null | undefined;
  readonly numberUnit?: string | null | undefined;
  readonly isSecretReference?: boolean | undefined;
  readonly description?: string | null | undefined;
  readonly isClientReadable?: boolean | undefined;
  readonly defaultSource: DefaultSource;
  readonly updatedByUserId: string;
}

export interface InsertSettingChangeInput {
  readonly institutionId: string;
  readonly settingKey: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly typedValues?: { previous?: unknown; next?: unknown } | null | undefined;
  readonly overrideReason: string;
  readonly changedByUserId: string;
  readonly correlationId?: string | null | undefined;
}

/** Effective setting view combining catalog definitions with persisted overrides. */
export interface EffectiveSettingView {
  readonly key: string;
  readonly category: SettingCategory;
  readonly label: string;
  readonly description: string;
  readonly type: SettingValueType;
  readonly numberUnit?: string | null | undefined;
  readonly effectiveValue: string | number | boolean | unknown;
  readonly displayValue: string;
  readonly isOverridden: boolean;
  readonly defaultSource: DefaultSource;
  readonly updatedAt?: Date | null | undefined;
  readonly updatedByUserId?: string | null | undefined;
}

/** Data access port for governance operations. */
export interface GovernanceStore {
  /** Append-only audit record creation. Never allows update or delete. */
  appendAuditEvent(event: NewAuditEventInput): Promise<AuditRecord>;

  /** Query audit trail with filtering and pagination. */
  queryAuditEvents(filter: AuditLogQueryFilter): Promise<PaginatedAuditResult>;

  /** Read an institution setting by key. */
  getSetting(institutionId: string, settingKey: string): Promise<SystemSettingRecord | null>;

  /** List all stored settings for an institution, optionally filtered by category. */
  listSettings(
    institutionId: string,
    category?: SettingCategory,
  ): Promise<readonly SystemSettingRecord[]>;

  /** Upsert an institution setting. */
  upsertSetting(input: UpsertSettingInput): Promise<SystemSettingRecord>;

  /** Record an immutable setting change entry. */
  recordSettingChange(input: InsertSettingChangeInput): Promise<SettingChangeRecord>;

  /** List history of changes for settings within an institution. */
  listSettingChanges(
    institutionId: string,
    settingKey?: string,
  ): Promise<readonly SettingChangeRecord[]>;
}
