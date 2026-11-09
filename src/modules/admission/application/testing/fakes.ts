/**
 * An in-memory {@link AdmissionStore} (and {@link SessionGate}) for service tests.
 *
 * It mirrors the Drizzle store's observable behaviour for what the service and its tests care
 * about — unique application numbers, version-guarded writes, history appended on every transition,
 * the conversion flip — and nothing more. Where a rule lives in the *service* (the state machine,
 * the rejection reason, the open-session gate, the advisory dob veto) the fake deliberately does
 * not repeat it: a test that passed because the fake was lenient would be worse than no test.
 *
 * **Conversion atomicity is the real store's promise** (one `db.transaction`, Phase 8 completion
 * gate). The fake performs its mutation set synchronously — the observable equivalent for a test —
 * and exposes the payload it received as {@link FakeAdmissionStore.conversions} so assertions can
 * read what would have landed in `students` / `guardians` / `student_placements`.
 */
import { randomUUID } from "node:crypto";

import type { SessionView } from "@/modules/student";
import { ConflictError, NotFoundError } from "@/shared/errors";

import type { AdmissionStatus } from "../../domain/domain-rules";
import type {
  AdmissionDetail,
  AdmissionDetailRow,
  AdmissionDocumentDecision,
  AdmissionDocumentInsert,
  AdmissionDocumentRow,
  AdmissionHistoryRow,
  AdmissionInsert,
  AdmissionListRow,
  AdmissionStore,
  AdmissionUpdate,
  ConversionWrite,
  DecisionApply,
  DuplicateCandidateRow,
  SessionGate,
} from "../ports";

function nextId(): string {
  return randomUUID();
}

/** Read-model rows are `readonly`; the fake stores mutable copies behind the same shape. */
type AdmissionRecord = { -readonly [K in keyof AdmissionDetailRow]: AdmissionDetailRow[K] };
type DocumentRecord = { -readonly [K in keyof AdmissionDocumentRow]: AdmissionDocumentRow[K] };

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

export class FakeAdmissionStore implements AdmissionStore, SessionGate {
  private readonly institutions = new Set<string>();
  /** Public on purpose: tests seed rows in any status without driving every command first. */
  readonly admissions = new Map<string, AdmissionRecord>();
  readonly documents = new Map<string, DocumentRecord>();
  /** One flat array shaped like the table — filter by `admissionId` per test. */
  readonly history: AdmissionHistoryRow[] = [];
  /** Every payload handed to `convertAdmission` — the assertions conversion tests read. */
  readonly conversions: ConversionWrite[] = [];
  /** Minted student slugs this fake has been told about (the real store reads `students.slug`). */
  readonly studentSlugs = new Set<string>();
  private readonly sessions = new Map<string, SessionView>();

  /* ---- Test seams -------------------------------------------------------- */

  seedInstitution(institutionId: string): void {
    this.institutions.add(institutionId);
  }

  /** Seed a row directly; unspecified fields take a submitted application's defaults. */
  seedAdmission(
    overrides: Partial<AdmissionRecord> & { readonly institutionId: string },
  ): AdmissionRecord {
    const now = new Date("2026-10-01T09:00:00Z");
    const record: AdmissionRecord = {
      id: nextId(),
      applicationNumber: "ADM-20261001-SEED01",
      slug: "jane-doe",
      firstName: "Jane",
      middleName: null,
      lastName: "Doe",
      dateOfBirth: "2014-05-06",
      gender: "female",
      email: "jane@example.test",
      phone: null,
      address: null,
      status: "submitted",
      academicSessionId: null,
      sessionName: null,
      appliedClassId: null,
      appliedGroupId: null,
      appliedClassName: null,
      appliedGroupName: null,
      appliedGradeLevel: "5",
      studentId: null,
      testScore: null,
      interviewScore: null,
      convertedAt: null,
      decidedAt: null,
      decidedByUserId: null,
      decidedByName: null,
      decisionNotes: null,
      rejectionReason: null,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      version: 1,
      ...overrides,
    };
    this.admissions.set(record.id, record);
    return record;
  }

  seedSession(view: SessionView): SessionView {
    this.sessions.set(view.id, view);
    return view;
  }

  /* ---- SessionGate ------------------------------------------------------- */

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

  async listAdmissions(
    institutionId: string,
    status?: AdmissionStatus | null,
  ): Promise<readonly AdmissionListRow[]> {
    return [...this.admissions.values()]
      .filter((row) => row.institutionId === institutionId)
      .filter((row) => status == null || row.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAdmission(institutionId: string, admissionId: string): Promise<AdmissionDetail | null> {
    const record = this.admissions.get(admissionId);
    if (record === undefined || record.institutionId !== institutionId) return null;
    return {
      admission: record,
      documents: [...this.documents.values()].filter((doc) => doc.admissionId === admissionId),
      history: this.history.filter((row) => row.admissionId === admissionId),
    };
  }

  async listApplicationSlugs(institutionId: string): Promise<readonly string[]> {
    return [...this.admissions.values()]
      .filter((row) => row.institutionId === institutionId)
      .map((row) => row.slug);
  }

  async listStudentSlugs(_institutionId: string): Promise<readonly string[]> {
    void _institutionId;
    return [...this.studentSlugs];
  }

  async findDuplicateCandidates(
    institutionId: string,
    firstName: string,
    lastName: string,
  ): Promise<readonly DuplicateCandidateRow[]> {
    return [...this.admissions.values()]
      .filter((row) => row.institutionId === institutionId)
      .filter(
        (row) =>
          normalize(row.firstName) === normalize(firstName) &&
          normalize(row.lastName) === normalize(lastName),
      )
      .map((row) => ({
        id: row.id,
        applicationNumber: row.applicationNumber,
        status: row.status,
        firstName: row.firstName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
      }));
  }

  /* ---- Application commands --------------------------------------------- */

  async insertAdmission(values: AdmissionInsert): Promise<{ readonly id: string }> {
    const now = new Date();
    const collision = [...this.admissions.values()].some(
      (row) =>
        row.institutionId === values.institutionId &&
        row.applicationNumber === values.applicationNumber,
    );
    if (collision) {
      // What `admissions_institution_application_number_key` raises after the insert.
      throw new ConflictError("Application number already exists.", {
        userMessage: `The application number ${values.applicationNumber} is already in use — pick another or leave it blank to mint one.`,
      });
    }
    const id = nextId();
    this.admissions.set(id, {
      id,
      institutionId: values.institutionId,
      applicationNumber: values.applicationNumber,
      firstName: values.firstName,
      middleName: values.middleName,
      lastName: values.lastName,
      slug: values.slug,
      dateOfBirth: values.dateOfBirth,
      gender: values.gender,
      email: values.email,
      phone: values.phone,
      address: values.address,
      status: "submitted",
      academicSessionId: values.academicSessionId,
      sessionName: null,
      appliedClassId: values.appliedClassId,
      appliedGroupId: values.appliedGroupId,
      appliedClassName: null,
      appliedGroupName: null,
      appliedGradeLevel: values.appliedGradeLevel,
      studentId: null,
      testScore: values.testScore,
      interviewScore: values.interviewScore,
      convertedAt: null,
      decidedAt: null,
      decidedByUserId: null,
      decidedByName: null,
      decisionNotes: null,
      rejectionReason: null,
      submittedAt: values.submittedAt,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      version: 1,
    });
    this.history.push({
      id: nextId(),
      admissionId: id,
      fromStatus: null,
      toStatus: "submitted",
      changedAt: values.submittedAt,
      changedByUserId: values.changedByUserId,
      changedByName: null,
      notes: null,
    });
    return { id };
  }

  async updateAdmission(values: AdmissionUpdate): Promise<void> {
    const record = this.require(values.institutionId, values.admissionId);
    this.assertVersion(record, values.version);
    Object.assign(record, {
      firstName: values.firstName,
      middleName: values.middleName,
      lastName: values.lastName,
      dateOfBirth: values.dateOfBirth,
      gender: values.gender,
      email: values.email,
      phone: values.phone,
      address: values.address,
      academicSessionId: values.academicSessionId,
      appliedClassId: values.appliedClassId,
      appliedGroupId: values.appliedGroupId,
      appliedGradeLevel: values.appliedGradeLevel,
      testScore: values.testScore,
      interviewScore: values.interviewScore,
      updatedAt: new Date(),
    });
    record.version += 1;
  }

  async applyDecision(values: DecisionApply): Promise<void> {
    const record = this.require(values.institutionId, values.admissionId);
    this.assertVersion(record, values.version);
    const previous = record.status;
    record.status = values.to;
    record.rejectionReason = values.rejectionReason;
    record.decisionNotes = values.decisionNotes;
    if (values.decidedAt !== undefined) record.decidedAt = values.decidedAt;
    if (values.convertedAt !== undefined) record.convertedAt = values.convertedAt;
    record.updatedAt = values.now;
    record.version += 1;
    this.history.push({
      id: nextId(),
      admissionId: record.id,
      fromStatus: previous,
      toStatus: values.to,
      changedAt: values.now,
      changedByUserId: values.changedByUserId,
      changedByName: null,
      notes: values.decisionNotes,
    });
  }

  async convertAdmission(values: ConversionWrite): Promise<{ readonly studentId: string }> {
    const record = this.require(values.institutionId, values.admissionId);
    this.assertVersion(record, values.version);
    // One synchronous mutation set — the observable shape of the real store's transaction, whose
    // all-or-nothing guarantee is proven by the Drizzle store's own layer, not by this fake.
    const studentId = nextId();
    this.conversions.push({ ...values });
    this.studentSlugs.add(values.student.slug);
    record.status = "converted";
    record.studentId = studentId;
    record.convertedAt = values.now;
    record.updatedAt = values.now;
    record.version += 1;
    this.history.push({
      id: nextId(),
      admissionId: record.id,
      fromStatus: "approved",
      toStatus: "converted",
      changedAt: values.now,
      changedByUserId: values.actorUserId,
      changedByName: null,
      notes: null,
    });
    return { studentId };
  }

  /* ---- Documents --------------------------------------------------------- */

  async insertAdmissionDocument(values: AdmissionDocumentInsert): Promise<{ readonly id: string }> {
    const id = nextId();
    this.documents.set(id, {
      id,
      admissionId: values.admissionId,
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

  async decideAdmissionDocument(values: AdmissionDocumentDecision): Promise<void> {
    const document = this.documents.get(values.documentId);
    if (document === undefined || document.admissionId !== values.admissionId) {
      throw new NotFoundError("Document does not exist.");
    }
    document.status = values.status;
    document.rejectionReason = values.status === "rejected" ? values.rejectionReason : null;
    document.verifiedAt = values.status === "verified" ? values.now : null;
  }

  /* ---- Internals --------------------------------------------------------- */

  private require(institutionId: string, admissionId: string): AdmissionRecord {
    const record = this.admissions.get(admissionId);
    if (record === undefined || record.institutionId !== institutionId) {
      throw new NotFoundError("Admission application does not exist.");
    }
    return record;
  }

  /** The optimistic-concurrency guard every versioned write shares. */
  private assertVersion(record: AdmissionRecord, expected: number): void {
    if (record.version !== expected) {
      throw new ConflictError(
        `Admission application version mismatch (expected ${expected}, found ${record.version}).`,
        {
          userMessage:
            "Someone else changed this application while you had it open. Reload to see the latest state.",
        },
      );
    }
  }
}
