/**
 * Complaints domain module public boundary (`PRD.md` MODULE 25, `ARCHITECTURE.md` §23).
 */

import { ComplaintService } from "./application/complaint-service";
import { DrizzleComplaintStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/complaint-rules";

const store = new DrizzleComplaintStore();
const service = new ComplaintService(store);

export { ComplaintService, DrizzleComplaintStore };

export const submitComplaint = service.submitComplaint.bind(service);
export const getComplaint = service.getComplaint.bind(service);
export const getComplaintDetails = service.getComplaintDetails.bind(service);
export const listComplaints = service.listComplaints.bind(service);
export const assignComplaint = service.assignComplaint.bind(service);
export const resolveComplaint = service.resolveComplaint.bind(service);
export const dismissComplaint = service.dismissComplaint.bind(service);
export const escalateComplaint = service.escalateComplaint.bind(service);
export const notifyStudentOrGuardian = service.notifyStudentOrGuardian.bind(service);
export const addComplaintComment = service.addComment.bind(service);
export const grantComplaintVisibility = service.grantVisibility.bind(service);
