/**
 * Institution: the tenant root, its campuses, buildings, floors, departments and designations.
 *
 * `PRD.md` MODULE 4 requires all of these as first-class entities, and `ARCHITECTURE.md` §16 makes
 * `Building → Floor` the top of the scheduling chain — floor is not decoration, it is how a
 * physical double-booking is detected.
 *
 * This file imports nothing but `_conventions`/`_enums` and is therefore at the bottom of the
 * dependency graph: everything institution-scoped can reference `institutions.id` without a cycle.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  archivedAt,
  createdAt,
  description,
  emailAddress,
  phoneNumber,
  primaryId,
  shortName,
  slug,
  updatedAt,
  version,
  webUrl,
} from "./_conventions";
import { institutionKindEnum } from "./_enums";

/**
 * `institutions` — the tenant root.
 *
 * Every other domain record carries `institution_id`, so this is the row a scope check compares
 * against (`ADR-0001` §2, "Institution" scope).
 *
 * **`code` is nullable and uniquely indexed.** That combination is deliberate: it is the one case
 * where a unique index tolerates NULL, so an institution may be created before a short code has been
 * allocated without a placeholder value, while two institutions can still never share a code.
 *
 * `isCurrent`-style activation lives on `academic_sessions`, not here — "active institution" is not
 * a fact about a tenant, it is a fact about which of its academic sessions is running.
 */
export const institutions = pgTable(
  "institutions",
  {
    id: primaryId(),
    name: shortName("name"),
    slug: slug(80),
    /** Optional. See the note above on why null is allowed and still unique. */
    code: varchar("code", { length: 32 }),
    kind: institutionKindEnum("kind").notNull().default("school"),
    email: emailAddress(),
    phone: phoneNumber(),
    address: varchar("address", { length: 500 }),
    website: webUrl("website"),
    logoUrl: webUrl("logo_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("institutions_code_key").on(t.code),
    uniqueIndex("institutions_slug_key").on(t.slug),
    check("institutions_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

/**
 * `campuses` — a physical site of one institution.
 *
 * Separate from `institutions` because `PRD.md` MODULE 4 asks for separate operational contexts, and
 * because attendance, scheduling and fee configuration are per campus in a multi-site institution.
 * A single-campus institution simply has one row.
 */
export const campuses = pgTable(
  "campuses",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(64),
    address: varchar("address", { length: 500 }),
    phone: phoneNumber(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("campuses_institution_slug_key").on(t.institutionId, t.slug),
    index("campuses_institution_idx").on(t.institutionId),
  ],
);

/**
 * `buildings` — a named structure on a campus.
 *
 * The top of the physical scheduling chain (`ARCHITECTURE.md` §16). Present because a floor conflict
 * is only meaningful once you know which building the floor is in.
 */
export const buildings = pgTable(
  "buildings",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** Null for a campus with one unnamed building; uniqueness is then per institution. */
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(64),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("buildings_campus_slug_key").on(t.campusId, t.slug),
    uniqueIndex("buildings_institution_slug_key").on(t.institutionId, t.slug),
    index("buildings_institution_idx").on(t.institutionId),
  ],
);

/**
 * `floors` — a level within a building.
 *
 * `floor_incharge` assignments hang off this: `PRD.md` MODULE 17 makes the Floor-Incharge an
 * operational scope over floors, and `permissions.scope_type` includes `department` for the
 * non-physical equivalent.
 */
export const floors = pgTable(
  "floors",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "cascade" }),
    name: shortName("name"),
    /** Sort key. "Ground", "1", "2" sort lexicographically; this column makes the order explicit. */
    level: integer("level").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("floors_building_name_key").on(t.buildingId, t.name),
    index("floors_institution_idx").on(t.institutionId),
  ],
);

/**
 * `departments` — an organisational or academic department.
 *
 * Used for HR (`PRD.md` MODULE 8) and for notification targeting (`PRD.md` MODULE 26, audience by
 * department). Distinct from `subjects`: a department is an organisation, a subject is something
 * taught.
 */
export const departments = pgTable(
  "departments",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(64),
    description: description(),
    /**
     * Head of department. Bare uuid on purpose: `identity` imports `institution`, so a foreign key
     * from here to `users` would close a loop in the module import graph. See the module-cycle
     * allowlist in `schema-contract.test.ts`.
     */
    headUserId: uuid("head_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("departments_institution_slug_key").on(t.institutionId, t.slug),
    index("departments_institution_idx").on(t.institutionId),
  ],
);

/**
 * `designations` — a job title.
 *
 * `PRD.md` MODULE 4/8. Kept as data rather than as an employee enum because titles are institutional:
 * "Head of Department", "Senior Mathematics Instructor" and "Accounts Clerk" differ per institution
 * and must be printable, filterable and orderable by name, not hardcoded.
 */
export const designations = pgTable(
  "designations",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(64),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("designations_institution_slug_key").on(t.institutionId, t.slug),
    index("designations_department_idx").on(t.departmentId),
  ],
);

/**
 * `academic_sessions` — one academic year / session of an institution.
 *
 * This is the table that makes academic history representable. `DOMAIN-MODEL.md` §2 requires the
 * chain `Institution → Academic Session → Class → Group → Section → Student`, and D-2 requires
 * placement to be recorded per session so a promotion adds a row rather than overwriting one.
 *
 * ## Why `is_current` is a boolean here and not a lookup
 *
 * `MEMORY.md` §7 records that the archived design used `AcademicSession.isCurrent` to mark the
 * active session. A boolean cannot be enforced by the database: two rows can both have it. So the
 * boolean is kept — it is the cheap read path for every list screen — **and** a partial unique index
 * makes the invariant real. That combination is the difference between a convention and a
 * constraint, and it is the fix for the "two current sessions" class of bug.
 *
 * `closed_at` is `RULES.md` §44: a completed session becomes read-only history, and ordinary users
 * must not modify it. `date` columns (not timestamps) because an academic session is bounded by
 * calendar dates, not instants.
 */
export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(64),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    /**
     * When the session was closed to ordinary writes. Non-null means historical and read-only
     * (`RULES.md` §44); the database cannot enforce read-only, so this is the signal the application
     * and every write use case check.
     */
    closedAt: timestamp("closed_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("academic_sessions_institution_name_key").on(t.institutionId, t.name),
    // The invariant: at most one current session per institution.
    uniqueIndex("academic_sessions_one_current_key")
      .on(t.institutionId)
      .where(sql`${t.isCurrent} = true`),
    check("academic_sessions_date_order_check", sql`${t.endDate} >= ${t.startDate}`),
  ],
);
