/**
 * Teacher application ports (`PRD.md` MODULE 20, `ADR-0002`).
 */
import type {
  AddTeacherSubjectInput,
  CreateTeacherAssignmentInput,
  CreateTeacherInput,
  ListTeacherAssignmentsFilter,
  ListTeachersFilter,
  UpdateTeacherInput,
} from "./schemas";

export interface TeacherRecord {
  readonly userId: string;
  readonly institutionId: string;
  readonly employeeCode: string | null;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly departmentId: string | null;
  readonly subjectIds: readonly string[];
  readonly registrationNumber: string | null;
  readonly qualification: string | null;
  readonly maxPeriodsPerDay: number | null;
  readonly bio: string | null;
  readonly photoUrl: string | null;
  readonly hiredOn: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export interface TeacherAssignmentRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly teacherId: string;
  readonly subjectId: string | null;
  readonly classId: string | null;
  readonly groupId: string | null;
  readonly sectionId: string | null;
  readonly academicSessionId: string;
  readonly isClassTeacher: boolean;
  readonly assignedFrom: Date;
  readonly assignedUntil: Date | null;
  readonly createdAt: Date;
}

export interface TeacherSubjectRecord {
  readonly teacherUserId: string;
  readonly subjectId: string;
  readonly isVerified: boolean;
  readonly verifiedByUserId: string | null;
  readonly verifiedAt: Date | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly createdAt: Date;
}

export interface TeacherPortalSummary {
  readonly profile: TeacherRecord;
  readonly assignments: readonly TeacherAssignmentRecord[];
  readonly subjects: readonly TeacherSubjectRecord[];
  readonly classCount: number;
  readonly subjectCount: number;
}

export interface PaginatedResult<T> {
  readonly rows: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface TeacherStore {
  getTeacher(userId: string): Promise<TeacherRecord | null>;
  listTeachers(filter: ListTeachersFilter): Promise<PaginatedResult<TeacherRecord>>;
  createTeacher(data: CreateTeacherInput): Promise<TeacherRecord>;
  updateTeacher(userId: string, data: UpdateTeacherInput, institutionId?: string): Promise<TeacherRecord>;
  listTeacherAssignments(filter: ListTeacherAssignmentsFilter): Promise<readonly TeacherAssignmentRecord[]>;
  createTeacherAssignment(data: CreateTeacherAssignmentInput): Promise<TeacherAssignmentRecord>;
  deleteTeacherAssignment(assignmentId: string, institutionId?: string): Promise<void>;
  listTeacherSubjects(teacherUserId: string): Promise<readonly TeacherSubjectRecord[]>;
  addTeacherSubject(data: AddTeacherSubjectInput): Promise<TeacherSubjectRecord>;
}
