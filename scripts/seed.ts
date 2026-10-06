/**
 * The project's seed (MEMORY.md §12): the authentication super-admin that makes Phase 3's flows
 * usable, and the authorization data (Phase 4) that gives that super-admin meaning.
 *
 * Conventions followed, verbatim from §12:
 *   1. Lives here, in `scripts/seed.ts` — logic is not scattered across `src/`.
 *   2. Uses the shared `db` from `src/db/client.ts`.
 *   3. Exposed as `pnpm db:seed`.
 *   4. Idempotent: upserts on natural keys (`users_email_lower_key`,
 *      `user_credentials.user_id`, `permissions.key`, platform `roles.slug`,
 *      `role_permissions` PK, the live `user_roles` grant) — re-running updates in place,
 *      never duplicates.
 *   5. Target discipline: refuses to run against anything but a localhost PostgreSQL, and
 *      prints the exact host/port/database it is about to touch before writing.
 *
 * Credentials come from the environment: `SEED_ADMIN_PASSWORD` is required (a seed with a
 * baked-in password is a credential in the repository), `SEED_ADMIN_EMAIL` is optional
 * (default below). The password is never echoed.
 *
 * Run: `SEED_ADMIN_PASSWORD='…' pnpm db:seed`
 *
 * The hash is produced by the module's own `hashPassword`, so a seeded account is
 * byte-for-byte compatible with what login verifies against — the seed doubles as a
 * smoke test of the credential round-trip.
 *
 * ## The authorization part
 *
 * Every key in `PERMISSION_KEYS` is inserted exactly as declared in
 * `src/shared/authorization/permissions.ts`, so the code constant and the data cannot drift
 * (the schema's own contract test guards the shape). The nine system roles (`PHASES.md` §12
 * "Required actors", `PRD.md` §6) are created with `is_system_role = true` and a platform scope
 * (`institution_id null`), then the seeded super-admin is granted the **Super Admin** role
 * platform-wide — which is exactly how `ADR-0001` expresses a super user: as data, revocable,
 * audible. Self-scoped reads (`student`, `guardian`) still carry their capability keys here;
 * confining them to *their own* records is the resource layer's job (`ADR-0001` §2), not the
 * seed's.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { readDatabaseUrl } from "../src/db/env";
import { db } from "../src/db/client";
import { userCredentials, users } from "../src/db/schema/identity";
import { permissions, roles, rolePermissions, userRoles } from "../src/db/schema/authorization";
import { hashPassword } from "../src/modules/auth/infrastructure/password";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "../src/shared/authorization";

const DEFAULT_EMAIL = "superadmin@scholars.local";
const SEED_NAME = "Super Admin";
const SUPER_ADMIN_ROLE_SLUG = "super-admin";

/** §12 rule 5: a seed is a development tool; a remote host is never a development target. */
function assertLocalDevelopmentTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";

  if (!isPostgres || !localHosts.has(url.hostname)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at ${url.hostname} (port ${url.port || "5432"}). ` +
        "This script only seeds a local development database.",
    );
  }

  const database = url.pathname.replace(/^\//, "") || "(default)";
  return `${url.hostname}:${url.port || "5432"}/${database}`;
}

/** Human-readable labels for the seed — the database is forbidden from showing `key` to users. */
const KEY_DESCRIPTIONS: Record<PermissionKey, string> = {
  "users.view": "View user accounts",
  "users.manage": "Create and manage user accounts",
  "roles.view": "View roles and their permissions",
  "roles.manage": "Create and manage roles and grants",
  "academic.manage": "Configure the academic structure",
  "settings.manage": "Manage system settings",
  "audit.view": "View the audit trail",
  "students.view": "View student records",
  "students.create": "Create student records",
  "students.update": "Edit student records",
  "students.delete": "Delete student records",
  "guardians.view": "View guardian contact information",
  "guardians.manage": "Create and edit guardian records",
  "admissions.view": "View admission applications",
  "admissions.create": "Record new admissions",
  "admissions.update": "Update admission applications",
  "attendance.view": "View attendance records",
  "attendance.mark": "Mark attendance",
  "attendance.update": "Correct attendance records",
  "results.view": "View results",
  "results.enter": "Enter or edit results",
  "results.publish": "Publish results",
  "fees.view": "View fee records",
  "fees.record": "Record fee payments",
  "fees.refund": "Process fee refunds",
  "payments.record": "Record payments",
  "reports.view": "View reports",
};

/**
 * The nine system roles and their default capability bundles. Bundles are default grants only —
 * they exist to be managed at runtime (`PRD.md` §5.1, `ADR-0001`), and each traces to a stated
 * portal responsibility:
 *
 * - `PRD.md` §21 — portal responsibilities (Admin / Accountant / HR / Floor-Incharge / Teacher /
 *   Student / Guardian / Other Staff).
 * - `PRD.md` §6 + §12 actor list. "Other Staff" carries no defaults by design: its access comes
 *   exclusively from explicit grants (`PRD.md` §21).
 *
 * `student` and `guardian` hold read keys; scoping those reads to their own / linked records is
 * the resource layer's job (`ADR-0001` §2), and `requireSelfScope` / guardian-link checks come
 * with their feature phases.
 */
const SYSTEM_ROLES: readonly {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionKey[];
}[] = [
  {
    slug: "super-admin",
    name: "Super Admin",
    description: "Platform-wide administrative control: every capability.",
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    slug: "admin",
    name: "Admin",
    description: "Day-to-day institutional administration.",
    permissions: [
      "users.view",
      "roles.view",
      "students.view",
      "students.create",
      "students.update",
      "students.delete",
      "guardians.view",
      "guardians.manage",
      "admissions.view",
      "admissions.create",
      "admissions.update",
      "attendance.view",
      "attendance.mark",
      "attendance.update",
      "results.view",
      "results.enter",
      "results.publish",
      "fees.view",
      "reports.view",
    ],
  },
  {
    slug: "accountant",
    name: "Accountant",
    description: "Finance-focused operations only (PRD §21).",
    permissions: ["fees.view", "fees.record", "fees.refund", "payments.record", "reports.view"],
  },
  {
    slug: "floor-incharge",
    name: "Floor-Incharge",
    description: "Floor-level academic and attendance operations (PRD §21).",
    permissions: [
      "students.view",
      "attendance.view",
      "attendance.mark",
      "attendance.update",
      "results.view",
      "reports.view",
    ],
  },
  {
    slug: "teacher",
    name: "Teacher",
    description: "Teaching and assigned academic operations (PRD §21).",
    permissions: [
      "students.view",
      "attendance.view",
      "attendance.mark",
      "results.view",
      "results.enter",
    ],
  },
  {
    slug: "hr",
    name: "HR",
    description: "Employee and payroll management (PRD §21).",
    permissions: ["users.view", "reports.view"],
  },
  {
    slug: "student",
    name: "Student",
    description: "Personal academic information and permitted student functions (PRD §21).",
    permissions: ["students.view", "attendance.view", "results.view", "fees.view"],
  },
  {
    slug: "guardian",
    name: "Guardian / Parent",
    description: "Monitoring associated students and submitting leave requests (PRD §21).",
    permissions: ["students.view", "attendance.view", "results.view", "fees.view"],
  },
  {
    slug: "other-staff",
    name: "Other Staff",
    description: "Access according to explicitly assigned permissions (PRD §21).",
    permissions: [],
  },
];

/**
 * Seed the authorization data (idempotent): every declared permission key, the nine system
 * roles, each role's grants, and the platform Super Admin grant for the seeded admin.
 */
async function seedAuthorization(targetUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Permissions — one row per declared key, nothing else.
    const existingRows = await tx
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, [...ALL_PERMISSION_KEYS]));
    const existingKeys = new Set(existingRows.map((row) => row.key));

    const missingKeys = ALL_PERMISSION_KEYS.filter((key) => !existingKeys.has(key));
    if (missingKeys.length > 0) {
      await tx
        .insert(permissions)
        .values(missingKeys.map((key) => ({ key, describe: KEY_DESCRIPTIONS[key] })));
    }

    const keyToId = new Map<string, string>();
    const permissionRows = await tx
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, [...ALL_PERMISSION_KEYS]));
    for (const row of permissionRows) {
      keyToId.set(row.key, row.id);
    }

    // 2–3. System roles and their grants, by platform slug.
    for (const definition of SYSTEM_ROLES) {
      const found = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.slug, definition.slug), isNull(roles.institutionId)))
        .limit(1);

      const existing = found[0];
      let roleId: string;
      if (existing !== undefined) {
        roleId = existing.id;
      } else {
        const [created] = await tx
          .insert(roles)
          .values({
            name: definition.name,
            slug: definition.slug,
            description: definition.description,
            isSystemRole: true,
          })
          .returning({ id: roles.id });
        if (created === undefined) {
          throw new Error(`role insert returned no row for ${definition.slug}`);
        }
        roleId = created.id;
      }

      const granted = await tx
        .select({ permissionId: rolePermissions.permissionId })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));
      const grantedIds = new Set(granted.map((row) => row.permissionId));

      const toGrant = definition.permissions
        .map((key) => keyToId.get(key))
        .filter((permissionId): permissionId is string => permissionId !== undefined)
        .filter((permissionId) => !grantedIds.has(permissionId));

      if (toGrant.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(toGrant.map((permissionId) => ({ roleId, permissionId })));
      }
    }

    // 4. The live platform-wide Super Admin grant for the seeded account (idempotent on the
    //    live grant; a previous grant revoked for audit history stays history and is re-made).
    const superAdminRole = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.slug, SUPER_ADMIN_ROLE_SLUG), isNull(roles.institutionId)))
      .limit(1);

    const superAdminRoleId = superAdminRole[0]?.id;
    if (superAdminRoleId === undefined) {
      throw new Error("super-admin role was not created");
    }

    const liveGrant = await tx
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, targetUserId),
          eq(userRoles.roleId, superAdminRoleId),
          isNull(userRoles.institutionId),
          isNull(userRoles.revokedAt),
        ),
      )
      .limit(1);

    if (liveGrant[0] === undefined) {
      await tx.insert(userRoles).values({
        userId: targetUserId,
        roleId: superAdminRoleId,
        grantedByUserId: targetUserId,
      });
    }
  });
}

async function main(): Promise<void> {
  const email = (process.env["SEED_ADMIN_EMAIL"] ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env["SEED_ADMIN_PASSWORD"];

  if (!password || password.length === 0) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Refusing to seed with an unknown or empty password.",
    );
  }

  const target = assertLocalDevelopmentTarget(readDatabaseUrl());
  console.log(`Seeding authentication super-admin and authorization data into ${target}`);

  const now = new Date();

  // Upsert on the case-insensitive email natural key — the same lookup sign-in performs.
  // Done as select-then-write because the key is a functional index (`lower(email)`), which
  // drizzle's typed `onConflictDoUpdate({ target })` cannot express (column targets only).
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let userId: string;
  const found = existing[0];
  if (found !== undefined) {
    await db
      .update(users)
      .set({ name: SEED_NAME, status: "active", updatedAt: now })
      .where(eq(users.id, found.id));
    userId = found.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, name: SEED_NAME, status: "active", updatedAt: now })
      .returning({ id: users.id });
    if (created === undefined) {
      throw new Error("user insert returned no row");
    }
    userId = created.id;
  }

  const stored = await hashPassword(password);

  await db
    .insert(userCredentials)
    .values({
      userId,
      ...stored,
      rotatedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userCredentials.userId,
      set: {
        passwordHash: stored.passwordHash,
        algorithm: stored.algorithm,
        parameters: stored.parameters,
        rotatedAt: now,
        updatedAt: now,
      },
    });

  await seedAuthorization(userId);

  console.log(
    `Ready: ${email} (${userId}) — password from SEED_ADMIN_PASSWORD, ` +
      `platform ${SUPER_ADMIN_ROLE_SLUG} role granted.`,
  );
}

try {
  await main();
  await db.$client.end();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
