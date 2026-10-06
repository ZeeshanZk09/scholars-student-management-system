/**
 * Phase 3 task 15 — the authentication smoke, end to end (Phase 3 completion gate:
 * "an unauthenticated user cannot access protected application functionality").
 *
 * Hermetic: the suite creates its own throwaway account through the same store the app uses,
 * hashes the password through the module's own `hashPassword`, and deletes it afterwards — so
 * it never depends on the dev seed, on leftover data, or on a particular test order.
 *
 * One caveat: failed-attempt rate limiting is per process (10 attempts / 5 min / IP). The suite
 * fires exactly one failed attempt, so repeated local runs against a long-lived dev server are
 * safe — but a suite that ever grows many failure assertions should budget for it.
 */
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { userCredentials, users } from "../src/db/schema/identity";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const EMAIL = `smoke-${Date.now()}@example.test`;
const PASSWORD = "Smoke-test-pass-87213!";

let userId: string;

test.beforeAll(async () => {
  // Warm the auth routes before any assertion clock starts counting. Next.js compiles a route
  // on its first hit; the credentials callback pulls in zod, argon2 and the drizzle client, so
  // that first POST can cost seconds — longer than the 5s `expect` timeout. Hitting the CSRF
  // endpoint primes the whole `/api/auth` route module (Next compiles routes atomically).
  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const stored = await hashPassword(PASSWORD);
  const [created] = await db
    .insert(users)
    .values({
      email: EMAIL,
      name: "Smoke Test Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!created) throw new Error("failed to create smoke-test user");
  userId = created.id;

  await db.insert(userCredentials).values({
    userId,
    ...stored,
    rotatedAt: new Date(),
    updatedAt: new Date(),
  });
});

test.afterAll(async () => {
  if (userId) {
    await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  }
});

test("an unauthenticated visitor is sent to the sign-in page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("a wrong password shows only the generic, enumeration-safe message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(`${PASSWORD}-wrong`);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Scope to the exact copy: `role="alert"` also matches Next's route announcer, so a broad
  // `getByRole("alert")` is a strict-mode violation. The enumeration-safe string appears once.
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("valid credentials sign in, reach protected content, then sign out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Protected home: header shows the signed-in email and the sign-out control.
  await expect(page).toHaveURL("/");
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  // The gate holds again after sign-out.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
