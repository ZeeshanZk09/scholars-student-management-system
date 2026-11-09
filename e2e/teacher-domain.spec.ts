/**
 * Phase 14 — Teacher Domain and Teacher Portal end-to-end walkthrough.
 */
import { test, expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import { db } from "../src/db/client";
import {
  academicSessions,
  classes,
  classTeacherAssignments,
  departments,
  groups,
  institutions,
  permissions,
  sections,
  subjects,
  teachers,
  teacherSubjects,
  userCredentials,
  userPermissions,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/modules/auth/infrastructure/password";

const STAMP = Date.now();
const ADMIN_EMAIL = `admin-teacher-${STAMP}@example.test`;
const TEACHER_EMAIL = `teacher-${STAMP}@example.test`;
const OUTSIDER_EMAIL = `outsider-teacher-${STAMP}@example.test`;
const PASSWORD = "Password123!Teacher";
const INSTITUTE = `Teacher E2E Institute ${STAMP}`;
const SLUG = `teacher-e2e-${STAMP}`;
const TEACHER_FIRST = "Zainab";
const TEACHER_LAST = `Siddiqui ${STAMP}`;
const TEACHER_CODE = `T-${STAMP.toString().slice(-4)}`;

let adminUserId: string;
let teacherUserId: string;
let outsiderUserId: string;
let institutionId: string;
let sessionId: string;
let deptId: string;
let subjectId: string;
let classId: string;
let groupId: string;
let sectionId: string;

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

  // Create users
  for (const [email, name, assign] of [
    [ADMIN_EMAIL, "Admin User", (id: string) => (adminUserId = id)],
    [TEACHER_EMAIL, "Teacher User", (id: string) => (teacherUserId = id)],
    [OUTSIDER_EMAIL, "Outsider User", (id: string) => (outsiderUserId = id)],
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

  // Create institution
  const [inst] = await db
    .insert(institutions)
    .values({ name: INSTITUTE, slug: SLUG, email: ADMIN_EMAIL })
    .returning({ id: institutions.id });
  if (!inst) throw new Error("failed to create institution");
  institutionId = inst.id;

  // Permissions setup
  const permRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, ["academic.manage", "attendance.view"]));

  const permMap = new Map(permRows.map((p) => [p.key, p.id]));
  const academicManageId = permMap.get("academic.manage")!;
  const attendanceViewId = permMap.get("attendance.view")!;

  // Grant admin academic.manage + attendance.view at platform scope
  await db.insert(userPermissions).values([
    {
      userId: adminUserId,
      permissionId: academicManageId,
      institutionId: null,
      effect: "grant",
      reason: "e2e admin",
    },
    {
      userId: adminUserId,
      permissionId: attendanceViewId,
      institutionId: null,
      effect: "grant",
      reason: "e2e admin attendance view",
    },
  ]);

  // Grant teacher attendance.view at platform scope
  await db.insert(userPermissions).values({
    userId: teacherUserId,
    permissionId: attendanceViewId,
    institutionId: null,
    effect: "grant",
    reason: "e2e teacher attendance view",
  });

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

  const [dept] = await db
    .insert(departments)
    .values({
      institutionId,
      name: `Sciences ${STAMP}`,
      slug: `sciences-${STAMP}`,
    })
    .returning({ id: departments.id });
  deptId = dept!.id;

  const [subj] = await db
    .insert(subjects)
    .values({
      institutionId,
      departmentId: dept!.id,
      name: `Mathematics ${STAMP}`,
      slug: `math-${STAMP}`,
      code: `MATH-${STAMP.toString().slice(-3)}`,
      kind: "theory",
    })
    .returning({ id: subjects.id });
  subjectId = subj!.id;

  const [cls] = await db
    .insert(classes)
    .values({
      institutionId,
      academicSessionId: sessionId,
      name: `Grade 9 ${STAMP}`,
      slug: `grade-9-${STAMP}`,
      gradeLevel: 9,
    })
    .returning({ id: classes.id });
  classId = cls!.id;

  const [grp] = await db
    .insert(groups)
    .values({
      institutionId,
      classId: cls!.id,
      name: `Science Group ${STAMP}`,
      slug: `science-grp-${STAMP}`,
    })
    .returning({ id: groups.id });
  groupId = grp!.id;

  const [sec] = await db
    .insert(sections)
    .values({
      institutionId,
      groupId: grp!.id,
      name: `Rose ${STAMP}`,
      slug: `rose-${STAMP}`,
      capacity: 35,
    })
    .returning({ id: sections.id });
  sectionId = sec!.id;
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  if (!institutionId) return;

  await db.delete(classTeacherAssignments).where(eq(classTeacherAssignments.institutionId, institutionId));
  await db.delete(teacherSubjects).where(eq(teacherSubjects.teacherUserId, teacherUserId));
  await db.delete(teachers).where(eq(teachers.institutionId, institutionId));
  if (sectionId) await db.delete(sections).where(eq(sections.id, sectionId));
  if (groupId) await db.delete(groups).where(eq(groups.id, groupId));
  if (classId) await db.delete(classes).where(eq(classes.id, classId));
  if (subjectId) await db.delete(subjects).where(eq(subjects.id, subjectId));
  if (deptId) await db.delete(departments).where(eq(departments.id, deptId));
  if (sessionId) await db.delete(academicSessions).where(eq(academicSessions.id, sessionId));
  await db.delete(userPermissions).where(inArray(userPermissions.userId, [adminUserId, teacherUserId, outsiderUserId]));
  await db.delete(userCredentials).where(inArray(userCredentials.userId, [adminUserId, teacherUserId, outsiderUserId]));
  await db.delete(users).where(inArray(users.id, [adminUserId, teacherUserId, outsiderUserId]));
  await db.delete(institutions).where(eq(institutions.id, institutionId));
});

test("teacher domain and teacher portal walkthrough", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  /* ---- 1. Admin signs in and opens the Teachers directory ------------------ */
  await signIn(page, ADMIN_EMAIL);
  await page.goto(at("teachers"));
  await expect(page.getByRole("heading", { level: 1, name: "Teachers" })).toBeVisible();

  // Initially empty state
  await expect(page.getByText("No teachers yet")).toBeVisible();

  /* ---- 2. Admin creates a Teacher Profile --------------------------------- */
  await page.getByRole("button", { name: "Add teacher profile" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/^User account ID/).fill(teacherUserId);
  await dialog.getByLabel(/^First name/).fill(TEACHER_FIRST);
  await dialog.getByLabel(/^Last name/).fill(TEACHER_LAST);
  await dialog.getByLabel(/^Email/).fill(TEACHER_EMAIL);
  await dialog.getByLabel(/^Employee code/).fill(TEACHER_CODE);
  await dialog.getByLabel(/^Qualification/).fill("M.Phil Mathematics");
  await dialog.getByLabel(/^Max periods\/day/).fill("5");
  await dialog.getByRole("button", { name: "Create profile" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });

  // Teacher now appears in the table
  const row = page.getByRole("row").filter({ hasText: TEACHER_FIRST });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row.getByText(TEACHER_CODE)).toBeVisible();

  /* ---- 3. Admin opens the Teacher Detail page ----------------------------- */
  await row.getByRole("link", { name: "View & assign" }).click();
  await expect(page).toHaveURL(new RegExp(`/teachers/${teacherUserId}`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Teacher Details" })).toBeVisible();
  await expect(page.getByText(`Code: ${TEACHER_CODE}`)).toBeVisible();
  await expect(page.getByText("M.Phil Mathematics")).toBeVisible();

  /* ---- 4. Admin records subject competence -------------------------------- */
  await page.getByRole("button", { name: "Add subject competence" }).click();
  const compDialog = page.getByRole("dialog");
  await expect(compDialog).toBeVisible();
  await compDialog.getByRole("combobox", { name: "Subject" }).click();
  await page.getByRole("option", { name: new RegExp(`Mathematics ${STAMP}`) }).click();
  await compDialog.getByRole("button", { name: "Record competence" }).click();
  await expect(compDialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(`Mathematics ${STAMP}`)).toBeVisible();

  /* ---- 5. Admin assigns section & subject --------------------------------- */
  await page.getByRole("button", { name: "Assign section / subject" }).click();
  const assignDialog = page.getByRole("dialog");
  await expect(assignDialog).toBeVisible();
  await assignDialog.getByRole("combobox", { name: "Class Section" }).click();
  await page.getByRole("option").first().click();
  await assignDialog.getByRole("combobox", { name: "Subject" }).click();
  await page.getByRole("option", { name: new RegExp(`Mathematics ${STAMP}`) }).click();
  await assignDialog.getByLabel("Designate as Class Teacher (In-charge)").check();
  await assignDialog.getByRole("button", { name: "Save assignment" }).click();
  await expect(assignDialog).toHaveCount(0, { timeout: 30_000 });

  // Assignment row rendered in table
  const assignRow = page.getByRole("row").filter({ hasText: `Mathematics ${STAMP}` });
  await expect(assignRow).toHaveCount(1);
  await expect(assignRow.getByText("Class Teacher")).toBeVisible();

  /* ---- 6. Teacher signs in and views personal Teacher Portal -------------- */
  await signIn(page, TEACHER_EMAIL);
  await page.goto(at("teacher-portal"));
  await expect(page.getByRole("heading", { level: 1, name: "Teacher Portal" })).toBeVisible();

  // StatCards reflect the real assignments
  await expect(page.getByText("Assigned sections", { exact: true })).toBeVisible();
  await expect(page.getByText("1 active classes")).toBeVisible();
  await expect(page.getByText("Form master responsibilities")).toBeVisible();

  // The assigned section table shows the class
  const teacherAssignRow = page.getByRole("row").filter({ hasText: `Mathematics ${STAMP}` });
  await expect(teacherAssignRow).toHaveCount(1);
  await expect(teacherAssignRow.getByText("Class Teacher")).toBeVisible();

  /* ---- 7. Outsider is denied ---------------------------------------------- */
  await signIn(page, OUTSIDER_EMAIL);
  await page.goto(at("teachers"));
  await expect(page.getByText("Access denied")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
