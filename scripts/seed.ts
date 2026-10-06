/**
 * The project's first seed (MEMORY.md §12): the authentication super-admin that makes
 * Phase 3's flows usable and testable.
 *
 * Conventions followed, verbatim from §12:
 *   1. Lives here, in `scripts/seed.ts` — logic is not scattered across `src/`.
 *   2. Uses the shared `db` from `src/db/client.ts`.
 *   3. Exposed as `pnpm db:seed`.
 *   4. Idempotent: upserts on the natural keys (`users_email_lower_key`,
 *      `user_credentials.user_id`) — re-running updates in place, never duplicates.
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
 */
import { eq, sql } from "drizzle-orm";

import { readDatabaseUrl } from "../src/db/env";
import { db } from "../src/db/client";
import { userCredentials, users } from "../src/db/schema/identity";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const DEFAULT_EMAIL = "superadmin@scholars.local";
const SEED_NAME = "Super Admin";

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

async function main(): Promise<void> {
  const email = (process.env["SEED_ADMIN_EMAIL"] ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env["SEED_ADMIN_PASSWORD"];

  if (!password || password.length === 0) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Refusing to seed with an unknown or empty password.",
    );
  }

  const target = assertLocalDevelopmentTarget(readDatabaseUrl());
  console.log(`Seeding authentication super-admin into ${target}`);

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

  console.log(`Ready: ${email} (${userId}) — password from SEED_ADMIN_PASSWORD.`);
}

try {
  await main();
  await db.$client.end();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
