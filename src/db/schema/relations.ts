/**
 * Drizzle relational definitions.
 *
 * ## Why this file exists separately from the table definitions
 *
 * A relation names *two* tables, so declaring it in either module's file would make one module import the
 * other. `fees` needs `finance` and `finance` needs `fees`; `hr` needs `teacher` and `teacher` needs `hr`.
 * The dependency graph is not a tree, so no in-module placement is acyclic. One file that imports every
 * table module is the only option, which is why this exists.
 *
 * ## These are the joins the schema already declares as foreign keys
 *
 * Every relation below corresponds to a real `references()` call. Nothing here invents a relationship the
 * database does not enforce.
 *
 * Several cross-module links are deliberately *not* here. `notifications.relatedEntityId`,
 * `email_messages.relatedEntityId` and `jobs.relatedEntityId` are polymorphic — they can point at any table,
 * so a foreign key would be a lie about what they reference. Joining those needs `eq()` and a table chosen
 * by the caller, which is exactly the kind of decision a static map cannot make.
 *
 * ## Generated from the schema, and kept that way
 *
 * This file was produced by reading Drizzle's own `getTableConfig()` over every table module and emitting one
 * relation per foreign key. That is not a stylistic preference. A hand-maintained relation map drifts from
 * its foreign keys: someone adds an `institutionId` reference, does not add the relation, and `db.query` has
 * no path to it while `tsc` stays quiet. Deriving from the graph means the two cannot disagree, and a new
 * foreign key shows up here as a reviewable diff instead of an invisible gap.
 *
 * Re-derive rather than hand-edit. The generator lives outside the repo because it is a build-time
 * observation of the schema, not source that anyone needs to read.
 *
 * ## Nothing here is consumed yet
 *
 * Every query in this codebase so far is `db.select()` with explicit joins; nothing calls `db.query`. This
 * file exists because the schema needs a coherent relational surface for the phases that follow, not
 * because there is a caller today. If it is still unused when the query layer is written, the honest move is
 * to delete it rather than maintain it on faith.
 *
 * ## `relationName` on both sides, always
 *
 * Many tables reference the same parent more than once — `complaints` names `users` three times (reporter,
 * assignee, resolver), `user_roles` three times (subject, granter, revoker). Drizzle resolves an unqualified
 * relation by table pair, so two relations between one pair are ambiguous. Every relation here therefore
 * carries an explicit `relationName` of `childTable_column`, on the `one` side and the `many` side, which
 * makes each edge individually addressable and removes the ambiguity by construction.
 *
 * ## Self-references
 *
 * `payments.reversesPaymentId`, `journal_transactions.reversesTransactionId` and `expense_heads.parentHeadId`
 * point at their own table. A self-relation needs `relationName` on both sides too, or Drizzle cannot tell
 * the forward edge from the inverse.
 */

import { relations } from "drizzle-orm";

// Table modules, in dependency order, so a reader can see the whole schema top to bottom.
import {
  academicSessions,
  buildings,
  campuses,
  departments,
  designations,
  floors,
  institutions,
} from "./institution";
import {
  admissionChecklistCompletions,
  admissionChecklists,
  admissionDocuments,
  admissionStatusHistory,
  admissionWindows,
  admissions,
} from "./admission";
import {
  announcementAudiences,
  announcementReceipts,
  announcements,
  emailDeliveryEvents,
  emailMessages,
  emailTemplates,
  notificationDeliveries,
  notificationPreferences,
  notifications,
} from "./communication";
import {
  attendanceCorrections,
  attendanceExceptions,
  attendanceRecords,
  attendanceSessions,
  dailyAttendanceSummaries,
} from "./attendance";
import { auditEvents, settingChanges, systemSettings } from "./governance";
import {
  bankReconciliationItems,
  bankReconciliations,
  budgets,
  expenseHeads,
  expenses,
  financialAccounts,
  financialPeriods,
  journalTransactions,
  ledgerEntries,
  paymentMethods,
} from "./finance";
import { biometricDevices, biometricEnrollments, biometricTransactions } from "./biometric";
import {
  classSubjects,
  classTeacherAssignments,
  classes,
  floorAssignments,
  groups,
  scheduleChangeSets,
  schedulePublishHistory,
  schedules,
  sections,
  subjects,
  timeSlots,
} from "./academic";
import {
  complaintActions,
  complaintAttachments,
  complaintComments,
  complaintVisibility,
  complaints,
} from "./complaints";
import {
  dailyTestCorrections,
  dailyTestEvaluations,
  dailyTestPublications,
  dailyTests,
  monthlyTestReportItems,
  monthlyTestReports,
} from "./daily-tests";
import { deadLetterJobs, jobDefinitions, jobRuns, jobSchedules, jobs } from "./jobs";
import {
  diaries,
  diaryAssignments,
  diaryAttachments,
  diaryNotificationPreferences,
  diaryNotifications,
  diaryReads,
} from "./diary";
import {
  emergencyContacts,
  guardianAuthorizations,
  guardianLinks,
  guardians,
  studentGuardianSnapshots,
} from "./guardian";
import {
  employeeAttendance,
  employeeDocuments,
  employeeStatusHistory,
  employees,
  hrAnnouncements,
  leaveAttachments,
  leaveRequests,
  leaveTypes,
  salaryAssignments,
  salaryStructures,
} from "./hr";
import {
  examMarksCorrections,
  examinationMarks,
  examinationRegistrations,
  examinations,
  gradingBands,
  gradingSchemes,
  resultPublicationLog,
  studentResults,
} from "./examinations";
import {
  extraPeriods,
  floorIncidentReports,
  floorLiveSnapshots,
  teacherAbsences,
} from "./floor-operations";
import {
  feeConcessions,
  feeDeferrals,
  feeInstallments,
  feeInvoiceLines,
  feeInvoices,
  feePaymentPlans,
  feeStructureAudit,
  feeStructureItems,
  feeStructures,
  paymentAllocations,
  payments,
  receipts,
} from "./fees";
import {
  payrollAdjustments,
  payrollCalculationSources,
  payrollItems,
  payrollPayments,
  payrollPayslips,
  payrollPeriodLocks,
  payrollRuns,
} from "./payroll";
import {
  permissionScopes,
  permissions,
  rolePermissions,
  roles,
  userPermissions,
  userRoles,
} from "./authorization";
import { securityEvents, sessions, userCredentials, userInstitutions, users } from "./identity";
import {
  studentDocuments,
  studentEnrollments,
  studentNotes,
  studentPlacements,
  studentPreviousSchools,
  students,
} from "./student";
import {
  teacherDocuments,
  teacherLeaveBalances,
  teacherQualifications,
  teacherSubjects,
  teacherWorkloadHistory,
  teachers,
} from "./teacher";

export const academicSessionsRelations = relations(academicSessions, ({ many, one }) => ({
  admission: many(admissions, {
    relationName: "admissions_academicSessionId",
  }),
  admissionWindow: many(admissionWindows, {
    relationName: "admission_windows_academicSessionId",
  }),
  announcement: many(announcements, {
    relationName: "announcements_academicSessionId",
  }),
  attendanceSession: many(attendanceSessions, {
    relationName: "attendance_sessions_academicSessionId",
  }),
  classTeacherAssignment: many(classTeacherAssignments, {
    relationName: "class_teacher_assignments_academicSessionId",
  }),
  classe: many(classes, { relationName: "classes_academicSessionId" }),
  complaint: many(complaints, {
    relationName: "complaints_academicSessionId",
  }),
  dailyAttendanceSummarie: many(dailyAttendanceSummaries, {
    relationName: "daily_attendance_summaries_academicSessionId",
  }),
  dailyTest: many(dailyTests, {
    relationName: "daily_tests_academicSessionId",
  }),
  diarie: many(diaries, { relationName: "diaries_academicSessionId" }),
  examination: many(examinations, {
    relationName: "examinations_academicSessionId",
  }),
  examinationMark: many(examinationMarks, {
    relationName: "examination_marks_academicSessionId",
  }),
  extraPeriod: many(extraPeriods, {
    relationName: "extra_periods_academicSessionId",
  }),
  feeInvoice: many(feeInvoices, {
    relationName: "fee_invoices_academicSessionId",
  }),
  feeStructure: many(feeStructures, {
    relationName: "fee_structures_academicSessionId",
  }),
  gradingScheme: many(gradingSchemes, {
    relationName: "grading_schemes_academicSessionId",
  }),
  monthlyTestReport: many(monthlyTestReports, {
    relationName: "monthly_test_reports_academicSessionId",
  }),
  payment: many(payments, { relationName: "payments_academicSessionId" }),
  payrollRun: many(payrollRuns, {
    relationName: "payroll_runs_academicSessionId",
  }),
  schedule: many(schedules, { relationName: "schedules_academicSessionId" }),
  scheduleChangeSet: many(scheduleChangeSets, {
    relationName: "schedule_change_sets_academicSessionId",
  }),
  schedulePublishHistory: many(schedulePublishHistory, {
    relationName: "schedule_publish_history_academicSessionId",
  }),
  studentEnrollment: many(studentEnrollments, {
    relationName: "student_enrollments_academicSessionId",
  }),
  studentPlacement: many(studentPlacements, {
    relationName: "student_placements_academicSessionId",
  }),
  studentResult: many(studentResults, {
    relationName: "student_results_academicSessionId",
  }),
  timeSlot: many(timeSlots, { relationName: "time_slots_academicSessionId" }),
  institutionId: one(institutions, {
    fields: [academicSessions.institutionId],
    references: [institutions.id],
    relationName: "academic_sessions_institutionId",
  }),
}));

export const admissionChecklistCompletionsRelations = relations(
  admissionChecklistCompletions,
  ({ one }) => ({
    admissionId: one(admissions, {
      fields: [admissionChecklistCompletions.admissionId],
      references: [admissions.id],
      relationName: "admission_checklist_completions_admissionId",
    }),
    checklistId: one(admissionChecklists, {
      fields: [admissionChecklistCompletions.checklistId],
      references: [admissionChecklists.id],
      relationName: "admission_checklist_completions_checklistId",
    }),
  }),
);

export const admissionChecklistsRelations = relations(admissionChecklists, ({ many, one }) => ({
  admissionChecklistCompletion: many(admissionChecklistCompletions, {
    relationName: "admission_checklist_completions_checklistId",
  }),
  institutionId: one(institutions, {
    fields: [admissionChecklists.institutionId],
    references: [institutions.id],
    relationName: "admission_checklists_institutionId",
  }),
}));

export const admissionDocumentsRelations = relations(admissionDocuments, ({ one }) => ({
  admissionId: one(admissions, {
    fields: [admissionDocuments.admissionId],
    references: [admissions.id],
    relationName: "admission_documents_admissionId",
  }),
}));

export const admissionStatusHistoryRelations = relations(admissionStatusHistory, ({ one }) => ({
  admissionId: one(admissions, {
    fields: [admissionStatusHistory.admissionId],
    references: [admissions.id],
    relationName: "admission_status_history_admissionId",
  }),
}));

export const admissionWindowsRelations = relations(admissionWindows, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [admissionWindows.academicSessionId],
    references: [academicSessions.id],
    relationName: "admission_windows_academicSessionId",
  }),
  classId: one(classes, {
    fields: [admissionWindows.classId],
    references: [classes.id],
    relationName: "admission_windows_classId",
  }),
  groupId: one(groups, {
    fields: [admissionWindows.groupId],
    references: [groups.id],
    relationName: "admission_windows_groupId",
  }),
  institutionId: one(institutions, {
    fields: [admissionWindows.institutionId],
    references: [institutions.id],
    relationName: "admission_windows_institutionId",
  }),
}));

export const admissionsRelations = relations(admissions, ({ many, one }) => ({
  admissionChecklistCompletion: many(admissionChecklistCompletions, {
    relationName: "admission_checklist_completions_admissionId",
  }),
  admissionDocument: many(admissionDocuments, {
    relationName: "admission_documents_admissionId",
  }),
  admissionStatusHistory: many(admissionStatusHistory, {
    relationName: "admission_status_history_admissionId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [admissions.academicSessionId],
    references: [academicSessions.id],
    relationName: "admissions_academicSessionId",
  }),
  appliedClassId: one(classes, {
    fields: [admissions.appliedClassId],
    references: [classes.id],
    relationName: "admissions_appliedClassId",
  }),
  appliedGroupId: one(groups, {
    fields: [admissions.appliedGroupId],
    references: [groups.id],
    relationName: "admissions_appliedGroupId",
  }),
  institutionId: one(institutions, {
    fields: [admissions.institutionId],
    references: [institutions.id],
    relationName: "admissions_institutionId",
  }),
  studentId: one(students, {
    fields: [admissions.studentId],
    references: [students.id],
    relationName: "admissions_studentId",
  }),
}));

export const announcementAudiencesRelations = relations(announcementAudiences, ({ one }) => ({
  announcementId: one(announcements, {
    fields: [announcementAudiences.announcementId],
    references: [announcements.id],
    relationName: "announcement_audiences_announcementId",
  }),
}));

export const announcementReceiptsRelations = relations(announcementReceipts, ({ one }) => ({
  announcementId: one(announcements, {
    fields: [announcementReceipts.announcementId],
    references: [announcements.id],
    relationName: "announcement_receipts_announcementId",
  }),
  userId: one(users, {
    fields: [announcementReceipts.userId],
    references: [users.id],
    relationName: "announcement_receipts_userId",
  }),
}));

export const announcementsRelations = relations(announcements, ({ many, one }) => ({
  announcementAudience: many(announcementAudiences, {
    relationName: "announcement_audiences_announcementId",
  }),
  announcementReceipt: many(announcementReceipts, {
    relationName: "announcement_receipts_announcementId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [announcements.academicSessionId],
    references: [academicSessions.id],
    relationName: "announcements_academicSessionId",
  }),
  authorUserId: one(users, {
    fields: [announcements.authorUserId],
    references: [users.id],
    relationName: "announcements_authorUserId",
  }),
  campusId: one(campuses, {
    fields: [announcements.campusId],
    references: [campuses.id],
    relationName: "announcements_campusId",
  }),
  institutionId: one(institutions, {
    fields: [announcements.institutionId],
    references: [institutions.id],
    relationName: "announcements_institutionId",
  }),
  notificationId: one(notifications, {
    fields: [announcements.notificationId],
    references: [notifications.id],
    relationName: "announcements_notificationId",
  }),
}));

export const attendanceCorrectionsRelations = relations(attendanceCorrections, ({ one }) => ({
  sectionId: one(sections, {
    fields: [attendanceCorrections.sectionId],
    references: [sections.id],
    relationName: "attendance_corrections_sectionId",
  }),
  studentId: one(students, {
    fields: [attendanceCorrections.studentId],
    references: [students.id],
    relationName: "attendance_corrections_studentId",
  }),
  timeSlotId: one(timeSlots, {
    fields: [attendanceCorrections.timeSlotId],
    references: [timeSlots.id],
    relationName: "attendance_corrections_timeSlotId",
  }),
}));

export const attendanceExceptionsRelations = relations(attendanceExceptions, ({ one }) => ({
  deviceId: one(biometricDevices, {
    fields: [attendanceExceptions.deviceId],
    references: [biometricDevices.id],
    relationName: "attendance_exceptions_deviceId",
  }),
  sectionId: one(sections, {
    fields: [attendanceExceptions.sectionId],
    references: [sections.id],
    relationName: "attendance_exceptions_sectionId",
  }),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  biometricTransactionId: one(biometricTransactions, {
    fields: [attendanceRecords.biometricTransactionId],
    references: [biometricTransactions.id],
    relationName: "attendance_records_biometricTransactionId",
  }),
  leaveRequestId: one(leaveRequests, {
    fields: [attendanceRecords.leaveRequestId],
    references: [leaveRequests.id],
    relationName: "attendance_records_leaveRequestId",
  }),
  sectionId: one(sections, {
    fields: [attendanceRecords.sectionId],
    references: [sections.id],
    relationName: "attendance_records_sectionId",
  }),
  studentId: one(students, {
    fields: [attendanceRecords.studentId],
    references: [students.id],
    relationName: "attendance_records_studentId",
  }),
  timeSlotId: one(timeSlots, {
    fields: [attendanceRecords.timeSlotId],
    references: [timeSlots.id],
    relationName: "attendance_records_timeSlotId",
  }),
}));

export const attendanceSessionsRelations = relations(attendanceSessions, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [attendanceSessions.academicSessionId],
    references: [academicSessions.id],
    relationName: "attendance_sessions_academicSessionId",
  }),
  scheduleId: one(schedules, {
    fields: [attendanceSessions.scheduleId],
    references: [schedules.id],
    relationName: "attendance_sessions_scheduleId",
  }),
  sectionId: one(sections, {
    fields: [attendanceSessions.sectionId],
    references: [sections.id],
    relationName: "attendance_sessions_sectionId",
  }),
  timeSlotId: one(timeSlots, {
    fields: [attendanceSessions.timeSlotId],
    references: [timeSlots.id],
    relationName: "attendance_sessions_timeSlotId",
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actorUserId: one(users, {
    fields: [auditEvents.actorUserId],
    references: [users.id],
    relationName: "audit_events_actorUserId",
  }),
  institutionId: one(institutions, {
    fields: [auditEvents.institutionId],
    references: [institutions.id],
    relationName: "audit_events_institutionId",
  }),
}));

export const bankReconciliationItemsRelations = relations(bankReconciliationItems, ({ one }) => ({
  ledgerEntryId: one(ledgerEntries, {
    fields: [bankReconciliationItems.ledgerEntryId],
    references: [ledgerEntries.id],
    relationName: "bank_reconciliation_items_ledgerEntryId",
  }),
  reconciliationId: one(bankReconciliations, {
    fields: [bankReconciliationItems.reconciliationId],
    references: [bankReconciliations.id],
    relationName: "bank_reconciliation_items_reconciliationId",
  }),
}));

export const bankReconciliationsRelations = relations(bankReconciliations, ({ many, one }) => ({
  bankReconciliationItem: many(bankReconciliationItems, {
    relationName: "bank_reconciliation_items_reconciliationId",
  }),
  accountId: one(financialAccounts, {
    fields: [bankReconciliations.accountId],
    references: [financialAccounts.id],
    relationName: "bank_reconciliations_accountId",
  }),
}));

export const biometricDevicesRelations = relations(biometricDevices, ({ many, one }) => ({
  attendanceException: many(attendanceExceptions, {
    relationName: "attendance_exceptions_deviceId",
  }),
  biometricEnrollment: many(biometricEnrollments, {
    relationName: "biometric_enrollments_deviceId",
  }),
  biometricTransaction: many(biometricTransactions, {
    relationName: "biometric_transactions_deviceId",
  }),
  campusId: one(campuses, {
    fields: [biometricDevices.campusId],
    references: [campuses.id],
    relationName: "biometric_devices_campusId",
  }),
  floorId: one(floors, {
    fields: [biometricDevices.floorId],
    references: [floors.id],
    relationName: "biometric_devices_floorId",
  }),
  institutionId: one(institutions, {
    fields: [biometricDevices.institutionId],
    references: [institutions.id],
    relationName: "biometric_devices_institutionId",
  }),
}));

export const biometricEnrollmentsRelations = relations(biometricEnrollments, ({ one }) => ({
  deviceId: one(biometricDevices, {
    fields: [biometricEnrollments.deviceId],
    references: [biometricDevices.id],
    relationName: "biometric_enrollments_deviceId",
  }),
  employeeId: one(employees, {
    fields: [biometricEnrollments.employeeId],
    references: [employees.id],
    relationName: "biometric_enrollments_employeeId",
  }),
  studentId: one(students, {
    fields: [biometricEnrollments.studentId],
    references: [students.id],
    relationName: "biometric_enrollments_studentId",
  }),
}));

export const biometricTransactionsRelations = relations(biometricTransactions, ({ many, one }) => ({
  attendanceRecord: many(attendanceRecords, {
    relationName: "attendance_records_biometricTransactionId",
  }),
  deviceId: one(biometricDevices, {
    fields: [biometricTransactions.deviceId],
    references: [biometricDevices.id],
    relationName: "biometric_transactions_deviceId",
  }),
  employeeId: one(employees, {
    fields: [biometricTransactions.employeeId],
    references: [employees.id],
    relationName: "biometric_transactions_employeeId",
  }),
  resolvedTimeSlotId: one(timeSlots, {
    fields: [biometricTransactions.resolvedTimeSlotId],
    references: [timeSlots.id],
    relationName: "biometric_transactions_resolvedTimeSlotId",
  }),
  studentId: one(students, {
    fields: [biometricTransactions.studentId],
    references: [students.id],
    relationName: "biometric_transactions_studentId",
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  departmentId: one(departments, {
    fields: [budgets.departmentId],
    references: [departments.id],
    relationName: "budgets_departmentId",
  }),
  expenseHeadId: one(expenseHeads, {
    fields: [budgets.expenseHeadId],
    references: [expenseHeads.id],
    relationName: "budgets_expenseHeadId",
  }),
  institutionId: one(institutions, {
    fields: [budgets.institutionId],
    references: [institutions.id],
    relationName: "budgets_institutionId",
  }),
}));

export const buildingsRelations = relations(buildings, ({ many, one }) => ({
  floor: many(floors, { relationName: "floors_buildingId" }),
  campusId: one(campuses, {
    fields: [buildings.campusId],
    references: [campuses.id],
    relationName: "buildings_campusId",
  }),
  institutionId: one(institutions, {
    fields: [buildings.institutionId],
    references: [institutions.id],
    relationName: "buildings_institutionId",
  }),
}));

export const campusesRelations = relations(campuses, ({ many, one }) => ({
  announcement: many(announcements, { relationName: "announcements_campusId" }),
  biometricDevice: many(biometricDevices, {
    relationName: "biometric_devices_campusId",
  }),
  building: many(buildings, { relationName: "buildings_campusId" }),
  floorIncidentReport: many(floorIncidentReports, {
    relationName: "floor_incident_reports_campusId",
  }),
  section: many(sections, { relationName: "sections_campusId" }),
  institutionId: one(institutions, {
    fields: [campuses.institutionId],
    references: [institutions.id],
    relationName: "campuses_institutionId",
  }),
}));

export const classSubjectsRelations = relations(classSubjects, ({ one }) => ({
  classId: one(classes, {
    fields: [classSubjects.classId],
    references: [classes.id],
    relationName: "class_subjects_classId",
  }),
  groupId: one(groups, {
    fields: [classSubjects.groupId],
    references: [groups.id],
    relationName: "class_subjects_groupId",
  }),
  institutionId: one(institutions, {
    fields: [classSubjects.institutionId],
    references: [institutions.id],
    relationName: "class_subjects_institutionId",
  }),
  sectionId: one(sections, {
    fields: [classSubjects.sectionId],
    references: [sections.id],
    relationName: "class_subjects_sectionId",
  }),
  subjectId: one(subjects, {
    fields: [classSubjects.subjectId],
    references: [subjects.id],
    relationName: "class_subjects_subjectId",
  }),
}));

export const classTeacherAssignmentsRelations = relations(classTeacherAssignments, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [classTeacherAssignments.academicSessionId],
    references: [academicSessions.id],
    relationName: "class_teacher_assignments_academicSessionId",
  }),
  classId: one(classes, {
    fields: [classTeacherAssignments.classId],
    references: [classes.id],
    relationName: "class_teacher_assignments_classId",
  }),
  groupId: one(groups, {
    fields: [classTeacherAssignments.groupId],
    references: [groups.id],
    relationName: "class_teacher_assignments_groupId",
  }),
  institutionId: one(institutions, {
    fields: [classTeacherAssignments.institutionId],
    references: [institutions.id],
    relationName: "class_teacher_assignments_institutionId",
  }),
  sectionId: one(sections, {
    fields: [classTeacherAssignments.sectionId],
    references: [sections.id],
    relationName: "class_teacher_assignments_sectionId",
  }),
  subjectId: one(subjects, {
    fields: [classTeacherAssignments.subjectId],
    references: [subjects.id],
    relationName: "class_teacher_assignments_subjectId",
  }),
}));

export const classesRelations = relations(classes, ({ many, one }) => ({
  admission: many(admissions, { relationName: "admissions_appliedClassId" }),
  admissionWindow: many(admissionWindows, {
    relationName: "admission_windows_classId",
  }),
  classSubject: many(classSubjects, { relationName: "class_subjects_classId" }),
  classTeacherAssignment: many(classTeacherAssignments, {
    relationName: "class_teacher_assignments_classId",
  }),
  complaint: many(complaints, { relationName: "complaints_classId" }),
  dailyTest: many(dailyTests, { relationName: "daily_tests_classId" }),
  dailyTestEvaluation: many(dailyTestEvaluations, {
    relationName: "daily_test_evaluations_classId",
  }),
  diarie: many(diaries, { relationName: "diaries_classId" }),
  diaryAssignment: many(diaryAssignments, {
    relationName: "diary_assignments_classId",
  }),
  examination: many(examinations, { relationName: "examinations_classId" }),
  examinationMark: many(examinationMarks, {
    relationName: "examination_marks_classId",
  }),
  feeStructure: many(feeStructures, { relationName: "fee_structures_classId" }),
  group: many(groups, { relationName: "groups_classId" }),
  monthlyTestReport: many(monthlyTestReports, {
    relationName: "monthly_test_reports_classId",
  }),
  studentPlacement: many(studentPlacements, {
    relationName: "student_placements_classId",
  }),
  studentResult: many(studentResults, {
    relationName: "student_results_classId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [classes.academicSessionId],
    references: [academicSessions.id],
    relationName: "classes_academicSessionId",
  }),
  departmentId: one(departments, {
    fields: [classes.departmentId],
    references: [departments.id],
    relationName: "classes_departmentId",
  }),
  institutionId: one(institutions, {
    fields: [classes.institutionId],
    references: [institutions.id],
    relationName: "classes_institutionId",
  }),
}));

export const complaintActionsRelations = relations(complaintActions, ({ one }) => ({
  actorUserId: one(users, {
    fields: [complaintActions.actorUserId],
    references: [users.id],
    relationName: "complaint_actions_actorUserId",
  }),
  complaintId: one(complaints, {
    fields: [complaintActions.complaintId],
    references: [complaints.id],
    relationName: "complaint_actions_complaintId",
  }),
}));

export const complaintAttachmentsRelations = relations(complaintAttachments, ({ many, one }) => ({
  complaintAttachment: many(complaintAttachments, {
    relationName: "complaint_attachments_supersedesAttachmentId",
  }),
  complaintId: one(complaints, {
    fields: [complaintAttachments.complaintId],
    references: [complaints.id],
    relationName: "complaint_attachments_complaintId",
  }),
  supersedesAttachmentId: one(complaintAttachments, {
    fields: [complaintAttachments.supersedesAttachmentId],
    references: [complaintAttachments.id],
    relationName: "complaint_attachments_supersedesAttachmentId",
  }),
  uploadedByUserId: one(users, {
    fields: [complaintAttachments.uploadedByUserId],
    references: [users.id],
    relationName: "complaint_attachments_uploadedByUserId_2",
  }),
  withdrawnByUserId: one(users, {
    fields: [complaintAttachments.withdrawnByUserId],
    references: [users.id],
    relationName: "complaint_attachments_withdrawnByUserId_2",
  }),
}));

export const complaintCommentsRelations = relations(complaintComments, ({ many, one }) => ({
  complaintComment: many(complaintComments, {
    relationName: "complaint_comments_parentCommentId",
  }),
  authorUserId: one(users, {
    fields: [complaintComments.authorUserId],
    references: [users.id],
    relationName: "complaint_comments_authorUserId_2",
  }),
  complaintId: one(complaints, {
    fields: [complaintComments.complaintId],
    references: [complaints.id],
    relationName: "complaint_comments_complaintId",
  }),
  editedByUserId: one(users, {
    fields: [complaintComments.editedByUserId],
    references: [users.id],
    relationName: "complaint_comments_editedByUserId_2",
  }),
  parentCommentId: one(complaintComments, {
    fields: [complaintComments.parentCommentId],
    references: [complaintComments.id],
    relationName: "complaint_comments_parentCommentId",
  }),
}));

export const complaintVisibilityRelations = relations(complaintVisibility, ({ one }) => ({
  complaintId: one(complaints, {
    fields: [complaintVisibility.complaintId],
    references: [complaints.id],
    relationName: "complaint_visibility_complaintId",
  }),
  grantedByUserId: one(users, {
    fields: [complaintVisibility.grantedByUserId],
    references: [users.id],
    relationName: "complaint_visibility_grantedByUserId_3",
  }),
  revokedByUserId: one(users, {
    fields: [complaintVisibility.revokedByUserId],
    references: [users.id],
    relationName: "complaint_visibility_revokedByUserId_3",
  }),
  userId: one(users, {
    fields: [complaintVisibility.userId],
    references: [users.id],
    relationName: "complaint_visibility_userId_3",
  }),
}));

export const complaintsRelations = relations(complaints, ({ many, one }) => ({
  complaintAction: many(complaintActions, {
    relationName: "complaint_actions_complaintId",
  }),
  complaintAttachment: many(complaintAttachments, {
    relationName: "complaint_attachments_complaintId",
  }),
  complaintComment: many(complaintComments, {
    relationName: "complaint_comments_complaintId",
  }),
  complaintVisibility: many(complaintVisibility, {
    relationName: "complaint_visibility_complaintId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [complaints.academicSessionId],
    references: [academicSessions.id],
    relationName: "complaints_academicSessionId",
  }),
  assignedToUserId: one(users, {
    fields: [complaints.assignedToUserId],
    references: [users.id],
    relationName: "complaints_assignedToUserId_3",
  }),
  classId: one(classes, {
    fields: [complaints.classId],
    references: [classes.id],
    relationName: "complaints_classId",
  }),
  institutionId: one(institutions, {
    fields: [complaints.institutionId],
    references: [institutions.id],
    relationName: "complaints_institutionId",
  }),
  reportedByUserId: one(users, {
    fields: [complaints.reportedByUserId],
    references: [users.id],
    relationName: "complaints_reportedByUserId_3",
  }),
  resolvedByUserId: one(users, {
    fields: [complaints.resolvedByUserId],
    references: [users.id],
    relationName: "complaints_resolvedByUserId_3",
  }),
  sectionId: one(sections, {
    fields: [complaints.sectionId],
    references: [sections.id],
    relationName: "complaints_sectionId",
  }),
  studentId: one(students, {
    fields: [complaints.studentId],
    references: [students.id],
    relationName: "complaints_studentId",
  }),
  subjectId: one(subjects, {
    fields: [complaints.subjectId],
    references: [subjects.id],
    relationName: "complaints_subjectId",
  }),
}));

export const dailyAttendanceSummariesRelations = relations(dailyAttendanceSummaries, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [dailyAttendanceSummaries.academicSessionId],
    references: [academicSessions.id],
    relationName: "daily_attendance_summaries_academicSessionId",
  }),
  studentId: one(students, {
    fields: [dailyAttendanceSummaries.studentId],
    references: [students.id],
    relationName: "daily_attendance_summaries_studentId",
  }),
}));

export const dailyTestCorrectionsRelations = relations(dailyTestCorrections, ({ one }) => ({
  correctedByUserId: one(users, {
    fields: [dailyTestCorrections.correctedByUserId],
    references: [users.id],
    relationName: "daily_test_corrections_correctedByUserId",
  }),
  dailyTestEvaluationId: one(dailyTestEvaluations, {
    fields: [dailyTestCorrections.dailyTestEvaluationId],
    references: [dailyTestEvaluations.id],
    relationName: "daily_test_corrections_dailyTestEvaluationId",
  }),
}));

export const dailyTestEvaluationsRelations = relations(dailyTestEvaluations, ({ many, one }) => ({
  dailyTestCorrection: many(dailyTestCorrections, {
    relationName: "daily_test_corrections_dailyTestEvaluationId",
  }),
  monthlyTestReportItem: many(monthlyTestReportItems, {
    relationName: "monthly_test_report_items_dailyTestEvaluationId",
  }),
  classId: one(classes, {
    fields: [dailyTestEvaluations.classId],
    references: [classes.id],
    relationName: "daily_test_evaluations_classId",
  }),
  dailyTestId: one(dailyTests, {
    fields: [dailyTestEvaluations.dailyTestId],
    references: [dailyTests.id],
    relationName: "daily_test_evaluations_dailyTestId",
  }),
  enteredByUserId: one(users, {
    fields: [dailyTestEvaluations.enteredByUserId],
    references: [users.id],
    relationName: "daily_test_evaluations_enteredByUserId",
  }),
  sectionId: one(sections, {
    fields: [dailyTestEvaluations.sectionId],
    references: [sections.id],
    relationName: "daily_test_evaluations_sectionId",
  }),
  studentId: one(students, {
    fields: [dailyTestEvaluations.studentId],
    references: [students.id],
    relationName: "daily_test_evaluations_studentId",
  }),
}));

export const dailyTestPublicationsRelations = relations(dailyTestPublications, ({ one }) => ({
  dailyTestId: one(dailyTests, {
    fields: [dailyTestPublications.dailyTestId],
    references: [dailyTests.id],
    relationName: "daily_test_publications_dailyTestId",
  }),
  publishedByUserId: one(users, {
    fields: [dailyTestPublications.publishedByUserId],
    references: [users.id],
    relationName: "daily_test_publications_publishedByUserId",
  }),
}));

export const dailyTestsRelations = relations(dailyTests, ({ many, one }) => ({
  dailyTestEvaluation: many(dailyTestEvaluations, {
    relationName: "daily_test_evaluations_dailyTestId",
  }),
  dailyTestPublication: many(dailyTestPublications, {
    relationName: "daily_test_publications_dailyTestId",
  }),
  monthlyTestReportItem: many(monthlyTestReportItems, {
    relationName: "monthly_test_report_items_dailyTestId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [dailyTests.academicSessionId],
    references: [academicSessions.id],
    relationName: "daily_tests_academicSessionId",
  }),
  classId: one(classes, {
    fields: [dailyTests.classId],
    references: [classes.id],
    relationName: "daily_tests_classId",
  }),
  createdByTeacherUserId: one(users, {
    fields: [dailyTests.createdByTeacherUserId],
    references: [users.id],
    relationName: "daily_tests_createdByTeacherUserId",
  }),
  institutionId: one(institutions, {
    fields: [dailyTests.institutionId],
    references: [institutions.id],
    relationName: "daily_tests_institutionId",
  }),
  sectionId: one(sections, {
    fields: [dailyTests.sectionId],
    references: [sections.id],
    relationName: "daily_tests_sectionId",
  }),
  subjectId: one(subjects, {
    fields: [dailyTests.subjectId],
    references: [subjects.id],
    relationName: "daily_tests_subjectId",
  }),
}));

export const deadLetterJobsRelations = relations(deadLetterJobs, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [deadLetterJobs.institutionId],
    references: [institutions.id],
    relationName: "dead_letter_jobs_institutionId",
  }),
  jobId: one(jobs, {
    fields: [deadLetterJobs.jobId],
    references: [jobs.id],
    relationName: "dead_letter_jobs_jobId_2",
  }),
  replayedAsJobId: one(jobs, {
    fields: [deadLetterJobs.replayedAsJobId],
    references: [jobs.id],
    relationName: "dead_letter_jobs_replayedAsJobId_2",
  }),
}));

export const departmentsRelations = relations(departments, ({ many, one }) => ({
  budget: many(budgets, { relationName: "budgets_departmentId" }),
  classe: many(classes, { relationName: "classes_departmentId" }),
  designation: many(designations, {
    relationName: "designations_departmentId",
  }),
  employee: many(employees, { relationName: "employees_departmentId" }),
  expense: many(expenses, { relationName: "expenses_departmentId" }),
  salaryStructure: many(salaryStructures, {
    relationName: "salary_structures_departmentId",
  }),
  studentEnrollment: many(studentEnrollments, {
    relationName: "student_enrollments_departmentId",
  }),
  subject: many(subjects, { relationName: "subjects_departmentId" }),
  teacher: many(teachers, { relationName: "teachers_departmentId" }),
  institutionId: one(institutions, {
    fields: [departments.institutionId],
    references: [institutions.id],
    relationName: "departments_institutionId",
  }),
}));

export const designationsRelations = relations(designations, ({ many, one }) => ({
  employee: many(employees, { relationName: "employees_designationId" }),
  salaryStructure: many(salaryStructures, {
    relationName: "salary_structures_designationId",
  }),
  departmentId: one(departments, {
    fields: [designations.departmentId],
    references: [departments.id],
    relationName: "designations_departmentId",
  }),
  institutionId: one(institutions, {
    fields: [designations.institutionId],
    references: [institutions.id],
    relationName: "designations_institutionId",
  }),
}));

export const diariesRelations = relations(diaries, ({ many, one }) => ({
  diaryAssignment: many(diaryAssignments, {
    relationName: "diary_assignments_diaryId",
  }),
  diaryAttachment: many(diaryAttachments, {
    relationName: "diary_attachments_diaryId",
  }),
  diaryNotification: many(diaryNotifications, {
    relationName: "diary_notifications_diaryId",
  }),
  diaryRead: many(diaryReads, { relationName: "diary_reads_diaryId" }),
  academicSessionId: one(academicSessions, {
    fields: [diaries.academicSessionId],
    references: [academicSessions.id],
    relationName: "diaries_academicSessionId",
  }),
  classId: one(classes, {
    fields: [diaries.classId],
    references: [classes.id],
    relationName: "diaries_classId",
  }),
  institutionId: one(institutions, {
    fields: [diaries.institutionId],
    references: [institutions.id],
    relationName: "diaries_institutionId",
  }),
  sectionId: one(sections, {
    fields: [diaries.sectionId],
    references: [sections.id],
    relationName: "diaries_sectionId",
  }),
  subjectId: one(subjects, {
    fields: [diaries.subjectId],
    references: [subjects.id],
    relationName: "diaries_subjectId",
  }),
}));

export const diaryAssignmentsRelations = relations(diaryAssignments, ({ many, one }) => ({
  diaryNotification: many(diaryNotifications, {
    relationName: "diary_notifications_diaryAssignmentId",
  }),
  classId: one(classes, {
    fields: [diaryAssignments.classId],
    references: [classes.id],
    relationName: "diary_assignments_classId",
  }),
  diaryId: one(diaries, {
    fields: [diaryAssignments.diaryId],
    references: [diaries.id],
    relationName: "diary_assignments_diaryId",
  }),
  guardianUserId: one(guardianLinks, {
    fields: [diaryAssignments.guardianUserId, diaryAssignments.studentId],
    references: [guardianLinks.guardianUserId, guardianLinks.studentId],
    relationName: "diary_assignments_guardianUserId_studentId",
  }),
  sectionId: one(sections, {
    fields: [diaryAssignments.sectionId],
    references: [sections.id],
    relationName: "diary_assignments_sectionId",
  }),
  studentId: one(students, {
    fields: [diaryAssignments.studentId],
    references: [students.id],
    relationName: "diary_assignments_studentId",
  }),
}));

export const diaryAttachmentsRelations = relations(diaryAttachments, ({ one }) => ({
  diaryId: one(diaries, {
    fields: [diaryAttachments.diaryId],
    references: [diaries.id],
    relationName: "diary_attachments_diaryId",
  }),
}));

export const diaryNotificationPreferencesRelations = relations(
  diaryNotificationPreferences,
  ({ one }) => ({
    guardianUserId: one(guardians, {
      fields: [diaryNotificationPreferences.guardianUserId],
      references: [guardians.userId],
      relationName: "diary_notification_preferences_guardianUserId",
    }),
    subjectId: one(subjects, {
      fields: [diaryNotificationPreferences.subjectId],
      references: [subjects.id],
      relationName: "diary_notification_preferences_subjectId",
    }),
  }),
);

export const diaryNotificationsRelations = relations(diaryNotifications, ({ one }) => ({
  diaryAssignmentId: one(diaryAssignments, {
    fields: [diaryNotifications.diaryAssignmentId],
    references: [diaryAssignments.id],
    relationName: "diary_notifications_diaryAssignmentId",
  }),
  diaryId: one(diaries, {
    fields: [diaryNotifications.diaryId],
    references: [diaries.id],
    relationName: "diary_notifications_diaryId",
  }),
  guardianUserIdGuardianLinks: one(guardianLinks, {
    fields: [diaryNotifications.guardianUserId, diaryNotifications.studentId],
    references: [guardianLinks.guardianUserId, guardianLinks.studentId],
    relationName: "diary_notifications_guardianUserId_studentId",
  }),
  guardianUserIdGuardians: one(guardians, {
    fields: [diaryNotifications.guardianUserId],
    references: [guardians.userId],
    relationName: "diary_notifications_guardianUserId",
  }),
  studentId: one(students, {
    fields: [diaryNotifications.studentId],
    references: [students.id],
    relationName: "diary_notifications_studentId",
  }),
}));

export const diaryReadsRelations = relations(diaryReads, ({ one }) => ({
  diaryId: one(diaries, {
    fields: [diaryReads.diaryId],
    references: [diaries.id],
    relationName: "diary_reads_diaryId",
  }),
}));

export const emailDeliveryEventsRelations = relations(emailDeliveryEvents, ({ one }) => ({
  emailMessageId: one(emailMessages, {
    fields: [emailDeliveryEvents.emailMessageId],
    references: [emailMessages.id],
    relationName: "email_delivery_events_emailMessageId",
  }),
}));

export const emailMessagesRelations = relations(emailMessages, ({ many, one }) => ({
  emailDeliveryEvent: many(emailDeliveryEvents, {
    relationName: "email_delivery_events_emailMessageId",
  }),
  institutionId: one(institutions, {
    fields: [emailMessages.institutionId],
    references: [institutions.id],
    relationName: "email_messages_institutionId",
  }),
  notificationId: one(notifications, {
    fields: [emailMessages.notificationId],
    references: [notifications.id],
    relationName: "email_messages_notificationId",
  }),
  templateId: one(emailTemplates, {
    fields: [emailMessages.templateId],
    references: [emailTemplates.id],
    relationName: "email_messages_templateId",
  }),
  toUserId: one(users, {
    fields: [emailMessages.toUserId],
    references: [users.id],
    relationName: "email_messages_toUserId",
  }),
}));

export const emailTemplatesRelations = relations(emailTemplates, ({ many, one }) => ({
  emailMessage: many(emailMessages, {
    relationName: "email_messages_templateId",
  }),
  createdByUserId: one(users, {
    fields: [emailTemplates.createdByUserId],
    references: [users.id],
    relationName: "email_templates_createdByUserId_2",
  }),
  updatedByUserId: one(users, {
    fields: [emailTemplates.updatedByUserId],
    references: [users.id],
    relationName: "email_templates_updatedByUserId_2",
  }),
}));

export const emergencyContactsRelations = relations(emergencyContacts, ({ one }) => ({
  guardianUserId: one(guardians, {
    fields: [emergencyContacts.guardianUserId],
    references: [guardians.userId],
    relationName: "emergency_contacts_guardianUserId",
  }),
  studentId: one(students, {
    fields: [emergencyContacts.studentId],
    references: [students.id],
    relationName: "emergency_contacts_studentId",
  }),
}));

export const employeeAttendanceRelations = relations(employeeAttendance, ({ one }) => ({
  employeeId: one(employees, {
    fields: [employeeAttendance.employeeId],
    references: [employees.id],
    relationName: "employee_attendance_employeeId",
  }),
  leaveRequestId: one(leaveRequests, {
    fields: [employeeAttendance.leaveRequestId],
    references: [leaveRequests.id],
    relationName: "employee_attendance_leaveRequestId",
  }),
}));

export const employeeDocumentsRelations = relations(employeeDocuments, ({ one }) => ({
  employeeId: one(employees, {
    fields: [employeeDocuments.employeeId],
    references: [employees.id],
    relationName: "employee_documents_employeeId",
  }),
}));

export const employeeStatusHistoryRelations = relations(employeeStatusHistory, ({ one }) => ({
  employeeId: one(employees, {
    fields: [employeeStatusHistory.employeeId],
    references: [employees.id],
    relationName: "employee_status_history_employeeId",
  }),
}));

export const employeesRelations = relations(employees, ({ many, one }) => ({
  biometricEnrollment: many(biometricEnrollments, {
    relationName: "biometric_enrollments_employeeId",
  }),
  biometricTransaction: many(biometricTransactions, {
    relationName: "biometric_transactions_employeeId",
  }),
  employeeAttendance: many(employeeAttendance, {
    relationName: "employee_attendance_employeeId",
  }),
  employeeDocument: many(employeeDocuments, {
    relationName: "employee_documents_employeeId",
  }),
  employeeStatusHistory: many(employeeStatusHistory, {
    relationName: "employee_status_history_employeeId",
  }),
  leaveRequest: many(leaveRequests, {
    relationName: "leave_requests_employeeId",
  }),
  payrollItem: many(payrollItems, { relationName: "payroll_items_employeeId" }),
  salaryAssignment: many(salaryAssignments, {
    relationName: "salary_assignments_employeeId",
  }),
  teacherAbsence: many(teacherAbsences, {
    relationName: "teacher_absences_employeeId",
  }),
  departmentId: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
    relationName: "employees_departmentId",
  }),
  designationId: one(designations, {
    fields: [employees.designationId],
    references: [designations.id],
    relationName: "employees_designationId",
  }),
  institutionId: one(institutions, {
    fields: [employees.institutionId],
    references: [institutions.id],
    relationName: "employees_institutionId",
  }),
  userId: one(users, {
    fields: [employees.userId],
    references: [users.id],
    relationName: "employees_userId",
  }),
}));

export const examMarksCorrectionsRelations = relations(examMarksCorrections, ({ one }) => ({
  approvedByUserId: one(users, {
    fields: [examMarksCorrections.approvedByUserId],
    references: [users.id],
    relationName: "exam_marks_corrections_approvedByUserId_2",
  }),
  correctedByUserId: one(users, {
    fields: [examMarksCorrections.correctedByUserId],
    references: [users.id],
    relationName: "exam_marks_corrections_correctedByUserId_2",
  }),
  examinationMarkId: one(examinationMarks, {
    fields: [examMarksCorrections.examinationMarkId],
    references: [examinationMarks.id],
    relationName: "exam_marks_corrections_examinationMarkId",
  }),
}));

export const examinationMarksRelations = relations(examinationMarks, ({ many, one }) => ({
  examMarksCorrection: many(examMarksCorrections, {
    relationName: "exam_marks_corrections_examinationMarkId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [examinationMarks.academicSessionId],
    references: [academicSessions.id],
    relationName: "examination_marks_academicSessionId",
  }),
  classId: one(classes, {
    fields: [examinationMarks.classId],
    references: [classes.id],
    relationName: "examination_marks_classId",
  }),
  enteredByUserId: one(users, {
    fields: [examinationMarks.enteredByUserId],
    references: [users.id],
    relationName: "examination_marks_enteredByUserId",
  }),
  examinationId: one(examinations, {
    fields: [examinationMarks.examinationId],
    references: [examinations.id],
    relationName: "examination_marks_examinationId",
  }),
  sectionId: one(sections, {
    fields: [examinationMarks.sectionId],
    references: [sections.id],
    relationName: "examination_marks_sectionId",
  }),
  studentId: one(students, {
    fields: [examinationMarks.studentId],
    references: [students.id],
    relationName: "examination_marks_studentId",
  }),
  subjectId: one(subjects, {
    fields: [examinationMarks.subjectId],
    references: [subjects.id],
    relationName: "examination_marks_subjectId",
  }),
}));

export const examinationRegistrationsRelations = relations(examinationRegistrations, ({ one }) => ({
  examinationId: one(examinations, {
    fields: [examinationRegistrations.examinationId],
    references: [examinations.id],
    relationName: "examination_registrations_examinationId",
  }),
  studentId: one(students, {
    fields: [examinationRegistrations.studentId],
    references: [students.id],
    relationName: "examination_registrations_studentId",
  }),
  withdrawnByUserId: one(users, {
    fields: [examinationRegistrations.withdrawnByUserId],
    references: [users.id],
    relationName: "examination_registrations_withdrawnByUserId",
  }),
}));

export const examinationsRelations = relations(examinations, ({ many, one }) => ({
  examinationMark: many(examinationMarks, {
    relationName: "examination_marks_examinationId",
  }),
  examinationRegistration: many(examinationRegistrations, {
    relationName: "examination_registrations_examinationId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [examinations.academicSessionId],
    references: [academicSessions.id],
    relationName: "examinations_academicSessionId",
  }),
  classId: one(classes, {
    fields: [examinations.classId],
    references: [classes.id],
    relationName: "examinations_classId",
  }),
  institutionId: one(institutions, {
    fields: [examinations.institutionId],
    references: [institutions.id],
    relationName: "examinations_institutionId",
  }),
  sectionId: one(sections, {
    fields: [examinations.sectionId],
    references: [sections.id],
    relationName: "examinations_sectionId",
  }),
  setByTeacherUserId: one(users, {
    fields: [examinations.setByTeacherUserId],
    references: [users.id],
    relationName: "examinations_setByTeacherUserId",
  }),
  subjectId: one(subjects, {
    fields: [examinations.subjectId],
    references: [subjects.id],
    relationName: "examinations_subjectId",
  }),
  timeSlotId: one(timeSlots, {
    fields: [examinations.timeSlotId],
    references: [timeSlots.id],
    relationName: "examinations_timeSlotId",
  }),
}));

export const expenseHeadsRelations = relations(expenseHeads, ({ many, one }) => ({
  budget: many(budgets, { relationName: "budgets_expenseHeadId" }),
  expense: many(expenses, { relationName: "expenses_expenseHeadId" }),
  expenseHead: many(expenseHeads, {
    relationName: "expense_heads_parentHeadId",
  }),
  institutionId: one(institutions, {
    fields: [expenseHeads.institutionId],
    references: [institutions.id],
    relationName: "expense_heads_institutionId",
  }),
  ledgerAccountId: one(financialAccounts, {
    fields: [expenseHeads.ledgerAccountId],
    references: [financialAccounts.id],
    relationName: "expense_heads_ledgerAccountId",
  }),
  parentHeadId: one(expenseHeads, {
    fields: [expenseHeads.parentHeadId],
    references: [expenseHeads.id],
    relationName: "expense_heads_parentHeadId",
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  departmentId: one(departments, {
    fields: [expenses.departmentId],
    references: [departments.id],
    relationName: "expenses_departmentId",
  }),
  expenseHeadId: one(expenseHeads, {
    fields: [expenses.expenseHeadId],
    references: [expenseHeads.id],
    relationName: "expenses_expenseHeadId",
  }),
  institutionId: one(institutions, {
    fields: [expenses.institutionId],
    references: [institutions.id],
    relationName: "expenses_institutionId",
  }),
  journalTransactionId: one(journalTransactions, {
    fields: [expenses.journalTransactionId],
    references: [journalTransactions.id],
    relationName: "expenses_journalTransactionId",
  }),
}));

export const extraPeriodsRelations = relations(extraPeriods, ({ one }) => ({
  absenceId: one(teacherAbsences, {
    fields: [extraPeriods.absenceId],
    references: [teacherAbsences.id],
    relationName: "extra_periods_absenceId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [extraPeriods.academicSessionId],
    references: [academicSessions.id],
    relationName: "extra_periods_academicSessionId",
  }),
  institutionId: one(institutions, {
    fields: [extraPeriods.institutionId],
    references: [institutions.id],
    relationName: "extra_periods_institutionId",
  }),
  replacesScheduleId: one(schedules, {
    fields: [extraPeriods.replacesScheduleId],
    references: [schedules.id],
    relationName: "extra_periods_replacesScheduleId",
  }),
  sectionId: one(sections, {
    fields: [extraPeriods.sectionId],
    references: [sections.id],
    relationName: "extra_periods_sectionId",
  }),
  timeSlotId: one(timeSlots, {
    fields: [extraPeriods.timeSlotId],
    references: [timeSlots.id],
    relationName: "extra_periods_timeSlotId",
  }),
}));

export const feeConcessionsRelations = relations(feeConcessions, ({ one }) => ({
  feeStructureId: one(feeStructures, {
    fields: [feeConcessions.feeStructureId],
    references: [feeStructures.id],
    relationName: "fee_concessions_feeStructureId",
  }),
  invoiceId: one(feeInvoices, {
    fields: [feeConcessions.invoiceId],
    references: [feeInvoices.id],
    relationName: "fee_concessions_invoiceId",
  }),
  studentId: one(students, {
    fields: [feeConcessions.studentId],
    references: [students.id],
    relationName: "fee_concessions_studentId",
  }),
}));

export const feeDeferralsRelations = relations(feeDeferrals, ({ one }) => ({
  invoiceId: one(feeInvoices, {
    fields: [feeDeferrals.invoiceId],
    references: [feeInvoices.id],
    relationName: "fee_deferrals_invoiceId",
  }),
}));

export const feeInstallmentsRelations = relations(feeInstallments, ({ one }) => ({
  paidByPaymentId: one(payments, {
    fields: [feeInstallments.paidByPaymentId],
    references: [payments.id],
    relationName: "fee_installments_paidByPaymentId",
  }),
  paymentPlanId: one(feePaymentPlans, {
    fields: [feeInstallments.paymentPlanId],
    references: [feePaymentPlans.id],
    relationName: "fee_installments_paymentPlanId",
  }),
}));

export const feeInvoiceLinesRelations = relations(feeInvoiceLines, ({ one }) => ({
  feeStructureItemId: one(feeStructureItems, {
    fields: [feeInvoiceLines.feeStructureItemId],
    references: [feeStructureItems.id],
    relationName: "fee_invoice_lines_feeStructureItemId",
  }),
  invoiceId: one(feeInvoices, {
    fields: [feeInvoiceLines.invoiceId],
    references: [feeInvoices.id],
    relationName: "fee_invoice_lines_invoiceId",
  }),
}));

export const feeInvoicesRelations = relations(feeInvoices, ({ many, one }) => ({
  feeConcession: many(feeConcessions, {
    relationName: "fee_concessions_invoiceId",
  }),
  feeDeferral: many(feeDeferrals, { relationName: "fee_deferrals_invoiceId" }),
  feeInvoiceLine: many(feeInvoiceLines, {
    relationName: "fee_invoice_lines_invoiceId",
  }),
  feePaymentPlan: many(feePaymentPlans, {
    relationName: "fee_payment_plans_invoiceId",
  }),
  paymentAllocation: many(paymentAllocations, {
    relationName: "payment_allocations_invoiceId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [feeInvoices.academicSessionId],
    references: [academicSessions.id],
    relationName: "fee_invoices_academicSessionId",
  }),
  institutionId: one(institutions, {
    fields: [feeInvoices.institutionId],
    references: [institutions.id],
    relationName: "fee_invoices_institutionId",
  }),
  studentId: one(students, {
    fields: [feeInvoices.studentId],
    references: [students.id],
    relationName: "fee_invoices_studentId",
  }),
}));

export const feePaymentPlansRelations = relations(feePaymentPlans, ({ many, one }) => ({
  feeInstallment: many(feeInstallments, {
    relationName: "fee_installments_paymentPlanId",
  }),
  invoiceId: one(feeInvoices, {
    fields: [feePaymentPlans.invoiceId],
    references: [feeInvoices.id],
    relationName: "fee_payment_plans_invoiceId",
  }),
  studentId: one(students, {
    fields: [feePaymentPlans.studentId],
    references: [students.id],
    relationName: "fee_payment_plans_studentId",
  }),
}));

export const feeStructureAuditRelations = relations(feeStructureAudit, ({ one }) => ({
  feeStructureId: one(feeStructures, {
    fields: [feeStructureAudit.feeStructureId],
    references: [feeStructures.id],
    relationName: "fee_structure_audit_feeStructureId",
  }),
}));

export const feeStructureItemsRelations = relations(feeStructureItems, ({ many, one }) => ({
  feeInvoiceLine: many(feeInvoiceLines, {
    relationName: "fee_invoice_lines_feeStructureItemId",
  }),
  feeStructureId: one(feeStructures, {
    fields: [feeStructureItems.feeStructureId],
    references: [feeStructures.id],
    relationName: "fee_structure_items_feeStructureId",
  }),
}));

export const feeStructuresRelations = relations(feeStructures, ({ many, one }) => ({
  feeConcession: many(feeConcessions, {
    relationName: "fee_concessions_feeStructureId",
  }),
  feeStructureAudit: many(feeStructureAudit, {
    relationName: "fee_structure_audit_feeStructureId",
  }),
  feeStructureItem: many(feeStructureItems, {
    relationName: "fee_structure_items_feeStructureId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [feeStructures.academicSessionId],
    references: [academicSessions.id],
    relationName: "fee_structures_academicSessionId",
  }),
  classId: one(classes, {
    fields: [feeStructures.classId],
    references: [classes.id],
    relationName: "fee_structures_classId",
  }),
  groupId: one(groups, {
    fields: [feeStructures.groupId],
    references: [groups.id],
    relationName: "fee_structures_groupId",
  }),
  institutionId: one(institutions, {
    fields: [feeStructures.institutionId],
    references: [institutions.id],
    relationName: "fee_structures_institutionId",
  }),
  sectionId: one(sections, {
    fields: [feeStructures.sectionId],
    references: [sections.id],
    relationName: "fee_structures_sectionId",
  }),
}));

export const financialAccountsRelations = relations(financialAccounts, ({ many, one }) => ({
  bankReconciliation: many(bankReconciliations, {
    relationName: "bank_reconciliations_accountId",
  }),
  expenseHead: many(expenseHeads, {
    relationName: "expense_heads_ledgerAccountId",
  }),
  ledgerEntrie: many(ledgerEntries, {
    relationName: "ledger_entries_accountId",
  }),
  paymentMethod: many(paymentMethods, {
    relationName: "payment_methods_ledgerAccountId",
  }),
  institutionId: one(institutions, {
    fields: [financialAccounts.institutionId],
    references: [institutions.id],
    relationName: "financial_accounts_institutionId",
  }),
}));

export const financialPeriodsRelations = relations(financialPeriods, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [financialPeriods.institutionId],
    references: [institutions.id],
    relationName: "financial_periods_institutionId",
  }),
}));

export const floorAssignmentsRelations = relations(floorAssignments, ({ one }) => ({
  floorId: one(floors, {
    fields: [floorAssignments.floorId],
    references: [floors.id],
    relationName: "floor_assignments_floorId",
  }),
  institutionId: one(institutions, {
    fields: [floorAssignments.institutionId],
    references: [institutions.id],
    relationName: "floor_assignments_institutionId",
  }),
}));

export const floorIncidentReportsRelations = relations(floorIncidentReports, ({ one }) => ({
  campusId: one(campuses, {
    fields: [floorIncidentReports.campusId],
    references: [campuses.id],
    relationName: "floor_incident_reports_campusId",
  }),
  floorId: one(floors, {
    fields: [floorIncidentReports.floorId],
    references: [floors.id],
    relationName: "floor_incident_reports_floorId",
  }),
  institutionId: one(institutions, {
    fields: [floorIncidentReports.institutionId],
    references: [institutions.id],
    relationName: "floor_incident_reports_institutionId",
  }),
  sectionId: one(sections, {
    fields: [floorIncidentReports.sectionId],
    references: [sections.id],
    relationName: "floor_incident_reports_sectionId",
  }),
}));

export const floorLiveSnapshotsRelations = relations(floorLiveSnapshots, ({ one }) => ({
  floorId: one(floors, {
    fields: [floorLiveSnapshots.floorId],
    references: [floors.id],
    relationName: "floor_live_snapshots_floorId",
  }),
  scheduleId: one(schedules, {
    fields: [floorLiveSnapshots.scheduleId],
    references: [schedules.id],
    relationName: "floor_live_snapshots_scheduleId",
  }),
  sectionId: one(sections, {
    fields: [floorLiveSnapshots.sectionId],
    references: [sections.id],
    relationName: "floor_live_snapshots_sectionId",
  }),
  subjectId: one(subjects, {
    fields: [floorLiveSnapshots.subjectId],
    references: [subjects.id],
    relationName: "floor_live_snapshots_subjectId",
  }),
  timeSlotId: one(timeSlots, {
    fields: [floorLiveSnapshots.timeSlotId],
    references: [timeSlots.id],
    relationName: "floor_live_snapshots_timeSlotId",
  }),
}));

export const floorsRelations = relations(floors, ({ many, one }) => ({
  biometricDevice: many(biometricDevices, {
    relationName: "biometric_devices_floorId",
  }),
  floorAssignment: many(floorAssignments, {
    relationName: "floor_assignments_floorId",
  }),
  floorIncidentReport: many(floorIncidentReports, {
    relationName: "floor_incident_reports_floorId",
  }),
  floorLiveSnapshot: many(floorLiveSnapshots, {
    relationName: "floor_live_snapshots_floorId",
  }),
  schedule: many(schedules, { relationName: "schedules_floorId" }),
  section: many(sections, { relationName: "sections_floorId" }),
  buildingId: one(buildings, {
    fields: [floors.buildingId],
    references: [buildings.id],
    relationName: "floors_buildingId",
  }),
  institutionId: one(institutions, {
    fields: [floors.institutionId],
    references: [institutions.id],
    relationName: "floors_institutionId",
  }),
}));

export const gradingBandsRelations = relations(gradingBands, ({ one }) => ({
  gradingSchemeId: one(gradingSchemes, {
    fields: [gradingBands.gradingSchemeId],
    references: [gradingSchemes.id],
    relationName: "grading_bands_gradingSchemeId",
  }),
}));

export const gradingSchemesRelations = relations(gradingSchemes, ({ many, one }) => ({
  gradingBand: many(gradingBands, {
    relationName: "grading_bands_gradingSchemeId",
  }),
  studentResult: many(studentResults, {
    relationName: "student_results_gradingSchemeId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [gradingSchemes.academicSessionId],
    references: [academicSessions.id],
    relationName: "grading_schemes_academicSessionId",
  }),
  institutionId: one(institutions, {
    fields: [gradingSchemes.institutionId],
    references: [institutions.id],
    relationName: "grading_schemes_institutionId",
  }),
  subjectId: one(subjects, {
    fields: [gradingSchemes.subjectId],
    references: [subjects.id],
    relationName: "grading_schemes_subjectId",
  }),
}));

export const groupsRelations = relations(groups, ({ many, one }) => ({
  admission: many(admissions, { relationName: "admissions_appliedGroupId" }),
  admissionWindow: many(admissionWindows, {
    relationName: "admission_windows_groupId",
  }),
  classSubject: many(classSubjects, { relationName: "class_subjects_groupId" }),
  classTeacherAssignment: many(classTeacherAssignments, {
    relationName: "class_teacher_assignments_groupId",
  }),
  feeStructure: many(feeStructures, { relationName: "fee_structures_groupId" }),
  section: many(sections, { relationName: "sections_groupId" }),
  classId: one(classes, {
    fields: [groups.classId],
    references: [classes.id],
    relationName: "groups_classId",
  }),
  institutionId: one(institutions, {
    fields: [groups.institutionId],
    references: [institutions.id],
    relationName: "groups_institutionId",
  }),
}));

export const guardianAuthorizationsRelations = relations(guardianAuthorizations, ({ one }) => ({
  guardianUserId: one(guardians, {
    fields: [guardianAuthorizations.guardianUserId],
    references: [guardians.userId],
    relationName: "guardian_authorizations_guardianUserId",
  }),
  studentId: one(students, {
    fields: [guardianAuthorizations.studentId],
    references: [students.id],
    relationName: "guardian_authorizations_studentId",
  }),
}));

export const guardianLinksRelations = relations(guardianLinks, ({ many, one }) => ({
  diaryAssignment: many(diaryAssignments, {
    relationName: "diary_assignments_guardianUserId_studentId",
  }),
  diaryNotification: many(diaryNotifications, {
    relationName: "diary_notifications_guardianUserId_studentId",
  }),
  guardianUserId: one(guardians, {
    fields: [guardianLinks.guardianUserId],
    references: [guardians.userId],
    relationName: "guardian_links_guardianUserId",
  }),
  studentId: one(students, {
    fields: [guardianLinks.studentId],
    references: [students.id],
    relationName: "guardian_links_studentId",
  }),
}));

export const guardiansRelations = relations(guardians, ({ many, one }) => ({
  diaryNotification: many(diaryNotifications, {
    relationName: "diary_notifications_guardianUserId",
  }),
  diaryNotificationPreference: many(diaryNotificationPreferences, {
    relationName: "diary_notification_preferences_guardianUserId",
  }),
  emergencyContact: many(emergencyContacts, {
    relationName: "emergency_contacts_guardianUserId",
  }),
  guardianAuthorization: many(guardianAuthorizations, {
    relationName: "guardian_authorizations_guardianUserId",
  }),
  guardianLink: many(guardianLinks, {
    relationName: "guardian_links_guardianUserId",
  }),
  studentGuardianSnapshot: many(studentGuardianSnapshots, {
    relationName: "student_guardian_snapshots_guardianUserId",
  }),
  userId: one(users, {
    fields: [guardians.userId],
    references: [users.id],
    relationName: "guardians_userId",
  }),
}));

export const hrAnnouncementsRelations = relations(hrAnnouncements, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [hrAnnouncements.institutionId],
    references: [institutions.id],
    relationName: "hr_announcements_institutionId",
  }),
}));

export const institutionsRelations = relations(institutions, ({ many }) => ({
  academicSession: many(academicSessions, {
    relationName: "academic_sessions_institutionId",
  }),
  admission: many(admissions, { relationName: "admissions_institutionId" }),
  admissionChecklist: many(admissionChecklists, {
    relationName: "admission_checklists_institutionId",
  }),
  admissionWindow: many(admissionWindows, {
    relationName: "admission_windows_institutionId",
  }),
  announcement: many(announcements, {
    relationName: "announcements_institutionId",
  }),
  auditEvent: many(auditEvents, { relationName: "audit_events_institutionId" }),
  biometricDevice: many(biometricDevices, {
    relationName: "biometric_devices_institutionId",
  }),
  budget: many(budgets, { relationName: "budgets_institutionId" }),
  building: many(buildings, { relationName: "buildings_institutionId" }),
  campuse: many(campuses, { relationName: "campuses_institutionId" }),
  classSubject: many(classSubjects, {
    relationName: "class_subjects_institutionId",
  }),
  classTeacherAssignment: many(classTeacherAssignments, {
    relationName: "class_teacher_assignments_institutionId",
  }),
  classe: many(classes, { relationName: "classes_institutionId" }),
  complaint: many(complaints, { relationName: "complaints_institutionId" }),
  dailyTest: many(dailyTests, { relationName: "daily_tests_institutionId" }),
  deadLetterJob: many(deadLetterJobs, {
    relationName: "dead_letter_jobs_institutionId",
  }),
  department: many(departments, { relationName: "departments_institutionId" }),
  designation: many(designations, {
    relationName: "designations_institutionId",
  }),
  diarie: many(diaries, { relationName: "diaries_institutionId" }),
  emailMessage: many(emailMessages, {
    relationName: "email_messages_institutionId",
  }),
  employee: many(employees, { relationName: "employees_institutionId" }),
  examination: many(examinations, {
    relationName: "examinations_institutionId",
  }),
  expense: many(expenses, { relationName: "expenses_institutionId" }),
  expenseHead: many(expenseHeads, {
    relationName: "expense_heads_institutionId",
  }),
  extraPeriod: many(extraPeriods, {
    relationName: "extra_periods_institutionId",
  }),
  feeInvoice: many(feeInvoices, { relationName: "fee_invoices_institutionId" }),
  feeStructure: many(feeStructures, {
    relationName: "fee_structures_institutionId",
  }),
  financialAccount: many(financialAccounts, {
    relationName: "financial_accounts_institutionId",
  }),
  financialPeriod: many(financialPeriods, {
    relationName: "financial_periods_institutionId",
  }),
  floor: many(floors, { relationName: "floors_institutionId" }),
  floorAssignment: many(floorAssignments, {
    relationName: "floor_assignments_institutionId",
  }),
  floorIncidentReport: many(floorIncidentReports, {
    relationName: "floor_incident_reports_institutionId",
  }),
  gradingScheme: many(gradingSchemes, {
    relationName: "grading_schemes_institutionId",
  }),
  group: many(groups, { relationName: "groups_institutionId" }),
  hrAnnouncement: many(hrAnnouncements, {
    relationName: "hr_announcements_institutionId",
  }),
  job: many(jobs, { relationName: "jobs_institutionId" }),
  jobSchedule: many(jobSchedules, {
    relationName: "job_schedules_institutionId",
  }),
  journalTransaction: many(journalTransactions, {
    relationName: "journal_transactions_institutionId",
  }),
  leaveRequest: many(leaveRequests, {
    relationName: "leave_requests_institutionId",
  }),
  leaveType: many(leaveTypes, { relationName: "leave_types_institutionId" }),
  monthlyTestReport: many(monthlyTestReports, {
    relationName: "monthly_test_reports_institutionId",
  }),
  notification: many(notifications, {
    relationName: "notifications_institutionId",
  }),
  payment: many(payments, { relationName: "payments_institutionId" }),
  paymentMethod: many(paymentMethods, {
    relationName: "payment_methods_institutionId",
  }),
  payrollPayment: many(payrollPayments, {
    relationName: "payroll_payments_institutionId",
  }),
  payrollPayslip: many(payrollPayslips, {
    relationName: "payroll_payslips_institutionId",
  }),
  payrollPeriodLock: many(payrollPeriodLocks, {
    relationName: "payroll_period_locks_institutionId",
  }),
  payrollRun: many(payrollRuns, { relationName: "payroll_runs_institutionId" }),
  receipt: many(receipts, { relationName: "receipts_institutionId" }),
  role: many(roles, { relationName: "roles_institutionId" }),
  salaryAssignment: many(salaryAssignments, {
    relationName: "salary_assignments_institutionId",
  }),
  salaryStructure: many(salaryStructures, {
    relationName: "salary_structures_institutionId",
  }),
  schedule: many(schedules, { relationName: "schedules_institutionId" }),
  scheduleChangeSet: many(scheduleChangeSets, {
    relationName: "schedule_change_sets_institutionId",
  }),
  section: many(sections, { relationName: "sections_institutionId" }),
  settingChange: many(settingChanges, {
    relationName: "setting_changes_institutionId",
  }),
  student: many(students, { relationName: "students_institutionId" }),
  studentEnrollment: many(studentEnrollments, {
    relationName: "student_enrollments_institutionId",
  }),
  subject: many(subjects, { relationName: "subjects_institutionId" }),
  systemSetting: many(systemSettings, {
    relationName: "system_settings_institutionId",
  }),
  teacher: many(teachers, { relationName: "teachers_institutionId" }),
  teacherAbsence: many(teacherAbsences, {
    relationName: "teacher_absences_institutionId",
  }),
  timeSlot: many(timeSlots, { relationName: "time_slots_institutionId" }),
  userInstitution: many(userInstitutions, {
    relationName: "user_institutions_institutionId",
  }),
  userPermission: many(userPermissions, {
    relationName: "user_permissions_institutionId",
  }),
  userRole: many(userRoles, { relationName: "user_roles_institutionId" }),
}));

export const jobDefinitionsRelations = relations(jobDefinitions, ({ many }) => ({
  job: many(jobs, { relationName: "jobs_jobType" }),
  jobSchedule: many(jobSchedules, { relationName: "job_schedules_jobType" }),
}));

export const jobRunsRelations = relations(jobRuns, ({ one }) => ({
  jobId: one(jobs, {
    fields: [jobRuns.jobId],
    references: [jobs.id],
    relationName: "job_runs_jobId",
  }),
}));

export const jobSchedulesRelations = relations(jobSchedules, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [jobSchedules.institutionId],
    references: [institutions.id],
    relationName: "job_schedules_institutionId",
  }),
  jobType: one(jobDefinitions, {
    fields: [jobSchedules.jobType],
    references: [jobDefinitions.jobType],
    relationName: "job_schedules_jobType",
  }),
}));

export const jobsRelations = relations(jobs, ({ many, one }) => ({
  deadLetterJobJobId: many(deadLetterJobs, {
    relationName: "dead_letter_jobs_jobId_2",
  }),
  deadLetterJobReplayedAsJobId: many(deadLetterJobs, {
    relationName: "dead_letter_jobs_replayedAsJobId_2",
  }),
  jobRun: many(jobRuns, { relationName: "job_runs_jobId" }),
  institutionId: one(institutions, {
    fields: [jobs.institutionId],
    references: [institutions.id],
    relationName: "jobs_institutionId",
  }),
  jobType: one(jobDefinitions, {
    fields: [jobs.jobType],
    references: [jobDefinitions.jobType],
    relationName: "jobs_jobType",
  }),
}));

export const journalTransactionsRelations = relations(journalTransactions, ({ many, one }) => ({
  expense: many(expenses, { relationName: "expenses_journalTransactionId" }),
  journalTransaction: many(journalTransactions, {
    relationName: "journal_transactions_reversesTransactionId",
  }),
  ledgerEntrie: many(ledgerEntries, {
    relationName: "ledger_entries_journalTransactionId",
  }),
  institutionId: one(institutions, {
    fields: [journalTransactions.institutionId],
    references: [institutions.id],
    relationName: "journal_transactions_institutionId",
  }),
  reversesTransactionId: one(journalTransactions, {
    fields: [journalTransactions.reversesTransactionId],
    references: [journalTransactions.id],
    relationName: "journal_transactions_reversesTransactionId",
  }),
}));

export const leaveAttachmentsRelations = relations(leaveAttachments, ({ one }) => ({
  leaveRequestId: one(leaveRequests, {
    fields: [leaveAttachments.leaveRequestId],
    references: [leaveRequests.id],
    relationName: "leave_attachments_leaveRequestId",
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ many, one }) => ({
  attendanceRecord: many(attendanceRecords, {
    relationName: "attendance_records_leaveRequestId",
  }),
  employeeAttendance: many(employeeAttendance, {
    relationName: "employee_attendance_leaveRequestId",
  }),
  leaveAttachment: many(leaveAttachments, {
    relationName: "leave_attachments_leaveRequestId",
  }),
  employeeId: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
    relationName: "leave_requests_employeeId",
  }),
  institutionId: one(institutions, {
    fields: [leaveRequests.institutionId],
    references: [institutions.id],
    relationName: "leave_requests_institutionId",
  }),
  leaveTypeId: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
    relationName: "leave_requests_leaveTypeId",
  }),
  studentId: one(students, {
    fields: [leaveRequests.studentId],
    references: [students.id],
    relationName: "leave_requests_studentId",
  }),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ many, one }) => ({
  leaveRequest: many(leaveRequests, {
    relationName: "leave_requests_leaveTypeId",
  }),
  institutionId: one(institutions, {
    fields: [leaveTypes.institutionId],
    references: [institutions.id],
    relationName: "leave_types_institutionId",
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ many, one }) => ({
  bankReconciliationItem: many(bankReconciliationItems, {
    relationName: "bank_reconciliation_items_ledgerEntryId",
  }),
  accountId: one(financialAccounts, {
    fields: [ledgerEntries.accountId],
    references: [financialAccounts.id],
    relationName: "ledger_entries_accountId",
  }),
  journalTransactionId: one(journalTransactions, {
    fields: [ledgerEntries.journalTransactionId],
    references: [journalTransactions.id],
    relationName: "ledger_entries_journalTransactionId",
  }),
}));

export const monthlyTestReportItemsRelations = relations(monthlyTestReportItems, ({ one }) => ({
  dailyTestEvaluationId: one(dailyTestEvaluations, {
    fields: [monthlyTestReportItems.dailyTestEvaluationId],
    references: [dailyTestEvaluations.id],
    relationName: "monthly_test_report_items_dailyTestEvaluationId",
  }),
  dailyTestId: one(dailyTests, {
    fields: [monthlyTestReportItems.dailyTestId],
    references: [dailyTests.id],
    relationName: "monthly_test_report_items_dailyTestId",
  }),
  monthlyTestReportId: one(monthlyTestReports, {
    fields: [monthlyTestReportItems.monthlyTestReportId],
    references: [monthlyTestReports.id],
    relationName: "monthly_test_report_items_monthlyTestReportId",
  }),
}));

export const monthlyTestReportsRelations = relations(monthlyTestReports, ({ many, one }) => ({
  monthlyTestReport: many(monthlyTestReports, {
    relationName: "monthly_test_reports_supersededByReportId",
  }),
  monthlyTestReportItem: many(monthlyTestReportItems, {
    relationName: "monthly_test_report_items_monthlyTestReportId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [monthlyTestReports.academicSessionId],
    references: [academicSessions.id],
    relationName: "monthly_test_reports_academicSessionId",
  }),
  classId: one(classes, {
    fields: [monthlyTestReports.classId],
    references: [classes.id],
    relationName: "monthly_test_reports_classId",
  }),
  institutionId: one(institutions, {
    fields: [monthlyTestReports.institutionId],
    references: [institutions.id],
    relationName: "monthly_test_reports_institutionId",
  }),
  sectionId: one(sections, {
    fields: [monthlyTestReports.sectionId],
    references: [sections.id],
    relationName: "monthly_test_reports_sectionId",
  }),
  studentId: one(students, {
    fields: [monthlyTestReports.studentId],
    references: [students.id],
    relationName: "monthly_test_reports_studentId",
  }),
  subjectId: one(subjects, {
    fields: [monthlyTestReports.subjectId],
    references: [subjects.id],
    relationName: "monthly_test_reports_subjectId",
  }),
  supersededByReportId: one(monthlyTestReports, {
    fields: [monthlyTestReports.supersededByReportId],
    references: [monthlyTestReports.id],
    relationName: "monthly_test_reports_supersededByReportId",
  }),
}));

export const notificationDeliveriesRelations = relations(notificationDeliveries, ({ one }) => ({
  notificationId: one(notifications, {
    fields: [notificationDeliveries.notificationId],
    references: [notifications.id],
    relationName: "notification_deliveries_notificationId",
  }),
  recipientUserId: one(users, {
    fields: [notificationDeliveries.recipientUserId],
    references: [users.id],
    relationName: "notification_deliveries_recipientUserId",
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  userId: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
    relationName: "notification_preferences_userId",
  }),
}));

export const notificationsRelations = relations(notifications, ({ many, one }) => ({
  announcement: many(announcements, {
    relationName: "announcements_notificationId",
  }),
  emailMessage: many(emailMessages, {
    relationName: "email_messages_notificationId",
  }),
  notificationDeliverie: many(notificationDeliveries, {
    relationName: "notification_deliveries_notificationId",
  }),
  createdByUserId: one(users, {
    fields: [notifications.createdByUserId],
    references: [users.id],
    relationName: "notifications_createdByUserId",
  }),
  institutionId: one(institutions, {
    fields: [notifications.institutionId],
    references: [institutions.id],
    relationName: "notifications_institutionId",
  }),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  invoiceId: one(feeInvoices, {
    fields: [paymentAllocations.invoiceId],
    references: [feeInvoices.id],
    relationName: "payment_allocations_invoiceId",
  }),
  paymentId: one(payments, {
    fields: [paymentAllocations.paymentId],
    references: [payments.id],
    relationName: "payment_allocations_paymentId",
  }),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [paymentMethods.institutionId],
    references: [institutions.id],
    relationName: "payment_methods_institutionId",
  }),
  ledgerAccountId: one(financialAccounts, {
    fields: [paymentMethods.ledgerAccountId],
    references: [financialAccounts.id],
    relationName: "payment_methods_ledgerAccountId",
  }),
}));

export const paymentsRelations = relations(payments, ({ many, one }) => ({
  feeInstallment: many(feeInstallments, {
    relationName: "fee_installments_paidByPaymentId",
  }),
  payment: many(payments, { relationName: "payments_reversesPaymentId" }),
  paymentAllocation: many(paymentAllocations, {
    relationName: "payment_allocations_paymentId",
  }),
  receipt: many(receipts, { relationName: "receipts_paymentId" }),
  academicSessionId: one(academicSessions, {
    fields: [payments.academicSessionId],
    references: [academicSessions.id],
    relationName: "payments_academicSessionId",
  }),
  institutionId: one(institutions, {
    fields: [payments.institutionId],
    references: [institutions.id],
    relationName: "payments_institutionId",
  }),
  reversesPaymentId: one(payments, {
    fields: [payments.reversesPaymentId],
    references: [payments.id],
    relationName: "payments_reversesPaymentId",
  }),
  studentId: one(students, {
    fields: [payments.studentId],
    references: [students.id],
    relationName: "payments_studentId",
  }),
}));

export const payrollAdjustmentsRelations = relations(payrollAdjustments, ({ one }) => ({
  appliedByUserId: one(users, {
    fields: [payrollAdjustments.appliedByUserId],
    references: [users.id],
    relationName: "payroll_adjustments_appliedByUserId_3",
  }),
  approvedByUserId: one(users, {
    fields: [payrollAdjustments.approvedByUserId],
    references: [users.id],
    relationName: "payroll_adjustments_approvedByUserId_3",
  }),
  payrollItemId: one(payrollItems, {
    fields: [payrollAdjustments.payrollItemId],
    references: [payrollItems.id],
    relationName: "payroll_adjustments_payrollItemId",
  }),
  reversedByUserId: one(users, {
    fields: [payrollAdjustments.reversedByUserId],
    references: [users.id],
    relationName: "payroll_adjustments_reversedByUserId_3",
  }),
}));

export const payrollCalculationSourcesRelations = relations(
  payrollCalculationSources,
  ({ one }) => ({
    payrollItemId: one(payrollItems, {
      fields: [payrollCalculationSources.payrollItemId],
      references: [payrollItems.id],
      relationName: "payroll_calculation_sources_payrollItemId",
    }),
  }),
);

export const payrollItemsRelations = relations(payrollItems, ({ many, one }) => ({
  payrollAdjustment: many(payrollAdjustments, {
    relationName: "payroll_adjustments_payrollItemId",
  }),
  payrollCalculationSource: many(payrollCalculationSources, {
    relationName: "payroll_calculation_sources_payrollItemId",
  }),
  payrollPayslip: many(payrollPayslips, {
    relationName: "payroll_payslips_payrollItemId",
  }),
  employeeId: one(employees, {
    fields: [payrollItems.employeeId],
    references: [employees.id],
    relationName: "payroll_items_employeeId",
  }),
  payrollRunId: one(payrollRuns, {
    fields: [payrollItems.payrollRunId],
    references: [payrollRuns.id],
    relationName: "payroll_items_payrollRunId",
  }),
  salaryAssignmentId: one(salaryAssignments, {
    fields: [payrollItems.salaryAssignmentId],
    references: [salaryAssignments.id],
    relationName: "payroll_items_salaryAssignmentId",
  }),
  teacherId: one(teachers, {
    fields: [payrollItems.teacherId],
    references: [teachers.userId],
    relationName: "payroll_items_teacherId",
  }),
}));

export const payrollPaymentsRelations = relations(payrollPayments, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [payrollPayments.institutionId],
    references: [institutions.id],
    relationName: "payroll_payments_institutionId",
  }),
  payrollRunId: one(payrollRuns, {
    fields: [payrollPayments.payrollRunId],
    references: [payrollRuns.id],
    relationName: "payroll_payments_payrollRunId",
  }),
  processedByUserId: one(users, {
    fields: [payrollPayments.processedByUserId],
    references: [users.id],
    relationName: "payroll_payments_processedByUserId",
  }),
}));

export const payrollPayslipsRelations = relations(payrollPayslips, ({ many, one }) => ({
  payrollPayslip: many(payrollPayslips, {
    relationName: "payroll_payslips_supersededBySlipId",
  }),
  institutionId: one(institutions, {
    fields: [payrollPayslips.institutionId],
    references: [institutions.id],
    relationName: "payroll_payslips_institutionId",
  }),
  payrollItemId: one(payrollItems, {
    fields: [payrollPayslips.payrollItemId],
    references: [payrollItems.id],
    relationName: "payroll_payslips_payrollItemId",
  }),
  sharedByUserId: one(users, {
    fields: [payrollPayslips.sharedByUserId],
    references: [users.id],
    relationName: "payroll_payslips_sharedByUserId",
  }),
  supersededBySlipId: one(payrollPayslips, {
    fields: [payrollPayslips.supersededBySlipId],
    references: [payrollPayslips.id],
    relationName: "payroll_payslips_supersededBySlipId",
  }),
}));

export const payrollPeriodLocksRelations = relations(payrollPeriodLocks, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [payrollPeriodLocks.institutionId],
    references: [institutions.id],
    relationName: "payroll_period_locks_institutionId",
  }),
  lockedByUserId: one(users, {
    fields: [payrollPeriodLocks.lockedByUserId],
    references: [users.id],
    relationName: "payroll_period_locks_lockedByUserId",
  }),
}));

export const payrollRunsRelations = relations(payrollRuns, ({ many, one }) => ({
  payrollItem: many(payrollItems, {
    relationName: "payroll_items_payrollRunId",
  }),
  payrollPayment: many(payrollPayments, {
    relationName: "payroll_payments_payrollRunId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [payrollRuns.academicSessionId],
    references: [academicSessions.id],
    relationName: "payroll_runs_academicSessionId",
  }),
  approvedByUserId: one(users, {
    fields: [payrollRuns.approvedByUserId],
    references: [users.id],
    relationName: "payroll_runs_approvedByUserId_2",
  }),
  calculatedByUserId: one(users, {
    fields: [payrollRuns.calculatedByUserId],
    references: [users.id],
    relationName: "payroll_runs_calculatedByUserId_2",
  }),
  institutionId: one(institutions, {
    fields: [payrollRuns.institutionId],
    references: [institutions.id],
    relationName: "payroll_runs_institutionId",
  }),
}));

export const permissionScopesRelations = relations(permissionScopes, ({ one }) => ({
  permissionId: one(permissions, {
    fields: [permissionScopes.permissionId],
    references: [permissions.id],
    relationName: "permission_scopes_permissionId",
  }),
  roleId: one(roles, {
    fields: [permissionScopes.roleId],
    references: [roles.id],
    relationName: "permission_scopes_roleId",
  }),
  userId: one(users, {
    fields: [permissionScopes.userId],
    references: [users.id],
    relationName: "permission_scopes_userId",
  }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  permissionScope: many(permissionScopes, {
    relationName: "permission_scopes_permissionId",
  }),
  rolePermission: many(rolePermissions, {
    relationName: "role_permissions_permissionId",
  }),
  userPermission: many(userPermissions, {
    relationName: "user_permissions_permissionId",
  }),
}));

export const receiptsRelations = relations(receipts, ({ many, one }) => ({
  receipt: many(receipts, { relationName: "receipts_supersededById" }),
  institutionId: one(institutions, {
    fields: [receipts.institutionId],
    references: [institutions.id],
    relationName: "receipts_institutionId",
  }),
  paymentId: one(payments, {
    fields: [receipts.paymentId],
    references: [payments.id],
    relationName: "receipts_paymentId",
  }),
  supersededById: one(receipts, {
    fields: [receipts.supersededById],
    references: [receipts.id],
    relationName: "receipts_supersededById",
  }),
}));

export const resultPublicationLogRelations = relations(resultPublicationLog, ({ one }) => ({
  publishedByUserId: one(users, {
    fields: [resultPublicationLog.publishedByUserId],
    references: [users.id],
    relationName: "result_publication_log_publishedByUserId",
  }),
  studentResultId: one(studentResults, {
    fields: [resultPublicationLog.studentResultId],
    references: [studentResults.id],
    relationName: "result_publication_log_studentResultId",
  }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  permissionId: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
    relationName: "role_permissions_permissionId",
  }),
  roleId: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
    relationName: "role_permissions_roleId",
  }),
}));

export const rolesRelations = relations(roles, ({ many, one }) => ({
  permissionScope: many(permissionScopes, {
    relationName: "permission_scopes_roleId",
  }),
  rolePermission: many(rolePermissions, {
    relationName: "role_permissions_roleId",
  }),
  userRole: many(userRoles, { relationName: "user_roles_roleId" }),
  institutionId: one(institutions, {
    fields: [roles.institutionId],
    references: [institutions.id],
    relationName: "roles_institutionId",
  }),
}));

export const salaryAssignmentsRelations = relations(salaryAssignments, ({ many, one }) => ({
  payrollItem: many(payrollItems, {
    relationName: "payroll_items_salaryAssignmentId",
  }),
  employeeId: one(employees, {
    fields: [salaryAssignments.employeeId],
    references: [employees.id],
    relationName: "salary_assignments_employeeId",
  }),
  institutionId: one(institutions, {
    fields: [salaryAssignments.institutionId],
    references: [institutions.id],
    relationName: "salary_assignments_institutionId",
  }),
  salaryStructureId: one(salaryStructures, {
    fields: [salaryAssignments.salaryStructureId],
    references: [salaryStructures.id],
    relationName: "salary_assignments_salaryStructureId",
  }),
}));

export const salaryStructuresRelations = relations(salaryStructures, ({ many, one }) => ({
  salaryAssignment: many(salaryAssignments, {
    relationName: "salary_assignments_salaryStructureId",
  }),
  departmentId: one(departments, {
    fields: [salaryStructures.departmentId],
    references: [departments.id],
    relationName: "salary_structures_departmentId",
  }),
  designationId: one(designations, {
    fields: [salaryStructures.designationId],
    references: [designations.id],
    relationName: "salary_structures_designationId",
  }),
  institutionId: one(institutions, {
    fields: [salaryStructures.institutionId],
    references: [institutions.id],
    relationName: "salary_structures_institutionId",
  }),
}));

export const scheduleChangeSetsRelations = relations(scheduleChangeSets, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [scheduleChangeSets.academicSessionId],
    references: [academicSessions.id],
    relationName: "schedule_change_sets_academicSessionId",
  }),
  institutionId: one(institutions, {
    fields: [scheduleChangeSets.institutionId],
    references: [institutions.id],
    relationName: "schedule_change_sets_institutionId",
  }),
}));

export const schedulePublishHistoryRelations = relations(schedulePublishHistory, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [schedulePublishHistory.academicSessionId],
    references: [academicSessions.id],
    relationName: "schedule_publish_history_academicSessionId",
  }),
}));

export const schedulesRelations = relations(schedules, ({ many, one }) => ({
  attendanceSession: many(attendanceSessions, {
    relationName: "attendance_sessions_scheduleId",
  }),
  extraPeriod: many(extraPeriods, {
    relationName: "extra_periods_replacesScheduleId",
  }),
  floorLiveSnapshot: many(floorLiveSnapshots, {
    relationName: "floor_live_snapshots_scheduleId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [schedules.academicSessionId],
    references: [academicSessions.id],
    relationName: "schedules_academicSessionId",
  }),
  floorId: one(floors, {
    fields: [schedules.floorId],
    references: [floors.id],
    relationName: "schedules_floorId",
  }),
  institutionId: one(institutions, {
    fields: [schedules.institutionId],
    references: [institutions.id],
    relationName: "schedules_institutionId",
  }),
  sectionId: one(sections, {
    fields: [schedules.sectionId],
    references: [sections.id],
    relationName: "schedules_sectionId",
  }),
  subjectId: one(subjects, {
    fields: [schedules.subjectId],
    references: [subjects.id],
    relationName: "schedules_subjectId",
  }),
  timeSlotId: one(timeSlots, {
    fields: [schedules.timeSlotId],
    references: [timeSlots.id],
    relationName: "schedules_timeSlotId",
  }),
}));

export const sectionsRelations = relations(sections, ({ many, one }) => ({
  attendanceCorrection: many(attendanceCorrections, {
    relationName: "attendance_corrections_sectionId",
  }),
  attendanceException: many(attendanceExceptions, {
    relationName: "attendance_exceptions_sectionId",
  }),
  attendanceRecord: many(attendanceRecords, {
    relationName: "attendance_records_sectionId",
  }),
  attendanceSession: many(attendanceSessions, {
    relationName: "attendance_sessions_sectionId",
  }),
  classSubject: many(classSubjects, {
    relationName: "class_subjects_sectionId",
  }),
  classTeacherAssignment: many(classTeacherAssignments, {
    relationName: "class_teacher_assignments_sectionId",
  }),
  complaint: many(complaints, { relationName: "complaints_sectionId" }),
  dailyTest: many(dailyTests, { relationName: "daily_tests_sectionId" }),
  dailyTestEvaluation: many(dailyTestEvaluations, {
    relationName: "daily_test_evaluations_sectionId",
  }),
  diarie: many(diaries, { relationName: "diaries_sectionId" }),
  diaryAssignment: many(diaryAssignments, {
    relationName: "diary_assignments_sectionId",
  }),
  examination: many(examinations, { relationName: "examinations_sectionId" }),
  examinationMark: many(examinationMarks, {
    relationName: "examination_marks_sectionId",
  }),
  extraPeriod: many(extraPeriods, { relationName: "extra_periods_sectionId" }),
  feeStructure: many(feeStructures, {
    relationName: "fee_structures_sectionId",
  }),
  floorIncidentReport: many(floorIncidentReports, {
    relationName: "floor_incident_reports_sectionId",
  }),
  floorLiveSnapshot: many(floorLiveSnapshots, {
    relationName: "floor_live_snapshots_sectionId",
  }),
  monthlyTestReport: many(monthlyTestReports, {
    relationName: "monthly_test_reports_sectionId",
  }),
  schedule: many(schedules, { relationName: "schedules_sectionId" }),
  studentPlacement: many(studentPlacements, {
    relationName: "student_placements_sectionId",
  }),
  studentResult: many(studentResults, {
    relationName: "student_results_sectionId",
  }),
  campusId: one(campuses, {
    fields: [sections.campusId],
    references: [campuses.id],
    relationName: "sections_campusId",
  }),
  floorId: one(floors, {
    fields: [sections.floorId],
    references: [floors.id],
    relationName: "sections_floorId",
  }),
  groupId: one(groups, {
    fields: [sections.groupId],
    references: [groups.id],
    relationName: "sections_groupId",
  }),
  institutionId: one(institutions, {
    fields: [sections.institutionId],
    references: [institutions.id],
    relationName: "sections_institutionId",
  }),
}));

export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
  userId: one(users, {
    fields: [securityEvents.userId],
    references: [users.id],
    relationName: "security_events_userId",
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  userId: one(users, {
    fields: [sessions.userId],
    references: [users.id],
    relationName: "sessions_userId",
  }),
}));

export const settingChangesRelations = relations(settingChanges, ({ one }) => ({
  changedByUserId: one(users, {
    fields: [settingChanges.changedByUserId],
    references: [users.id],
    relationName: "setting_changes_changedByUserId",
  }),
  institutionId: one(institutions, {
    fields: [settingChanges.institutionId],
    references: [institutions.id],
    relationName: "setting_changes_institutionId",
  }),
}));

export const studentDocumentsRelations = relations(studentDocuments, ({ one }) => ({
  studentId: one(students, {
    fields: [studentDocuments.studentId],
    references: [students.id],
    relationName: "student_documents_studentId",
  }),
}));

export const studentEnrollmentsRelations = relations(studentEnrollments, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [studentEnrollments.academicSessionId],
    references: [academicSessions.id],
    relationName: "student_enrollments_academicSessionId",
  }),
  departmentId: one(departments, {
    fields: [studentEnrollments.departmentId],
    references: [departments.id],
    relationName: "student_enrollments_departmentId",
  }),
  institutionId: one(institutions, {
    fields: [studentEnrollments.institutionId],
    references: [institutions.id],
    relationName: "student_enrollments_institutionId",
  }),
  studentId: one(students, {
    fields: [studentEnrollments.studentId],
    references: [students.id],
    relationName: "student_enrollments_studentId",
  }),
}));

export const studentGuardianSnapshotsRelations = relations(studentGuardianSnapshots, ({ one }) => ({
  guardianUserId: one(guardians, {
    fields: [studentGuardianSnapshots.guardianUserId],
    references: [guardians.userId],
    relationName: "student_guardian_snapshots_guardianUserId",
  }),
  studentId: one(students, {
    fields: [studentGuardianSnapshots.studentId],
    references: [students.id],
    relationName: "student_guardian_snapshots_studentId",
  }),
}));

export const studentNotesRelations = relations(studentNotes, ({ one }) => ({
  studentId: one(students, {
    fields: [studentNotes.studentId],
    references: [students.id],
    relationName: "student_notes_studentId",
  }),
}));

export const studentPlacementsRelations = relations(studentPlacements, ({ one }) => ({
  academicSessionId: one(academicSessions, {
    fields: [studentPlacements.academicSessionId],
    references: [academicSessions.id],
    relationName: "student_placements_academicSessionId",
  }),
  classId: one(classes, {
    fields: [studentPlacements.classId],
    references: [classes.id],
    relationName: "student_placements_classId",
  }),
  sectionId: one(sections, {
    fields: [studentPlacements.sectionId],
    references: [sections.id],
    relationName: "student_placements_sectionId",
  }),
  studentId: one(students, {
    fields: [studentPlacements.studentId],
    references: [students.id],
    relationName: "student_placements_studentId",
  }),
}));

export const studentPreviousSchoolsRelations = relations(studentPreviousSchools, ({ one }) => ({
  studentId: one(students, {
    fields: [studentPreviousSchools.studentId],
    references: [students.id],
    relationName: "student_previous_schools_studentId",
  }),
}));

export const studentResultsRelations = relations(studentResults, ({ many, one }) => ({
  resultPublicationLog: many(resultPublicationLog, {
    relationName: "result_publication_log_studentResultId",
  }),
  academicSessionId: one(academicSessions, {
    fields: [studentResults.academicSessionId],
    references: [academicSessions.id],
    relationName: "student_results_academicSessionId",
  }),
  classId: one(classes, {
    fields: [studentResults.classId],
    references: [classes.id],
    relationName: "student_results_classId",
  }),
  gradingSchemeId: one(gradingSchemes, {
    fields: [studentResults.gradingSchemeId],
    references: [gradingSchemes.id],
    relationName: "student_results_gradingSchemeId",
  }),
  sectionId: one(sections, {
    fields: [studentResults.sectionId],
    references: [sections.id],
    relationName: "student_results_sectionId",
  }),
  studentId: one(students, {
    fields: [studentResults.studentId],
    references: [students.id],
    relationName: "student_results_studentId",
  }),
}));

export const studentsRelations = relations(students, ({ many, one }) => ({
  admission: many(admissions, { relationName: "admissions_studentId" }),
  attendanceCorrection: many(attendanceCorrections, {
    relationName: "attendance_corrections_studentId",
  }),
  attendanceRecord: many(attendanceRecords, {
    relationName: "attendance_records_studentId",
  }),
  biometricEnrollment: many(biometricEnrollments, {
    relationName: "biometric_enrollments_studentId",
  }),
  biometricTransaction: many(biometricTransactions, {
    relationName: "biometric_transactions_studentId",
  }),
  complaint: many(complaints, { relationName: "complaints_studentId" }),
  dailyAttendanceSummarie: many(dailyAttendanceSummaries, {
    relationName: "daily_attendance_summaries_studentId",
  }),
  dailyTestEvaluation: many(dailyTestEvaluations, {
    relationName: "daily_test_evaluations_studentId",
  }),
  diaryAssignment: many(diaryAssignments, {
    relationName: "diary_assignments_studentId",
  }),
  diaryNotification: many(diaryNotifications, {
    relationName: "diary_notifications_studentId",
  }),
  emergencyContact: many(emergencyContacts, {
    relationName: "emergency_contacts_studentId",
  }),
  examinationMark: many(examinationMarks, {
    relationName: "examination_marks_studentId",
  }),
  examinationRegistration: many(examinationRegistrations, {
    relationName: "examination_registrations_studentId",
  }),
  feeConcession: many(feeConcessions, {
    relationName: "fee_concessions_studentId",
  }),
  feeInvoice: many(feeInvoices, { relationName: "fee_invoices_studentId" }),
  feePaymentPlan: many(feePaymentPlans, {
    relationName: "fee_payment_plans_studentId",
  }),
  guardianAuthorization: many(guardianAuthorizations, {
    relationName: "guardian_authorizations_studentId",
  }),
  guardianLink: many(guardianLinks, {
    relationName: "guardian_links_studentId",
  }),
  leaveRequest: many(leaveRequests, {
    relationName: "leave_requests_studentId",
  }),
  monthlyTestReport: many(monthlyTestReports, {
    relationName: "monthly_test_reports_studentId",
  }),
  payment: many(payments, { relationName: "payments_studentId" }),
  studentDocument: many(studentDocuments, {
    relationName: "student_documents_studentId",
  }),
  studentEnrollment: many(studentEnrollments, {
    relationName: "student_enrollments_studentId",
  }),
  studentGuardianSnapshot: many(studentGuardianSnapshots, {
    relationName: "student_guardian_snapshots_studentId",
  }),
  studentNote: many(studentNotes, { relationName: "student_notes_studentId" }),
  studentPlacement: many(studentPlacements, {
    relationName: "student_placements_studentId",
  }),
  studentPreviousSchool: many(studentPreviousSchools, {
    relationName: "student_previous_schools_studentId",
  }),
  studentResult: many(studentResults, {
    relationName: "student_results_studentId",
  }),
  institutionId: one(institutions, {
    fields: [students.institutionId],
    references: [institutions.id],
    relationName: "students_institutionId",
  }),
}));

export const subjectsRelations = relations(subjects, ({ many, one }) => ({
  classSubject: many(classSubjects, {
    relationName: "class_subjects_subjectId",
  }),
  classTeacherAssignment: many(classTeacherAssignments, {
    relationName: "class_teacher_assignments_subjectId",
  }),
  complaint: many(complaints, { relationName: "complaints_subjectId" }),
  dailyTest: many(dailyTests, { relationName: "daily_tests_subjectId" }),
  diarie: many(diaries, { relationName: "diaries_subjectId" }),
  diaryNotificationPreference: many(diaryNotificationPreferences, {
    relationName: "diary_notification_preferences_subjectId",
  }),
  examination: many(examinations, { relationName: "examinations_subjectId" }),
  examinationMark: many(examinationMarks, {
    relationName: "examination_marks_subjectId",
  }),
  floorLiveSnapshot: many(floorLiveSnapshots, {
    relationName: "floor_live_snapshots_subjectId",
  }),
  gradingScheme: many(gradingSchemes, {
    relationName: "grading_schemes_subjectId",
  }),
  monthlyTestReport: many(monthlyTestReports, {
    relationName: "monthly_test_reports_subjectId",
  }),
  schedule: many(schedules, { relationName: "schedules_subjectId" }),
  departmentId: one(departments, {
    fields: [subjects.departmentId],
    references: [departments.id],
    relationName: "subjects_departmentId",
  }),
  institutionId: one(institutions, {
    fields: [subjects.institutionId],
    references: [institutions.id],
    relationName: "subjects_institutionId",
  }),
}));

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [systemSettings.institutionId],
    references: [institutions.id],
    relationName: "system_settings_institutionId",
  }),
  updatedByUserId: one(users, {
    fields: [systemSettings.updatedByUserId],
    references: [users.id],
    relationName: "system_settings_updatedByUserId",
  }),
}));

export const teacherAbsencesRelations = relations(teacherAbsences, ({ many, one }) => ({
  extraPeriod: many(extraPeriods, {
    relationName: "extra_periods_absenceId",
  }),
  employeeId: one(employees, {
    fields: [teacherAbsences.employeeId],
    references: [employees.id],
    relationName: "teacher_absences_employeeId",
  }),
  endTimeSlotId: one(timeSlots, {
    fields: [teacherAbsences.endTimeSlotId],
    references: [timeSlots.id],
    relationName: "teacher_absences_endTimeSlotId_2",
  }),
  institutionId: one(institutions, {
    fields: [teacherAbsences.institutionId],
    references: [institutions.id],
    relationName: "teacher_absences_institutionId",
  }),
  startTimeSlotId: one(timeSlots, {
    fields: [teacherAbsences.startTimeSlotId],
    references: [timeSlots.id],
    relationName: "teacher_absences_startTimeSlotId_2",
  }),
}));

export const teacherDocumentsRelations = relations(teacherDocuments, ({ one }) => ({
  teacherUserId: one(teachers, {
    fields: [teacherDocuments.teacherUserId],
    references: [teachers.userId],
    relationName: "teacher_documents_teacherUserId",
  }),
}));

export const teacherLeaveBalancesRelations = relations(teacherLeaveBalances, ({ one }) => ({
  teacherUserId: one(teachers, {
    fields: [teacherLeaveBalances.teacherUserId],
    references: [teachers.userId],
    relationName: "teacher_leave_balances_teacherUserId",
  }),
}));

export const teacherQualificationsRelations = relations(teacherQualifications, ({ one }) => ({
  teacherUserId: one(teachers, {
    fields: [teacherQualifications.teacherUserId],
    references: [teachers.userId],
    relationName: "teacher_qualifications_teacherUserId",
  }),
}));

export const teacherSubjectsRelations = relations(teacherSubjects, ({ one }) => ({
  teacherUserId: one(teachers, {
    fields: [teacherSubjects.teacherUserId],
    references: [teachers.userId],
    relationName: "teacher_subjects_teacherUserId",
  }),
}));

export const teacherWorkloadHistoryRelations = relations(teacherWorkloadHistory, ({ one }) => ({
  teacherUserId: one(teachers, {
    fields: [teacherWorkloadHistory.teacherUserId],
    references: [teachers.userId],
    relationName: "teacher_workload_history_teacherUserId",
  }),
}));

export const teachersRelations = relations(teachers, ({ many, one }) => ({
  payrollItem: many(payrollItems, { relationName: "payroll_items_teacherId" }),
  teacherDocument: many(teacherDocuments, {
    relationName: "teacher_documents_teacherUserId",
  }),
  teacherLeaveBalance: many(teacherLeaveBalances, {
    relationName: "teacher_leave_balances_teacherUserId",
  }),
  teacherQualification: many(teacherQualifications, {
    relationName: "teacher_qualifications_teacherUserId",
  }),
  teacherSubject: many(teacherSubjects, {
    relationName: "teacher_subjects_teacherUserId",
  }),
  teacherWorkloadHistory: many(teacherWorkloadHistory, {
    relationName: "teacher_workload_history_teacherUserId",
  }),
  departmentId: one(departments, {
    fields: [teachers.departmentId],
    references: [departments.id],
    relationName: "teachers_departmentId",
  }),
  institutionId: one(institutions, {
    fields: [teachers.institutionId],
    references: [institutions.id],
    relationName: "teachers_institutionId",
  }),
  userId: one(users, {
    fields: [teachers.userId],
    references: [users.id],
    relationName: "teachers_userId",
  }),
}));

export const timeSlotsRelations = relations(timeSlots, ({ many, one }) => ({
  attendanceCorrection: many(attendanceCorrections, {
    relationName: "attendance_corrections_timeSlotId",
  }),
  attendanceRecord: many(attendanceRecords, {
    relationName: "attendance_records_timeSlotId",
  }),
  attendanceSession: many(attendanceSessions, {
    relationName: "attendance_sessions_timeSlotId",
  }),
  biometricTransaction: many(biometricTransactions, {
    relationName: "biometric_transactions_resolvedTimeSlotId",
  }),
  examination: many(examinations, { relationName: "examinations_timeSlotId" }),
  extraPeriod: many(extraPeriods, { relationName: "extra_periods_timeSlotId" }),
  floorLiveSnapshot: many(floorLiveSnapshots, {
    relationName: "floor_live_snapshots_timeSlotId",
  }),
  schedule: many(schedules, { relationName: "schedules_timeSlotId" }),
  teacherAbsenceEndTimeSlotId: many(teacherAbsences, {
    relationName: "teacher_absences_endTimeSlotId_2",
  }),
  teacherAbsenceStartTimeSlotId: many(teacherAbsences, {
    relationName: "teacher_absences_startTimeSlotId_2",
  }),
  academicSessionId: one(academicSessions, {
    fields: [timeSlots.academicSessionId],
    references: [academicSessions.id],
    relationName: "time_slots_academicSessionId",
  }),
  institutionId: one(institutions, {
    fields: [timeSlots.institutionId],
    references: [institutions.id],
    relationName: "time_slots_institutionId",
  }),
}));

export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  userId: one(users, {
    fields: [userCredentials.userId],
    references: [users.id],
    relationName: "user_credentials_userId",
  }),
}));

export const userInstitutionsRelations = relations(userInstitutions, ({ one }) => ({
  institutionId: one(institutions, {
    fields: [userInstitutions.institutionId],
    references: [institutions.id],
    relationName: "user_institutions_institutionId",
  }),
  userId: one(users, {
    fields: [userInstitutions.userId],
    references: [users.id],
    relationName: "user_institutions_userId",
  }),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  grantedByUserId: one(users, {
    fields: [userPermissions.grantedByUserId],
    references: [users.id],
    relationName: "user_permissions_grantedByUserId_3",
  }),
  institutionId: one(institutions, {
    fields: [userPermissions.institutionId],
    references: [institutions.id],
    relationName: "user_permissions_institutionId",
  }),
  permissionId: one(permissions, {
    fields: [userPermissions.permissionId],
    references: [permissions.id],
    relationName: "user_permissions_permissionId",
  }),
  revokedByUserId: one(users, {
    fields: [userPermissions.revokedByUserId],
    references: [users.id],
    relationName: "user_permissions_revokedByUserId_3",
  }),
  userId: one(users, {
    fields: [userPermissions.userId],
    references: [users.id],
    relationName: "user_permissions_userId_3",
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  grantedByUserId: one(users, {
    fields: [userRoles.grantedByUserId],
    references: [users.id],
    relationName: "user_roles_grantedByUserId_3",
  }),
  institutionId: one(institutions, {
    fields: [userRoles.institutionId],
    references: [institutions.id],
    relationName: "user_roles_institutionId",
  }),
  revokedByUserId: one(users, {
    fields: [userRoles.revokedByUserId],
    references: [users.id],
    relationName: "user_roles_revokedByUserId_3",
  }),
  roleId: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
    relationName: "user_roles_roleId",
  }),
  userId: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: "user_roles_userId_3",
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  announcement: many(announcements, {
    relationName: "announcements_authorUserId",
  }),
  announcementReceipt: many(announcementReceipts, {
    relationName: "announcement_receipts_userId",
  }),
  auditEvent: many(auditEvents, { relationName: "audit_events_actorUserId" }),
  complaintAction: many(complaintActions, {
    relationName: "complaint_actions_actorUserId",
  }),
  complaintAssignedToUserId: many(complaints, {
    relationName: "complaints_assignedToUserId_3",
  }),
  complaintAttachmentUploadedByUserId: many(complaintAttachments, {
    relationName: "complaint_attachments_uploadedByUserId_2",
  }),
  complaintAttachmentWithdrawnByUserId: many(complaintAttachments, {
    relationName: "complaint_attachments_withdrawnByUserId_2",
  }),
  complaintCommentAuthorUserId: many(complaintComments, {
    relationName: "complaint_comments_authorUserId_2",
  }),
  complaintCommentEditedByUserId: many(complaintComments, {
    relationName: "complaint_comments_editedByUserId_2",
  }),
  complaintReportedByUserId: many(complaints, {
    relationName: "complaints_reportedByUserId_3",
  }),
  complaintResolvedByUserId: many(complaints, {
    relationName: "complaints_resolvedByUserId_3",
  }),
  complaintVisibilityGrantedByUserId: many(complaintVisibility, {
    relationName: "complaint_visibility_grantedByUserId_3",
  }),
  complaintVisibilityRevokedByUserId: many(complaintVisibility, {
    relationName: "complaint_visibility_revokedByUserId_3",
  }),
  complaintVisibilityUserId: many(complaintVisibility, {
    relationName: "complaint_visibility_userId_3",
  }),
  dailyTest: many(dailyTests, {
    relationName: "daily_tests_createdByTeacherUserId",
  }),
  dailyTestCorrection: many(dailyTestCorrections, {
    relationName: "daily_test_corrections_correctedByUserId",
  }),
  dailyTestEvaluation: many(dailyTestEvaluations, {
    relationName: "daily_test_evaluations_enteredByUserId",
  }),
  dailyTestPublication: many(dailyTestPublications, {
    relationName: "daily_test_publications_publishedByUserId",
  }),
  emailMessage: many(emailMessages, {
    relationName: "email_messages_toUserId",
  }),
  emailTemplateCreatedByUserId: many(emailTemplates, {
    relationName: "email_templates_createdByUserId_2",
  }),
  emailTemplateUpdatedByUserId: many(emailTemplates, {
    relationName: "email_templates_updatedByUserId_2",
  }),
  employee: many(employees, { relationName: "employees_userId" }),
  examMarksCorrectionApprovedByUserId: many(examMarksCorrections, {
    relationName: "exam_marks_corrections_approvedByUserId_2",
  }),
  examMarksCorrectionCorrectedByUserId: many(examMarksCorrections, {
    relationName: "exam_marks_corrections_correctedByUserId_2",
  }),
  examination: many(examinations, {
    relationName: "examinations_setByTeacherUserId",
  }),
  examinationMark: many(examinationMarks, {
    relationName: "examination_marks_enteredByUserId",
  }),
  examinationRegistration: many(examinationRegistrations, {
    relationName: "examination_registrations_withdrawnByUserId",
  }),
  guardian: many(guardians, { relationName: "guardians_userId" }),
  notification: many(notifications, {
    relationName: "notifications_createdByUserId",
  }),
  notificationDeliverie: many(notificationDeliveries, {
    relationName: "notification_deliveries_recipientUserId",
  }),
  notificationPreference: many(notificationPreferences, {
    relationName: "notification_preferences_userId",
  }),
  payrollAdjustmentAppliedByUserId: many(payrollAdjustments, {
    relationName: "payroll_adjustments_appliedByUserId_3",
  }),
  payrollAdjustmentApprovedByUserId: many(payrollAdjustments, {
    relationName: "payroll_adjustments_approvedByUserId_3",
  }),
  payrollAdjustmentReversedByUserId: many(payrollAdjustments, {
    relationName: "payroll_adjustments_reversedByUserId_3",
  }),
  payrollPayment: many(payrollPayments, {
    relationName: "payroll_payments_processedByUserId",
  }),
  payrollPayslip: many(payrollPayslips, {
    relationName: "payroll_payslips_sharedByUserId",
  }),
  payrollPeriodLock: many(payrollPeriodLocks, {
    relationName: "payroll_period_locks_lockedByUserId",
  }),
  payrollRunApprovedByUserId: many(payrollRuns, {
    relationName: "payroll_runs_approvedByUserId_2",
  }),
  payrollRunCalculatedByUserId: many(payrollRuns, {
    relationName: "payroll_runs_calculatedByUserId_2",
  }),
  permissionScope: many(permissionScopes, {
    relationName: "permission_scopes_userId",
  }),
  resultPublicationLog: many(resultPublicationLog, {
    relationName: "result_publication_log_publishedByUserId",
  }),
  securityEvent: many(securityEvents, {
    relationName: "security_events_userId",
  }),
  session: many(sessions, { relationName: "sessions_userId" }),
  settingChange: many(settingChanges, {
    relationName: "setting_changes_changedByUserId",
  }),
  systemSetting: many(systemSettings, {
    relationName: "system_settings_updatedByUserId",
  }),
  teacher: many(teachers, { relationName: "teachers_userId" }),
  userCredential: many(userCredentials, {
    relationName: "user_credentials_userId",
  }),
  userInstitution: many(userInstitutions, {
    relationName: "user_institutions_userId",
  }),
  userPermissionGrantedByUserId: many(userPermissions, {
    relationName: "user_permissions_grantedByUserId_3",
  }),
  userPermissionRevokedByUserId: many(userPermissions, {
    relationName: "user_permissions_revokedByUserId_3",
  }),
  userPermissionUserId: many(userPermissions, {
    relationName: "user_permissions_userId_3",
  }),
  userRoleGrantedByUserId: many(userRoles, {
    relationName: "user_roles_grantedByUserId_3",
  }),
  userRoleRevokedByUserId: many(userRoles, {
    relationName: "user_roles_revokedByUserId_3",
  }),
  userRoleUserId: many(userRoles, { relationName: "user_roles_userId_3" }),
}));
