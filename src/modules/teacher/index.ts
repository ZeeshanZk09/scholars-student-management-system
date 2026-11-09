/**
 * Teacher domain module public boundary (`PRD.md` MODULE 20, `PHASES.md` §22, `ADR-0002`).
 */
import { TeacherService } from "./application/teacher-service";
import { DrizzleTeacherStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/teacher-rules";

const store = new DrizzleTeacherStore();
const service = new TeacherService(store);

export const getTeacher = service.getTeacher.bind(service);
export const listTeachers = service.listTeachers.bind(service);
export const createTeacher = service.createTeacher.bind(service);
export const updateTeacher = service.updateTeacher.bind(service);
export const assignTeacher = service.assignTeacher.bind(service);
export const removeAssignment = service.removeAssignment.bind(service);
export const listAssignments = service.listAssignments.bind(service);
export const addCompetence = service.addCompetence.bind(service);
export const listCompetences = service.listCompetences.bind(service);
export const getTeacherPortalSummary = service.getTeacherPortalSummary.bind(service);
