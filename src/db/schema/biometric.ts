/**
 * Biometric devices, enrolments and raw scan transactions.
 *
 * Split out of `attendance.ts` so the dependency runs one way: **attendance reads biometric
 * transactions; biometric never reads attendance.** `ARCHITECTURE.md` §19 makes that the rule for
 * Floor Operations and Payroll ("record the operational event; let Payroll decide the financial
 * consequence"), and the same discipline is what keeps a device driver change from being able to
 * corrupt a mark of attendance.
 *
 * Three requirements from `PRD.md` MODULE 33 and `ARCHITECTURE.md` §35 shape this file:
 *
 * 1. **A scan is a claim, not a fact about a person.** It becomes an attendance mark only through
 *    resolution in the attendance module.
 * 2. **Unmatched scans are kept.** A scan that matched nobody is the answer to "the gate counted 41
 *    and the register says 40", which is a question this system is required to be able to answer.
 * 3. **No biometric template is ever stored in PostgreSQL.** `ARCHITECTURE.md` §35 and §51: a
 *    fingerprint template is a non-revocable biometric identifier and this database is backed up to
 *    object storage. Only an opaque device-side handle is kept.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "./_conventions";
import { campuses, floors, institutions } from "./institution";
import { timeSlots } from "./academic";
import { employees } from "./hr";
import { students } from "./student";

/**
 * `biometric_devices` — a registered fingerprint/face terminal.
 *
 * `PRD.md` MODULE 33 and `ARCHITECTURE.md` §35: a `ZKTeco K50` at a gate. Registered rather than
 * hardcoded because a second institution in the same deployment has its own devices and its own
 * firmware versions, and a device whose firmware the reader does not understand cannot be trusted to
 * report time correctly.
 *
 * `deviceKey` is the device's own serial, unique across the platform: two institutions may both label
 * a device "Gate 1", but no two devices share a serial.
 */
export const biometricDevices = pgTable(
  "biometric_devices",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** The device's hardware serial. Unique platform-wide. */
    deviceKey: varchar("device_key", { length: 128 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    /** Where it is. `null` when a device is not yet assigned to a physical location. */
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "set null" }),
    firmwareVersion: varchar("firmware_version", { length: 64 }),
    /** `active`, `maintenance`, `retired`. A retired device must not be trusted for attendance. */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, precision: 3 }),
    installedAt: timestamp("installed_at", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("biometric_devices_key_key").on(t.deviceKey),
    index("biometric_devices_institution_idx").on(t.institutionId, t.status),
    check(
      "biometric_devices_status_check",
      sql`${t.status} in ('active', 'maintenance', 'retired')`,
    ),
  ],
);

/**
 * `biometric_enrollments` — a person's registered template on a device.
 *
 * **The template itself is never stored here.** `ARCHITECTURE.md` §35 and §51: a fingerprint template is
 * a biometric identifier, it is not revocable, and it must not sit in a database that is backed up to
 * object storage. What is stored is the *reference* — `templateRef`, an opaque handle the
 * device's SDK understands — plus the enrolment metadata and who authorised it. A device that has lost
 * its templates can re-enrol from the reference; a database dump alone cannot reconstruct them.
 *
 * `(device_id, person_kind, person_id)` is the primary key so one person has at most one template per
 * device, and the two partial unique indexes enforce "one enrolled finger per person per device".
 */
export const biometricEnrollments = pgTable(
  "biometric_enrollments",
  {
    id: primaryId(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => biometricDevices.id, { onDelete: "cascade" }),
    /** `student` or `employee`. Exactly one of `studentId` / `employeeId` is set. */
    personKind: varchar("person_kind", { length: 16 }).notNull(),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    /** Opaque device-side handle. Never the template bytes. */
    templateRef: varchar("template_ref", { length: 256 }).notNull(),
    fingerLabel: varchar("finger_label", { length: 32 }),
    enrolledByUserId: uuid("enrolled_by_user_id").notNull(),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, precision: 3 }),
    revokedByUserId: uuid("revoked_by_user_id"),
    revocationReason: varchar("revocation_reason", { length: 500 }),
  },
  (t) => [
    uniqueIndex("biometric_enrollments_device_template_key").on(t.deviceId, t.templateRef),
    uniqueIndex("biometric_enrollments_student_key")
      .on(t.deviceId, t.studentId)
      .where(sql`${t.studentId} is not null and ${t.revokedAt} is null`),
    uniqueIndex("biometric_enrollments_employee_key")
      .on(t.deviceId, t.employeeId)
      .where(sql`${t.employeeId} is not null and ${t.revokedAt} is null`),
    index("biometric_enrollments_student_idx").on(t.studentId, t.revokedAt),
    check(
      "biometric_enrollments_person_kind_check",
      sql`${t.personKind} in ('student', 'employee')`,
    ),
    check(
      "biometric_enrollments_single_person_check",
      sql`(${t.personKind} = 'student' and ${t.studentId} is not null and ${t.employeeId} is null) or (${t.personKind} = 'employee' and ${t.employeeId} is not null and ${t.studentId} is null)`,
    ),
  ],
);

/**
 * `biometric_transactions` — a scan event, before it is understood.
 *
 * `ARCHITECTURE.md` §35 and `PRD.md` MODULE 33. Four properties matter:
 *
 * 1. **Raw events are kept even when unmatched.** `verification = 'unknown_person'` is stored, because
 *    "the gate counted 41 but the register says 40" is a real question and deleting the unmatched rows
 *    destroys the only evidence.
 * 2. **A transaction is never an attendance mark.** It carries `verification`, and only a verified
 *    transaction in an in-window period is resolved into `attendance_records` by the attendance module.
 * 3. **`deviceTime` and `receivedAt` are both stored.** A device with a wrong clock is common; the
 *    difference is the only way to diagnose it.
 * 4. **`(device_id, device_event_id)` is unique** — the device's own sequence number, which is what
 *    makes a re-uploaded batch idempotent (`PRD.md` MODULE 34's duplicate-prevention requirement).
 */
export const biometricTransactions = pgTable(
  "biometric_transactions",
  {
    id: primaryId(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => biometricDevices.id, { onDelete: "cascade" }),
    /** The device's own monotonically increasing event id. Idempotency key for re-uploads. */
    deviceEventId: varchar("device_event_id", { length: 128 }).notNull(),
    enrolledTemplateRef: varchar("enrolled_template_ref", { length: 256 }).notNull(),
    /** What the device believed at the time. May not resolve — hence `verification`. */
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    scanKind: varchar("scan_kind", { length: 16 }).notNull().default("unknown"),
    direction: varchar("direction", { length: 8 }),
    /** The device's clock. Untrusted; see the note above. */
    deviceTime: timestamp("device_time", { withTimezone: true, precision: 3 }).notNull(),
    /** When this server received it. Trusted. */
    receivedAt: timestamp("received_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    verification: varchar("verification", { length: 24 }).notNull().default("unknown_person"),
    /** Match confidence, when the device reports one. Null when it does not. */
    matchScore: numeric("match_score", { precision: 5, scale: 2 }),
    /** Populated when `verification = 'out_of_window'`: the period it fell outside. */
    resolvedTimeSlotId: uuid("resolved_time_slot_id").references(() => timeSlots.id, {
      onDelete: "set null",
    }),
    /**
     * The attendance mark this transaction produced. Declared as a bare uuid because the mark is keyed
     * on four columns (section, date, period, student) and cannot be a single foreign key — the
     * attendance module owns that join, and a transaction resolved to no mark leaves this null.
     */
    resolvedAttendanceStudentId: uuid("resolved_attendance_student_id"),
    rawPayload: text("raw_payload"),
    processedAt: timestamp("processed_at", { withTimezone: true, precision: 3 }),
  },
  (t) => [
    uniqueIndex("biometric_transactions_device_event_key").on(t.deviceId, t.deviceEventId),
    index("biometric_transactions_device_time_idx").on(t.deviceId, t.deviceTime),
    index("biometric_transactions_student_idx").on(t.studentId, t.deviceTime),
    index("biometric_transactions_verification_idx").on(t.verification, t.receivedAt),
    check(
      "biometric_transactions_scan_kind_check",
      sql`${t.scanKind} in ('check_in', 'check_out', 'unknown')`,
    ),
    check(
      "biometric_transactions_direction_check",
      sql`${t.direction} is null or ${t.direction} in ('in', 'out')`,
    ),
    check(
      "biometric_transactions_verification_check",
      sql`${t.verification} in ('verified', 'unknown_person', 'duplicate', 'out_of_window', 'rejected')`,
    ),
    // A verified transaction must name a person. Without this, `verification = 'verified'` with a null
    // student is a match that resolved to nobody, which is the exact failure mode §35 describes.
    check(
      "biometric_transactions_verified_person_check",
      sql`${t.verification} <> 'verified' or num_nonnulls(${t.studentId}, ${t.employeeId}) = 1`,
    ),
    check(
      "biometric_transactions_out_of_window_check",
      sql`${t.verification} <> 'out_of_window' or ${t.resolvedTimeSlotId} is not null`,
    ),
  ],
);
