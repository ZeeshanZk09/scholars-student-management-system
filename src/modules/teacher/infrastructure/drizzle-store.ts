/**
 * The Drizzle implementation of {@link TeacherStore}.
 *
 * Implements data persistence for teacher profiles, teaching assignments, and teacher-subject competence.
 * Maps to `teachers`, `teacher_subjects`, and `class_teacher_assignments`.
 */
import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { db, type DbLike } from "@/db/client";
import { classTeacherAssignments, teachers, teacherSubjects, users } from "@/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import type {
  AddTeacherSubjectInput,
  CreateTeacherAssignmentInput,
  CreateTeacherInput,
  ListTeacherAssignmentsFilter,
  ListTeachersFilter,
  UpdateTeacherInput,
} from "../application/schemas";
import type {
  PaginatedResult,
  TeacherAssignmentRecord,
  TeacherRecord,
  TeacherStore,
  TeacherSubjectRecord,
} from "../application/ports";

export class DrizzleTeacherStore implements TeacherStore {
  constructor(private readonly client: DbLike = db) {}

  async getTeacher(userId: string): Promise<TeacherRecord | null> {
    const rows = await this.client
      .select()
      .from(teachers)
      .where(and(eq(teachers.userId, userId), isNull(teachers.archivedAt)))
      .limit(1);

    const row = rows[0];
    return row ? toTeacherRecord(row) : null;
  }

  async listTeachers(filter: ListTeachersFilter): Promise<PaginatedResult<TeacherRecord>> {
    const conditions = [
      eq(teachers.institutionId, filter.institutionId),
      isNull(teachers.archivedAt),
    ];

    if (filter.departmentId) {
      conditions.push(eq(teachers.departmentId, filter.departmentId));
    }

    if (filter.query) {
      const q = `%${filter.query.trim()}%`;
      conditions.push(
        or(
          ilike(teachers.firstName, q),
          ilike(teachers.lastName, q),
          ilike(teachers.employeeCode, q),
          ilike(teachers.email, q),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;

    const [countResult, rows] = await Promise.all([
      this.client
        .select({ total: count() })
        .from(teachers)
        .where(whereClause),
      this.client
        .select()
        .from(teachers)
        .where(whereClause)
        .orderBy(asc(teachers.firstName), asc(teachers.lastName))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const total = countResult[0]?.total ?? 0;

    return {
      rows: rows.map(toTeacherRecord),
      total,
      page,
      pageSize,
    };
  }

  async createTeacher(data: CreateTeacherInput): Promise<TeacherRecord> {
    try {
      let resolvedEmail = data.email?.trim();
      if (!resolvedEmail) {
        const [u] = await this.client
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, data.userId))
          .limit(1);
        resolvedEmail = u?.email;
      }
      if (!resolvedEmail) {
        throw new ValidationError("Teacher email is required.", {
          email: ["Email is required for teacher profile."],
        });
      }

      const [inserted] = await this.client
        .insert(teachers)
        .values({
          userId: data.userId,
          institutionId: data.institutionId,
          employeeCode: data.employeeCode ?? null,
          firstName: data.firstName,
          lastName: data.lastName ?? "-",
          email: resolvedEmail,
          phone: data.phone ?? null,
          departmentId: data.departmentId ?? null,
          subjectIds: data.subjectIds ?? [],
          registrationNumber: data.registrationNumber ?? null,
          qualification: data.qualification ?? null,
          maxPeriodsPerDay: data.maxPeriodsPerDay ?? null,
          bio: data.bio ?? null,
          photoUrl: data.photoUrl ?? null,
          hiredOn: data.hiredOn ?? null,
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to insert teacher record.");
      }

      return toTeacherRecord(inserted);
    } catch (error) {
      const conflict = uniqueConflictError(error);
      if (conflict) throw conflict;
      throw error;
    }
  }

  async updateTeacher(
    userId: string,
    data: UpdateTeacherInput,
    institutionId?: string,
  ): Promise<TeacherRecord> {
    try {
      const conditions = [eq(teachers.userId, userId), isNull(teachers.archivedAt)];
      if (institutionId) {
        conditions.push(eq(teachers.institutionId, institutionId));
      }

      const [updated] = await this.client
        .update(teachers)
        .set({
          employeeCode: data.employeeCode !== undefined ? data.employeeCode : undefined,
          firstName: data.firstName,
          lastName: data.lastName ?? undefined,
          email: data.email ?? undefined,
          phone: data.phone !== undefined ? data.phone : undefined,
          departmentId: data.departmentId !== undefined ? data.departmentId : undefined,
          subjectIds: data.subjectIds !== undefined ? data.subjectIds : undefined,
          registrationNumber:
            data.registrationNumber !== undefined ? data.registrationNumber : undefined,
          qualification: data.qualification !== undefined ? data.qualification : undefined,
          maxPeriodsPerDay: data.maxPeriodsPerDay !== undefined ? data.maxPeriodsPerDay : undefined,
          bio: data.bio !== undefined ? data.bio : undefined,
          photoUrl: data.photoUrl !== undefined ? data.photoUrl : undefined,
          hiredOn: data.hiredOn !== undefined ? data.hiredOn : undefined,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning();

      if (!updated) {
        throw new NotFoundError(`Teacher profile for user ${userId} not found.`, {
          userMessage: "Teacher profile not found.",
        });
      }

      return toTeacherRecord(updated);
    } catch (error) {
      const conflict = uniqueConflictError(error);
      if (conflict) throw conflict;
      throw error;
    }
  }

  async listTeacherAssignments(
    filter: ListTeacherAssignmentsFilter,
  ): Promise<readonly TeacherAssignmentRecord[]> {
    const conditions = [eq(classTeacherAssignments.institutionId, filter.institutionId)];

    if (filter.teacherId) {
      conditions.push(eq(classTeacherAssignments.teacherId, filter.teacherId));
    }
    if (filter.academicSessionId) {
      conditions.push(eq(classTeacherAssignments.academicSessionId, filter.academicSessionId));
    }
    if (filter.sectionId) {
      conditions.push(eq(classTeacherAssignments.sectionId, filter.sectionId));
    }
    if (filter.subjectId) {
      conditions.push(eq(classTeacherAssignments.subjectId, filter.subjectId));
    }

    const rows = await this.client
      .select()
      .from(classTeacherAssignments)
      .where(and(...conditions))
      .orderBy(desc(classTeacherAssignments.assignedFrom));

    return rows.map(toAssignmentRecord);
  }

  async createTeacherAssignment(
    data: CreateTeacherAssignmentInput,
  ): Promise<TeacherAssignmentRecord> {
    try {
      const [inserted] = await this.client
        .insert(classTeacherAssignments)
        .values({
          institutionId: data.institutionId,
          teacherId: data.teacherId,
          academicSessionId: data.academicSessionId,
          subjectId: data.subjectId ?? null,
          classId: data.classId ?? null,
          groupId: data.groupId ?? null,
          sectionId: data.sectionId ?? null,
          isClassTeacher: data.isClassTeacher ?? false,
          assignedFrom: data.assignedFrom,
          assignedUntil: data.assignedUntil ?? null,
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to insert teaching assignment.");
      }

      return toAssignmentRecord(inserted);
    } catch (error) {
      const conflict = uniqueConflictError(error);
      if (conflict) throw conflict;
      throw error;
    }
  }

  async deleteTeacherAssignment(assignmentId: string, institutionId?: string): Promise<void> {
    const conditions = [eq(classTeacherAssignments.id, assignmentId)];
    if (institutionId) {
      conditions.push(eq(classTeacherAssignments.institutionId, institutionId));
    }
    await this.client
      .delete(classTeacherAssignments)
      .where(and(...conditions));
  }

  async listTeacherSubjects(teacherUserId: string): Promise<readonly TeacherSubjectRecord[]> {
    const rows = await this.client
      .select()
      .from(teacherSubjects)
      .where(eq(teacherSubjects.teacherUserId, teacherUserId))
      .orderBy(asc(teacherSubjects.effectiveFrom));

    return rows.map(toSubjectRecord);
  }

  async addTeacherSubject(data: AddTeacherSubjectInput): Promise<TeacherSubjectRecord> {
    try {
      const isVerified = Boolean(data.isVerified && data.verifiedByUserId);
      const [inserted] = await this.client
        .insert(teacherSubjects)
        .values({
          teacherUserId: data.teacherUserId,
          subjectId: data.subjectId,
          isVerified,
          verifiedByUserId: isVerified ? (data.verifiedByUserId ?? null) : null,
          verifiedAt: isVerified ? new Date() : null,
          effectiveFrom: data.effectiveFrom,
          effectiveTo: data.effectiveTo ?? null,
        })
        .returning();

      if (!inserted) {
        throw new Error("Failed to insert teacher subject competence.");
      }

      return toSubjectRecord(inserted);
    } catch (error) {
      const conflict = uniqueConflictError(error);
      if (conflict) throw conflict;
      throw error;
    }
  }
}

function toTeacherRecord(row: typeof teachers.$inferSelect): TeacherRecord {
  return {
    userId: row.userId,
    institutionId: row.institutionId,
    employeeCode: row.employeeCode,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    departmentId: row.departmentId,
    subjectIds: row.subjectIds ?? [],
    registrationNumber: row.registrationNumber,
    qualification: row.qualification,
    maxPeriodsPerDay: row.maxPeriodsPerDay,
    bio: row.bio,
    photoUrl: row.photoUrl,
    hiredOn: row.hiredOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

function toAssignmentRecord(
  row: typeof classTeacherAssignments.$inferSelect,
): TeacherAssignmentRecord {
  return {
    id: row.id,
    institutionId: row.institutionId,
    teacherId: row.teacherId,
    subjectId: row.subjectId,
    classId: row.classId,
    groupId: row.groupId,
    sectionId: row.sectionId,
    academicSessionId: row.academicSessionId,
    isClassTeacher: row.isClassTeacher,
    assignedFrom: row.assignedFrom,
    assignedUntil: row.assignedUntil,
    createdAt: row.createdAt,
  };
}

function toSubjectRecord(row: typeof teacherSubjects.$inferSelect): TeacherSubjectRecord {
  return {
    teacherUserId: row.teacherUserId,
    subjectId: row.subjectId,
    isVerified: row.isVerified,
    verifiedByUserId: row.verifiedByUserId,
    verifiedAt: row.verifiedAt,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export function uniqueConflictError(error: unknown): ConflictError | undefined {
  if (!isUniqueViolation(error)) return undefined;

  const msg = error instanceof Error ? error.message : "";

  if (msg.includes("teachers_institution_code_key")) {
    return new ConflictError("A teacher with this employee code already exists.", {
      userMessage: "A teacher with this employee code already exists in this institution.",
    });
  }

  if (msg.includes("class_teacher_assignments_unique")) {
    return new ConflictError("Teaching assignment already exists for this section and subject.", {
      userMessage:
        "A teacher is already assigned to this subject and section for the active session.",
    });
  }

  if (msg.includes("teacher_subjects_pkey")) {
    return new ConflictError("Subject competence already mapped for this teacher.", {
      userMessage: "This subject competence is already mapped to this teacher.",
    });
  }

  return new ConflictError("A unique constraint was violated.", {
    userMessage: "The record conflicts with existing data in the system.",
  });
}
