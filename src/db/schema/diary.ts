/**
 * Daily diary, and the notification that goes with it.
 *
 * `PRD.md` MODULE 23 and 24, `ARCHITECTURE.md` §23. The diary is a small module with one genuinely hard
 * requirement: **parents get an email per child per diary day, personalised per student.**
 *
 * "Personalised according to the associated student/students" is the part that breaks the obvious design. A
 * guardian with two children in the same class gets two emails, one naming each child — "personalised"
 * means the recipient can tell which child it is about, and one message covering both would make the
 * child's name ambiguous. So the unit is not "the diary" and not the "guardian": it is **(guardian,
 * student) per diary assignment**, and `diary_notifications` has to make that unique.
 *
 * `RULES.md` §47 (notification idempotency) and §46 (email rules) are the rules this requirement comes from;
 * both are satisfied structurally below rather than by a worker checking before it sends.
 *
 * ## Guardian references use `(guardian_user_id, student_id)`
 *
 * `guardian_links` has a composite primary key, so there is no `guardian_links.id` to point at. Every
 * guardian-scoped table here therefore carries both columns and a composite foreign key, which also has the
 * useful property that it cannot reference a link between a different guardian and student than the row
 * claims.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt, version } from "./_conventions";
import { diaryStatusEnum } from "./_enums";
import { academicSessions, institutions } from "./institution";
import { classes, sections, subjects } from "./academic";
import { students } from "./student";
import { guardians, guardianLinks } from "./guardian";

/**
 * `diaries` — one diary entry, for one subject, on one day.
 *
 * ## `diaryDate` is a plain date, and the uniqueness proves why
 *
 * `(subject_id, diary_date)` is unique. Two English teachers assigning different homework to the same
 * class on the same day is a real scenario — but two diary *rows* for one subject on one day would make
 * "today's diary" ambiguous for every student in it, and a guardian email saying "the diary is available"
 * would have two things to link to. One row per subject per day is the invariant.
 *
 * `status` is `draft`, `assigned`, `closed`, and it is the gate on `diary_notifications`: only an `assigned`
 * diary has been given to anybody, so only an assigned diary may produce an email. That is a cross-table
 * rule enforced in the application, and it is safe there because a diary's status only moves forward.
 */
export const diaries = pgTable(
  "diaries",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    /** The day the diary is for. A date, not a timestamp — a diary is for a school day. */
    diaryDate: date("diary_date").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    /** The homework itself. `text`, not varchar — MODULE 23 does not limit its length. */
    content: text("content").notNull(),
    /** Who it was assigned to: a class, a section, or one student. At least one is required. */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    status: diaryStatusEnum("status").notNull().default("draft"),
    assignedAt: timestamp("assigned_at", { withTimezone: true, precision: 3 }),
    assignedByTeacherUserId: uuid("assigned_by_teacher_user_id"),
    /** `closed` marks the day done. A closed diary is history (`RULES.md` §44). */
    closedAt: timestamp("closed_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    // One diary per subject per day. See the note at the top of this table.
    uniqueIndex("diaries_subject_date_key").on(t.subjectId, t.diaryDate),
    index("diaries_institution_date_idx").on(t.institutionId, t.diaryDate, t.status),
    index("diaries_class_idx").on(t.classId, t.sectionId, t.diaryDate),
    index("diaries_session_date_idx").on(t.academicSessionId, t.diaryDate),
    check("diaries_scope_check", sql`${t.classId} is not null or ${t.sectionId} is not null`),
    // `assigned` means somebody was told. Without the instant, "the diary is out" is unfalsifiable.
    check(
      "diaries_assignment_pair",
      sql`${t.status} = 'draft' or (${t.assignedAt} is not null and ${t.assignedByTeacherUserId} is not null)`,
    ),
    check("diaries_closed_pair", sql`${t.status} <> 'closed' or ${t.closedAt} is not null`),
  ],
);

/**
 * `diary_assignments` — which student received which diary.
 *
 * ## Why the roster is explicit rather than resolved from `diaries.classId`
 *
 * The obvious design joins a student to a diary through class and section. That is wrong for three real
 * cases: a student who joined the class mid-week, a student withdrawn from the section, and a diary
 * assigned to one student rather than the whole class. In all three, the join says the wrong thing.
 *
 * So the roster is a row, written at assignment time. It is also what makes "which guardians still owe a
 * notification for this diary?" a single indexed lookup.
 *
 * `acknowledgedAt` is the explicit read receipt. MODULE 23 requires the diary to be *available* to student
 * and guardian; it does not require confirmation. The column exists because a school that needs that signal
 * should not need a schema change. Passive opens live in `diary_reads`.
 */
export const diaryAssignments = pgTable(
  "diary_assignments",
  {
    id: primaryId(),
    diaryId: uuid("diary_id")
      .notNull()
      .references(() => diaries.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /** The class/section the assignment was resolved against, captured for audit. */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /**
     * The guardian who receives the notification for this student, captured at assignment time.
     *
     * Resolved eagerly rather than looked up at send time on purpose: custody changes must not redirect a
     * diary that was already promised to someone, and a change-of-custody is exactly when a lookup would
     * pick the wrong recipient. `onDelete: 'restrict'` on the composite key means a guardian cannot be
     * unlinked while a diary assignment still names them.
     */
    guardianUserId: uuid("guardian_user_id"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, precision: 3 }),
    acknowledgedByUserId: uuid("acknowledged_by_user_id"),
  },
  (t) => [
    // A diary is assigned to a student once. Re-assigning is an update, not a second row.
    uniqueIndex("diary_assignments_unique").on(t.diaryId, t.studentId),
    // The reverse lookup: everything assigned to one student, newest first. Every portal opens here.
    index("diary_assignments_student_idx").on(t.studentId, t.assignedAt),
    // The notification worker's read path: assignments that name a guardian and owe an email.
    index("diary_assignments_guardian_idx").on(t.guardianUserId, t.assignedAt),
    foreignKey({
      columns: [t.guardianUserId, t.studentId],
      foreignColumns: [guardianLinks.guardianUserId, guardianLinks.studentId],
      name: "diary_assignments_guardian_link_fk",
    }),
    check(
      "diary_assignments_guardian_pair",
      sql`num_nonnulls(${t.guardianUserId}, ${t.studentId}) = 2`,
    ),
    check(
      "diary_assignments_acknowledgement_pair",
      sql`num_nonnulls(${t.acknowledgedAt}, ${t.acknowledgedByUserId}) in (0, 2)`,
    ),
  ],
);

/**
 * `diary_attachments` — a worksheet, a handout, a link.
 *
 * `storageKey`/`externalUrl` is the `ARCHITECTURE.md` §51 rule: PostgreSQL holds a reference, never bytes.
 * These are files with a lifecycle — a parent portal lists them and a download is counted — which is why
 * they are rows rather than a JSON array on the diary.
 */
export const diaryAttachments = pgTable(
  "diary_attachments",
  {
    id: primaryId(),
    diaryId: uuid("diary_id")
      .notNull()
      .references(() => diaries.id, { onDelete: "cascade" }),
    /** Human label — "Chapter 4 worksheet". */
    label: varchar("label", { length: 200 }).notNull(),
    /** `worksheet`, `handout`, `link`, `image`, `other`. */
    attachmentType: varchar("attachment_type", { length: 16 }).notNull(),
    /** Opaque storage key for a file, or a URL for a `link`. Exactly one of the two. */
    storageKey: varchar("storage_key", { length: 512 }),
    externalUrl: varchar("external_url", { length: 2048 }),
    contentType: varchar("content_type", { length: 120 }),
    /** Size in bytes, for a file. Recorded by the upload, never trusted from the client. */
    sizeBytes: integer("size_bytes"),
    uploadedByUserId: uuid("uploaded_by_user_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("diary_attachments_diary_idx").on(t.diaryId),
    check(
      "diary_attachments_type_check",
      sql`${t.attachmentType} in ('worksheet', 'handout', 'link', 'image', 'other')`,
    ),
    // A link points at a URL, a file points at a key. Exactly one — never both, never neither.
    check(
      "diary_attachments_source_check",
      sql`num_nonnulls(${t.storageKey}, ${t.externalUrl}) = 1`,
    ),
    check(
      "diary_attachments_link_type_check",
      sql`${t.attachmentType} <> 'link' or ${t.externalUrl} is not null`,
    ),
    check(
      "diary_attachments_file_type_check",
      sql`${t.attachmentType} = 'link' or ${t.storageKey} is not null`,
    ),
    check("diary_attachments_size_check", sql`${t.sizeBytes} is null or ${t.sizeBytes} > 0`),
  ],
);

/**
 * `diary_notifications` — one row per (diary assignment, guardian) email.
 *
 * ## This table is the answer to MODULE 24's "personalised according to the associated student"
 *
 * The unique key is `(diary_assignment_id, guardian_user_id)`. Every assignment names one student and one
 * guardian, so that pair is exactly "one email about one child". A guardian with two children in one class
 * gets two rows and two emails, which is what "personalised" requires and what a per-diary notification row
 * could not express.
 *
 * ## Idempotency is structural
 *
 * `RULES.md` §47 requires that a business event not generate duplicate notifications, and lists diary emails
 * specifically. The mechanisms here, in order of strength:
 *
 * 1. The unique key above — a second insert for the same (assignment, guardian) is impossible.
 * 2. `idempotencyKey` — a stable string derived from `(diary, assignment, guardian)`, handed to the mail
 *    transport so it can dedupe a retry that raced the insert.
 * 3. `RULES.md` §48 idempotency for background jobs, which is where the dispatcher itself is keyed.
 *
 * `status` is delivery state and `attemptCount` is there because MODULE 24's email is a required workflow,
 * not a best-effort one: a diary notification that silently failed would leave a family believing there is
 * no homework.
 */
export const diaryNotifications = pgTable(
  "diary_notifications",
  {
    id: primaryId(),
    diaryId: uuid("diary_id")
      .notNull()
      .references(() => diaries.id, { onDelete: "restrict" }),
    /** The student the email is about. Carried here so the row reads on its own. */
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /** The recipient. */
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => guardians.userId, { onDelete: "restrict" }),
    /** The assignment that triggered it. See the note above. */
    diaryAssignmentId: uuid("diary_assignment_id")
      .notNull()
      .references(() => diaryAssignments.id, { onDelete: "restrict" }),
    /** `pending`, `queued`, `sent`, `delivered`, `failed`, `suppressed`. */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** Stable per (assignment, guardian). See the note above. */
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, precision: 3 }),
    sentAt: timestamp("sent_at", { withTimezone: true, precision: 3 }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, precision: 3 }),
    failureReason: text("failure_reason"),
    /** The rendered subject line, kept for support: "Muhammad's diary — 5 March". */
    subjectLine: varchar("subject_line", { length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [
    // The core of MODULE 24: exactly one notification per (assignment, guardian).
    uniqueIndex("diary_notifications_assignment_guardian_key").on(
      t.diaryAssignmentId,
      t.guardianUserId,
    ),
    // The retry-safe handle for the mail transport.
    uniqueIndex("diary_notifications_idempotency_key").on(t.idempotencyKey),
    // The dispatch worker's read path: what is still owed.
    index("diary_notifications_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} in ('pending', 'queued')`),
    index("diary_notifications_diary_idx").on(t.diaryId, t.status),
    // The guardian's own notification history.
    index("diary_notifications_guardian_idx").on(t.guardianUserId, t.createdAt),
    foreignKey({
      columns: [t.guardianUserId, t.studentId],
      foreignColumns: [guardianLinks.guardianUserId, guardianLinks.studentId],
      name: "diary_notifications_guardian_link_fk",
    }),
    check(
      "diary_notifications_status_check",
      sql`${t.status} in ('pending', 'queued', 'sent', 'delivered', 'failed', 'suppressed')`,
    ),
    check("diary_notifications_attempt_count_check", sql`${t.attemptCount} >= 0`),
    check(
      "diary_notifications_sent_pair",
      sql`${t.status} not in ('sent', 'delivered') or ${t.sentAt} is not null`,
    ),
    // Delivery follows sending. A provider webhook cannot arrive before the send it acknowledges.
    check(
      "diary_notifications_delivery_pair",
      sql`${t.status} <> 'delivered' or ${t.sentAt} is not null`,
    ),
    // A failed row with no reason is unactionable.
    check(
      "diary_notifications_failure_check",
      sql`${t.status} <> 'failed' or ${t.failureReason} is not null`,
    ),
  ],
);

/**
 * `diary_notification_preferences` — a guardian who does not want a daily email.
 *
 * MODULE 24 requires the daily email; it does not require it to be inescapable, and `RULES.md` §45 makes
 * in-app the default mechanism with email supplementary. A school whose guardians are asked daily about
 * homework will ask for an opt-out within a week, and "no per-guardian column on `guardians`" would mean a
 * migration for every school that wanted it.
 *
 * `diaryFrequency` is per subject, so a guardian can take English daily and Chemistry weekly — a real
 * request that would need a second table under any narrower design.
 */
export const diaryNotificationPreferences = pgTable(
  "diary_notification_preferences",
  {
    id: primaryId(),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => guardians.userId, { onDelete: "cascade" }),
    /** Null applies to every subject. */
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
    /** Only these subjects may receive diary email. See the note above. */
    emailEnabled: boolean("email_enabled").notNull().default(true),
    /** `daily`, `weekly`, `off`. `off` is equivalent to `emailEnabled = false`, kept for clarity. */
    diaryFrequency: varchar("diary_frequency", { length: 8 }).notNull().default("daily"),
    /** 24-hour clock in the institution's timezone, e.g. '19:30'. */
    quietHoursStart: varchar("quiet_hours_start", { length: 5 }),
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("diary_notification_preferences_unique").on(t.guardianUserId, t.subjectId),
    check(
      "diary_notification_preferences_frequency_check",
      sql`${t.diaryFrequency} in ('daily', 'weekly', 'off')`,
    ),
    // Quiet hours are a pair or neither: half a window is not a window.
    check(
      "diary_notification_preferences_quiet_hours_check",
      sql`num_nonnulls(${t.quietHoursStart}, ${t.quietHoursEnd}) in (0, 2)`,
    ),
  ],
);

/**
 * `diary_reads` — which diary a student or guardian actually opened.
 *
 * A read receipt, not a notification: MODULE 23 only requires availability. Kept separate from
 * `diary_assignments.acknowledgedAt` because that is an explicit acknowledgement (a deliberate act) and this
 * is passive. `viewerKind` + `viewerId` is the `ARCHITECTURE.md` §9 discriminator-plus-id pattern: one table
 * for two audiences rather than two near-identical tables. For a guardian the id is a `guardians.user_id`.
 */
export const diaryReads = pgTable(
  "diary_reads",
  {
    id: primaryId(),
    diaryId: uuid("diary_id")
      .notNull()
      .references(() => diaries.id, { onDelete: "cascade" }),
    /** `student` or `guardian`. */
    viewerKind: varchar("viewer_kind", { length: 12 }).notNull(),
    /** A `students.id` or a `guardians.user_id`, per `viewerKind`. Not a foreign key — see §9. */
    viewerId: uuid("viewer_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    /** `portal`, `email_link`, `mobile_app`. How they got there. */
    via: varchar("via", { length: 16 }).notNull().default("portal"),
  },
  (t) => [
    // Reading is idempotent: the first read is the fact, later ones update `readAt`.
    uniqueIndex("diary_reads_unique").on(t.diaryId, t.viewerKind, t.viewerId),
    index("diary_reads_viewer_idx").on(t.viewerKind, t.viewerId, t.readAt),
    check("diary_reads_viewer_kind_check", sql`${t.viewerKind} in ('student', 'guardian')`),
    check("diary_reads_via_check", sql`${t.via} in ('portal', 'email_link', 'mobile_app')`),
  ],
);
