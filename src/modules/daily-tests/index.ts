/**
 * Daily Tests module public boundary (`ARCHITECTURE.md` §23, `PRD.md` MODULE 21).
 */
import { DailyTestService } from "./application/daily-test-service";
import { DrizzleDailyTestStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/daily-test-rules";

const store = new DrizzleDailyTestStore();
const service = new DailyTestService(store);

export { DailyTestService, DrizzleDailyTestStore };

export const createDailyTest = service.createDailyTest.bind(service);
export const getDailyTest = service.getDailyTest.bind(service);
export const listDailyTests = service.listDailyTests.bind(service);
export const batchEnterEvaluations = service.batchEnterEvaluations.bind(service);
export const recordDailyTestCorrection = service.recordCorrection.bind(service);
export const publishDailyTest = service.publishDailyTest.bind(service);
export const lockDailyTest = service.lockDailyTest.bind(service);
export const getDailyTestSheet = service.getDailyTestSheet.bind(service);
export const getStudentDailyTests = service.getStudentDailyTests.bind(service);
