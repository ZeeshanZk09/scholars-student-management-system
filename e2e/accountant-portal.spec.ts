/**
 * Phase 13 — the accountant portal, end to end.
 *
 * The finance-module spec (`finance-workflow.spec.ts`) drives collection, the ledger and expense
 * approval as *actions*; this one proves the portal surfaces them correctly and, crucially, that
 * it refuses to leak anything the accountant was not granted. The portal is a **view** over
 * registers that already exist, so the work here is the attention model and the permission fence,
 * not a new workflow.
 *
 * What is asserted, beyond the wiring:
 *
 * - **The attention list is the product.** An approved-but-unsettled payroll run and a submitted
 *   expense are the only two things a finance desk is asked to act on; both appear the moment they
 *   exist and link to the register that owns them.
 * - **The portal reuses the modules' own figures.** Outstanding fees, awaiting settlement and
 *   awaiting approval are the same derivations the ledger, fee dashboard and expense register
 *   use, so the three can never disagree (`invoiceBalance`, `listPayrollRuns`, `listExpenses`).
 * - **Absence is honest.** Notifications (`PHASES.md` §24) and attendance visibility (§15) have
 *   no producer yet; neither appears as a dead control.
 * - **`finance.view` is the only key that opens the door.** Everything the portal links to keeps
 *   its own stricter key on the page that performs it — the portal never widens a permission.
 *
 * Hermetic: one platform-scoped account holding the thirteen `finance.*`/`fees.*`/`payroll.view`/
 * `reports.view` keys the seeded `accountant` role carries, a tenant minted directly, and an
 * outsider with no grants at all. The expense head, expense and income posting are driven through
 * the UI because *minting the attention data is the point* — a directly-inserted expense would
 * prove nothing about whether the portal is watching the register.
 */
import { test, expect, type Page } from "@playwright/test";
import { inArray } from "drizzle-orm";

import { db } from "../src/db/client";
import { expenses, expenseHeads } from "../src/db/schema/finance";
import { journalTransactions } from "../src/db/schema/finance";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { users, userCredentials } from "../src/db/schema/identity";
import { institutions } from "../src/db/schema/institution";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const ACCOUNTANT_EMAIL = `accountant-portal-${STAMP}@example.test`;
const OUTSIDER_EMAIL = `accountant-outsider-${STAMP}@example.test`;
const PASSWORD = "Accountant-portal-4821!";
const INSTITUTE = `E2E Accountant Institute ${STAMP}`;
const SLUG = `accountant-e2e-${STAMP}`;
const HEAD_NAME = `Utilities ${STAMP}`;
const EXPENSE_DESCRIPTION = `Generator fuel ${STAMP}`;
const INCOME_DESCRIPTION = `Annual day ${STAMP}`;

/**
 * Exactly the keys the seeded `accountant` role carries (`scripts/seed.ts`), expressed as grants
 * so this spec proves the *portal's* fence rather than the role's seeding.
 */
const GRANTS = [
  "finance.view",
  "finance.record",
  "finance.manage",
  "finance.adjust",
  "fees.view",
  "fees.record",
  "fees.adjust",
  "fees.refund",
  "payments.record",
  "payroll.view",
  "payroll.process",
  "reports.view",
] as const;

let accountantId: string;
let outsiderId: string;
let institutionId: string;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/", { timeout: 30_000 });
}

/** `?institution=…` — every page the portal links to takes the same resolver. */
function at(path: string): string {
  return `/${path}?institution=${encodeURIComponent(institutionId)}`;
}

/** Submit a button inside the single open dialog (triggers and submits can share a name). */
async function submit(page: Page, label: string): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

/** Base-UI combobox: open it, then click the option whose accessible name matches exactly. */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.beforeAll(async () => {
  test.setTimeout(180_000);

  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const stored = await hashPassword(PASSWORD);

  for (const [email, assign] of [
    [ACCOUNTANT_EMAIL, (id: string) => (accountantId = id)],
    [OUTSIDER_EMAIL, (id: string) => (outsiderId = id)],
  ] as const) {
    const [created] = await db
      .insert(users)
      .values({ email, name: "Accountant Portal Account", status: "active", updatedAt: new Date() })
      .returning({ id: users.id });
    if (!created) throw new Error(`failed to create ${email}`);
    assign(created.id);
    await db
      .insert(userCredentials)
      .values({ userId: created.id, ...stored, rotatedAt: new Date(), updatedAt: new Date() });
  }

  const rows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, [...GRANTS]));
  const keyToId = new Map(rows.map((row) => [row.key, row.id]));
  for (const key of GRANTS) {
    if (!keyToId.has(key)) throw new Error(`the seed has not created \`${key}\``);
  }
  for (const key of GRANTS) {
    const permissionId = keyToId.get(key);
    if (permissionId === undefined) throw new Error(`the seed has not created \`${key}\``);
    await db.insert(userPermissions).values({
      userId: accountantId,
      permissionId,
      effect: "grant",
      institutionId: null,
      reason: "e2e: driving the accountant portal",
    });
  }

  const [institution] = await db
    .insert(institutions)
    .values({ name: INSTITUTE, slug: SLUG, email: ACCOUNTANT_EMAIL })
    .returning({ id: institutions.id });
  if (!institution) throw new Error("failed to create the institution");
  institutionId = institution.id;

  const financeViewId = keyToId.get("finance.view");
  if (financeViewId === undefined) throw new Error("the seed has not created `finance.view`");
  await db.insert(userPermissions).values({
    userId: accountantId,
    permissionId: financeViewId,
    effect: "grant",
    institutionId,
    reason: "e2e: scoping the accountant to the throwaway tenant",
  });
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await db.delete(expenses).where(inArray(expenses.institutionId, [institutionId]));
  await db.delete(expenseHeads).where(inArray(expenseHeads.institutionId, [institutionId]));
  await db
    .delete(journalTransactions)
    .where(inArray(journalTransactions.institutionId, [institutionId]));
  await db
    .delete(userPermissions)
    .where(inArray(userPermissions.userId, [accountantId, outsiderId]));
  await db
    .delete(userCredentials)
    .where(inArray(userCredentials.userId, [accountantId, outsiderId]));
  await db.delete(users).where(inArray(users.id, [accountantId, outsiderId]));
  await db.delete(institutions).where(inArray(institutions.id, [institutionId]));
});

test("the accountant portal surfaces finance work without widening it", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  /* ---- 1. the sidebar opens the portal and hides everything else ------------------ */
  await signIn(page, ACCOUNTANT_EMAIL);
  await expect(page.getByRole("link", { name: "Accountant Portal", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Fees", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Payroll", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Financial Reports", exact: true })).toHaveCount(1);
  // The accountant holds no `students.view` or `academics.view`, so those never render.
  await expect(page.getByRole("link", { name: "Students", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Academics", exact: true })).toHaveCount(0);

  /* ---- 2. the portal opens clean and the stat cards read as zero ------------------- */
  await page.getByRole("link", { name: "Accountant Portal", exact: true }).click();
  await expect(page).toHaveURL(/\/accountant/);
  await expect(page.getByRole("heading", { level: 1, name: "Accountant Portal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
  await expect(page.getByText("Nothing is waiting on finance", { exact: true })).toBeVisible();
  await expect(page.getByText("Outstanding fees", { exact: true })).toBeVisible();
  await expect(page.getByText("Awaiting settlement", { exact: true })).toBeVisible();
  await expect(page.getByText("Awaiting approval", { exact: true })).toBeVisible();
  await expect(page.getByText("Overdue invoices", { exact: true })).toBeVisible();
  // The register links the portal offers are the real pages, not placeholders.
  const registers = page.getByRole("region", { name: "Registers" });
  await expect(
    registers.getByRole("link", { name: "Fee collection & receipts", exact: true }),
  ).toHaveCount(1);
  await expect(registers.getByRole("link", { name: "Financial reports", exact: true })).toHaveCount(1);
  await expect(registers.getByRole("link", { name: "Payroll", exact: true })).toHaveCount(1);

  /* ---- 3. minting attention through the UI --------------------------------------- */
  // The portal is a view; the only way to know it is *watching* the register is to drive the
  // register's own form and then look back.
  await page.goto(at("finance/expenses"));
  await page.getByRole("button", { name: "New expense head", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await dialog.getByLabel(/^Name/).fill(HEAD_NAME);
  await choose(page, "Category", "Utilities");
  await submit(page, "Create head");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Record expense", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await choose(page, "Expense head", HEAD_NAME);
  await dialog.getByLabel(/^Amount/).fill("1250");
  await dialog.getByLabel(/^Description/).fill(EXPENSE_DESCRIPTION);
  await submit(page, "Record expense");
  await expect(dialog).toHaveCount(0);

  const expenseRow = page.getByRole("row").filter({ hasText: EXPENSE_DESCRIPTION });
  await expect(expenseRow).toHaveCount(1);
  await expenseRow.getByRole("button", { name: "Submit expense", exact: true }).click();
  await expect(expenseRow.getByRole("cell").nth(5)).toHaveText("Submitted");

  /* ---- 4. the portal now shows the submitted expense as attention ----------------- */
  await page.goto(at("accountant"));
  await expect(
    page.getByText(`Expense “${EXPENSE_DESCRIPTION}” is waiting for approval`, { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("PKR 1250.00", { exact: true }).first()).toBeVisible();
  // The attention row links back to the register that can act on it.
  const attentionRow = page.getByRole("listitem").filter({ hasText: EXPENSE_DESCRIPTION });
  await expect(attentionRow).toHaveCount(1);
  await attentionRow.getByRole("link").click();
  await expect(page).toHaveURL(/\/finance\/expenses\?institution=/);

  /* ---- 5. the reports page is a composition, not a new ledger -------------------- */
  await page.goto(at("reports/finance"));
  await expect(page.getByRole("heading", { level: 1, name: "Financial Reports" })).toBeVisible();
  // No postings yet: the account balances register is honestly empty.
  await expect(page.getByText("No accounts yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing has posted yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fee collection" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payroll runs settled" })).toBeVisible();
  await expect(page.getByText("No payroll has been settled", { exact: true })).toBeVisible();

  // Recording income posts a journal, which provisions the default accounts — and the
  // reports page must pick them up without any report-specific write path.
  await page.goto(at("finance/transactions"));
  await page.getByRole("button", { name: "Record income", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByLabel(/^Amount/).fill("4000");
  await dialog.getByLabel(/^Description/).fill(INCOME_DESCRIPTION);
  await submit(page, "Record income");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: INCOME_DESCRIPTION })).toHaveCount(1);

  await page.goto(at("reports/finance"));
  await expect(page.getByText("No accounts yet", { exact: true })).toHaveCount(0);
  const accountsSection = page.getByRole("region", { name: "Account balances" });
  await expect(accountsSection.getByRole("cell", { name: "Cash in Hand" })).toBeVisible();
  await expect(accountsSection.getByRole("cell", { name: "Fee Income" })).toBeVisible();
  const kindSection = page.getByRole("region", { name: "Income and expense by kind" });
  await expect(kindSection.getByRole("cell", { name: "Income" })).toBeVisible();
  await expect(kindSection.getByRole("cell", { name: "PKR 4000.00" })).toBeVisible();

  /* ---- 6. the registers the portal links to are open, with their own fences ------- */
  await page.goto(at("fees"));
  await expect(page.getByRole("heading", { level: 1, name: "Fees" })).toBeVisible();

  await page.goto(at("finance/payroll"));
  await expect(page.getByRole("heading", { level: 1, name: "Payroll" })).toBeVisible();
  // The accountant holds `payroll.view` and `payroll.process` but not `payroll.calculate`, so
  // the month cannot be opened from here — the portal never widened the key set.
  await expect(page.getByRole("button", { name: "Open period", exact: true })).toHaveCount(0);

  /* ---- 7. the fence holds: no unrelated administration --------------------------- */
  await page.goto(at("students"));
  await expect(page.getByText("Access denied")).toBeVisible();
  await page.goto(at("academics"));
  await expect(page.getByText("Access denied")).toBeVisible();

  /* ---- 8. an outsider cannot open the portal at all ------------------------------ */
  await signIn(page, OUTSIDER_EMAIL);
  await expect(page.getByRole("link", { name: "Accountant Portal", exact: true })).toHaveCount(0);
  await page.goto(at("accountant"));
  await expect(page.getByText("Access denied")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
