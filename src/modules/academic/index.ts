/**
 * The academic module's public surface (`src/modules/README.md`): wires the Drizzle store into the
 * academic service, then exports one-call functions. Nothing outside the module reaches into
 * `application/`, `domain/` or `infrastructure/`.
 *
 * Phase 6 (tasks 8, 10, 12) covers institute and academic master data: institutions, campuses,
 * buildings, floors, departments, designations, academic sessions, classes / groups / sections,
 * subjects and time slots. Consumers import row types and the one-call functions from here.
 */
import { createAcademicService } from "./application/academic-service";
import type { AcademicService, CreateResult } from "./application/academic-service";
import type { AcademicStore } from "./application/ports";
import type {
  BuildingRow,
  CampusRow,
  ClassNode,
  DepartmentRow,
  DesignationRow,
  FloorRow,
  GroupNode,
  InstitutionRow,
  SectionNode,
  SessionRow,
  SubjectRow,
  TimeSlotRow,
} from "./application/ports";
import { drizzleAcademicStore } from "./infrastructure/drizzle-store";

const academic: AcademicService = createAcademicService(drizzleAcademicStore);

/**
 * Presentation constants derived from the domain. Re-exported here rather than imported from
 * `application/` by a page, because `index.ts` is the module's only public surface
 * (`src/modules/README.md`).
 */

/** Single-row convenience helpers the UI keeps calling; the real surface is {@link academic}. */

export function listInstitutions() {
  return academic.listInstitutions();
}

export function getInstitution(institutionId: string) {
  return academic.getInstitution(institutionId);
}

export function resolveActingInstitution(preferredInstitutionId: string | null) {
  return academic.resolveActingInstitution(preferredInstitutionId);
}

export function createInstitution(input: unknown) {
  return academic.createInstitution(input);
}

export function updateInstitution(input: unknown) {
  return academic.updateInstitution(input);
}

export function createCampus(input: unknown) {
  return academic.createCampus(input);
}

export function listBuildingsWithFloors(institutionId: string) {
  return academic.listBuildingsWithFloors(institutionId);
}

export function listCampuses(institutionId: string) {
  return academic.listCampuses(institutionId);
}

export function createBuilding(input: unknown) {
  return academic.createBuilding(input);
}

export function createFloor(input: unknown) {
  return academic.createFloor(input);
}

export function listDepartments(institutionId: string) {
  return academic.listDepartments(institutionId);
}

export function listDesignations(institutionId: string) {
  return academic.listDesignations(institutionId);
}

export function createDepartment(input: unknown) {
  return academic.createDepartment(input);
}

export function createDesignation(input: unknown) {
  return academic.createDesignation(input);
}

export function listAcademicSessions(institutionId: string) {
  return academic.listAcademicSessions(institutionId);
}

export function createAcademicSession(input: unknown) {
  return academic.createAcademicSession(input);
}

export function setCurrentSession(input: unknown) {
  return academic.setCurrentSession(input);
}

export function closeSession(input: unknown) {
  return academic.closeSession(input);
}

export function listClassTree(institutionId: string, sessionId: string) {
  return academic.listClassTree(institutionId, sessionId);
}

export function listClassTreeByGroup(institutionId: string) {
  return academic.listClassTreeByGroup(institutionId);
}

export function createClass(input: unknown) {
  return academic.createClass(input);
}

export function createGroup(input: unknown) {
  return academic.createGroup(input);
}

export function createSection(input: unknown) {
  return academic.createSection(input);
}

export function listSubjects(institutionId: string) {
  return academic.listSubjects(institutionId);
}

export function createSubject(input: unknown) {
  return academic.createSubject(input);
}

export function listTimeSlots(institutionId: string) {
  return academic.listTimeSlots(institutionId);
}

export function createTimeSlot(input: unknown) {
  return academic.createTimeSlot(input);
}

export { GRADE_LEVEL_OPTIONS } from "./application/schemas";

export type {
  AcademicStore,
  BuildingRow,
  CampusRow,
  ClassNode,
  CreateResult,
  DepartmentRow,
  DesignationRow,
  FloorRow,
  GroupNode,
  InstitutionRow,
  SectionNode,
  SessionRow,
  SubjectRow,
  TimeSlotRow,
};
