/**
 * What the application layer needs from the data layer (`src/modules/README.md`: ports in,
 * Drizzle out). Nothing here imports `db`, `drizzle-orm` or a table — the service is tested
 * against `testing/fakes.ts` without a database, exactly like the student module's port.
 *
 * Two seams deserve naming:
 *
 * - **Conversion is one write.** `convertAdmission` carries already-built student-module insert
 *   shapes (types re-exported from `@/modules/student`); the *implementation* executes them plus
 *   the admission row flip inside a single transaction via `createStudentStore(tx)`. The service
 *   assembles the payload; the store guarantees atomicity (the Phase 8 completion gate).
 * - **Reads may cross, writes may not.** `listStudentSlugs` reads `students.slug` for uniqueness
 *   the same way the student store reads `academic_sessions` for the session gate — a scoped
 *   read with no write is the established pattern; every student *write* goes through the seam.
 */
import type {
  DocumentStatus,
  DocumentType,
  Gender,
  GuardianLinkSeed,
  GuardianProfileInsert,
  PreviousSchoolInsert,
  SessionView,
  StudentInsert,
} from "@/modules/student";

import type { AdmissionStatus } from "../domain/domain-rules";

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

/** One row of the admissions list, with the applied-for scope flattened for display. */
export interface AdmissionListRow {
  readonly id: string;
  readonly institutionId: string;
  readonly applicationNumber: string;
  readonly firstName: string;
  readonly middleName: string | null;
  readonly lastName: string;
  readonly dateOfBirth: string | null;
  readonly gender: Gender | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly status: AdmissionStatus;
  readonly academicSessionId: string | null;
  readonly sessionName: string | null;
  readonly appliedClassName: string | null;
  readonly appliedGroupName: string | null;
  readonly appliedGradeLevel: string | null;
  readonly studentId: string | null;
  readonly submittedAt: Date | null;
  readonly createdAt: Date;
}

/** Everything the detail page and the conversion pre-fill need, plus display names for joins. */
export interface AdmissionDetailRow extends AdmissionListRow {
  readonly slug: string;
  readonly address: string | null;
  readonly appliedClassId: string | null;
  readonly appliedGroupId: string | null;
  readonly testScore: string | null;
  readonly interviewScore: string | null;
  readonly convertedAt: Date | null;
  readonly decidedAt: Date | null;
  readonly decidedByUserId: string | null;
  readonly decidedByName: string | null;
  readonly decisionNotes: string | null;
  readonly rejectionReason: string | null;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly version: number;
}

/** One `admission_documents` row — metadata only, bytes live in the object store (ARCH §51). */
export interface AdmissionDocumentRow {
  readonly id: string;
  readonly admissionId: string;
  readonly documentType: DocumentType;
  readonly storageKey: string;
  readonly originalFileName: string | null;
  readonly status: DocumentStatus;
  readonly rejectionReason: string | null;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
}

/** One `admission_status_history` row with the actor's display name (RULES.md §51 timeline). */
export interface AdmissionHistoryRow {
  readonly id: string;
  readonly admissionId: string;
  readonly fromStatus: AdmissionStatus | null;
  readonly toStatus: AdmissionStatus;
  readonly changedAt: Date;
  readonly changedByUserId: string;
  readonly changedByName: string | null;
  readonly notes: string | null;
}

/** A same-name candidate the advisory duplicate check surfaces (never a block — domain rule). */
export interface DuplicateCandidateRow {
  readonly id: string;
  readonly applicationNumber: string;
  readonly status: AdmissionStatus;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string | null;
}

/** The detail page assembles list row + documents + history in one use case (no N+1 from RSC). */
export interface AdmissionDetail {
  readonly admission: AdmissionDetailRow;
  readonly documents: readonly AdmissionDocumentRow[];
  readonly history: readonly AdmissionHistoryRow[];
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/** The applicant half + scope of a new application. `slug` and status timestamps are service/store. */
export interface AdmissionInsert {
  readonly institutionId: string;
  readonly applicationNumber: string;
  readonly firstName: string;
  readonly middleName: string | null;
  readonly lastName: string;
  readonly slug: string;
  readonly dateOfBirth: string | null;
  readonly gender: Gender | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly academicSessionId: string | null;
  readonly appliedClassId: string | null;
  readonly appliedGroupId: string | null;
  readonly appliedGradeLevel: string | null;
  readonly testScore: string | null;
  readonly interviewScore: string | null;
  readonly submittedAt: Date;
  /** Who filed it — the actor of the initial `null → submitted` history row. */
  readonly changedByUserId: string;
}

/** Applicant/scope edits while the application is still open (before a decision freezes it). */
export interface AdmissionUpdate {
  readonly institutionId: string;
  readonly admissionId: string;
  readonly version: number;
  readonly firstName: string;
  readonly middleName: string | null;
  readonly lastName: string;
  readonly dateOfBirth: string | null;
  readonly gender: Gender | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly academicSessionId: string | null;
  readonly appliedClassId: string | null;
  readonly appliedGroupId: string | null;
  readonly appliedGradeLevel: string | null;
  readonly testScore: string | null;
  readonly interviewScore: string | null;
}

/** A status transition: version-guarded row write **and** its history row, one transaction. */
export interface DecisionApply {
  readonly institutionId: string;
  readonly admissionId: string;
  readonly version: number;
  readonly to: AdmissionStatus;
  readonly rejectionReason: string | null;
  readonly decisionNotes: string | null;
  readonly changedByUserId: string;
  readonly now: Date;
  /**
   * The once-only outcome stamps computed by the service from `admissionTimestampPatch` and
   * applied only where defined, so re-reading an old row can never move a date already recorded.
   * Explicit `| undefined` because the patch may omit a field (exactOptionalPropertyTypes).
   */
  readonly decidedAt?: Date | undefined;
  readonly convertedAt?: Date | undefined;
}

/**
 * The conversion payload (Phase 8 completion gate): every student-side write pre-assembled by the
 * service, plus the admission flip. The store wraps all of it — and the `approved → converted`
 * history row — in one transaction; any failure leaves no student, no guardian, no placement and
 * an unconverted application.
 */
export interface ConversionWrite {
  readonly institutionId: string;
  readonly admissionId: string;
  readonly version: number;
  readonly actorUserId: string;
  readonly now: Date;
  readonly student: StudentInsert;
  /** Session/section only — the store derives institution, student, reason `admission`, currency. */
  readonly placement: { readonly academicSessionId: string; readonly sectionId: string };
  /** The store supplies institution, student, session and description; `enrolledOn` is the form's. */
  readonly enrollment: {
    readonly academicYear: string;
    readonly gradeLevel: number | null;
    readonly departmentId: string | null;
    /** `YYYY-MM-DD` — the admission date the administrator confirms (task 7). */
    readonly enrolledOn: string;
  };
  /** Password already turned into a credential by the service — the store never sees plaintext. */
  readonly guardian: {
    readonly profile: GuardianProfileInsert;
    readonly link: Omit<GuardianLinkSeed, "studentId">;
  } | null;
  readonly previousSchool: Omit<PreviousSchoolInsert, "studentId"> | null;
}

export interface AdmissionDocumentInsert {
  readonly admissionId: string;
  readonly documentType: DocumentType;
  readonly storageKey: string;
  readonly originalFileName: string | null;
}

export interface AdmissionDocumentDecision {
  readonly admissionId: string;
  readonly documentId: string;
  readonly status: "verified" | "rejected";
  readonly rejectionReason: string | null;
  readonly verifiedByUserId: string | null;
  readonly now: Date;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The student module's session question, restated structurally so the Drizzle store satisfies it
 * without this port importing the student module's store — same injection shape Phase 7 uses.
 */
export interface SessionGate {
  getSession(institutionId: string, sessionId: string): Promise<SessionView | null>;
}

export interface AdmissionStore {
  /* ---- Reads ----------------------------------------------------------- */
  institutionExists(institutionId: string): Promise<boolean>;
  listAdmissions(
    institutionId: string,
    status?: AdmissionStatus | null,
  ): Promise<readonly AdmissionListRow[]>;
  getAdmission(institutionId: string, admissionId: string): Promise<AdmissionDetail | null>;
  listApplicationSlugs(institutionId: string): Promise<readonly string[]>;
  /** Read-only look at `students.slug` before conversion mints one (see header). */
  listStudentSlugs(institutionId: string): Promise<readonly string[]>;
  /** Exact normalized-name candidates; the service applies the advisory dob rule on top. */
  findDuplicateCandidates(
    institutionId: string,
    firstName: string,
    lastName: string,
  ): Promise<readonly DuplicateCandidateRow[]>;

  /* ---- Application commands -------------------------------------------- */
  insertAdmission(values: AdmissionInsert): Promise<{ readonly id: string }>;
  updateAdmission(values: AdmissionUpdate): Promise<void>;
  applyDecision(values: DecisionApply): Promise<void>;
  /** The atomic one: student + guardian + placement + enrollment + previous school + flip. */
  convertAdmission(values: ConversionWrite): Promise<{ readonly studentId: string }>;

  /* ---- Documents -------------------------------------------------------- */
  insertAdmissionDocument(values: AdmissionDocumentInsert): Promise<{ readonly id: string }>;
  decideAdmissionDocument(values: AdmissionDocumentDecision): Promise<void>;
}
