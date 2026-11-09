/**
 * Attendance domain module public boundary (`ARCHITECTURE.md` §17–§18, `PRD.md` MODULE 17, `ADR-0002`).
 */
import { AttendanceService } from "./application/attendance-service";
import { DrizzleAttendanceStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/attendance-rules";

const store = new DrizzleAttendanceStore();
const service = new AttendanceService(store);

export { AttendanceService, DrizzleAttendanceStore };

export const openAttendanceSession = service.openSession.bind(service);
export const saveAttendanceMarks = service.saveMarks.bind(service);
export const recordAttendanceCorrection = service.recordCorrection.bind(service);
export const getSectionAttendanceSheet = service.getSectionAttendanceSheet.bind(service);
export const getStudentMonthlySummary = service.getStudentMonthlySummary.bind(service);
export const listDailyAttendanceSessions = service.listDailySessions.bind(service);
export const listSectionRoster = service.listSectionRoster.bind(service);
export const getAttendanceRecord = service.getAttendanceRecord.bind(service);
