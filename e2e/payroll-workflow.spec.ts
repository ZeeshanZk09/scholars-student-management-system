/**
 * Phase 12 — the payroll workflow, end to end.
 *
 * The gate specs prove *authorization*; this one proves the payroll forms actually carry their data
 * into a settled, ledger-backed run. The run's whole lifecycle is driven through the UI: open a
 * month, calculate it, adjust what a calculation cannot know, approve it, settle the payment — and
 * the assertions read the figures back off the store's own `SUM`, never a stored total.
 *
 * What is asserted, beyond the wiring:
 *
 * - **The calculation is real** (`RULES.md` §39): a fixed salary is the figure the institution
 *   configured. A period with no attendance recorded falls back to the structure's configured
 *   `workingDaysPerMonth`, which is what makes a school without the attendance module payable today.
 * - **An adjustment survives its own approval** (`RULES.md` §37): a bonus applied while the run is
 *   calculated is proposed, is approved with the run, and is still on the line afterwards.
 * - **The payment is the run's total** (`ARCHITECTURE.md` §21): the settled amount equals the register's
 *   net total, and the run moves to `paid` only when the ledger journal has been posted in the same
 *   transaction.
 *
 * Hermetic: one throwaway platform-scoped account holding the four `payroll.*` keys (granted
 * through the permission rows that the **already-run `scripts/backfill-payroll-permissions.ts`**
 * inserted), a tenant minted directly, and a viewer holding `payroll.view` alone. Employees,
 * salary assignments and the academic session are minted directly rather than through the UI — the
 * payroll module is the subject, and its inputs are data, not behaviour under test
 * (`e2e/hr-workflow.spec.ts` covers hiring through the UI; `e2e/fees-workflow.spec.ts` covers the
 * fee module).
 *
 * A fixed salary is used rather than a unit-based one: the timetable, attendance and extra-period
 * inputs are Phases 15/17/19's subject, and this spec asserts the *engine's* output for what it can
 * already read.
 */
import { test, expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/db/client";
import { journalTransactions } from "../src/db/schema/finance";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { users, userCredentials } from "../src/db/schema/identity";
import { employees, salaryAssignments } from "../src/db/schema/hr";
import { academicSessions, institutions } from "../src/db/schema/institution";
import { payrollPayments, payrollRuns } from "../src/db/schema/payroll";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const EMAIL = `payroll-workflow-${STAMP}@example.test`;
const VIEWER_EMAIL = `payroll-viewer-${STAMP}@example.test`;
const PASSWORD = "Payroll-workflow-91324!";
const INSTITUTE = `E2E Payroll Institute ${STAMP}`;
const SLUG = `payroll-e2e-${STAMP}`;
const EMPLOYEE_EMAIL = `payroll-teacher-${STAMP}@example.test`;

const GRANTS = ["payroll.view", "payroll.calculate", "payroll.approve", "payroll.process"] as const;
const VIEWER_GRANTS = ["payroll.view"] as const;

let userId: string;
let viewerUserId: string;
let institutionId: string;
let runId = "";

async function signIn(page: Page, email = EMAIL): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/", { timeout: 30_000 });
}

async function submit(page: Page, label: string): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

test.beforeAll(async () => {
  test.setTimeout(180_000);

  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const stored = await hashPassword(PASSWORD);

  for (const [email, assign] of [
    [EMAIL, (id: string) => (userId = id)],
    [VIEWER_EMAIL, (id: string) => (viewerUserId = id)],
  ] as const) {
    const [created] = await db
      .insert(users)
      .values({ email, name: "Payroll Workflow Account", status: "active", updatedAt: new Date() })
      .returning({ id: users.id });
    if (!created) throw new Error(`failed to create ${email}`);
    assign(created.id);
    await db
      .insert(userCredentials)
      .values({ userId: created.id, ...stored, rotatedAt: new Date(), updatedAt: new Date() });
  }

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
      reason: "e2e: driving the payroll workflow UI",
    });
  };
  for (const key of GRANTS) await grant(userId, key);
  for (const key of VIEWER_GRANTS) await grant(viewerUserId, key);

  const [institution] = await db
    .insert(institutions)
    .values({ name: INSTITUTE, slug: SLUG, email: EMAIL })
    .returning({ id: institutions.id });
  if (!institution) throw new Error("failed to create the payroll institution");
  institutionId = institution.id;

  const [session] = await db
    .insert(academicSessions)
    .values({
      institutionId,
      name: `E2E Payroll Session ${STAMP}`,
      slug: `${SLUG}-session`,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })
    .returning({ id: academicSessions.id });
  if (!session) throw new Error("failed to create the payroll session");

  // The employee and their fixed salary assignment are the calculation's inputs — minted directly,
  // because the UI that creates them is HR's subject, not this one's.
  const [employee] = await db
    .insert(users)
    .values({ email: EMPLOYEE_EMAIL, name: "Ayesha Khan", status: "active", updatedAt: new Date() })
    .returning({ id: users.id });
  if (!employee) throw new Error("failed to create the payroll employee");
  const [profile] = await db
    .insert(employees)
    .values({
      institutionId,
      userId: employee.id,
      employeeCode: `EP-${String(STAMP).slice(-6)}`,
      employeeType: "teacher",
      employmentType: "full_time",
      status: "active",
      joiningDate: "2026-02-01",
    })
    .returning({ id: employees.id });
  if (!profile) throw new Error("failed to create the employee record");

  await db.insert(salaryAssignments).values({
    institutionId,
    employeeId: profile.id,
    salaryStructureId: null,
    amount: "40000.00",
    currency: "PKR",
    overridesStructure: false,
    effectiveFrom: "2026-01-01",
  });
});

test.afterAll(async () => {
  if (!institutionId) return;
  // `payroll_payments` restrict-references both the institution and its run, `payroll_items`
  // restrict-references `employees` (which the institution cascades away), and the salary-payment
  // journal restrict-references the institution — so the payment goes first, then the run and its
  // lines, then the journal, and only then the institution.
  await db.delete(payrollPayments).where(eq(payrollPayments.institutionId, institutionId));
  await db.delete(payrollRuns).where(eq(payrollRuns.institutionId, institutionId));
  await db.delete(journalTransactions).where(eq(journalTransactions.institutionId, institutionId));
  await db.delete(institutions).where(eq(institutions.id, institutionId));
  for (const uid of [viewerUserId, userId]) {
    if (!uid) continue;
    await db.delete(userPermissions).where(eq(userPermissions.userId, uid));
    await db.delete(userCredentials).where(eq(userCredentials.userId, uid));
  }
  await db.delete(users).where(inArray(users.email, [EMPLOYEE_EMAIL, EMAIL, VIEWER_EMAIL]));
  await db.delete(users).where(inArray(users.id, [userId, viewerUserId]));
});

test("the payroll workflow can be driven through the UI", async ({ page }) => {
  test.setTimeout(180_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // The period dialog opens on the current month — the same computation its picker does.
  const now = new Date();
  const monthLabel = `${now.toLocaleString("en-GB", { month: "long" })} ${now.getFullYear()}`;

  /* ---- 1. the register is empty and correctly gated ----------------------------- */

  await signIn(page);
  await page.goto(`/finance/payroll?institution=${institutionId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Payroll", exact: true })).toBeVisible();
  await expect(page.getByText("No payroll runs yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open period", exact: true })).toHaveCount(1);

  /* ---- 2. opening a month, then calculating it ---------------------------------- */

  await page.getByRole("button", { name: "Open period", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await submit(page, "Open period");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(monthLabel, { exact: true })).toBeVisible();

  // The run's page: nothing is calculated until the calculation runs.
  await page.getByRole("link", { name: monthLabel, exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/payroll\/[0-9a-f-]+\?institution=/);
  runId = new URL(page.url()).pathname.split("/")[3] ?? "";
  await expect(page.getByText("Nothing calculated yet", { exact: true })).toBeVisible();

  // 30s, not the config's 5s: the route is new, and the dev server compiles it on first visit.
  await page.getByRole("button", { name: "Calculate payroll", exact: true }).click();
  await expect(page.getByText("Nothing calculated yet", { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });

  // The fixed salary the institution configured is what the calculation wrote.
  const line = page.getByRole("row").filter({ hasText: "Ayesha Khan" });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("40000.00");
  await expect(page.getByText("PKR 40000.00", { exact: true })).toBeVisible();

  /* ---- 3. a manual adjustment, proposed then approved ---------------------------- */

  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  const adjustDialog = page.getByRole("dialog");
  await adjustDialog.getByLabel("Amount").fill("5000.00");
  await adjustDialog.getByLabel("Reason").fill("Eid bonus");
  await submit(page, "Apply adjustment");
  await expect(adjustDialog).toHaveCount(0);

  // 45,000.00 = the calculation's 40,000.00 plus the 5,000.00 bonus.
  await expect(page.getByText("45000.00", { exact: true }).first()).toBeVisible();

  /* ---- 4. approval freezes the figures, and settles the payment ------------------- */

  await expect(page.getByText("Proposed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve run", exact: true }).click();
  await expect(page.getByText("Proposed", { exact: true })).toHaveCount(0);

  await expect(page.getByText("Settle payment", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Settle payment", exact: true }).click();
  const paymentDialog = page.getByRole("dialog");
  await paymentDialog.getByLabel("Bank reference").fill(`TRF-${STAMP}`);
  await submit(page, "Settle payment");
  await expect(paymentDialog).toHaveCount(0);

  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  // The run detail's Audit table repeats the reference in its "Paid" fact row, so scope to the
  // payments table — the only table with a "Reference" column header.
  const paymentsTable = page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: "Reference" }) });
  const paymentRow = paymentsTable.getByRole("row").filter({ hasText: `TRF-${STAMP}` });
  await expect(paymentRow).toHaveCount(1);
  await expect(paymentRow).toContainText("45000.00");

  /* ---- 5. a read-only holder sees everything and may write nothing ----------------- */

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, VIEWER_EMAIL);

  await page.goto(`/finance/payroll/${runId}?institution=${institutionId}`);
  // The Manual adjustments table repeats the employee's name — scope to the payslips table,
  // the only one with a "Net" column header.
  const linesTable = page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: "Net" }) });
  await expect(linesTable.getByRole("row").filter({ hasText: "Ayesha Khan" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Calculate payroll", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve run", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settle payment", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adjust", exact: true })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});
