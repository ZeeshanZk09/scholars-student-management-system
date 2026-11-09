/**
 * System Governance domain module public boundary (`ARCHITECTURE.md` §30/§40–§42, `PRD.md` MODULE 31/32).
 *
 * Exposes audit trail logging, centralized system settings, and institution override services.
 */

import { GovernanceService } from "./application/governance-service";
import { DrizzleGovernanceStore } from "./infrastructure/drizzle-store";

export * from "./domain/audit-trail";
export * from "./domain/system-settings";
export * from "./application/ports";
export * from "./application/schemas";

const store = new DrizzleGovernanceStore();
const service = new GovernanceService(store);

export { GovernanceService, DrizzleGovernanceStore };

export const recordAuditEvent = service.recordAuditEvent.bind(service);
export const queryAuditTrail = service.queryAuditTrail.bind(service);
export const getInstitutionSettings = service.getInstitutionSettings.bind(service);
export const overrideSetting = service.overrideSetting.bind(service);
export const resetSettingToDefault = service.resetSettingToDefault.bind(service);
export const getSettingHistory = service.getSettingHistory.bind(service);
