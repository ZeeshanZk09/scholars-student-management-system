/**
 * The academic module's ports — what the application layer needs from the outside world.
 *
 * The read surface returns denormalised shapes (a class tree with its groups and sections, a
 * building with its floors) so the UI never joins by hand; the write surface is one method per
 * command. The two lifecycle mutations (`setCurrentSession`, `closeSession`) are atomic in the
 * store, not in the service: the partial unique index on `academic_sessions.is_current` makes
 * "transition current" a two-statement operation that must not be observed in a half-applied state.
 *
 * Integrity over policy: the store re-checks that every foreign reference belongs to the same
 * `institution_id` inside its own transaction (`RULES.md` §15 makes the database the source of
 * truth for integrity). Policy — whether a session may be closed, whether a grade level is free —
 * stays in the service, so it can be tested without a database.
 */
import type { InstitutionKind } from "./types";
import type { SlugScope } from "./schemas";

/** A session as rendered for lists and lifecycle decisions. */
export interface SessionRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly isCurrent: boolean;
  readonly closedAt: Date | null;
  readonly classCount: number;
  readonly groupCount: number;
  readonly sectionCount: number;
}

export interface SectionNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly capacity: number | null;
  readonly floorId: string | null;
  readonly floorName: string | null;
  readonly campusId: string | null;
  readonly campusName: string | null;
}

export interface GroupNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly sections: readonly SectionNode[];
}

export interface ClassNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly gradeLevel: number;
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly description: string | null;
  readonly groups: readonly GroupNode[];
}

export interface SubjectRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly code: string;
  readonly kind: "theory" | "practical" | "both";
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly description: string | null;
}

export interface DepartmentRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly designationCount: number;
}

export interface DesignationRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly description: string | null;
}

export interface CampusRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly address: string | null;
  readonly phone: string | null;
}

export interface FloorRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly level: number;
  readonly buildingId: string | null;
  readonly buildingName: string | null;
}

export interface BuildingRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly campusId: string | null;
  readonly campusName: string | null;
  readonly floors: readonly FloorRow[];
}

export interface TimeSlotRow {
  readonly id: string;
  readonly name: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly sequence: number;
  readonly isBreak: boolean;
  readonly academicSessionId: string | null;
  readonly academicSessionName: string | null;
}

export interface InstitutionRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly code: string | null;
  readonly kind: InstitutionKind;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly version: number;
  readonly campusCount: number;
}

/** Row shapes that carry a `version` token for optimistic concurrency. */
export type VersionedRow<T> = T & { readonly version: number };

export interface AcademicStore {
  /* ---- Institution & campus -------------------------------------------- */
  listInstitutions(): Promise<readonly InstitutionRow[]>;
  getInstitution(institutionId: string): Promise<InstitutionRow | null>;
  insertInstitution(input: {
    readonly name: string;
    readonly slug: string;
    readonly kind: InstitutionKind;
    readonly email: string;
    readonly code: string | null;
    readonly phone: string | null;
    readonly address: string | null;
    readonly website: string | null;
  }): Promise<InstitutionRow>;
  updateInstitution(input: {
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
  }): Promise<InstitutionRow>;
  insertCampus(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly address: string | null;
    readonly phone: string | null;
  }): Promise<CampusRow>;

  /* ---- Buildings & floors ---------------------------------------------- */
  listBuildingsWithFloors(institutionId: string): Promise<readonly BuildingRow[]>;
  listCampuses(institutionId: string): Promise<readonly CampusRow[]>;
  insertBuilding(input: {
    readonly institutionId: string;
    readonly campusId: string | null;
    readonly name: string;
    readonly slug: string;
  }): Promise<{ readonly id: string }>;
  insertFloor(input: {
    readonly institutionId: string;
    readonly buildingId: string | null;
    readonly name: string;
    readonly level: number;
  }): Promise<{ readonly id: string }>;

  /* ---- Departments & designations -------------------------------------- */
  listDepartments(institutionId: string): Promise<readonly DepartmentRow[]>;
  listDesignations(institutionId: string): Promise<readonly DesignationRow[]>;
  insertDepartment(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
  }): Promise<{ readonly id: string }>;
  insertDesignation(input: {
    readonly institutionId: string;
    readonly departmentId: string | null;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
  }): Promise<{ readonly id: string }>;

  /* ---- Academic sessions ----------------------------------------------- */
  listSessions(institutionId: string): Promise<readonly SessionRow[]>;
  getSession(institutionId: string, sessionId: string): Promise<SessionRow | null>;
  insertSession(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly startDate: string;
    readonly endDate: string;
  }): Promise<{ readonly id: string; readonly isCurrent: boolean }>;
  setCurrentSession(institutionId: string, sessionId: string): Promise<void>;
  closeSession(institutionId: string, sessionId: string): Promise<void>;

  /* ---- Classes / groups / sections ------------------------------------- */
  listClassTree(institutionId: string, sessionId: string): Promise<readonly ClassNode[]>;
  listClassTreeByGroup(institutionId: string): Promise<readonly ClassNode[]>;
  insertClass(input: {
    readonly institutionId: string;
    readonly academicSessionId: string;
    readonly name: string;
    readonly slug: string;
    readonly gradeLevel: number;
    readonly departmentId: string | null;
    readonly description: string | null;
    readonly groupNames: readonly string[];
    readonly groupSlugs: readonly string[];
  }): Promise<{ readonly id: string }>;
  insertGroup(input: {
    readonly institutionId: string;
    readonly classId: string;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
  }): Promise<{ readonly id: string }>;
  insertSection(input: {
    readonly institutionId: string;
    readonly groupId: string;
    readonly name: string;
    readonly slug: string;
    readonly capacity: number | null;
    readonly floorId: string | null;
    readonly campusId: string | null;
  }): Promise<{ readonly id: string }>;

  /* ---- Subjects -------------------------------------------------------- */
  listSubjects(institutionId: string): Promise<readonly SubjectRow[]>;
  insertSubject(input: {
    readonly institutionId: string;
    readonly name: string;
    readonly slug: string;
    readonly code: string;
    readonly kind: "theory" | "practical" | "both";
    readonly departmentId: string | null;
    readonly description: string | null;
  }): Promise<{ readonly id: string }>;

  /* ---- Time slots ------------------------------------------------------ */
  listTimeSlots(institutionId: string): Promise<readonly TimeSlotRow[]>;
  insertTimeSlot(input: {
    readonly institutionId: string;
    readonly academicSessionId: string | null;
    readonly name: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly sequence: number;
    readonly isBreak: boolean;
  }): Promise<{ readonly id: string }>;

  /** Existing slugs in a scope, for collision-free slug minting. */
  listSlugs(institutionId: string, scope: SlugScope): Promise<readonly string[]>;
}
