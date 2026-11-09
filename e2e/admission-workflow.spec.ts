/**
 * Phase 8 — the admission workflow, end to end.
 *
 * The other specs prove *gates*; this one proves the workflow's forms actually carry their data.
 * Filing, the duplicate advisory, the decision and the conversion are four different payloads
 * posted by four dialogs while every action reads bare keys (`applicationNumber`, `to`,
 * `sectionId`, …) — the wiring between the two lives only in the `name` attributes, and a missing
 * one is invisible until someone submits. Two of the steps are also state-machine edges: an
 * application that never reaches `approved` cannot be converted, and a conversion that loses
 * `sectionId` would create a student nobody placed. The roster and the status chips then read the
 * same conversion back from two screens, so a write that lands in one table but not the other
 * shows up here rather than in production.
 *
 * Hermetic: a throwaway account with platform-scoped grants for the admissions, academic and
 * student keys (no affiliations, so it is bound to no tenant — platform scope, exactly like
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
const EMAIL = `admission-workflow-${STAMP}@example.test`;
const PASSWORD = "Admission-workflow-87213!";
const INSTITUTE = `E2E Admission Institute ${STAMP}`;
const SESSION = `E2E Admission Year ${STAMP}`;
const CAMPUS = `E2E Admission Campus ${STAMP}`;
const CLASS_NAME = `E2E Admission Class ${STAMP}`;
const SECTION = `E2E Admission Section ${STAMP}`;
const APPLICATION_NUMBER = `ADM-E2E-${STAMP}`;
const STUDENT_ADMISSION = `E2E-STU-${STAMP}`;
const APPLICANT_EMAIL = `applicant-${STAMP}@example.test`;
const FIRST = "Amina";
const LAST = "Rahman";
const DOB = "2012-04-15";
const PHONE = "+15550100";
const ADDRESS = "14 Test Street, E2E Campus";
const ACADEMIC_YEAR = "2026-27";

const GRANTS = [
  "admissions.view",
  "admissions.create",
  "admissions.update",
  "admissions.approve",
  "academic.manage",
  "students.view",
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
      name: "Admission Workflow Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!created) throw new Error("failed to create the admission-workflow user");
  userId = created.id;

  await db
    .insert(userCredentials)
    .values({ userId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  // Platform scope, no `user_institutions` row: the principal is unbound, which is what lets it
  // mint a tenant and then administer that tenant without an affiliation of its own. The five
  // admissions keys split the module's own commands (file / edit / decide-convert) from the page
  // read, plus the academic keys the furniture needs and `students.view` for the roster.
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
      reason: "e2e: driving the admission workflow UI",
    });
  }
});

test.afterAll(async () => {
  if (userId) {
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
    await db.delete(users).where(eq(users.email, EMAIL));
    await db.delete(users).where(eq(users.id, userId));
  }
  if (institutionId) {
    // The applications, students and history rows cascade with the tenant; no `users` row was
    // provisioned for the converted student (the guardian block stayed blank).
    await db.delete(institutions).where(eq(institutions.id, institutionId));
  }
  // No `db.$client.end()`: the worker's pg pool outlives this file (see `auth.spec.ts`).
});

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // 30s, not the config's 5s: a single-spec run starts a cold dev server, and the first
  // credential POST compiles the auth route on demand — easily past 5s on a busy machine.
  await expect(page).toHaveURL("/", { timeout: 30_000 });
}

/**
 * Open a labelled Base UI select and pick an option by its visible label. Addressed by role
 * rather than `getByLabel`: the decide dialog's own "Decision notes" label *contains* "Decision",
 * so a substring label match resolves two controls at once and fails strict mode.
 */
async function choose(
  page: import("@playwright/test").Page,
  label: string,
  option: string,
): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Same, but the option label is matched as a regex (class paths carry interpolated names). */
async function chooseMatching(
  page: import("@playwright/test").Page,
  label: string,
  pattern: RegExp,
): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: pattern }).click();
}

/** Submit a button inside the single open dialog (triggers and submits can share a name). */
async function submit(page: import("@playwright/test").Page, label: string): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

/**
 * A status badge, by label. The detail header renders its badge before the timeline table repeats
 * the same humanized status in its "To" column, so the first exact match is the header's.
 */
function badge(
  page: import("@playwright/test").Page,
  label: string,
): import("@playwright/test").Locator {
  return page.getByText(label, { exact: true }).first();
}

test("the admission workflow can be driven through the UI", async ({ page }) => {
  test.slow();

  // An uncaught exception anywhere in the tour is a defect — a silent one at that.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await signIn(page);

  /* ---- 1. the institution and the furniture a placement needs ------------- */
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

  // Session, campus, class, group and section: conversion enrolls into a section of a class in
  // an *open* session, so all five must exist before the workflow can be driven.
  await page.goto(academic("sessions"));
  await page.getByRole("button", { name: "Add session" }).click();
  await page.getByLabel("Session name").fill(SESSION);
  await page.getByLabel("Starts").first().fill("2026-08-01");
  await page.getByLabel("Ends").first().fill("2027-06-30");
  await submit(page, "Create session");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The first session of an institution becomes current on insert — and conversion only offers
  // *open* sessions, so this row is the one both pickers will name.
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

  /* ---- 2. a tenant that has never filed opens on the empty state ---------- */
  await page.goto(at("admissions"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Admissions", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No applications yet")).toBeVisible();

  /* ---- 3. filing an application starts it at Submitted -------------------- */
  await page.getByRole("button", { name: "New application" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  // Dialog-scoped so every label resolves against the form under test, not against anything else
  // the page happens to render.
  await dialog.getByLabel("Application number").fill(APPLICATION_NUMBER);
  await dialog.getByLabel("First name").fill(FIRST);
  await dialog.getByLabel("Last name").fill(LAST);
  await dialog.getByLabel("Date of birth").fill(DOB);
  // Email and address are filled here even though the boundary treats both as optional: the
  // conversion dialog prefills its student block from them, and the required student e-mail is
  // the one thing that block cannot invent.
  await dialog.getByLabel("Email").fill(APPLICANT_EMAIL);
  await dialog.getByLabel("Phone").fill(PHONE);
  await dialog.getByLabel("Address").fill(ADDRESS);
  // The session picker opens on the institution's only session; confirm it rather than poke it,
  // since re-selecting the value already chosen would only exercise Base UI's no-op path.
  // `toContainText`: the trigger's text node carries Base UI's ▼ indicator alongside the label.
  await expect(dialog.getByRole("combobox", { name: "Session applied for" })).toContainText(
    SESSION,
  );
  // The class and group pickers *are* dependent and start empty, and `requireScope` refuses a
  // filing with none of class/group/grade — so both have to be chosen.
  await choose(page, "Class applied for", CLASS_NAME);
  await choose(page, "Group applied for", "A");
  await submit(page, "Submit application");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const applicationRow = rowFor(APPLICATION_NUMBER);
  await expect(applicationRow).toHaveCount(1);
  // `.first()` because a list row may render the status more than once (badge plus a date
  // column); the badge as its own text node is what has to exist.
  await expect(applicationRow.getByText("Submitted", { exact: true }).first()).toBeVisible();

  /* ---- 4. the advisory warns about the twin, it never blocks -------------- */
  await page.getByRole("button", { name: "New application" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog.getByLabel("First name").fill(FIRST);
  await dialog.getByLabel("Last name").fill(LAST);
  await dialog.getByLabel("Date of birth").fill(DOB);
  await page.getByRole("button", { name: "Check for duplicates" }).click();
  // Scoped to the advisory block: `FormShell` also renders a `role="status"` for its own
  // confirmations, and only the candidates block carries this copy (singular for one candidate).
  const advisory = page.getByRole("status").filter({ hasText: "application with the same name" });
  await expect(advisory).toBeVisible();
  await expect(advisory.getByText(APPLICATION_NUMBER)).toBeVisible();
  // Dismiss without filing: `EntityDialog` has no Cancel, so the header X is the exit — and the
  // advisory must not have left a second row behind.
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowFor(APPLICATION_NUMBER)).toHaveCount(1);

  /* ---- 5. the row addresses the detail page ------------------------------- */
  // The roster's `Open` is a `Button render={<Link/>}`; the admissions list may render the same
  // action either way, so the row is addressed by whichever role it picked.
  const openRow = applicationRow
    .getByRole("link", { name: "Open", exact: true })
    .or(applicationRow.getByRole("button", { name: "Open", exact: true }));
  await openRow.click();
  await expect(page).toHaveURL(/\/admissions\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole("heading", { name: new RegExp(`${FIRST}\\s+${LAST}`) }),
  ).toBeVisible();
  await expect(badge(page, "Submitted")).toBeVisible();
  // Submitted is editable and undecided, so both controls the header gates on are offered.
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Decide", exact: true })).toBeVisible();

  /* ---- 6. a decision moves the machine submitted → approved --------------- */
  await page.getByRole("button", { name: "Decide", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  // The select opens on the first edge offered (`under review`); an approval must be chosen, or
  // the conversion below would have nothing to convert.
  await choose(page, "Decision", "Approved");
  await submit(page, "Save decision");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(badge(page, "Approved")).toBeVisible();
  // An approved application is an audit fact: `EDITABLE_ADMISSION_STATUSES` drops it, and the
  // header stops offering Edit to match.
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

  /* ---- 7. conversion consumes the application into a student -------------- */
  await page.getByRole("button", { name: "Convert to student", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog).toContainText(`Convert ${APPLICATION_NUMBER}?`);
  // Identity, contact and address arrive prefilled from the application, and the session opens
  // on the tenant's only open one — so only what conversion genuinely needs from us is filled:
  // a student number of our own, the placement, and the academic year the enrollment is filed
  // under. The guardian and previous-school blocks stay blank and are skipped as a whole.
  await dialog.getByLabel("Admission number").fill(STUDENT_ADMISSION);
  await expect(dialog.getByRole("combobox", { name: "Session" })).toContainText(SESSION);
  await chooseMatching(page, "Class placement", new RegExp(SECTION));
  await dialog.getByLabel("Academic year").fill(ACADEMIC_YEAR);
  await expect(dialog.getByLabel("Enrolled on")).not.toHaveValue("");
  await submit(page, "Convert application");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(badge(page, "Converted")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open student record", exact: true })).toBeVisible();

  /* ---- 8. the roster reads the same conversion back ----------------------- */
  await page.goto(at("students"));
  const studentRow = rowFor(STUDENT_ADMISSION);
  await expect(studentRow).toHaveCount(1);
  await expect(studentRow.getByText(`${FIRST} ${LAST}`, { exact: true })).toBeVisible();

  /* ---- 9. the status chips filter the same row ---------------------------- */
  await page.goto(at("admissions"));
  await expect(applicationRow).toHaveCount(1);
  await page.getByRole("link", { name: "Converted", exact: true }).click();
  await expect(applicationRow).toHaveCount(1);
  await page.getByRole("link", { name: "Rejected", exact: true }).click();
  await expect(applicationRow).toHaveCount(0);
  await expect(page.getByText("No applications match this status")).toBeVisible();

  /* ---- 10. a bad address answers like a missing application ---------------- */
  // Not a uuid: the row's boundary schema rejects the path segment before any read, and the page
  // turns that validation failure into the same "not found" state a deleted row produces.
  await page.goto(`/admissions/not-a-uuid?institution=${encodeURIComponent(institutionId)}`);
  await expect(page.getByRole("heading", { name: "Application not found" })).toBeVisible();

  expect(pageErrors).toEqual([]);
});
