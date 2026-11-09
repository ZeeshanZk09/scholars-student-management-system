/**
 * Phase 10 — the finance workflow, end to end.
 *
 * The gate specs prove *authorization*; this one proves the finance forms actually carry their
 * data. Record income, create an expense head, record an expense, submit/approve/pay/reject it
 * and reverse a journal are six different payloads posted by five dialogs and three inline
 * forms, while every action reads bare keys (`accountId`, `expenseHeadId`, `expectedVersion`,
 * `reason`, …) — the wiring between the two lives only in the `name` attributes, and a missing
 * one is invisible until someone submits.
 *
 * Money is the other half. `money()` renders `PKR 2500.00` with no separators, the register shows
 * an *unsigned* amount, and the dashboard's overview **is** signed: a reversal nets the income
 * back to zero (`signedMovement`, `finance-rules.ts`), the month that carried it goes negative,
 * and the expense stays put. Those three surfaces disagree by design, so this spec asserts all
 * three rather than treating one as proof of the others.
 *
 * Hermetic: a throwaway platform-scoped account holding the four finance keys, an institution
 * minted directly rather than through the UI, and a second viewer account holding `finance.view`
 * alone. `academic.manage` is deliberately withheld — minting a tenant through the academics UI
 * is `academic-master.spec.ts`'s job, not the subject under test here, and a direct
 * `insert(institutions)` is exactly what `authorization-scope.spec.ts` already does. Nothing
 * seeds `financial_periods`, and `requireOpenPeriod` passes an empty set, so a period row is
 * never needed. Every created row either cascades from the institution or is deleted explicitly
 * below; it does not read the seed and does not assume the dev database is empty.
 *
 * `fee_collection` is **not** asserted here: `assertReversalAllowed` refuses it, and
 * `finance-service.test.ts` already proves it ("refuses a fee collection, naming the refund that
 * can correct it"). Driving a fee payment to produce that journal is the fees spec's subject.
 *
 * Judgement calls worth knowing before changing this file:
 *
 * - `/finance` has **no `actions` prop**, so "Record income" can never appear there regardless
 *   of permission. Write-gating is therefore asserted on the two registers that do render
 *   controls, not on the dashboard.
 * - The income dialog's "To account" combobox is **disabled** while the institution owns no
 *   accounts, and it displays `"Default for the method"` rather than a chosen account. The
 *   assertion is the empty-accounts hint plus the visible control; the destination is proven by
 *   the journal's entries ("Cash in Hand"), not by the combobox's text.
 * - `ExpenseRowActions` renders an always-mounted empty `<p role="status" className="sr-only">`
 *   in every transition form, so `getByRole("status")` is never a usable negative signal inside
 *   a row. The row's status cell is.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { userCredentials, users } from "../src/db/schema/identity";
import { expenses, journalTransactions } from "../src/db/schema/finance";
import { institutions } from "../src/db/schema/institution";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const EMAIL = `finance-workflow-${STAMP}@example.test`;
const VIEWER_EMAIL = `finance-viewer-${STAMP}@example.test`;
const PASSWORD = "Finance-workflow-87213!";
const INSTITUTE = `E2E Finance Institute ${STAMP}`;
const SLUG = `finance-e2e-${STAMP}`;
const HEAD_NAME = `E2E Generator fuel ${STAMP}`;
const INCOME_DESCRIPTION = `Hall rental, e2e ${STAMP}`;
const EXPENSE_DESCRIPTION = `Generator fuel for the bus, e2e ${STAMP}`;
const SECOND_EXPENSE_DESCRIPTION = `Broken projector bulb, e2e ${STAMP}`;
const REVERSAL_REASON = `Recorded against the wrong month, e2e ${STAMP}`;

/** The behaviour under test; the viewer needs the pages read and nothing else. */
const GRANTS = ["finance.view", "finance.record", "finance.manage", "finance.adjust"] as const;
const VIEWER_GRANTS = ["finance.view"] as const;

let userId: string;
let viewerUserId: string;
let institutionId: string;
/** Captured in §3 from the register, re-read in §7 and §9. */
let reference = "";
let originalId = "";

/** A timestamp the detail page renders as `YYYY-MM-DD HH:MM` in UTC — `formatInstant`. */
const INSTANT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
/** Every journal reference `insertJournal` mints, in order. */
const REFERENCE = /^JV-\d{6}$/;

/** Local calendar day at an offset — the date inputs and the window asserts read the same strings. */
function day(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dom = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dom}`;
}

/** `2026-10` → `Oct 2026`. The page labels a month key as text; this must agree, not parse. */
function monthLabel(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  return `${names[date.getMonth()]} ${date.getFullYear()}`;
}

/** Institution-scoped path — the selector is a cookie, the URL carries the tenant (SECURITY §22). */
const at = (path: string) => `/${path}?institution=${institutionId}`;

/**
 * A `StatCard`'s value. The card is a `div.grid` (CardContent) whose first child is the icon+label
 * row and whose second `<p>` is the figure — a sibling walk, not a text search, so the label's own
 * text can never be mistaken for the amount beside it.
 */
function summaryValue(summary: Locator, label: string): Locator {
  return summary.getByText(label, { exact: true }).locator("xpath=../following-sibling::p[1]");
}

/** The `section` wrapper around a titled table — a `region` role, unlike the detail page's bare sections. */
function sectionTitled(page: Page, title: string): Locator {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) });
}

/** A `Field` on the journal detail: its `<dt>` followed by the sibling `<dd>`. */
function headerField(section: Locator, label: string): Locator {
  return section.locator(`xpath=.//dt[normalize-space(.)="${label}"]/following-sibling::dd[1]`);
}

/** One breakdown card on `/finance` — a `div.space-y-3` under the "Breakdown" region. */
function cardByTitle(page: Page, title: string): Locator {
  return page
    .locator("div.space-y-3")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) });
}

/* -------------------------------------------------------------------------- */
/* 1. Setup — the tenant and the two accounts that will drive it              */
/* -------------------------------------------------------------------------- */

test.beforeAll(async () => {
  test.setTimeout(120_000);

  // Warm the auth route before the first sign-in so that POST is JIT-compiled, not mid-test.
  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const stored = await hashPassword(PASSWORD);

  const [created] = await db
    .insert(users)
    .values({
      email: EMAIL,
      name: "Finance Workflow Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!created) throw new Error("failed to create the finance-workflow user");
  userId = created.id;
  await db
    .insert(userCredentials)
    .values({ userId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  const [viewer] = await db
    .insert(users)
    .values({
      email: VIEWER_EMAIL,
      name: "Finance Viewer Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!viewer) throw new Error("failed to create the finance-viewer user");
  viewerUserId = viewer.id;
  await db
    .insert(userCredentials)
    .values({ userId: viewerUserId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  // Platform scope, no `user_institutions` row: the principal is unbound, which is what lets it
  // administer every tenant without an affiliation of its own. A grant at platform scope
  // resolves at any institution (`hasPermission`, see the authorization service).
  const grant = async (uid: string, key: string) => {
    const [permission] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, key));
    if (!permission) throw new Error(`the seed has not created \`${key}\``);
    await db.insert(userPermissions).values({
      userId: uid,
      permissionId: permission.id,
      effect: "grant",
      institutionId: null,
      reason: "e2e: driving the finance workflow UI",
    });
  };
  for (const key of GRANTS) await grant(userId, key);
  for (const key of VIEWER_GRANTS) await grant(viewerUserId, key);

  // Direct, not through the UI: this spec is about finance, and `academic.manage` is not one of
  // its keys. `authorization-scope.spec.ts` mints a tenant the same way.
  const [tenant] = await db
    .insert(institutions)
    .values({
      name: INSTITUTE,
      slug: SLUG,
      email: EMAIL,
    })
    .returning({ id: institutions.id });
  if (!tenant) throw new Error("failed to create the finance-workflow institution");
  institutionId = tenant.id;
});

test.afterAll(async () => {
  if (viewerUserId) {
    await db.delete(userPermissions).where(eq(userPermissions.userId, viewerUserId));
    await db.delete(users).where(eq(users.email, VIEWER_EMAIL));
    await db.delete(users).where(eq(users.id, viewerUserId));
  }
  if (userId) {
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
    await db.delete(users).where(eq(users.email, EMAIL));
    await db.delete(users).where(eq(users.id, userId));
  }
  if (institutionId) {
    // `expenses.journal_transaction_id` is RESTRICT (an approved expense is history), and
    // `ledger_entries.account_id` is RESTRICT too — so the journal has to go before the accounts
    // the institution cascade would take with it, and the expense before the journal. Every
    // actor column (`requested_by_*`, `posted_by_*`, …) is a bare uuid, so the two accounts above
    // are already gone. `expense_heads` and `financial_accounts` cascade with the tenant and the
    // head this spec created has no `ledgerAccountId`, so nothing pins them.
    await db.delete(expenses).where(eq(expenses.institutionId, institutionId));
    await db
      .delete(journalTransactions)
      .where(eq(journalTransactions.institutionId, institutionId));
    await db.delete(institutions).where(eq(institutions.id, institutionId));
  }
  // No `db.$client.end()`: the worker's pg pool outlives this file (see `auth.spec.ts`).
});

async function signIn(page: Page, email = EMAIL): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // 30s, not the config's 5s: a single-spec run starts a cold dev server, and the first
  // credential POST compiles the auth route on demand — easily past 5s on a busy machine.
  await expect(page).toHaveURL("/", { timeout: 30_000 });
}

/**
 * Open a labelled Base UI select and pick an option by its visible label. The only dialog open
 * at a time is the one driving the step, so the page-level combobox search is unambiguous (the
 * header switcher resolves a tenant, never one of these names).
 */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Submit a button inside the single open dialog (triggers and submits can share a name). */
async function submit(page: Page, label: string): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

test("the finance workflow can be driven through the UI", async ({ page }) => {
  test.setTimeout(120_000);

  // An uncaught exception anywhere in the tour is a defect — a silent one at that.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  /* ---- 1. a fresh tenant's ledger is empty, zeroed, and correctly gated ----------- */
  await signIn(page);
  await page.goto(at("finance"));
  await expect(page.getByRole("heading", { level: 1, name: "Finance", exact: true })).toBeVisible();

  const summary = page.getByRole("region", { name: "Finance summary" });
  await expect(summary).toBeVisible();
  await expect(summaryValue(summary, "Income")).toHaveText("PKR 0.00");
  await expect(summaryValue(summary, "Expense")).toHaveText("PKR 0.00");
  await expect(summaryValue(summary, "Net position")).toHaveText("PKR 0.00");
  await expect(summaryValue(summary, "Outstanding fees")).toHaveText("PKR 0.00");

  // The cards render even for an institution that has never posted; the tables below step
  // aside for one EmptyState instead, whose action is the register.
  await expect(page.getByText("No ledger activity yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reverse", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Open the register", exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/transactions\?institution=/);

  // The nav item is the enabled link (an unbuilt entry renders an inert button plus a
  // "Planned" badge). `Fees` is gated on `fees.view` and `Payroll` (enabled since Phase 12) on
  // `payroll.view`, which neither account holds, so both entries must be gone rather than inert.
  await page.goto(at("finance"));
  await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Transactions", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Expenses", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Fees", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Payroll", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("listitem").filter({ has: page.getByText("Fees", { exact: true }) }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("listitem").filter({ has: page.getByText("Payroll", { exact: true }) }),
  ).toHaveCount(0);

  /* ---- 2. recording income posts a journal immediately ---------------------------- */
  await page.goto(at("finance/transactions"));
  await page.getByRole("button", { name: "Record income", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("heading", { name: "Record income", exact: true })).toBeVisible();

  await dialog.getByLabel(/^Amount/).fill("2500");
  await expect(dialog.getByLabel(/^Currency/)).toHaveValue("PKR");
  await expect(dialog.getByLabel(/^Received on/)).toHaveValue(day());
  // `defaultValue="cash"`, so the trigger already reads "Cash" — no click, no ambiguity.
  await expect(dialog.getByRole("combobox", { name: "Method" })).toContainText("Cash");
  // No accounts yet, and `listAccounts` deliberately does not provision: the store resolves
  // the method's default at post time, which is what this hint tells the treasurer.
  await expect(
    dialog.getByText("No accounts yet — the store provisions the default for the method.", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByLabel(/^Description/).fill(INCOME_DESCRIPTION);
  await submit(page, "Record income");
  await expect(dialog).toHaveCount(0);

  const incomeRow = page.getByRole("row").filter({ hasText: INCOME_DESCRIPTION });
  await expect(incomeRow).toHaveCount(1);
  await expect(incomeRow.getByRole("cell").nth(0)).toHaveText(REFERENCE);
  await expect(incomeRow.getByRole("cell").nth(1)).toHaveText("Income");
  await expect(incomeRow.getByRole("cell").nth(4)).toHaveText("PKR 2500.00");
  await expect(incomeRow.getByRole("cell").nth(5)).toHaveText("Posted");

  /* ---- 3. the journal's header and both of its balanced entries ------------------- */
  reference = (await incomeRow.getByRole("cell").nth(0).innerText()).trim();
  expect(reference).toMatch(REFERENCE);
  await incomeRow.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/transactions\/[0-9a-f-]{36}\?institution=/);
  originalId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(originalId).toMatch(/^[0-9a-f-]{36}$/);

  await expect(page.getByRole("heading", { level: 1, name: reference, exact: true })).toBeVisible();

  const headerSection = sectionTitled(page, "Header");
  await expect(headerSection).toHaveCount(1);
  await expect(headerField(headerSection, "Reference")).toHaveText(reference);
  await expect(headerField(headerSection, "Kind")).toHaveText("Income");
  await expect(headerField(headerSection, "Status")).toHaveText("Posted");
  await expect(headerField(headerSection, "Dated")).toHaveText(day());
  // One instant — "Posted at" — and the correction fields still read as the em dash.
  await expect(headerSection.locator("dd", { hasText: INSTANT })).toHaveCount(1);
  await expect(headerField(headerSection, "Corrects")).toHaveText("—");
  await expect(headerField(headerSection, "Reversed at")).toHaveText("—");
  await expect(headerField(headerSection, "Description")).toHaveText(INCOME_DESCRIPTION);

  const entriesSection = sectionTitled(page, "Entries");
  await expect(entriesSection).toHaveCount(1);
  const cashRow = entriesSection.getByRole("row").filter({ hasText: "Cash in Hand" });
  await expect(cashRow).toHaveCount(1);
  await expect(cashRow.getByRole("cell").nth(1)).toHaveText("Money in");
  const otherIncomeRow = entriesSection.getByRole("row").filter({ hasText: "Other Income" });
  await expect(otherIncomeRow).toHaveCount(1);
  await expect(otherIncomeRow.getByRole("cell").nth(1)).toHaveText("Money out");
  // A balanced journal, so the two sides print the same figure under their own labels.
  const totalsRow = entriesSection.getByRole("row").filter({ hasText: "Totals" });
  await expect(totalsRow).toHaveCount(1);
  await expect(totalsRow.getByRole("cell").nth(1)).toHaveText("PKR 2500.00 in");
  await expect(totalsRow.getByRole("cell").nth(2)).toHaveText("PKR 2500.00 out");
  // The control this page offers a posted, reversible journal with `finance.adjust`.
  await expect(page.getByRole("button", { name: "Reverse", exact: true })).toHaveCount(1);

  /* ---- 4. an expense needs a head first, and the form says so --------------------- */
  await page.goto(at("finance/expenses"));
  await page.getByRole("button", { name: "Record expense", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await expect(
    dialog.getByText("Create an expense head first — every expense reports under one.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Expense head" })).toContainText(
    "No expense heads yet",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "New expense head", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByLabel(/^Name/).fill(HEAD_NAME);
  await choose(page, "Category", "Utilities");
  await submit(page, "Create head");
  await expect(dialog).toHaveCount(0);
  // `revalidateExpensePaths` refreshes this list, so the head is on offer without a reload.
  await expect(page.getByRole("button", { name: "Record expense", exact: true })).toBeVisible();

  /* ---- 5. an expense walks draft → submitted → approved → paid -------------------- */
  await page.getByRole("button", { name: "Record expense", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("combobox", { name: "Expense head" })).toContainText(
    "Choose an expense head",
  );
  await choose(page, "Expense head", HEAD_NAME);
  await dialog.getByLabel(/^Amount/).fill("800");
  await expect(dialog.getByLabel(/^Currency/)).toHaveValue("PKR");
  await expect(dialog.getByLabel(/^Incurred on/)).toHaveValue(day());
  await expect(dialog.getByRole("combobox", { name: "Paid by" })).toContainText("Cash");
  await dialog.getByLabel(/^Description/).fill(EXPENSE_DESCRIPTION);
  await submit(page, "Record expense");
  await expect(dialog).toHaveCount(0);

  const expenseRow = page.getByRole("row").filter({ hasText: EXPENSE_DESCRIPTION });
  await expect(expenseRow).toHaveCount(1);
  await expect(expenseRow.getByRole("cell").nth(0)).toHaveText(HEAD_NAME);
  await expect(expenseRow.getByRole("cell").nth(2)).toHaveText(day());
  await expect(expenseRow.getByRole("cell").nth(3)).toHaveText("Cash");
  await expect(expenseRow.getByRole("cell").nth(4)).toHaveText("PKR 800.00");
  await expect(expenseRow.getByRole("cell").nth(5)).toHaveText("Draft");

  await expenseRow.getByRole("button", { name: "Submit expense", exact: true }).click();
  await expect(expenseRow.getByRole("cell").nth(5)).toHaveText("Submitted");
  await expect(expenseRow.getByRole("alert")).toHaveCount(0);

  await expenseRow.getByRole("button", { name: "Approve expense", exact: true }).click();
  await expect(expenseRow.getByRole("cell").nth(5)).toHaveText("Approved");
  await expect(expenseRow.getByRole("alert")).toHaveCount(0);

  await expenseRow.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(expenseRow.getByRole("cell").nth(5)).toHaveText("Paid");
  await expect(expenseRow.getByRole("alert")).toHaveCount(0);
  // Terminal: `paid` has no outgoing edge, so the row offers no further control.
  await expect(expenseRow.getByRole("button", { name: "Mark paid", exact: true })).toHaveCount(0);

  // Approval is the step that posts the journal — against `incurredOn`, with the head's
  // category riding on the expense side only.
  await page.goto(at("finance/transactions"));
  const expenseJournalRow = page.getByRole("row").filter({ hasText: EXPENSE_DESCRIPTION });
  await expect(expenseJournalRow).toHaveCount(1);
  await expect(expenseJournalRow.getByRole("cell").nth(1)).toHaveText("Expense");
  await expect(expenseJournalRow.getByRole("cell").nth(2)).toHaveText(day());
  await expect(expenseJournalRow.getByRole("cell").nth(4)).toHaveText("PKR 800.00");
  await expect(expenseJournalRow.getByRole("cell").nth(5)).toHaveText("Posted");

  /* ---- 6. a second spend is refused on the reviewer's desk ------------------------ */
  await page.goto(at("finance/expenses"));
  await page.getByRole("button", { name: "Record expense", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await choose(page, "Expense head", HEAD_NAME);
  await dialog.getByLabel(/^Amount/).fill("150");
  await dialog.getByLabel(/^Description/).fill(SECOND_EXPENSE_DESCRIPTION);
  await submit(page, "Record expense");
  await expect(dialog).toHaveCount(0);

  const secondRow = page.getByRole("row").filter({ hasText: SECOND_EXPENSE_DESCRIPTION });
  await expect(secondRow).toHaveCount(1);
  await expect(secondRow.getByRole("cell").nth(5)).toHaveText("Draft");

  await secondRow.getByRole("button", { name: "Submit expense", exact: true }).click();
  await expect(secondRow.getByRole("cell").nth(5)).toHaveText("Submitted");
  await secondRow.getByRole("button", { name: "Reject expense", exact: true }).click();
  await expect(secondRow.getByRole("cell").nth(5)).toHaveText("Rejected");
  await expect(secondRow.getByRole("alert")).toHaveCount(0);
  // Terminal too, and it never posted — so it cannot appear in the ledger below.
  await expect(secondRow.getByRole("button", { name: "Reject expense", exact: true })).toHaveCount(
    0,
  );

  /* ---- 7. reversing is a second journal, not an edit ------------------------------ */
  await page.goto(at("finance"));
  await expect(summaryValue(summary, "Income")).toHaveText("PKR 2500.00");
  await expect(summaryValue(summary, "Expense")).toHaveText("PKR 800.00");
  await expect(summaryValue(summary, "Net position")).toHaveText("PKR 1700.00");

  await page.goto(at("finance/transactions"));
  await page
    .getByRole("row")
    .filter({ hasText: INCOME_DESCRIPTION })
    .getByRole("link", { name: "Open", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: reference, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reverse", exact: true }).click();
  await expect(dialog).toHaveCount(1);
  await expect(
    dialog.getByRole("heading", { name: `Reverse ${reference}?`, exact: true }),
  ).toBeVisible();
  await dialog.getByLabel(/^Reason/).fill(REVERSAL_REASON);
  await submit(page, "Post reversal");
  await expect(dialog).toHaveCount(0);

  // The same page re-renders with the correction recorded against it — no reload needed.
  await expect(headerField(headerSection, "Status")).toHaveText("Reversed");
  await expect(headerField(headerSection, "Corrects")).toHaveText("—");
  await expect(headerField(headerSection, "Description")).toHaveText(INCOME_DESCRIPTION);
  await expect(headerSection.locator("dd", { hasText: INSTANT })).toHaveCount(2);
  // Nothing left to offer: the journal is no longer `posted`.
  await expect(page.getByRole("button", { name: "Reverse", exact: true })).toHaveCount(0);

  await page.goto(at("finance/transactions"));
  const reversalRow = page.getByRole("row").filter({ hasText: `Reversal of ${reference}:` });
  await expect(reversalRow).toHaveCount(1);
  await expect(reversalRow.getByRole("cell").nth(1)).toHaveText("Income");
  await expect(reversalRow.getByRole("cell").nth(4)).toHaveText("PKR 2500.00");
  await expect(reversalRow.getByRole("cell").nth(5)).toHaveText("Posted");
  await reversalRow.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /JV-\d{6}/ })).toBeVisible();

  const reversalHeader = sectionTitled(page, "Header");
  await expect(headerField(reversalHeader, "Corrects")).toHaveText(originalId);
  await expect(headerField(reversalHeader, "Kind")).toHaveText("Income");
  await expect(headerField(reversalHeader, "Status")).toHaveText("Posted");
  await expect(headerField(reversalHeader, "Dated")).toHaveText(day());
  await expect(headerField(reversalHeader, "Description")).toHaveText(
    `Reversal of ${reference}: ${REVERSAL_REASON}`,
  );

  // Every direction is swapped; only the original's own `category` survives.
  const reversalEntries = sectionTitled(page, "Entries");
  const reversalCash = reversalEntries.getByRole("row").filter({ hasText: "Cash in Hand" });
  await expect(reversalCash.getByRole("cell").nth(1)).toHaveText("Money out");
  const reversalOther = reversalEntries.getByRole("row").filter({ hasText: "Other Income" });
  await expect(reversalOther.getByRole("cell").nth(1)).toHaveText("Money in");
  await expect(
    reversalEntries.getByRole("row").filter({ hasText: "Totals" }).getByRole("cell").nth(1),
  ).toHaveText("PKR 2500.00 in");

  /* ---- 8. the figures net off, and history is not rewritten ----------------------- */
  await page.goto(at("finance"));
  await expect(summaryValue(summary, "Income")).toHaveText("PKR 0.00");
  await expect(summaryValue(summary, "Expense")).toHaveText("PKR 800.00");
  await expect(summaryValue(summary, "Net position")).toHaveText("PKR -800.00");

  // The month that carried both the income and its correction shows the correction where it
  // landed; the expense is untouched.
  const monthly = page.getByRole("region", { name: "Monthly movement" });
  const currentMonth = monthly.getByRole("row").filter({ hasText: monthLabel() });
  await expect(currentMonth).toHaveCount(1);
  await expect(currentMonth.getByRole("cell").nth(0)).toHaveText(monthLabel());
  await expect(currentMonth.getByRole("cell").nth(1)).toHaveText("PKR 0.00");
  await expect(currentMonth.getByRole("cell").nth(2)).toHaveText("PKR 800.00");
  await expect(currentMonth.getByRole("cell").nth(3)).toHaveText("PKR -800.00");

  const byKind = cardByTitle(page, "By journal kind");
  await expect(byKind).toHaveCount(1);
  await expect(
    byKind.locator("tbody tr").filter({ hasText: "Expense" }).locator("td").last(),
  ).toHaveText("PKR 800.00");
  await expect(
    byKind.locator("tbody tr").filter({ hasText: "Income" }).locator("td").last(),
  ).toHaveText("PKR 0.00");

  const byCategory = cardByTitle(page, "By expense category");
  await expect(byCategory).toHaveCount(1);
  await expect(
    byCategory.locator("tbody tr").filter({ hasText: "Utilities" }).locator("td").last(),
  ).toHaveText("PKR 800.00");

  // Recent movements is the first place a treasurer sees a reversal's warning tone.
  const recent = page.getByRole("region", { name: "Recent movements" });
  const recentOriginal = recent.getByRole("row").filter({ hasText: INCOME_DESCRIPTION });
  await expect(recentOriginal).toHaveCount(1);
  await expect(recentOriginal.getByRole("cell").nth(5)).toHaveText("Reversed");

  await page.goto(at("finance/transactions"));
  await expect(
    page.getByRole("row").filter({ hasText: INCOME_DESCRIPTION }).getByRole("cell").nth(5),
  ).toHaveText("Reversed");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: `Reversal of ${reference}:` })
      .getByRole("cell")
      .nth(5),
  ).toHaveText("Posted");

  /* ---- 9. a viewer reads the ledger and is offered no way to change it ------------ */
  await page.context().clearCookies();
  await signIn(page, VIEWER_EMAIL);

  // `/finance` carries no `actions` prop at all, so "Record income" can never appear there.
  // The two registers below are the pages that actually render the write controls.
  await page.goto(at("finance"));
  await expect(page.getByRole("heading", { level: 1, name: "Finance", exact: true })).toBeVisible();
  await expect(summaryValue(summary, "Income")).toHaveText("PKR 0.00");

  await page.goto(at("finance/transactions"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Transactions", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: INCOME_DESCRIPTION })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Record income", exact: true })).toHaveCount(0);

  await page.goto(at("finance/expenses"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Expenses", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: EXPENSE_DESCRIPTION })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Record expense", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New expense head", exact: true })).toHaveCount(0);

  // Read the journal detail too — `finance.view` is the only key this account holds.
  await page.goto(`/finance/transactions/${originalId}?institution=${institutionId}`);
  await expect(page.getByRole("heading", { level: 1, name: reference, exact: true })).toBeVisible();
  await expect(sectionTitled(page, "Header")).toHaveCount(1);
  await expect(headerField(sectionTitled(page, "Header"), "Status")).toHaveText("Reversed");
  // Reversal is gated on `finance.adjust`, so the control is simply absent — and the page
  // explains the absence in the domain's own words rather than leaving a blank.
  await expect(page.getByRole("button", { name: "Reverse", exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Only a posted journal can be reversed; this one is reversed.", {
      exact: true,
    }),
  ).toBeVisible();

  /* ---- 10. nothing blew up along the way ------------------------------------------ */
  expect(pageErrors).toEqual([]);
});
