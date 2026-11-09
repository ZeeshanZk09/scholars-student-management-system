/**
 * Examinations domain module public boundary (`ARCHITECTURE.md` §15/§23, `PRD.md` MODULE 20).
 */
import { ExaminationService } from "./application/exam-service";
import { DrizzleExaminationStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/exam-rules";

const store = new DrizzleExaminationStore();
const service = new ExaminationService(store);

export { ExaminationService, DrizzleExaminationStore };

export const createExamination = service.createExamination.bind(service);
export const registerStudentsForExamination = service.registerStudents.bind(service);
export const enterMarksBatch = service.enterMarksBatch.bind(service);
export const recordExamMarkCorrection = service.recordCorrection.bind(service);
export const publishExamination = service.publishExamination.bind(service);
export const lockExamination = service.lockExamination.bind(service);
export const consolidateAndPublishStudentResults = service.consolidateAndPublishStudentResults.bind(service);
export const getExaminationSheet = service.getExaminationSheet.bind(service);
export const getStudentSessionResult = service.getStudentSessionResult.bind(service);
export const listExaminations = service.listExaminations.bind(service);
