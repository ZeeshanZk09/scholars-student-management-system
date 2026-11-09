/**
 * Guardians and their links to students.
 *
 * `PRD.md` MODULE 5 requires guardians and students to be **many-to-many**: one guardian may have
 * several children (siblings, a ward), one student may have a father, a mother and a legal guardian.
 * `ADR-0004` fixes the shape and this file implements it.
 *
 * ## A guardian is a `User`, not a parallel table of people
 *
 * `ADR-0004` §1: a guardian is a `users` row that authenticates, plus a `guardians.guardians` profile
 * holding what only a guardian has (occupation, relationship preferences). There is deliberately no
 * second identity table — two identity tables would mean two login flows, two lockout states and two
 * places for an account to be "active", and the guardian portal (`PRD.md` MODULE 12) is an
 * authenticated screen.
 *
 * The consequence is that `guardians.userId` is `NOT NULL` and unique: exactly one profile per
 * account. A guardian who is also a member of staff has one `users` row and two profiles — a
 * `guardians` row and an `employees` row — which is why nothing here references `employees` and
 * nothing there references `guardians`.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  createdAt,
  emailAddress,
  personName,
  phoneNumber,
  primaryId,
  updatedAt,
  version,
} from "./_conventions";
import { guardianContactTypeEnum, guardianRelationshipEnum } from "./_enums";
import { users } from "./identity";
import { students } from "./student";

/**
 * `guardians` — the guardian profile attached to a `users` row.
 *
 * **No `institution_id`,** unlike almost every other table here, and that is ADR-0004 §2: a guardian
 * profile is a *person*, not an institutional record. A mother with children at two schools of the
 * same group is one person with one profile; her access to either school comes from
 * `guardian_links`, and her scope at each school comes from `users_roles` / the link itself. Putting
 * `institution_id` here would force a second profile row per institution and make the login identity
 * ambiguous — which is defect G-11 in the archived design.
 *
 * `occupation` is here, not on `users`, because it is guardian-specific and has no meaning for a
 * teacher or an accountant.
 */
export const guardians = pgTable(
  "guardians",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    firstName: personName("first_name"),
    lastName: personName("last_name"),
    email: emailAddress(),
    phone: phoneNumber(),
    occupation: varchar("occupation", { length: 120 }),
    address: varchar("address", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("guardians_phone_key").on(t.phone),
    index("guardians_name_search_idx").on(t.lastName, t.firstName),
  ],
);

/**
 * `guardian_links` — guardian ↔ student, with the relationship.
 *
 * The many-to-many join of ADR-0004. Three columns carry the whole authorisation model for the parent
 * portal, and each is deliberate:
 *
 * - `relationship` lives on the **link**, not on the guardian. The same adult is a `father` to one
 *   child and a `legal_guardian` to another; a relationship attribute on `guardians` would force one
 *   to be wrong.
 * - `contact_type` lives on the link for the same reason. "Who do we ring in an emergency?" is a
 *   property of this pairing.
 * - `is_active` is an explicit flag, not an inference from dates, because a guardian's access to a
 *   child's record must be revocable **immediately** on a custody change while the link row itself is
 *   kept as history.
 *
 * The composite primary key is the pair: re-linking the same guardian to the same student is not a
 * meaningful second event, and allowing it would create two "primary" contacts.
 */
export const guardianLinks = pgTable(
  "guardian_links",
  {
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => guardians.userId, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    relationship: guardianRelationshipEnum("relationship").notNull(),
    contactType: guardianContactTypeEnum("contact_type"),
    /** Set when this guardian also owes fees. `PRD.md` MODULE 6 assigns fee responsibility explicitly. */
    isFeePayer: boolean("is_fee_payer").notNull().default(false),
    /** Revoked immediately on a custody change, while the row survives as evidence. */
    isActive: boolean("is_active").notNull().default(true),
    /** Set to false when the guardian may see the record but must not receive notifications. */
    receivesNotifications: boolean("receives_notifications").notNull().default(true),
    linkedAt: timestamp("linked_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    linkedByUserId: uuid("linked_by_user_id"),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true, precision: 3 }),
    unlinkedByUserId: uuid("unlinked_by_user_id"),
    unlinkReason: varchar("unlink_reason", { length: 500 }),
  },
  (t) => [
    primaryKey({ columns: [t.guardianUserId, t.studentId] }),
    index("guardian_links_student_idx").on(t.studentId, t.isActive),
    index("guardian_links_guardian_idx").on(t.guardianUserId, t.isActive),
    // A student has at most one primary contact. Without this, "call the primary guardian" is
    // ambiguous and the emergency path in PRD.md MODULE 5 has no defined target.
    uniqueIndex("guardian_links_one_primary_key")
      .on(t.studentId)
      .where(sql`${t.contactType} = 'primary' and ${t.isActive} = true`),
  ],
);

/**
 * `guardian_authorizations` — a guardian's consent to do something for a student.
 *
 * ADR-0004 §3 and `PRD.md` MODULE 5 (e.g. a parent authorising a field trip). Separate from
 * `permission_scopes` because this is **consent granted to a guardian**, not a capability held by
 * staff: a guardian never appears in `users_roles`, and modelling consent as a permission would give
 * guardians the whole staff authorization machinery and a place in the role editor.
 *
 * `scope` is a free-text description of what is authorised, not a foreign key to a feature: the set of
 * authorisable actions is owned by whichever module introduces them, and a check here would need to be
 * re-migrated every time one is added.
 */
export const guardianAuthorizations = pgTable(
  "guardian_authorizations",
  {
    id: primaryId(),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => guardians.userId, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    /** e.g. `field_trip`, `medical_treatment`, `fee_payout`. Owned by the requesting module. */
    scope: varchar("scope", { length: 64 }).notNull(),
    /** Granted by the institution; revoked by it. `expires_at` covers time-limited consents. */
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }),
    grantedByUserId: uuid("granted_by_user_id").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    revokedByUserId: uuid("revoked_by_user_id"),
    notes: text("notes"),
  },
  (t) => [
    index("guardian_authorizations_student_idx").on(t.studentId, t.scope),
    index("guardian_authorizations_guardian_idx").on(t.guardianUserId),
    check(
      "guardian_authorizations_expiry_check",
      sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.grantedAt}`,
    ),
  ],
);

/**
 * `student_guardian_snapshot` — what the system told the guardian, and whether they saw it.
 *
 * This exists because of a concrete requirement, not a hypothetical one: `PRD.md` MODULE 22 sends the
 * guardian **exactly one** monthly report, and MODULE 23/24 diary entries are addressed to a
 * specific guardian. "Did this parent receive it?" cannot be answered from the notification tables
 * alone — it needs the pairing of (student, guardian, period) that was actually sent, plus which of
 * several guardians it went to.
 *
 * It is a **denormalised delivery record**, not a second source of truth for fees or attendance: the
 * amounts live in `fees`/`attendance`, and `periodStart`/`periodEnd` are the bounds used to select
 * them. Storing the totals as well would let a report and a ledger disagree, which is the one thing
 * ADR-0003 exists to prevent.
 */
export const studentGuardianSnapshots = pgTable(
  "student_guardian_snapshots",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => guardians.userId, { onDelete: "cascade" }),
    /** `monthly_report`, `diary`, `result_card`, `fee_invoice`. */
    reportType: varchar("report_type", { length: 32 }).notNull(),
    /** The reporting window the contents were selected for. Null = not period-bounded. */
    periodStart: varchar("period_start", { length: 32 }),
    periodEnd: varchar("period_end", { length: 32 }),
    sentAt: timestamp("sent_at", { withTimezone: true, precision: 3 }),
    /** The exact row in `notifications`/`emails`, so a failure can be retried and audited once. */
    notificationId: uuid("notification_id"),
    /** Idempotency key. This is what makes "exactly one" (`PRD.md` MODULE 22) enforceable: a second
     * attempt with the same key is rejected by the unique index instead of sending a second e-mail. */
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("student_guardian_snapshots_idempotency_key").on(t.idempotencyKey),
    index("student_guardian_snapshots_guardian_idx").on(t.guardianUserId, t.reportType, t.sentAt),
    index("student_guardian_snapshots_student_idx").on(t.studentId, t.reportType),
  ],
);

/**
 * `emergency_contacts` — who to ring, in order, for one student.
 *
 * `PRD.md` MODULE 5 asks for emergency contact 1 and 2. Modelled as an ordered list with
 * `priority` rather than two nullable columns, because a third contact is a schema change otherwise,
 * and a check on `priority > 0` plus a unique index per student keeps the ordering single-valued.
 *
 * `phone` is denormalised from `guardian_links` deliberately: an emergency contact must still be
 * callable after a profile edit, and the value that was verified at the time of registration is the
 * one that matters.
 */
export const emergencyContacts = pgTable(
  "emergency_contacts",
  {
    id: primaryId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    guardianUserId: uuid("guardian_user_id").references(() => guardians.userId, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 160 }).notNull(),
    phone: phoneNumber(),
    /** 1 = first choice. Unique per student, so the order cannot be ambiguous. */
    priority: integer("priority").notNull().default(1),
    relation: varchar("relation", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("emergency_contacts_student_priority_key").on(t.studentId, t.priority),
    check("emergency_contacts_priority_check", sql`${t.priority} > 0`),
    // A contact with no number cannot be dialled, so it is not a valid contact.
    check(
      "emergency_contacts_phone_required",
      sql`${t.phone} is not null or ${t.guardianUserId} is not null`,
    ),
  ],
);
