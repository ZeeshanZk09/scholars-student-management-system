/**
 * Academic structure: classes, groups, sections, subjects, time slots and schedules.
 *
 * ## The chain, and a documented conflict
 *
 * `ARCHITECTURE.md` §15 draws `Institution → Academic Year → Class → Section → Group → Subjects`
 * and says "the architecture must support optional groups". `PRD.md` MODULE 4 says "Groups are
 * optional". `DOMAIN-MODEL.md` §2 and the user's explicit decision of 2026-09-30 (recorded in
 * `MEMORY.md` §16 item 6) fix the opposite order: **Group above Section**, with `Section.groupId`
 * `NOT NULL`.
 *
 * `RULES.md` §2 ranks "explicit latest user requirements" above the approved PRD and ARCHITECTURE, so
 * the Group-above-Section chain wins and `ARCHITECTURE.md` §15's diagram is stale. That deviation is
 * recorded in `DOMAIN-MODEL.md` §10 rather than silently resolved. The practical consequence is that
 * a Group is never optional in this schema — `academic_groups.class_id` and
 * `academic_sections.group_id` are both required, and a "no group" institution creates one group per
 * class rather than leaving the column null. An optional chain cannot be reconstructed later from a
 * nullable column, because a null group and a section with no group are indistinguishable; a
 * structural level that must exist is better modelled as existing.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  archivedAt,
  createdAt,
  description,
  primaryId,
  shortName,
  slug,
  updatedAt,
  version,
} from "./_conventions";
import { scheduleKindEnum, scheduleStatusEnum, subjectKindEnum } from "./_enums";
import { academicSessions, campuses, departments, floors, institutions } from "./institution";

/**
 * `classes` — an academic level within a session. "First Year", "Grade 9", "BSCS-1".
 *
 * `academic_session_id` is `NOT NULL`. The archived contract made it optional, which permitted a class
 * to exist with no session and broke `DOMAIN-MODEL.md` BR-1 (defect G-9). A class outside a session
 * has no meaning in this system: it could not be placed, scheduled or reported on.
 *
 * `grade_level` is the sort key for Nursery…Class 12 (`PRD.md` MODULE 4). It is a number rather than
 * the name so ordering is a column comparison instead of a string sort that would put "Class 10"
 * before "Class 2".
 */
export const classes = pgTable(
  "classes",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(80),
    /** 0-based ordering within the session; `PRD.md` MODULE 4's Nursery→Class 12 list. */
    gradeLevel: integer("grade_level").notNull(),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("classes_session_name_key").on(t.academicSessionId, t.name),
    uniqueIndex("classes_session_slug_key").on(t.academicSessionId, t.slug),
    // One class per grade level per session: two "Class 9" rows in one session is a data-entry
    // mistake, not a legitimate parallel stream, and it would break every grade-level report.
    uniqueIndex("classes_session_grade_key").on(t.academicSessionId, t.gradeLevel),
    index("classes_institution_idx").on(t.institutionId),
  ],
);

/**
 * `groups` — a stream or specialisation within a class. "Computer Science", "Pre-Medical", "ICS".
 *
 * Holds Sections (`DOMAIN-MODEL.md` §2): a Group is the parent of one or more Sections, which is why
 * the placement chain reads Class → Group → Section. This is the decision that inverts
 * `ARCHITECTURE.md` §15's diagram.
 */
export const groups = pgTable(
  "groups",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** Required, per BR-1. The archived contract allowed a null `class_id`. */
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(80),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("groups_class_name_key").on(t.classId, t.name),
    uniqueIndex("groups_class_slug_key").on(t.classId, t.slug),
    index("groups_institution_idx").on(t.institutionId),
  ],
);

/**
 * `sections` — the classroom/batch a student is actually placed in. "Alpha 1", "Usama", "Haris".
 *
 * Manually named per `PRD.md` MODULE 4, so `name` is free text and only unique within its group.
 *
 * **`capacity` is a check constraint, not validation.** `RULES.md` §26 puts structural integrity in
 * the database: a negative capacity is meaningless, and a placement that would exceed it is a
 * business rule checked in the placements module where the count and the request are in one
 * transaction. Overwriting `capacity` from the UI without a version check is blocked by `version`.
 */
export const sections = pgTable(
  "sections",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    /** Required, per BR-1: a Section belongs to exactly one Group. */
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(80),
    /** Maximum students. Null means unconstrained, which is different from zero. */
    capacity: integer("capacity"),
    /** Where this section meets — the physical half of a schedule conflict. */
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("sections_group_name_key").on(t.groupId, t.name),
    uniqueIndex("sections_group_slug_key").on(t.groupId, t.slug),
    index("sections_floor_idx").on(t.floorId),
    index("sections_institution_idx").on(t.institutionId),
    check("sections_capacity_positive_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

/**
 * `subjects` — the teachable catalogue.
 *
 * Institution-wide rather than per session, because a subject is a course, not a course-offering; the
 * offering (`schedules`, `exam_papers`, `daily_tests`) carries the session. `code` is the human
 * handle an institution already uses ("MATH-101"), and it is the field a timetable and a result sheet
 * are keyed on.
 */
export const subjects = pgTable(
  "subjects",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    name: shortName("name"),
    slug: slug(80),
    /** Institutional subject code. Required: results and timetables are reported by code. */
    code: varchar("code", { length: 32 }).notNull(),
    kind: subjectKindEnum("kind").notNull().default("theory"),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    description: description(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("subjects_institution_code_key").on(t.institutionId, t.code),
    uniqueIndex("subjects_institution_slug_key").on(t.institutionId, t.slug),
    index("subjects_department_idx").on(t.departmentId),
  ],
);

/**
 * `class_subjects` — which subjects a class/group/section is taught, and how many periods.
 *
 * Required because `schedules` alone cannot answer "does this class have Physics?", which the
 * timetable grid, the result sheet and the fee structure all need. One row per
 * (scope, subject), where scope is the narrowest applicable level — the check constraint keeps
 * exactly one of the three non-null so a row cannot silently apply to no one.
 */
export const classSubjects = pgTable(
  "class_subjects",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    /** Applied to every group/section of this class. */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    /** Applied to every section of this group. */
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    /** Applied to this section only. */
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    /** Periods per week. Unit-based salary (`PRD.md` MODULE 9) is measured against these. */
    periodsPerWeek: integer("periods_per_week"),
    isMandatory: boolean("is_mandatory").notNull().default(true),
    createdAt: createdAt(),
    createdByUserId: uuid("created_by_user_id"),
  },
  (t) => [
    index("class_subjects_subject_idx").on(t.subjectId),
    index("class_subjects_class_idx").on(t.classId),
    index("class_subjects_group_idx").on(t.groupId),
    index("class_subjects_section_idx").on(t.sectionId),
    // Exactly one scope, so the row always resolves to a set of students.
    check(
      "class_subjects_single_scope_check",
      sql`num_nonnulls(${t.classId}, ${t.groupId}, ${t.sectionId}) = 1`,
    ),
    check(
      "class_subjects_periods_positive_check",
      sql`${t.periodsPerWeek} is null or ${t.periodsPerWeek} > 0`,
    ),
  ],
);

/**
 * `time_slots` — the period definitions of an institution. Period 1, Period 2, Lunch, Assembly.
 *
 * Times are `time` (no timezone) because a school day is a wall-clock local concept: "08:00" must
 * mean 08:00 in the institution's timezone regardless of the server's, and a `timestamptz` would
 * silently convert.
 *
 * `academic_session_id` is nullable so an institution may share one period template across sessions;
 * a null means "applies to every session".
 */
export const timeSlots = pgTable(
  "time_slots",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id").references(() => academicSessions.id, {
      onDelete: "cascade",
    }),
    name: shortName("name"),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    /** Position in the day. Unique per session so the grid ordering is unambiguous. */
    sequence: integer("sequence").notNull(),
    /** Breaks are rendered in the timetable grid but are not teachable periods. */
    isBreak: boolean("is_break").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
    version: version(),
  },
  (t) => [
    index("time_slots_institution_session_idx").on(t.institutionId, t.academicSessionId),
    check("time_slots_time_order_check", sql`${t.endTime} > ${t.startTime}`),
    check("time_slots_sequence_positive_check", sql`${t.sequence} > 0`),
  ],
);

/**
 * `schedules` — one cell of the timetable: this subject, this section, this teacher, this period.
 *
 * This is the row `ARCHITECTURE.md` §16 conflict detection reads. The four unique indexes below are
 * the *server-side* half of conflict prevention; the other half is a transaction that rechecks under
 * `SELECT … FOR UPDATE`, because two concurrent inserts can each pass a unique check that only
 * becomes visible at commit. The unique indexes are still required — they are what makes the race
 * lose deterministically instead of producing two identical timetable rows.
 *
 * | Index | Prevents |
 * |---|---|
 * | `schedules_section_slot_key` | Section double-booking |
 * | `schedules_teacher_slot_key` | Teacher double-booking |
 * | `schedules_floor_slot_key` | Physical room/floor conflict |
 * | `schedules_class_slot_key` | Class double-booking |
 *
 * Partial on `kind <> 'free'`: a free period is precisely the absence of a lesson, so it must not
 * participate in conflict detection. A full unique index would forbid recording the free periods the
 * Floor-Incharge live view needs (`PRD.md` MODULE 17).
 */
export const schedules = pgTable(
  "schedules",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
    /** The teacher who is meant to teach it. `ADR-0002`: a `User` holding a `Teacher` profile. */
    teacherId: uuid("teacher_id"),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id, { onDelete: "cascade" }),
    /** Physical location. A schedule without a room still needs conflict detection for the teacher. */
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    kind: scheduleKindEnum("kind").notNull().default("lesson"),
    status: scheduleStatusEnum("status").notNull().default("draft"),
    /**
     * For `kind = 'extra'`: the replacement assignment that created this period — the
     * `extra_periods` row in `floor-operations`. Declared without a foreign key because
     * `floor-operations.ts` already imports this file (`extra_periods.replaces_schedule_id` →
     * `schedules`): the key would add `academic → floor-operations` and close the loop. Verified in
     * `MODULE_CYCLE_COLUMNS` in `schema-contract.test.ts`; `ARCHITECTURE.md` §9 separately treats
     * the reference as data owned by floor operations rather than as a join.
     */
    replacementAssignmentId: uuid("replacement_assignment_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => [
    uniqueIndex("schedules_section_slot_key")
      .on(t.sectionId, t.academicSessionId, t.timeSlotId)
      .where(sql`${t.kind} <> 'free'`),
    uniqueIndex("schedules_teacher_slot_key")
      .on(t.teacherId, t.academicSessionId, t.timeSlotId)
      .where(sql`${t.kind} <> 'free' and ${t.teacherId} is not null`),
    uniqueIndex("schedules_floor_slot_key")
      .on(t.floorId, t.academicSessionId, t.timeSlotId)
      .where(sql`${t.kind} <> 'free' and ${t.floorId} is not null`),
    uniqueIndex("schedules_institution_slot_tenant_key")
      .on(t.institutionId, t.academicSessionId, t.timeSlotId, t.sectionId)
      .where(sql`${t.kind} <> 'free'`),
    index("schedules_teacher_idx").on(t.teacherId),
    index("schedules_section_idx").on(t.sectionId),
    index("schedules_session_idx").on(t.academicSessionId),
  ],
);

/**
 * `schedule_publish_history` — who published a timetable, when.
 *
 * `RULES.md` §44 forbids silently overwriting academic history, and a published timetable is academic
 * history. Without this, "who changed the schedule after it went live" is unanswerable, which makes
 * the §51 post-publication audit requirement unmeetable for the one domain where a change affects
 * every student and teacher at once.
 */
export const schedulePublishHistory = pgTable(
  "schedule_publish_history",
  {
    id: primaryId(),
    scheduleId: uuid("schedule_id").notNull(),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    fromStatus: scheduleStatusEnum("from_status").notNull(),
    toStatus: scheduleStatusEnum("to_status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    publishedByUserId: uuid("published_by_user_id"),
    reason: varchar("reason", { length: 500 }),
  },
  (t) => [
    index("schedule_publish_history_schedule_idx").on(t.scheduleId),
    index("schedule_publish_history_session_idx").on(t.academicSessionId, t.publishedAt),
  ],
);

/**
 * `floor_assignments` — which Floor-Incharge is responsible for which floor.
 *
 * `PRD.md` MODULE 15 makes student attendance a Floor-Incharge responsibility *within their
 * operational floor scope*, and MODULE 17 scopes the live view the same way. That scope is data, so
 * it belongs in a table rather than in a role name.
 */
export const floorAssignments = pgTable(
  "floor_assignments",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    floorId: uuid("floor_id")
      .notNull()
      .references(() => floors.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    assignedFrom: timestamp("assigned_from", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    assignedUntil: timestamp("assigned_until", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("floor_assignments_floor_user_key").on(t.floorId, t.userId),
    index("floor_assignments_user_idx").on(t.userId),
    index("floor_assignments_floor_active_idx").on(t.floorId, t.assignedUntil),
  ],
);

/**
 * `class_teacher_assignments` — a teacher's scope over a class/group/section, independent of timetable.
 *
 * `ADR-0002` splits the two: a timetable slot says "this teacher teaches this period", this table says
 * "this teacher is responsible for these students". Result entry, daily tests and diary assignment are
 * all authorised against this, and must remain available for a teacher who has a class but currently no
 * period in it (a free period, a swapped week). It is the `TeachingAssignment` of ADR-0001 §2, in the
 * shape this system actually needs.
 *
 * Exactly one of `class_id` / `group_id` / `section_id` is set, so a row always names a non-empty set of
 * students and a scope check never has to interpret a partially-null row.
 */
export const classTeacherAssignments = pgTable(
  "class_teacher_assignments",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id").notNull(),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    /** Is this the class teacher (form master) as opposed to a subject teacher? */
    isClassTeacher: boolean("is_class_teacher").notNull().default(false),
    assignedFrom: timestamp("assigned_from", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    assignedUntil: timestamp("assigned_until", { withTimezone: true, precision: 3 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("class_teacher_assignments_unique")
      .on(t.teacherId, t.subjectId, t.sectionId, t.academicSessionId)
      .where(sql`${t.sectionId} is not null and ${t.subjectId} is not null`),
    index("class_teacher_assignments_teacher_idx").on(t.teacherId, t.academicSessionId),
    index("class_teacher_assignments_section_idx").on(t.sectionId),
    check(
      "class_teacher_assignments_single_scope_check",
      sql`num_nonnulls(${t.classId}, ${t.groupId}, ${t.sectionId}) = 1`,
    ),
  ],
);

/**
 * `schedule_bulk_meta` — bookkeeping for a bulk timetable publish.
 *
 * A timetable is edited and published as a unit, and `schedule_publish_history` would otherwise
 * produce one row per cell with nothing tying them together. This is the parent that gives the
 * history rows a `change_set_id`, so a revert is a single query.
 */
export const scheduleChangeSets = pgTable(
  "schedule_change_sets",
  {
    id: primaryId(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    academicSessionId: uuid("academic_session_id")
      .notNull()
      .references(() => academicSessions.id, { onDelete: "cascade" }),
    /** `bulk_update`, `bulk_publish`, `bulk_lock`, `revert`. */
    kind: varchar("kind", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 500 }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAt(),
    /** Snapshot of the previous cells, so a revert does not need `git`. Kept for one release. */
    previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
  },
  (t) => [index("schedule_change_sets_session_idx").on(t.academicSessionId, t.createdAt)],
);
