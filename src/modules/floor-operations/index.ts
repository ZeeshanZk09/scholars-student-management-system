/**
 * Floor operations domain module public boundary (`ARCHITECTURE.md` §19, `PRD.md` MODULE 15/17/18/19).
 */

import { FloorOperationsService } from "./application/floor-operations-service";
import { DrizzleFloorOperationsStore } from "./infrastructure/drizzle-store";

export * from "./application/ports";
export * from "./application/schemas";
export * from "./domain/floor-rules";

const store = new DrizzleFloorOperationsStore();
const service = new FloorOperationsService(store);

export { FloorOperationsService, DrizzleFloorOperationsStore };

export const captureLiveSnapshot = service.captureLiveSnapshot.bind(service);
export const listLiveSnapshots = service.listLiveSnapshots.bind(service);
export const getLiveSnapshot = service.getLiveSnapshot.bind(service);

export const recordTeacherAbsence = service.recordTeacherAbsence.bind(service);
export const listTeacherAbsences = service.listTeacherAbsences.bind(service);

export const createExtraPeriod = service.createExtraPeriod.bind(service);
export const getExtraPeriod = service.getExtraPeriod.bind(service);
export const approveExtraPeriod = service.approveExtraPeriod.bind(service);
export const listExtraPeriods = service.listExtraPeriods.bind(service);

export const createIncidentReport = service.createIncidentReport.bind(service);
export const escalateIncidentReport = service.escalateIncidentReport.bind(service);
export const resolveIncidentReport = service.resolveIncidentReport.bind(service);
export const listIncidentReports = service.listIncidentReports.bind(service);
export const getIncidentReport = service.getIncidentReport.bind(service);

export const assignFloorIncharge = service.assignFloorIncharge.bind(service);
export const listFloorAssignments = service.listFloorAssignments.bind(service);

export const getFloorWalkthrough = service.getFloorWalkthrough.bind(service);
