/**
 * Phase 8 — the fee workflow, end to end.
 *
 * The gate specs prove *authorization*; this one proves the fee forms actually carry their data.
 * Create/Generate/Record/Grant/Request/Decide are six different payloads posted by six dialogs
 * while every action reads bare keys (`feeStructureId`, `dueOn`, `method`, `kind`, …) — the
 * wiring between the two lives only in the `name` attributes, and a missing one is invisible
 * until someone submits. Two of the steps are also economy edges: generating twice must not mint
 * a second invoice (the dedupe is a read, `studentId:feeStructureId`, un-cancelled), and a
 * deferral approval is refused unless the notes that the schema's superRefine demands are
 * actually in the form. Money is the third: `money()` renders `PKR 1500.00` with no separators
 * and no Latin-1 surprises, so the exact string the cashier would read is the assertion.
 *
 * Hermetic: a throwaway platform-scoped account with the fee keys plus `academic.manage`
 * (needed to mint the tenant through the UI — no affiliations, so platform scope, exactly like
 * `academic-master.spec.ts`), an institution it creates itself, and a second viewer account
 * holding `fees.view` alone. The academic chain underneath generation — session, class, group,
 * section, student, placement, enrollment — is seeded directly: the roster is an *input* to fee
 * generation, not the subject under test, and driving those seven forms is admission's job, not
 * this spec's. Every created row cascades from the institution row, which cleanup deletes.
 * It does not read the seed, and it does not assume the dev database is empty.
 */
import { test, expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";

import { db } from "../src/db/client";
import { permissions, userPermissions } from "../src/db/schema/authorization";
import { userCredentials, users } from "../src/db/schema/identity";
import { academicSessions, institutions } from "../src/db/schema/institution";
import { classes, groups, sections } from "../src/db/schema/academic";
import { studentEnrollments, studentPlacements, students } from "../src/db/schema/student";
import { feeInvoices, paymentAllocations, payments, receipts } from "../src/db/schema/fees";
import { expenses, journalTransactions } from "../src/db/schema/finance";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const EMAIL = `fees-workflow-${STAMP}@example.test`;
const VIEWER_EMAIL = `fees-viewer-${STAMP}@example.test`;
const PASSWORD = "Fees-workflow-87213!";
const INSTITUTE = `E2E Fees Institute ${STAMP}`;
const SESSION = `E2E Fees Year ${STAMP}`;
const CLASS_NAME = `E2E Fees Class ${STAMP}`;
const GROUP_NAME = `E2E Fees Group ${STAMP}`;
const SECTION_NAME = `E2E Fees Section ${STAMP}`;
const STRUCTURE = `E2E Fees Tuition ${STAMP}`;
const STUDENT_ADMISSION = `E2E-FEE-${STAMP}`;
const FIRST = "Zoya";
const LAST = "Khan";
const FULL_NAME = `${FIRST} ${LAST}`;
const ACADEMIC_YEAR = "2026-27";
const CONCESSION_REASON = `Sibling discount, e2e ${STAMP}`;
const DEFERRAL_REASON = `Travelling family, e2e ${STAMP}`;
const DECISION_NOTES = `Approved by the e2e walk ${STAMP}`;

/** The behaviour under test; the viewer needs the page read and nothing else. */
const GRANTS = [
  "fees.view",
  "fees.manage",
  "fees.record",
  "fees.adjust",
  "academic.manage",
] as const;
const VIEWER_GRANTS = ["fees.view"] as const;

let userId: string;
let viewerUserId: string;
let institutionId: string;

/** Local calendar day at an offset — the date inputs and the window asserts read the same strings. */
function day(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dom = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dom}`;
}

/** Institution-scoped path — the selector is a cookie, the URL carries the tenant (SECURITY §22). */
const at = (path: string) => `/${path}?institution=${institutionId}`;

/* -------------------------------------------------------------------------- */
/* 1. Setup — the tenant and every row generation will read                    */
/* -------------------------------------------------------------------------- */

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);

  // Warm the auth route before the first sign-in so that POST is JIT-compiled, not mid-test.
  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth route warm-up failed (${warmed.status})`);

  const stored = await hashPassword(PASSWORD);

  const [created] = await db
    .insert(users)
    .values({
      email: EMAIL,
      name: "Fees Workflow Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!created) throw new Error("failed to create the fees-workflow user");
  userId = created.id;
  await db
    .insert(userCredentials)
    .values({ userId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  const [viewer] = await db
    .insert(users)
    .values({
      email: VIEWER_EMAIL,
      name: "Fees Viewer Account",
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: users.id });
  if (!viewer) throw new Error("failed to create the fees-viewer user");
  viewerUserId = viewer.id;
  await db
    .insert(userCredentials)
    .values({ userId: viewerUserId, ...stored, rotatedAt: new Date(), updatedAt: new Date() });

  // Platform scope, no `user_institutions` row: the principal is unbound, which is what lets it
  // mint a tenant and then administer that tenant without an affiliation of its own. A fee grant
  // at platform scope resolves at any institution (`hasPermission`, see authorization-service).
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
      reason: "e2e: driving the fee workflow UI",
    });
  };
  for (const key of GRANTS) await grant(userId, key);
  for (const key of VIEWER_GRANTS) await grant(viewerUserId, key);

  // The tenant is minted through the UI (the "Add institution" button needs academic.manage,
  // which the grant above provides); the academic chain underneath it is seeded directly.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);

    await page.goto("/academics");
    await page.getByRole("button", { name: "Add institution" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Institution name").fill(INSTITUTE);
    await dialog.getByLabel("Type").click();
    await page.getByRole("option", { name: "School", exact: true }).click();
    await dialog.getByLabel("Contact email").fill(`owner-${STAMP}@example.test`);
    await submit(page, "Create institution");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const [createdInstitution] = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.name, INSTITUTE));
    if (!createdInstitution) throw new Error("the minted institution did not persist");
    institutionId = createdInstitution.id;

    // Session → class → group → section → student → placement → enrollment. Generation reads the
    // enrolled student through `studentEnrollments` as the roster (the placement only labels it
    // for class-scoped structures), so the enrollment row is what makes the student billable.
    const [sessionRow] = await db
      .insert(academicSessions)
      .values({
        institutionId,
        name: SESSION,
        slug: `e2e-fees-sess-${STAMP}`,
        startDate: "2026-08-01",
        endDate: "2027-06-30",
      })
      .returning({ id: academicSessions.id });
    if (!sessionRow) throw new Error("the fee-workflow session was not inserted");
    const sessionId = sessionRow.id;

    const [classRow] = await db
      .insert(classes)
      .values({
        institutionId,
        academicSessionId: sessionId,
        name: CLASS_NAME,
        slug: `e2e-fees-class-${STAMP}`,
        gradeLevel: 9,
      })
      .returning({ id: classes.id });
    if (!classRow) throw new Error("the fee-workflow class was not inserted");

    const [groupRow] = await db
      .insert(groups)
      .values({
        institutionId,
        classId: classRow.id,
        name: GROUP_NAME,
        slug: `e2e-fees-group-${STAMP}`,
      })
      .returning({ id: groups.id });
    if (!groupRow) throw new Error("the fee-workflow group was not inserted");

    const [sectionRow] = await db
      .insert(sections)
      .values({
        institutionId,
        groupId: groupRow.id,
        name: SECTION_NAME,
        slug: `e2e-fees-section-${STAMP}`,
      })
      .returning({ id: sections.id });
    if (!sectionRow) throw new Error("the fee-workflow section was not inserted");

    const [studentRow] = await db
      .insert(students)
      .values({
        institutionId,
        admissionNumber: STUDENT_ADMISSION,
        email: `student-${STAMP}@example.test`,
        firstName: FIRST,
        lastName: LAST,
        slug: `e2e-fees-stu-${STAMP}`,
      })
      .returning({ id: students.id });
    if (!studentRow) throw new Error("the fee-workflow student was not inserted");

    await db.insert(studentPlacements).values({
      studentId: studentRow.id,
      academicSessionId: sessionId,
      sectionId: sectionRow.id,
      classId: classRow.id,
      placementReason: "admission",
    });

    await db.insert(studentEnrollments).values({
      studentId: studentRow.id,
      institutionId,
      academicSessionId: sessionId,
      academicYear: ACADEMIC_YEAR,
      enrolledOn: day(),
    });
  } finally {
    await context.close();
  }
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
    // Money rows are deliberately RESTRICT-bound (`RULES.md` §36: a paid invoice is history), so
    // the tenant cascade stops at them: `payment_allocations` pin both the payment and the invoice
    // it settles, and invoices/payments pin their student. Delete in dependency order before the
    // institution, or `delete institutions` violates `payment_allocations_invoice_id_fk`. Everything
    // else — structures, items, audit, lines, deferrals, concessions, plans — cascades with the
    // tenant, and the two throwaway accounts carry no affiliation of their own.
    await db.delete(paymentAllocations).where(
      sql`exists (
        select 1 from "fee_invoices"
        where "fee_invoices"."id" = ${paymentAllocations.invoiceId}
          and "fee_invoices"."institution_id" = ${institutionId}
      )`,
    );
    await db.delete(receipts).where(eq(receipts.institutionId, institutionId));
    await db.delete(payments).where(eq(payments.institutionId, institutionId));
    await db.delete(feeInvoices).where(eq(feeInvoices.institutionId, institutionId));
    // The fee→finance seam (Phase 10) posts a journal and provisions the default accounts inside
    // `recordPayment`, so a payment this spec recorded has left `journal_transactions` behind. The
    // institution cascade would take the accounts with it, but `ledger_entries.account_id` is
    // RESTRICT and its entries only fall when their journal does — delete the journal first, and
    // `expenses` ahead of it (`expenses.journal_transaction_id` is RESTRICT too; there are none
    // here, but the ordering is the invariant). The remaining finance rows cascade with the tenant.
    await db.delete(expenses).where(eq(expenses.institutionId, institutionId));
    await db
      .delete(journalTransactions)
      .where(eq(journalTransactions.institutionId, institutionId));
    await db.delete(institutions).where(eq(institutions.id, institutionId));
  }
  // No `db.$client.end()`: the worker's pg pool outlives this file (see `auth.spec.ts`).
});

async function signIn(page: import("@playwright/test").Page, email = EMAIL): Promise<void> {
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
async function choose(
  page: import("@playwright/test").Page,
  label: string,
  option: string,
): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Submit a button inside the single open dialog (triggers and submits can share a name). */
async function submit(page: import("@playwright/test").Page, label: string): Promise<void> {
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

test("the fee workflow can be driven through the UI", async ({ page }) => {
  test.setTimeout(120_000);

  // An uncaught exception anywhere in the tour is a defect — a silent one at that.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const tomorrow = day(1);

  /* ---- 2. sign in — the beforeAll's browser session was its own ------------------- */
  await signIn(page);

  /* ---- 3. the dashboard reads a fresh tenant as zeroed and open -------------------- */
  await page.goto(at("fees"));
  await expect(page.getByRole("heading", { level: 1, name: "Fees", exact: true })).toBeVisible();
  await expect(page.getByText("Total invoiced", { exact: true })).toBeVisible();
  await expect(page.getByText("No invoices yet", { exact: true })).toBeVisible();
  // The nav item is the enabled link (every unbuilt entry renders an inert span plus a
  // "Planned" badge), so the badge must not be riding on this one.
  const feesItem = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: "Fees", exact: true }) })
    .first();
  await expect(feesItem).toBeVisible();
  await expect(feesItem.getByText("Planned", { exact: true })).toHaveCount(0);

  /* ---- 4. a structure bills everyone from yesterday to next year ------------------- */
  await page.goto(at("fees/structures"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Fee structures", exact: true }),
  ).toBeVisible();
  // Two triggers column the empty state (header + action button); the click takes the first.
  await page.getByRole("button", { name: "New fee structure", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const dialog = page.getByRole("dialog");
  // Required fields render their label as "Name *" (the marker is part of the label text), so
  // `exact: true` on the bare word never matches. Anchor a regex at the start instead: it still
  // disambiguates "Name" from "Item name" and "Amount" from "Discount amount".
  await dialog.getByLabel(/^Name/).fill(STRUCTURE);
  await expect(dialog.getByRole("combobox", { name: "Applies to" })).toContainText("All students");
  await expect(dialog.getByLabel(/^Currency/)).toHaveValue("PKR");
  await dialog.getByLabel(/^Effective from/).fill(day(-1));
  await dialog.getByLabel(/^Effective to/).fill(day(365));
  await dialog.getByLabel(/^Item name/).fill("Tuition");
  await dialog.getByLabel(/^Amount/).fill("1500");
  // The item's own defaults must survive untouched: a frequency or category that posted as ""
  // would fail the enum far away — at billing time or inside a 500 — rather than here.
  await expect(dialog.getByRole("combobox", { name: "Frequency" })).toContainText("One time");
  await expect(dialog.getByRole("combobox", { name: "Category" })).toContainText("Other");
  // Base UI renders the labelled input `aria-hidden` next to a `role="checkbox"` button that
  // carries the accessible name (and a generated `aria-labelledby`), so `getByRole("checkbox")`
  // pins exactly the visible control that `getByLabel` would match twice over.
  await expect(dialog.getByRole("checkbox", { name: "Mandatory", exact: true })).toBeChecked();
  // Generation reads only active structures; a box left unchecked here would fail far away from
  // the field that caused it — "no applicable structure" at billing time.
  await expect(
    dialog.getByRole("checkbox", {
      name: "Active — generation may bill from this structure",
      exact: true,
    }),
  ).toBeChecked();
  await submit(page, "Create structure");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const structureRow = page.getByRole("row").filter({ hasText: STRUCTURE });
  await expect(structureRow).toHaveCount(1);
  await expect(structureRow.getByText("All students", { exact: true })).toBeVisible();
  await expect(structureRow.getByText("Any session", { exact: true })).toBeVisible();
  await expect(structureRow.getByText("1", { exact: true })).toBeVisible();
  await expect(structureRow.getByText("Active", { exact: true })).toBeVisible();

  /* ---- 5. generation prices the enrolled student once, PKR 1500.00 ----------------- */
  await page.goto(at("fees"));
  // The dashboard's header actions carry the generate dialog behind fees.manage.
  await page.getByRole("button", { name: "Generate invoices", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await choose(page, "Session", SESSION);
  await dialog.getByLabel(/^Due date/).fill(tomorrow);
  await submit(page, "Generate invoices");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(at("fees/invoices"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Fee invoices", exact: true }),
  ).toBeVisible();
  const invoiceRow = page.getByRole("row").filter({ hasText: FULL_NAME });
  await expect(invoiceRow).toHaveCount(1);
  await expect(invoiceRow.getByText("Pending", { exact: true })).toBeVisible();
  // Total and outstanding are the same figure before any money moves — both cells, one assert.
  await expect(invoiceRow.getByText("PKR 1500.00", { exact: true })).toHaveCount(2);

  /* ---- 6. regenerating the same pair skips the invoice it already made -------------- */
  await page.getByRole("button", { name: "Generate invoices", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await choose(page, "Session", SESSION);
  await dialog.getByLabel(/^Due date/).fill(tomorrow);
  await submit(page, "Generate invoices");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The "0 created, 1 skipped" message dies with the dialog; what survives is the row the
  // dedupe declined to double — one invoice for this student, total unchanged.
  await expect(invoiceRow).toHaveCount(1);
  await expect(invoiceRow.getByText("PKR 1500.00", { exact: true })).toHaveCount(2);

  /* ---- 7. a cash payment halves the outstanding to PKR 1000.00 ---------------------- */
  await invoiceRow.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\/fees\/invoices\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Method" })).toContainText("Cash");
  await dialog.getByLabel(/^Amount/).fill("500");
  await submit(page, "Record payment");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Outcome, not the transient "Payment recorded.": the header badge and the derived balance.
  await expect(page.getByText("Partially paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PKR 1000.00", { exact: true })).toBeVisible();

  /* ---- 8. a concession reasons itself onto the invoice ------------------------------ */
  await page.getByRole("button", { name: "Grant concession", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await choose(page, "Kind", "Discount");
  await dialog.getByLabel(/^Percentage/).fill("10");
  await dialog.getByLabel(/^Reason/).fill(CONCESSION_REASON);
  await submit(page, "Grant concession");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const concessionRow = page.getByRole("row").filter({ hasText: CONCESSION_REASON });
  await expect(concessionRow).toHaveCount(1);
  await expect(concessionRow.getByText("Discount", { exact: true })).toBeVisible();
  await expect(concessionRow.getByText("10%", { exact: true })).toBeVisible();
  await expect(concessionRow.getByText(CONCESSION_REASON, { exact: true })).toBeVisible();
  // The concession must actually move the balance: 10% of the 1500.00 billed is 150.00, so with
  // 500.00 already allocated the outstanding falls to 850.00 — a write-off rendered but never
  // applied would leave 1000.00 standing (the defect this guards).
  await expect(page.getByText("PKR 850.00", { exact: true })).toBeVisible();

  /* ---- 9. a deferral is requested and then decided ----------------------------------- */
  const deferralFrom = day(0);
  const deferralUntil = day(14);
  await page.getByRole("button", { name: "Request deferral", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog.getByLabel(/^Reason/).fill(DEFERRAL_REASON);
  await dialog.getByLabel(/^Requested from/).fill(deferralFrom);
  await dialog.getByLabel(/^Requested until/).fill(deferralUntil);
  await submit(page, "Request deferral");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const deferralRow = page
    .getByRole("row")
    .filter({ hasText: `${deferralFrom} → ${deferralUntil}` });
  await expect(deferralRow).toHaveCount(1);
  await expect(deferralRow.getByText("Pending", { exact: true })).toBeVisible();
  await deferralRow.getByRole("button", { name: "Decide", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  // The trigger is the visible `role="checkbox"` button (its labelled input is `aria-hidden`);
  // clicking it toggles the box, and `toBeChecked` reads the button's `aria-checked`.
  const approveBox = dialog.getByRole("checkbox", { name: "Approve this deferral", exact: true });
  await approveBox.click();
  await expect(approveBox).toBeChecked();
  // The boundary refuses an approval without notes, so the dialog alone is not enough — the
  // field the schema's superRefine demands has to be submitted with the decision.
  await dialog.getByLabel(/^Decision notes/).fill(DECISION_NOTES);
  await submit(page, "Save decision");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(deferralRow.getByText("Approved", { exact: true })).toBeVisible();
  // Deciding is not bookkeeping: an approved deferral suspends collection, so the invoice itself
  // must read "Deferred", not stay "Partially paid" while no one is looking (the defect this
  // guards). `.first()` pins the header badge, the one the page re-derives from the row.
  await expect(page.getByText("Deferred", { exact: true }).first()).toBeVisible();

  /* ---- 10. fees.view sees the page and none of the writes ---------------------------- */
  await page.context().clearCookies();
  await signIn(page, VIEWER_EMAIL);
  await page.goto(at("fees"));
  await expect(page.getByRole("heading", { level: 1, name: "Fees", exact: true })).toBeVisible();
  // The read half of the page still renders for a view-only grant…
  await expect(page.getByText("Total invoiced", { exact: true })).toBeVisible();
  // …and every mutation trigger the header gates on fees.manage is gone.
  await expect(page.getByRole("button", { name: "New fee structure", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate invoices", exact: true })).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});
