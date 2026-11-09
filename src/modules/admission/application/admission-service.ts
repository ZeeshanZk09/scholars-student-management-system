/**
 * The admission module's use cases (`PHASES.md` Phase 8, tasks 1–11, 15).
 *
 * Every command does the same three things, in the same order — the student module's rhythm
 * (`../README.md` §5), so a reader who knows one module knows the other:
 *
 * 1. **Validate** the raw payload against its zod boundary schema (`parseOrThrow`), so a malformed
 *    request dies before it touches the store.
 * 2. **Check policy** against current state — the transition must be an edge of the state machine,
 *    a rejection needs a reason, conversion needs `approved` and an open session, a decided
 *    application is frozen to edits. These are pure functions in `../domain/domain-rules.ts`,
 *    tested directly.
 * 3. **Write**, letting the store's unique-violation handling turn conflicts the rules cannot
 *    foresee (an application number already minted, a slug raced) into `ConflictError`.
 *
 * Two dependencies are injected — the {@link AdmissionStore} and a {@link SessionGate} answering
 * *does this session exist and is it open?* (the student store answers it again here) — so the
 * file is testable without a database, exactly like `createStudentService`.
 *
 * **Conversion is one write.** `convert` assembles every student-side insert — student, optional
 * guardian account, placement, enrollment, previous school — plus the `approved → converted` flip
 * into a single {@link ConversionWrite}; the store executes them in one transaction. The service
 * refuses early (not convertable, closed session) so the common failures never reach a rollback;
 * the transaction guarantees the completion gate: no partial student, no half-linked guardian, no
 * converted application without its student.
 *
 * A password never appears past the instant it is hashed: `checkPassword` judges it (auth owns
 * the policy), `hashPassword` turns it into a credential, and the store only ever receives the
 * encoded result (`SECURITY.md` §23).
 */
import { checkPassword, hashPassword } from "@/modules/auth";
import { assertSessionAcceptsPlacement } from "@/modules/student";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { parseOrThrow, slugify, uniqueSlug } from "@/shared/validation";

import {
  admissionTimestampPatch,
  assertAdmissionDocumentDecision,
  assertAdmissionEditable,
  assertAdmissionTransition,
  assertConvertable,
  assertDecisionReason,
  isLikelyDuplicate,
  mintApplicationNumber,
} from "../domain/domain-rules";
import type { AdmissionStatus } from "../domain/domain-rules";
import * as s from "./schemas";
import type {
  AdmissionDetail,
  AdmissionListRow,
  AdmissionStore,
  ConversionWrite,
  DuplicateCandidateRow,
  SessionGate,
} from "./ports";

export interface CreateResult {
  readonly id: string;
}

/**
 * Who is performing a write. `userId` is `null` only where no authenticated user exists (seeds,
 * tests); a server action always supplies the session's user so history rows and document
 * decisions name a real actor — and every admission command demands one (see
 * `requireActorUserId`).
 */
export interface Actor {
  readonly userId: string | null;
}

export interface CreateAdmissionResult extends CreateResult {
  readonly applicationNumber: string;
}

export interface AdmissionService {
  /* ---- Applications (tasks 1, 2) ---------------------------------------- */
  listAdmissions(
    institutionId: string,
    status?: AdmissionStatus | null,
  ): Promise<readonly AdmissionListRow[]>;
  getAdmission(input: unknown): Promise<AdmissionDetail>;
  createAdmission(input: unknown, actor: Actor): Promise<CreateAdmissionResult>;
  updateAdmission(input: unknown): Promise<CreateResult>;

  /* ---- Decisions & conversion (tasks 10, 11, 3) -------------------------- */
  decide(input: unknown, actor: Actor): Promise<CreateResult>;
  convert(input: unknown, actor: Actor): Promise<{ readonly studentId: string }>;

  /* ---- Advisory duplicates (task 9) -------------------------------------- */
  previewDuplicates(input: unknown): Promise<readonly DuplicateCandidateRow[]>;

  /* ---- Documents (task 6) ------------------------------------------------ */
  registerDocument(input: unknown, actor: Actor): Promise<CreateResult>;
  decideDocument(input: unknown, actor: Actor): Promise<CreateResult>;
}

export function createAdmissionService(
  store: AdmissionStore,
  sessions: SessionGate,
): AdmissionService {
  /** Load an application the caller may act on, or fail with a message they can act on. */
  async function requireAdmission(
    institutionId: string,
    admissionId: string,
  ): Promise<AdmissionDetail> {
    const detail = await store.getAdmission(institutionId, admissionId);
    if (detail === null) {
      throw new NotFoundError("Admission application does not exist.", {
        userMessage: "That application is no longer available. Refresh the list and try again.",
      });
    }
    return detail;
  }

  /** The session conversion places the student into — open and belonging to the caller. */
  async function requireOpenSession(institutionId: string, sessionId: string) {
    const session = await sessions.getSession(institutionId, sessionId);
    assertSessionAcceptsPlacement(session);
    return session;
  }

  /**
   * History rows name a real actor (`admission_status_history.changed_by_user_id` is NOT NULL), so
   * a seed or test that forgot the principal fails here with a message rather than at the database.
   */
  function requireActorUserId(actor: Actor): string {
    if (actor.userId === null) {
      throw new ValidationError("An authenticated user must perform this action.", {
        actor: ["Sign in before recording this change."],
      });
    }
    return actor.userId;
  }

  return {
    async listAdmissions(institutionId, status = null) {
      return store.listAdmissions(institutionId, status);
    },

    async getAdmission(input) {
      const data = parseOrThrow(s.getAdmissionSchema, input, "admission");
      return requireAdmission(data.institutionId, data.admissionId);
    },

    async createAdmission(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.createAdmissionSchema, input, "admission");
      if (!(await store.institutionExists(data.institutionId))) {
        throw new NotFoundError("Institution does not exist.", {
          userMessage: "That institution is not available. Refresh the page and try again.",
        });
      }

      const now = new Date();
      // Blank → minted `ADM-YYYYMMDD-XXXX`; a supplied number is validated by the boundary and
      // unique per institution (the store turns a raced collision into `ConflictError`). The
      // suffix is three random bytes from the standard web crypto (available in the server
      // runtime), hex-encoded — `randomBytes` from `node:crypto` is not on the global `crypto`.
      const suffix = [...crypto.getRandomValues(new Uint8Array(3))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      const applicationNumber = data.applicationNumber ?? mintApplicationNumber(now, suffix);

      const slug = uniqueSlug(
        slugify(`${data.firstName}-${data.lastName}`),
        await store.listApplicationSlugs(data.institutionId),
      );

      const created = await store.insertAdmission({
        institutionId: data.institutionId,
        applicationNumber,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        slug,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        email: data.email,
        phone: data.phone,
        address: data.address,
        academicSessionId: data.academicSessionId,
        appliedClassId: data.appliedClassId,
        appliedGroupId: data.appliedGroupId,
        appliedGradeLevel: data.appliedGradeLevel,
        testScore: data.testScore,
        interviewScore: data.interviewScore,
        submittedAt: now,
        changedByUserId: userId,
      });
      return { id: created.id, applicationNumber };
    },

    async updateAdmission(input) {
      const data = parseOrThrow(s.updateAdmissionSchema, input, "admission");
      const current = (await requireAdmission(data.institutionId, data.admissionId)).admission;
      // Once a decision exists the record is an audit fact — the version check guards the write,
      // this guards the right to write at all.
      assertAdmissionEditable(current.status);
      await store.updateAdmission({
        institutionId: data.institutionId,
        admissionId: data.admissionId,
        version: data.version,
        firstName: data.firstName,
        middleName: data.middleName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        email: data.email,
        phone: data.phone,
        address: data.address,
        academicSessionId: data.academicSessionId,
        appliedClassId: data.appliedClassId,
        appliedGroupId: data.appliedGroupId,
        appliedGradeLevel: data.appliedGradeLevel,
        testScore: data.testScore,
        interviewScore: data.interviewScore,
      });
      return { id: data.admissionId };
    },

    async decide(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.decideAdmissionSchema, input, "admission");
      const current = (await requireAdmission(data.institutionId, data.admissionId)).admission;

      assertAdmissionTransition(current.status, data.to);
      assertDecisionReason(data.to, data.rejectionReason);

      const now = new Date();
      const patch = admissionTimestampPatch(data.to, current, now);
      await store.applyDecision({
        institutionId: data.institutionId,
        admissionId: data.admissionId,
        version: data.version,
        to: data.to,
        rejectionReason: data.rejectionReason,
        decisionNotes: data.decisionNotes,
        changedByUserId: userId,
        now,
        decidedAt: patch.decidedAt,
        convertedAt: patch.convertedAt,
      });
      return { id: data.admissionId };
    },

    async convert(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.convertAdmissionSchema, input, "admission");
      const current = (await requireAdmission(data.institutionId, data.admissionId)).admission;

      // Refuse before assembling anything: wrong status and a closed session are the two failures
      // a person can fix without a rollback.
      assertConvertable(current.status);
      await requireOpenSession(data.institutionId, data.academicSessionId);

      // The student's readable handle: minted from the name against the *student* table (the
      // store's scoped read), never reusing the admission slug — two tables, two canonicals.
      const slug = uniqueSlug(
        slugify(`${data.firstName}-${data.lastName}`),
        await store.listStudentSlugs(data.institutionId),
      );

      // The guardian section is a whole-account creation exactly like `createGuardian`: auth owns
      // the policy, the service hashes, the store never sees plaintext. The superRefine guaranteed
      // the identity quartet whenever `relationship` is set.
      let guardian: ConversionWrite["guardian"] = null;
      if (data.guardianRelationship !== null) {
        let credential: Awaited<ReturnType<typeof hashPassword>> | null = null;
        if (data.guardianPassword !== null) {
          const displayName = `${data.guardianFirstName} ${data.guardianLastName}`;
          const verdict = checkPassword(data.guardianPassword, {
            email: data.guardianEmail ?? "",
            name: displayName,
          });
          if (!verdict.ok) {
            throw new ValidationError(
              "Password does not meet the policy",
              { guardianPassword: verdict.issues.map((issue) => issue.message) },
              { userMessage: verdict.issues[0]?.message ?? "Choose a stronger password." },
            );
          }
          credential = await hashPassword(data.guardianPassword);
        }
        guardian = {
          profile: {
            firstName: data.guardianFirstName ?? "",
            lastName: data.guardianLastName ?? "",
            email: data.guardianEmail ?? "",
            phone: data.guardianPhone,
            occupation: data.guardianOccupation,
            address: data.guardianAddress,
            credential,
          },
          link: {
            relationship: data.guardianRelationship,
            contactType: data.guardianContactType,
            isFeePayer: data.guardianIsFeePayer,
            receivesNotifications: data.guardianReceivesNotifications,
          },
        };
      }

      const previousSchool =
        data.previousSchoolName !== null
          ? {
              name: data.previousSchoolName,
              address: data.previousSchoolAddress,
              phone: data.previousSchoolPhone,
              classAttended: data.previousSchoolClassAttended,
              tcNumber: data.previousSchoolTcNumber,
            }
          : null;

      const write: ConversionWrite = {
        institutionId: data.institutionId,
        admissionId: data.admissionId,
        version: data.version,
        actorUserId: userId,
        now: new Date(),
        student: {
          institutionId: data.institutionId,
          admissionNumber: data.admissionNumber,
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          slug,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          email: data.email,
          phone: data.phone,
          address: data.address,
          rollNumber: data.rollNumber,
        },
        placement: {
          academicSessionId: data.academicSessionId,
          sectionId: data.sectionId,
        },
        enrollment: {
          academicYear: data.academicYear,
          gradeLevel: data.gradeLevel,
          departmentId: data.departmentId,
          enrolledOn: data.enrolledOn,
        },
        guardian,
        previousSchool,
      };

      const created = await store.convertAdmission(write);
      return { studentId: created.studentId };
    },

    async previewDuplicates(input) {
      const data = parseOrThrow(s.previewDuplicatesSchema, input, "admission");
      const candidates = await store.findDuplicateCandidates(
        data.institutionId,
        data.firstName,
        data.lastName,
      );
      // The store already matched normalized names; the domain applies the dob veto.
      return candidates.filter((candidate) =>
        isLikelyDuplicate(
          {
            firstName: data.firstName,
            lastName: data.lastName,
            dateOfBirth: data.dateOfBirth,
          },
          candidate,
        ),
      );
    },

    async registerDocument(input, actor) {
      requireActorUserId(actor);
      const data = parseOrThrow(s.registerAdmissionDocumentSchema, input, "admission");
      const detail = await requireAdmission(data.institutionId, data.admissionId);
      // The key is minted here, never accepted: a caller who chose its own could read another
      // application's object (the student module's rule, stated for these keys too).
      const storageKey = `institutions/${detail.admission.institutionId}/admissions/${detail.admission.id}/documents/${crypto.randomUUID()}`;
      const created = await store.insertAdmissionDocument({
        admissionId: detail.admission.id,
        documentType: data.documentType,
        storageKey,
        originalFileName: data.originalFileName,
      });
      return { id: created.id };
    },

    async decideDocument(input, actor) {
      const userId = requireActorUserId(actor);
      const data = parseOrThrow(s.decideAdmissionDocumentSchema, input, "admission");
      const detail = await requireAdmission(data.institutionId, data.admissionId);
      const document = detail.documents.find((row) => row.id === data.documentId);
      if (document === undefined) {
        throw new NotFoundError("Document does not exist.", {
          userMessage: "That document is no longer attached to this application.",
        });
      }
      assertAdmissionDocumentDecision(document.status, data.decision, data.rejectionReason);
      await store.decideAdmissionDocument({
        admissionId: detail.admission.id,
        documentId: document.id,
        status: data.decision,
        rejectionReason: data.decision === "rejected" ? data.rejectionReason : null,
        verifiedByUserId: userId,
        now: new Date(),
      });
      return { id: document.id };
    },
  };
}
