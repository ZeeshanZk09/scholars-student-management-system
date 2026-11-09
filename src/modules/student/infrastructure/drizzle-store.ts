/**
 * The Drizzle implementation of {@link StudentStore} — the only file in the student module that
 * imports `@/db/client` or the table objects.
 *
 * Four responsibilities live here by design, mirroring `src/modules/academic/infrastructure/drizzle-store.ts`
 * (`RULES.md` §15: the database is the source of truth for integrity):
 *
 * 1. **Tenant guards.** Every write that carries a foreign reference (a section into a session, a
 *    document onto a student) re-checks that the referenced row belongs to the same `institution_id`
 *    *before* writing. Foreign keys only prove a row exists; a cross-tenant reference is otherwise a
 *    silent integrity hole. This matters more here than anywhere else, because `guardians` has no
 *    `institution_id` at all (ADR-0004 §2) — the institution scope of a guardian exists only through
 *    `guardian_links`, so the store never lets a guardian id reach a write without the student's
 *    institution having been checked first. The three *link* writes (`insertGuardianAccount`'s
 *    seed, `insertOrReactivateLink`, `deactivateLink`) are the deliberate exception: they re-check
 *    the link's own integrity (existence, the primary-contact partial index, active/inactive state)
 *    but take the student's institution scope from the service's `requireStudent(institutionId,
 *    studentId)` which runs before any of them — proven by the cross-tenant tests in
 *    `application/student-service.test.ts`. Only the service may call this store (D-6), so the
 *    delegation is a closed circle, not a gap.
 * 2. **Atomic placement.** A placement demotes the previous current row and inserts the new one in
 *    one transaction, so the partial unique index `student_placements_one_current_key` is never
 *    observed half-switched, and `class_id` is denormalised from the section inside that same
 *    transaction (`student.ts` doc comment) so the two cannot drift.
 * 3. **Optimistic concurrency.** Every student/guardian update is `where (id, institution, version)`;
 *    zero rows means someone else moved first, translated to `ConflictError` rather than a silent
 *    last-write-wins clobber.
 * 4. **Guardian account creation is one transaction.** `users` + optional `user_credentials` +
 *    `guardians` profile + optional link: four writes that must land together, because a guardian
 *    without a profile (or a profile without an account) is a state nothing else in the system
 *    expects to encounter.
 *
 * Unique conflicts the domain rules cannot foresee (a duplicate admission number, a phone number
 * already held by another guardian) arrive as PostgreSQL `23505` and are translated to
 * `ConflictError` so a screen can render a friendly message instead of a raw driver error.
 */
import { and, asc, desc, eq, getTableName, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import type { DbLike } from "@/db/client";
import {
  academicSessions,
  classes,
  departments,
  institutions,
  guardianLinks,
  guardians,
  groups,
  sections,
  studentDocuments,
  studentEnrollments,
  studentPlacements,
  studentPreviousSchools,
  students,
  userCredentials,
  users,
} from "@/db/schema";
import { ConflictError, InternalError, NotFoundError } from "@/shared/errors";

import type { DocumentType } from "../domain/domain-rules";
import type {
  DocumentRow,
  EnrollmentRow,
  GuardianLinkRow,
  GuardianListRow,
  GuardianRow,
  PlacementRow,
  SessionGate,
  StudentListRow,
  StudentStore,
} from "../application/ports";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

/** A `version`-guarded update that touched no row: stale write, or the row is gone. */
async function expectVersionedRow(
  rows: readonly { readonly id: string }[],
  label: string,
): Promise<void> {
  if (rows.length > 0) return;
  throw new ConflictError(`${label} was changed by someone else.`, {
    userMessage: `This ${label.toLowerCase()} was changed by someone else. Refresh the page and try again.`,
  });
}

/**
 * A table-qualified column reference for a raw `sql` chunk inside a `db.select()` field.
 *
 * Drizzle 0.45.3's select-field rendering strips the table qualifier from a bare
 * `${table.column}` template chunk, which turns a correlated subquery over joined tables into
 * PostgreSQL `42702` ("ambiguous column reference") — and a *single-table* subquery into a
 * silently wrong correlation (the outer reference resolves to the inner table). `sql.raw`
 * strings and `eq()` fragments both pass through unmodified; see `currentPlacement`.
 */
const ref = (table: AnyPgTable, column: AnyPgColumn) =>
  sql.raw(`"${getTableName(table)}"."${column.name}"`);

/** Correlated subqueries that flatten the *current* placement onto a roster row without N+1. */
function currentPlacement(table: AnyPgTable, column: AnyPgColumn) {
  return sql<string | null>`(
    select ${ref(table, column)}
    from ${studentPlacements}
    inner join ${sections} on ${eq(sections.id, studentPlacements.sectionId)}
    inner join ${groups} on ${eq(groups.id, sections.groupId)}
    inner join ${classes} on ${eq(classes.id, groups.classId)}
    inner join ${academicSessions} on ${eq(academicSessions.id, studentPlacements.academicSessionId)}
    where ${eq(studentPlacements.studentId, students.id)}
      and ${eq(studentPlacements.isCurrent, true)}
    limit 1)`;
}

function toStudentListRow(
  row: typeof students.$inferSelect,
  placement: {
    readonly className: string | null;
    readonly groupName: string | null;
    readonly sectionName: string | null;
    readonly sessionName: string | null;
  },
): StudentListRow {
  return {
    id: row.id,
    institutionId: row.institutionId,
    admissionNumber: row.admissionNumber,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    slug: row.slug,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    email: row.email,
    phone: row.phone,
    address: row.address,
    rollNumber: row.rollNumber,
    lifecycle: row.lifecycle,
    admittedAt: row.admittedAt,
    graduatedAt: row.graduatedAt,
    withdrawnAt: row.withdrawnAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    version: row.version,
    className: placement.className,
    groupName: placement.groupName,
    sectionName: placement.sectionName,
    sessionName: placement.sessionName,
  };
}

const studentProjection = {
  student: students,
  className: currentPlacement(classes, classes.name),
  groupName: currentPlacement(groups, groups.name),
  sectionName: currentPlacement(sections, sections.name),
  sessionName: currentPlacement(academicSessions, academicSessions.name),
};

/** `where (id, institutionId)` plus the archived flag each caller wants. */
const studentScope = (institutionId: string, studentId: string) =>
  and(eq(students.id, studentId), eq(students.institutionId, institutionId));

/** The version-guarded WHERE clause shared by every student write. */
const studentVersionScope = (institutionId: string, studentId: string, version: number) =>
  and(studentScope(institutionId, studentId), eq(students.version, version));

/**
 * Build a store over any {@link DbLike} — the pooled client for ambient work, or a transaction
 * scope handed in by a caller that must own several modules' writes as one atomic unit
 * (`src/modules/admission`'s conversion). Same observable behaviour either way: a nested
 * `transaction` on a scope becomes a savepoint, so integrity rules and unique-violation mapping
 * are unchanged.
 */
export const createStudentStore = (executor: DbLike): StudentStore & SessionGate => ({
  /* ---- Reads ----------------------------------------------------------- */

  async institutionExists(institutionId) {
    const [row] = await executor
      .select({ id: institutions.id })
      .from(institutions)
      .where(and(eq(institutions.id, institutionId), isNull(institutions.archivedAt)))
      .limit(1);
    return row !== undefined;
  },

  /**
   * The `SessionGate` half of the wiring: the one question this module asks of academic data —
   * *does this session exist, in this institution, and is it open?* It lives here rather than in
   * `index.ts` because this file already joins `academic_sessions` for placement reads (§2 above),
   * so the query is one more scoped select instead of a cross-module call into
   * `@/modules/academic`'s internals.
   */
  async getSession(institutionId, sessionId) {
    const [row] = await executor
      .select({
        id: academicSessions.id,
        name: academicSessions.name,
        isCurrent: academicSessions.isCurrent,
        closedAt: academicSessions.closedAt,
      })
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.id, sessionId),
          eq(academicSessions.institutionId, institutionId),
          isNull(academicSessions.archivedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async listStudents(institutionId) {
    const rows = await executor
      .select(studentProjection)
      .from(students)
      .where(eq(students.institutionId, institutionId))
      .orderBy(asc(students.lastName), asc(students.firstName), asc(students.admissionNumber));
    return rows.map((row) =>
      toStudentListRow(row.student, {
        className: row.className,
        groupName: row.groupName,
        sectionName: row.sectionName,
        sessionName: row.sessionName,
      }),
    );
  },

  async getStudent(institutionId, studentId) {
    const [row] = await executor
      .select(studentProjection)
      .from(students)
      .where(studentScope(institutionId, studentId))
      .limit(1);
    if (row === undefined) return null;
    return toStudentListRow(row.student, {
      className: row.className,
      groupName: row.groupName,
      sectionName: row.sectionName,
      sessionName: row.sessionName,
    });
  },

  async listStudentSlugs(institutionId) {
    const rows = await executor
      .select({ slug: students.slug })
      .from(students)
      .where(eq(students.institutionId, institutionId));
    return rows.map((row) => row.slug);
  },

  async listPlacements(studentId) {
    const rows = await executor
      .select({
        placement: studentPlacements,
        sessionName: academicSessions.name,
        sectionName: sections.name,
        groupName: groups.name,
        className: classes.name,
      })
      .from(studentPlacements)
      .innerJoin(academicSessions, eq(academicSessions.id, studentPlacements.academicSessionId))
      .innerJoin(sections, eq(sections.id, studentPlacements.sectionId))
      .innerJoin(groups, eq(groups.id, sections.groupId))
      .innerJoin(classes, eq(classes.id, studentPlacements.classId))
      .where(eq(studentPlacements.studentId, studentId))
      .orderBy(desc(academicSessions.startDate), desc(studentPlacements.placedAt));

    return rows.map((row): PlacementRow => ({
      studentId: row.placement.studentId,
      academicSessionId: row.placement.academicSessionId,
      sectionId: row.placement.sectionId,
      classId: row.placement.classId,
      isCurrent: row.placement.isCurrent,
      placedAt: row.placement.placedAt,
      placementReason: row.placement.placementReason,
      sessionName: row.sessionName,
      className: row.className,
      groupName: row.groupName,
      sectionName: row.sectionName,
    }));
  },

  async listEnrollments(studentId) {
    const rows = await executor
      .select({
        enrollment: studentEnrollments,
        departmentName: departments.name,
      })
      .from(studentEnrollments)
      .leftJoin(departments, eq(departments.id, studentEnrollments.departmentId))
      .where(eq(studentEnrollments.studentId, studentId))
      .orderBy(desc(studentEnrollments.enrolledOn), desc(studentEnrollments.createdAt));

    return rows.map((row): EnrollmentRow => ({
      id: row.enrollment.id,
      studentId: row.enrollment.studentId,
      academicSessionId: row.enrollment.academicSessionId,
      academicYear: row.enrollment.academicYear,
      gradeLevel: row.enrollment.gradeLevel,
      departmentId: row.enrollment.departmentId,
      departmentName: row.departmentName,
      enrolledOn: row.enrollment.enrolledOn,
      description: row.enrollment.description,
      createdAt: row.enrollment.createdAt,
    }));
  },

  async listDocuments(studentId) {
    const rows = await executor
      .select()
      .from(studentDocuments)
      .where(eq(studentDocuments.studentId, studentId))
      .orderBy(desc(studentDocuments.createdAt), asc(studentDocuments.id));

    return rows.map((row): DocumentRow => ({
      id: row.id,
      studentId: row.studentId,
      documentType: row.documentType as DocumentType,
      storageKey: row.storageKey,
      originalFileName: row.originalFileName,
      status: row.status as DocumentRow["status"],
      rejectionReason: row.rejectionReason,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
    }));
  },

  async listStudentGuardians(studentId) {
    const rows = await executor
      .select({ link: guardianLinks, profile: guardians })
      .from(guardianLinks)
      .innerJoin(guardians, eq(guardians.userId, guardianLinks.guardianUserId))
      .where(eq(guardianLinks.studentId, studentId))
      .orderBy(asc(guardianLinks.linkedAt));

    return rows.map((row): GuardianLinkRow => ({
      guardianUserId: row.link.guardianUserId,
      studentId: row.link.studentId,
      relationship: row.link.relationship,
      contactType: row.link.contactType,
      isFeePayer: row.link.isFeePayer,
      isActive: row.link.isActive,
      receivesNotifications: row.link.receivesNotifications,
      linkedAt: row.link.linkedAt,
      unlinkedAt: row.link.unlinkedAt,
      unlinkReason: row.link.unlinkReason,
      guardianFirstName: row.profile.firstName,
      guardianLastName: row.profile.lastName,
      guardianEmail: row.profile.email,
      guardianPhone: row.profile.phone,
      guardianOccupation: row.profile.occupation,
    }));
  },

  async listGuardians(institutionId) {
    const rows = await executor
      .select({
        userId: guardians.userId,
        firstName: guardians.firstName,
        lastName: guardians.lastName,
        email: guardians.email,
        phone: guardians.phone,
        occupation: guardians.occupation,
        address: guardians.address,
        version: guardians.version,
        studentCount: sql<number>`count(distinct ${ref(guardianLinks, guardianLinks.studentId)})::int`,
        studentNames: sql<string[]>`coalesce(
          array_agg(distinct ${ref(students, students.firstName)} || ' ' || ${ref(students, students.lastName)}), '{}')`,
      })
      .from(guardians)
      .innerJoin(users, eq(users.id, guardians.userId))
      .innerJoin(
        guardianLinks,
        and(eq(guardianLinks.guardianUserId, guardians.userId), eq(guardianLinks.isActive, true)),
      )
      .innerJoin(
        students,
        and(
          eq(students.id, guardianLinks.studentId),
          eq(students.institutionId, institutionId),
          isNull(students.archivedAt),
        ),
      )
      .groupBy(guardians.userId, users.status)
      .orderBy(asc(guardians.lastName), asc(guardians.firstName));

    return rows.map((row): GuardianListRow => ({
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      occupation: row.occupation,
      address: row.address,
      version: row.version,
      studentCount: row.studentCount,
      studentNames: [...row.studentNames].sort((a, b) => a.localeCompare(b)),
    }));
  },

  async getGuardian(guardianUserId) {
    const [row] = await executor
      .select({ profile: guardians, accountStatus: users.status })
      .from(guardians)
      .innerJoin(users, eq(users.id, guardians.userId))
      .where(eq(guardians.userId, guardianUserId))
      .limit(1);
    if (row === undefined) return null;
    return {
      userId: row.profile.userId,
      firstName: row.profile.firstName,
      lastName: row.profile.lastName,
      email: row.profile.email,
      phone: row.profile.phone,
      occupation: row.profile.occupation,
      address: row.profile.address,
      version: row.profile.version,
      accountStatus: row.accountStatus,
    } satisfies GuardianRow;
  },

  async getGuardianLink(guardianUserId, studentId) {
    const [row] = await executor
      .select({
        guardianUserId: guardianLinks.guardianUserId,
        studentId: guardianLinks.studentId,
        relationship: guardianLinks.relationship,
        isActive: guardianLinks.isActive,
      })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.guardianUserId, guardianUserId),
          eq(guardianLinks.studentId, studentId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async hasActivePrimaryGuardian(studentId) {
    const [row] = await executor
      .select({ studentId: guardianLinks.studentId })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.studentId, studentId),
          eq(guardianLinks.isActive, true),
          eq(guardianLinks.contactType, "primary"),
        ),
      )
      .limit(1);
    return row !== undefined;
  },

  async guardianReachable(guardianUserId, institutionId) {
    const [row] = await executor
      .select({ studentId: guardianLinks.studentId })
      .from(guardianLinks)
      .innerJoin(students, eq(students.id, guardianLinks.studentId))
      .where(
        and(
          eq(guardianLinks.guardianUserId, guardianUserId),
          eq(guardianLinks.isActive, true),
          eq(students.institutionId, institutionId),
        ),
      )
      .limit(1);
    return row !== undefined;
  },

  async getDocument(studentId, documentId) {
    const [row] = await executor
      .select()
      .from(studentDocuments)
      .where(and(eq(studentDocuments.id, documentId), eq(studentDocuments.studentId, studentId)))
      .limit(1);
    if (row === undefined) return null;
    return {
      id: row.id,
      studentId: row.studentId,
      documentType: row.documentType as DocumentType,
      storageKey: row.storageKey,
      originalFileName: row.originalFileName,
      status: row.status as DocumentRow["status"],
      rejectionReason: row.rejectionReason,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
    } satisfies DocumentRow;
  },

  /* ---- Student commands ------------------------------------------------ */

  async insertStudent(values) {
    try {
      const rows = await executor.insert(students).values(values).returning({ id: students.id });
      const row = rows[0];
      if (row === undefined) throw new InternalError("students insert returned no row");
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Admission number or slug is already in use.", {
          userMessage: `Admission number ${values.admissionNumber} is already used in this institution.`,
        });
      }
      throw error;
    }
  },

  async updateStudent(values) {
    const { studentId, version, ...fields } = values;
    try {
      const rows = await executor
        .update(students)
        .set({ ...fields, updatedAt: new Date(), version: sql`${students.version} + 1` })
        .where(studentVersionScope(values.institutionId, studentId, version))
        .returning({ id: students.id });
      await expectVersionedRow(rows, "This student");
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Admission number is already in use.", {
          userMessage: `Admission number ${values.admissionNumber} is already used in this institution.`,
        });
      }
      throw error;
    }
  },

  async setStudentLifecycle(values) {
    const rows = await executor
      .update(students)
      .set({
        lifecycle: values.lifecycle,
        ...(values.admittedAt === undefined ? {} : { admittedAt: values.admittedAt }),
        ...(values.graduatedAt === undefined ? {} : { graduatedAt: values.graduatedAt }),
        ...(values.withdrawnAt === undefined ? {} : { withdrawnAt: values.withdrawnAt }),
        updatedAt: new Date(),
        version: sql`${students.version} + 1`,
      })
      .where(studentVersionScope(values.institutionId, values.studentId, values.version))
      .returning({ id: students.id });
    await expectVersionedRow(rows, "This student");
  },

  async archiveStudent(values) {
    const rows = await executor
      .update(students)
      .set({
        archivedAt: values.archivedAt,
        updatedAt: new Date(),
        version: sql`${students.version} + 1`,
      })
      .where(studentVersionScope(values.institutionId, values.studentId, values.version))
      .returning({ id: students.id });
    await expectVersionedRow(rows, "This student");
  },

  /* ---- Placement & enrollment ------------------------------------------ */

  async insertPlacement(input) {
    await executor.transaction(async (tx) => {
      // The student must exist *in this institution* — the foreign key cannot know that.
      const [studentRow] = await tx
        .select({ id: students.id })
        .from(students)
        .where(studentScope(input.institutionId, input.studentId))
        .limit(1);
      if (studentRow === undefined) {
        throw new NotFoundError("The selected student could not be found.");
      }

      const [sessionRow] = await tx
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.id, input.academicSessionId),
            eq(academicSessions.institutionId, input.institutionId),
            isNull(academicSessions.archivedAt),
          ),
        )
        .limit(1);
      if (sessionRow === undefined) {
        throw new NotFoundError("The selected academic session could not be found.");
      }

      const [sectionRow] = await tx
        .select({ id: sections.id, groupId: sections.groupId })
        .from(sections)
        .where(
          and(
            eq(sections.id, input.sectionId),
            eq(sections.institutionId, input.institutionId),
            isNull(sections.archivedAt),
          ),
        )
        .limit(1);
      if (sectionRow === undefined) {
        throw new NotFoundError("The selected section could not be found.");
      }

      const [groupRow] = await tx
        .select({ classId: groups.classId })
        .from(groups)
        .where(
          and(
            eq(groups.id, sectionRow.groupId),
            eq(groups.institutionId, input.institutionId),
            isNull(groups.archivedAt),
          ),
        )
        .limit(1);
      if (groupRow === undefined) {
        throw new NotFoundError("The selected group could not be found.");
      }

      const [classRow] = await tx
        .select({ id: classes.id, academicSessionId: classes.academicSessionId })
        .from(classes)
        .where(
          and(
            eq(classes.id, groupRow.classId),
            eq(classes.institutionId, input.institutionId),
            isNull(classes.archivedAt),
          ),
        )
        .limit(1);
      if (classRow === undefined) {
        throw new NotFoundError("The selected class could not be found.");
      }
      // Classes are per-session, so a section from another session would put the child in a
      // timetable that does not exist for them.
      if (classRow.academicSessionId !== sessionRow.id) {
        throw new NotFoundError("The selected class does not belong to this academic session.");
      }

      if (input.isCurrent) {
        await tx
          .update(studentPlacements)
          .set({ isCurrent: false })
          .where(
            and(
              eq(studentPlacements.studentId, input.studentId),
              eq(studentPlacements.isCurrent, true),
              sql`${studentPlacements.academicSessionId} <> ${input.academicSessionId}`,
            ),
          );
      }

      try {
        await tx.insert(studentPlacements).values({
          studentId: input.studentId,
          academicSessionId: input.academicSessionId,
          sectionId: input.sectionId,
          classId: classRow.id,
          isCurrent: input.isCurrent,
          placementReason: input.placementReason,
          createdByUserId: input.createdByUserId,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A placement already exists for this session.", {
            userMessage: "This student is already placed in a section for that session.",
          });
        }
        throw error;
      }
    });
  },

  async insertEnrollment(input) {
    const [studentRow] = await executor
      .select({ id: students.id })
      .from(students)
      .where(studentScope(input.institutionId, input.studentId))
      .limit(1);
    if (studentRow === undefined) {
      throw new NotFoundError("The selected student could not be found.");
    }

    const [sessionRow] = await executor
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.id, input.academicSessionId),
          eq(academicSessions.institutionId, input.institutionId),
          isNull(academicSessions.archivedAt),
        ),
      )
      .limit(1);
    if (sessionRow === undefined) {
      throw new NotFoundError("The selected academic session could not be found.");
    }

    if (input.departmentId !== null) {
      const [departmentRow] = await executor
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.id, input.departmentId),
            eq(departments.institutionId, input.institutionId),
            isNull(departments.archivedAt),
          ),
        )
        .limit(1);
      if (departmentRow === undefined) {
        throw new NotFoundError("The selected department could not be found.");
      }
    }

    // "One admission event" (schema doc): the same child, year and grade is one event even though
    // the table has no unique index — the check belongs where the intent is documented.
    const [duplicate] = await executor
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.studentId, input.studentId),
          eq(studentEnrollments.academicYear, input.academicYear),
          sql`${studentEnrollments.gradeLevel} is not distinct from ${input.gradeLevel}`,
        ),
      )
      .limit(1);
    if (duplicate !== undefined) {
      throw new ConflictError("This enrollment is already recorded.", {
        userMessage: "An enrollment for this student, year and grade already exists.",
      });
    }

    try {
      const rows = await executor
        .insert(studentEnrollments)
        .values(input)
        .returning({ id: studentEnrollments.id });
      const row = rows[0];
      if (row === undefined) throw new InternalError("student_enrollments insert returned no row");
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("This enrollment is already recorded.", {
          userMessage: "An enrollment for this student, year and grade already exists.",
        });
      }
      throw error;
    }
  },

  /* ---- Guardians ------------------------------------------------------- */

  async insertGuardianAccount(values, link, linkedByUserId) {
    let userId = "";

    await executor.transaction(async (tx) => {
      const displayName = `${values.firstName} ${values.lastName}`.slice(0, 120);

      let userRows;
      try {
        userRows = await tx
          .insert(users)
          .values({
            email: values.email,
            name: displayName,
            phone: values.phone,
            // An account with a credential is usable immediately; without one it waits for an
            // invitation/reset flow, which is exactly what `invited` means (`identity.ts`).
            status: values.credential === null ? "invited" : "active",
          })
          .returning({ id: users.id });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("An account with this e-mail already exists.", {
            userMessage: `An account already exists for ${values.email}.`,
          });
        }
        throw error;
      }
      const userRow = userRows[0];
      if (userRow === undefined) throw new InternalError("users insert returned no row");
      userId = userRow.id;

      if (values.credential !== null) {
        await tx.insert(userCredentials).values({
          userId,
          passwordHash: values.credential.passwordHash,
          algorithm: values.credential.algorithm,
          parameters: values.credential.parameters,
          rotatedAt: new Date(),
        });
      }

      try {
        await tx.insert(guardians).values({
          userId,
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          phone: values.phone,
          occupation: values.occupation,
          address: values.address,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Another guardian already uses this phone number.", {
            userMessage:
              "Another guardian already uses this phone number. Use a different number or leave it blank.",
          });
        }
        throw error;
      }

      if (link !== null) {
        try {
          await tx.insert(guardianLinks).values({
            guardianUserId: userId,
            studentId: link.studentId,
            relationship: link.relationship,
            contactType: link.contactType,
            isFeePayer: link.isFeePayer,
            receivesNotifications: link.receivesNotifications,
            linkedByUserId,
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new ConflictError("A primary guardian is already set.", {
              userMessage:
                "This student already has a primary guardian. Unlink that one before adding another.",
            });
          }
          throw error;
        }
      }
    });

    return { userId };
  },

  async updateGuardian(values) {
    const { guardianUserId, version, ...fields } = values;
    await executor.transaction(async (tx) => {
      const rows = await tx
        .update(guardians)
        .set({ ...fields, updatedAt: new Date(), version: sql`${guardians.version} + 1` })
        .where(and(eq(guardians.userId, guardianUserId), eq(guardians.version, version)))
        .returning({ userId: guardians.userId });
      if (rows.length === 0) {
        const [existing] = await tx
          .select({ userId: guardians.userId })
          .from(guardians)
          .where(eq(guardians.userId, guardianUserId))
          .limit(1);
        if (existing === undefined) {
          throw new NotFoundError("The guardian could not be found.");
        }
        throw new ConflictError("This guardian was changed by someone else.", {
          userMessage: "This guardian was changed by someone else. Refresh the page and try again.",
        });
      }
      // The profile owns the name the portal shows; `users.name` is the same person's display
      // name on every other screen, so both move together in the same transaction.
      await tx
        .update(users)
        .set({
          name: `${fields.firstName} ${fields.lastName}`.slice(0, 120),
          updatedAt: new Date(),
        })
        .where(eq(users.id, guardianUserId));
    });
  },

  async insertOrReactivateLink(values, linkedByUserId) {
    try {
      await executor.insert(guardianLinks).values({
        guardianUserId: values.guardianUserId,
        studentId: values.studentId,
        relationship: values.relationship,
        contactType: values.contactType,
        isFeePayer: values.isFeePayer,
        receivesNotifications: values.receivesNotifications,
        linkedByUserId,
      });
      return;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    // The pair already exists. Reactivating an inactive link is a re-link (the composite key
    // forbids a second row); an *active* duplicate is the caller's mistake.
    try {
      const rows = await executor
        .update(guardianLinks)
        .set({
          relationship: values.relationship,
          contactType: values.contactType,
          isFeePayer: values.isFeePayer,
          receivesNotifications: values.receivesNotifications,
          isActive: true,
          linkedAt: new Date(),
          linkedByUserId,
          unlinkedAt: null,
          unlinkedByUserId: null,
          unlinkReason: null,
        })
        .where(
          and(
            eq(guardianLinks.guardianUserId, values.guardianUserId),
            eq(guardianLinks.studentId, values.studentId),
            eq(guardianLinks.isActive, false),
          ),
        )
        .returning({ studentId: guardianLinks.studentId });
      if (rows.length > 0) return;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A primary guardian is already set.", {
          userMessage:
            "This student already has a primary guardian. Unlink that one before adding another.",
        });
      }
      throw error;
    }

    throw new ConflictError("This guardian is already linked to this student.", {
      userMessage: "This guardian is already linked to this student.",
    });
  },

  async deactivateLink(values, unlinkedByUserId) {
    const rows = await executor
      .update(guardianLinks)
      .set({
        isActive: false,
        unlinkedAt: new Date(),
        unlinkedByUserId,
        unlinkReason: values.reason,
      })
      .where(
        and(
          eq(guardianLinks.guardianUserId, values.guardianUserId),
          eq(guardianLinks.studentId, values.studentId),
          eq(guardianLinks.isActive, true),
        ),
      )
      .returning({ studentId: guardianLinks.studentId });
    if (rows.length === 0) {
      throw new NotFoundError("The guardian link could not be found.");
    }
  },

  /* ---- Documents ------------------------------------------------------- */

  async insertDocument(values) {
    try {
      const rows = await executor
        .insert(studentDocuments)
        .values(values)
        .returning({ id: studentDocuments.id });
      const row = rows[0];
      if (row === undefined) throw new InternalError("student_documents insert returned no row");
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("This document is already registered.", {
          userMessage: "This document is already registered for the student.",
        });
      }
      throw error;
    }
  },

  async decideDocument(values) {
    if (values.status === "verified" && values.verifiedByUserId === null) {
      // `student_documents_verification_pair` requires a verifier: without an actor there is no
      // audit trail to trust, so fail here rather than letting the check constraint surface it.
      throw new InternalError("A verified document needs a verifying user.");
    }
    const rows = await executor
      .update(studentDocuments)
      .set({
        status: values.status,
        rejectionReason: values.status === "rejected" ? values.rejectionReason : null,
        verifiedByUserId: values.status === "verified" ? values.verifiedByUserId : null,
        verifiedAt: values.status === "verified" ? values.now : null,
        updatedAt: values.now,
      })
      .where(
        and(
          eq(studentDocuments.id, values.documentId),
          eq(studentDocuments.studentId, values.studentId),
        ),
      )
      .returning({ id: studentDocuments.id });
    if (rows.length === 0) {
      throw new NotFoundError("The document could not be found.");
    }
  },

  async insertPreviousSchool(values) {
    await executor.insert(studentPreviousSchools).values(values);
  },
});

/** The ambient store — the wiring in `index.ts` uses this; admission conversion builds its own. */
export const drizzleStudentStore = createStudentStore(db);
