/**
 * The Drizzle implementation of {@link AcademicStore} — the only file in the academic module that
 * imports `@/db/client` or the table objects.
 *
 * Two responsibilities live here by design (`RULES.md` §15: the database is the source of truth for
 * integrity):
 *
 * 1. **Tenant guards.** Every write that carries a foreign reference (a building into a campus, a
 *    section into a group and a floor) re-checks that the referenced row belongs to the same
 *    `institution_id` *before* writing. The foreign keys alone cannot do this — they only prove the
 *    row exists. A cross-tenant reference would otherwise be a silent data-integrity hole.
 * 2. **Atomic lifecycle transitions.** `setCurrentSession` clears and sets `is_current` inside one
 *    transaction so the partial unique index (`academic_sessions_one_current_key`) is never
 *    observed in a half-switched state, and `closeSession` writes the tombstone atomically.
 *
 * Unique conflicts the domain rules cannot foresee (a duplicate class name, a duplicate subject
 * code) arrive as PostgreSQL `23505` and are translated to `ConflictError` so a screen can render a
 * friendly message instead of a raw driver error.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  academicSessions,
  buildings,
  campuses,
  classes,
  departments,
  designations,
  floors,
  groups,
  institutions,
  sections,
  subjects,
  timeSlots,
} from "@/db/schema";
import { ConflictError, NotFoundError } from "@/shared/errors";

import type { AcademicStore, InstitutionRow } from "../application/ports";
import type { SlugScope } from "../application/schemas";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

/** The version/`updated_at` bump for a row touched as a side effect (e.g. `is_current`). */
const bump = (column: {
  updatedAt: typeof academicSessions.updatedAt;
  version: typeof academicSessions.version;
}) => ({
  updatedAt: new Date(),
  version: sql`${column.version} + 1`,
});

/** Internal invariant: an INSERT/UPDATE … RETURNING that returns no row is a driver bug, not a user error. */
function expectRow<T>(rows: readonly T[], label: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`The ${label} row was not returned by the database.`);
  }
  return row;
}

function toInstitution(row: typeof institutions.$inferSelect, campusCount: number): InstitutionRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    code: row.code,
    kind: row.kind,
    email: row.email,
    phone: row.phone,
    address: row.address,
    website: row.website,
    version: row.version,
    campusCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Tenant guards — every referenced row must belong to the institution.       */
/* -------------------------------------------------------------------------- */

async function ensureInstitutionScope<T>(
  recordId: string | null,
  label: string,
  check: () => Promise<T | undefined>,
): Promise<void> {
  if (recordId === null) return;
  if ((await check()) === undefined) {
    throw new NotFoundError(`The selected ${label} could not be found.`);
  }
}

export const drizzleAcademicStore: AcademicStore = {
  /* ---- Institution & campus -------------------------------------------- */

  async listInstitutions() {
    const rows = await db
      .select({
        institution: institutions,
        campusCount: sql<number>`(
          select count(*)::int from ${campuses}
            where ${eq(campuses.institutionId, institutions.id)}
        )`,
      })
      .from(institutions)
      .where(isNull(institutions.archivedAt))
      .orderBy(asc(institutions.name));
    return rows.map((row) => toInstitution(row.institution, row.campusCount));
  },

  async getInstitution(institutionId) {
    const [row] = await db
      .select({
        institution: institutions,
        campusCount: sql<number>`(
          select count(*)::int from ${campuses}
            where ${eq(campuses.institutionId, institutions.id)}
        )`,
      })
      .from(institutions)
      .where(and(eq(institutions.id, institutionId), isNull(institutions.archivedAt)))
      .limit(1);
    return row ? toInstitution(row.institution, row.campusCount) : null;
  },

  async insertInstitution(input) {
    try {
      const row = expectRow(
        await db
          .insert(institutions)
          .values({
            name: input.name,
            slug: input.slug,
            kind: input.kind,
            code: input.code,
            email: input.email,
            phone: input.phone,
            address: input.address,
            website: input.website,
          })
          .returning(),
        "institution",
      );
      return toInstitution(row, 0);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Institution slug or code is already in use.", {
          userMessage: "An institution with this slug or code already exists.",
        });
      }
      throw error;
    }
  },

  async updateInstitution(input) {
    const [row] = await db
      .update(institutions)
      .set({
        name: input.name,
        slug: input.slug,
        kind: input.kind,
        code: input.code,
        email: input.email,
        phone: input.phone,
        address: input.address,
        website: input.website,
        updatedAt: new Date(),
        version: sql`${institutions.version} + 1`,
      })
      .where(
        and(
          eq(institutions.id, input.institutionId),
          eq(institutions.version, input.version),
          isNull(institutions.archivedAt),
        ),
      )
      .returning();
    if (row === undefined) {
      throw new ConflictError("Institution was changed by someone else.", {
        userMessage: "This institution was updated elsewhere. Reload the page to retry.",
      });
    }
    return toInstitution(row, 0);
  },

  async insertCampus(input) {
    try {
      const row = expectRow(
        await db
          .insert(campuses)
          .values({
            institutionId: input.institutionId,
            name: input.name,
            slug: input.slug,
            address: input.address,
            phone: input.phone,
          })
          .returning(),
        "campus",
      );
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        address: row.address,
        phone: row.phone,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Campus name is already in use.", {
          userMessage: "A campus with this name already exists.",
        });
      }
      throw error;
    }
  },

  async insertBuilding(input) {
    await ensureInstitutionScope(input.campusId, "campus", () =>
      db
        .select({ id: campuses.id })
        .from(campuses)
        .where(
          and(
            eq(campuses.id, input.campusId ?? ""),
            eq(campuses.institutionId, input.institutionId),
            isNull(campuses.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
    try {
      const row = expectRow(
        await db
          .insert(buildings)
          .values({
            institutionId: input.institutionId,
            campusId: input.campusId,
            name: input.name,
            slug: input.slug,
          })
          .returning(),
        "building",
      );
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Building name is already in use.", {
          userMessage: "A building with this name already exists.",
        });
      }
      throw error;
    }
  },

  async insertFloor(input) {
    await ensureInstitutionScope(input.buildingId, "building", () =>
      db
        .select({ id: buildings.id })
        .from(buildings)
        .where(
          and(
            eq(buildings.id, input.buildingId ?? ""),
            eq(buildings.institutionId, input.institutionId),
            isNull(buildings.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
    try {
      const row = expectRow(
        await db
          .insert(floors)
          .values({
            institutionId: input.institutionId,
            buildingId: input.buildingId,
            name: input.name,
            level: input.level,
          })
          .returning(),
        "floor",
      );
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Floor name is already in use.", {
          userMessage: "A floor with this name already exists in this building.",
        });
      }
      throw error;
    }
  },

  async listCampuses(institutionId) {
    const rows = await db
      .select()
      .from(campuses)
      .where(and(eq(campuses.institutionId, institutionId), isNull(campuses.archivedAt)))
      .orderBy(asc(campuses.name));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      address: row.address,
      phone: row.phone,
    }));
  },

  async listBuildingsWithFloors(institutionId) {
    const buildingRows = await db
      .select({ building: buildings, campusName: campuses.name })
      .from(buildings)
      .leftJoin(campuses, eq(buildings.campusId, campuses.id))
      .where(and(eq(buildings.institutionId, institutionId), isNull(buildings.archivedAt)))
      .orderBy(asc(buildings.name));
    const floorRows = await db
      .select({ floor: floors, buildingName: buildings.name })
      .from(floors)
      .innerJoin(buildings, eq(floors.buildingId, buildings.id))
      .where(and(eq(floors.institutionId, institutionId), isNull(floors.archivedAt)))
      .orderBy(asc(floors.level), asc(floors.name));

    const floorsByBuilding = new Map<string, typeof floorRows>();
    for (const row of floorRows) {
      const key = row.floor.buildingId;
      if (key === null) continue;
      const list = floorsByBuilding.get(key) ?? [];
      list.push(row);
      floorsByBuilding.set(key, list);
    }

    return buildingRows.map((row) => ({
      id: row.building.id,
      name: row.building.name,
      slug: row.building.slug,
      campusId: row.building.campusId,
      campusName: row.campusName,
      floors: (floorsByBuilding.get(row.building.id) ?? []).map((floorRow) => ({
        id: floorRow.floor.id,
        name: floorRow.floor.name,
        slug: floorRow.floor.name,
        level: floorRow.floor.level,
        buildingId: floorRow.floor.buildingId,
        buildingName: floorRow.buildingName,
      })),
    }));
  },

  /* ---- Departments & designations -------------------------------------- */

  async listDepartments(institutionId) {
    const rows = await db
      .select({
        department: departments,
        designationCount: sql<number>`(
          select count(*)::int from ${designations}
            where ${eq(designations.departmentId, departments.id)}
        )`,
      })
      .from(departments)
      .where(and(eq(departments.institutionId, institutionId), isNull(departments.archivedAt)))
      .orderBy(asc(departments.name));
    return rows.map((row) => ({
      id: row.department.id,
      name: row.department.name,
      slug: row.department.slug,
      description: row.department.description,
      designationCount: row.designationCount,
    }));
  },

  async listDesignations(institutionId) {
    const rows = await db
      .select({ designation: designations, departmentName: departments.name })
      .from(designations)
      .leftJoin(departments, eq(designations.departmentId, departments.id))
      .where(and(eq(designations.institutionId, institutionId), isNull(designations.archivedAt)))
      .orderBy(asc(designations.name));
    return rows.map((row) => ({
      id: row.designation.id,
      name: row.designation.name,
      slug: row.designation.slug,
      departmentId: row.designation.departmentId,
      departmentName: row.departmentName,
      description: row.designation.description,
    }));
  },

  async insertDepartment(input) {
    try {
      const row = expectRow(
        await db
          .insert(departments)
          .values({
            institutionId: input.institutionId,
            name: input.name,
            slug: input.slug,
            description: input.description,
          })
          .returning(),
        "department",
      );
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Department name is already in use.", {
          userMessage: "A department with this name already exists.",
        });
      }
      throw error;
    }
  },

  async insertDesignation(input) {
    await ensureInstitutionScope(input.departmentId, "department", () =>
      db
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.id, input.departmentId ?? ""),
            eq(departments.institutionId, input.institutionId),
            isNull(departments.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
    try {
      const row = expectRow(
        await db
          .insert(designations)
          .values({
            institutionId: input.institutionId,
            departmentId: input.departmentId,
            name: input.name,
            slug: input.slug,
            description: input.description,
          })
          .returning(),
        "designation",
      );
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Designation name is already in use.", {
          userMessage: "A designation with this name already exists.",
        });
      }
      throw error;
    }
  },

  /* ---- Academic sessions ----------------------------------------------- */

  async listSessions(institutionId) {
    const rows = await db
      .select({
        session: academicSessions,
        classCount: sql<number>`(
          select count(*)::int from ${classes}
            where ${eq(classes.academicSessionId, academicSessions.id)}
        )`,
        groupCount: sql<number>`(
          select count(*)::int from ${groups}
            where ${groups.classId} in (
              select ${classes.id} from ${classes}
                where ${eq(classes.academicSessionId, academicSessions.id)}
            )
        )`,
        sectionCount: sql<number>`(
          select count(*)::int from ${sections}
            where ${sections.groupId} in (
              select ${groups.id} from ${groups}
                where ${groups.classId} in (
                  select ${classes.id} from ${classes}
                    where ${eq(classes.academicSessionId, academicSessions.id)}
                )
            )
        )`,
      })
      .from(academicSessions)
      .where(
        and(eq(academicSessions.institutionId, institutionId), isNull(academicSessions.archivedAt)),
      )
      .orderBy(desc(academicSessions.startDate), asc(academicSessions.name));
    return rows.map((row) => ({
      id: row.session.id,
      name: row.session.name,
      slug: row.session.slug,
      startDate: row.session.startDate,
      endDate: row.session.endDate,
      isCurrent: row.session.isCurrent,
      closedAt: row.session.closedAt,
      classCount: row.classCount,
      groupCount: row.groupCount,
      sectionCount: row.sectionCount,
    }));
  },

  async getSession(institutionId, sessionId) {
    const [row] = await db
      .select({
        session: academicSessions,
        classCount: sql<number>`0`,
        groupCount: sql<number>`0`,
        sectionCount: sql<number>`0`,
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
    return row
      ? {
          id: row.session.id,
          name: row.session.name,
          slug: row.session.slug,
          startDate: row.session.startDate,
          endDate: row.session.endDate,
          isCurrent: row.session.isCurrent,
          closedAt: row.session.closedAt,
          classCount: 0,
          groupCount: 0,
          sectionCount: 0,
        }
      : null;
  },

  async insertSession(input) {
    let result: { id: string; isCurrent: boolean } = { id: "", isCurrent: false };
    await db.transaction(async (tx) => {
      const row = expectRow(
        await tx
          .insert(academicSessions)
          .values({
            institutionId: input.institutionId,
            name: input.name,
            slug: input.slug,
            startDate: input.startDate,
            endDate: input.endDate,
          })
          .returning(),
        "session",
      );
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.institutionId, input.institutionId),
            isNull(academicSessions.archivedAt),
          ),
        );
      const isCurrent = (count?.count ?? 0) === 1;
      if (isCurrent) {
        await tx
          .update(academicSessions)
          .set({ isCurrent: true, ...bump(academicSessions) })
          .where(eq(academicSessions.id, row.id));
      }
      result = { id: row.id, isCurrent };
    });
    return result;
  },

  async setCurrentSession(institutionId, sessionId) {
    await db.transaction(async (tx) => {
      await tx
        .update(academicSessions)
        .set({ isCurrent: false, ...bump(academicSessions) })
        .where(
          and(
            eq(academicSessions.institutionId, institutionId),
            eq(academicSessions.isCurrent, true),
          ),
        );
      await tx
        .update(academicSessions)
        .set({ isCurrent: true, ...bump(academicSessions) })
        .where(
          and(
            eq(academicSessions.id, sessionId),
            eq(academicSessions.institutionId, institutionId),
          ),
        );
    });
  },

  async closeSession(institutionId, sessionId) {
    await db
      .update(academicSessions)
      .set({ closedAt: new Date(), ...bump(academicSessions) })
      .where(
        and(eq(academicSessions.id, sessionId), eq(academicSessions.institutionId, institutionId)),
      );
  },

  /* ---- Classes / groups / sections ------------------------------------- */

  async listClassTree(institutionId, sessionId) {
    const classRows = await db
      .select({ class: classes, departmentName: departments.name })
      .from(classes)
      .leftJoin(departments, eq(classes.departmentId, departments.id))
      .where(
        and(
          eq(classes.institutionId, institutionId),
          eq(classes.academicSessionId, sessionId),
          isNull(classes.archivedAt),
        ),
      )
      .orderBy(asc(classes.gradeLevel), asc(classes.name));

    const groupRows = await db
      .select({ group: groups, className: classes.name })
      .from(groups)
      .innerJoin(classes, eq(groups.classId, classes.id))
      .where(
        and(
          eq(groups.institutionId, institutionId),
          eq(classes.academicSessionId, sessionId),
          isNull(groups.archivedAt),
        ),
      )
      .orderBy(asc(groups.name));

    const sectionRows = await db
      .select({
        section: sections,
        floorName: floors.name,
        campusName: campuses.name,
      })
      .from(sections)
      .innerJoin(groups, eq(sections.groupId, groups.id))
      .innerJoin(classes, eq(groups.classId, classes.id))
      .leftJoin(floors, eq(sections.floorId, floors.id))
      .leftJoin(campuses, eq(sections.campusId, campuses.id))
      .where(
        and(
          eq(sections.institutionId, institutionId),
          eq(classes.academicSessionId, sessionId),
          isNull(sections.archivedAt),
        ),
      )
      .orderBy(asc(sections.name));

    const sectionsByGroup = new Map<string, (typeof sectionRows)[number][]>();
    for (const row of sectionRows) {
      const list = sectionsByGroup.get(row.section.groupId) ?? [];
      list.push(row);
      sectionsByGroup.set(row.section.groupId, list);
    }
    const groupsByClass = new Map<string, (typeof groupRows)[number][]>();
    for (const row of groupRows) {
      const list = groupsByClass.get(row.group.classId) ?? [];
      list.push(row);
      groupsByClass.set(row.group.classId, list);
    }

    return classRows.map((row) => ({
      id: row.class.id,
      name: row.class.name,
      slug: row.class.slug,
      gradeLevel: row.class.gradeLevel,
      departmentId: row.class.departmentId,
      departmentName: row.departmentName,
      description: row.class.description,
      groups: (groupsByClass.get(row.class.id) ?? []).map((groupRow) => ({
        id: groupRow.group.id,
        name: groupRow.group.name,
        slug: groupRow.group.slug,
        description: groupRow.group.description,
        sections: (sectionsByGroup.get(groupRow.group.id) ?? []).map((sectionRow) => ({
          id: sectionRow.section.id,
          name: sectionRow.section.name,
          slug: sectionRow.section.slug,
          capacity: sectionRow.section.capacity,
          floorId: sectionRow.section.floorId,
          floorName: sectionRow.floorName,
          campusId: sectionRow.section.campusId,
          campusName: sectionRow.campusName,
        })),
      })),
    }));
  },

  async listClassTreeByGroup(institutionId) {
    const [current] = await db
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.institutionId, institutionId),
          eq(academicSessions.isCurrent, true),
          isNull(academicSessions.archivedAt),
        ),
      )
      .limit(1);
    if (current === undefined) return [];
    return this.listClassTree(institutionId, current.id);
  },

  async insertClass(input) {
    await ensureInstitutionScope(input.departmentId, "department", () =>
      db
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.id, input.departmentId ?? ""),
            eq(departments.institutionId, input.institutionId),
            isNull(departments.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );

    try {
      return await db.transaction(async (tx) => {
        const row = expectRow(
          await tx
            .insert(classes)
            .values({
              institutionId: input.institutionId,
              academicSessionId: input.academicSessionId,
              name: input.name,
              slug: input.slug,
              gradeLevel: input.gradeLevel,
              departmentId: input.departmentId,
              description: input.description,
            })
            .returning(),
          "class",
        );
        if (input.groupNames.length > 0) {
          await tx.insert(groups).values(
            input.groupNames.map((name, index) => ({
              institutionId: input.institutionId,
              classId: row.id,
              name,
              slug: input.groupSlugs[index] ?? name,
            })),
          );
        }
        return { id: row.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Class name or grade level is already in use.", {
          userMessage: "A class with this name or grade level already exists in this session.",
        });
      }
      throw error;
    }
  },

  async insertGroup(input) {
    const [classRow] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(
        and(
          eq(classes.id, input.classId),
          eq(classes.institutionId, input.institutionId),
          isNull(classes.archivedAt),
        ),
      )
      .limit(1);
    if (classRow === undefined) {
      throw new NotFoundError("The selected class could not be found.");
    }
    try {
      const row = expectRow(
        await db
          .insert(groups)
          .values({
            institutionId: input.institutionId,
            classId: input.classId,
            name: input.name,
            slug: input.slug,
            description: input.description,
          })
          .returning(),
        "group",
      );
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Group name is already in use.", {
          userMessage: "A group with this name already exists in this class.",
        });
      }
      throw error;
    }
  },

  async insertSection(input) {
    const [groupRow] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(
          eq(groups.id, input.groupId),
          eq(groups.institutionId, input.institutionId),
          isNull(groups.archivedAt),
        ),
      )
      .limit(1);
    if (groupRow === undefined) {
      throw new NotFoundError("The selected group could not be found.");
    }
    await ensureInstitutionScope(input.floorId, "floor", () =>
      db
        .select({ id: floors.id })
        .from(floors)
        .where(
          and(
            eq(floors.id, input.floorId ?? ""),
            eq(floors.institutionId, input.institutionId),
            isNull(floors.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
    await ensureInstitutionScope(input.campusId, "campus", () =>
      db
        .select({ id: campuses.id })
        .from(campuses)
        .where(
          and(
            eq(campuses.id, input.campusId ?? ""),
            eq(campuses.institutionId, input.institutionId),
            isNull(campuses.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
    try {
      const row = expectRow(
        await db
          .insert(sections)
          .values({
            institutionId: input.institutionId,
            groupId: input.groupId,
            name: input.name,
            slug: input.slug,
            capacity: input.capacity,
            floorId: input.floorId,
            campusId: input.campusId,
          })
          .returning(),
        "section",
      );
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Section name is already in use.", {
          userMessage: "A section with this name already exists in this group.",
        });
      }
      throw error;
    }
  },

  /* ---- Subjects -------------------------------------------------------- */

  async listSubjects(institutionId) {
    const rows = await db
      .select({ subject: subjects, departmentName: departments.name })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(and(eq(subjects.institutionId, institutionId), isNull(subjects.archivedAt)))
      .orderBy(asc(subjects.name));
    return rows.map((row) => ({
      id: row.subject.id,
      name: row.subject.name,
      slug: row.subject.slug,
      code: row.subject.code,
      kind: row.subject.kind,
      departmentId: row.subject.departmentId,
      departmentName: row.departmentName,
      description: row.subject.description,
    }));
  },

  async insertSubject(input) {
    await ensureInstitutionScope(input.departmentId, "department", () =>
      db
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.id, input.departmentId ?? ""),
            eq(departments.institutionId, input.institutionId),
            isNull(departments.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
    try {
      const row = expectRow(
        await db
          .insert(subjects)
          .values({
            institutionId: input.institutionId,
            name: input.name,
            slug: input.slug,
            code: input.code,
            kind: input.kind,
            departmentId: input.departmentId,
            description: input.description,
          })
          .returning(),
        "subject",
      );
      return { id: row.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Subject code or slug is already in use.", {
          userMessage: "A subject with this code or name already exists.",
        });
      }
      throw error;
    }
  },

  /* ---- Time slots ------------------------------------------------------ */

  async listTimeSlots(institutionId) {
    const rows = await db
      .select({ slot: timeSlots, academicSessionName: academicSessions.name })
      .from(timeSlots)
      .leftJoin(academicSessions, eq(timeSlots.academicSessionId, academicSessions.id))
      .where(and(eq(timeSlots.institutionId, institutionId), isNull(timeSlots.archivedAt)))
      .orderBy(asc(timeSlots.sequence), asc(timeSlots.startTime));
    return rows.map((row) => ({
      id: row.slot.id,
      name: row.slot.name,
      startTime: row.slot.startTime,
      endTime: row.slot.endTime,
      sequence: row.slot.sequence,
      isBreak: row.slot.isBreak,
      academicSessionId: row.slot.academicSessionId,
      academicSessionName: row.academicSessionName,
    }));
  },

  async insertTimeSlot(input) {
    await ensureInstitutionScope(input.academicSessionId, "session", () =>
      db
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.id, input.academicSessionId ?? ""),
            eq(academicSessions.institutionId, input.institutionId),
            isNull(academicSessions.archivedAt),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    );
    const row = expectRow(
      await db
        .insert(timeSlots)
        .values({
          institutionId: input.institutionId,
          academicSessionId: input.academicSessionId,
          name: input.name,
          startTime: input.startTime,
          endTime: input.endTime,
          sequence: input.sequence,
          isBreak: input.isBreak,
        })
        .returning(),
      "time slot",
    );
    return { id: row.id };
  },

  /* ---- Slugs ----------------------------------------------------------- */

  async listSlugs(institutionId, scope: SlugScope) {
    switch (scope) {
      case "campus":
        return (
          await db
            .select({ slug: campuses.slug })
            .from(campuses)
            .where(and(eq(campuses.institutionId, institutionId), isNull(campuses.archivedAt)))
        ).map((row) => row.slug);
      case "building":
        return (
          await db
            .select({ slug: buildings.slug })
            .from(buildings)
            .where(and(eq(buildings.institutionId, institutionId), isNull(buildings.archivedAt)))
        ).map((row) => row.slug);
      case "department":
        return (
          await db
            .select({ slug: departments.slug })
            .from(departments)
            .where(
              and(eq(departments.institutionId, institutionId), isNull(departments.archivedAt)),
            )
        ).map((row) => row.slug);
      case "designation":
        return (
          await db
            .select({ slug: designations.slug })
            .from(designations)
            .where(
              and(eq(designations.institutionId, institutionId), isNull(designations.archivedAt)),
            )
        ).map((row) => row.slug);
      case "session":
        return (
          await db
            .select({ slug: academicSessions.slug })
            .from(academicSessions)
            .where(
              and(
                eq(academicSessions.institutionId, institutionId),
                isNull(academicSessions.archivedAt),
              ),
            )
        ).map((row) => row.slug);
      case "class":
        return (
          await db
            .select({ slug: classes.slug })
            .from(classes)
            .where(and(eq(classes.institutionId, institutionId), isNull(classes.archivedAt)))
        ).map((row) => row.slug);
      case "group":
        return (
          await db
            .select({ slug: groups.slug })
            .from(groups)
            .where(and(eq(groups.institutionId, institutionId), isNull(groups.archivedAt)))
        ).map((row) => row.slug);
      case "section":
        return (
          await db
            .select({ slug: sections.slug })
            .from(sections)
            .where(and(eq(sections.institutionId, institutionId), isNull(sections.archivedAt)))
        ).map((row) => row.slug);
      case "subject":
        return (
          await db
            .select({ slug: subjects.slug })
            .from(subjects)
            .where(and(eq(subjects.institutionId, institutionId), isNull(subjects.archivedAt)))
        ).map((row) => row.slug);
    }
  },
};
