/**
 * In-memory test store for teacher application service tests.
 */
import type {
  AddTeacherSubjectInput,
  CreateTeacherAssignmentInput,
  CreateTeacherInput,
  ListTeacherAssignmentsFilter,
  ListTeachersFilter,
  UpdateTeacherInput,
} from "../schemas";
import type {
  PaginatedResult,
  TeacherAssignmentRecord,
  TeacherRecord,
  TeacherStore,
  TeacherSubjectRecord,
} from "../ports";

export class FakeTeacherStore implements TeacherStore {
  private teachers: Map<string, TeacherRecord> = new Map();
  private assignments: Map<string, TeacherAssignmentRecord> = new Map();
  private subjects: TeacherSubjectRecord[] = [];

  async getTeacher(userId: string): Promise<TeacherRecord | null> {
    const teacher = this.teachers.get(userId);
    if (!teacher || teacher.archivedAt !== null) {
      return null;
    }
    return teacher;
  }

  async listTeachers(filter: ListTeachersFilter): Promise<PaginatedResult<TeacherRecord>> {
    let all = Array.from(this.teachers.values()).filter(
      (t) => t.institutionId === filter.institutionId && t.archivedAt === null,
    );

    if (filter.departmentId) {
      all = all.filter((t) => t.departmentId === filter.departmentId);
    }

    if (filter.query) {
      const q = filter.query.toLowerCase();
      all = all.filter(
        (t) =>
          t.firstName.toLowerCase().includes(q) ||
          (t.lastName?.toLowerCase().includes(q) ?? false) ||
          (t.employeeCode?.toLowerCase().includes(q) ?? false) ||
          (t.email?.toLowerCase().includes(q) ?? false),
      );
    }

    const total = all.length;
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const rows = all.slice(start, start + pageSize);

    return {
      rows,
      total,
      page,
      pageSize,
    };
  }

  async createTeacher(data: CreateTeacherInput): Promise<TeacherRecord> {
    const record: TeacherRecord = {
      userId: data.userId,
      institutionId: data.institutionId,
      employeeCode: data.employeeCode ?? null,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      departmentId: data.departmentId ?? null,
      subjectIds: data.subjectIds ?? [],
      registrationNumber: data.registrationNumber ?? null,
      qualification: data.qualification ?? null,
      maxPeriodsPerDay: data.maxPeriodsPerDay ?? null,
      bio: data.bio ?? null,
      photoUrl: data.photoUrl ?? null,
      hiredOn: data.hiredOn ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    };
    this.teachers.set(data.userId, record);
    return record;
  }

  async updateTeacher(
    userId: string,
    data: UpdateTeacherInput,
    institutionId?: string,
  ): Promise<TeacherRecord> {
    const existing = this.teachers.get(userId);
    if (!existing || (institutionId && existing.institutionId !== institutionId)) {
      throw new Error(`Teacher with userId ${userId} not found.`);
    }

    const updated: TeacherRecord = {
      ...existing,
      employeeCode: data.employeeCode !== undefined ? data.employeeCode : existing.employeeCode,
      firstName: data.firstName ?? existing.firstName,
      lastName: data.lastName !== undefined ? data.lastName : existing.lastName,
      email: data.email !== undefined ? data.email : existing.email,
      phone: data.phone !== undefined ? data.phone : existing.phone,
      departmentId: data.departmentId !== undefined ? data.departmentId : existing.departmentId,
      subjectIds: data.subjectIds !== undefined ? data.subjectIds : existing.subjectIds,
      registrationNumber:
        data.registrationNumber !== undefined
          ? data.registrationNumber
          : existing.registrationNumber,
      qualification: data.qualification !== undefined ? data.qualification : existing.qualification,
      maxPeriodsPerDay:
        data.maxPeriodsPerDay !== undefined ? data.maxPeriodsPerDay : existing.maxPeriodsPerDay,
      bio: data.bio !== undefined ? data.bio : existing.bio,
      photoUrl: data.photoUrl !== undefined ? data.photoUrl : existing.photoUrl,
      hiredOn: data.hiredOn !== undefined ? data.hiredOn : existing.hiredOn,
      updatedAt: new Date(),
    };

    this.teachers.set(userId, updated);
    return updated;
  }

  async listTeacherAssignments(
    filter: ListTeacherAssignmentsFilter,
  ): Promise<readonly TeacherAssignmentRecord[]> {
    return Array.from(this.assignments.values()).filter((a) => {
      if (a.institutionId !== filter.institutionId) return false;
      if (filter.teacherId && a.teacherId !== filter.teacherId) return false;
      if (filter.academicSessionId && a.academicSessionId !== filter.academicSessionId) return false;
      if (filter.sectionId && a.sectionId !== filter.sectionId) return false;
      if (filter.subjectId && a.subjectId !== filter.subjectId) return false;
      return true;
    });
  }

  async createTeacherAssignment(
    data: CreateTeacherAssignmentInput,
  ): Promise<TeacherAssignmentRecord> {
    const id = `assignment-${this.assignments.size + 1}`;
    const record: TeacherAssignmentRecord = {
      id,
      institutionId: data.institutionId,
      teacherId: data.teacherId,
      subjectId: data.subjectId ?? null,
      classId: data.classId ?? null,
      groupId: data.groupId ?? null,
      sectionId: data.sectionId ?? null,
      academicSessionId: data.academicSessionId,
      isClassTeacher: data.isClassTeacher ?? false,
      assignedFrom: data.assignedFrom ?? new Date(),
      assignedUntil: data.assignedUntil ?? null,
      createdAt: new Date(),
    };
    this.assignments.set(id, record);
    return record;
  }

  async deleteTeacherAssignment(assignmentId: string, institutionId?: string): Promise<void> {
    const existing = this.assignments.get(assignmentId);
    if (!existing) return;
    if (institutionId && existing.institutionId !== institutionId) return;
    this.assignments.delete(assignmentId);
  }

  async listTeacherSubjects(teacherUserId: string): Promise<readonly TeacherSubjectRecord[]> {
    return this.subjects.filter((s) => s.teacherUserId === teacherUserId);
  }

  async addTeacherSubject(data: AddTeacherSubjectInput): Promise<TeacherSubjectRecord> {
    const record: TeacherSubjectRecord = {
      teacherUserId: data.teacherUserId,
      subjectId: data.subjectId,
      isVerified: data.isVerified ?? false,
      verifiedByUserId: data.verifiedByUserId ?? null,
      verifiedAt: data.isVerified ? new Date() : null,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo ?? null,
      createdAt: new Date(),
    };
    this.subjects.push(record);
    return record;
  }
}
