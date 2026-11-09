import { randomUUID } from "node:crypto";
/**
 * An in-memory {@link AcademicStore} for service tests.
 *
 * It mirrors the Drizzle store's observable behaviour for the shapes the service and its tests
 * care about — a session becomes current when it is the first one, `setCurrentSession` clears the
 * previous current session, `listClassTree` returns class → group → section nests keyed by session
 * — and nothing more. Policy lives in the service, so the fake deliberately does not re-implement
 * any of it (no slug collision checks, no tenant guards).
 */
import {
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
} from "../ports";
import type { InstitutionKind } from "../types";

import { SlugScope } from "../schemas";

function nextId(): string {
  return randomUUID();
}

interface InstitutionRecord {
  id: string;
  name: string;
  slug: string;
  kind: InstitutionKind;
  code: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  version: number;
}

interface CampusRecord {
  id: string;
  institutionId: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
}

interface BuildingRecord {
  id: string;
  institutionId: string;
  campusId: string | null;
  name: string;
  slug: string;
}

interface FloorRecord {
  id: string;
  institutionId: string;
  buildingId: string | null;
  name: string;
  level: number;
}

interface DepartmentRecord {
  id: string;
  institutionId: string;
  name: string;
  slug: string;
  description: string | null;
}

interface DesignationRecord {
  id: string;
  institutionId: string;
  departmentId: string | null;
  name: string;
  slug: string;
  description: string | null;
}

interface SessionRecord {
  id: string;
  institutionId: string;
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  closedAt: Date | null;
}

interface ClassRecord {
  id: string;
  institutionId: string;
  academicSessionId: string;
  name: string;
  slug: string;
  gradeLevel: number;
  departmentId: string | null;
  description: string | null;
}

interface GroupRecord {
  id: string;
  institutionId: string;
  classId: string;
  name: string;
  slug: string;
  description: string | null;
}

interface SectionRecord {
  id: string;
  institutionId: string;
  groupId: string;
  name: string;
  slug: string;
  capacity: number | null;
  floorId: string | null;
  campusId: string | null;
}

interface SubjectRecord {
  id: string;
  institutionId: string;
  name: string;
  slug: string;
  code: string;
  kind: "theory" | "practical" | "both";
  departmentId: string | null;
  description: string | null;
}

interface TimeSlotRecord {
  id: string;
  institutionId: string;
  academicSessionId: string | null;
  name: string;
  startTime: string;
  endTime: string;
  sequence: number;
  isBreak: boolean;
}

function toInstitution(record: InstitutionRecord, campusCount: number): InstitutionRow {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    code: record.code,
    kind: record.kind,
    email: record.email,
    phone: record.phone,
    address: record.address,
    website: record.website,
    version: record.version,
    campusCount,
  };
}

export class FakeAcademicStore implements AcademicStore {
  readonly institutions = new Map<string, InstitutionRecord>();
  readonly campuses = new Map<string, CampusRecord>();
  readonly buildings = new Map<string, BuildingRecord>();
  readonly floors = new Map<string, FloorRecord>();
  readonly departments = new Map<string, DepartmentRecord>();
  readonly designations = new Map<string, DesignationRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly classes = new Map<string, ClassRecord>();
  readonly groups = new Map<string, GroupRecord>();
  readonly sections = new Map<string, SectionRecord>();
  readonly subjects = new Map<string, SubjectRecord>();
  readonly timeSlots = new Map<string, TimeSlotRecord>();

  seedInstitution(partial: Partial<InstitutionRecord> & { name: string }): InstitutionRecord {
    const record: InstitutionRecord = {
      id: partial.id ?? nextId(),
      name: partial.name,
      slug: partial.slug ?? "seed-institution",
      kind: partial.kind ?? "school",
      code: partial.code ?? null,
      email: partial.email ?? "seed@example.org",
      phone: partial.phone ?? null,
      address: partial.address ?? null,
      website: partial.website ?? null,
      version: 1,
    };
    this.institutions.set(record.id, record);
    return record;
  }

  seedSession(
    partial: Partial<SessionRecord> & { institutionId: string; name: string },
  ): SessionRecord {
    const record: SessionRecord = {
      id: partial.id ?? nextId(),
      institutionId: partial.institutionId,
      name: partial.name,
      slug: partial.slug ?? "seed-session",
      startDate: partial.startDate ?? "2025-01-01",
      endDate: partial.endDate ?? "2025-12-31",
      isCurrent: partial.isCurrent ?? false,
      closedAt: partial.closedAt ?? null,
    };
    this.sessions.set(record.id, record);
    return record;
  }

  seedClass(
    partial: Partial<ClassRecord> & {
      institutionId: string;
      academicSessionId: string;
      name: string;
    },
  ): ClassRecord {
    const record: ClassRecord = {
      id: partial.id ?? nextId(),
      institutionId: partial.institutionId,
      academicSessionId: partial.academicSessionId,
      name: partial.name,
      slug: partial.slug ?? "seed-class",
      gradeLevel: partial.gradeLevel ?? 6,
      departmentId: partial.departmentId ?? null,
      description: partial.description ?? null,
    };
    this.classes.set(record.id, record);
    return record;
  }

  seedGroup(
    partial: Partial<GroupRecord> & { institutionId: string; classId: string; name: string },
  ): GroupRecord {
    const record: GroupRecord = {
      id: partial.id ?? nextId(),
      institutionId: partial.institutionId,
      classId: partial.classId,
      name: partial.name,
      slug: partial.slug ?? "seed-group",
      description: partial.description ?? null,
    };
    this.groups.set(record.id, record);
    return record;
  }

  /* ---- Institution & campus -------------------------------------------- */

  async listInstitutions(): Promise<readonly InstitutionRow[]> {
    return [...this.institutions.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((record) => {
        const campusCount = [...this.campuses.values()].filter(
          (campus) => campus.institutionId === record.id,
        ).length;
        return toInstitution(record, campusCount);
      });
  }

  async getInstitution(institutionId: string): Promise<InstitutionRow | null> {
    const record = this.institutions.get(institutionId);
    if (record === undefined) return null;
    const campusCount = [...this.campuses.values()].filter(
      (campus) => campus.institutionId === institutionId,
    ).length;
    return toInstitution(record, campusCount);
  }

  async insertInstitution(input: {
    readonly name: string;
    readonly slug: string;
    readonly kind: InstitutionKind;
    readonly email: string;
    readonly code: string | null;
    readonly phone: string | null;
    readonly address: string | null;
    readonly website: string | null;
  }): Promise<InstitutionRow> {
    const record: InstitutionRecord = {
      id: nextId(),
      name: input.name,
      slug: input.slug,
      kind: input.kind,
      code: input.code,
      email: input.email,
      phone: input.phone,
      address: input.address,
      website: input.website,
      version: 1,
    };
    this.institutions.set(record.id, record);
    return toInstitution(record, 0);
  }

  async updateInstitution(input: {
    readonly institutionId: string;
    readonly version: number;
    readonly name: string;
    readonly slug: string;
    readonly kind: InstitutionKind;
    readonly email: string;
    readonly code: string | null;
    readonly phone: string | null;
    readonly address: string | null;
    readonly website: string | null;
  }): Promise<InstitutionRow> {
    const current = this.institutions.get(input.institutionId);
    if (current === undefined || current.version !== input.version) {
      throw new Error("stale institution version");
    }
    const record: InstitutionRecord = {
      ...current,
      name: input.name,
      slug: input.slug,
      kind: input.kind,
      code: input.code,
      email: input.email,
      phone: input.phone,
      address: input.address,
      website: input.website,
      version: current.version + 1,
    };
    this.institutions.set(record.id, record);
    return toInstitution(record, 0);
  }

  async insertCampus(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly address: string | null;
    readonly phone: string | null;
  }): Promise<CampusRow> {
    const record: CampusRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      name: input.name,
      slug: input.slug,
      address: input.address,
      phone: input.phone,
    };
    this.campuses.set(record.id, record);
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      address: record.address,
      phone: record.phone,
    };
  }

  /* ---- Buildings & floors ---------------------------------------------- */

  async listBuildingsWithFloors(institutionId: string): Promise<readonly BuildingRow[]> {
    return [...this.buildings.values()]
      .filter((building) => building.institutionId === institutionId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((building) => {
        const campus =
          building.campusId === null ? undefined : this.campuses.get(building.campusId);
        const floors = [...this.floors.values()]
          .filter((floor) => floor.buildingId === building.id)
          .sort((a, b) => a.level - b.level)
          .map((floor) => ({
            id: floor.id,
            name: floor.name,
            slug: floor.name,
            level: floor.level,
            buildingId: floor.buildingId,
            buildingName: building.name,
          }));
        return {
          id: building.id,
          name: building.name,
          slug: building.slug,
          campusId: building.campusId,
          campusName: campus?.name ?? null,
          floors,
        };
      });
  }

  async listCampuses(institutionId: string): Promise<readonly CampusRow[]> {
    return [...this.campuses.values()]
      .filter((campus) => campus.institutionId === institutionId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((campus) => ({
        id: campus.id,
        name: campus.name,
        slug: campus.slug,
        address: campus.address,
        phone: campus.phone,
      }));
  }

  async insertBuilding(input: {
    readonly institutionId: string;
    readonly campusId: string | null;
    readonly name: string;
    readonly slug: string;
  }): Promise<{ readonly id: string }> {
    const record: BuildingRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      campusId: input.campusId,
      name: input.name,
      slug: input.slug,
    };
    this.buildings.set(record.id, record);
    return { id: record.id };
  }

  async insertFloor(input: {
    readonly institutionId: string;
    readonly buildingId: string | null;
    readonly name: string;
    readonly level: number;
  }): Promise<{ readonly id: string }> {
    const record: FloorRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      buildingId: input.buildingId,
      name: input.name,
      level: input.level,
    };
    this.floors.set(record.id, record);
    return { id: record.id };
  }

  /* ---- Departments & designations -------------------------------------- */

  async listDepartments(institutionId: string): Promise<readonly DepartmentRow[]> {
    return [...this.departments.values()]
      .filter((department) => department.institutionId === institutionId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((department) => ({
        id: department.id,
        name: department.name,
        slug: department.slug,
        description: department.description,
        designationCount: [...this.designations.values()].filter(
          (designation) => designation.departmentId === department.id,
        ).length,
      }));
  }

  async listDesignations(institutionId: string): Promise<readonly DesignationRow[]> {
    return [...this.designations.values()]
      .filter((designation) => designation.institutionId === institutionId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((designation) => ({
        id: designation.id,
        name: designation.name,
        slug: designation.slug,
        departmentId: designation.departmentId,
        departmentName:
          designation.departmentId === null
            ? null
            : (this.departments.get(designation.departmentId)?.name ?? null),
        description: designation.description,
      }));
  }

  async insertDepartment(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
  }): Promise<{ readonly id: string }> {
    const record: DepartmentRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      name: input.name,
      slug: input.slug,
      description: input.description,
    };
    this.departments.set(record.id, record);
    return { id: record.id };
  }

  async insertDesignation(input: {
    readonly institutionId: string;
    readonly departmentId: string | null;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
  }): Promise<{ readonly id: string }> {
    const record: DesignationRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      departmentId: input.departmentId,
      name: input.name,
      slug: input.slug,
      description: input.description,
    };
    this.designations.set(record.id, record);
    return { id: record.id };
  }

  /* ---- Academic sessions ----------------------------------------------- */

  private sessionRow(record: SessionRecord): SessionRow {
    const classCount = [...this.classes.values()].filter(
      (klass) => klass.academicSessionId === record.id,
    ).length;
    const groupCount = [...this.groups.values()].filter((group) =>
      [...this.classes.values()].some(
        (klass) => klass.id === group.classId && klass.academicSessionId === record.id,
      ),
    ).length;
    const sectionCount = [...this.sections.values()].filter((section) =>
      [...this.groups.values()].some((group) =>
        [...this.classes.values()].some(
          (klass) =>
            klass.id === group.classId &&
            group.id === section.groupId &&
            klass.academicSessionId === record.id,
        ),
      ),
    ).length;
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      startDate: record.startDate,
      endDate: record.endDate,
      isCurrent: record.isCurrent,
      closedAt: record.closedAt,
      classCount,
      groupCount,
      sectionCount,
    };
  }

  async listSessions(institutionId: string): Promise<readonly SessionRow[]> {
    return [...this.sessions.values()]
      .filter((session) => session.institutionId === institutionId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((session) => this.sessionRow(session));
  }

  async getSession(institutionId: string, sessionId: string): Promise<SessionRow | null> {
    const record = this.sessions.get(sessionId);
    if (record === undefined || record.institutionId !== institutionId) return null;
    return this.sessionRow(record);
  }

  async insertSession(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly startDate: string;
    readonly endDate: string;
  }): Promise<{ readonly id: string; readonly isCurrent: boolean }> {
    const existing = [...this.sessions.values()].filter(
      (session) => session.institutionId === input.institutionId,
    );
    const isCurrent = existing.length === 0;
    const record: SessionRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      name: input.name,
      slug: input.slug,
      startDate: input.startDate,
      endDate: input.endDate,
      isCurrent,
      closedAt: null,
    };
    this.sessions.set(record.id, record);
    return { id: record.id, isCurrent };
  }

  async setCurrentSession(institutionId: string, sessionId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.institutionId === institutionId) {
        session.isCurrent = session.id === sessionId;
      }
    }
  }

  async closeSession(institutionId: string, sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (record !== undefined && record.institutionId === institutionId) {
      record.closedAt = new Date();
    }
  }

  /* ---- Classes / groups / sections ------------------------------------- */

  async listClassTree(institutionId: string, sessionId: string): Promise<readonly ClassNode[]> {
    const classRows = [...this.classes.values()].filter(
      (klass) => klass.institutionId === institutionId && klass.academicSessionId === sessionId,
    );
    return classRows.map((klass) => {
      const groups = [...this.groups.values()]
        .filter((group) => group.classId === klass.id)
        .map((group) => {
          const sections = [...this.sections.values()]
            .filter((section) => section.groupId === group.id)
            .map((section) => {
              const floor = section.floorId === null ? undefined : this.floors.get(section.floorId);
              const campus =
                section.campusId === null ? undefined : this.campuses.get(section.campusId);
              return {
                id: section.id,
                name: section.name,
                slug: section.slug,
                capacity: section.capacity,
                floorId: section.floorId,
                floorName: floor?.name ?? null,
                campusId: section.campusId,
                campusName: campus?.name ?? null,
              };
            });
          return {
            id: group.id,
            name: group.name,
            slug: group.slug,
            description: group.description,
            sections,
          };
        });
      const department =
        klass.departmentId === null ? undefined : this.departments.get(klass.departmentId);
      return {
        id: klass.id,
        name: klass.name,
        slug: klass.slug,
        gradeLevel: klass.gradeLevel,
        departmentId: klass.departmentId,
        departmentName: department?.name ?? null,
        description: klass.description,
        groups,
      };
    });
  }

  async listClassTreeByGroup(institutionId: string): Promise<readonly ClassNode[]> {
    const current = [...this.sessions.values()].find(
      (session) => session.institutionId === institutionId && session.isCurrent,
    );
    if (current === undefined) return [];
    return this.listClassTree(institutionId, current.id);
  }

  async insertClass(input: {
    readonly institutionId: string;
    readonly academicSessionId: string;
    readonly name: string;
    readonly slug: string;
    readonly gradeLevel: number;
    readonly departmentId: string | null;
    readonly description: string | null;
    readonly groupNames: readonly string[];
    readonly groupSlugs: readonly string[];
  }): Promise<{ readonly id: string }> {
    const klass: ClassRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      academicSessionId: input.academicSessionId,
      name: input.name,
      slug: input.slug,
      gradeLevel: input.gradeLevel,
      departmentId: input.departmentId,
      description: input.description,
    };
    this.classes.set(klass.id, klass);
    input.groupNames.forEach((name, index) => {
      const group: GroupRecord = {
        id: nextId(),
        institutionId: input.institutionId,
        classId: klass.id,
        name,
        slug: input.groupSlugs[index] ?? name,
        description: null,
      };
      this.groups.set(group.id, group);
    });
    return { id: klass.id };
  }

  async insertGroup(input: {
    readonly institutionId: string;
    readonly classId: string;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
  }): Promise<{ readonly id: string }> {
    const record: GroupRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      classId: input.classId,
      name: input.name,
      slug: input.slug,
      description: input.description,
    };
    this.groups.set(record.id, record);
    return { id: record.id };
  }

  async insertSection(input: {
    readonly institutionId: string;
    readonly groupId: string;
    readonly name: string;
    readonly slug: string;
    readonly capacity: number | null;
    readonly floorId: string | null;
    readonly campusId: string | null;
  }): Promise<{ readonly id: string }> {
    const record: SectionRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      groupId: input.groupId,
      name: input.name,
      slug: input.slug,
      capacity: input.capacity,
      floorId: input.floorId,
      campusId: input.campusId,
    };
    this.sections.set(record.id, record);
    return { id: record.id };
  }

  /* ---- Subjects -------------------------------------------------------- */

  async listSubjects(institutionId: string): Promise<readonly SubjectRow[]> {
    return [...this.subjects.values()]
      .filter((subject) => subject.institutionId === institutionId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((subject) => ({
        id: subject.id,
        name: subject.name,
        slug: subject.slug,
        code: subject.code,
        kind: subject.kind,
        departmentId: subject.departmentId,
        departmentName:
          subject.departmentId === null
            ? null
            : (this.departments.get(subject.departmentId)?.name ?? null),
        description: subject.description,
      }));
  }

  async insertSubject(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly code: string;
    readonly kind: "theory" | "practical" | "both";
    readonly departmentId: string | null;
    readonly description: string | null;
  }): Promise<{ readonly id: string }> {
    const record: SubjectRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      name: input.name,
      slug: input.slug,
      code: input.code,
      kind: input.kind,
      departmentId: input.departmentId,
      description: input.description,
    };
    this.subjects.set(record.id, record);
    return { id: record.id };
  }

  /* ---- Time slots ------------------------------------------------------ */

  async listTimeSlots(institutionId: string): Promise<readonly TimeSlotRow[]> {
    return [...this.timeSlots.values()]
      .filter((slot) => slot.institutionId === institutionId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((slot) => ({
        id: slot.id,
        name: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
        sequence: slot.sequence,
        isBreak: slot.isBreak,
        academicSessionId: slot.academicSessionId,
        academicSessionName:
          slot.academicSessionId === null
            ? null
            : (this.sessions.get(slot.academicSessionId)?.name ?? null),
      }));
  }

  async insertTimeSlot(input: {
    readonly institutionId: string;
    readonly academicSessionId: string | null;
    readonly name: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly sequence: number;
    readonly isBreak: boolean;
  }): Promise<{ readonly id: string }> {
    const record: TimeSlotRecord = {
      id: nextId(),
      institutionId: input.institutionId,
      academicSessionId: input.academicSessionId,
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      sequence: input.sequence,
      isBreak: input.isBreak,
    };
    this.timeSlots.set(record.id, record);
    return { id: record.id };
  }

  /* ---- Slugs ----------------------------------------------------------- */

  async listSlugs(institutionId: string, scope: SlugScope): Promise<readonly string[]> {
    const scoped = (records: ReadonlyArray<{ institutionId: string; slug: string }>): string[] =>
      records
        .filter((record) => record.institutionId === institutionId)
        .map((record) => record.slug);
    switch (scope) {
      case "campus":
        return scoped([...this.campuses.values()]);
      case "building":
        return scoped([...this.buildings.values()]);
      case "department":
        return scoped([...this.departments.values()]);
      case "designation":
        return scoped([...this.designations.values()]);
      case "session":
        return scoped([...this.sessions.values()]);
      case "class":
        return scoped([...this.classes.values()]);
      case "group":
        return scoped([...this.groups.values()]);
      case "section":
        return scoped([...this.sections.values()]);
      case "subject":
        return scoped([...this.subjects.values()]);
    }
  }
}
