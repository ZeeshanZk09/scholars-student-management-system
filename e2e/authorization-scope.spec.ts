/**
 * The institution-scope boundary, end to end (`SECURITY.md` §21/§87, `RULES.md` §19).
 *
 * Hermetic: a throwaway account is created directly through the schema, signed in through the real
 * form, and granted `students.view` mid-flight by writing the `user_permissions` row the admin UI
 * would write. Nothing depends on the dev seed, so this spec proves the behaviour for *any* user
 * rather than for whatever the seed happens to contain.
 *
 * The two properties it pins:
 *   1. a session alone is not a capability — `/students` refuses until the grant exists;
 *   2. a route that exists is still gated — `/academics` renders `Access denied`, not a 404, for a
 *      signed-in user without `academic.manage`, while a navigation entry whose route genuinely
 *      does not exist yet (`/fees`) still 404s. `navigation.test.ts` guards that invariant at the
 *      module level; these two assertions are its runtime twin.
 */
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { userCredentials, users } from "../src/db/schema/identity";
import { institutions } from "../src/db/schema/institution";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const EMAIL = `scope-${STAMP}@example.test`;
const PASSWORD = "Scope-test-pass-87213!";

let userId: string;
let permissionId: string;
let institutionId: string;

test.beforeAll(async () => {
  // Same warm-up the auth spec uses: the first `/api/auth` hit compiles zod + argon2 + drizzle and
  // can blow past the 5s `expect` timeout.
  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const [permission] = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, "students.view"));
  if (!permission) throw new Error("the seed has not created `students.view` — run `pnpm db:seed`");
  permissionId = permission.id;

  const stored = await hashPassword(PASSWORD);
  const [created] = await db
    .insert(users)
    .values({
      email: EMAIL,
      name: "Scope Test Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!created) throw new Error("failed to create scope-test user");
  userId = created.id;

  await db
    .insert(userCredentials)
    .values({ userId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  // A tenant of its own, so the post-grant roster is emptiness *this spec* controls: the other
  // specs mint institutions and students in parallel, so relying on the dev seed's tenant (or on
  // the sole-tenant auto-pick) would make the "No students yet" assertion racy.
  const [tenant] = await db
    .insert(institutions)
    .values({
      name: `Scope Fixture ${STAMP}`,
      slug: `scope-fixture-${STAMP}`,
      email: EMAIL,
    })
    .returning({ id: institutions.id });
  if (!tenant) throw new Error("failed to create the scope-test institution");
  institutionId = tenant.id;
});

test.afterAll(async () => {
  if (userId) {
    // Direct grants first — they cascade off the user anyway, but clearing them explicitly keeps
    // the intent readable if the cascade order ever changes.
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    // No `db.$client.end()`: the worker and its pg pool outlive this file (see `auth.spec.ts`).
  }
  if (institutionId) {
    await db.delete(institutions).where(eq(institutions.id, institutionId));
  }
});

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

test("a session without the capability is refused, and a grant changes the answer", async ({
  page,
}) => {
  await signIn(page);

  await page.goto("/students");
  await expect(page.getByText("Access denied")).toBeVisible();
  await expect(page.getByText("No students yet")).toHaveCount(0);

  // The exact row the admin UI would insert: a platform-scoped direct grant (this account has no
  // `user_institutions` row, so its acting institution is `null` — see MEMORY §9).
  await db.insert(userPermissions).values({
    userId,
    permissionId,
    effect: "grant",
    institutionId: null,
    reason: "e2e: proving the students.view gate is a grant, not a session",
  });

  // Name this spec's own (empty) tenant rather than relying on resolution: other specs mint
  // institutions in parallel, so a sole-tenant auto-pick cannot be assumed.
  await page.goto(`/students?institution=${institutionId}`);
  await expect(page.getByText("No students yet")).toBeVisible();
  await expect(page.getByText("Access denied")).toHaveCount(0);
});

test("the unauthenticated visitor is still sent to sign-in", async ({ page }) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login/);
});

test("the academic master is gated, and a not-yet-built route still 404s", async ({ page }) => {
  // Signed in on purpose: an anonymous hit is redirected to /login by the (app) guard, and the
  // final response of a followed redirect is 200 — which would hide the very thing under test.
  await signIn(page);

  // `/academics` exists (Phase 6) but this account holds only `students.view`: the page must
  // refuse on capability, not vanish behind a 404 that would make a broken nav link look healthy.
  const gated = await page.goto("/academics");
  expect(gated?.status()).toBe(200);
  await expect(page.getByText("Access denied")).toBeVisible();

  // `/attendance` is still a `disabled: true` navigation entry with no route behind it —
  // 404 here is the defect `navigation.test.ts` catches when a flag and a page disagree. (`/fees`,
  // `/finance/transactions` and `/finance/payroll` held this spot until Phases 9, 10 and 12
  // built them.)
  const missing = await page.goto("/attendance");
  expect(missing?.status()).toBe(404);
});
