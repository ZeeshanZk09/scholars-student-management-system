/**
 * What the application layer needs from the data layer (`src/modules/README.md`: ports in,
 * Drizzle out). Nothing here imports `db`, `drizzle-orm` or a table — the service depends on this
 * interface so it can be tested against `testing/fakes.ts` without a database, exactly as
 * `src/modules/academic/application/ports.ts` is.
 *
 * Every write carries the `institutionId` it was authorized against, or the row's `version`, so a
 * forged or stale call fails at the store rather than silently landing somewhere else.
 */
import type {
  DocumentStatus,
  DocumentType,
  Gender,
  GuardianContactType,
  GuardianRelationship,
  PlacementReason,
  SessionView,
  StudentLifecycle,
} from "../domain/domain-rules";

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

/** One row of the student roster, with the current placement flattened onto it. */
export interface StudentListRow {
  readonly id: string;
  readonly institutionId: string;
  readonly admissionNumber: string;
  readonly firstName: string;
  readonly middleName: string | null;
  readonly lastName: string;
  readonly slug: string;
  /** `YYYY-MM-DD`, from a `date` column — a birthday is a calendar fact (schema note). */
  readonly dateOfBirth: string | null;
  readonly gender: Gender | null;
  /** NOT NULL in the applied schema: the institution issues an address for every student. */
  readonly email: string;
  readonly phone: string | null;
  readonly address: string | null;
  readonly rollNumber: string | null;
  readonly lifecycle: StudentLifecycle;
  readonly admittedAt: Date | null;
  readonly graduatedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly version: number;
  /** From the current placement, if there is one. All three are `null` for an unplaced student. */
  readonly className: string | null;
  readonly groupName: string | null;
  readonly sectionName: string | null;
  readonly sessionName: string | null;
}

/** One placement row with the session/class names a history view shows (task 12). */
export interface PlacementRow {
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly sectionId: string;
  readonly classId: string;
  readonly isCurrent: boolean;
  readonly placedAt: Date;
  readonly placementReason: string | null;
  readonly sessionName: string;
  readonly className: string;
  readonly groupName: string;
  readonly sectionName: string;
}

/** One active or historical guardian link (tasks 4–6). */
export interface GuardianLinkRow {
  readonly guardianUserId: string;
  readonly studentId: string;
  readonly relationship: GuardianRelationship;
  readonly contactType: GuardianContactType | null;
  readonly isFeePayer: boolean;
  readonly isActive: boolean;
  readonly receivesNotifications: boolean;
  readonly linkedAt: Date;
  readonly unlinkedAt: Date | null;
  readonly unlinkReason: string | null;
  readonly guardianFirstName: string;
  readonly guardianLastName: string;
  readonly guardianEmail: string;
  readonly guardianPhone: string | null;
  readonly guardianOccupation: string | null;
}

/** A guardian as the guardians page lists them, with their children counted. */
export interface GuardianListRow {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly occupation: string | null;
  readonly address: string | null;
  readonly version: number;
  /** Active links to students of *this* institution — the scope the page is rendering. */
  readonly studentCount: number;
  readonly studentNames: readonly string[];
}

/** One enrollment event (task 11) — `(student, academic year, grade)`, unlike a placement. */
export interface EnrollmentRow {
  readonly id: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly academicYear: string;
  readonly gradeLevel: number | null;
  readonly departmentId: string | null;
  readonly departmentName: string | null;
  readonly enrolledOn: string;
  readonly description: string | null;
  readonly createdAt: Date;
}

/** Document metadata (task 10). No bytes: `storageKey` points at the object store. */
export interface DocumentRow {
  readonly id: string;
  readonly studentId: string;
  readonly documentType: DocumentType;
  readonly storageKey: string;
  readonly originalFileName: string | null;
  readonly status: DocumentStatus;
  readonly rejectionReason: string | null;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
}

/** A guardian profile row (the `guardians` table, keyed by its `users` row). */
export interface GuardianRow {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly occupation: string | null;
  readonly address: string | null;
  readonly version: number;
  readonly accountStatus: string;
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/** The identity half of a new student. The slug is minted by the service, never the caller. */
export interface StudentInsert {
  readonly institutionId: string;
  readonly admissionNumber: string;
  readonly firstName: string;
  readonly middleName: string | null;
  readonly lastName: string;
  readonly slug: string;
  readonly dateOfBirth: string | null;
  readonly gender: Gender | null;
  /** NOT NULL in the applied schema: the institution issues an address for every student. */
  readonly email: string;
  readonly phone: string | null;
  readonly address: string | null;
  readonly rollNumber: string | null;
}

/** Optimistic-concurrency update: `version` must match the row being written. */
export interface StudentUpdate extends StudentInsert {
  readonly studentId: string;
  readonly version: number;
}

/** The lifecycle write, including whichever outcome timestamps the transition implies. */
export interface LifecycleUpdate {
  readonly institutionId: string;
  readonly studentId: string;
  readonly version: number;
  readonly lifecycle: StudentLifecycle;
  readonly admittedAt?: Date;
  readonly graduatedAt?: Date;
  readonly withdrawnAt?: Date;
}

/** The archival axis, deliberately separate from `lifecycle` (decision D-4). */
export interface ArchiveUpdate {
  readonly institutionId: string;
  readonly studentId: string;
  readonly version: number;
  readonly archivedAt: Date | null;
}

export interface PlacementInsert {
  readonly institutionId: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly sectionId: string;
  readonly placementReason: PlacementReason;
  readonly isCurrent: boolean;
  /** The administrator who placed the child; `student_placements.created_by_user_id`. */
  readonly createdByUserId: string | null;
}

export interface EnrollmentInsert {
  readonly institutionId: string;
  readonly studentId: string;
  readonly academicSessionId: string;
  readonly academicYear: string;
  readonly gradeLevel: number | null;
  readonly departmentId: string | null;
  readonly enrolledOn: string;
  readonly description: string | null;
}

export interface GuardianProfileInsert {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly occupation: string | null;
  readonly address: string | null;
  /**
   * An already-hashed credential from `hashPassword` (the auth module's public surface), or `null`
   * for an account with no password yet — which is created `invited`, not `active`. The store
   * never sees a plaintext password: hashing happens in the service, before this value exists.
   */
  readonly credential: {
    readonly passwordHash: string;
    readonly algorithm: string;
    readonly parameters: Record<string, number>;
  } | null;
}

/** An optional link created in the *same transaction* as the guardian (tasks 4–6). */
export interface GuardianLinkSeed {
  readonly studentId: string;
  readonly relationship: GuardianRelationship;
  readonly contactType: GuardianContactType | null;
  readonly isFeePayer: boolean;
  readonly receivesNotifications: boolean;
}

export interface GuardianUpdate {
  readonly guardianUserId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly occupation: string | null;
  readonly address: string | null;
  readonly version: number;
}

export interface GuardianLinkInsert {
  readonly guardianUserId: string;
  readonly studentId: string;
  readonly relationship: GuardianRelationship;
  readonly contactType: GuardianContactType | null;
  readonly isFeePayer: boolean;
  readonly receivesNotifications: boolean;
}

export interface GuardianUnlink {
  readonly guardianUserId: string;
  readonly studentId: string;
  readonly reason: string | null;
}

export interface DocumentInsert {
  readonly studentId: string;
  readonly documentType: DocumentType;
  readonly storageKey: string;
  readonly originalFileName: string | null;
}

export interface DocumentDecision {
  readonly studentId: string;
  readonly documentId: string;
  readonly status: "verified" | "rejected";
  readonly rejectionReason: string | null;
  readonly verifiedByUserId: string | null;
  readonly now: Date;
}

/**
 * One `student_previous_schools` row. Phase 8's conversion writes it alongside the student it
 * belongs to (task 7), which is why the insert lives on this port even though Phase 7 never
 * offered an edit UI for it — the row is historical fact, written once at conversion.
 */
export interface PreviousSchoolInsert {
  readonly studentId: string;
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly classAttended: string | null;
  readonly tcNumber: string | null;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What `getStudent` assembles: the roster row plus everything a detail page shows, gathered in one
 * use case so the page never issues four queries of its own.
 */
export interface StudentDetail {
  readonly student: StudentListRow;
  readonly placements: readonly PlacementRow[];
  readonly enrollments: readonly EnrollmentRow[];
  readonly guardians: readonly GuardianLinkRow[];
  readonly documents: readonly DocumentRow[];
}

/**
 * The one thing this module borrows from `@/modules/academic`: whether a session exists, is open
 * and is current. Injected rather than imported so the service can be tested with an in-memory
 * fake, and so a closed session refuses a placement (`RULES.md` §44) without the student module
 * knowing anything about how sessions are stored.
 */
export interface SessionGate {
  getSession(institutionId: string, sessionId: string): Promise<SessionView | null>;
}

export interface StudentStore {
  /* ---- Reads ----------------------------------------------------------- */
  institutionExists(institutionId: string): Promise<boolean>;
  listStudents(institutionId: string): Promise<readonly StudentListRow[]>;
  getStudent(institutionId: string, studentId: string): Promise<StudentListRow | null>;
  listStudentSlugs(institutionId: string): Promise<readonly string[]>;
  listPlacements(studentId: string): Promise<readonly PlacementRow[]>;
  listEnrollments(studentId: string): Promise<readonly EnrollmentRow[]>;
  listDocuments(studentId: string): Promise<readonly DocumentRow[]>;
  listStudentGuardians(studentId: string): Promise<readonly GuardianLinkRow[]>;
  listGuardians(institutionId: string): Promise<readonly GuardianListRow[]>;
  getGuardian(guardianUserId: string): Promise<GuardianRow | null>;
  getGuardianLink(
    guardianUserId: string,
    studentId: string,
  ): Promise<{
    readonly guardianUserId: string;
    readonly studentId: string;
    readonly relationship: string;
    readonly isActive: boolean;
  } | null>;
  hasActivePrimaryGuardian(studentId: string): Promise<boolean>;
  /**
   * ADR-0004 §2 / D-9: a guardian is a person, not an institutional record — but *access* to one
   * follows `guardian_links`. True when an active link ties this guardian to a student of
   * `institutionId`; `updateGuardian` refuses to write to a person no caller's institution can
   * reach, so a forged `guardianUserId` cannot edit a sibling tenant's parent.
   */
  guardianReachable(guardianUserId: string, institutionId: string): Promise<boolean>;
  getDocument(studentId: string, documentId: string): Promise<DocumentRow | null>;

  /* ---- Student commands ------------------------------------------------ */
  insertStudent(values: StudentInsert): Promise<{ readonly id: string }>;
  updateStudent(values: StudentUpdate): Promise<void>;
  setStudentLifecycle(values: LifecycleUpdate): Promise<void>;
  archiveStudent(values: ArchiveUpdate): Promise<void>;

  /* ---- Placement & enrollment ------------------------------------------ */
  insertPlacement(values: PlacementInsert): Promise<void>;
  insertEnrollment(values: EnrollmentInsert): Promise<{ readonly id: string }>;

  /* ---- Guardians ------------------------------------------------------- */
  insertGuardianAccount(
    values: GuardianProfileInsert,
    link: GuardianLinkSeed | null,
    linkedByUserId: string | null,
  ): Promise<{ readonly userId: string }>;
  updateGuardian(values: GuardianUpdate): Promise<void>;
  insertOrReactivateLink(values: GuardianLinkInsert, linkedByUserId: string | null): Promise<void>;
  deactivateLink(values: GuardianUnlink, unlinkedByUserId: string | null): Promise<void>;

  /* ---- Documents ------------------------------------------------------- */
  insertDocument(values: DocumentInsert): Promise<{ readonly id: string }>;
  decideDocument(values: DocumentDecision): Promise<void>;

  /* ---- Historical admissions (Phase 8 conversion) ----------------------- */
  insertPreviousSchool(values: PreviousSchoolInsert): Promise<void>;
}
