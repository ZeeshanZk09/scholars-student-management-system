/**
 * System settings domain rules and configuration categories (`PRD.md` MODULE 32, `RULES.md` §37).
 *
 * Centralized configuration across 10 defined categories.
 * Enforces strong typing, schema constraints, manual override auditing, and non-technical clarity.
 */

import { ValidationError } from "@/shared/errors";

export const SETTING_CATEGORIES = [
  "institute",
  "academic",
  "fee",
  "salary",
  "attendance",
  "notification",
  "email",
  "security",
  "general",
  "permissions",
] as const;

export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export const SETTING_VALUE_TYPES = ["string", "number", "boolean", "json", "date"] as const;
export type SettingValueType = (typeof SETTING_VALUE_TYPES)[number];

export const DEFAULT_SOURCES = ["system", "institution", "department", "manual"] as const;
export type DefaultSource = (typeof DEFAULT_SOURCES)[number];

/** Human-readable category descriptor for the settings UI. */
export interface CategoryMetadata {
  readonly id: SettingCategory;
  readonly label: string;
  readonly description: string;
}

export const CATEGORY_METADATA: Record<SettingCategory, CategoryMetadata> = {
  institute: {
    id: "institute",
    label: "Institute Profile",
    description: "General school profile, campus branding, contact email, and official timezone.",
  },
  academic: {
    id: "academic",
    label: "Academic Rules",
    description: "Passing criteria, grading system conventions, and maximum class periods per day.",
  },
  fee: {
    id: "fee",
    label: "Fee & Billing",
    description: "Fee voucher grace periods, late payment fines, installment allowances, and voucher formats.",
  },
  salary: {
    id: "salary",
    label: "Staff Payroll",
    description: "Monthly payroll cut-off days, tax deduction toggles, and compensation calculation policies.",
  },
  attendance: {
    id: "attendance",
    label: "Attendance Policies",
    description: "Grace period for tardiness, half-day hour limits, and biometric check-in intervals.",
  },
  notification: {
    id: "notification",
    label: "Notifications & SMS",
    description: "Parent SMS alerts, student daily absence alerts, and automated bulletin broadcasts.",
  },
  email: {
    id: "email",
    label: "Email & Communication",
    description: "Outgoing mail service references, sender identity names, and administrative notice recipients.",
  },
  security: {
    id: "security",
    label: "Security & Access",
    description: "Session expiration intervals, maximum sign-in attempts before lockout, and security safeguards.",
  },
  general: {
    id: "general",
    label: "General Preferences",
    description: "Application display title, regional date format, and primary language settings.",
  },
  permissions: {
    id: "permissions",
    label: "Role & Permission Policies",
    description: "Staff role assignment approval workflows and authority delegation safeguards.",
  },
};

/** Predefined configuration catalog item. */
export interface SettingDefinition {
  readonly key: string;
  readonly category: SettingCategory;
  readonly label: string;
  readonly description: string;
  readonly type: SettingValueType;
  readonly numberUnit?: string;
  readonly defaultValue: string | number | boolean | Record<string, unknown>;
  readonly isClientReadable?: boolean;
  readonly isSecretReference?: boolean;
}

/** Predefined system settings catalog with sensible defaults. */
export const SYSTEM_SETTING_CATALOG: readonly SettingDefinition[] = [
  // Institute
  {
    key: "institute.name",
    category: "institute",
    label: "Institute Display Name",
    description: "Official name of the school or college shown on reports, vouchers, and portal headers.",
    type: "string",
    defaultValue: "Scholars Educational Complex",
    isClientReadable: true,
  },
  {
    key: "institute.contact_email",
    category: "institute",
    label: "Official Contact Email",
    description: "Primary inquiries email address displayed to parents and prospective students.",
    type: "string",
    defaultValue: "info@scholars.edu.pk",
    isClientReadable: true,
  },
  {
    key: "institute.timezone",
    category: "institute",
    label: "Timezone",
    description: "Standard local timezone used for attendance and event timestamps.",
    type: "string",
    defaultValue: "Asia/Karachi",
    isClientReadable: true,
  },

  // Academic
  {
    key: "academic.passing_percentage",
    category: "academic",
    label: "Default Passing Percentage",
    description: "Minimum marks percentage required to pass an examination subject.",
    type: "number",
    numberUnit: "%",
    defaultValue: 40,
    isClientReadable: true,
  },
  {
    key: "academic.max_daily_periods",
    category: "academic",
    label: "Maximum Daily Periods",
    description: "Maximum number of subject periods scheduled in a single academic day.",
    type: "number",
    numberUnit: "periods",
    defaultValue: 8,
  },

  // Fee
  {
    key: "fee.grace_period_days",
    category: "fee",
    label: "Fee Due Grace Period",
    description: "Number of calendar days after the due date before late fee charges begin.",
    type: "number",
    numberUnit: "days",
    defaultValue: 10,
  },
  {
    key: "fee.daily_late_fine",
    category: "fee",
    label: "Daily Late Fine Amount",
    description: "Fixed daily fine in PKR assessed for overdue monthly fee challans.",
    type: "number",
    numberUnit: "PKR",
    defaultValue: 50,
  },
  {
    key: "fee.allow_installments",
    category: "fee",
    label: "Permit Fee Installments",
    description: "Allow accountants to break down quarterly or term fees into smaller instalments.",
    type: "boolean",
    defaultValue: true,
  },

  // Salary
  {
    key: "salary.cutoff_day",
    category: "salary",
    label: "Monthly Payroll Cut-off Day",
    description: "Day of the month when employee attendance and overtime are finalized for payroll.",
    type: "number",
    numberUnit: "day",
    defaultValue: 25,
  },
  {
    key: "salary.tax_deduction_enabled",
    category: "salary",
    label: "Income Tax Deductions",
    description: "Automatically compute and deduct progressive government income tax during payroll runs.",
    type: "boolean",
    defaultValue: true,
  },

  // Attendance
  {
    key: "attendance.grace_period_minutes",
    category: "attendance",
    label: "Tardiness Grace Period",
    description: "Minutes past assembly bell after which an arrival is officially recorded as Late.",
    type: "number",
    numberUnit: "minutes",
    defaultValue: 15,
  },
  {
    key: "attendance.half_day_threshold_minutes",
    category: "attendance",
    label: "Half-Day Absence Threshold",
    description: "Minutes of missed class time resulting in classification as a half-day absence.",
    type: "number",
    numberUnit: "minutes",
    defaultValue: 120,
  },

  // Notification
  {
    key: "notification.sms_enabled",
    category: "notification",
    label: "SMS Alerts to Parents",
    description: "Send automated text messages to parents when a student is marked absent.",
    type: "boolean",
    defaultValue: true,
  },
  {
    key: "notification.guardian_daily_summary",
    category: "notification",
    label: "Daily Summary Notifications",
    description: "Dispatch daily evening recap messages for student diary entries and homework.",
    type: "boolean",
    defaultValue: false,
  },

  // Email
  {
    key: "email.sender_name",
    category: "email",
    label: "Outgoing Sender Name",
    description: "Display name shown in the recipient inbox for automated emails.",
    type: "string",
    defaultValue: "Scholars Administration",
  },
  {
    key: "email.sender_address",
    category: "email",
    label: "Outgoing Sender Address",
    description: "Return email address from which portal communications are delivered.",
    type: "string",
    defaultValue: "notifications@scholars.edu.pk",
  },
  {
    key: "email.smtp_host_reference",
    category: "email",
    label: "SMTP Host Key Reference",
    description: "Vault or environment key pointing to the SMTP outbound server credential.",
    type: "string",
    defaultValue: "ENV_SMTP_HOST",
    isSecretReference: true,
  },

  // Security
  {
    key: "security.session_timeout_minutes",
    category: "security",
    label: "Inactivity Session Timeout",
    description: "Minutes of user inactivity before an authenticated session expires.",
    type: "number",
    numberUnit: "minutes",
    defaultValue: 60,
  },
  {
    key: "security.max_login_attempts",
    category: "security",
    label: "Maximum Failed Sign-Ins",
    description: "Number of consecutive incorrect passwords before an account is temporarily locked.",
    type: "number",
    numberUnit: "attempts",
    defaultValue: 5,
  },
  {
    key: "security.lockout_duration_minutes",
    category: "security",
    label: "Account Lockout Duration",
    description: "Number of minutes a locked account remains restricted before unlocking.",
    type: "number",
    numberUnit: "minutes",
    defaultValue: 30,
  },

  // General
  {
    key: "general.date_format",
    category: "general",
    label: "Display Date Format",
    description: "Calendar formatting pattern used on tables, forms, and student documents.",
    type: "string",
    defaultValue: "DD/MM/YYYY",
    isClientReadable: true,
  },

  // Permissions
  {
    key: "permissions.role_assignment_approval_required",
    category: "permissions",
    label: "Role Grant Dual Approval",
    description: "Require confirmation by a Super Administrator before new user roles take effect.",
    type: "boolean",
    defaultValue: true,
  },
];

/** Plain domain representation of an institution setting. */
export interface SystemSettingRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly settingKey: string;
  readonly settingValueType: SettingValueType;
  readonly settingCategory: SettingCategory;
  readonly stringValue: string | null;
  readonly numberValue: number | null;
  readonly booleanValue: boolean | null;
  readonly jsonValue: unknown | null;
  readonly numberUnit: string | null;
  readonly isSecretReference: boolean;
  readonly description: string | null;
  readonly isClientReadable: boolean;
  readonly defaultSource: DefaultSource;
  readonly updatedByUserId: string | null;
  readonly updatedAt: Date;
  readonly createdAt: Date;
}

/** Record of an individual configuration modification or manual override. */
export interface SettingChangeRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly settingKey: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
  readonly typedValues: { previous?: unknown; next?: unknown } | null;
  readonly overrideReason: string | null;
  readonly changedByUserId: string;
  readonly changedAt: Date;
  readonly correlationId: string | null;
}

/** Key regex validator required by database schema constraint. */
const SETTING_KEY_REGEX = /^[a-z0-9]+(\.[a-z0-9_]+)+$/;

export function isValidSettingKey(key: string): boolean {
  return SETTING_KEY_REGEX.test(key);
}

/**
 * Validates a setting mutation before saving.
 *
 * Rules:
 * 1. Setting key must conform to lowercase dotted format `^[a-z0-9]+(\.[a-z0-9_]+)+$`.
 * 2. Setting category must be one of the 10 defined categories.
 * 3. Exactly one value column matching `settingValueType` must be supplied.
 * 4. Number settings MUST have an associated unit (e.g. 'minutes', 'days', '%').
 * 5. Manual overrides MUST provide an explicit `overrideReason` per RULES.md §37.
 */
export function validateSettingInput(input: {
  readonly settingKey: string;
  readonly settingCategory: string;
  readonly settingValueType: SettingValueType;
  readonly stringValue?: string | null | undefined;
  readonly numberValue?: number | null | undefined;
  readonly booleanValue?: boolean | null | undefined;
  readonly jsonValue?: unknown | null | undefined;
  readonly numberUnit?: string | null | undefined;
  readonly defaultSource: DefaultSource;
  readonly overrideReason?: string | null | undefined;
}): void {
  const key = input.settingKey.trim();
  if (!isValidSettingKey(key)) {
    throw new ValidationError("Invalid setting key format", {
      settingKey: [
        "Key must use lowercase letters, numbers, and dot-separated namespaces (e.g., 'attendance.grace_period_minutes').",
      ],
    });
  }

  if (!SETTING_CATEGORIES.includes(input.settingCategory as SettingCategory)) {
    throw new ValidationError("Invalid setting category", {
      settingCategory: [`Category must be one of: ${SETTING_CATEGORIES.join(", ")}.`],
    });
  }

  if (!SETTING_VALUE_TYPES.includes(input.settingValueType)) {
    throw new ValidationError("Invalid setting value type", {
      settingValueType: [`Value type must be one of: ${SETTING_VALUE_TYPES.join(", ")}.`],
    });
  }

  if (input.defaultSource === "manual") {
    const reason = input.overrideReason?.trim();
    if (!reason || reason.length < 5) {
      throw new ValidationError("Override reason required", {
        overrideReason: [
          "A clear business reason of at least 5 characters is required when manually overriding an institution setting.",
        ],
      });
    }
  }

  switch (input.settingValueType) {
    case "string":
      if (typeof input.stringValue !== "string") {
        throw new ValidationError("String value required", {
          stringValue: ["This setting requires a text value."],
        });
      }
      break;
    case "number":
      if (typeof input.numberValue !== "number" || Number.isNaN(input.numberValue)) {
        throw new ValidationError("Numeric value required", {
          numberValue: ["This setting requires a valid integer number."],
        });
      }
      if (!input.numberUnit || input.numberUnit.trim().length === 0) {
        throw new ValidationError("Unit required for numeric setting", {
          numberUnit: ["Please specify the measurement unit (e.g., 'minutes', 'days', '%', 'PKR')."],
        });
      }
      break;
    case "boolean":
      if (typeof input.booleanValue !== "boolean") {
        throw new ValidationError("Boolean value required", {
          booleanValue: ["This setting must be either enabled or disabled."],
        });
      }
      break;
    case "json":
    case "date":
      if (input.jsonValue === null || input.jsonValue === undefined) {
        throw new ValidationError("Structured value required", {
          jsonValue: ["This setting requires a valid JSON or date value."],
        });
      }
      break;
  }
}

/** Converts a raw setting record to a clean, displayable string representation. */
export function formatSettingValue(setting: {
  readonly settingValueType: SettingValueType;
  readonly stringValue?: string | null | undefined;
  readonly numberValue?: number | null | undefined;
  readonly booleanValue?: boolean | null | undefined;
  readonly jsonValue?: unknown | null | undefined;
  readonly numberUnit?: string | null | undefined;
}): string {
  switch (setting.settingValueType) {
    case "string":
      return setting.stringValue ?? "";
    case "number":
      return setting.numberValue !== null && setting.numberValue !== undefined
        ? `${setting.numberValue}${setting.numberUnit ? ` ${setting.numberUnit}` : ""}`
        : "";
    case "boolean":
      return setting.booleanValue ? "Enabled" : "Disabled";
    case "json":
    case "date":
      return JSON.stringify(setting.jsonValue);
  }
}
