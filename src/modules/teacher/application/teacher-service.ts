/**
 * Teacher application service (`PRD.md` MODULE 20, `ADR-0002`).
 */
import { NotFoundError, ValidationError } from "@/shared/errors";
import { parseOrThrow } from "@/shared/validation";
import {
  assertAssignmentDateRange,
  assertAssignmentScope,
  assertMaxPeriodsPerDay,
} from "../domain/teacher-rules";
import type {
  AddTeacherSubjectInput,
  CreateTeacherAssignmentInput,
  CreateTeacherInput,
  ListTeacherAssignmentsFilter,
  ListTeachersFilter,
  UpdateTeacherInput,
} from "./schemas";
import {
  addTeacherSubjectSchema,
  createTeacherAssignmentSchema,
  createTeacherSchema,
  listTeacherAssignmentsFilterSchema,
  listTeachersFilterSchema,
  updateTeacherSchema,
} from "./schemas";
import type {
  PaginatedResult,
  TeacherAssignmentRecord,
  TeacherPortalSummary,
  TeacherRecord,
  TeacherStore,
  TeacherSubjectRecord,
} from "./ports";

export class TeacherService {
  constructor(private readonly store: TeacherStore) {}

  async getTeacher(userId: string): Promise<TeacherRecord> {
    const teacher = await this.store.getTeacher(userId);
    if (!teacher) {
      throw new NotFoundError(`Teacher profile for user ${userId} was not found.`, {
        userMessage: "Teacher profile could not be found.",
      });
    }
    return teacher;
  }

  async listTeachers(rawFilter: ListTeachersFilter): Promise<PaginatedResult<TeacherRecord>> {
    const filter = parseOrThrow(listTeachersFilterSchema, rawFilter, "teachers filter");
    return this.store.listTeachers(filter);
  }

  async createTeacher(rawInput: CreateTeacherInput): Promise<TeacherRecord> {
    const input = parseOrThrow(createTeacherSchema, rawInput, "teacher profile");
    assertMaxPeriodsPerDay(input.maxPeriodsPerDay);
    return this.store.createTeacher(input);
  }

  async updateTeacher(
    userId: string,
    rawInput: UpdateTeacherInput,
    institutionId?: string,
  ): Promise<TeacherRecord> {
    const input = parseOrThrow(updateTeacherSchema, rawInput, "teacher profile update");
    const existing = await this.getTeacher(userId);
    if (institutionId && existing.institutionId !== institutionId) {
      throw new NotFoundError(`Teacher profile for user ${userId} was not found.`, {
        userMessage: "Teacher profile could not be found.",
      });
    }
    if (input.maxPeriodsPerDay !== undefined) {
      assertMaxPeriodsPerDay(input.maxPeriodsPerDay);
    }
    return this.store.updateTeacher(userId, input, institutionId);
  }

  async assignTeacher(rawInput: CreateTeacherAssignmentInput): Promise<TeacherAssignmentRecord> {
    const input = parseOrThrow(createTeacherAssignmentSchema, rawInput, "teacher assignment");
    assertAssignmentScope({
      classId: input.classId,
      groupId: input.groupId,
      sectionId: input.sectionId,
    });
    assertAssignmentDateRange(input.assignedFrom, input.assignedUntil);

    // Verify teacher exists, is active, and belongs to the same institution
    const teacher = await this.getTeacher(input.teacherId);
    if (teacher.institutionId !== input.institutionId) {
      throw new ValidationError("Teacher does not belong to the specified institution.", {
        teacherId: ["Teacher does not belong to this institution."],
      });
    }

    return this.store.createTeacherAssignment(input);
  }

  async removeAssignment(assignmentId: string, institutionId?: string): Promise<void> {
    if (!assignmentId || assignmentId.trim() === "") {
      throw new ValidationError("Assignment ID is required.", {
        assignmentId: ["Must not be empty."],
      });
    }
    await this.store.deleteTeacherAssignment(assignmentId, institutionId);
  }

  async listAssignments(
    rawFilter: ListTeacherAssignmentsFilter,
  ): Promise<readonly TeacherAssignmentRecord[]> {
    const filter = parseOrThrow(listTeacherAssignmentsFilterSchema, rawFilter, "teacher assignments filter");
    return this.store.listTeacherAssignments(filter);
  }

  async addCompetence(
    rawInput: AddTeacherSubjectInput,
    institutionId?: string,
  ): Promise<TeacherSubjectRecord> {
    const input = parseOrThrow(addTeacherSubjectSchema, rawInput, "teacher competence");
    const teacher = await this.getTeacher(input.teacherUserId);
    if (institutionId && teacher.institutionId !== institutionId) {
      throw new ValidationError("Teacher does not belong to the specified institution.", {
        teacherUserId: ["Teacher does not belong to this institution."],
      });
    }
    return this.store.addTeacherSubject(input);
  }

  async listCompetences(teacherUserId: string): Promise<readonly TeacherSubjectRecord[]> {
    return this.store.listTeacherSubjects(teacherUserId);
  }

  async getTeacherPortalSummary(
    teacherUserId: string,
    academicSessionId?: string,
  ): Promise<TeacherPortalSummary> {
    const profile = await this.getTeacher(teacherUserId);
    const [assignments, subjects] = await Promise.all([
      this.store.listTeacherAssignments({
        institutionId: profile.institutionId,
        teacherId: teacherUserId,
        academicSessionId,
      }),
      this.store.listTeacherSubjects(teacherUserId),
    ]);

    const distinctClasses = new Set(
      assignments.map((a) => a.classId || a.sectionId || a.groupId).filter(Boolean),
    );

    const distinctSubjects = new Set(
      [
        ...assignments.map((a) => a.subjectId).filter(Boolean),
        ...subjects.map((s) => s.subjectId),
      ],
    );

    return {
      profile,
      assignments,
      subjects,
      classCount: distinctClasses.size,
      subjectCount: distinctSubjects.size,
    };
  }
}
