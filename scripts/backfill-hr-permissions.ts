/**
 * One-off backfill: insert the Phase 11 `employees.*` permission rows (and the role grants that
 * belong with them) into a database that was seeded before those keys existed.
 *
 * `pnpm db:seed` would create them, but the live seed also rotates the platform admin's password
 * and is not safe to re-run against a working database (see MEMORY.md). This script is idempotent:
 * it inserts only missing `permissions` rows and only missing `role_permissions` rows, keyed on
 * `(key)` and `(role, permission)` respectively, and touches nothing else. It is safe to run
 * repeatedly and safe to delete once every environment has been re-seeded from scratch.
 *
 * Usage: pnpm tsx scripts/backfill-hr-permissions.ts
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, rolePermissions, roles } from "../src/db/schema/authorization";

const HR_KEYS: ReadonlyArray<{ key: string; describe: string }> = [
  {
    key: "employees.view",
    describe: "View the employee directory and HR records",
  },
  {
    key: "employees.create",
    describe: "Hire new employees",
  },
  {
    key: "employees.update",
    describe: "Edit employee records",
  },
  {
    key: "employees.manage",
    describe: "Manage salary structures, assignments and status transitions",
  },
];

/** Which system role gains which HR keys — mirrors SYSTEM_ROLES in `seed.ts`. */
const ROLE_GRANTS: ReadonlyArray<{ slug: string; keys: readonly string[] }> = [
  // HR runs the module end to end (PRD §21): every employees key.
  {
    slug: "hr",
    keys: ["employees.view", "employees.create", "employees.update", "employees.manage"],
  },
  // The administrator oversees staffing but the day-to-day act of hiring/editing sits with HR;
  // manage lets an admin run transitions and salary structures.
  {
    slug: "admin",
    keys: ["employees.view", "employees.create", "employees.update", "employees.manage"],
  },
  // The accountant and floor in-charge only read the directory (PRD §21 — who is on shift).
  { slug: "accountant", keys: ["employees.view"] },
  { slug: "floor-incharge", keys: ["employees.view"] },
];

async function main(): Promise<void> {
  const existingRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(
      inArray(
        permissions.key,
        HR_KEYS.map((entry) => entry.key),
      ),
    );
  const existingByKey = new Map(existingRows.map((row) => [row.key, row.id]));

  const missing = HR_KEYS.filter((entry) => !existingByKey.has(entry.key));
  if (missing.length > 0) {
    await db.insert(permissions).values(
      missing.map((entry) => ({
        key: entry.key,
        describe: entry.describe,
      })),
    );
  }

  const allRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(
      inArray(
        permissions.key,
        HR_KEYS.map((entry) => entry.key),
      ),
    );
  const keyToId = new Map(allRows.map((row) => [row.key, row.id]));

  for (const grant of ROLE_GRANTS) {
    const roleRows = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.slug, grant.slug), isNull(roles.institutionId)))
      .limit(1);
    const role = roleRows[0];
    if (role === undefined) {
      console.warn(`role \`${grant.slug}\` not found — skipping its employees grants`);
      continue;
    }
    const granted = await db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, role.id));
    const grantedIds = new Set(granted.map((row) => row.permissionId));
    const toGrant = grant.keys
      .map((key) => keyToId.get(key))
      .filter((id): id is string => id !== undefined && !grantedIds.has(id));
    if (toGrant.length > 0) {
      await db
        .insert(rolePermissions)
        .values(toGrant.map((permissionId) => ({ roleId: role.id, permissionId })));
    }
  }

  console.log(
    `employees permissions: ${missing.length} inserted, ${HR_KEYS.length - missing.length} already present`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
