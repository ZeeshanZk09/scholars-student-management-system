/**
 * Input contracts for every student and guardian use case (`PHASES.md` Phase 7).
 *
 * These are *boundary* schemas (`ARCHITECTURE.md` §29): their job is to turn untrusted form
 * payloads into typed, validated command inputs. The rules that need an entity's current state —
 * a lifecycle transition that is legal only from this state, a section that already holds a
 * primary guardian, a session that is closed — live in `domain/domain-rules.ts` and the service,
 * because a zod schema cannot ask the database anything.
 *
 * Two shapes recur and are worth naming up front:
 *
 * - **Institution scope.** Every student command carries `institutionId` so the server action can
 *   authorize against *that* institution before the use case runs (`SECURITY.md` §21, §87). It is
 *   a claim to be checked, never a value to trust.
 * - **Optimistic concurrency.** Updates carry `version`; the store refuses the write when the row
 *   moved underneath, so two administrators editing one child's record cannot silently clobber
 *   each other.
 */
import { z } from "zod";

import {
  calendarDate,
  identifier,
  nonEmptyText,
  optionalCalendarDate,
  optionalId,
  optionalPhone,
  optionalText,
} from "@/shared/validation/fields";

import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  GENDER_VALUES,
  GUARDIAN_CONTACT_TYPES,
  GUARDIAN_RELATIONSHIPS,
  PLACEMENT_REASONS,
  STUDENT_LIFECYCLE_STATES,
} from "../domain/domain-rules";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/modules/auth";

const uuid = z.string().uuid("A valid reference is required.");

/** Names are `varchar(120)` in the schema; the same ceiling here so a long name fails at the form. */
const personName = (label: string) => nonEmptyText(label, 120);

/** `gender` — nullable by design: unknown is a legitimate answer, not a validation failure. */
export const genderEnum = z.enum(GENDER_VALUES);

/** The relationship of a link (`guardian_relationship`), owned by `guardian_links`. */
export const relationshipEnum = z.enum(GUARDIAN_RELATIONSHIPS);

/** Who to contact first (`guardian_contact_type`). */
export const contactTypeEnum = z.enum(GUARDIAN_CONTACT_TYPES);

/** Why a placement happened (`student_placements.placement_reason` check constraint). */
export const placementReasonEnum = z.enum(PLACEMENT_REASONS);

/** The eight `document_type` values. */
export const documentTypeEnum = z.enum(DOCUMENT_TYPES);

/* -------------------------------------------------------------------------- */
/* Student profile (tasks 1, 2, 7, 8, 9)                                      */
/* -------------------------------------------------------------------------- */

/** Optional gender, normalised to `null`. Declared after `genderEnum` so the reference reads forward. */
const optionalGender = z
  .union([genderEnum, z.literal(""), z.undefined(), z.null()])
  .optional()
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));

export const createStudentSchema = z.object({
  institutionId: uuid,
  /** Human reference, unique inside the institution (`students_institution_admission_number_key`). */
  admissionNumber: identifier("Admission number"),
  firstName: personName("First name"),
  middleName: optionalText(120),
  lastName: personName("Last name"),
  dateOfBirth: optionalCalendarDate,
  gender: optionalGender,
  /**
   * A student's own e-mail is contact data, *not* an account: students do not sign in (task 3).
   * Required because `students.email` is NOT NULL in the applied schema — every student is
   * expected to have an institution-issued address (see the column's own comment).
   */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320, "Email must be at most 320 characters.")
    .email("Enter a valid email."),
  phone: optionalPhone,
  address: optionalText(500),
  rollNumber: optionalText(32),
});

export const updateStudentSchema = createStudentSchema.extend({
  studentId: uuid,
  version: z.number().int().positive(),
});

/* -------------------------------------------------------------------------- */
/* Status lifecycle (task 13) and the archival axis (D-4)                     */
/* -------------------------------------------------------------------------- */

export const setStudentLifecycleSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  lifecycle: z.enum(STUDENT_LIFECYCLE_STATES),
});

/**
 * Archiving is the *record* axis, not the lifecycle axis (decision D-4): a row created in error is
 * archived with its lifecycle untouched, and a graduated student is history with an intact row.
 */
export const archiveStudentSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  version: z.number().int().positive(),
});

export const unarchiveStudentSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  version: z.number().int().positive(),
});

/* -------------------------------------------------------------------------- */
/* Placement & enrollment (tasks 11, 12)                                      */
/* -------------------------------------------------------------------------- */

export const placeStudentSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  academicSessionId: uuid,
  sectionId: uuid,
  placementReason: placementReasonEnum,
});

export const enrollStudentSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  academicSessionId: uuid,
  academicYear: nonEmptyText("Academic year", 32),
  gradeLevel: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.nullable(z.number().int().min(0).max(20)),
  ),
  departmentId: optionalId,
  enrolledOn: calendarDate("Enrolled on"),
  description: optionalText(2000),
});

/* -------------------------------------------------------------------------- */
/* Guardian identity (tasks 4, 15)                                            */
/* -------------------------------------------------------------------------- */

/**
 * A guardian is a `users` row plus a `guardians` profile (ADR-0004 §1) — one login, one profile,
 * and no `institutionId` on the person (§2). The e-mail is therefore **required**: it is the
 * account's identity and the only thing the portal can recover a lost password with.
 *
 * `password` is optional on purpose. Admins provision in both styles — hand a parent their first
 * credentials now, or invite them to set their own later — and the service turns its absence into
 * `users.status = 'invited'` rather than a fake password.
 */
export const createGuardianSchema = z
  .object({
    firstName: personName("First name"),
    lastName: personName("Last name"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(320, "Email must be at most 320 characters.")
      .email("Enter a valid email."),
    phone: optionalPhone,
    occupation: optionalText(120),
    address: optionalText(500),
    // FormData always yields a string, so a blank field arrives as `""` — which would fail
    // `.min` before `.optional()` could skip it. Normalise first, exactly as `gradeLevel` does.
    password: z.preprocess(
      (value) => (value === undefined || value === null || value === "" ? undefined : value),
      z
        .string()
        .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`)
        .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
        .optional()
        .transform((value) => (value === undefined ? null : value)),
    ),
    /**
     * An optional first link, created in the same transaction as the account (tasks 4–6). The
     * guardians page offers it because a guardian with no link is invisible to every institution —
     * `guardians` has no `institution_id`, so a person only appears once paired with a child.
     */
    institutionId: optionalId,
    studentId: optionalId,
    // Empty select values arrive as `""` from FormData; `""` must read as "not answered" so the
    // superRefine below can demand a relationship for a linked guardian with a friendly message.
    relationship: z
      .union([relationshipEnum, z.literal(""), z.undefined(), z.null()])
      .optional()
      .transform((value) =>
        value === null || value === undefined || value === "" ? undefined : value,
      ),
    contactType: z
      .union([contactTypeEnum, z.literal(""), z.undefined(), z.null()])
      .optional()
      .transform((value) => (value === null || value === undefined || value === "" ? null : value)),
    isFeePayer: z.boolean().default(false),
    receivesNotifications: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.studentId !== null && data.relationship === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["relationship"],
        message: "Choose how this guardian is related to the student.",
      });
    }
    if (data.studentId !== null && data.institutionId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["institutionId"],
        message: "An institution is required to link a guardian to a student.",
      });
    }
  });

/** The guardian profile's editable fields. The account's e-mail is deliberately not editable here. */
export const updateGuardianSchema = z.object({
  /** The acting institution — the caller must be able to *reach* this guardian through a link. */
  institutionId: uuid,
  guardianUserId: uuid,
  firstName: personName("First name"),
  lastName: personName("Last name"),
  phone: optionalPhone,
  occupation: optionalText(120),
  address: optionalText(500),
  version: z.number().int().positive(),
});

/* -------------------------------------------------------------------------- */
/* Guardian ↔ student links (tasks 5, 6)                                      */
/* -------------------------------------------------------------------------- */

export const linkGuardianSchema = z.object({
  institutionId: uuid,
  guardianUserId: uuid,
  studentId: uuid,
  relationship: relationshipEnum,
  contactType: z
    .union([contactTypeEnum, z.literal(""), z.undefined(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === "" ? null : value)),
  isFeePayer: z.boolean().default(false),
  receivesNotifications: z.boolean().default(true),
});

export const unlinkGuardianSchema = z.object({
  institutionId: uuid,
  guardianUserId: uuid,
  studentId: uuid,
  reason: optionalText(500),
});

/* -------------------------------------------------------------------------- */
/* Documents (task 10)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Registering a document records its *metadata*; the bytes never reach PostgreSQL
 * (`ARCHITECTURE.md` §51). `storageKey` is omitted from the form and minted by the service: the
 * caller names the file, the module decides where it lives, and a client that could choose its own
 * key could read someone else's object.
 */
export const registerDocumentSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  documentType: documentTypeEnum,
  originalFileName: optionalText(255),
});

export const decideDocumentSchema = z.object({
  institutionId: uuid,
  studentId: uuid,
  documentId: uuid,
  decision: z.enum(["verified", "rejected"]),
  rejectionReason: optionalText(500),
});

/** Re-exported so consumers of this module can type a status without importing the domain. */
export type { DocumentStatus } from "../domain/domain-rules";
export { DOCUMENT_STATUSES };

/** Present for symmetry with the schema's other enum lists; used by the UI's status badges. */
export const documentStatusEnum = z.enum(DOCUMENT_STATUSES);
