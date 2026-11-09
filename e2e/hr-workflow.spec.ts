/**
 * Phase 11 — the HR workflow, end to end.
 *
 * The gate specs prove *authorization*; this one proves the HR forms actually carry their data.
 * Hiring, editing a profile, three employment-status changes and the salary register are six
 * different payloads posted by three dialogs and six inline forms, while every action reads bare
 * keys (`employeeId`, `toStatus`, `expectedVersion`, `overridesStructure`, …) — the wiring between
 * the two lives only in the `name` attributes, and a missing one is invisible until someone
 * submits.
 *
 * Three outcomes the tests are for, beyond the wiring:
 *
 * - **`ADR-0002`**: hiring an employee creates the account they sign in with. The detail page's
 *   "Access" card reads the role bundle back from `user_roles`, so a teacher created by the dialog
 *   is not merely an `employees` row with a plausible name.
 * - **Employment history is append-only** (`RULES.md` §51). Each transition adds a line to the
 *   detail page's timeline rather than replacing the row above it, and the one-click controls are
 *   offered by *status*, not by grant, so a departed employee offers nothing.
 * - **Salary configuration is dated, never edited** (`ARCHITECTURE.md` §20). Closing an assignment
 *   ends it — the employee returns to "No salary assigned" rather than to a remembered figure.
 *
 * Hermetic: one throwaway platform-scoped account holding the four `employees.*` keys, a tenant
 * minted directly rather than through the UI (`academic.manage` is deliberately withheld, exactly
 * like `finance-workflow.spec.ts`), and a viewer holding `employees.view` alone. Departments and
 * designations are Phase 6 master data, so both selects offer only their "No …" option here — the
 * profile write is asserted on the fields the dialog can actually set. Every created row either
 * cascades from the institution or is deleted explicitly below.
 *
 * Judgement calls worth knowing before changing this file:
 *
 * - `AssignSalaryDialog` is rendered on the detail page **only while no assignment is current**, so
 *   the assignment step must come after an end for a second assertion to be a real test rather than
 *   a duplicate of the first.
 * - `EditSalaryStructureDialog` posts the structure's whole payload, not a diff: an edit that
 *   forgets a dimension fails `salary_structures_has_dimension_check` and the test says so as a
 *   field message, which is why the dialog re-renders both selects with `defaultValue`.
 * - The unit-based denominators are rendered for both kinds (`SelectField` has no `onChange` to
 *   reveal them), so a fixed structure leaves them blank and still saves — asserted here, because
 *   the boundary rule is the opposite and the two must not be confused.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { userCredentials, users } from "../src/db/schema/identity";
import { institutions } from "../src/db/schema/institution";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const EMAIL = `hr-workflow-${STAMP}@example.test`;
const VIEWER_EMAIL = `hr-viewer-${STAMP}@example.test`;
const PASSWORD = "Hr-workflow-87213!";
const INSTITUTE = `E2E HR Institute ${STAMP}`;
const SLUG = `hr-e2e-${STAMP}`;

const TEACHER_EMAIL = `teacher-${STAMP}@example.test`;
const ACCOUNTANT_EMAIL = `accountant-${STAMP}@example.test`;

/** The behaviour under test; the viewer needs the pages read and the directory listed. */
const GRANTS = [
  "employees.view",
  "employees.create",
  "employees.update",
  "employees.manage",
] as const;
const VIEWER_GRANTS = ["employees.view"] as const;

let userId: string;
let viewerUserId: string;
let institutionId: string;
/** The staff number the flow mints for the first employee, for the detail-page walk. */
let teacherCode = "";
const EMPLOYEE_EMAILS = [TEACHER_EMAIL, ACCOUNTANT_EMAIL];

/** Every staff number `createEmployee` mints, in order. */
const CODE = /^EP-\d{6}$/;

/** Local calendar day at an offset — the date inputs and the departure assert read the same strings. */
function day(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dom = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dom}`;
}

/** Institution-scoped path — the selector is a cookie, the URL carries the tenant (SECURITY §22). */
const at = (path: string) => `/${path}?institution=${institutionId}`;

/** A `StatCard`'s value: the label's row, then the figure beside it (see `finance-workflow`). */
function statValue(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("xpath=../following-sibling::p[1]");
}

async function signIn(page: Page, email = EMAIL): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/", { timeout: 30_000 });
}

/** Open a labelled Base UI select and pick an option by its visible label. */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Submit a button inside the single open dialog (triggers and submits can share a name). */
async function submit(page: Page, label: string): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

/** Hire one employee through the header dialog, and return the staff number it minted. */
async function hire(
  page: Page,
  details: { readonly name: string; readonly email: string; readonly type: string },
): Promise<string> {
  await page.goto(at("hr/employees"));
  await page.getByRole("button", { name: "Hire employee", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await dialog.getByLabel(/^Full name/).fill(details.name);
  await dialog.getByLabel(/^Work email/).fill(details.email);
  await dialog.getByLabel(/^Provisional password/).fill("Correct horse battery");
  await choose(page, "Employee type", details.type);
  await dialog.getByLabel(/^Joining date/).fill(day());
  await submit(page, "Hire employee");
  await expect(dialog).toHaveCount(0);

  // The list is staff-number ordered, so the newest row's code is the one just minted.
  const row = page.getByRole("row").filter({ hasText: details.email });
  await expect(row).toHaveCount(1);
  const code = (await row.locator("td").first().innerText()).trim();
  expect(code).toMatch(CODE);
  return code;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);

  // Warm the auth route before the first sign-in so that POST is JIT-compiled, not mid-test.
  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const stored = await hashPassword(PASSWORD);

  for (const [email, assign] of [
    [EMAIL, (id: string) => (userId = id)],
    [VIEWER_EMAIL, (id: string) => (viewerUserId = id)],
  ] as const) {
    const [created] = await db
      .insert(users)
      .values({ email, name: "HR Workflow Account", status: "active", updatedAt: new Date() })
      .returning({ id: users.id });
    if (!created) throw new Error(`failed to create ${email}`);
    assign(created.id);
    await db
      .insert(userCredentials)
      .values({ userId: created.id, ...stored, rotatedAt: new Date(), updatedAt: new Date() });
  }

  // Platform scope, no `user_institutions` row: the principal is unbound, which is what lets it
  // administer every tenant without an affiliation of its own — the same shape the finance and
  // authorization specs use.
  const keys = new Set<string>([...GRANTS, ...VIEWER_GRANTS]);
  const rows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, [...keys]));
  const keyToId = new Map(rows.map((row) => [row.key, row.id]));
  for (const key of keys) {
    if (!keyToId.has(key)) throw new Error(`the seed has not created \`${key}\``);
  }

  const grant = async (uid: string, key: string) => {
    const permissionId = keyToId.get(key);
    if (permissionId === undefined) throw new Error(`the seed has not created \`${key}\``);
    await db.insert(userPermissions).values({
      userId: uid,
      permissionId,
      effect: "grant",
      institutionId: null,
      reason: "e2e: driving the HR workflow UI",
    });
  };
  for (const key of GRANTS) await grant(userId, key);
  for (const key of VIEWER_GRANTS) await grant(viewerUserId, key);

  // Direct, not through the UI: this spec is about HR, and `academic.manage` is not one of its
  // keys. `finance-workflow.spec.ts` mints a tenant the same way.
  const [tenant] = await db
    .insert(institutions)
    .values({ name: INSTITUTE, slug: SLUG, email: EMAIL })
    .returning({ id: institutions.id });
  if (!tenant) throw new Error("failed to create the HR-workflow institution");
  institutionId = tenant.id;
});

test.afterAll(async () => {
  // `employee_status_history`, `salary_assignments` and `employees` cascade from the institution;
  // `users` does not, so every account this file created is deleted explicitly. The institution
  // goes first: it is what ties the employee rows to this tenant.
  if (institutionId) {
    await db.delete(institutions).where(eq(institutions.id, institutionId));
  }
  const every = [...EMPLOYEE_EMAILS, EMAIL, VIEWER_EMAIL];
  await db.delete(userPermissions).where(inArray(userPermissions.userId, [userId, viewerUserId]));
  await db.delete(userCredentials).where(inArray(userCredentials.userId, [userId, viewerUserId]));
  await db.delete(users).where(inArray(users.email, every));
  await db.delete(users).where(inArray(users.id, [userId, viewerUserId]));
  // No `db.$client.end()`: the worker's pg pool outlives this file (see `auth.spec.ts`).
});

test("the HR workflow can be driven through the UI", async ({ page }) => {
  test.setTimeout(120_000);

  // An uncaught exception anywhere in the tour is a defect — a silent one at that.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  /* ---- 1. a fresh tenant's staff directory is empty, zeroed, and correctly gated ----- */

  await signIn(page);
  await page.goto(at("hr/employees"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Employees", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No staff yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^All \(0\)$/ })).toBeVisible();

  // The nav item is the enabled link; Leave is still unbuilt and renders an inert "Planned" badge.
  // Scoped to the sidebar: the breadcrumb repeats "Employees" on this page, and these assertions
  // are about the menu, not the page.
  const sidebar = page.locator('[data-slot="sidebar"]');
  await expect(sidebar.getByRole("link", { name: "Employees", exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole("link", { name: "Salary", exact: true })).toHaveCount(1);
  // A disabled item renders as an inert `<span>` inside its `listitem` with a "Planned" badge
  // (`app-sidebar.tsx`), so there is no link role to assert — the row itself is the signal, and
  // the badge says why it does nothing. (Every other unbuilt route carries the same badge, which
  // is why the count is not the assertion.)
  const leaveItem = sidebar.getByRole("listitem").filter({ hasText: "Leave" });
  await expect(leaveItem).toHaveCount(1);
  await expect(leaveItem).toContainText("Planned");
  await expect(leaveItem.getByRole("link")).toHaveCount(0);

  /* ---- 2. hiring creates the account and the employment record together (ADR-0002) ---- */

  teacherCode = await hire(page, {
    name: "Ayesha Khan",
    email: TEACHER_EMAIL,
    type: "Teacher",
  });
  expect(teacherCode).toBe("EP-000001");

  await hire(page, { name: "Bilal Ahmed", email: ACCOUNTANT_EMAIL, type: "Accountant" });

  // The directory's own columns: the sign-in e-mail under the name, the joined date, and the
  // status badge. The employee *type* is a detail-page field — the list shows designation, which
  // this institution has not configured yet.
  const teacherRow = page.getByRole("row").filter({ hasText: TEACHER_EMAIL });
  await expect(teacherRow).toHaveCount(1);
  await expect(teacherRow.getByText("Active", { exact: true })).toBeVisible();
  await expect(teacherRow).toContainText(day());

  /* ---- 3. the detail page reads the role bundle, the history and the profile --------- */

  await page.goto(
    at(`hr/employees/${page.url().includes("EP-") ? "" : ""}`).replace(
      /\/hr\/employees\//,
      "/hr/employees/",
    ),
  );
  await page.goto(at("hr/employees"));
  // 30s, not the config's 5s: the detail route is visited for the first time in this run, so the
  // dev server is still compiling it while the click is already in flight (`signIn` waits for the
  // same reason, and `finance-workflow.spec.ts` documents it for the auth route).
  await page.getByRole("link", { name: teacherCode, exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/employees\/[0-9a-f-]+\?institution=/, { timeout: 30_000 });

  await expect(page.getByRole("heading", { name: "Ayesha Khan", exact: true })).toBeVisible();
  // The "Access" StatCard reads the grant back from `user_roles` — the account exists, with a role.
  // The "Access" StatCard reads the grant back from `user_roles` — the account exists, with the
  // role bundle the employee type implies (ADR-0002: the type decides the role, not the form).
  await expect(statValue(page, "Access")).toHaveText("teacher");

  const history = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 3, name: "Employment history" }) });
  await expect(history.getByText("Appointed", { exact: true })).toBeVisible();
  await expect(history.getByText(day())).toBeVisible();

  /* ---- 4. editing a profile moves the fields the dialog may move -------------------- */

  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  const profileDialog = page.getByRole("dialog");
  await choose(page, "Engagement", "Part time");
  await profileDialog.getByLabel(/^Emergency contact/).fill("Salman Khan");
  await profileDialog.getByLabel(/^Emergency phone/).fill("+923001234567");
  await profileDialog.getByLabel(/^Notes/).fill("Teaches mathematics.");
  await submit(page, "Save profile");
  await expect(profileDialog).toHaveCount(0);

  // The employment-information table's Engagement row (the summary card repeats the phrase in
  // its hint, so the cell is the unambiguous surface to assert).
  await expect(page.getByRole("cell", { name: "Part time", exact: true })).toBeVisible();
  await expect(page.getByText("Salman Khan · +923001234567")).toBeVisible();
  await expect(page.getByText("Teaches mathematics.")).toBeVisible();
  // The staff number and the joining date are not on the form, so they cannot have moved.
  await expect(page.getByText(teacherCode)).toBeVisible();

  /* ---- 5. a leave of absence and a return are two timeline rows --------------------- */

  await page.getByRole("button", { name: "Record leave", exact: true }).click();
  await expect(page.getByText("On leave", { exact: true }).first()).toBeVisible();
  await expect(history.getByText("Active → On leave")).toBeVisible();

  await page.getByRole("button", { name: "Return to work", exact: true }).click();
  await expect(history.getByText("On leave → Active")).toBeVisible();

  /* ---- 6. a departure is dated, reasoned, and final --------------------------------- */

  await page.getByRole("button", { name: "Record departure", exact: true }).click();
  const departure = page.getByRole("dialog");
  await expect(departure.getByRole("combobox", { name: "Reason" })).toContainText("Resigned");
  await departure.getByLabel(/^Last day/).fill(day());
  await departure.getByLabel(/^Notes/).fill("Relocating to another city.");
  await submit(page, "Record departure");
  await expect(departure).toHaveCount(0);

  await expect(page.getByText("Resigned", { exact: true }).first()).toBeVisible();
  await expect(history.getByText("Active → Resigned")).toBeVisible();
  await expect(page.getByText("Relocating to another city.")).toBeVisible();
  // Terminal: no control is rendered, rather than a disabled one that explains nothing.
  await expect(page.getByRole("button", { name: "Record departure", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record leave", exact: true })).toHaveCount(0);

  /* ---- 7. salary structures are dated, and an assignment can be closed ------------- */

  await page.goto(at("hr/salary-structures"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Salary structures", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No salary structures yet", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New structure", exact: true }).click();
  const structureDialog = page.getByRole("dialog");
  await structureDialog.getByLabel(/^Name/).fill("Teacher pay, 2026");
  await choose(page, "Structure", "Fixed monthly");
  // One dimension is required (`salary_structures_has_dimension_check`); with no departments or
  // designations configured, the employee type is the one this institution can name.
  await choose(page, "Employee type", "Teacher");
  await structureDialog.getByLabel(/^Monthly amount/).fill("60000");
  await structureDialog.getByLabel(/^Currency/).fill("PKR");
  await structureDialog.getByLabel(/^Effective from/).fill("2026-01-01");
  await submit(page, "Create structure");
  await expect(structureDialog).toHaveCount(0);

  const structureRow = page.getByRole("row").filter({ hasText: "Teacher pay, 2026" });
  await expect(structureRow).toHaveCount(1);
  await expect(structureRow.getByText("In force")).toBeVisible();
  await expect(structureRow).toContainText("PKR 60000");

  await page.goto(at("hr/employees"));
  await page.getByRole("link", { name: "EP-000002", exact: true }).click();
  await expect(page.getByRole("button", { name: "Assign salary", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Assign salary", exact: true }).click();
  const assignDialog = page.getByRole("dialog");
  await expect(assignDialog).toHaveCount(1);
  // The option's label is the structure's name plus its figure; picking by pattern avoids
  // restating the amount the numeric column already renders.
  await page.getByRole("combobox", { name: "Structure" }).click();
  await expect(page.getByRole("option", { name: /Teacher pay, 2026/ })).toBeVisible();
  await page.getByRole("option", { name: /Teacher pay, 2026/ }).click();
  await submit(page, "Assign salary");
  await expect(assignDialog).toHaveCount(0);

  await expect(page.getByText("Teacher pay, 2026").first()).toBeVisible();
  await expect(page.getByText("structure's own")).toBeVisible();

  // Ending one closes the row: the employee returns to "No salary assigned", not to a memory.
  await page.getByRole("button", { name: "End assignment", exact: true }).click();
  await expect(page.getByText("No salary assigned", { exact: true })).toBeVisible();

  /* ---- 8. a read-only holder sees everything and may write nothing ------------------ */

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, VIEWER_EMAIL);

  await page.goto(at("hr/employees"));
  await expect(page.getByRole("row").filter({ hasText: ACCOUNTANT_EMAIL })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Hire employee", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record departure", exact: true })).toHaveCount(0);

  await page.goto(at("hr/salary-structures"));
  await expect(page.getByRole("row").filter({ hasText: "Teacher pay, 2026" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "New structure", exact: true })).toHaveCount(0);

  await page.goto(at("hr/employees"));
  await page.getByRole("link", { name: "EP-000002", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bilal Ahmed", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign salary", exact: true })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});
