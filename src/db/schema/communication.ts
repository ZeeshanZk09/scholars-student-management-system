/**
 * Notifications, announcements and email.
 *
 * `PRD.md` MODULE 26, 27 and 28. `RULES.md` §45–§47 are the governing rules and they are the reason this
 * file has the shape it does:
 *
> # 45. Notifications — Targeted, Permission-aware, Context-aware, Trackable, Non-duplicative.
> # 46. Email Rules — in-app is primary; email is supplementary.
> # 47. Notification Idempotency — the same business event must not generate duplicate notifications.
 *
 * ## One notification, many deliveries
 *
 * "Trackable" and "Non-duplicative" pull in opposite directions on a single table, and the resolution is
 * the split below: `notifications` is the business event, `notification_deliveries` is one row per person
 * who was actually told. One announcement to four hundred people is **one** notification and four hundred
 * deliveries. That is what makes "did this guardian get the monthly report?" (`RULES.md` §46) answerable,
 * and it is why an in-app badge query never has to aggregate a fan-out.
 *
 * ## Targeting is a discriminator plus an id, resolved through the authorization model
 *
 * `PRD.md` MODULE 26 lists the audiences — user, role, department, class, section, parent, teacher — and
 * `ARCHITECTURE.md` §31 requires notification targeting to be permission-aware. So `audienceType` plus one
 * nullable `audienceId` names the target set, and resolution goes through the same role/permission/scope
 * tables the rest of the system uses. There is no `is_admin` special case, because that would make the
 * notification path a second authorization system that nobody can audit.
 *
 * The reason `audienceId` is one column rather than eight nullable columns: eight nullable columns cannot
 * express "role A *and* department B", and MODULE 27's announcements routinely need several target sets at
 * once. `announcement_audiences` generalises the same discriminator into a repeatable list for exactly that
 * case.
 *
 * ## `RULES.md` §47 is enforced by unique keys, not by a check-before-send
 *
 * `notification_deliveries (notification_id, recipient_user_id)` is unique, and `email_messages` carries a
 * unique `idempotencyKey`. A worker that retries cannot produce a second row, and a retried send cannot
 * produce a second email. Checking "have we already notified about this?" before sending is the pattern
 * `RULES.md` §47 rejects, because the check and the send are not in one transaction and the race is the bug.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt, version } from "./_conventions";
import {
  emailStatusEnum,
  notificationAudienceEnum,
  notificationChannelEnum,
  notificationDeliveryStatusEnum,
} from "./_enums";
import { academicSessions, campuses, institutions } from "./institution";
import { users } from "./identity";

/**
 * `notifications` — a business event, rendered, addressed to a target set.
 *
 * ## `eventKey` is the idempotency anchor, and it is why `relatedEntityId` is a UUID
 *
 * `RULES.md` §47 requires that a business event not generate duplicates. The business event is identified by
 * `(eventKey, relatedEntityId)`: `"monthly_test_report"` plus the report's id, or `"leave_approved"` plus
 * the leave request's id. `sourceModule` says which module owns the event and exists so that a new module
 * cannot silently reuse another module's key space and collide with it.
 *
 * The unique key is **partial** — `(event_key, related_entity_id, channel) where channel is not null and
 * scheduled_for is null`. The `where` clause matters: a notification scheduled for 07:00 tomorrow and one
 * sent now are the same event, and the partial index correctly refuses both while a legitimately re-sent
 * reminder (different `scheduled_for`) is still allowed through.
 *
 * ## `payload` is jsonb and that is a considered exception
 *
 * Every other module refuses to store derived or untyped data. Here the alternative is worse: a
 * `notification` table that grows a column per workflow, re-migrated every time a module ships a new
 * notification type. The rendered `title`/`body` are captured alongside the payload, so a notification
 * already delivered can always be shown exactly as it was sent even after the source row changes.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /**
     * Which module raised it: `identity`, `attendance`, `admission`, `fees`, `hr`, `teacher`,
     * `daily_tests`, `diary`, `complaints`, `administration`. Free text rather than an enum, because a new
     * module must not require an enum migration to send its first notification.
     */
    sourceModule: varchar("source_module", { length: 32 }).notNull(),
    /**
     * The business event, stable across retries. e.g. `monthly_test_report`, `leave_approved`,
     * `complaint_escalated`. See the note above.
     */
    eventKey: varchar("event_key", { length: 64 }).notNull(),
    /**
     * The row the event is about. Deliberately **polymorphic and unconstrained**: `eventKey` is the
     * discriminator (`"monthly_test_report"`, `"leave_approved"`, …) and this is the id it points at.
     * A single uuid column is used rather than a `(entity_type, entity_id)` pair so a query can index
     * `(eventKey, relatedEntityId)` directly and the idempotency key can span channels — see the
     * unique index below. The cost is explicit: **no foreign key, so `relations.ts` generates nothing
     * for this column**, and resolving it is the application's job. It is one of 101 non-primary uuid
     * columns in this schema with no foreign key; `schema-contract.test.ts` allowlists it so the
     * decision stays deliberate rather than accidental.
     */
    relatedEntityId: uuid("related_entity_id"),
    /** `in_app`, `email`, `both`. `RULES.md` §46 — in-app is the default and email supplements it. */
    channel: notificationChannelEnum("channel").notNull().default("in_app"),
    /** `PRD.md` MODULE 26 / `RULES.md` §45: targeted. See the note at the top of this file. */
    audienceType: notificationAudienceEnum("audience_type").notNull(),
    /** The target set, per `audienceType`. Null only for `everyone`. See the note at the top of this file. */
    audienceId: uuid("audience_id"),
    /** Rendered at send time and stored, so a delivered notification always reads as it was delivered. */
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body").notNull(),
    /** Template variables. Opaque to the database; validated by the sending module. */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    /**
     * A deep link target — the portal route this notification opens. `RULES.md` §45 context-aware: the
     * notification must land the reader on the record, not on a list they then have to search.
     */
    actionUrl: varchar("action_url", { length: 512 }),
    /**
     * The permission the recipient must hold to read it, mirroring `src/shared/authorization/permissions.ts`.
     *
     * `RULES.md` §45 permission-aware: being in the audience is not authorization. A notification about a
     * student's result must still be gated on the same permission the record itself is gated on. Stored as a
     * key, validated by the shared registry — never free text that can drift from it.
     */
    requiredPermissionKey: varchar("required_permission_key", { length: 96 }),
    /** Defer the send. Used for quiet hours and for end-of-day notification dispatch. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, precision: 3 }),
    /** Expires the notification. A stale "your leave was approved" is worse than none. */
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    // `RULES.md` §47, structural. See the note at the top of this file.
    uniqueIndex("notifications_event_channel_key")
      .on(t.eventKey, t.relatedEntityId, t.channel)
      .where(sql`${t.relatedEntityId} is not null and ${t.scheduledFor} is null`),
    index("notifications_audience_idx").on(t.institutionId, t.audienceType, t.audienceId),
    // The dispatch worker's read path: what is owed, soonest first.
    index("notifications_pending_idx")
      .on(t.scheduledFor)
      .where(sql`${t.scheduledFor} is not null`),
    index("notifications_source_idx").on(t.sourceModule, t.eventKey),
    check(
      "notifications_audience_id_check",
      sql`${t.audienceType} = 'everyone' or ${t.audienceId} is not null`,
    ),
    check(
      "notifications_schedule_check",
      sql`${t.scheduledFor} is null or ${t.expiresAt} is null or ${t.expiresAt} > ${t.scheduledFor}`,
    ),
    check(
      "notifications_in_app_not_deferred",
      sql`${t.channel} <> 'in_app' or ${t.scheduledFor} is null`,
    ),
  ],
);

/**
 * `notification_deliveries` — one row per person told.
 *
 * ## This is where "trackable" and "non-duplicative" actually live
 *
 * `status` is `notificationDeliveryStatusEnum`: `pending` (queued for this recipient), `delivered`,
 * `read` (the in-app read receipt — `RULES.md` §45 trackable), `failed`, `suppressed`.
 *
 * `suppressed` is a first-class state, not an absence. A guardian with notifications switched off, or a
 * student already withdrawn, still gets a row recording that they were deliberately not told. Without it,
 * "we decided not to notify them" and "we forgot" look identical in every report, which is how a school
 * ends up unable to explain a missed fee reminder.
 *
 * ## `recipientUserId` rather than `recipientType` + `recipientId`
 *
 * A notification is ultimately read by a **user**, so a delivery is keyed to one. Targeting a guardian or a
 * parent resolves to their user account through `guardian_links`, and the resolution is recorded here, so
 * the delivery history survives the guardian link being revoked.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: primaryId(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    /** The person told. Always a user account, even when the audience was a guardian or a class. */
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `user`, `role`, `department`, `class`, `section`, `student`, `guardian`, `teacher`, `everyone`. */
    audienceType: notificationAudienceEnum("audience_type").notNull(),
    /** The specific target that matched, for a cross-account resolution. E.g. which class. */
    audienceId: uuid("audience_id"),
    /** How this recipient was resolved. Purely informational for auditing the fan-out. */
    resolutionNote: varchar("resolution_note", { length: 200 }),
    status: notificationDeliveryStatusEnum("status").notNull().default("pending"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, precision: 3 }),
    readAt: timestamp("read_at", { withTimezone: true, precision: 3 }),
    failedAt: timestamp("failed_at", { withTimezone: true, precision: 3 }),
    /** Why it was suppressed, or why delivery failed. Required in both cases. */
    failureReason: text("failure_reason"),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    // `RULES.md` §47: one notification reaches one person once. This is the whole mechanism.
    uniqueIndex("notification_deliveries_unique").on(t.notificationId, t.recipientUserId),
    // The in-app badge: unread notifications for one user.
    index("notification_deliveries_inbox_idx").on(t.recipientUserId, t.status, t.createdAt),
    index("notification_deliveries_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    index("notification_deliveries_audience_idx").on(t.audienceType, t.audienceId),
    check("notification_deliveries_attempt_count_check", sql`${t.attemptCount} >= 0`),
    // A read is a delivery. The in-app badge cannot show something that was never shown.
    check(
      "notification_deliveries_read_pair",
      sql`${t.status} <> 'read' or ${t.deliveredAt} is not null`,
    ),
    check(
      "notification_deliveries_failure_check",
      sql`${t.status} not in ('failed', 'suppressed') or ${t.failureReason} is not null`,
    ),
  ],
);

/**
 * `notification_preferences` — per user, per category.
 *
 * `RULES.md` §45 ends with "Do not send unnecessary notifications." That is a product requirement, and a
 * requirement the system cannot honour without somewhere to record what a user considers unnecessary.
 *
 * `category` is a workflow key (`leave`, `announcement`, `grades`, `attendance`, `fees`, `complaint`,
 * `diary`, `admission`, `system`) rather than a notification id: a user does not want to silence one
 * specific announcement, they want to silence a *category*. `inAppEnabled` and `emailEnabled` are separate
 * because `RULES.md` §46 makes email supplementary — a user may well want the in-app record and no mail.
 *
 * `unique(user_id, category)` where `category` is not null: `category = null` is the row that holds the
 * user's defaults, and it must be the only null-categorised row per user. The partial unique index expresses
 * exactly that, and lets the same user have both a default row and per-category overrides.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null = the user's default settings for every category. See the note above. */
    category: varchar("category", { length: 32 }),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    /** Quiet hours in the institution's timezone, e.g. '21:00'. Deferral, never dropping. */
    quietHoursStart: varchar("quiet_hours_start", { length: 5 }),
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
    /** The minimum channel this user wants. A preference can only ever narrow delivery, never widen it. */
    minimumPriority: varchar("minimum_priority", { length: 8 }).notNull().default("normal"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    // One override per category, and exactly one defaults row per user.
    uniqueIndex("notification_preferences_unique")
      .on(t.userId, t.category)
      .where(sql`${t.category} is not null`),
    uniqueIndex("notification_preferences_default_unique")
      .on(t.userId)
      .where(sql`${t.category} is null`),
    check(
      "notification_preferences_priority_check",
      sql`${t.minimumPriority} in ('low', 'normal', 'high', 'critical')`,
    ),
    check(
      "notification_preferences_quiet_hours_check",
      sql`num_nonnulls(${t.quietHoursStart}, ${t.quietHoursEnd}) in (0, 2)`,
    ),
  ],
);

/**
 * `announcements` — MODULE 27.
 *
 * ## Targeting is a join table, not a column
 *
 * MODULE 27's target list is "all users, specific roles, specific departments, other relevant audiences" —
 * which is an **and** of sets, not one set. So `announcement_audiences` repeats the discriminator, and one
 * announcement can target everyone plus a role plus a department in the same broadcast. A single nullable
 * audience column would force an admin to choose, and would silently drop half the audience.
 *
 * ## Draft / published / archived, and why `publishedAt` is not `createdAt`
 *
 * An announcement is drafted while it is being written. `RULES.md` §45 non-duplicative plus §43 historical
 * context mean a draft must not have reached anybody, so publication is a separate, recorded act — which is
 * exactly what the notification idempotency key is built on: the fan-out happens at publish time, once, and
 * a re-publish with an unchanged body produces the same `eventKey`.
 *
 * `requiresAcknowledgement` is for the announcements that matter — a fee change, a closure — where knowing
 * it was *seen* is the point. It creates the read-receipt obligation, and nothing else.
 */
export const announcements = pgTable(
  "announcements",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "restrict" }),
    academicSessionId: uuid("academic_session_id").references(() => academicSessions.id, {
      onDelete: "restrict",
    }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** `draft`, `published`, `archived`. */
    status: varchar("status", { length: 12 }).notNull().default("draft"),
    /** `low`, `normal`, `high`, `critical`. Gates the in-app badge and the email decision. */
    priority: varchar("priority", { length: 8 }).notNull().default("normal"),
    /** `all`, `students`, `guardians`, `staff`, `teachers`, `custom`. Mirrors `announcement_audiences`. */
    announcementType: varchar("announcement_type", { length: 16 }).notNull().default("all"),
    /**
     * The notification the publish fan-out created. One row, so "how many people did this announcement
     * reach?" is a count on one table instead of a search across four hundred delivery rows.
     */
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
    /** `true` creates an acknowledgement obligation. See the note above. */
    requiresAcknowledgement: boolean("requires_acknowledgement").notNull().default(false),
    /** Acknowledgement deadline, for a required read. */
    acknowledgeBy: timestamp("acknowledge_by", { withTimezone: true, precision: 3 }),
    /** When the announcement becomes visible. Null means at publication. */
    publishAt: timestamp("publish_at", { withTimezone: true, precision: 3 }),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 }),
    archivedAt: timestamp("archived_at", { withTimezone: true, precision: 3 }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Attachments as storage keys. `ARCHITECTURE.md` §51: references, never bytes. */
    attachmentKeys: jsonb("attachment_keys").$type<readonly string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("announcements_institution_status_idx").on(t.institutionId, t.status, t.publishedAt),
    index("announcements_publish_queue_idx")
      .on(t.publishAt)
      .where(sql`${t.status} = 'published' and ${t.publishAt} is not null`),
    check("announcements_status_check", sql`${t.status} in ('draft', 'published', 'archived')`),
    check(
      "announcements_priority_check",
      sql`${t.priority} in ('low', 'normal', 'high', 'critical')`,
    ),
    check(
      "announcements_type_check",
      sql`${t.announcementType} in ('all', 'students', 'guardians', 'staff', 'teachers', 'custom')`,
    ),
    // A published announcement must record when. See the note above.
    check(
      "announcements_publication_pair",
      sql`${t.status} = 'draft' or ${t.publishedAt} is not null`,
    ),
    // A required acknowledgement with no deadline is an obligation nobody can meet.
    check(
      "announcements_acknowledgement_deadline_check",
      sql`not ${t.requiresAcknowledgement} or ${t.acknowledgeBy} is not null`,
    ),
    check(
      "announcements_publish_after_check",
      sql`${t.publishAt} is null or ${t.publishedAt} is null or ${t.publishAt} <= ${t.publishedAt}`,
    ),
  ],
);

/**
 * `announcement_audiences` — MODULE 27's "and" of target sets.
 *
 * Each row is one target set. `audienceId` follows the same convention as `notifications.audienceId`: one
 * column, interpreted per `audienceType`, resolved through the authorization model (`ARCHITECTURE.md` §31).
 *
 * ## Why the key is a surrogate id and not `(announcementId, audienceType, audienceId)`
 *
 * `audienceId` is null for `everyone`, and a primary-key column is implicitly `NOT NULL` in PostgreSQL.
 * As a composite key the constraint would therefore reject exactly the row the check below permits, and
 * the error would surface as a not-null violation on a row that looks correct. A plain unique index does
 * not fix it either: `NULL`s are distinct in a btree, so two `everyone` rows would both be accepted.
 *
 * So uniqueness is expressed as two partial indexes — at most one `everyone` row, and at most one row per
 * concrete target set — which is the rule actually intended, stated in a form the database can enforce.
 *
 * `announcementType = 'custom'` with no rows here would silently reach nobody, so the application validates
 * that pairing. The database cannot: a constraint would have to query another table.
 */
export const announcementAudiences = pgTable(
  "announcement_audiences",
  {
    id: primaryId(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    audienceType: notificationAudienceEnum("audience_type").notNull(),
    /** The target set. Null only for `everyone`. */
    audienceId: uuid("audience_id"),
    /** How to intersect with the other rows. `any` is the default union; `all` requires every match. */
    matchMode: varchar("match_mode", { length: 8 }).notNull().default("any"),
  },
  (t) => [
    // At most one `everyone` row per announcement — two would be a duplicate fan-out, not a wider one.
    uniqueIndex("announcement_audiences_everyone_key")
      .on(t.announcementId)
      .where(sql`${t.audienceType} = 'everyone'`),
    // At most one row per concrete target set, for the same reason.
    uniqueIndex("announcement_audiences_target_key")
      .on(t.announcementId, t.audienceType, t.audienceId)
      .where(sql`${t.audienceType} <> 'everyone'`),
    index("announcement_audiences_lookup_idx").on(t.audienceType, t.audienceId),
    check(
      "announcement_audiences_id_check",
      sql`${t.audienceType} = 'everyone' or ${t.audienceId} is not null`,
    ),
    check("announcement_audiences_match_mode_check", sql`${t.matchMode} in ('any', 'all')`),
  ],
);

/**
 * `announcement_receipts` — read and acknowledged.
 *
 * `RULES.md` §45 trackable. One row per recipient, created at publication by the same fan-out that creates
 * `notification_deliveries`, so the two can be compared: a delivery that exists without a receipt is unread,
 * and a receipt without a delivery is a bug worth surfacing.
 *
 * `acknowledgedAt` is separate from `readAt` because `requiresAcknowledgement` is a deliberate act: a
 * student who has an announcement open but has not confirmed has not acknowledged it, and a required
 * acknowledgement that only tracked `readAt` could be satisfied accidentally by a preloaded feed.
 */
export const announcementReceipts = pgTable(
  "announcement_receipts",
  {
    id: primaryId(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, precision: 3 }),
    readAt: timestamp("read_at", { withTimezone: true, precision: 3 }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, precision: 3 }),
    /** The confirmation, kept verbatim for a disciplinary record. */
    acknowledgementNote: text("acknowledgement_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("announcement_receipts_unique").on(t.announcementId, t.userId),
    // "Who has not acknowledged the fee notice?" is the query this index exists for.
    index("announcement_receipts_pending_ack_idx")
      .on(t.announcementId, t.acknowledgedAt)
      .where(sql`${t.acknowledgedAt} is null`),
    index("announcement_receipts_user_idx").on(t.userId, t.readAt),
    // Acknowledging without having read it is not a receipt worth recording.
    check(
      "announcement_receipts_ack_pair",
      sql`${t.acknowledgedAt} is null or ${t.readAt} is not null`,
    ),
  ],
);

/**
 * `email_templates` — "Email templates should be centrally manageable." (MODULE 28)
 *
 * ## Versioned, and the version is part of the send
 *
 * A template is edited. If `email_messages` referenced the template and read its body at send time, then a
 * message queued yesterday would be delivered with today's wording. So `email_messages` captures the
 * rendered `subject` and body at queue time, and `templateId` + `templateVersion` are recorded for audit —
 * "which wording did this student actually receive?" has an answer.
 *
 * `isActive` disables a template without deleting it, because historical sends still reference its version.
 */
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: primaryId(),
    /** e.g. `daily_diary`, `monthly_test_report`, `email_verification`, `password_reset`. */
    templateKey: varchar("template_key", { length: 64 }).notNull(),
    /** Bumped on every content change. See the note above. */
    version: integer("version").notNull().default(1),
    /** `en`, `ur`, `ar`. BCP 47 in practice. */
    locale: varchar("locale", { length: 8 }).notNull().default("en"),
    /** `password_reset` etc. only for templates that carry a secret. Never for anything else. */
    description: varchar("description", { length: 300 }),
    subjectTemplate: varchar("subject_template", { length: 300 }).notNull(),
    /** Handlebars-ish. Validated by the template engine, not by the database. */
    bodyTemplate: text("body_template").notNull(),
    /** The variables this template declares. Lets a template be checked before it is saved. */
    requiredVariables: jsonb("required_variables").$type<readonly string[]>().notNull().default([]),
    /** `html` or `plain_text`. MODULE 28 says nothing; plain text is the safe default for mail clients. */
    contentType: varchar("content_type", { length: 16 }).notNull().default("plain_text"),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version_: integer("row_version").notNull().default(1),
  },
  (t) => [
    // One live template per key and locale. Two active versions of `password_reset` is a coin flip.
    uniqueIndex("email_templates_active_key")
      .on(t.templateKey, t.locale)
      .where(sql`${t.isActive} = true`),
    // Every version of a template is retained, for audit. See the note at the top of this table.
    uniqueIndex("email_templates_key_version_unique").on(t.templateKey, t.locale, t.version),
    index("email_templates_lookup_idx").on(t.templateKey, t.isActive, t.locale),
    check("email_templates_version_check", sql`${t.version} > 0`),
    check("email_templates_content_type_check", sql`${t.contentType} in ('html', 'plain_text')`),
  ],
);

/**
 * `email_messages` — the SMTP outbox.
 *
 * ## An outbox, not a direct send
 *
 * `PRD.md` MODULE 28 requires configurable SMTP. Calling SMTP inside a request handler means a slow mail
 * server fails a user's request, and a process crash between "committed the business transaction" and "sent
 * the mail" loses the mail. So the message is **queued in a transaction** with the business change, and a
 * worker sends it. That is also what makes `RULES.md` §47 achievable: the idempotency key is durable before
 * any send is attempted.
 *
 * ## `idempotencyKey` is unique and not null
 *
 * This is the strongest guarantee in the file. `RULES.md` §47 names diary emails, monthly reports, leave
 * notifications, background jobs and retry workflows; all five produce `email_messages` rows, and all five
 * derive this key from the business event. A worker retry, a double-clicked button, and a replayed queue
 * message all collide here rather than sending twice.
 *
 * `status` is `emailStatusEnum` (`queued`, `sending`, `sent`, `failed`, `suppressed`). `sending` exists so
 * a crashed worker's in-flight message is visible and reclaimable rather than looking merely `queued`.
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: primaryId(),
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "cascade",
    }),
    /** The template it came from, and the exact version. See the note at the top of this table. */
    templateId: uuid("template_id").references(() => emailTemplates.id, { onDelete: "set null" }),
    templateVersion: integer("template_version"),
    /**
     * The workflow that produced it: `email_verification`, `password_reset`, `daily_diary`,
     * `monthly_test_report`, `leave_decision`, `announcement`, or an explicitly approved workflow.
     * MODULE 28's list plus those the product approves.
     */
    emailType: varchar("email_type", { length: 40 }).notNull(),
    /** `RULES.md` §47. Derived from the business event; unique; not negotiable. */
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    /** Rendered at queue time, so a wording change cannot alter a message already queued. */
    subject: varchar("subject", { length: 300 }).notNull(),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    /** The recipient. Bcc is used for bulk sends so addresses are not exposed to each other. */
    toUserId: uuid("to_user_id").references(() => users.id, { onDelete: "set null" }),
    toEmail: varchar("to_email", { length: 320 }).notNull(),
    ccEmails: jsonb("cc_emails").$type<readonly string[]>().notNull().default([]),
    bccEmails: jsonb("bcc_emails").$type<readonly string[]>().notNull().default([]),
    replyToEmail: varchar("reply_to_email", { length: 320 }),
    /** The notification this email is the email half of. `channel = 'both'` makes this non-null. */
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
    status: emailStatusEnum("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    /** The SMTP server that accepted it. Needed to reconcile a duplicate send after a network partition. */
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    sentAt: timestamp("sent_at", { withTimezone: true, precision: 3 }),
    failedAt: timestamp("failed_at", { withTimezone: true, precision: 3 }),
    failureReason: text("failure_reason"),
    /** Next retry. Backoff is the worker's decision; this is where it records the result. */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, precision: 3 }),
    /** An attachment the template produced, e.g. a payslip PDF. A storage key, never bytes. */
    attachmentStorageKey: varchar("attachment_storage_key", { length: 512 }),
    /**
     * The row this email is about. Polymorphic and unconstrained for the same reason as
     * `notifications.relatedEntityId` above: **no foreign key, so `relations.ts` generates nothing
     * for it.** `notificationId` is the typed link back to `notifications`; this is the optional
     * pointer at whatever the email concerns.
     */
    relatedEntityId: uuid("related_entity_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // The `RULES.md` §47 guarantee, in one index.
    uniqueIndex("email_messages_idempotency_key").on(t.idempotencyKey),
    // The worker's read path: what to send now.
    index("email_messages_queue_idx")
      .on(t.nextAttemptAt, t.createdAt)
      .where(sql`${t.status} in ('queued', 'sending')`),
    index("email_messages_status_idx").on(t.status, t.sentAt),
    // A user's sent-mail view, for support and for "did they get it?".
    index("email_messages_to_idx").on(t.toUserId, t.createdAt),
    index("email_messages_type_idx").on(t.emailType, t.createdAt),
    check("email_messages_attempt_count_check", sql`${t.attemptCount} >= 0`),
    check("email_messages_max_attempts_check", sql`${t.maxAttempts} > 0`),
    check(
      "email_messages_attempt_within_limit_check",
      sql`${t.attemptCount} <= ${t.maxAttempts} or ${t.status} <> 'queued'`,
    ),
    // Sending implies knowing when, and the provider's id for reconciliation.
    check(
      "email_messages_sent_pair",
      sql`${t.status} <> 'sent' or (${t.sentAt} is not null and ${t.providerMessageId} is not null)`,
    ),
    check(
      "email_messages_failed_pair",
      sql`${t.status} <> 'failed' or (${t.failedAt} is not null and ${t.failureReason} is not null)`,
    ),
    check(
      "email_messages_template_version_pair",
      sql`num_nonnulls(${t.templateId}, ${t.templateVersion}) in (0, 2)`,
    ),
    // One body or the other, never neither: an email with an empty body is a bug.
    check("email_messages_body_check", sql`num_nonnulls(${t.bodyHtml}, ${t.bodyText}) >= 1`),
    check(
      "email_messages_notification_pair",
      sql`${t.notificationId} is null or ${t.toUserId} is not null`,
    ),
  ],
);

/**
 * `email_delivery_events` — what the SMTP server said.
 *
 * ## Diagnostics, not control
 *
 * `email_messages.status` is the control plane: what this system believes. This table is the record of what
 * the provider actually reported — a `250` acceptance, a bounce, a deferred retry. They disagree in real
 * life, and the reconciliation is only possible if both are kept.
 *
 * It is append-only and has no status column of its own: a delivery event is a fact that happened, not a
 * state to be updated. `RULES.md` §43 historical context.
 */
export const emailDeliveryEvents = pgTable(
  "email_delivery_events",
  {
    id: primaryId(),
    emailMessageId: uuid("email_message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    /** `accepted`, `deferred`, `bounced`, `complained`, `opened`, `clicked`. */
    eventType: varchar("event_type", { length: 16 }).notNull(),
    /** The SMTP or provider code, verbatim. `250`, `550`, … */
    providerCode: varchar("provider_code", { length: 32 }),
    /** The provider's own message. Untrusted, so bounded. */
    providerMessage: text("provider_message"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /** The provider's event id, when it has one. Unique per message so a replayed webhook is identifiable. */
    providerEventId: varchar("provider_event_id", { length: 255 }),
  },
  (t) => [
    index("email_delivery_events_message_idx").on(t.emailMessageId, t.occurredAt),
    check(
      "email_delivery_events_type_check",
      sql`${t.eventType} in ('accepted', 'deferred', 'bounced', 'complained', 'opened', 'clicked')`,
    ),
  ],
);
