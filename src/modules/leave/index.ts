/**
 * Leave domain module public boundary (`PRD.md` MODULE 13 & 16, `PHASES.md` §24 Phase 16).
 */
import { LeaveService } from "./application/leave-service";
import { DrizzleLeaveStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/leave-rules";

const store = new DrizzleLeaveStore();
const service = new LeaveService(store);

export { LeaveService, DrizzleLeaveStore };

export const submitStudentLeaveRequest = service.submitStudentLeaveRequest.bind(service);
export const reviewLeaveRequest = service.reviewLeaveRequest.bind(service);
export const cancelLeaveRequest = service.cancelLeaveRequest.bind(service);
export const getLeaveRequest = service.getLeaveRequest.bind(service);
export const listLeaveRequests = service.listLeaveRequests.bind(service);
export const findApprovedLeaveForStudent = service.findApprovedLeaveForStudent.bind(service);
