/**
 * One-off backfill: insert the Phase 12 `payroll.*` permission rows (and the role grants that
 * belong with them) into a database that was seeded before those keys existed.
 *
 * `pnpm db:seed` would create them, but the live seed also rotates the platform admin's password
 * and is not safe to re-run against a working database (see MEMORY.md). This script is idempotent:
 * it inserts only missing `permissions` rows and only missing `role_permissions` rows, keyed on
 * `(key)` and `(role, permission)` respectively, and touches nothing else. It is safe to run
 * repeatedly and safe to delete once every environment has been re-seeded from scratch.
 *
 * Usage: pnpm tsx scripts/backfill-payroll-permissions.ts
 */
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, rolePermissions, roles } from "../src/db/schema/authorization";

const PAYROLL_KEYS: ReadonlyArray<{ key: string; describe: string }> = [
  { key: "payroll.view", describe: "View payroll runs, payslips and salary history" },
  { key: "payroll.calculate", describe: "Calculate payroll runs and apply manual adjustments" },
  { key: "payroll.approve", describe: "Approve payroll runs and close payroll periods" },
  { key: "payroll.process", describe: "Process salary payments into the ledger" },
];

/**
 * Which system role gains which payroll keys — mirrors `SYSTEM_ROLES` in `seed.ts`.
 *
 * The split is deliberate: `admin` and `hr` prepare and amend a run, and only `accountant` may
 * settle one (`PRD.md` MODULE 10 makes bulk salary payment an accountant act). No single account
 * can produce, amend and pay the same payslip, which is what
 * `ARCHITECTURE.md` §20's configuration → calculation → adjustment → record separation asks for.
 */
const ROLE_GRANTS: ReadonlyArray<{ slug: string; keys: readonly string[] }> = [
  { slug: "admin", keys: PAYROLL_KEYS.map((entry) => entry.key) },
  { slug: "hr", keys: ["payroll.view", "payroll.calculate", "payroll.approve"] },
  { slug: "accountant", keys: ["payroll.view", "payroll.process"] },
];

async function main(): Promise<void> {
  const existingRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(
      inArray(
        permissions.key,
        PAYROLL_KEYS.map((entry) => entry.key),
      ),
    );
  const existingByKey = new Map(existingRows.map((row) => [row.key, row.id]));

  const missing = PAYROLL_KEYS.filter((entry) => !existingByKey.has(entry.key));
  for (const entry of missing) {
    await db.insert(permissions).values({ key: entry.key, describe: entry.describe });
  }
  const inserted =
    missing.length === 0
      ? []
      : await db
          .select({ id: permissions.id, key: permissions.key })
          .from(permissions)
          .where(
            inArray(
              permissions.key,
              missing.map((entry) => entry.key),
            ),
          );
  for (const row of inserted) existingByKey.set(row.key, row.id);
  console.log(
    `payroll permissions: ${missing.length} inserted, ${existingByKey.size - missing.length} already present`,
  );

  for (const grant of ROLE_GRANTS) {
    const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, grant.slug));
    if (!role) {
      // The seed creates every kernel role; a missing one means this database was not seeded.
      throw new Error(`the seed has not created the role \`${grant.slug}\``);
    }

    const held = await db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, role.id));
    const heldIds = new Set(held.map((row) => row.permissionId));

    const toGrant = grant.keys
      .map((key) => existingByKey.get(key))
      .filter((id): id is string => id !== undefined && !heldIds.has(id));
    for (const permissionId of toGrant) {
      await db.insert(rolePermissions).values({ roleId: role.id, permissionId });
    }
    console.log(`role \`${grant.slug}\`: ${toGrant.length} granted`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
