/**
 * Authorization: roles, permissions, and the grants that connect them to users.
 *
 * Implements the model fixed by `adr/0001-authorization-model.md` and closes `DOMAIN-MODEL.md`
 * defect G-6 (the archived schema modelled authorization twice — a `User.role` string *and*
 * `Role`/`Permission` tables — which could disagree, and neither could express scope).
 *
 * The mechanism is fixed; only the model is designed here. `RULES.md` §19 requires enforcement in
 * the application layer, never in a UI component, and `src/shared/authorization/permissions.ts`
 * already holds the typed `PermissionKey` list these tables are seeded from.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
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
  description,
  primaryId,
  shortName,
  slug,
  updatedAt,
  version,
} from "./_conventions";
import { users } from "./identity";
import { institutions } from "./institution";

/**
 * `permissions` — the atom of authorization.
 *
 * `key` is a dotted, action-oriented string (`attendance.mark`, `fees.refund`). It is seeded from
 * `PERMISSION_KEYS` in `src/shared/authorization/permissions.ts`, which makes a typo a compile
 * error rather than a permission that silently never matches.
 *
 * **The database cannot enforce that membership**, only that keys are unique and well-formed: a seed
 * step plus `permissions.key_check` is the control. `src/db/schema/authorization.test.ts` asserts
 * the constant and the check constraint describe the same set, so the two cannot drift unnoticed.
 */
export const permissions = pgTable(
  "permissions",
  {
    id: primaryId(),
    /** Never shown to users — `permissions.describe` supplies the human-readable label (`PRD.md` §13). */
    key: varchar("key", { length: 64 }).notNull(),
    describe: text("describe").notNull(),
    /** Non-null for permissions that only make sense inside one institution's data. */
    institutionId: uuid("institution_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("permissions_key_key").on(t.key),
    // Shape check: at least two dot-separated lowercase segments. Catches `"attendance mark"`,
    // `"Attendance.Mark"` and `"mark"`, which would all be unreachable by a `PERMISSION_KEYS` lookup.
    check("permissions_key_check", sql`${t.key} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'`),
  ],
);

/**
 * `roles` — a named bundle of permissions.
 *
 * `institutionId` is nullable by design (ADR-0001): a null `institution_id` is a platform role, and
 * a non-null one is defined by a single institution. That is how Super Administrator is expressed
 * without a `isSuperAdmin` boolean on `users`, which would be unreviewable and unrevocable in
 * isolation.
 *
 * `slug` is the URL segment (`/admin/roles/fee-officer`), per `RULES.md` §24.
 */
export const roles = pgTable(
  "roles",
  {
    id: primaryId(),
    /** Null for platform roles. */
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "cascade",
    }),
    name: shortName("name"),
    slug: slug(64),
    description: description(),
    /** Built-in roles cannot be renamed or deleted, only granted. */
    isSystemRole: boolean("is_system_role").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    // Partial unique: the same slug may exist at platform level and per institution, but not twice
    // in one institution. PostgreSQL treats NULLs as distinct, so a plain unique index would fail to
    // constrain the platform-level case at all.
    uniqueIndex("roles_slug_institution_key")
      .on(t.institutionId, t.slug)
      .where(sql`${t.institutionId} is not null`),
    uniqueIndex("roles_system_slug_key")
      .on(t.slug)
      .where(sql`${t.institutionId} is null`),
    index("roles_institution_idx").on(t.institutionId),
  ],
);

/**
 * `role_permissions` — role → capability.
 *
 * A composite primary key with no surrogate: the pair *is* the identity, so a duplicate grant is
 * unrepresentable rather than merely discouraged.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    /** Who granted it. A permission change without an attributable actor is unauditable (`RULES.md` §51). */
    grantedByUserId: uuid("granted_by_user_id"),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index("role_permissions_permission_idx").on(t.permissionId),
  ],
);

/**
 * `user_roles` — user → role.
 *
 * Many-to-many, per ADR-0001: "a user may hold several roles". `grantedAt`/`grantedByUserId` exist
 * because revoking access without knowing who granted it leaves `RULES.md` §51 unsatisfiable — the
 * audit trail is what makes an access review possible.
 *
 * Granting a role scoped to one institution is constrained by `institution_id` here rather than
 * derived from the role, so a role held "at Scholar School" is distinguishable from one held
 * platform-wide even when the role itself is institution-specific.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    /**
     * A surrogate id, **not** a composite key on `(user_id, role_id, institution_id)`.
     *
     * Two requirements forced this. A PostgreSQL `PRIMARY KEY` makes every one of its columns `NOT
     * NULL`, so a composite key over `institution_id` would make the platform-wide grant — the
     * documented meaning of `null` — unrepresentable. And revoking a grant must leave its row in place
     * as history (`RULES.md` §51) while allowing the same grant to be made again later, which a key
     * containing the triple cannot permit either. So the pair of *live* grants is protected by a
     * partial unique index below instead, and history accumulates as extra rows.
     */
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    /** Null = the role applies platform-wide. */
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "cascade",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // At most one *live* grant per (user, role, institution). `revoked_at is null` is the live
    // condition; `authorization.test.ts` asserts a revoked grant and a re-grant coexist.
    uniqueIndex("user_roles_live_grant_key")
      .on(t.userId, t.roleId, t.institutionId)
      .where(sql`${t.revokedAt} is null and ${t.institutionId} is not null`),
    // The same uniqueness for platform-wide grants. A plain unique index cannot cover both cases at
    // once, because PostgreSQL treats every NULL as distinct from every other NULL — which would let a
    // user hold "Platform Admin" any number of times.
    uniqueIndex("user_roles_live_global_key")
      .on(t.userId, t.roleId)
      .where(sql`${t.revokedAt} is null and ${t.institutionId} is null`),
    index("user_roles_role_idx").on(t.roleId),
    index("user_roles_user_active_idx").on(t.userId, t.revokedAt),
    index("user_roles_institution_active_idx").on(t.institutionId, t.roleId, t.revokedAt),
    // Revocation is an event with an actor, not just a flag. `RULES.md` §51 is unsatisfiable otherwise.
    check(
      "user_roles_revocation_pair",
      sql`num_nonnulls(${t.revokedAt}, ${t.revokedByUserId}) in (0, 2)`,
    ),
  ],
);

/**
 * `user_permissions` — direct grants, bypassing roles.
 *
 * `PHASES.md` §12 task 5 requires them and ADR-0001 calls them out. Two effects, both deliberate:
 * a grant **adds** capability, and a revocation with `effect = 'deny'` **subtracts** it, so a direct
 * grant can override a role in both directions.
 *
 * `effect` rather than two tables (`user_permission_grants` / `_denials`) so that a review screen can
 * show one user's complete direct-permission picture with one query, in order. It is a `check`, not
 * an enum, because the set is this one column's own vocabulary.
 */
export const userPermissions = pgTable(
  "user_permissions",
  {
    /** A surrogate id, for the same reason as `user_roles.id` — see the note there. */
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    /** `grant` adds the capability a role may not carry; `deny` removes one a role does. */
    effect: varchar("effect", { length: 8 }).notNull(),
    /** Scope of the exception: null = every institution this user can reach. */
    institutionId: uuid("institution_id").references(() => institutions.id, {
      onDelete: "cascade",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** A required justification. `RULES.md` §37: a manual override without a reason is unauditable. */
    reason: text("reason"),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // Live-only uniqueness, with the same NULL caveat and the same re-grant requirement as
    // `user_roles`. A `deny` is as live as a `grant`, so it is inside the `revoked_at is null` filter.
    uniqueIndex("user_permissions_live_grant_key")
      .on(t.userId, t.permissionId, t.institutionId)
      .where(sql`${t.revokedAt} is null and ${t.institutionId} is not null`),
    uniqueIndex("user_permissions_live_global_key")
      .on(t.userId, t.permissionId, t.effect)
      .where(sql`${t.revokedAt} is null and ${t.institutionId} is null`),
    index("user_permissions_permission_idx").on(t.permissionId),
    index("user_permissions_user_active_idx").on(t.userId, t.revokedAt),
    check("user_permissions_effect_check", sql`${t.effect} in ('grant', 'deny')`),
    check(
      "user_permissions_deny_requires_reason",
      sql`${t.effect} <> 'deny' or ${t.reason} is not null`,
    ),
    check(
      "user_permissions_revocation_pair",
      sql`num_nonnulls(${t.revokedAt}, ${t.revokedByUserId}) in (0, 2)`,
    ),
  ],
);

/**
 * `permission_scopes` — which resources a capability is confined to.
 *
 * `ADR-0001` §2 is explicit that scope is *separate* from capability, and gives four mechanisms:
 * teaching assignment, guardian link, self, and `institutionId`. Three of those four are rows
 * elsewhere (`teaching_assignments`, `guardian_links`, and the authenticated principal), and this
 * table carries the fourth case — an administrative scope such as "this Accountant may view fees
 * for Class 9 only" that is not expressible as a teaching or guardian relationship.
 *
 * `scope_type` is a discriminator because a scope points at different tables per kind; a single
 * nullable set of four id columns would be four mostly-null columns per row. `ARCHITECTURE.md` §9
 * keeps this cross-domain reference to a discriminator plus an id, resolved by the owning module
 * rather than by a join here.
 */
export const permissionScopes = pgTable(
  "permission_scopes",
  {
    id: primaryId(),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    /** Exactly one of `role_id` or `user_id` is set — a scope attaches to a role or to a person. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    /** `institution`, `department`, `class`, `group`, `section`, `subject`. */
    scopeType: varchar("scope_type", { length: 32 }).notNull(),
    /** Id within `scope_type`. Not a foreign key: this is the cross-domain boundary of §9. */
    scopeId: uuid("scope_id").notNull(),
    createdAt: createdAt(),
    /** Free-form guard context, e.g. `{"includeArchived": true}`. Opaque to the database. */
    conditions: jsonb("conditions").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("permission_scopes_role_idx").on(t.roleId),
    index("permission_scopes_user_idx").on(t.userId),
    // A scope must attach to exactly one owner, or a later resolver cannot tell whose it is.
    check("permission_scopes_single_owner_check", sql`num_nonnulls(${t.roleId}, ${t.userId}) = 1`),
    check(
      "permission_scopes_scope_type_check",
      sql`${t.scopeType} in ('institution', 'department', 'class', 'group', 'section', 'subject')`,
    ),
    uniqueIndex("permission_scopes_unique")
      .on(t.roleId, t.permissionId, t.scopeType, t.scopeId)
      .where(sql`${t.roleId} is not null`),
    // The same uniqueness for a scope attached to a person. Two partial indexes rather than one,
    // because NULLs compare as distinct in a plain unique index — which would make the user-side
    // duplicate above completely unenforced.
    uniqueIndex("permission_scopes_user_unique")
      .on(t.userId, t.permissionId, t.scopeType, t.scopeId)
      .where(sql`${t.userId} is not null`),
  ],
);
