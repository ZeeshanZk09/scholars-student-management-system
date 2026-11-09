/**
 * The student module's use cases (tasks 1–13, 15: profiles, guardians, placement, documents).
 *
 * Every command does the same three things, in the same order:
 *
 * 1. **Validate** the raw form payload against its zod boundary schema (`parseOrThrow`), so a
 *    malformed request dies before it touches the store.
 * 2. **Check policy** against current state — a lifecycle change must be an edge of the state
 *    machine (`DOMAIN-MODEL.md` §3), a placement needs an open session (`RULES.md` §44), a student
 *    may have one active primary guardian (`guardian_links_one_primary_key`). These rules are pure
 *    functions in `../domain/domain-rules.ts`, tested directly.
 * 3. **Write**, letting the store's unique-violation handling turn the conflicts the rules cannot
 *    foresee (a duplicate admission number, a phone number already held by another guardian) into
 *    `ConflictError`.
 *
 * Two dependencies are injected rather than reached for, so the whole file is testable without a
 * database: the {@link StudentStore} itself, and a {@link SessionGate} that answers the one
 * question this module asks of `@/modules/academic` — *does this session exist and is it open?*
 *
 * A password never appears here as plaintext beyond the instant it is hashed: `checkPassword`
 * judges it (the auth module owns the policy), `hashPassword` turns it into a credential, and the
 * store only ever receives the encoded result (`SECURITY.md` §23).
 */
import { checkPassword, hashPassword } from "@/modules/auth";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { parseOrThrow } from "@/shared/validation";
import { slugify, uniqueSlug } from "@/shared/validation";

import type { GuardianContactType, GuardianRelationship } from "../domain/domain-rules";
import {
  assertDocumentDecision,
  assertLifecycleTransition,
  assertLinkIsActive,
  assertNotAlreadyLinked,
  assertPrimaryContactFree,
  assertSessionAcceptsPlacement,
  assertStudentExists,
  lifecycleTimestampPatch,
} from "../domain/domain-rules";
import * as s from "./schemas";
import type {
  GuardianListRow,
  GuardianRow,
  PlacementRow,
  SessionGate,
  StudentDetail,
  StudentListRow,
  StudentStore,
} from "./ports";

export interface CreateResult {
  readonly id: string;
}

/**
 * Who is performing a write. `userId` is `null` only where no authenticated user exists (seeds,
 * tests); a server action always supplies the session's user so `created_by_user_id`,
 * `linked_by_user_id` and `verified_by_user_id` name a real actor.
 */
export interface Actor {
  readonly userId: string | null;
}

export interface StudentService {
  /* ---- Roster & detail (tasks 1, 7–12) --------------------------------- */
  listStudents(institutionId: string): Promise<readonly StudentListRow[]>;
  getStudent(institutionId: string, studentId: string): Promise<StudentDetail>;

  /* ---- Profile (tasks 2, 7, 8, 9) --------------------------------------- */
  createStudent(input: unknown): Promise<CreateResult>;
  updateStudent(input: unknown): Promise<CreateResult>;
  setStudentLifecycle(input: unknown): Promise<CreateResult>;
  archiveStudent(input: unknown): Promise<CreateResult>;
  unarchiveStudent(input: unknown): Promise<CreateResult>;

  /* ---- Placement & enrollment (tasks 11, 12) ----------------------------- */
  placeStudent(input: unknown, actor: Actor): Promise<CreateResult>;
  enrollStudent(input: unknown, actor: Actor): Promise<CreateResult>;

  /* ---- Guardians (tasks 4–6, 15–16) ------------------------------------- */
  listGuardians(institutionId: string): Promise<readonly GuardianListRow[]>;
  getGuardian(guardianUserId: string): Promise<GuardianRow>;
  createGuardian(input: unknown, actor: Actor): Promise<CreateResult>;
  updateGuardian(input: unknown): Promise<CreateResult>;
  linkGuardian(input: unknown, actor: Actor): Promise<CreateResult>;
  unlinkGuardian(input: unknown, actor: Actor): Promise<CreateResult>;

  /* ---- Documents (task 10) ---------------------------------------------- */
  registerDocument(input: unknown, actor: Actor): Promise<CreateResult>;
  decideDocument(input: unknown, actor: Actor): Promise<CreateResult>;
}

export function createStudentService(store: StudentStore, sessions: SessionGate): StudentService {
  /** Load a student the caller is allowed to touch, or fail with a message they can act on. */
  async function requireStudent(institutionId: string, studentId: string) {
    const student = await store.getStudent(institutionId, studentId);
    assertStudentExists(student);
    return student;
  }

  async function requireGuardian(guardianUserId: string): Promise<GuardianRow> {
    const guardian = await store.getGuardian(guardianUserId);
    if (guardian === null) {
      throw new NotFoundError("Guardian does not exist.", {
        userMessage: "That guardian is no longer available. Refresh the page and try again.",
      });
    }
    return guardian;
  }

  /** The session a placement or enrollment is written into, open and belonging to the caller. */
  async function requireOpenSession(institutionId: string, sessionId: string) {
    const session = await sessions.getSession(institutionId, sessionId);
    assertSessionAcceptsPlacement(session);
    return session;
  }

  /** Refuse writes against a record that has been removed from day-to-day use (D-4). */
  function assertNotArchived(student: StudentListRow): void {
    if (student.archivedAt !== null) {
      throw new ValidationError("Student is archived.", {
        studentId: ["This student's record is archived. Restore it before changing it."],
      });
    }
  }

  return {
    async listStudents(institutionId) {
      return store.listStudents(institutionId);
    },

    async getStudent(institutionId, studentId) {
      const student = await requireStudent(institutionId, studentId);
      const [placements, enrollments, guardians, documents] = await Promise.all([
        store.listPlacements(student.id),
        store.listEnrollments(student.id),
        store.listStudentGuardians(student.id),
        store.listDocuments(student.id),
      ]);
      return { student, placements, enrollments, guardians, documents } satisfies StudentDetail;
    },

    /* ---- Profile ------------------------------------------------------- */

    async createStudent(input) {
      const data = parseOrThrow(s.createStudentSchema, input, "student");
      if (!(await store.institutionExists(data.institutionId))) {
        throw new NotFoundError("Institution does not exist.", {
          userMessage: "That institution is not available. Refresh the page and try again.",
        });
      }
      // `?student=` routes address the row by id, so the slug exists only as a readable canonical
      // reference — minted once here and deliberately left stable when the name is corrected.
      const slug = uniqueSlug(
        slugify(`${data.firstName}-${data.lastName}`),
        await store.listStudentSlugs(data.institutionId),
      );
      const created = await store.insertStudent({ ...data, slug });
      return { id: created.id };
    },

    async updateStudent(input) {
      const data = parseOrThrow(s.updateStudentSchema, input, "student");
      const current = await requireStudent(data.institutionId, data.studentId);
      assertNotArchived(current);
      await store.updateStudent({ ...data, slug: current.slug });
      return { id: data.studentId };
    },

    async setStudentLifecycle(input) {
      const data = parseOrThrow(s.setStudentLifecycleSchema, input, "student status");
      const current = await requireStudent(data.institutionId, data.studentId);
      const displayName = `${current.firstName} ${current.lastName}`;
      assertLifecycleTransition(current.lifecycle, data.lifecycle, displayName);
      await store.setStudentLifecycle({
        institutionId: data.institutionId,
        studentId: data.studentId,
        version: current.version,
        lifecycle: data.lifecycle,
        ...lifecycleTimestampPatch(data.lifecycle, current, new Date()),
      });
      return { id: data.studentId };
    },

    async archiveStudent(input) {
      const data = parseOrThrow(s.archiveStudentSchema, input, "student archive");
      const current = await requireStudent(data.institutionId, data.studentId);
      if (current.archivedAt !== null) {
        throw new ValidationError("Student is already archived.", {
          studentId: ["This record is already archived."],
        });
      }
      await store.archiveStudent({
        institutionId: data.institutionId,
        studentId: data.studentId,
        version: current.version,
        archivedAt: new Date(),
      });
      return { id: data.studentId };
    },

    async unarchiveStudent(input) {
      const data = parseOrThrow(s.unarchiveStudentSchema, input, "student restore");
      const current = await requireStudent(data.institutionId, data.studentId);
      if (current.archivedAt === null) {
        throw new ValidationError("Student is not archived.", {
          studentId: ["This record is not archived."],
        });
      }
      await store.archiveStudent({
        institutionId: data.institutionId,
        studentId: data.studentId,
        version: current.version,
        archivedAt: null,
      });
      return { id: data.studentId };
    },

    /* ---- Placement & enrollment ----------------------------------------- */

    async placeStudent(input, actor) {
      const data = parseOrThrow(s.placeStudentSchema, input, "placement");
      const student = await requireStudent(data.institutionId, data.studentId);
      assertNotArchived(student);
      const session = await requireOpenSession(data.institutionId, data.academicSessionId);
      // The row mirrors `academic_sessions.is_current` (schema comment), so "the current
      // placement" follows the session rather than a form checkbox.
      await store.insertPlacement({
        institutionId: data.institutionId,
        studentId: data.studentId,
        academicSessionId: data.academicSessionId,
        sectionId: data.sectionId,
        placementReason: data.placementReason,
        isCurrent: session.isCurrent,
        createdByUserId: actor.userId,
      });
      return { id: data.studentId };
    },

    async enrollStudent(input) {
      const data = parseOrThrow(s.enrollStudentSchema, input, "enrollment");
      const student = await requireStudent(data.institutionId, data.studentId);
      assertNotArchived(student);
      const session = await requireOpenSession(data.institutionId, data.academicSessionId);
      const created = await store.insertEnrollment({
        institutionId: data.institutionId,
        studentId: data.studentId,
        academicSessionId: session.id,
        academicYear: data.academicYear.trim(),
        gradeLevel: data.gradeLevel,
        departmentId: data.departmentId,
        enrolledOn: data.enrolledOn,
        description: data.description,
      });
      return { id: created.id };
    },

    /* ---- Guardians ------------------------------------------------------- */

    async listGuardians(institutionId) {
      return store.listGuardians(institutionId);
    },

    async getGuardian(guardianUserId) {
      return requireGuardian(guardianUserId);
    },

    async createGuardian(input, actor) {
      const data = parseOrThrow(s.createGuardianSchema, input, "guardian");
      const displayName = `${data.firstName} ${data.lastName}`;

      let credential: Awaited<ReturnType<typeof hashPassword>> | null = null;
      if (data.password !== null) {
        // The policy (length, common passwords, fragments of the account's own identity) belongs
        // to auth; asking it here keeps one rule set for every account in the system.
        const verdict = checkPassword(data.password, {
          email: data.email,
          name: displayName,
        });
        if (!verdict.ok) {
          throw new ValidationError(
            "Password does not meet the policy",
            { password: verdict.issues.map((issue) => issue.message) },
            { userMessage: verdict.issues[0]?.message ?? "Choose a stronger password." },
          );
        }
        credential = await hashPassword(data.password);
      }

      let link: {
        readonly studentId: string;
        readonly relationship: GuardianRelationship;
        readonly contactType: GuardianContactType | null;
        readonly isFeePayer: boolean;
        readonly receivesNotifications: boolean;
      } | null = null;
      if (data.studentId !== null) {
        // `superRefine` refuses a link without a relationship; this keeps the compiler in step.
        if (data.relationship === undefined || data.institutionId === null) {
          throw new ValidationError("A link needs an institution and a relationship.", {
            relationship: ["Choose how this guardian is related to the student."],
          });
        }
        const student = await requireStudent(data.institutionId, data.studentId);
        assertPrimaryContactFree(
          await store.hasActivePrimaryGuardian(student.id),
          data.contactType ?? null,
        );
        link = {
          studentId: student.id,
          relationship: data.relationship,
          contactType: data.contactType ?? null,
          isFeePayer: data.isFeePayer,
          receivesNotifications: data.receivesNotifications,
        };
      }

      const created = await store.insertGuardianAccount(
        {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          occupation: data.occupation,
          address: data.address,
          credential,
        },
        link,
        actor.userId,
      );
      return { id: created.userId };
    },

    async updateGuardian(input) {
      const data = parseOrThrow(s.updateGuardianSchema, input, "guardian");
      await requireGuardian(data.guardianUserId);
      // D-9: access follows GuardianLink. A guardian has no `institution_id` of their own, so the
      // acting institution proves its right to edit this person by *reaching* them through an
      // active link — otherwise a forged `guardianUserId` would edit a sibling tenant's parent.
      const reachable = await store.guardianReachable(data.guardianUserId, data.institutionId);
      if (!reachable) {
        throw new NotFoundError("Guardian does not exist.", {
          userMessage: "That guardian is no longer available. Refresh the page and try again.",
        });
      }
      await store.updateGuardian({
        guardianUserId: data.guardianUserId,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        occupation: data.occupation,
        address: data.address,
        version: data.version,
      });
      return { id: data.guardianUserId };
    },

    async linkGuardian(input, actor) {
      const data = parseOrThrow(s.linkGuardianSchema, input, "guardian link");
      const student = await requireStudent(data.institutionId, data.studentId);
      // A guardian is a person, not an institutional record (ADR-0004 §2): existence is checked
      // globally, and it is the *student* that carries the institution scope.
      await requireGuardian(data.guardianUserId);
      const existing = await store.getGuardianLink(data.guardianUserId, student.id);
      assertNotAlreadyLinked(existing);
      assertPrimaryContactFree(await store.hasActivePrimaryGuardian(student.id), data.contactType);
      await store.insertOrReactivateLink(
        {
          guardianUserId: data.guardianUserId,
          studentId: student.id,
          relationship: data.relationship,
          contactType: data.contactType,
          isFeePayer: data.isFeePayer,
          receivesNotifications: data.receivesNotifications,
        },
        actor.userId,
      );
      return { id: student.id };
    },

    async unlinkGuardian(input, actor) {
      const data = parseOrThrow(s.unlinkGuardianSchema, input, "guardian link");
      await requireStudent(data.institutionId, data.studentId);
      const link = await store.getGuardianLink(data.guardianUserId, data.studentId);
      assertLinkIsActive(link);
      await store.deactivateLink(
        {
          guardianUserId: data.guardianUserId,
          studentId: data.studentId,
          reason: data.reason,
        },
        actor.userId,
      );
      return { id: data.studentId };
    },

    /* ---- Documents ------------------------------------------------------- */

    async registerDocument(input) {
      const data = parseOrThrow(s.registerDocumentSchema, input, "document");
      const student = await requireStudent(data.institutionId, data.studentId);
      assertNotArchived(student);
      // No storage service exists yet (`ARCHITECTURE.md` §51 keeps bytes out of PostgreSQL), so
      // the key is a provisional identifier the future uploader will replace on first write. What
      // matters is that the *caller* cannot choose it: a client-supplied key is a client-supplied
      // path into other people's objects.
      const storageKey = `institutions/${student.institutionId}/students/${student.id}/documents/${crypto.randomUUID()}`;
      const created = await store.insertDocument({
        studentId: student.id,
        documentType: data.documentType,
        storageKey,
        originalFileName: data.originalFileName,
      });
      return { id: created.id };
    },

    async decideDocument(input, actor) {
      const data = parseOrThrow(s.decideDocumentSchema, input, "document decision");
      await requireStudent(data.institutionId, data.studentId);
      const document = await store.getDocument(data.studentId, data.documentId);
      if (document === null) {
        throw new NotFoundError("The document could not be found.", {
          userMessage: "That document is no longer available. Refresh the page and try again.",
        });
      }
      assertDocumentDecision(document.status, data.decision, data.rejectionReason);
      await store.decideDocument({
        studentId: data.studentId,
        documentId: data.documentId,
        status: data.decision,
        rejectionReason: data.decision === "rejected" ? data.rejectionReason : null,
        verifiedByUserId: data.decision === "verified" ? actor.userId : null,
        now: new Date(),
      });
      return { id: data.documentId };
    },
  };
}

/** Re-exported for callers that type a placement row without reaching into `ports`. */
export type { PlacementRow };
