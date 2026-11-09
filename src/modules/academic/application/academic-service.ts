/**
 * The academic module's use cases (Phase 6 tasks 8, 10, 12 — institute and academic master data).
 *
 * Every command does the same three things, in the same order:
 *
 * 1. **Validate** the raw form payload against its zod boundary schema (`parseOrThrow`), so a
 *    malformed request dies before it touches the store.
 * 2. **Check policy** against current state — a session must be open to take children
 *    (`RULES.md` §44: closed sessions are read-only history), a session must not be current to be
 *    closed, and a closed session can never be made current again. These rules are pure functions
 *    in `../domain/domain-rules.ts`, tested directly.
 * 3. **Mint a collision-free slug** from the display name and write.
 *
 * Uniqueness conflicts the rules cannot foresee (a duplicate class name, a duplicate subject code)
 * surface as `ConflictError` from the store's unique-violation handling and propagate.
 */
import { parseOrThrow } from "@/shared/validation/parse";
import { NotFoundError, ValidationError } from "@/shared/errors";

import {
  assertCanClose,
  assertCanMakeCurrent,
  assertSessionOpen,
  slugify,
  uniqueSlug,
} from "../domain/domain-rules";
import * as s from "./schemas";
import type {
  AcademicStore,
  BuildingRow,
  CampusRow,
  ClassNode,
  DepartmentRow,
  DesignationRow,
  InstitutionRow,
  SessionRow,
  SubjectRow,
  TimeSlotRow,
} from "./ports";

export interface CreateResult {
  readonly id: string;
}

export interface AcademicService {
  /* ---- Institution & campus -------------------------------------------- */
  listInstitutions(): Promise<readonly InstitutionRow[]>;
  getInstitution(institutionId: string): Promise<InstitutionRow>;
  /** The institution commands act in: a preferred tenant, else the sole configured one. */
  resolveActingInstitution(preferredInstitutionId: string | null): Promise<InstitutionRow | null>;
  createInstitution(input: unknown): Promise<CreateResult>;
  updateInstitution(input: unknown): Promise<CreateResult>;
  createCampus(input: unknown): Promise<CreateResult>;

  /* ---- Buildings & floors ---------------------------------------------- */
  listBuildingsWithFloors(institutionId: string): Promise<readonly BuildingRow[]>;
  listCampuses(institutionId: string): Promise<readonly CampusRow[]>;
  createBuilding(input: unknown): Promise<CreateResult>;
  createFloor(input: unknown): Promise<CreateResult>;

  /* ---- Departments & designations -------------------------------------- */
  listDepartments(institutionId: string): Promise<readonly DepartmentRow[]>;
  listDesignations(institutionId: string): Promise<readonly DesignationRow[]>;
  createDepartment(input: unknown): Promise<CreateResult>;
  createDesignation(input: unknown): Promise<CreateResult>;

  /* ---- Academic sessions ----------------------------------------------- */
  listAcademicSessions(institutionId: string): Promise<readonly SessionRow[]>;
  createAcademicSession(input: unknown): Promise<CreateResult & { readonly isCurrent: boolean }>;
  setCurrentSession(input: unknown): Promise<CreateResult>;
  closeSession(input: unknown): Promise<CreateResult>;

  /* ---- Classes / groups / sections ------------------------------------- */
  listClassTree(institutionId: string, sessionId: string): Promise<readonly ClassNode[]>;
  listClassTreeByGroup(institutionId: string): Promise<readonly ClassNode[]>;
  createClass(input: unknown): Promise<CreateResult>;
  createGroup(input: unknown): Promise<CreateResult>;
  createSection(input: unknown): Promise<CreateResult>;

  /* ---- Subjects -------------------------------------------------------- */
  listSubjects(institutionId: string): Promise<readonly SubjectRow[]>;
  createSubject(input: unknown): Promise<CreateResult>;

  /* ---- Time slots ------------------------------------------------------ */
  listTimeSlots(institutionId: string): Promise<readonly TimeSlotRow[]>;
  createTimeSlot(input: unknown): Promise<CreateResult>;
}

export function createAcademicService(store: AcademicStore): AcademicService {
  async function assertInstitution(institutionId: string): Promise<void> {
    const institution = await store.getInstitution(institutionId);
    if (institution === null) {
      throw new NotFoundError("Institution does not exist.", {
        userMessage: "That institution is not available. Refresh the page and try again.",
      });
    }
  }

  async function nextSlug(
    institutionId: string,
    scope: s.SlugScope,
    base: string,
  ): Promise<string> {
    return uniqueSlug(base, await store.listSlugs(institutionId, scope));
  }

  return {
    async listInstitutions() {
      return store.listInstitutions();
    },

    async getInstitution(institutionId) {
      const institution = await store.getInstitution(institutionId);
      if (institution === null) {
        throw new NotFoundError("Institution does not exist.");
      }
      return institution;
    },

    async resolveActingInstitution(preferred) {
      if (preferred !== null) {
        return store.getInstitution(preferred);
      }
      const institutions = await store.listInstitutions();
      if (institutions.length === 1) {
        return institutions[0] ?? null;
      }
      return null;
    },

    async createInstitution(input) {
      const data = parseOrThrow(s.createInstitutionSchema, input, "institution");
      // Institution slugs are globally unique (not scoped to a parent), so mint against all rows.
      const institutions = await store.listInstitutions();
      const slug = uniqueSlug(
        slugify(data.name),
        institutions.map((institution) => institution.slug),
      );
      const created = await store.insertInstitution({
        name: data.name.trim(),
        slug,
        kind: data.kind,
        code: data.code,
        email: data.email,
        phone: data.phone,
        address: data.address,
        website: data.website,
      });
      return { id: created.id };
    },

    async updateInstitution(input) {
      const data = parseOrThrow(s.updateInstitutionSchema, input, "institution");
      const current = await store.getInstitution(data.institutionId);
      if (current === null) {
        throw new NotFoundError("Institution does not exist.");
      }
      const institutions = await store.listInstitutions();
      const renamed = slugify(data.name) !== slugify(current.name);
      const slug = renamed
        ? uniqueSlug(
            slugify(data.name),
            institutions.map((institution) => institution.slug),
          )
        : current.slug;
      await store.updateInstitution({
        institutionId: data.institutionId,
        version: data.version,
        name: data.name.trim(),
        slug,
        kind: data.kind,
        code: data.code,
        email: data.email,
        phone: data.phone,
        address: data.address,
        website: data.website,
      });
      return { id: data.institutionId };
    },

    async createCampus(input) {
      const data = parseOrThrow(s.createCampusSchema, input, "campus");
      await assertInstitution(data.institutionId);
      const slug = await nextSlug(data.institutionId, "campus", data.name);
      const created = await store.insertCampus({ ...data, slug });
      return { id: created.id };
    },

    async listBuildingsWithFloors(institutionId) {
      return store.listBuildingsWithFloors(institutionId);
    },

    async listCampuses(institutionId) {
      return store.listCampuses(institutionId);
    },

    async createBuilding(input) {
      const data = parseOrThrow(s.createBuildingSchema, input, "building");
      await assertInstitution(data.institutionId);
      const slug = await nextSlug(data.institutionId, "building", data.name);
      const created = await store.insertBuilding({
        institutionId: data.institutionId,
        campusId: data.campusId,
        name: data.name.trim(),
        slug,
      });
      return { id: created.id };
    },

    async createFloor(input) {
      const data = parseOrThrow(s.createFloorSchema, input, "floor");
      await assertInstitution(data.institutionId);
      const created = await store.insertFloor({
        institutionId: data.institutionId,
        buildingId: data.buildingId,
        name: data.name.trim(),
        level: data.level,
      });
      return { id: created.id };
    },

    async listDepartments(institutionId) {
      return store.listDepartments(institutionId);
    },

    async listDesignations(institutionId) {
      return store.listDesignations(institutionId);
    },

    async createDepartment(input) {
      const data = parseOrThrow(s.createDepartmentSchema, input, "department");
      await assertInstitution(data.institutionId);
      const slug = await nextSlug(data.institutionId, "department", data.name);
      const created = await store.insertDepartment({
        institutionId: data.institutionId,
        name: data.name.trim(),
        slug,
        description: data.description,
      });
      return { id: created.id };
    },

    async createDesignation(input) {
      const data = parseOrThrow(s.createDesignationSchema, input, "designation");
      await assertInstitution(data.institutionId);
      const slug = await nextSlug(data.institutionId, "designation", data.name);
      const created = await store.insertDesignation({
        institutionId: data.institutionId,
        departmentId: data.departmentId,
        name: data.name.trim(),
        slug,
        description: data.description,
      });
      return { id: created.id };
    },

    async listAcademicSessions(institutionId) {
      await assertInstitution(institutionId);
      return store.listSessions(institutionId);
    },

    async createAcademicSession(input) {
      const data = parseOrThrow(s.createAcademicSessionSchema, input, "session");
      await assertInstitution(data.institutionId);
      if (data.endDate < data.startDate) {
        throw new ValidationError("Session dates are out of order.", {
          endDate: ["The end date must not be before the start date."],
        });
      }
      const slug = await nextSlug(data.institutionId, "session", data.name);
      const created = await store.insertSession({
        institutionId: data.institutionId,
        name: data.name.trim(),
        slug,
        startDate: data.startDate,
        endDate: data.endDate,
      });
      return { id: created.id, isCurrent: created.isCurrent };
    },

    async setCurrentSession(input) {
      const data = parseOrThrow(s.setCurrentSessionSchema, input, "session");
      const session = await store.getSession(data.institutionId, data.sessionId);
      assertCanMakeCurrent(session);
      await store.setCurrentSession(data.institutionId, data.sessionId);
      return { id: data.sessionId };
    },

    async closeSession(input) {
      const data = parseOrThrow(s.closeSessionSchema, input, "session");
      const session = await store.getSession(data.institutionId, data.sessionId);
      assertCanClose(session);
      await store.closeSession(data.institutionId, data.sessionId);
      return { id: data.sessionId };
    },

    async listClassTree(institutionId, sessionId) {
      await assertInstitution(institutionId);
      return store.listClassTree(institutionId, sessionId);
    },

    async listClassTreeByGroup(institutionId) {
      await assertInstitution(institutionId);
      return store.listClassTreeByGroup(institutionId);
    },

    async createClass(input) {
      const data = parseOrThrow(s.createClassSchema, input, "class");
      const session = await store.getSession(data.institutionId, data.academicSessionId);
      assertSessionOpen(session, "This class's session");
      const slug = await nextSlug(data.institutionId, "class", data.name);
      // Mint group slugs locally: the class is new, so only this class's own names collide.
      const used = new Set<string>();
      const groups = data.groupNames.map((name) => {
        const resolved = uniqueSlug(slugify(name), [...used]);
        used.add(resolved);
        return { name, slug: resolved };
      });
      const created = await store.insertClass({
        institutionId: data.institutionId,
        academicSessionId: data.academicSessionId,
        name: data.name.trim(),
        slug,
        gradeLevel: data.gradeLevel,
        departmentId: data.departmentId,
        description: data.description,
        groupNames: groups.map((group) => group.name),
        groupSlugs: groups.map((group) => group.slug),
      });
      return { id: created.id };
    },

    async createGroup(input) {
      const data = parseOrThrow(s.createGroupSchema, input, "group");
      await assertInstitution(data.institutionId);
      const slug = await nextSlug(data.institutionId, "group", data.name);
      const created = await store.insertGroup({
        institutionId: data.institutionId,
        classId: data.classId,
        name: data.name.trim(),
        slug,
        description: data.description,
      });
      return { id: created.id };
    },

    async createSection(input) {
      const data = parseOrThrow(s.createSectionSchema, input, "section");
      await assertInstitution(data.institutionId);
      const slug = await nextSlug(data.institutionId, "section", data.name);
      const created = await store.insertSection({
        institutionId: data.institutionId,
        groupId: data.groupId,
        name: data.name.trim(),
        slug,
        capacity: data.capacity,
        floorId: data.floorId,
        campusId: data.campusId,
      });
      return { id: created.id };
    },

    async listSubjects(institutionId) {
      await assertInstitution(institutionId);
      return store.listSubjects(institutionId);
    },

    async createSubject(input) {
      const data = parseOrThrow(s.createSubjectSchema, input, "subject");
      await assertInstitution(data.institutionId);
      const slug = await nextSlug(data.institutionId, "subject", data.name);
      const created = await store.insertSubject({
        institutionId: data.institutionId,
        name: data.name.trim(),
        slug,
        code: data.code.trim().toUpperCase(),
        kind: data.kind,
        departmentId: data.departmentId,
        description: data.description,
      });
      return { id: created.id };
    },

    async listTimeSlots(institutionId) {
      await assertInstitution(institutionId);
      return store.listTimeSlots(institutionId);
    },

    async createTimeSlot(input) {
      const data = parseOrThrow(s.createTimeSlotSchema, input, "time slot");
      await assertInstitution(data.institutionId);
      if (data.endTime <= data.startTime) {
        throw new ValidationError("Time slot is out of order.", {
          endTime: ["The end time must be after the start time."],
        });
      }
      const created = await store.insertTimeSlot({
        institutionId: data.institutionId,
        academicSessionId: data.academicSessionId,
        name: data.name.trim(),
        startTime: data.startTime,
        endTime: data.endTime,
        sequence: data.sequence,
        isBreak: data.isBreak,
      });
      return { id: created.id };
    },
  };
}
