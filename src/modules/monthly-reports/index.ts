/**
 * Monthly Test Reports module public boundary (`ARCHITECTURE.md` §15/§23, `PRD.md` MODULE 22).
 */
import { MonthlyReportService } from "./application/monthly-report-service";
import { DrizzleMonthlyReportStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/report-rules";
export * from "./ui/actions";
export * from "./ui/monthly-report-card";

const store = new DrizzleMonthlyReportStore();
const service = new MonthlyReportService(store);

export { MonthlyReportService, DrizzleMonthlyReportStore };

export const generateMonthlyReport = service.generateReport.bind(service);
export const batchGenerateMonthlyReports = service.batchGenerateReports.bind(service);
export const publishMonthlyReports = service.publishReports.bind(service);
export const lockMonthlyReports = service.lockReports.bind(service);
export const getStudentMonthlyReportCard = service.getStudentReportCard.bind(service);
export const getMonthlyReportDetails = service.getReportDetails.bind(service);
export const listMonthlyReports = service.listReports.bind(service);
