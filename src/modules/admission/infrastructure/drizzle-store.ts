/**
 * The Drizzle implementation of {@link AdmissionStore} — the only file in the admission module
 * that imports `@/db/client` or the table objects (`src/modules/README.md`: ports in, Drizzle
 * out). Mirrors the student store's four responsibilities (`RULES.md` §15: the database is the
 * source of truth for integrity):
 *
 * 1. **Tenant guards.** Every read and write carries `institution_id` in its own WHERE clause —
 *    a foreign key can prove `admissions.id` exists, never that it belongs to *this* institution.
 *    The student-side writes inside `convertAdmission` inherit their guards from
 *    `createStudentStore(tx)` (that store re-checks every referenced row's institution).
 * 2. **Optimistic concurrency.** `updateAdmission`, `applyDecision` and `convertAdmission` are
 *    `where (id, institution_id, version)`; zero rows means someone else moved first, translated
 *    to `ConflictError` rather than a silent last-write-wins clobber. Because *every* status
 *    change bumps `version`, the version guard also closes the race between the service's
 *    pre-read and this write: a concurrent decision invalidates the payload before it lands.
 * 3. **History is not optional.** The `null → submitted` row commits in the same transaction as
 *    the application itself, and every transition's `admission_status_history` row commits with
 *    the status flip it records — an application that moved without history would be
 *    `RULES.md` §51's audit trail with a hole in it. The `fromStatus` is read inside the same
 *    transaction, so the timeline cannot start from a stale state.
 * 4. **Conversion is one write** (Phase 8 completion gate). `convertAdmission` runs the
 *    student-module seam — `createStudentStore(tx)`; nesting a transaction on a scope becomes a
 *    savepoint — for student, placement, enrollment, guardian account and previous school, then
 *    flips the application to `converted` and writes its history row, all inside one
 *    `db.transaction`. Any failure rolls the whole conversion back: no half-created student, no
 *    student without placement, no converted application pointing at nothing.
 *
 * Unique conflicts arrive as PostgreSQL `23505` (application number or slug minted twice under a
 * race the service's pre-read lost) and are translated to `ConflictError` so a screen can render
 * a friendly message instead of a raw driver error.
 *
 * `decidedByUserId` is stamped here rather than carried on `DecisionApply`: the actor of a
 * decision *is* its decider, and only where the service's `admissionTimestampPatch` stamped
 * `decidedAt` — a waitlist is not yet a decision, so its column stays null.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import type { DbLike } from "@/db/client";
import {
  academicSessions,
  admissionDocuments,
  admissionStatusHistory,
  admissions,
  classes,
  groups,
  institutions,
  students,
  users,
} from "@/db/schema";
import { createStudentStore } from "@/modules/student";
import { ConflictError, InternalError, NotFoundError } from "@/shared/errors";

import type { AdmissionDetailRow, AdmissionListRow, AdmissionStore } from "../application/ports";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

/** A `version`-guarded update that touched no row: stale write, or the row is gone. */
async function expectVersionedRow(
  rows: readonly { readonly id: string }[],
  label: string,
): Promise<void> {
  if (rows.length > 0) return;
  throw new ConflictError(`${label} was changed by someone else.`, {
    userMessage: `This ${label.toLowerCase()} was changed by someone else. Refresh the page and try again.`,
  });
}

/** `where (id, institutionId)` — every admission statement starts from tenant scope. */
const admissionScope = (institutionId: string, admissionId: string) =>
  and(eq(admissions.id, admissionId), eq(admissions.institutionId, institutionId));

/** The version-guarded WHERE clause shared by every admission write. */
const admissionVersionScope = (institutionId: string, admissionId: string, version: number) =>
  and(admissionScope(institutionId, admissionId), eq(admissions.version, version));

/** The service/fake's `normalize()`, expressed for PostgreSQL so all three agree on candidates. */
const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

const normalizedSql = (column: AnyPgColumn) =>
  sql<string>`regexp_replace(lower(btrim(${column})), '\\s+', ' ', 'g')`;

/** Both list and detail read the same shape: the application row plus display-name LEFT JOINs. */
type AdmissionJoinRow = {
  readonly admission: typeof admissions.$inferSelect;
  readonly sessionName: string | null;
  readonly className: string | null;
  readonly groupName: string | null;
  readonly decidedByName: string | null;
};

/** The decider of a decision — a separate alias so the history join can reuse plain `users`. */
const deciders = alias(users, "admission_decider");

const admissionProjection = {
  admission: admissions,
  sessionName: academicSessions.name,
  className: classes.name,
  groupName: groups.name,
  decidedByName: deciders.name,
};

function toAdmissionListRow(row: AdmissionJoinRow): AdmissionListRow {
  return {
    id: row.admission.id,
    institutionId: row.admission.institutionId,
    applicationNumber: row.admission.applicationNumber,
    firstName: row.admission.firstName,
    middleName: row.admission.middleName,
    lastName: row.admission.lastName,
    dateOfBirth: row.admission.dateOfBirth,
    gender: row.admission.gender,
    email: row.admission.email,
    phone: row.admission.phone,
    status: row.admission.status,
    academicSessionId: row.admission.academicSessionId,
    sessionName: row.sessionName,
    appliedClassName: row.className,
    appliedGroupName: row.groupName,
    appliedGradeLevel: row.admission.appliedGradeLevel,
    studentId: row.admission.studentId,
    submittedAt: row.admission.submittedAt,
    createdAt: row.admission.createdAt,
  };
}

function toAdmissionDetailRow(row: AdmissionJoinRow): AdmissionDetailRow {
  return {
    ...toAdmissionListRow(row),
    slug: row.admission.slug,
    address: row.admission.address,
    appliedClassId: row.admission.appliedClassId,
    appliedGroupId: row.admission.appliedGroupId,
    testScore: row.admission.testScore,
    interviewScore: row.admission.interviewScore,
    convertedAt: row.admission.convertedAt,
    decidedAt: row.admission.decidedAt,
    decidedByUserId: row.admission.decidedByUserId,
    decidedByName: row.decidedByName,
    decisionNotes: row.admission.decisionNotes,
    rejectionReason: row.admission.rejectionReason,
    updatedAt: row.admission.updatedAt,
    archivedAt: row.admission.archivedAt,
    version: row.admission.version,
  };
}

/**
 * Build a store over any {@link DbLike} — the pooled client for ambient work, or a transaction
 * for work that must share one. Conversion and decisions open their own transactions; the
 * admission module's `index.ts` wires the ambient instance.
 */
export function createAdmissionStore(executor: DbLike): AdmissionStore {
  return {
    /* ---- Reads ----------------------------------------------------------- */

    async institutionExists(institutionId) {
      const rows = await executor
        .select({ id: institutions.id })
        .from(institutions)
        .where(eq(institutions.id, institutionId))
        .limit(1);
      return rows.length > 0;
    },

    async listAdmissions(institutionId, status = null) {
      const rows = await executor
        .select(admissionProjection)
        .from(admissions)
        // Display names are LEFT JOINs: an application must outlive the session, class or group
        // it applied to (`onDelete: set null`), and the list still has to render.
        .leftJoin(academicSessions, eq(academicSessions.id, admissions.academicSessionId))
        .leftJoin(classes, eq(classes.id, admissions.appliedClassId))
        .leftJoin(groups, eq(groups.id, admissions.appliedGroupId))
        .leftJoin(deciders, eq(deciders.id, admissions.decidedByUserId))
        .where(
          status == null
            ? eq(admissions.institutionId, institutionId)
            : and(eq(admissions.institutionId, institutionId), eq(admissions.status, status)),
        )
        .orderBy(desc(admissions.createdAt));
      return rows.map(toAdmissionListRow);
    },

    async getAdmission(institutionId, admissionId) {
      const rows = await executor
        .select(admissionProjection)
        .from(admissions)
        .leftJoin(academicSessions, eq(academicSessions.id, admissions.academicSessionId))
        .leftJoin(classes, eq(classes.id, admissions.appliedClassId))
        .leftJoin(groups, eq(groups.id, admissions.appliedGroupId))
        .leftJoin(deciders, eq(deciders.id, admissions.decidedByUserId))
        .where(admissionScope(institutionId, admissionId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;

      const [documents, history] = await Promise.all([
        executor
          .select()
          .from(admissionDocuments)
          .where(eq(admissionDocuments.admissionId, admissionId))
          .orderBy(asc(admissionDocuments.createdAt)),
        executor
          .select({
            id: admissionStatusHistory.id,
            admissionId: admissionStatusHistory.admissionId,
            fromStatus: admissionStatusHistory.fromStatus,
            toStatus: admissionStatusHistory.toStatus,
            changedAt: admissionStatusHistory.changedAt,
            changedByUserId: admissionStatusHistory.changedByUserId,
            changedByName: users.name,
            notes: admissionStatusHistory.notes,
          })
          .from(admissionStatusHistory)
          // Left join: the FK the table deliberately does not carry (RULES.md §51 keeps the actor
          // as a plain uuid) means a deleted account must not delete the timeline around it.
          .leftJoin(users, eq(users.id, admissionStatusHistory.changedByUserId))
          .where(eq(admissionStatusHistory.admissionId, admissionId))
          .orderBy(asc(admissionStatusHistory.changedAt)),
      ]);

      return { admission: toAdmissionDetailRow(row), documents, history };
    },

    async listApplicationSlugs(institutionId) {
      const rows = await executor
        .select({ slug: admissions.slug })
        .from(admissions)
        .where(eq(admissions.institutionId, institutionId));
      return rows.map((r) => r.slug);
    },

    async listStudentSlugs(institutionId) {
      // A scoped read of another module's table — the same move the student store makes when it
      // reads `academic_sessions`; the student *writes* stay behind `createStudentStore`.
      const rows = await executor
        .select({ slug: students.slug })
        .from(students)
        .where(eq(students.institutionId, institutionId));
      return rows.map((r) => r.slug);
    },

    async findDuplicateCandidates(institutionId, firstName, lastName) {
      return executor
        .select({
          id: admissions.id,
          applicationNumber: admissions.applicationNumber,
          status: admissions.status,
          firstName: admissions.firstName,
          lastName: admissions.lastName,
          dateOfBirth: admissions.dateOfBirth,
        })
        .from(admissions)
        .where(
          and(
            eq(admissions.institutionId, institutionId),
            sql`${normalizedSql(admissions.firstName)} = ${normalize(firstName)}`,
            sql`${normalizedSql(admissions.lastName)} = ${normalize(lastName)}`,
          ),
        )
        .orderBy(desc(admissions.createdAt))
        .limit(20);
    },

    /* ---- Application commands -------------------------------------------- */

    async insertAdmission(values) {
      const { changedByUserId, ...row } = values;
      try {
        return await executor.transaction(async (tx) => {
          const inserted = await tx
            .insert(admissions)
            .values({ ...row, status: "submitted" })
            .returning({ id: admissions.id });
          const admissionRow = inserted[0];
          if (admissionRow === undefined)
            throw new InternalError("admissions insert returned no row");
          await tx.insert(admissionStatusHistory).values({
            admissionId: admissionRow.id,
            fromStatus: null,
            toStatus: "submitted",
            changedAt: row.submittedAt,
            changedByUserId,
            notes: null,
          });
          return { id: admissionRow.id };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Application number or slug is already in use.", {
            userMessage: `Application number ${row.applicationNumber} is already used in this institution.`,
          });
        }
        throw error;
      }
    },

    async updateAdmission(values) {
      const { institutionId, admissionId, version, ...fields } = values;
      // No `23505` translation: `applicationNumber` and `slug` are deliberately not part of an
      // update (the human handle is minted once), so no unique column can change here.
      const rows = await executor
        .update(admissions)
        .set({ ...fields, updatedAt: new Date(), version: sql`${admissions.version} + 1` })
        .where(admissionVersionScope(institutionId, admissionId, version))
        .returning({ id: admissions.id });
      await expectVersionedRow(rows, "This application");
    },

    async applyDecision(values) {
      await executor.transaction(async (tx) => {
        // The pre-read inside the transaction supplies `fromStatus`; the version-guarded update
        // below re-checks the same version, so a concurrent change fails before history lands.
        const [current] = await tx
          .select({ status: admissions.status })
          .from(admissions)
          .where(admissionVersionScope(values.institutionId, values.admissionId, values.version))
          .limit(1);
        if (current === undefined) {
          throw new ConflictError("This application was changed by someone else.", {
            userMessage:
              "This application was changed by someone else. Refresh the page and try again.",
          });
        }

        const rows = await tx
          .update(admissions)
          .set({
            status: values.to,
            rejectionReason: values.rejectionReason,
            decisionNotes: values.decisionNotes,
            ...(values.decidedAt !== undefined
              ? { decidedAt: values.decidedAt, decidedByUserId: values.changedByUserId }
              : {}),
            ...(values.convertedAt !== undefined ? { convertedAt: values.convertedAt } : {}),
            updatedAt: values.now,
            version: sql`${admissions.version} + 1`,
          })
          .where(admissionVersionScope(values.institutionId, values.admissionId, values.version))
          .returning({ id: admissions.id });
        await expectVersionedRow(rows, "This application");

        await tx.insert(admissionStatusHistory).values({
          admissionId: values.admissionId,
          fromStatus: current.status,
          toStatus: values.to,
          changedAt: values.now,
          changedByUserId: values.changedByUserId,
          notes: values.decisionNotes,
        });
      });
    },

    async convertAdmission(values) {
      let studentId = "";

      await executor.transaction(async (tx) => {
        const [current] = await tx
          .select({
            status: admissions.status,
            applicationNumber: admissions.applicationNumber,
            version: admissions.version,
          })
          .from(admissions)
          .where(admissionScope(values.institutionId, values.admissionId))
          .limit(1);
        if (current === undefined) {
          throw new NotFoundError("The application could not be found.");
        }
        // Status and version move together — `applyDecision` bumps both — so one guard covers
        // the race between the service's `assertConvertable` pre-read and this transaction.
        if (current.version !== values.version || current.status !== "approved") {
          throw new ConflictError("This application was changed by someone else.", {
            userMessage:
              "This application was changed by someone else. Refresh the page and try again.",
          });
        }

        const studentStore = createStudentStore(tx);

        const student = await studentStore.insertStudent(values.student);
        studentId = student.id;

        await studentStore.insertPlacement({
          institutionId: values.institutionId,
          studentId,
          academicSessionId: values.placement.academicSessionId,
          sectionId: values.placement.sectionId,
          placementReason: "admission",
          isCurrent: true,
          createdByUserId: values.actorUserId,
        });

        await studentStore.insertEnrollment({
          institutionId: values.institutionId,
          studentId,
          academicSessionId: values.placement.academicSessionId,
          academicYear: values.enrollment.academicYear,
          gradeLevel: values.enrollment.gradeLevel,
          departmentId: values.enrollment.departmentId,
          enrolledOn: values.enrollment.enrolledOn,
          description: `Converted from application ${current.applicationNumber}`,
        });

        if (values.guardian !== null) {
          await studentStore.insertGuardianAccount(
            values.guardian.profile,
            { ...values.guardian.link, studentId },
            values.actorUserId,
          );
        }

        if (values.previousSchool !== null) {
          await studentStore.insertPreviousSchool({ ...values.previousSchool, studentId });
        }

        const flipped = await tx
          .update(admissions)
          .set({
            status: "converted",
            studentId,
            convertedAt: values.now,
            updatedAt: values.now,
            version: sql`${admissions.version} + 1`,
          })
          .where(admissionVersionScope(values.institutionId, values.admissionId, values.version))
          .returning({ id: admissions.id });
        await expectVersionedRow(flipped, "This application");

        await tx.insert(admissionStatusHistory).values({
          admissionId: values.admissionId,
          fromStatus: current.status,
          toStatus: "converted",
          changedAt: values.now,
          changedByUserId: values.actorUserId,
          notes: null,
        });
      });

      return { studentId };
    },

    /* ---- Documents -------------------------------------------------------- */

    async insertAdmissionDocument(values) {
      const rows = await executor
        .insert(admissionDocuments)
        .values(values)
        .returning({ id: admissionDocuments.id });
      const row = rows[0];
      if (row === undefined) throw new InternalError("admission_documents insert returned no row");
      return { id: row.id };
    },

    async decideAdmissionDocument(values) {
      if (values.status === "verified" && values.verifiedByUserId === null) {
        // `admission_documents_verification_pair` requires a verifier: without an actor there is
        // no audit trail to trust, so fail here rather than letting the check surface it.
        throw new InternalError("A verified document needs a verifying user.");
      }
      const rows = await executor
        .update(admissionDocuments)
        .set({
          status: values.status,
          rejectionReason: values.status === "rejected" ? values.rejectionReason : null,
          verifiedByUserId: values.status === "verified" ? values.verifiedByUserId : null,
          verifiedAt: values.status === "verified" ? values.now : null,
          updatedAt: values.now,
        })
        .where(
          and(
            eq(admissionDocuments.id, values.documentId),
            eq(admissionDocuments.admissionId, values.admissionId),
          ),
        )
        .returning({ id: admissionDocuments.id });
      if (rows.length === 0) {
        throw new NotFoundError("The document could not be found.");
      }
    },
  };
}

/** The ambient store — the wiring in `index.ts` uses this. */
export const drizzleAdmissionStore = createAdmissionStore(db);
