/**
 * Governance application validation schemas (`PRD.md` MODULE 31/32, `SECURITY.md` §13).
 *
 * Strict Zod input validation at all boundaries.
 */

import { z } from "zod";

import { AUDIT_RESULTS } from "../domain/audit-trail";
import {
  SETTING_CATEGORIES,
  SETTING_VALUE_TYPES,
} from "../domain/system-settings";

export const auditLogQuerySchema = z.object({
  institutionId: z.string().uuid("Invalid institution identifier").optional().nullable(),
  actorUserId: z.string().uuid("Invalid actor identifier").optional().nullable(),
  action: z.string().max(64).optional().nullable(),
  targetType: z.string().max(48).optional().nullable(),
  result: z.enum(AUDIT_RESULTS).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;

export const overrideSettingSchema = z.object({
  institutionId: z.string().uuid("Please select a valid institution."),
  settingKey: z
    .string()
    .min(3, "Setting key is required.")
    .max(128)
    .regex(/^[a-z0-9]+(\.[a-z0-9_]+)+$/, "Key must be lowercase dotted format (e.g. 'fee.daily_late_fine')."),
  settingCategory: z.enum(SETTING_CATEGORIES, {
    message: "A valid system category must be selected.",
  }),
  settingValueType: z.enum(SETTING_VALUE_TYPES, {
    message: "A valid value type is required.",
  }),
  stringValue: z.string().max(2048).optional().nullable(),
  numberValue: z.coerce.number().int().optional().nullable(),
  booleanValue: z.boolean().optional().nullable(),
  jsonValue: z.unknown().optional().nullable(),
  numberUnit: z.string().max(16).optional().nullable(),
  overrideReason: z
    .string()
    .trim()
    .min(5, "A clear business reason of at least 5 characters is required for manual overrides."),
});

export type OverrideSettingInput = z.infer<typeof overrideSettingSchema>;

export const resetSettingSchema = z.object({
  institutionId: z.string().uuid("Please select a valid institution."),
  settingKey: z.string().min(1, "Setting key is required."),
  resetReason: z
    .string()
    .trim()
    .min(5, "A clear explanation of at least 5 characters is required to reset a setting to default."),
});

export type ResetSettingInput = z.infer<typeof resetSettingSchema>;

export const newAuditEventSchema = z.object({
  institutionId: z.string().uuid().optional().nullable(),
  actorUserId: z.string().uuid().optional().nullable(),
  actorDisplayName: z.string().max(64).optional().nullable(),
  action: z.string().min(1, "Action is required.").max(64),
  result: z.enum(AUDIT_RESULTS),
  targetType: z.string().min(1, "Target type is required.").max(48),
  targetId: z.string().min(1, "Target identifier is required.").max(64),
  beforeState: z.record(z.string(), z.unknown()).optional().nullable(),
  afterState: z.record(z.string(), z.unknown()).optional().nullable(),
  context: z.record(z.string(), z.unknown()).optional().nullable(),
  correlationId: z.string().max(96).optional().nullable(),
  requestId: z.string().max(96).optional().nullable(),
  ipAddress: z.string().max(45).optional().nullable(),
  userAgent: z.string().max(512).optional().nullable(),
});

export type NewAuditEventSchemaInput = z.infer<typeof newAuditEventSchema>;
