/**
 * Every `pgEnum` in the system, in one file.
 *
 * ## Why these are real enums and not free-form strings
 *
 * `DOMAIN-MODEL.md` defect G-7: the archived schema typed every `status` and `type` as a plain
 * string, so `attendance` could be `"prsent"`, `""` or `null` and the database accepted it.
 * `RULES.md` §13 requires status and type fields to be constrained sets enforced by the database,
 * database to reinforce structural integrity. A `pgEnum` does that in one place: an unlisted value
 * fails at the column, not at the first report that has to interpret it.
 *
 * The values are `lower_snake_case` because they are **stored** identifiers that appear in
 * migrations, `WHERE` clauses and API payloads. What a user sees is a separate concern —
 * `DESIGN.md` §13 (human-readable display values) requires a label, and label mapping belongs to
 * the presentation layer, not to the column. Never store a sentence in an enum.
 *
 * ## Two kinds of state, deliberately not merged
 *
 * `DOMAIN-MODEL.md` D-4: *lifecycle* (admitted → active → graduated) and *archival* (this row is no
 * longer live) are different axes. Every table that has a lifecycle enum keeps archival as a
 * nullable `archived_at` timestamp from `_conventions.ts`. Neither is derivable from the other — a
 * graduated student is not archived, an archived student may still have a valid lifecycle — and
 * collapsing them into one `status` column is defect G-12.
 *
 * ## Adding a value
 *
 * Adding to an enum is safe: it is a `ALTER TYPE ... ADD VALUE`. Removing or renaming one is a
 * breaking change to stored history and needs a data migration first (`RULES.md` §14). Because
 * these enums appear in committed migrations, treat them as part of the data contract.
 */

import { pgEnum } from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Identity & authorization                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `user_status` — account state, not lifecycle and not archival.
 *
 * There is no `deleted`. A user account is never removed: `audit_events.actor_id` and every
 * historical record reference it, so deleting one would either orphan the audit trail or cascade
 * away financial history (`RULES.md` §36). `revoked` replaces `deleted` and means "may not
 * authenticate any more", which is the only thing deletion is ever actually used to express.
 */
export const userStatusEnum = pgEnum("user_status", [
  "invited",
  "active",
  "inactive",
  "suspended",
  "revoked",
]);

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `gender` — recorded, never inferred and never required.
 *
 * Nullable, because the PRD does not make gender a mandatory admission field and collecting it
 * obligatorily would be a data-protection problem. `undisclosed` exists as an explicit choice
 * rather than a null, so "the parent declined to state it" is distinguishable from "we never
 * asked".
 */
export const genderEnum = pgEnum("gender", ["male", "female", "other", "undisclosed"]);

/**
 * `student_lifecycle` — `PRD.md` §33.
 *
 * `applicant` is deliberately absent: an applicant is an `admissions.admissions` row that has not
 * become a student yet (`DOMAIN-MODEL.md` D-3). Putting `applicant` here would give one record two
 * possible sources of truth for the same fact.
 */
export const studentLifecycleEnum = pgEnum("student_lifecycle", [
  "admitted",
  "active",
  "promoted",
  "graduated",
  "transferred",
  "withdrawn",
  "inactive",
]);

/**
 * `guardian_relationship` — `PRD.md` MODULE 5 requires a guardian to be linkable to multiple
 * students and a student to have multiple guardians.
 *
 * A value is required on the link rather than the person because the same adult is a *father* to
 * one student and a *legal guardian* to another. See `guardian_links.relationship`.
 */
export const guardianRelationshipEnum = pgEnum("guardian_relationship", [
  "father",
  "mother",
  "grandparent",
  "sibling",
  "uncle_aunt",
  "legal_guardian",
  "foster_guardian",
  "other",
]);

/** Which adult to contact in an emergency. Enforced on the link, not on the person. */
export const guardianContactTypeEnum = pgEnum("guardian_contact_type", [
  "primary",
  "secondary",
  "emergency",
]);

/* -------------------------------------------------------------------------- */
/* Admissions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `admission_status` — `PRD.md` §11 / MODULE 5, decision D-3.
 *
 * `converted` is terminal and means the applicant became a `students` row. It is a *state*, not a
 * boolean, because "converted, and the student has since withdrawn" is a question the record must
 * be able to answer; a `is_converted` flag plus a status column would be two competing truths.
 */
export const admissionStatusEnum = pgEnum("admission_status", [
  "submitted",
  "under_review",
  "waitlisted",
  "approved",
  "rejected",
  "converted",
  "cancelled",
]);

/**
 * `document_type` — `PRD.md` MODULE 5 names B-Form and birth certificate explicitly.
 *
 * `other` is not a wildcard escape hatch; it is a real category for the local document an
 * institution requires that the list does not name. An institution may add its own types, but doing
 * so is an enum migration, not a free string.
 */
export const documentTypeEnum = pgEnum("document_type", [
  "b_form",
  "birth_certificate",
  "transfer_certificate",
  "previous_result_card",
  "national_id",
  "photo",
  "medical_certificate",
  "other",
]);

/** Whether an uploaded document is currently visible to a guardian. */
export const documentStatusEnum = pgEnum("document_status", [
  "pending_verification",
  "verified",
  "rejected",
  "expired",
]);

/* -------------------------------------------------------------------------- */
/* Academic structure                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `institution_kind` — `PRD.md` MODULE 4: the system serves Scholar School and Scholar College.
 *
 * One `institutions` table with a discriminator rather than two tables, because every downstream
 * module queries "the institution" and a discriminator keeps that query single.
 */
export const institutionKindEnum = pgEnum("institution_kind", ["school", "college"]);

/**
 * `subject_kind` — whether a subject is taught, practised, or both.
 *
 * A practice-only subject still takes attendance and still appears in a schedule, so it is a real
 * distinction rather than a naming convention.
 */
export const subjectKindEnum = pgEnum("subject_kind", ["theory", "practical", "both"]);

/**
 * `schedule_kind` — `PRD.md` MODULE 17/19: a period in the timetable can be a lesson, a free period,
 * or an extra period created because a teacher was absent.
 *
 * `free` exists as a value rather than as the absence of a row so the Floor-Incharge live view can
 * render every cell of the grid. See `ARCHITECTURE.md` §19: Floor Operations owns the operational
 * event, Payroll decides whether it has a financial consequence.
 */
export const scheduleKindEnum = pgEnum("schedule_kind", ["lesson", "free", "extra", "exam"]);

/**
 * `schedule_status` — draft vs published.
 *
 * `RULES.md` §44: once published, a timetable change is not an edit, it is an audited change
 * (`ARCHITECTURE.md` §22). `locked` marks a past academic session read-only (§44 of `RULES.md`).
 */
export const scheduleStatusEnum = pgEnum("schedule_status", ["draft", "published", "locked"]);

/* -------------------------------------------------------------------------- */
/* Attendance & leave                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `attendance_status` — `ARCHITECTURE.md` §17 requires exactly these four states, and §18 is
 * emphatic that they must prevent contradictory combinations: an unapproved absence is `absent`, not
 * `leave`. Leave only appears when a `leave_requests` row has been **approved**, which is why the
 * enum has no "leave requested" member.
 */
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "leave",
]);

/**
 * `attendance_source` — who produced the mark.
 *
 * Needed for `ARCHITECTURE.md` §35: a biometric transaction is a claim from a device, and it is not
 * the same kind of fact as a Floor-Incharge tapping a student present. Both are auditable; a
 * correction to either is a correction.
 */
export const attendanceSourceEnum = pgEnum("attendance_source", [
  "manual",
  "biometric",
  "imported",
  "derived_from_leave",
]);

/**
 * `leave_status` — `PRD.md` MODULE 13, `ARCHITECTURE.md` §18.
 *
 * `approved` is the only state that may become `attendance_status = leave`, and that transition
 * belongs to the attendance module rather than to this one, so an approved request cannot by itself
 * mark anyone absent.
 */
export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

/** `PRD.md` MODULE 13 — the reason is a constrained set so reports can group it. */
export const leaveTypeEnum = pgEnum("leave_type", [
  "sick",
  "family_emergency",
  "academic",
  "travel",
  "sports",
  "other",
]);

/** Who filed the request. `PRD.md` MODULE 13: students do not file their own requests. */
export const leaveRequestedByEnum = pgEnum("leave_requested_by", ["guardian", "staff", "system"]);

/* -------------------------------------------------------------------------- */
/* HR, teachers & payroll                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `employee_type` — `PRD.md` MODULE 8 lists exactly these. `teacher` is a member because an
 * employee record is an employment record; being a *teacher* additionally means holding a
 * `teachers.teachers` profile with teaching assignments (`ADR-0002`).
 */
export const employeeTypeEnum = pgEnum("employee_type", [
  "teacher",
  "accountant",
  "floor_incharge",
  "hr",
  "admin",
  "other_staff",
]);

/** `PRD.md` MODULE 8. */
export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "visiting",
]);

/** Staff lifecycle, kept separate from `archived_at` per `DOMAIN-MODEL.md` D-4. */
export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "on_leave",
  "resigned",
  "terminated",
  "retired",
]);

/**
 * `salary_structure` — `PRD.md` MODULE 9 requires both.
 *
 * The discriminator lives on the salary configuration rather than on the employee, because
 * `ARCHITECTURE.md` §20 separates *what the employee is supposed to earn* from *what was calculated*
 * for a period, and a structure change mid-employment must not rewrite history: each configuration
 * row is dated.
 */
export const salaryStructureEnum = pgEnum("salary_structure", ["fixed", "unit_based"]);

/**
 * `payroll_status` — `ARCHITECTURE.md` §20's pipeline, as states rather than flags.
 *
 * `locked` is terminal: a locked period is history, and editing it requires the elevated permission
 * `RULES.md` §44 demands for anything post-publication.
 */
export const payrollStatusEnum = pgEnum("payroll_status", [
  "draft",
  "calculated",
  "approved",
  "paid",
  "locked",
]);

/**
 * `extra_period_reason` — `PRD.md` MODULE 19.
 *
 * `replacement` is the case the PRD calls out: a replacement period taken because a teacher is
 * absent, which counts toward a unit-based teacher's salary. The reason is stored so payroll can
 * distinguish a payable extra period from an operational event with no financial consequence.
 */
export const extraPeriodReasonEnum = pgEnum("extra_period_reason", [
  "replacement",
  "substitution",
  "additional_class",
  "exam_duty",
  "invigilation",
  "other",
]);

/** `PRD.md` MODULE 19: what the Floor-Incharge did about an absent teacher. */
export const replacementResolutionEnum = pgEnum("replacement_resolution", [
  "replacement_teacher",
  "alternative_activity",
  "test",
  "self_study",
  "period_cancelled",
]);

/* -------------------------------------------------------------------------- */
/* Fees & finance                                                             */
/* -------------------------------------------------------------------------- */

/** `PRD.md` MODULE 6 — the recurrence of a fee line. */
export const feeFrequencyEnum = pgEnum("fee_frequency", [
  "one_time",
  "monthly",
  "quarterly",
  "annual",
  "term",
]);

/**
 * `fee_status` — `PRD.md` MODULE 6 requires pending, paid, outstanding, overdue and deferred.
 *
 * `overdue` is stored rather than computed purely from a date because a deferral must suspend it,
 * and a deferral is a decision with a reason and an audit entry — not something a date comparison
 * can infer. Outstanding balance itself is **computed, never stored** (`ADR-0003`).
 */
export const feeStatusEnum = pgEnum("fee_status", [
  "pending",
  "partial",
  "paid",
  "overdue",
  "deferred",
  "waived",
  "cancelled",
]);

/** `PRD.md` MODULE 6. */
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "cheque",
  "online_gateway",
  "card",
  "other",
]);

/** A payment is not deleted when it goes wrong — it is reversed, and the reversal is also recorded. */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "reversed",
  "refunded",
]);

/** `PRD.md` MODULE 7: which ledger an entry belongs to. */
export const transactionKindEnum = pgEnum("transaction_kind", [
  "fee_collection",
  "salary_payment",
  "refund",
  "expense",
  "income",
  "adjustment",
  "opening_balance",
]);

/** The sign of a ledger entry, so a report never has to infer it from the kind. */
export const transactionDirectionEnum = pgEnum("transaction_direction", ["in", "out"]);

/** `PRD.md` MODULE 7 — expense heads an institution actually reports on. */
export const expenseCategoryEnum = pgEnum("expense_category", [
  "salary",
  "utilities",
  "maintenance",
  "supplies",
  "transport",
  "events",
  "marketing",
  "tax",
  "other",
]);

/* -------------------------------------------------------------------------- */
/* Examinations, results, daily tests & diary                                  */
/* -------------------------------------------------------------------------- */

/** `PRD.md` MODULE 20 names the four examination types; `quiz` covers in-class weekly tests. */
export const examinationTypeEnum = pgEnum("examination_type", [
  "daily_test",
  "monthly_test",
  "grand_test",
  "midterm",
  "annual",
  "quiz",
  "assignment",
]);

/**
 * `publication_status` — `DOMAIN-MODEL.md` BR-7 and `RULES.md` §44.
 *
 * Publication is a state with its own timestamp, not a boolean: `published` and `published_at` are
 * what make a post-publication change an explicit, auditable act rather than an overwrite.
 */
export const publicationStatusEnum = pgEnum("publication_status", ["draft", "published", "locked"]);

/** A daily diary entry's delivery state. `PRD.md` MODULE 23/24. */
export const diaryStatusEnum = pgEnum("diary_status", ["draft", "assigned", "closed"]);

/** `PRD.md` MODULE 25. */
export const complaintStatusEnum = pgEnum("complaint_status", [
  "open",
  "under_review",
  "resolved",
  "dismissed",
  "escalated",
]);

/* -------------------------------------------------------------------------- */
/* Communication                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `notification_audience` — `PRD.md` MODULE 26 requires targeting by role, department, class,
 * section, parent, teacher and individual.
 *
 * `ARCHITECTURE.md` §31: "notification targeting must be permission-aware", so the audience is a
 * discriminator plus a nullable id rather than free text, and resolution goes through the
 * authorization model rather than around it.
 */
export const notificationAudienceEnum = pgEnum("notification_audience", [
  "user",
  "role",
  "department",
  "class",
  "section",
  "student",
  "guardian",
  "teacher",
  "everyone",
]);

/** `PRD.md` MODULE 26: in-app is primary; email accompanies it where a workflow requires it. */
export const notificationChannelEnum = pgEnum("notification_channel", ["in_app", "email", "both"]);

/**
 * Delivery state, per recipient.
 *
 * Separate from whether the notification *exists*. One announcement to 400 recipients is one
 * notification and 400 delivery rows, which is what makes "did the parent get the monthly report
 * email?" answerable (`PRD.md` MODULE 22 sends exactly one).
 */
export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "pending",
  "delivered",
  "read",
  "failed",
  "suppressed",
]);

/** `PRD.md` MODULE 28: SMTP-based, and idempotent where duplicate sending would be harmful. */
export const emailStatusEnum = pgEnum("email_status", [
  "queued",
  "sending",
  "sent",
  "failed",
  "suppressed",
]);

/* -------------------------------------------------------------------------- */
/* Governance, jobs & integration                                             */
/* -------------------------------------------------------------------------- */

/**
 * `audit_result` — must stay identical to `AUDIT_RESULTS` in `src/shared/logging/audit.ts`, which
 * `createAuditEvent` validates against. `src/db/schema/audit.test.ts` asserts the two agree; a
 * divergence would make a runtime-validated action write to a column that rejects it.
 */
export const auditResultEnum = pgEnum("audit_result", ["success", "failure", "denied"]);

/**
 * `job_status` — `PRD.md` MODULE 34 requires status, retry, failure handling and duplicate
 * prevention. `dead_letter` is where a job lands when its retries are exhausted, so it stops being
 * retried silently forever.
 */
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
]);

/** `PRD.md` MODULE 33 / `ARCHITECTURE.md` §35: what a device transaction claims happened. */
export const biometricEventDirectionEnum = pgEnum("biometric_event_direction", ["in", "out"]);

/**
 * `biometric_verification_state` — whether a device transaction was resolved to a person.
 *
 * A transaction that matched nobody is still data worth keeping (it is the answer to "why does the
 * gate count say 41 but the register says 40?"). It is stored, not discarded, and it never becomes
 * an attendance mark on its own — `attendance.corrections` is the audited path.
 */
export const biometricVerificationEnum = pgEnum("biometric_verification", [
  "verified",
  "unknown_person",
  "duplicate",
  "out_of_window",
  "rejected",
]);

/** The direction a fingerprint scan must support: check-in and check-out (`ZKTeco K50`). */
export const biometricScanKindEnum = pgEnum("biometric_scan_kind", [
  "check_in",
  "check_out",
  "unknown",
]);

/** `PRD.md` MODULE 32 — a setting value's type, so the settings module can parse it safely. */
export const settingValueTypeEnum = pgEnum("setting_value_type", [
  "string",
  "number",
  "boolean",
  "json",
  "date",
]);
