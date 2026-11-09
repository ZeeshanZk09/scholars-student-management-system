/**
 * The Drizzle implementation of {@link AuthorizationStore} — the only file in the authorization
 * module that imports `@/db/client` or the table objects.
 *
 * It answers "every live grant for this user, unscoped", leaving scope filtering to the domain
 * (`effective-permissions.ts`). Two queries, both gated on the live condition the schema defines
 * (`revoked_at is null`): role grants reach permissions through `role_permissions`, direct grants
 * through `user_permissions` directly. Revoked rows are audit history (`RULES.md` §51) and are
 * intentionally absent here.
 *
 * A key found in the database but missing from `PERMISSION_KEYS` — a leftover from a removed
 * permission — is dropped silently rather than asserted away: the code and the seed agree by
 * construction (`src/db/schema/authorization.ts` + the seed), and a stale row must never crash
 * authorization for a principal whose other grants are legitimate.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  permissions,
  rolePermissions,
  roles,
  userInstitutions,
  userPermissions,
  userRoles,
} from "@/db/schema";
import { isPermissionKey } from "@/shared/authorization";

import type { AuthorizationStore } from "../application/ports";
import type { DirectGrant, GrantScope, RoleGrant } from "../domain/effective-permissions";

/** A raw `institution_id` column value is the scope: `null` is platform. */
const toScope = (institutionId: string | null): GrantScope =>
  institutionId === null ? { kind: "platform" } : { kind: "institution", institutionId };

export const drizzleAuthorizationStore: AuthorizationStore = {
  async loadUserGrants({ userId }) {
    const roleRows = await db
      .select({
        key: permissions.key,
        institutionId: userRoles.institutionId,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));

    const directRows = await db
      .select({
        key: permissions.key,
        effect: userPermissions.effect,
        institutionId: userPermissions.institutionId,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(and(eq(userPermissions.userId, userId), isNull(userPermissions.revokedAt)));

    // The schema constrains `effect` to ('grant', 'deny'); the narrowing below keeps the
    // mapping total without trusting the driver's `string` typing alone.
    const isGrantEffect = (effect: string): effect is "grant" | "deny" =>
      effect === "grant" || effect === "deny";

    const roleGrants: RoleGrant[] = [];
    for (const row of roleRows) {
      if (isPermissionKey(row.key)) {
        roleGrants.push({ key: row.key, scope: toScope(row.institutionId) });
      }
    }

    const directGrants: DirectGrant[] = [];
    for (const row of directRows) {
      if (isPermissionKey(row.key) && isGrantEffect(row.effect)) {
        directGrants.push({
          key: row.key,
          effect: row.effect,
          scope: toScope(row.institutionId),
        });
      }
    }

    return { roleGrants, directGrants };
  },

  async listUserInstitutions({ userId }) {
    const rows = await db
      .select({ institutionId: userInstitutions.institutionId })
      .from(userInstitutions)
      .where(eq(userInstitutions.userId, userId));

    // `createdAt` is not part of the projection: callers only ever test membership or count, and
    // an unspecified-but-stable order keeps a fake and a real store indistinguishable in tests.
    return rows.map((row) => row.institutionId).sort();
  },
};
