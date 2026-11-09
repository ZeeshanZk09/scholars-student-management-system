/**
 * One-off backfill: insert the Phase 10 `finance.*` permission rows (and the role grants that
 * belong with them) into a database that was seeded before those keys existed.
 *
 * `pnpm db:seed` would create them, but the live seed also rotates the platform admin's password
 * and is not safe to re-run against a working database (see MEMORY.md). This script is idempotent:
 * it inserts only missing `permissions` rows and only missing `role_permissions` rows, keyed on
 * `(key)` and `(role, permission)` respectively, and touches nothing else. It is safe to run
 * repeatedly and safe to delete once every environment has been re-seeded from scratch.
 *
 * Usage: pnpm tsx scripts/backfill-finance-permissions.ts
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, rolePermissions, roles } from "../src/db/schema/authorization";

const FINANCE_KEYS: ReadonlyArray<{ key: string; describe: string }> = [
  {
    key: "finance.view",
    describe: "View the institute ledger, accounts and financial summaries",
  },
  {
    key: "finance.record",
    describe: "Book expenses and other income in the ledger",
  },
  {
    key: "finance.manage",
    describe: "Approve expenses and manage financial accounts",
  },
  {
    key: "finance.adjust",
    describe: "Reverse posted financial transactions",
  },
];

/** Which system role gains which finance keys — mirrors SYSTEM_ROLES in `seed.ts`. */
const ROLE_GRANTS: ReadonlyArray<{ slug: string; keys: readonly string[] }> = [
  // The administrator oversees the ledger but does not day-to-day book or reverse it.
  { slug: "admin", keys: ["finance.view", "finance.manage"] },
  // The accountant's whole job (PRD §21): every finance key, and nothing else changes here.
  {
    slug: "accountant",
    keys: ["finance.view", "finance.record", "finance.manage", "finance.adjust"],
  },
];

async function main(): Promise<void> {
  const existingRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(
      inArray(
        permissions.key,
        FINANCE_KEYS.map((entry) => entry.key),
      ),
    );
  const existingByKey = new Map(existingRows.map((row) => [row.key, row.id]));

  const missing = FINANCE_KEYS.filter((entry) => !existingByKey.has(entry.key));
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
        FINANCE_KEYS.map((entry) => entry.key),
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
      console.warn(`role \`${grant.slug}\` not found — skipping its finance grants`);
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
    `finance permissions: ${missing.length} inserted, ${FINANCE_KEYS.length - missing.length} already present`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
