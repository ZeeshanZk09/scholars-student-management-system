/**
 * Identity: users, credentials, sessions and token lifecycle.
 *
 * `ARCHITECTURE.md` §10 puts authentication in its own domain. `PHASES.md` Phase 3 owns *how* it
 * works — the mechanism is still an open decision and no auth package is installed (`MEMORY.md` §9),
 * so **nothing here depends on a library**. These are the tables an approved mechanism will write
 * to. Designing them now is required, not optional, because Phase 3 in this project's numbering
 * (`PHASES.md` §10) is the database phase and the authorization tables are shaped by them.
 *
 * ## No auth library may be assumed
 *
 * No credential hashing function, session token format, cookie attribute or cookie name is decided
 * in this file. Each is a documented decision with a named owner, recorded in `MEMORY.md` §16, and
 * guessing one here would be the exact "blind coding" `RULES.md` §4 forbids.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  archivedAt,
  createdAt,
  emailAddress,
  personName,
  phoneNumber,
  primaryId,
  updatedAt,
  webUrl,
} from "./_conventions";
import { userStatusEnum } from "./_enums";
import { institutions } from "./institution";

/**
 * `users` — one row per person who can authenticate.
 *
 * Platform-wide, so `institutionId` is null here by design (ADR-0001): a Super Administrator is not
 * owned by the institution they administer, and a user may legitimately hold roles at more than one
 * institution. Institution scoping is expressed by `user_roles` and by `institutionId` on the
 * domain records they touch.
 *
 * Note what is *absent*: there is no `role` string. That is `DOMAIN-MODEL.md` defect G-6, removed by
 * ADR-0001 in favour of `user_roles`. One account may hold several roles, and authorization is data.
 */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    /** Lower-cased. Uniqueness is case-insensitive via `users_email_lower_key` below. */
    email: emailAddress(),
    /** Display name. Distinct from `email`: a user may authenticate with an address they never see. */
    name: personName("name"),
    phone: phoneNumber(),
    /** Optional avatar. A URL, not a blob — `ARCHITECTURE.md` §51 keeps binary media out of the database. */
    imageUrl: webUrl("image_url"),
    status: userStatusEnum("status").notNull().default("invited"),
    /** Last successful authentication. Nullable, and updated by the auth mechanism, not by a profile form. */
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, precision: 3 }),
    /** Denormalised lockout state. See the note below on why this is here and not in a session table. */
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    // A login identity is case-insensitive: `Ali@x.com` and `ali@x.com` must not become two
    // accounts. `citext` would do this too, but a generated functional index keeps the base column
    // a plain `varchar` and needs no extension.
    uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`),
    index("users_status_idx").on(t.status),
  ],
);

/**
 * `user_credentials` — the hash, kept out of `users`.
 *
 * Separate so that a profile read (every page header) never selects a credential hash, and so that
 * "how many accounts have a usable credential" is a single indexed lookup. One row per user, which
 * is what makes the primary key `(user_id)` rather than a surrogate.
 *
 * **The algorithm is undecided.** `MEMORY.md` §16 records that no auth package is approved, and the
 * hash parameters live here as data (`algorithm`, `parameters`) rather than as a hardcoded constant
 * precisely so that choosing Argon2id over bcrypt later is a data change plus a verified migration,
 * not a code rewrite. Never store a plaintext or reversibly-encrypted password: `RULES.md` §23.
 */
export const userCredentials = pgTable(
  "user_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The encoded hash, in the algorithm's own self-describing format. Nullable precisely so that
     * an account with no credential is representable: an invited user exists before it has a
     * password, and "credential absent" is a real state rather than an empty string.
     */
    passwordHash: text("password_hash"),
    /** e.g. `argon2id`, `bcrypt`. Data, not a constant — see the note above. */
    algorithm: varchar("algorithm", { length: 64 }),
    /** Algorithm parameters as JSON (`memoryCost`, `iterations`, …) so they can be re-tuned. */
    parameters: jsonb("parameters").$type<Record<string, number>>(),
    /** Set on password change. A credential older than this must be re-verified (`security_events`). */
    rotatedAt: timestamp("rotated_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A credential without a hash is an invalid row, not an incomplete one.
    check(
      "user_credentials_hash_algorithm_pair",
      sql`(${t.passwordHash} is null and ${t.algorithm} is null) or (${t.passwordHash} is not null and ${t.algorithm} is not null)`,
    ),
  ],
);

/**
 * `sessions` — server-side session records.
 *
 * `PHASES.md` Phase 3 task 4 requires a session model, and `RULES.md` §23 forbids relying on a
 * stateless bearer token that cannot be revoked. A row per session is what makes "log out
 * everywhere" and "this device is revoked" (`RULES.md` §23) expressible at all.
 *
 * `token_hash` is hashed even though the cookie value is already high-entropy. A session table is
 * the single most attractive target in the database, and a leaked backup must not hand over live
 * sessions; the lookup is by hash so the plaintext never needs to be stored or compared.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie value. Never the value itself. */
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    /** Coarse client fingerprint for the "your devices" list. Advisory only — never an authorisation input. */
    userAgent: varchar("user_agent", { length: 512 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    issuedAt: timestamp("issued_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    /**
     * Non-null means revoked, and it is kept **in addition to** `expires_at` rather than by moving
     * `expiresAt`. Deleting the row would destroy the "was signed in from this device on this date"
     * evidence that `RULES.md` §51 requires of login events.
     */
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    /** Why it was revoked: `logout`, `password_changed`, `admin_revoked`, `rotated`. */
    revokedReason: varchar("revoked_reason", { length: 64 }),
    /**
     * Ties the session to the audit and log lines for the request that created it
     * (`src/shared/logging/audit.ts` carries the same id on `correlationId`).
     */
    correlationId: varchar("correlation_id", { length: 64 }),
  },
  (t) => [
    // The whole lookup path: "given a cookie, is there a live session for this user".
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_active_idx").on(t.userId, t.expiresAt),
    check("sessions_expiry_after_issue", sql`${t.expiresAt} > ${t.issuedAt}`),
  ],
);

/**
 * `security_events` — password, verification and reset tokens, plus account-security actions.
 *
 * One table rather than three because they share a shape (hashed single-use token, expiry, consumed
 * timestamp) and the security posture is identical: single use, expiring, never logged. `PHASES.md`
 * Phase 3 tasks 9–11 all write here.
 *
 * `kind` is a `varchar` with a `check` rather than a `pgEnum` on purpose: this list grows as auth
 * features do, and adding a value must not require touching an enum that ten other tables' data
 * would have to be revalidated against. The check still makes an unlisted value impossible.
 */
export const securityEvents = pgTable(
  "security_events",
  {
    id: primaryId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** One of the values in the `security_events_kind_check` constraint below. */
    kind: varchar("kind", { length: 32 }).notNull(),
    /** Hash of the emailed token. The plaintext exists only in the recipient's inbox. */
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    /** Non-null once used. The single-use guard is enforced in a transaction, not by this column. */
    consumedAt: timestamp("consumed_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    /**
     * Request context for an abuse investigation: which IP asked, which client. `RULES.md` §52
     * forbids logging secrets, and this is not one.
     */
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 512 }),
  },
  (t) => [
    uniqueIndex("security_events_token_hash_key").on(t.tokenHash),
    index("security_events_user_kind_idx").on(t.userId, t.kind),
    check(
      "security_events_kind_check",
      sql`${t.kind} in ('email_verification', 'password_reset', 'email_change', 'two_factor_setup')`,
    ),
  ],
);

/**
 * `user_institutions` — the institutions a platform user belongs to.
 *
 * Distinct from `user_roles`: a role is *what you may do*, this is *where you may do it*. A teacher
 * employed by one institution and teaching a class in another holds two `user_roles` rows and one
 * `user_institutions` row per affiliation, and the second role's scope is checked against the
 * second affiliation. Without this table, `users.institutionId` would have to be single-valued and
 * the affiliation would be lost.
 */
export const userInstitutions = pgTable(
  "user_institutions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** `staff`, `guardian`, `student`, `management` — the relationship, not a permission set. */
    affiliation: varchar("affiliation", { length: 32 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.institutionId] }),
    index("user_institutions_institution_idx").on(t.institutionId),
    check(
      "user_institutions_affiliation_check",
      sql`${t.affiliation} in ('staff', 'guardian', 'student', 'management')`,
    ),
  ],
);
