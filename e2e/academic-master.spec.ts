/**
 * Phase 6 task 13 — the academic master admin UI, end to end.
 *
 * The other specs prove *gates*; this one proves the forms actually carry their data. Every
 * academic action reads bare keys (`name`, `academicSessionId`, `isBreak`) from `FormData` while
 * the controls carry prefixed ids so two dialogs can share a page — the wiring between the two
 * lives only in the `name` attributes, and a missing one is invisible until someone submits. This
 * walks the whole master-data path once so that wiring is under test: institution → session →
 * facilities → class → group → section → subject → department → time slot.
 *
 * Hermetic: a throwaway account with a platform-scoped `academic.manage` grant (no affiliations,
 * so it is bound to no tenant — `authorization-service.ts` treats that as the platform), an
 * institution it mints itself, and cleanup by name afterwards. It does not read the seed, and it
 * does not assume the dev database is empty.
 */
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { userCredentials, users } from "../src/db/schema/identity";
import { institutions } from "../src/db/schema/institution";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const EMAIL = `academic-master-${STAMP}@example.test`;
const PASSWORD = "Academic-master-pass-87213!";
const INSTITUTE = `E2E Institute ${STAMP}`;
const SESSION = `E2E Year ${STAMP}`;
const SESSION_2 = `E2E Year 2 ${STAMP}`;
const CLASS_NAME = `E2E Class ${STAMP}`;

let userId: string;
let institutionId: string;

test.beforeAll(async () => {
  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const [permission] = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, "academic.manage"));
  if (!permission) throw new Error("the seed has not created `academic.manage`");
  const permissionId = permission.id;

  const stored = await hashPassword(PASSWORD);
  const [created] = await db
    .insert(users)
    .values({
      email: EMAIL,
      name: "Academic Master Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!created) throw new Error("failed to create academic-master user");
  userId = created.id;

  await db
    .insert(userCredentials)
    .values({ userId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  // Platform scope, no `user_institutions` row: the principal is unbound, which is what lets it
  // mint a tenant and then administer that tenant without an affiliation of its own.
  await db.insert(userPermissions).values({
    userId,
    permissionId,
    effect: "grant",
    institutionId: null,
    reason: "e2e: driving the academic master UI",
  });
});

test.afterAll(async () => {
  if (userId) {
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
  if (institutionId) {
    await db.delete(institutions).where(eq(institutions.id, institutionId));
  }
  // No `db.$client.end()`: the worker's pg pool outlives this file (see `auth.spec.ts`).
});

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

/** Open a labelled Base UI select and pick an option by its visible label. */
async function choose(
  page: import("@playwright/test").Page,
  label: string,
  option: string,
): Promise<void> {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("the academic master can be configured through the admin UI", async ({ page }) => {
  test.slow();

  // An uncaught exception anywhere in the tour is a defect — a silent one at that.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await signIn(page);

  /* ---- 1. an institution (the platform minting a tenant) ---------------- */
  await page.goto("/academics");
  await page.getByRole("button", { name: "Add institution" }).click();

  // The dialogs are the only place these forms live, so an assertion that never sees one open
  // would be testing nothing — pin that the shell really mounts before filling anything.
  // Scoped to the dialog: `/academics` also renders the *inline* edit form whenever a tenant is
  // resolved (a sole institution is auto-picked), and its fields carry the same labels.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Institution name").fill(INSTITUTE);
  await dialog.getByLabel("Type").click();
  await page.getByRole("option", { name: "School", exact: true }).click();
  await dialog.getByLabel("Contact email").fill(`owner-${STAMP}@example.test`);
  await dialog.getByRole("button", { name: "Create institution" }).click();

  // The dialog closes itself on `done` and the page revalidates to the saved tenant. The frame
  // settles into one of two states — a sole tenant renders its card, several tenants render a
  // picker first — so drive whichever appears, then pin that the saved tenant is on screen.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rendered = page.getByText(INSTITUTE).first();
  const switcher = page.getByRole("combobox", { name: "Institution" });
  await expect(async () => {
    if (await rendered.isVisible().catch(() => false)) return;
    await expect(switcher).toBeVisible();
    await switcher.click();
    await page.getByRole("option", { name: INSTITUTE, exact: true }).click();
    await expect(rendered).toBeVisible();
  }).toPass({ timeout: 15_000 });
  await expect(rendered).toBeVisible();

  const [created] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.name, INSTITUTE));
  if (!created) throw new Error("the institution did not persist");
  institutionId = created.id;

  const at = (path: string) => `/academics/${path}?institution=${institutionId}`;

  /* ---- 2. two sessions, and the second one taken over as current ------- */
  await page.goto(at("sessions"));

  // The first session of an institution becomes current on insert (a year has to exist before
  // classes can belong to it), so it is asserted *as* current rather than promoted to it.
  await page.getByRole("button", { name: "Add session" }).click();
  await page.getByLabel("Session name").fill(SESSION);
  await page.getByLabel("Starts").first().fill("2026-08-01");
  await page.getByLabel("Ends").first().fill("2027-06-30");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(SESSION).first()).toBeVisible();

  // The current row carries a badge, not a button — promoting is offered only where it is still
  // possible, so `assertCanMakeCurrent`'s refusal never has to be shown to the user.
  const rowFor = (name: string) => page.getByRole("row").filter({ hasText: name });
  await expect(rowFor(SESSION).getByText("Current", { exact: true })).toHaveCount(1);
  await expect(rowFor(SESSION).getByRole("button", { name: "Make current" })).toHaveCount(0);

  // A second session lands open, and promoting it must demote the first — `setCurrentSession`
  // is the one mutation the class tree's scoping depends on, so it is exercised directly.
  await page.getByRole("button", { name: "Add session" }).click();
  await page.getByLabel("Session name").fill(SESSION_2);
  await page.getByLabel("Starts").first().fill("2027-08-01");
  await page.getByLabel("Ends").first().fill("2028-06-30");
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await rowFor(SESSION_2).getByRole("button", { name: "Make current" }).click();

  // Exactly one current after the switch, and it is the second session.
  await expect(rowFor(SESSION_2).getByText("Current", { exact: true })).toHaveCount(1);
  await expect(rowFor(SESSION).getByText("Open", { exact: true })).toHaveCount(1);

  /* ---- 3. a campus, a building, a floor -------------------------------- */
  await page.goto(at("facilities"));
  await page.getByRole("button", { name: "Add campus" }).click();
  await page.getByLabel("Campus name").fill(`E2E Campus ${STAMP}`);
  await page.getByRole("button", { name: "Create campus" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`E2E Campus ${STAMP}`).first()).toBeVisible();

  await page.getByRole("button", { name: "Add building" }).click();
  await page.getByLabel("Building name").fill(`E2E Block ${STAMP}`);
  await page.getByRole("button", { name: "Create building" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`E2E Block ${STAMP}`).first()).toBeVisible();

  await page.getByRole("button", { name: "Add floor" }).click();
  await page.getByLabel("Floor name").fill(`E2E Floor ${STAMP}`);
  await page.getByLabel("Level").fill("1");
  await page.getByRole("button", { name: "Create floor" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`E2E Floor ${STAMP}`).first()).toBeVisible();

  /* ---- 4. a class, a group, a section ---------------------------------- */
  await page.goto(at("classes"));
  await page.getByRole("button", { name: "Add class" }).click();
  await page.getByLabel("Class name").fill(CLASS_NAME);
  await choose(page, "Grade level", "Class 9");
  await page.getByLabel("Initial groups").fill("A, B");
  await page.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(CLASS_NAME).first()).toBeVisible();

  // The class was created with its two groups. Each group owns an "Add section" control and no
  // other class exists on this page, so the first one is the one under test — scoping further
  // would only be asserting against markup rather than behaviour.
  await page.getByRole("button", { name: "Add section" }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("Section name").fill(`E2E Section ${STAMP}`);
  await choose(page, "Campus", `E2E Campus ${STAMP}`);
  await page.getByRole("button", { name: "Create section" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`E2E Section ${STAMP}`).first()).toBeVisible();

  /* ---- 5. a subject and a department ----------------------------------- */
  await page.goto(at("departments"));
  await page.getByRole("button", { name: "Add department" }).first().click();
  await page.getByLabel("Department name").fill(`E2E Department ${STAMP}`);
  await page.getByRole("button", { name: "Create department" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`E2E Department ${STAMP}`).first()).toBeVisible();

  await page.goto(at("subjects"));
  await page.getByRole("button", { name: "Add subject" }).click();
  await page.getByLabel("Subject name").fill(`E2E Subject ${STAMP}`);
  await page.getByLabel("Code").fill("E2E");
  await choose(page, "Type", "Theory");
  await choose(page, "Department", `E2E Department ${STAMP}`);
  await page.getByRole("button", { name: "Create subject" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`E2E Subject ${STAMP}`).first()).toBeVisible();

  /* ---- 6. a time slot whose *break* flag is set from its label --------- */
  await page.goto(at("time-slots"));
  await page.getByRole("button", { name: "Add time slot" }).click();
  await page.getByLabel("Slot name").fill(`E2E Break ${STAMP}`);
  await page.getByLabel("Starts").first().fill("10:00");
  await page.getByLabel("Ends").first().fill("10:15");
  await page.getByLabel("Sequence").fill("1");

  // Click the *label*, not the box: whether a wrapping `<label>` toggles Base UI's checkbox is
  // exactly the behaviour a unit test cannot see, and a break that never submits as a break is a
  // silent data defect in every timetable built on these rows.
  // Click the `<label>` itself: Base UI puts its own generated id on the visible span and the
  // real id on the hidden input the label points at, so "click the control" and "click the words"
  // are different interactions. The words are the one a user reaches for, and the one that has to
  // toggle the box for the flag to ever reach `isBreak`.
  await page.locator("label").filter({ hasText: "This slot is a break" }).click();
  await expect(page.getByRole("checkbox", { name: /This slot is a break/ })).toBeChecked();

  await page.getByRole("button", { name: "Create time slot" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`E2E Break ${STAMP}`).first()).toBeVisible();
  await expect(page.getByText("Break", { exact: true }).first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});
