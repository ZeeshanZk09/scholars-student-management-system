/**
 * Student complaints and the workflow that resolves them.
 *
 * `PRD.md` MODULE 25, `ARCHITECTURE.md` §23. The PRD is short — teacher raises, seven named fields, and
 * "complaint-related notifications must follow permissions and workflow rules" — and that last clause is
 * the whole design problem, because it means the same complaint has to be visible to different people at
 * different stages.
 *
 * ## Three tables, because "who can see this" is the substance
 *
 * A single `complaints` row cannot express the requirement. Reading a complaint is not one permission; it is
 * a function of the reader's role **and** the complaint's status. So:
 *
 * - `complaints` — the report. Who, when, why, and where it currently stands.
 * - `complaint_actions` — the append-only trail of everything done about it, including the resolution.
 * - `complaint_visibility` — the explicit grant list for people who may read a complaint they did not raise
 *   and are not the automatic participants.
 *
 * ## The automatic participants are not in `complaint_visibility`
 *
 * The raising teacher, the student, and the assigned investigator can always read the complaint. Encoding
 * that as three rows per complaint would triple the table and make "who was explicitly granted access?"
 * impossible to answer. `complaint_visibility` therefore holds only *additional* grants, and the automatic
 * three are a property of the module. `PRD.md` MODULE 25 requires notifications to "follow permissions", and
 * this is the shape those permissions take.
 *
 * ## Status moves are append-only
 *
 * There is no `status_changed_at`/`status_changed_by` pair on `complaints`, because a status column plus a
 * history of status columns is the classic way to end up with a history that disagrees with the row. The
 * current status is a column; every transition is a `complaint_actions` row, written in the same transaction
 * as the column update. `RULES.md` §43 (historical context) and §51 (auditable) are why.
 */
import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, description, primaryId, updatedAt, version } from "./_conventions";
import { complaintStatusEnum } from "./_enums";
import { academicSessions, institutions } from "./institution";
import { classes, sections, subjects } from "./academic";
import { students } from "./student";
import { users } from "./identity";

/**
 * `complaints` — a teacher's report about a student.
 *
 * ## `reason` is a category and `description` is the narrative, kept apart on purpose
 *
 * `PRD.md` MODULE 25 lists "Reason" and "Description" as separate fields, which means "reason" is
 * categorisable. A text box called `reason` that holds a paragraph makes the complaint list in MODULE 25's
 * companion reporting unusable — you cannot count how many attendance complaints there were this term.
 *
 * The category is deliberately a free-text `varchar` and not an enum. The PRD does not enumerate the valid
 * reasons, and inventing an enum here would put a `pgEnum` value list in the database that only this comment
 * justifies. Whoever owns the complaint taxonomy adds it; adding a category must not require re-migrating
 * every existing row, which is exactly what `ALTER TYPE ... ADD VALUE` in a shared enum would cost.
 *
 * ## `subjectId` is the reporting context, not the subject of the complaint
 *
 * A complaint about a student's conduct in Chemistry carries the Chemistry id so the complaint appears in
 * that subject's context, matching MODULE 14's "relevant subject/student contexts" rule. It is nullable
 * because a complaint may be about a student generally.
 *
 * ## `reportedDate` and `reportedAt`
 *
 * The PRD asks for a "Date". Two columns because a teacher who writes up an incident from last Tuesday
 * needs to say so: `reportedDate` is when it happened, `reportedAt` is when it was entered. Collapsing them
 * makes backdated reports — which this module will get — indistinguishable from late data entry.
 */
export const complaints = pgTable(
  "complaints",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "restrict" }),
    /** `PRD.md` MODULE 25: the student the complaint is about. */
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /** `PRD.md` MODULE 25: the teacher raising it. */
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** The class/section context, captured at the time of the complaint. */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    /** The reporting context. Null when the complaint is about the student generally. */
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "restrict" }),
    /** When the incident happened. */
    reportedDate: date("reported_date").notNull(),
    /** When it was entered into the system. See the note above. */
    reportedAt: timestamp("reported_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    title: varchar("title", { length: 200 }).notNull(),
    /** `PRD.md` MODULE 25: "Reason" — a short category. See the note at the top of this table. */
    reason: varchar("reason", { length: 64 }).notNull(),
    /** `PRD.md` MODULE 25: "Description" — the narrative. */
    description: description("description").notNull(),
    /** `PRD.md` MODULE 25: "Status". */
    status: complaintStatusEnum("status").notNull().default("open"),
    /**
     * `PRD.md` MODULE 25: "Relevant action". Kept as a short summary on the complaint because the list view
     * must show it; the full account is in `complaint_actions`, which is where the audit trail lives.
     */
    actionTaken: text("action_taken"),
    /** Severity is not in the PRD's field list. It is here because MODULE 25's workflow branches on it. */
    severity: varchar("severity", { length: 8 }).notNull().default("medium"),
    /** The investigator. Null while the complaint is `open` and unassigned. */
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true, precision: 3 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, precision: 3 }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** `true` once the student and their guardians have been told. Not the same as `resolved`. */
    studentNotifiedAt: timestamp("student_notified_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    index("complaints_institution_status_idx").on(t.institutionId, t.status, t.reportedAt),
    // Every student's complaint history. A class teacher asks this constantly.
    index("complaints_student_idx").on(t.studentId, t.reportedAt),
    // The raiser's own list.
    index("complaints_reported_by_idx").on(t.reportedByUserId, t.reportedAt),
    // The investigator's queue.
    index("complaints_assigned_idx").on(t.assignedToUserId, t.status),
    index("complaints_class_idx").on(t.classId, t.sectionId, t.reportedDate),
    index("complaints_severity_idx").on(t.institutionId, t.severity, t.status),
    check("complaints_severity_check", sql`${t.severity} in ('low', 'medium', 'high', 'critical')`),
    // An assigned investigator who has no assignment timestamp is not a usable queue.
    check(
      "complaints_assignment_pair",
      sql`num_nonnulls(${t.assignedToUserId}, ${t.assignedAt}) in (0, 2)`,
    ),
    // `under_review` means somebody owns it. `open` does not.
    check(
      "complaints_review_requires_assignee",
      sql`${t.status} <> 'under_review' or ${t.assignedToUserId} is not null`,
    ),
    // Resolution is an act with an author. `RULES.md` §51.
    check(
      "complaints_resolution_pair",
      sql`num_nonnulls(${t.resolvedAt}, ${t.resolvedByUserId}) in (0, 2)`,
    ),
    check(
      "complaints_resolution_status_check",
      sql`${t.status} not in ('resolved', 'dismissed') or ${t.resolvedAt} is not null`,
    ),
    // A resolved complaint without a recorded action is a complaint nobody acted on.
    check(
      "complaints_resolution_requires_action",
      sql`${t.status} <> 'resolved' or nullif(btrim(${t.actionTaken}), '') is not null`,
    ),
  ],
);

/**
 * `complaint_actions` — append-only.
 *
 * ## Why the current status is not derived from this table
 *
 * It could be — the last `action_type = 'status_change'` row determines the status. It is not, because every
 * list view, every notification recipient query, and every authorization check would then have to aggregate
 * a history to answer "what is this complaint's status?". The column is the answer; this table is the proof.
 * The two are updated in one transaction, so they cannot disagree, and the check below prevents a resolution
 * with no corresponding action from being written on its own.
 *
 * ## `actorUserId` is nullable, and that is deliberate
 *
 * `PRD.md` MODULE 25 says notifications must "follow permissions and workflow rules" — some actions are
 * automatic. A null actor marks an action the system took (an assignment on escalation, a status move when a
 * deadline lapsed), and a non-null actor marks a person. Distinguishing the two in one nullable column is
 * better than inventing a fake system user, which would put a synthetic principal into the authorization
 * model and into every audit log that joins on it.
 */
export const complaintActions = pgTable(
  "complaint_actions",
  {
    id: primaryId(),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    /**
     * `created`, `status_change`, `assigned`, `reassigned`, `note_added`, `evidence_attached`,
     * `student_notified`, `guardian_notified`, `escalated`.
     */
    actionType: varchar("action_type", { length: 24 }).notNull(),
    /** The status this action produced, for `status_change` rows. */
    fromStatus: complaintStatusEnum("from_status"),
    toStatus: complaintStatusEnum("to_status"),
    /** Who did it. Null means the system did. See the note above. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    details: description("details"),
    /**
     * Whether this action is visible to the student and guardians.
     *
     * An internal note about an ongoing investigation is not. `false` means the row stays with staff; `true`
     * means it is part of the record the family can read. This is the mechanism behind MODULE 25's
     * "notifications must follow permissions" — the same predicate that decides who may read the complaint
     * also decides which actions are disclosed.
     */
    isVisibleToStudent: boolean("is_visible_to_student").notNull().default(true),
    occurredAt: timestamp("occurred_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("complaint_actions_complaint_idx").on(t.complaintId, t.occurredAt),
    index("complaint_actions_actor_idx").on(t.actorUserId, t.occurredAt),
    check(
      "complaint_actions_type_check",
      sql`${t.actionType} in ('created', 'status_change', 'assigned', 'reassigned', 'note_added', 'evidence_attached', 'student_notified', 'guardian_notified', 'escalated')`,
    ),
    // A status change without a target is not a status change.
    check(
      "complaint_actions_status_pair",
      sql`${t.actionType} <> 'status_change' or (${t.toStatus} is not null and ${t.toStatus} <> ${t.fromStatus})`,
    ),
    // Nothing else may carry a from/to pair; those columns belong to status transitions only.
    check(
      "complaint_actions_status_columns_check",
      sql`${t.actionType} = 'status_change' or (${t.fromStatus} is null and ${t.toStatus} is null)`,
    ),
    check(
      "complaint_actions_note_check",
      sql`${t.actionType} <> 'note_added' or nullif(btrim(${t.details}), '') is not null`,
    ),
    check(
      "complaint_actions_assignment_check",
      sql`${t.actionType} not in ('assigned', 'reassigned') or ${t.actorUserId} is not null`,
    ),
  ],
);

/**
 * `complaint_visibility` — explicit grants.
 *
 * ## Why this exists at all
 *
 * MODULE 25 requires the workflow to follow permissions, and the workflow is: a teacher raises a complaint,
 * a coordinator or head investigates it, and a decision is recorded. Those first two are automatic. But a
 * pastoral-care lead, a school counsellor, or a class teacher who is not the raiser all need access in real
 * schools, and none of them is "the raiser" or "the assignee".
 *
 * Granting per complaint rather than per role is the point: access to one sensitive complaint is not the
 * same authority as access to all of them, and a role-wide grant cannot express "this one".
 *
 * `grantedByUserId` is not nullable because an unbacked grant has no audit trail, and `RULES.md` §51 requires
 * one.
 */
export const complaintVisibility = pgTable(
  "complaint_visibility",
  {
    id: primaryId(),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    /** The person granted read access. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `full` reads actions too; `summary` reads only the complaint row. */
    accessLevel: varchar("access_level", { length: 8 }).notNull().default("summary"),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    /** Access ends. Null is an indefinite grant, which is normal for a counsellor. */
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: varchar("reason", { length: 300 }),
  },
  (t) => [
    // One live grant per (complaint, person). Revocation sets `revokedAt` rather than deleting, so the
    // grant history survives and a re-grant is a new row — the same pattern as `user_permissions`.
    uniqueIndex("complaint_visibility_unique")
      .on(t.complaintId, t.userId)
      .where(sql`${t.revokedAt} is null`),
    index("complaint_visibility_user_idx").on(t.userId, t.revokedAt, t.expiresAt),
    index("complaint_visibility_complaint_idx").on(t.complaintId),
    check("complaint_visibility_level_check", sql`${t.accessLevel} in ('summary', 'full')`),
    check(
      "complaint_visibility_expiry_check",
      sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.grantedAt}`,
    ),
    check(
      "complaint_visibility_revocation_pair",
      sql`num_nonnulls(${t.revokedAt}, ${t.revokedByUserId}) in (0, 2)`,
    ),
  ],
);

/**
 * `complaint_attachments` — evidence.
 *
 * A complaint with evidence is a different kind of object from a complaint without it, and `RULES.md` §43
 * requires the historical context to stay intact: an attachment is never deleted when it is superseded, it is
 * replaced. `supersedesAttachmentId` is that chain, and `isCurrent` is the flag that keeps the current
 * document obvious.
 *
 * `checksumSha256` is stored because evidence has to be provable. A parent disputing a complaint months
 * later needs to know the file that was attached at the time has not changed; a storage key alone does not
 * prove that.
 */
export const complaintAttachments = pgTable(
  "complaint_attachments",
  {
    id: primaryId(),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    /** `photo`, `video`, `audio`, `document`, `statement`, `other`. */
    attachmentType: varchar("attachment_type", { length: 16 }).notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    /** Opaque storage key. `ARCHITECTURE.md` §51: no bytes in PostgreSQL. */
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    contentType: varchar("content_type", { length: 120 }),
    sizeBytes: integer("size_bytes"),
    /** Proof the evidence has not been altered since upload. See the note above. */
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    /** The attachment this one replaces. Self-reference. */
    supersedesAttachmentId: uuid("supersedes_attachment_id").references(
      (): AnyPgColumn => complaintAttachments.id,
      { onDelete: "set null" },
    ),
    /** Exactly one current document per attachment slot. */
    isCurrent: boolean("is_current").notNull().default(true),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true, precision: 3 }),
    withdrawnByUserId: uuid("withdrawn_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    withdrawalReason: text("withdrawal_reason"),
  },
  (t) => [
    index("complaint_attachments_complaint_idx").on(t.complaintId, t.isCurrent),
    index("complaint_attachments_supersedes_idx").on(t.supersedesAttachmentId),
    check(
      "complaint_attachments_type_check",
      sql`${t.attachmentType} in ('photo', 'video', 'audio', 'document', 'statement', 'other')`,
    ),
    check("complaint_attachments_size_check", sql`${t.sizeBytes} is null or ${t.sizeBytes} > 0`),
    // A SHA-256 digest is 64 hex characters, nothing else.
    check(
      "complaint_attachments_checksum_check",
      sql`${t.checksumSha256} is null or ${t.checksumSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    // An attachment cannot supersede itself.
    check(
      "complaint_attachments_self_reference_check",
      sql`${t.supersedesAttachmentId} is null or ${t.supersedesAttachmentId} <> ${t.id}`,
    ),
    // A current document cannot have been withdrawn, and a withdrawn one is not current.
    check(
      "complaint_attachments_current_check",
      sql`not (${t.isCurrent} and ${t.withdrawnAt} is not null)`,
    ),
    check(
      "complaint_attachments_withdrawal_pair",
      sql`num_nonnulls(${t.withdrawnAt}, ${t.withdrawnByUserId}) in (0, 2)`,
    ),
    check(
      "complaint_attachments_withdrawal_reason_check",
      sql`${t.withdrawnAt} is null or nullif(btrim(${t.withdrawalReason}), '') is not null`,
    ),
  ],
);

/**
 * `complaint_comments` — discussion, kept separate from actions.
 *
 * `complaint_actions` is the audited record of what happened to the complaint. This is a thread: internal
 * notes between the investigator and the coordinator, and questions to the student that need an answer.
 *
 * They are separate because they have different lifecycles. An action is written once and never edited; a
 * comment can be edited within a window, which is why `editedAt` and `editedByUserId` exist here and not on
 * `complaint_actions`.
 *
 * `isInternal` is the disclosure flag. `true` means staff-only — an investigator's working note about a
 * possible safeguarding matter is not something the family reads, and MODULE 25's "notifications must follow
 * permissions" is satisfied here by the same predicate that gates `complaint_actions.is_visible_to_student`.
 */
export const complaintComments = pgTable(
  "complaint_comments",
  {
    id: primaryId(),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** A reply to this comment. Self-reference; one level of nesting is enough for a complaint thread. */
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => complaintComments.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    /** `true` = staff only. The disclosure flag. See the note above. */
    isInternal: boolean("is_internal").notNull().default(false),
    editedAt: timestamp("edited_at", { withTimezone: true, precision: 3 }),
    editedByUserId: uuid("edited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("complaint_comments_complaint_idx").on(t.complaintId, t.createdAt),
    index("complaint_comments_parent_idx").on(t.parentCommentId, t.createdAt),
    index("complaint_comments_author_idx").on(t.authorUserId, t.createdAt),
    check("complaint_comments_body_check", sql`nullif(btrim(${t.body}), '') is not null`),
    // A comment cannot reply to itself.
    check(
      "complaint_comments_self_reference_check",
      sql`${t.parentCommentId} is null or ${t.parentCommentId} <> ${t.id}`,
    ),
    check(
      "complaint_comments_edit_pair",
      sql`num_nonnulls(${t.editedAt}, ${t.editedByUserId}) in (0, 2)`,
    ),
  ],
);
