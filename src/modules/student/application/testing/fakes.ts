/**
 * An in-memory {@link StudentStore} (and {@link SessionGate}) for service tests.
 *
 * It mirrors the Drizzle store's observable behaviour for the shapes the service and its tests
 * care about — version-guarded writes, the append-only placement with one `is_current` row, the
 * guardian account's `users` + `guardians` pair, the single-active-primary link — and nothing more.
 *
 * Where a rule lives in the *service* (the lifecycle state machine, the open-session check, the
 * primary-contact refusal) the fake deliberately does not repeat it: a test that passed because the
 * fake was lenient would be worse than no test.
 */
import { randomUUID } from "node:crypto";

import { ConflictError, NotFoundError } from "@/shared/errors";

import type {
  ArchiveUpdate,
  DocumentDecision,
  DocumentInsert,
  DocumentRow,
  EnrollmentInsert,
  EnrollmentRow,
  GuardianLinkInsert,
  GuardianLinkRow,
  GuardianLinkSeed,
  GuardianListRow,
  GuardianProfileInsert,
  GuardianRow,
  GuardianUnlink,
  GuardianUpdate,
  LifecycleUpdate,
  PlacementInsert,
  PlacementRow,
  PreviousSchoolInsert,
  SessionGate,
  StudentDetail,
  StudentInsert,
  StudentListRow,
  StudentStore,
  StudentUpdate,
} from "../ports";
import type {
  GuardianContactType,
  GuardianRelationship,
  SessionView,
} from "../../domain/domain-rules";

function nextId(): string {
  return randomUUID();
}

type StudentRecord = StudentListRow;

/** A placement row with mutable fields: the fake demotes `isCurrent` in place, like the update. */
interface PlacementRecord {
  studentId: string;
  academicSessionId: string;
  sectionId: string;
  classId: string;
  isCurrent: boolean;
  placedAt: Date;
  placementReason: string | null;
  sessionName: string;
  className: string;
  groupName: string;
  sectionName: string;
}

interface LinkRecord {
  guardianUserId: string;
  studentId: string;
  relationship: GuardianRelationship;
  contactType: GuardianContactType | null;
  isFeePayer: boolean;
  isActive: boolean;
  receivesNotifications: boolean;
  linkedAt: Date;
  linkedByUserId: string | null;
  unlinkedAt: Date | null;
  unlinkedByUserId: string | null;
  unlinkReason: string | null;
}

interface SectionSeed {
  id: string;
  classId: string;
  institutionId: string;
  academicSessionId: string;
  className: string;
  groupName: string;
  sectionName: string;
}

type SessionSeed = SessionView;

interface GuardianRecord {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  occupation: string | null;
  address: string | null;
  version: number;
  accountStatus: string;
}

export class FakeStudentStore implements StudentStore, SessionGate {
  private readonly institutions = new Set<string>();
  private readonly students = new Map<string, StudentRecord>();
  private readonly placements: PlacementRecord[] = [];
  private readonly enrollments: EnrollmentRow[] = [];
  private readonly documents = new Map<string, DocumentRow>();
  private readonly guardians = new Map<string, GuardianRecord>();
  private readonly links = new Map<string, LinkRecord>();
  private readonly sections = new Map<string, SectionSeed>();
  private readonly sessions = new Map<string, SessionSeed>();
  /** Public on purpose: Phase 8's conversion tests assert what landed. */
  readonly previousSchools: PreviousSchoolInsert[] = [];

  /* ---- Test setup ------------------------------------------------------- */

  seedInstitution(institutionId: string): string {
    this.institutions.add(institutionId);
    return institutionId;
  }

  seedStudent(input: Partial<StudentRecord> & { institutionId: string }): StudentRecord {
    const record: StudentRecord = {
      id: input.id ?? nextId(),
      institutionId: input.institutionId,
      admissionNumber: input.admissionNumber ?? `ADM-${this.students.size + 1}`,
      firstName: input.firstName ?? "Amina",
      middleName: input.middleName ?? null,
      lastName: input.lastName ?? "Khan",
      slug: input.slug ?? `amina-khan-${this.students.size + 1}`,
      dateOfBirth: input.dateOfBirth ?? null,
      gender: input.gender ?? null,
      email: input.email ?? "amina@example.edu",
      phone: input.phone ?? null,
      address: input.address ?? null,
      rollNumber: input.rollNumber ?? null,
      lifecycle: input.lifecycle ?? "admitted",
      admittedAt: input.admittedAt ?? null,
      graduatedAt: input.graduatedAt ?? null,
      withdrawnAt: input.withdrawnAt ?? null,
      createdAt: input.createdAt ?? new Date("2026-01-01T00:00:00Z"),
      updatedAt: input.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
      archivedAt: input.archivedAt ?? null,
      version: input.version ?? 1,
      className: input.className ?? null,
      groupName: input.groupName ?? null,
      sectionName: input.sectionName ?? null,
      sessionName: input.sessionName ?? null,
    };
    this.students.set(record.id, record);
    this.institutions.add(record.institutionId);
    return record;
  }

  seedGuardian(input: Partial<GuardianRecord> & { email: string }): GuardianRecord {
    const record: GuardianRecord = {
      userId: input.userId ?? nextId(),
      firstName: input.firstName ?? "Sadia",
      lastName: input.lastName ?? "Rahman",
      email: input.email,
      phone: input.phone ?? null,
      occupation: input.occupation ?? null,
      address: input.address ?? null,
      version: input.version ?? 1,
      accountStatus: input.accountStatus ?? "active",
    };
    this.guardians.set(record.userId, record);
    return record;
  }

  seedSection(seed: SectionSeed): void {
    this.sections.set(seed.id, seed);
  }

  seedSession(seed: SessionSeed): void {
    this.sessions.set(seed.id, seed);
  }

  /** The raw link row, for assertions that do not want to go through the read model. */
  rawLink(guardianUserId: string, studentId: string): LinkRecord | undefined {
    return this.links.get(`${guardianUserId}:${studentId}`);
  }

  /* ---- SessionGate ------------------------------------------------------ */

  async getSession(institutionId: string, sessionId: string): Promise<SessionView | null> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return null;
    // The gate answers for one institution; a seeded session is treated as belonging to whichever
    // institution asks (the real store's tenant guard is exercised in its own layer).
    void institutionId;
    return session;
  }

  /* ---- Reads ------------------------------------------------------------ */

  async institutionExists(institutionId: string): Promise<boolean> {
    return this.institutions.has(institutionId);
  }

  async listStudents(institutionId: string): Promise<readonly StudentListRow[]> {
    return [...this.students.values()]
      .filter((row) => row.institutionId === institutionId)
      .sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      );
  }

  async getStudent(institutionId: string, studentId: string): Promise<StudentListRow | null> {
    const row = this.students.get(studentId);
    if (row === undefined || row.institutionId !== institutionId) return null;
    return row;
  }

  async listStudentSlugs(institutionId: string): Promise<readonly string[]> {
    return [...this.students.values()]
      .filter((row) => row.institutionId === institutionId)
      .map((row) => row.slug);
  }

  async listPlacements(studentId: string): Promise<readonly PlacementRow[]> {
    return this.placements.filter((row) => row.studentId === studentId);
  }

  async listEnrollments(studentId: string): Promise<readonly EnrollmentRow[]> {
    return this.enrollments.filter((row) => row.studentId === studentId);
  }

  async listDocuments(studentId: string): Promise<readonly DocumentRow[]> {
    return [...this.documents.values()].filter((row) => row.studentId === studentId);
  }

  async listStudentGuardians(studentId: string): Promise<readonly GuardianLinkRow[]> {
    return [...this.links.values()]
      .filter((row) => row.studentId === studentId)
      .map((row) => this.toLinkRow(row));
  }

  async listGuardians(institutionId: string): Promise<readonly GuardianListRow[]> {
    const linked = [...this.links.values()].filter((row) => {
      if (!row.isActive) return false;
      const student = this.students.get(row.studentId);
      return student !== undefined && student.institutionId === institutionId;
    });
    const byGuardian = new Map<string, string[]>();
    for (const link of linked) {
      const student = this.students.get(link.studentId);
      if (student === undefined) continue;
      const name = `${student.firstName} ${student.lastName}`;
      byGuardian.set(link.guardianUserId, [...(byGuardian.get(link.guardianUserId) ?? []), name]);
    }
    return [...this.guardians.values()]
      .filter((guardian) => byGuardian.has(guardian.userId))
      .map((guardian) => ({
        userId: guardian.userId,
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        email: guardian.email,
        phone: guardian.phone,
        occupation: guardian.occupation,
        address: guardian.address,
        version: guardian.version,
        studentCount: byGuardian.get(guardian.userId)?.length ?? 0,
        studentNames: [...(byGuardian.get(guardian.userId) ?? [])].sort((a, b) =>
          a.localeCompare(b),
        ),
      }));
  }

  async getGuardian(guardianUserId: string): Promise<GuardianRow | null> {
    const guardian = this.guardians.get(guardianUserId);
    if (guardian === undefined) return null;
    return { ...guardian };
  }

  async getGuardianLink(guardianUserId: string, studentId: string) {
    const link = this.links.get(`${guardianUserId}:${studentId}`);
    if (link === undefined) return null;
    return {
      guardianUserId: link.guardianUserId,
      studentId: link.studentId,
      relationship: link.relationship,
      isActive: link.isActive,
    };
  }

  async hasActivePrimaryGuardian(studentId: string): Promise<boolean> {
    return [...this.links.values()].some(
      (link) => link.studentId === studentId && link.isActive && link.contactType === "primary",
    );
  }

  async guardianReachable(guardianUserId: string, institutionId: string): Promise<boolean> {
    return [...this.links.values()].some((link) => {
      if (link.guardianUserId !== guardianUserId || !link.isActive) return false;
      return this.students.get(link.studentId)?.institutionId === institutionId;
    });
  }

  async getDocument(studentId: string, documentId: string): Promise<DocumentRow | null> {
    const document = this.documents.get(documentId);
    if (document === undefined || document.studentId !== studentId) return null;
    return document;
  }

  /* ---- Student commands -------------------------------------------------- */

  async insertStudent(values: StudentInsert): Promise<{ readonly id: string }> {
    const record = this.seedStudent({ ...values, id: nextId() });
    return { id: record.id };
  }

  async updateStudent(values: StudentUpdate): Promise<void> {
    const current = this.students.get(values.studentId);
    if (current === undefined || current.version !== values.version) {
      throw new ConflictError("This student was changed by someone else.", {
        userMessage: "Refresh the page and try again.",
      });
    }
    this.students.set(values.studentId, {
      ...current,
      admissionNumber: values.admissionNumber,
      firstName: values.firstName,
      middleName: values.middleName,
      lastName: values.lastName,
      dateOfBirth: values.dateOfBirth,
      gender: values.gender,
      email: values.email,
      phone: values.phone,
      address: values.address,
      rollNumber: values.rollNumber,
      version: current.version + 1,
      updatedAt: new Date(),
    });
  }

  async setStudentLifecycle(values: LifecycleUpdate): Promise<void> {
    const current = this.students.get(values.studentId);
    if (current === undefined || current.version !== values.version) {
      throw new ConflictError("This student was changed by someone else.", {
        userMessage: "Refresh the page and try again.",
      });
    }
    this.students.set(values.studentId, {
      ...current,
      lifecycle: values.lifecycle,
      admittedAt: values.admittedAt ?? current.admittedAt,
      graduatedAt: values.graduatedAt ?? current.graduatedAt,
      withdrawnAt: values.withdrawnAt ?? current.withdrawnAt,
      version: current.version + 1,
      updatedAt: new Date(),
    });
  }

  async archiveStudent(values: ArchiveUpdate): Promise<void> {
    const current = this.students.get(values.studentId);
    if (current === undefined || current.version !== values.version) {
      throw new ConflictError("This student was changed by someone else.", {
        userMessage: "Refresh the page and try again.",
      });
    }
    this.students.set(values.studentId, {
      ...current,
      archivedAt: values.archivedAt,
      version: current.version + 1,
      updatedAt: new Date(),
    });
  }

  /* ---- Placement & enrollment -------------------------------------------- */

  async insertPlacement(input: PlacementInsert): Promise<void> {
    const student = this.students.get(input.studentId);
    if (student === undefined || student.institutionId !== input.institutionId) {
      throw new NotFoundError("The selected student could not be found.");
    }
    const section = this.sections.get(input.sectionId);
    if (section === undefined || section.institutionId !== input.institutionId) {
      throw new NotFoundError("The selected section could not be found.");
    }
    if (section.academicSessionId !== input.academicSessionId) {
      throw new NotFoundError("The selected class does not belong to this academic session.");
    }
    if (
      this.placements.some(
        (row) =>
          row.studentId === input.studentId && row.academicSessionId === input.academicSessionId,
      )
    ) {
      throw new ConflictError("A placement already exists for this session.", {
        userMessage: "This student is already placed in a section for that session.",
      });
    }
    if (input.isCurrent) {
      for (const row of this.placements) {
        if (row.studentId === input.studentId && row.isCurrent) row.isCurrent = false;
      }
    }
    const session = this.sessions.get(input.academicSessionId);
    this.placements.push({
      studentId: input.studentId,
      academicSessionId: input.academicSessionId,
      sectionId: input.sectionId,
      classId: section.classId,
      isCurrent: input.isCurrent,
      placedAt: new Date(),
      placementReason: input.placementReason,
      sessionName: session?.name ?? "Session",
      className: section.className,
      groupName: section.groupName,
      sectionName: section.sectionName,
    });
    this.students.set(input.studentId, {
      ...student,
      className: input.isCurrent ? section.className : student.className,
      groupName: input.isCurrent ? section.groupName : student.groupName,
      sectionName: input.isCurrent ? section.sectionName : student.sectionName,
      sessionName: input.isCurrent ? (session?.name ?? student.sessionName) : student.sessionName,
    });
  }

  async insertEnrollment(input: EnrollmentInsert): Promise<{ readonly id: string }> {
    const duplicate = this.enrollments.some(
      (row) =>
        row.studentId === input.studentId &&
        row.academicYear === input.academicYear &&
        row.gradeLevel === input.gradeLevel,
    );
    if (duplicate) {
      throw new ConflictError("This enrollment is already recorded.", {
        userMessage: "An enrollment for this student, year and grade already exists.",
      });
    }
    const id = nextId();
    this.enrollments.push({
      id,
      studentId: input.studentId,
      academicSessionId: input.academicSessionId,
      academicYear: input.academicYear,
      gradeLevel: input.gradeLevel,
      departmentId: input.departmentId,
      departmentName: null,
      enrolledOn: input.enrolledOn,
      description: input.description,
      createdAt: new Date(),
    });
    return { id };
  }

  /* ---- Guardians ---------------------------------------------------------- */

  async insertGuardianAccount(
    values: GuardianProfileInsert,
    link: GuardianLinkSeed | null,
    linkedByUserId: string | null,
  ): Promise<{ readonly userId: string }> {
    if ([...this.guardians.values()].some((row) => row.email === values.email)) {
      throw new ConflictError("An account with this e-mail already exists.", {
        userMessage: `An account already exists for ${values.email}.`,
      });
    }
    if (
      values.phone !== null &&
      [...this.guardians.values()].some((row) => row.phone === values.phone)
    ) {
      throw new ConflictError("Another guardian already uses this phone number.", {
        userMessage: "Another guardian already uses this phone number.",
      });
    }
    const userId = nextId();
    this.guardians.set(userId, {
      userId,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      occupation: values.occupation,
      address: values.address,
      version: 1,
      accountStatus: values.credential === null ? "invited" : "active",
    });
    if (link !== null) {
      if (await this.hasActivePrimaryGuardian(link.studentId)) {
        if (link.contactType === "primary") {
          throw new ConflictError("A primary guardian is already set.", {
            userMessage: "This student already has a primary guardian.",
          });
        }
      }
      this.links.set(`${userId}:${link.studentId}`, {
        guardianUserId: userId,
        studentId: link.studentId,
        relationship: link.relationship,
        contactType: link.contactType,
        isFeePayer: link.isFeePayer,
        isActive: true,
        receivesNotifications: link.receivesNotifications,
        linkedAt: new Date(),
        linkedByUserId,
        unlinkedAt: null,
        unlinkedByUserId: null,
        unlinkReason: null,
      });
    }
    return { userId };
  }

  async updateGuardian(values: GuardianUpdate): Promise<void> {
    const current = this.guardians.get(values.guardianUserId);
    if (current === undefined) {
      throw new NotFoundError("The guardian could not be found.");
    }
    if (current.version !== values.version) {
      throw new ConflictError("This guardian was changed by someone else.", {
        userMessage: "Refresh the page and try again.",
      });
    }
    this.guardians.set(values.guardianUserId, {
      ...current,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      occupation: values.occupation,
      address: values.address,
      version: current.version + 1,
    });
  }

  async insertOrReactivateLink(
    values: GuardianLinkInsert,
    linkedByUserId: string | null,
  ): Promise<void> {
    const key = `${values.guardianUserId}:${values.studentId}`;
    const existing = this.links.get(key);
    if (existing !== undefined && existing.isActive) {
      throw new ConflictError("This guardian is already linked to this student.", {
        userMessage: "This guardian is already linked to this student.",
      });
    }
    if (
      values.contactType === "primary" &&
      (await this.hasActivePrimaryGuardian(values.studentId))
    ) {
      throw new ConflictError("A primary guardian is already set.", {
        userMessage: "This student already has a primary guardian.",
      });
    }
    if (existing !== undefined) {
      this.links.set(key, {
        ...existing,
        relationship: values.relationship,
        contactType: values.contactType,
        isFeePayer: values.isFeePayer,
        receivesNotifications: values.receivesNotifications,
        isActive: true,
        linkedAt: new Date(),
        linkedByUserId,
        unlinkedAt: null,
        unlinkedByUserId: null,
        unlinkReason: null,
      });
      return;
    }
    this.links.set(key, {
      guardianUserId: values.guardianUserId,
      studentId: values.studentId,
      relationship: values.relationship,
      contactType: values.contactType,
      isFeePayer: values.isFeePayer,
      isActive: true,
      receivesNotifications: values.receivesNotifications,
      linkedAt: new Date(),
      linkedByUserId,
      unlinkedAt: null,
      unlinkedByUserId: null,
      unlinkReason: null,
    });
  }

  async deactivateLink(values: GuardianUnlink, unlinkedByUserId: string | null): Promise<void> {
    const key = `${values.guardianUserId}:${values.studentId}`;
    const existing = this.links.get(key);
    if (existing === undefined || !existing.isActive) {
      throw new NotFoundError("The guardian link could not be found.");
    }
    this.links.set(key, {
      ...existing,
      isActive: false,
      unlinkedAt: new Date(),
      unlinkedByUserId,
      unlinkReason: values.reason,
    });
  }

  /* ---- Documents ------------------------------------------------------------ */

  async insertDocument(values: DocumentInsert): Promise<{ readonly id: string }> {
    const id = nextId();
    this.documents.set(id, {
      id,
      studentId: values.studentId,
      documentType: values.documentType,
      storageKey: values.storageKey,
      originalFileName: values.originalFileName,
      status: "pending_verification",
      rejectionReason: null,
      verifiedAt: null,
      createdAt: new Date(),
    });
    return { id };
  }

  async decideDocument(values: DocumentDecision): Promise<void> {
    const current = this.documents.get(values.documentId);
    if (current === undefined || current.studentId !== values.studentId) {
      throw new NotFoundError("The document could not be found.");
    }
    this.documents.set(values.documentId, {
      ...current,
      status: values.status,
      rejectionReason: values.status === "rejected" ? values.rejectionReason : null,
      verifiedAt: values.status === "verified" ? values.now : null,
    });
  }

  async insertPreviousSchool(values: PreviousSchoolInsert): Promise<void> {
    this.previousSchools.push(values);
  }

  private toLinkRow(link: LinkRecord): GuardianLinkRow {
    const guardian = this.guardians.get(link.guardianUserId);
    return {
      guardianUserId: link.guardianUserId,
      studentId: link.studentId,
      relationship: link.relationship,
      contactType: link.contactType,
      isFeePayer: link.isFeePayer,
      isActive: link.isActive,
      receivesNotifications: link.receivesNotifications,
      linkedAt: link.linkedAt,
      unlinkedAt: link.unlinkedAt,
      unlinkReason: link.unlinkReason,
      guardianFirstName: guardian?.firstName ?? "",
      guardianLastName: guardian?.lastName ?? "",
      guardianEmail: guardian?.email ?? "",
      guardianPhone: guardian?.phone ?? null,
      guardianOccupation: guardian?.occupation ?? null,
    };
  }
}

/** Re-exported so a test can type a detail without importing `ports` twice. */
export type { StudentDetail };
