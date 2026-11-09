/**
 * Phase 15 — Attendance Engine end-to-end walkthrough.
 *
 * Covers:
 * 1. Attendance Dashboard (/attendance) — KPI cards, daily session status, section directory.
 * 2. Section Attendance Sheet (/attendance/[sectionId]) — Student roster display, 1-click status selection.
 * 3. Mark-all-present & draft save workflow.
 * 4. Register finalization & submission — locks marks into published state.
 * 5. Audited post-publication correction flow — reasons, before/after status.
 * 6. Live dashboard sync — register shows "Submitted" and counts update.
 * 7. Authorization scope enforcement — unauthorized access denied.
 */
import { test, expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/db/client";
import {
  academicSessions,
  attendanceCorrections,
  attendanceRecords,
  attendanceSessions,
  classes,
  dailyAttendanceSummaries,
  groups,
  institutions,
  permissions,
  sections,
  studentPlacements,
  students,
  timeSlots,
  userCredentials,
  userPermissions,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const ADMIN_EMAIL = `admin-att-${STAMP}@example.test`;
const OUTSIDER_EMAIL = `outsider-att-${STAMP}@example.test`;
const PASSWORD = "Password123!Att";
const INSTITUTE = `Attendance E2E Institute ${STAMP}`;
const SLUG = `attendance-e2e-${STAMP}`;

let adminUserId: string;
let outsiderUserId: string;
let institutionId: string;
let sessionId: string;
let classId: string;
let groupId: string;
let sectionId: string;
let slotId: string;
let student1Id: string;
let student2Id: string;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/", { timeout: 30_000 });
}

function at(path: string): string {
  return `/${path}?institution=${encodeURIComponent(institutionId)}`;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);

  const warmed = await fetch("http://localhost:3000/api/auth/csrf");
  if (!warmed.ok) throw new Error(`auth warm-up failed: ${warmed.status}`);

  const stored = await hashPassword(PASSWORD);

  // Create admin & outsider users
  for (const [email, name, assign] of [
    [ADMIN_EMAIL, "Attendance Admin", (id: string) => (adminUserId = id)],
    [OUTSIDER_EMAIL, "Attendance Outsider", (id: string) => (outsiderUserId = id)],
  ] as const) {
    const [created] = await db
      .insert(users)
      .values({ email, name, status: "active", updatedAt: new Date() })
      .returning({ id: users.id });
    if (!created) throw new Error(`failed to create ${email}`);
    assign(created.id);

    await db.insert(userCredentials).values({
      userId: created.id,
      ...stored,
      rotatedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Create test institution
  const [inst] = await db
    .insert(institutions)
    .values({ name: INSTITUTE, slug: SLUG, email: ADMIN_EMAIL })
    .returning({ id: institutions.id });
  if (!inst) throw new Error("failed to create institution");
  institutionId = inst.id;

  // Permissions setup: grant admin attendance.view, attendance.mark, attendance.update, academic.manage
  const permRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(
      inArray(permissions.key, [
        "academic.manage",
        "attendance.view",
        "attendance.mark",
        "attendance.update",
      ]),
    );

  const permMap = new Map(permRows.map((p) => [p.key, p.id]));
  const academicManageId = permMap.get("academic.manage")!;
  const attendanceViewId = permMap.get("attendance.view")!;
  const attendanceMarkId = permMap.get("attendance.mark")!;
  const attendanceUpdateId = permMap.get("attendance.update")!;

  await db.insert(userPermissions).values([
    {
      userId: adminUserId,
      permissionId: academicManageId,
      institutionId: null,
      effect: "grant",
      reason: "e2e admin academic",
    },
    {
      userId: adminUserId,
      permissionId: attendanceViewId,
      institutionId: null,
      effect: "grant",
      reason: "e2e admin attendance view",
    },
    {
      userId: adminUserId,
      permissionId: attendanceMarkId,
      institutionId: null,
      effect: "grant",
      reason: "e2e admin attendance mark",
    },
    {
      userId: adminUserId,
      permissionId: attendanceUpdateId,
      institutionId: null,
      effect: "grant",
      reason: "e2e admin attendance update",
    },
  ]);

  // Seed academic hierarchy
  const [session] = await db
    .insert(academicSessions)
    .values({
      institutionId,
      name: `Session ${STAMP}`,
      slug: `session-${STAMP}`,
      startDate: "2026-08-01",
      endDate: "2027-06-30",
      isCurrent: true,
    })
    .returning({ id: academicSessions.id });
  sessionId = session!.id;

  const [cls] = await db
    .insert(classes)
    .values({
      institutionId,
      academicSessionId: sessionId,
      name: `Grade 9 ${STAMP}`,
      slug: `grade-9-${STAMP}`,
      gradeLevel: 1,
    })
    .returning({ id: classes.id });
  classId = cls!.id;

  const [grp] = await db
    .insert(groups)
    .values({
      institutionId,
      classId,
      name: "General",
      slug: `general-${STAMP}`,
    })
    .returning({ id: groups.id });
  groupId = grp!.id;

  const [sec] = await db
    .insert(sections)
    .values({
      institutionId,
      groupId,
      name: "Rose",
      slug: `rose-${STAMP}`,
      capacity: 35,
    })
    .returning({ id: sections.id });
  sectionId = sec!.id;

  const [slot] = await db
    .insert(timeSlots)
    .values({
      institutionId,
      name: "Period 1",
      startTime: "08:30:00",
      endTime: "09:15:00",
      sequence: 1,
    })
    .returning({ id: timeSlots.id });
  slotId = slot!.id;

  // Seed two students in this section
  const [s1] = await db
    .insert(students)
    .values({
      institutionId,
      admissionNumber: `ADM-${STAMP}-01`,
      rollNumber: "101",
      firstName: "Hassan",
      lastName: `Raza ${STAMP}`,
      email: `student1-${STAMP}@example.test`,
      slug: `hassan-raza-${STAMP}`,
      lifecycle: "admitted",
    })
    .returning({ id: students.id });
  student1Id = s1!.id;

  const [s2] = await db
    .insert(students)
    .values({
      institutionId,
      admissionNumber: `ADM-${STAMP}-02`,
      rollNumber: "102",
      firstName: "Fatima",
      lastName: `Ali ${STAMP}`,
      email: `student2-${STAMP}@example.test`,
      slug: `fatima-ali-${STAMP}`,
      lifecycle: "admitted",
    })
    .returning({ id: students.id });
  student2Id = s2!.id;

  // Place students into the section
  await db.insert(studentPlacements).values([
    {
      studentId: student1Id,
      academicSessionId: sessionId,
      sectionId,
      classId,
      isCurrent: true,
      placementReason: "admission",
    },
    {
      studentId: student2Id,
      academicSessionId: sessionId,
      sectionId,
      classId,
      isCurrent: true,
      placementReason: "admission",
    },
  ]);
});

test.afterAll(async () => {
  // Clean up attendance records and test records
  await db.delete(attendanceCorrections).where(eq(attendanceCorrections.sectionId, sectionId));
  await db.delete(attendanceRecords).where(eq(attendanceRecords.sectionId, sectionId));
  await db.delete(attendanceSessions).where(eq(attendanceSessions.sectionId, sectionId));
  await db.delete(dailyAttendanceSummaries).where(inArray(dailyAttendanceSummaries.studentId, [student1Id, student2Id]));
  await db.delete(studentPlacements).where(eq(studentPlacements.sectionId, sectionId));
  await db.delete(students).where(inArray(students.id, [student1Id, student2Id]));
  await db.delete(sections).where(eq(sections.id, sectionId));
  await db.delete(groups).where(eq(groups.id, groupId));
  await db.delete(classes).where(eq(classes.id, classId));
  await db.delete(timeSlots).where(eq(timeSlots.id, slotId));
  await db.delete(academicSessions).where(eq(academicSessions.id, sessionId));
  await db.delete(userPermissions).where(inArray(userPermissions.userId, [adminUserId, outsiderUserId]));
  await db.delete(institutions).where(eq(institutions.id, institutionId));
  await db.delete(userCredentials).where(inArray(userCredentials.userId, [adminUserId, outsiderUserId]));
  await db.delete(users).where(inArray(users.id, [adminUserId, outsiderUserId]));
});

test("Phase 15: Attendance Engine complete end-to-end walkthrough", async ({ page }) => {
  test.setTimeout(120_000);

  /* -------------------------------------------------------------------------- */
  /* 1. Dashboard Overview                                                      */
  /* -------------------------------------------------------------------------- */
  await signIn(page, ADMIN_EMAIL);
  await page.goto(at("attendance"));

  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Total Sections")).toBeVisible();
  await expect(page.getByText("Registers Submitted")).toBeVisible();
  await expect(page.getByText("Rose")).toBeVisible();
  await expect(page.getByRole("table").getByText("Not Started")).toBeVisible();

  /* -------------------------------------------------------------------------- */
  /* 2. Navigate to Register & Take Attendance                                  */
  /* -------------------------------------------------------------------------- */
  const takeAttendanceLink = page.getByRole("link", { name: "Take Attendance" });
  await expect(takeAttendanceLink).toBeVisible();
  await takeAttendanceLink.click();

  await expect(page.getByRole("heading", { name: /Section Attendance Register/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Period Attendance Register")).toBeVisible();
  await expect(page.getByText("In Progress (Draft)")).toBeVisible();
  await expect(page.getByText("Hassan")).toBeVisible();
  await expect(page.getByText("Fatima")).toBeVisible();

  // Mark all present
  await page.getByRole("button", { name: "Mark All Present" }).click();

  // Toggle Fatima to Absent
  const fatimaRow = page.locator("tr").filter({ hasText: "Fatima" });
  await fatimaRow.getByRole("button", { name: "Absent" }).click();

  // Save Draft
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Attendance marks saved as draft.")).toBeVisible({ timeout: 10_000 });

  /* -------------------------------------------------------------------------- */
  /* 3. Finalize & Submit Register                                              */
  /* -------------------------------------------------------------------------- */
  const submitBtn = page.getByRole("button", { name: "Finalize & Submit" });
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  await expect(page.getByText("Attendance register finalized and published.")).toBeVisible({ timeout: 10_000 });

  // Reload to verify published state persisted
  await page.reload();
  await expect(page.getByText("Finalized & Submitted")).toBeVisible({ timeout: 10_000 });

  /* -------------------------------------------------------------------------- */
  /* 4. Audited Post-Publication Correction                                     */
  /* -------------------------------------------------------------------------- */
  const fatimaRowAfterSubmit = page.locator("tr").filter({ hasText: "Fatima" });
  await expect(fatimaRowAfterSubmit.getByRole("button", { name: "Correct Mark" })).toBeVisible();
  await fatimaRowAfterSubmit.getByRole("button", { name: "Correct Mark" }).click();

  await expect(page.getByText("Record Attendance Correction")).toBeVisible();
  await page.getByRole("combobox", { name: "New Correct Status" }).click();
  await page.getByRole("option", { name: "Present", exact: true }).click();
  await page.getByLabel("Reason for Correction").fill("Student arrived late with health room pass");
  await page.getByRole("button", { name: "Submit Correction" }).click();

  // Dialog closes on success and table row displays the audited correction badge
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator("tr").filter({ hasText: "Fatima" })).toContainText("Corrected from absent");
  await expect(page.locator("tr").filter({ hasText: "Fatima" })).toContainText("PRESENT");

  /* -------------------------------------------------------------------------- */
  /* 5. Dashboard Synchronization                                               */
  /* -------------------------------------------------------------------------- */
  await page.goto(at("attendance"));
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  await expect(page.getByRole("table").getByText("Submitted")).toBeVisible();

  /* -------------------------------------------------------------------------- */
  /* 6. Security & Unauthorized Access Denial                                   */
  /* -------------------------------------------------------------------------- */
  await signIn(page, OUTSIDER_EMAIL);
  await page.goto(at("attendance"));

  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("You do not have permission to view or take student attendance.")).toBeVisible();
});
