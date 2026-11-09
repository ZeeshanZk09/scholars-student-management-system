/**
 * Phase 7 — the student domain UI, end to end.
 *
 * The other specs prove *gates*; this one proves the student journey's forms actually carry
 * their data. Every student action reads bare keys (`admissionNumber`, `studentId`,
 * `institutionId`, `documentId`, …) from `FormData` while the controls carry prefixed ids — the
 * wiring between the two lives only in the `name` attributes, and a missing one is invisible
 * until someone submits. This walks the whole path once so that wiring is under test:
 * institution → session → campus → class → section → department → student → placement →
 * enrollment → lifecycle → guardian (created *and* linked in one transaction) → document
 * registration and verification → archive/restore → unlink.
 *
 * Hermetic: a throwaway account with platform-scoped grants for the student, guardian and
 * academic keys (no affiliations, so it is bound to no tenant — platform scope, exactly like
 * `academic-master.spec.ts`), an institution it mints itself, and cleanup by id/email afterwards.
 * It does not read the seed, and it does not assume the dev database is empty.
 */
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { userCredentials, users } from "../src/db/schema/identity";
import { institutions } from "../src/db/schema/institution";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const EMAIL = `student-domain-${STAMP}@example.test`;
const PASSWORD = "Student-domain-pass-87213!";
const INSTITUTE = `E2E Student Institute ${STAMP}`;
const SESSION = `E2E Student Year ${STAMP}`;
const CAMPUS = `E2E Student Campus ${STAMP}`;
const CLASS_NAME = `E2E Student Class ${STAMP}`;
const SECTION = `E2E Student Section ${STAMP}`;
const DEPARTMENT = `E2E Student Dept ${STAMP}`;
const ADMISSION = `E2E-${STAMP}`;
const STUDENT_EMAIL = `student-e2e-${STAMP}@example.test`;
const GUARDIAN_EMAIL = `guardian-e2e-${STAMP}@example.test`;
const FIRST = "Amina";
const LAST = "Rahman";
const GUARDIAN_FIRST = "Sara";

const GRANTS = [
  "academic.manage",
  "students.view",
  "students.create",
  "students.update",
  "guardians.view",
  "guardians.manage",
] as const;

let userId: string;
let institutionId: string;

test.beforeAll(async () => {
  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const stored = await hashPassword(PASSWORD);
  const [created] = await db
    .insert(users)
    .values({
      email: EMAIL,
      name: "Student Domain Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!created) throw new Error("failed to create student-domain user");
  userId = created.id;

  await db
    .insert(userCredentials)
    .values({ userId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  // Platform scope, no `user_institutions` row: the principal is unbound, which is what lets it
  // mint a tenant and then administer that tenant without an affiliation of its own.
  for (const key of GRANTS) {
    const [permission] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, key));
    if (!permission) throw new Error(`the seed has not created \`${key}\``);
    await db.insert(userPermissions).values({
      userId,
      permissionId: permission.id,
      effect: "grant",
      institutionId: null,
      reason: "e2e: driving the student domain UI",
    });
  }
});

test.afterAll(async () => {
  if (userId) {
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
    // The guardian is its own `users` row — the cascade from `institutions` never reaches it.
    await db.delete(users).where(eq(users.email, GUARDIAN_EMAIL));
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

/** Same, but the option label is matched as a regex (class paths carry interpolated names). */
async function chooseMatching(
  page: import("@playwright/test").Page,
  label: string,
  pattern: RegExp,
): Promise<void> {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: pattern }).click();
}

/** Submit a button inside the single open dialog (triggers and submits can share a name). */
async function submit(page: import("@playwright/test").Page, label: string): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

test("the student domain can be driven through the UI", async ({ page }) => {
  test.slow();

  // An uncaught exception anywhere in the tour is a defect — a silent one at that.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await signIn(page);

  /* ---- 1. an institution (the platform minting a tenant) ---------------- */
  await page.goto("/academics");
  await page.getByRole("button", { name: "Add institution" }).click();
  // Dialog-scoped: `/academics` also renders the inline edit form whenever a tenant is resolved
  // (a sole institution is auto-picked), and its fields carry the same labels.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Institution name").fill(INSTITUTE);
  await dialog.getByLabel("Type").click();
  await page.getByRole("option", { name: "School", exact: true }).click();
  await dialog.getByLabel("Contact email").fill(`owner-${STAMP}@example.test`);
  await submit(page, "Create institution");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const [created] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.name, INSTITUTE));
  if (!created) throw new Error("the institution did not persist");
  institutionId = created.id;

  const at = (path: string) => `/${path}?institution=${institutionId}`;
  const academic = (path: string) => `/academics/${path}?institution=${institutionId}`;

  /* ---- 2. the academic furniture placement needs ------------------------ */
  await page.goto(academic("sessions"));
  await page.getByRole("button", { name: "Add session" }).click();
  await page.getByLabel("Session name").fill(SESSION);
  await page.getByLabel("Starts").first().fill("2026-08-01");
  await page.getByLabel("Ends").first().fill("2027-06-30");
  await submit(page, "Create session");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The first session of an institution becomes current on insert — and placement only accepts
  // *open* sessions, so this row is the one the placement dialog will offer.
  const rowFor = (name: string) => page.getByRole("row").filter({ hasText: name });
  await expect(rowFor(SESSION).getByText("Current", { exact: true })).toHaveCount(1);

  await page.goto(academic("facilities"));
  await page.getByRole("button", { name: "Add campus" }).click();
  await page.getByLabel("Campus name").fill(CAMPUS);
  await submit(page, "Create campus");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(academic("classes"));
  await page.getByRole("button", { name: "Add class" }).click();
  await page.getByLabel("Class name").fill(CLASS_NAME);
  await choose(page, "Grade level", "Class 9");
  await page.getByLabel("Initial groups").fill("A");
  await submit(page, "Create class");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The class was created with its group; its "Add section" control is the only one on the page.
  await page.getByRole("button", { name: "Add section" }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("Section name").fill(SECTION);
  await choose(page, "Campus", CAMPUS);
  await submit(page, "Create section");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(academic("departments"));
  await page.getByRole("button", { name: "Add department" }).first().click();
  await page.getByLabel("Department name").fill(DEPARTMENT);
  await submit(page, "Create department");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  /* ---- 3. a student, from the roster ------------------------------------ */
  await page.goto(at("students"));
  await page.getByRole("button", { name: "Add student" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("Admission number").fill(ADMISSION);
  await page.getByLabel("First name").fill(FIRST);
  await page.getByLabel("Last name").fill(LAST);
  await page.getByLabel("Email").fill(STUDENT_EMAIL);
  await submit(page, "Create student");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowFor(ADMISSION)).toHaveCount(1);

  /* ---- 4. the picker addresses the row, the detail page receives it ----- */
  await page.goto(at("student-info"));
  await expect(page.getByText(ADMISSION)).toBeVisible();
  // The picker's Open is a `Button render={<Link/>}`, so its accessible role is `link`.
  await rowFor(ADMISSION).getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(/student=[0-9a-f-]+/);
  const studentId = new URL(page.url()).searchParams.get("student");
  if (!studentId) throw new Error("the picker did not address a student");
  await expect(
    page.getByRole("heading", { name: new RegExp(`${FIRST}\\s+${LAST}`) }),
  ).toBeVisible();
  await expect(page.getByText("Admitted", { exact: true })).toBeVisible();

  /* ---- 5. placement: the cascading section select carries its value ----- */
  await page.getByRole("button", { name: "Place in class" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await chooseMatching(page, "Class placement", new RegExp(SECTION));
  await submit(page, "Place student");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(SECTION).first()).toBeVisible();
  await expect(page.getByText("Current", { exact: true })).toBeVisible();

  /* ---- 6. enrollment ----------------------------------------------------- */
  await page.getByRole("button", { name: "Enroll", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("Academic year").fill("2026-27");
  await choose(page, "Grade level", "Class 9");
  await choose(page, "Department", DEPARTMENT);
  await submit(page, "Enroll student");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("2026-27")).toBeVisible();

  /* ---- 7. lifecycle: admitted → active ---------------------------------- */
  await page.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  // The dialog only offers edges the machine allows; the first of `admitted` is `active`.
  await submit(page, "Save status");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Active", { exact: true })).toBeVisible();

  /* ---- 8. a guardian, created *and* linked in one transaction ------------ */
  await page.getByRole("button", { name: "Add guardian" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("First name").fill(GUARDIAN_FIRST);
  await page.getByLabel("Last name").fill(LAST);
  await page.getByLabel("Email").fill(GUARDIAN_EMAIL);
  await choose(page, "Relationship", "Mother");
  await submit(page, "Create guardian");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`${GUARDIAN_FIRST} ${LAST}`)).toBeVisible();
  await expect(page.getByText("Mother", { exact: true })).toBeVisible();

  /* ---- 9. a document: pending → verified -------------------------------- */
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await choose(page, "Document type", "Birth Certificate");
  await page.getByLabel("File name").fill("birth-certificate.pdf");
  await submit(page, "Register document");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await submit(page, "Verify document");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();

  /* ---- 10. archive and restore (the row axis, D-4) ---------------------- */
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await submit(page, "Archive record");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  // An archived row refuses profile and lifecycle edits, so the UI stops offering them.
  await expect(page.getByRole("button", { name: "Change status" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await submit(page, "Restore record");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Archived", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change status" })).toBeVisible();

  /* ---- 11. the guardians roster sees the link from the other side ------- */
  await page.goto(at("guardians"));
  const guardianRow = rowFor(`${GUARDIAN_FIRST} ${LAST}`);
  await expect(guardianRow).toBeVisible();
  await expect(guardianRow.getByText(LAST).first()).toBeVisible();

  // Edit carries `version` through `FormData` — the optimistic-concurrency wiring only exists
  // in this dialog's hidden input, and a missing one is a silent last-write-wins defect.
  await guardianRow.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("Phone").fill("+15550100");
  await submit(page, "Save changes");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(guardianRow.getByText("+15550100")).toBeVisible();

  /* ---- 12. unlink, from the student's own page -------------------------- */
  await page.goto(
    `/student-info?institution=${encodeURIComponent(institutionId)}&student=${encodeURIComponent(studentId)}`,
  );
  await page.getByRole("button", { name: "Unlink", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await submit(page, "Unlink");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`Past links:`, { exact: false })).toBeVisible();
  await expect(page.getByText(`${GUARDIAN_FIRST} ${LAST} (Mother)`)).toBeVisible();

  expect(pageErrors).toEqual([]);
});
