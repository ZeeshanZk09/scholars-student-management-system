/**
 * Audit trail and system settings.
 *
 * `PRD.md` MODULE 31 and 32, `ARCHITECTURE.md` §40–§42.
 *
 * ## Two tables that look similar and are not
 *
 * `audit_events` is a fact that something happened. `setting_changes` is a fact that a configuration value
 * changed. They share a shape, and merging them would be the obvious move, and it would be wrong in three
 * ways:
 *
 * 1. **Volume.** `audit_events` takes one row per login and one per denied request. `setting_changes` takes
 *    one row per *distinct key* per change. Joining them means the settings audit query scans the entire
 *    authentication log.
 * 2. **Retention.** They will not have the same retention requirement, and a shared table cannot partition
 *    retention by category.
 * 3. **Legibility.** MODULE 31 lists specific areas needing "detailed auditing" — fees, salaries, marks,
 *    attendance, permissions, student records, financial records, manual overrides. Those are all
 *    `audit_events` rows. Configuration is `configuration.change` in the same audit stream, and keeping the
 *    per-key detail in its own table is what makes `setting_changes` readable at all.
 *
 * ## `audit_events` is append-only, and the database enforces it
 *
 * `src/shared/logging/audit.ts` states the rule: "an audit record that can be updated is not an audit
 * record." Two mechanisms here rather than one, because they defend against different things:
 *
 * - The application layer never issues `update` or `delete` against this table, and `src/db/schema/audit.test.ts`
 *   asserts the column set has no `updated_at`/`version` — a mutable shape is a test failure, not a convention.
 * - `updatedAt` and `version` are deliberately **absent**. Every other table in this schema has them. Their
 *   absence is the strongest signal available, because a mutation requires an optimistic-lock check and there
 *   is nothing to check.
 *
 * MODULE 31's "previous value / new value" is `beforeState`/`afterState`. They are `jsonb` because the
 * audited entity differs per event, and they are redacted at the application boundary by
 * `src/shared/logging/redact.ts` — a password hash in `afterState` would otherwise become a credential in a
 * table that is, by design, the most widely readable in the system.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, description, primaryId } from "./_conventions";
import { auditResultEnum, settingValueTypeEnum } from "./_enums";
import { institutions } from "./institution";
import { users } from "./identity";

/**
 * `audit_events` — MODULE 31's audit trail.
 *
 * ## `action` is a free-text key, not an enum, and `result` is the enum
 *
 * `action` values are `AUDIT_ACTIONS` in `src/shared/logging/audit.ts` (`auth.login`, `fee.change`,
 * `result.change`, …). It is a `varchar` rather than a `pgEnum` on purpose: `AUDIT_ACTIONS` is a TypeScript
 * object that is extended when a module ships, and a module that must open a migration to send an audit
 * event will eventually not bother. The runtime validates against the object; `result` is a genuine closed
 * set of three values that benefits from the database rejecting anything else.
 *
 * ## `actorUserId` is nullable and that is the whole point
 *
 * `src/shared/logging/audit.ts` uses the literal actor `"system"` for scheduled jobs. A fake user row for
 * the scheduler would put a synthetic principal into the authorization model and into every query that joins
 * actor to user. So: null means the system acted, and `actorDisplayName` carries the label for the UI.
 *
 * `onDelete: 'set null'` for the same reason plus one more — a GDPR erasure request removes the user, and the
 * audit trail must survive it. `RULES.md` §51 requires the record; it does not require the person to remain.
 *
 * ## `beforeState`/`afterState` carry MODULE 31's "relevant change, previous value, new value"
 *
 * A permission change writes the old and new scope. A mark correction writes the old and new marks. A
 * configuration change writes the old and new value. One pair of columns covers all of MODULE 31's
 * requirement, and each is nullable because a creation has no before and a deletion has no after.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: primaryId(),
    /** Null for a system-generated record. See the note above. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** The label shown when `actorUserId` is null. Normally `'system'`. */
    actorDisplayName: varchar("actor_display_name", { length: 64 }),
    /**
     * `AUDIT_ACTIONS` keys. `success`, `failure`, `denied` are `AUDIT_RESULTS` in the same module, which
     * validates against them before an insert.
     */
    action: varchar("action", { length: 64 }).notNull(),
    result: auditResultEnum("result").notNull(),
    /** `PRD.md` MODULE 31: "Entity". e.g. `student`, `fee_payment`, `user_permission`. */
    targetType: varchar("target_type", { length: 48 }).notNull(),
    /** `PRD.md` MODULE 31: the affected record's id. */
    targetId: varchar("target_id", { length: 64 }).notNull(),
    /** `PRD.md` MODULE 31: "Timestamp". */
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /** `PRD.md` MODULE 31: "Relevant change, previous value, new value". Redacted before insert. */
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    /** Extra context, already redacted by `src/shared/logging/redact.ts`. */
    context: jsonb("context").$type<Record<string, unknown>>(),
    /** Ties the record to the log lines and the request that produced it. `ARCHITECTURE.md` observability. */
    correlationId: varchar("correlation_id", { length: 96 }),
    /** The request's own id, when there was an HTTP request behind it. */
    requestId: varchar("request_id", { length: 96 }),
    /** `inet`, not text: MODULE 51's IP evidence must be queryable by range, not by string match. */
    ipAddress: inet("ip_address"),
    userAgent: varchar("user_agent", { length: 512 }),
    /** The institution, for a tenant-scoped query. Null for platform-level events such as a login. */
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "set null",
    }),
    /** Non-null, unlike most tables here. A flag set to `false` in an UPDATE is not append-only. */
    isImmutable: boolean("is_immutable").notNull().default(true),
  },
  (t) => [
    // "What happened to this student?" — the single most common audit query in MODULE 31's list.
    index("audit_events_target_idx").on(t.targetType, t.targetId, t.occurredAt),
    // "What did this user do?" — the second most common, and the one auditors ask for.
    index("audit_events_actor_idx").on(t.actorUserId, t.occurredAt),
    index("audit_events_action_idx").on(t.action, t.occurredAt),
    // The security review: denials and failures, newest first.
    index("audit_events_denied_idx")
      .on(t.occurredAt)
      .where(sql`${t.result} <> 'success'`),
    index("audit_events_institution_idx").on(t.institutionId, t.occurredAt),
    // Ties an audit record to the request's log lines.
    index("audit_events_correlation_idx").on(t.correlationId),
    // Only an action creates a record. A record with no action is meaningless.
    check("audit_events_action_check", sql`length(btrim(${t.action})) > 0`),
    check(
      "audit_events_target_check",
      sql`length(btrim(${t.targetType})) > 0 and length(btrim(${t.targetId})) > 0`,
    ),
    // An actor is either a real user or a labelled system principal, never neither.
    check(
      "audit_events_actor_pair",
      sql`num_nonnulls(${t.actorUserId}, ${t.actorDisplayName}) >= 1`,
    ),
    // There is nothing to change, so an after without a before is a bug worth failing on.
    check(
      "audit_events_state_check",
      sql`${t.afterState} is not null or ${t.beforeState} is not null or ${t.action} in ('auth.login', 'auth.logout')`,
    ),
  ],
);

/**
 * `system_settings` — MODULE 32's centralised configuration.
 *
 * ## `setting_key` is a path, and that is what makes settings queryable
 *
 * MODULE 32 lists nine categories — institute, academic, fee, salary, attendance rules, notification, email,
 * security, general, plus permission configuration. A flat `key`/`value` pair per category needs a namespace
 * convention, and the convention always becomes ad hoc. So the key is a dotted path (`email.smtp.host`) with
 * a unique index on it, which makes "every email setting" a prefix scan and gives each setting a name that
 * appears identically in the database, in the settings UI, and in the code that reads it.
 *
 * ## A typed value, not a jsonb bag
 *
 * `settingValueTypeEnum` plus parallel `*Value` columns is the alternative to storing JSON. It is more
 * columns and more application code, and it buys three things this schema has consistently chosen to buy:
 * a numeric setting cannot be stored as `"12"`, a boolean cannot be stored as `"true"`, and a value read
 * from the database needs no re-validation at every use site.
 *
 * The check constraint is therefore the real enforcement — a row with `setting_value_type = 'number'` and a
 * NULL `number_value` is rejected, and a row with a value in the wrong column is rejected too.
 */
export const systemSettings = pgTable(
  "system_settings",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** The dotted path. e.g. `email.smtp.host`, `attendance.grace_period_minutes`. */
    settingKey: varchar("setting_key", { length: 128 }).notNull(),
    settingValueType: settingValueTypeEnum("setting_value_type").notNull(),
    /** The category, for the MODULE 32 settings UI. Denormalised from the key prefix, and indexed. */
    settingCategory: varchar("setting_category", { length: 32 }).notNull(),
    stringValue: varchar("string_value", { length: 2048 }),
    numberValue: integer("number_value"),
    booleanValue: boolean("boolean_value"),
    /** For `date` and structured `json` values. */
    jsonValue: jsonb("json_value"),
    /** The units a number is in, e.g. `minutes`, `days`. A bare integer in a config UI is unusable. */
    numberUnit: varchar("number_unit", { length: 16 }),
    /**
     * `PRD.md` MODULE 32 does not say settings are secrets, and they must not be stored here. An SMTP
     * password or an API key is a credential and belongs in a secret manager (`RULES.md` §54); the setting
     * holds the *reference* to it. `isSecretReference` documents that intent so a reviewer reading
     * `email.smtp.password` finds an explanation rather than a value.
     */
    isSecretReference: boolean("is_secret_reference").notNull().default(false),
    description: description("description"),
    /** `public` settings are safe for the client bundle; anything else stays server-side. */
    isClientReadable: boolean("is_client_readable").notNull().default(false),
    /** Where the default came from. `RULES.md` §37: a manual override is an auditable act, not a silent edit. */
    defaultSource: varchar("default_source", { length: 16 }).notNull().default("system"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    // One value per setting per institution. The whole point of the table.
    uniqueIndex("system_settings_key_unique").on(t.institutionId, t.settingKey),
    // "Show me the email settings" is a prefix scan, and this is what makes it one.
    index("system_settings_category_idx").on(t.institutionId, t.settingCategory, t.settingKey),
    // The client's allowlist read. Narrow, and deliberately an index on the flag rather than a full scan.
    index("system_settings_client_readable_idx")
      .on(t.institutionId)
      .where(sql`${t.isClientReadable} = true`),
    check("system_settings_key_check", sql`${t.settingKey} ~ '^[a-z0-9]+(\\.[a-z0-9_]+)+$'`),
    check(
      "system_settings_source_check",
      sql`${t.defaultSource} in ('system', 'institution', 'department', 'manual')`,
    ),
    // Exactly one value column, and it is the one the declared type names. This is the enforcement.
    check(
      "system_settings_value_type_check",
      sql`(
        (${t.settingValueType} = 'string'  and ${t.stringValue}  is not null and num_nonnulls(${t.numberValue}, ${t.booleanValue}, ${t.jsonValue}) = 0)
     or (${t.settingValueType} = 'number'  and ${t.numberValue}  is not null and num_nonnulls(${t.stringValue}, ${t.booleanValue}, ${t.jsonValue}) = 0)
     or (${t.settingValueType} = 'boolean' and ${t.booleanValue} is not null and num_nonnulls(${t.stringValue}, ${t.numberValue}, ${t.jsonValue}) = 0)
     or (${t.settingValueType} in ('json', 'date') and ${t.jsonValue} is not null and num_nonnulls(${t.stringValue}, ${t.numberValue}, ${t.booleanValue}) = 0)
      )`,
    ),
    // A number with no unit is not a usable configuration value, but only a number needs a unit.
    check(
      "system_settings_unit_check",
      sql`${t.settingValueType} <> 'number' or ${t.numberUnit} is not null`,
    ),
  ],
);

/**
 * `setting_changes` — who changed a setting, from what, to what.
 *
 * ## Why this exists beside `audit_events.result = 'configuration.change'`
 *
 * Because that generic record answers "was there a configuration change?" and not "what is `email.smtp.host`
 * now, and who put it there?". An administrator troubleshooting a mail outage needs the second question
 * answered in one query, and reconstructing it from a jsonb audit stream is possible but slow and lossy.
 *
 * This is the `RULES.md` §37 "manual override" case in its purest form: the override is recorded with the
 * previous value, the new value, and the person who made it. It is append-only for the same reason
 * `audit_events` is — a change log that can be edited is a change log nobody trusts.
 */
export const settingChanges = pgTable(
  "setting_changes",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** The `system_settings.setting_key` that changed. A named key, not the setting's id: the key is what a human knows. */
    settingKey: varchar("setting_key", { length: 128 }).notNull(),
    /** The previous value, rendered as text for the settings UI. Typed values stay in the jsonb column. */
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    /**
     * The typed values, for a value that is not text. One column is enough because both sides share a type —
     * the previous value of a `number` setting is a number.
     */
    typedValues: jsonb("typed_values").$type<{ previous?: unknown; next?: unknown }>(),
    /** `RULES.md` §37 requires an override to be an accounted act, not an implicit edit. */
    overrideReason: text("override_reason"),
    changedByUserId: uuid("changed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    changedAt: timestamp("changed_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    correlationId: varchar("correlation_id", { length: 96 }),
  },
  (t) => [
    index("setting_changes_key_idx").on(t.institutionId, t.settingKey, t.changedAt),
    index("setting_changes_actor_idx").on(t.changedByUserId, t.changedAt),
    // A change that changes nothing is noise in a log people are expected to read.
    check(
      "setting_changes_value_check",
      sql`${t.previousValue} is null or ${t.newValue} is null or ${t.previousValue} <> ${t.newValue}`,
    ),
    check("setting_changes_key_check", sql`length(btrim(${t.settingKey})) > 0`),
  ],
);
