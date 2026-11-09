/**
 * Input contracts for every admission use case (`PHASES.md` Phase 8).
 *
 * Boundary schemas (`ARCHITECTURE.md` §29) that turn untrusted form payloads into typed command
 * inputs. Rules needing the row's current state — a transition legal only from this status, a
 * document awaiting verification — live in `domain/domain-rules.ts` and the service, because zod
 * cannot ask the database anything.
 *
 * Three shapes recur here:
 *
 * - **Institution scope** on every command, so the server action can authorize before the use case
 *   runs (`SECURITY.md` §21, §87) — a claim to check, never a value to trust.
 * - **Optimistic concurrency**: edits and decisions carry `version`; the store refuses the write
 *   when the row moved underneath.
 * - **Presence blocks**: the conversion form folds guardian and previous-school sections into one
 *   payload. Blank fields arrive as `""` from FormData, which `.optional()` alone would not skip,
 *   so every optional field normalises to `null`, and `superRefine` requires the rest of a section
 *   once any of its fields is filled in — the same shape the database's `*_present_check` uses,
 *   stated early enough to produce a field-level message instead of a 500.
 */
import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/modules/auth";
import {
  DOCUMENT_TYPES,
  GENDER_VALUES,
  GUARDIAN_CONTACT_TYPES,
  GUARDIAN_RELATIONSHIPS,
} from "@/modules/student";
import {
  calendarDate,
  identifier,
  nonEmptyText,
  nonNegativeAmount,
  optionalCalendarDate,
  optionalEmail,
  optionalId,
  optionalPhone,
  optionalText,
} from "@/shared/validation/fields";

import { ADMISSION_STATUSES, DECISION_STATUSES } from "../domain/domain-rules";

const uuid = z.string().uuid("A valid reference is required.");

/** Names are `varchar(120)` in the schema; the same ceiling here so a long name fails at the form. */
const personName = (label: string) => nonEmptyText(label, 120);

/** The seven `admission_status` values. */
export const admissionStatusEnum = z.enum(ADMISSION_STATUSES);

export const genderEnum = z.enum(GENDER_VALUES);
export const relationshipEnum = z.enum(GUARDIAN_RELATIONSHIPS);
export const contactTypeEnum = z.enum(GUARDIAN_CONTACT_TYPES);

/** The eight shared `document_type` values (same enum as student documents). */
export const documentTypeEnum = z.enum(DOCUMENT_TYPES);

/** Optional gender, normalised to `null` — unknown is an answer, not a failure. */
const optionalGender = z
  .union([genderEnum, z.literal(""), z.undefined(), z.null()])
  .optional()
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));

/**
 * A score (`numeric(8,2)`, non-negative per `admissions_score_range_check`): blank means "not
 * taken", never `0` — a zero score is information, an empty box is absence.
 */
const score = z
  .union([nonNegativeAmount, z.literal(""), z.undefined(), z.null()])
  .optional()
  .transform((value) => (value === null || value === undefined || value === "" ? null : value));

/**
 * The human handle may be left to the service to mint (`ADM-YYYYMMDD-XXXX`). A supplied number is
 * validated here; uniqueness inside the institution is the store's unique index, which surfaces as
 * a `ConflictError`.
 */
const optionalApplicationNumber = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  identifier("Application number").optional(),
);

/* -------------------------------------------------------------------------- */
/* Application (tasks 1, 2)                                                   */
/* -------------------------------------------------------------------------- */

/** Addressing the detail page's row — scope first, always checked by the caller's gate. */
export const getAdmissionSchema = z.object({
  institutionId: uuid,
  admissionId: uuid,
});

/** The applicant's identity, contact details and the scope they applied for. */
const applicantScopeFields = {
  firstName: personName("First name"),
  middleName: optionalText(120),
  lastName: personName("Last name"),
  dateOfBirth: optionalCalendarDate,
  gender: optionalGender,
  /** Applicants may have no e-mail yet — unlike `students.email`, this column is nullable. */
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalText(500),
  /* Applied-for scope: captured denormalised (`src/db/schema/admission.ts` §65) … */
  academicSessionId: optionalId,
  appliedClassId: optionalId,
  appliedGroupId: optionalId,
  appliedGradeLevel: optionalText(64),
  /* … and scores, when the institution tests before deciding. */
  testScore: score,
  interviewScore: score,
};

/** `admissions_scope_present_check` stated at the form, with a field-level message. */
const requireScope = (
  data: {
    appliedClassId: string | null;
    appliedGroupId: string | null;
    appliedGradeLevel: string | null;
  },
  ctx: z.RefinementCtx,
): void => {
  if (data.appliedClassId !== null || data.appliedGroupId !== null) return;
  if (data.appliedGradeLevel !== null && data.appliedGradeLevel.trim() !== "") return;
  ctx.addIssue({
    code: "custom",
    path: ["appliedGradeLevel"],
    message: "Choose a class, group, or grade level to apply for.",
  });
};

export const createAdmissionSchema = z
  .object({
    institutionId: uuid,
    applicationNumber: optionalApplicationNumber,
    ...applicantScopeFields,
  })
  .superRefine(requireScope);

/**
 * Applicant/scope edits while the application is open. `applicationNumber` is deliberately absent:
 * the human handle is minted once and never rewritten, so the story of ADM-20261008-3F2A1C stays
 * stable through review. Editability itself is an `assertAdmissionEditable` domain rule.
 */
export const updateAdmissionSchema = z
  .object({
    institutionId: uuid,
    admissionId: uuid,
    version: z.number().int().positive(),
    ...applicantScopeFields,
  })
  .superRefine(requireScope);

/* -------------------------------------------------------------------------- */
/* Decisions (tasks 10, 11)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The decision vocabulary itself lives in the domain (`DECISION_STATUSES` — tuple + rationale);
 * this is only the zod binding that the decide command parses against.
 */
export const decisionStatusEnum = z.enum(DECISION_STATUSES);

/**
 * The actor is intentionally not a field: `decide` takes the principal from the authenticated
 * session (Phase 7 pattern), so a form cannot name someone else as the decision-maker.
 * Whether a rejection carries a reason is `assertDecisionReason` — domain policy, not shape.
 */
export const decideAdmissionSchema = z.object({
  institutionId: uuid,
  admissionId: uuid,
  version: z.number().int().positive(),
  to: decisionStatusEnum,
  rejectionReason: optionalText(500),
  decisionNotes: optionalText(2000),
});

/* -------------------------------------------------------------------------- */
/* Conversion (task 3, 4, 5, 7)                                               */
/* -------------------------------------------------------------------------- */

/**
 * One dialog, one submit: finalize the student, place and enroll them, optionally provision the
 * guardian and record the previous school. The person's identity defaults to the applicant's in the
 * form; these are the values the administrator confirms or corrects. Flat `guardian*` /
 * `previousSchool*` prefixes mirror how the form posts, and the service assembles the nested
 * `ConversionWrite`.
 */
export const convertAdmissionSchema = z
  .object({
    institutionId: uuid,
    admissionId: uuid,
    version: z.number().int().positive(),

    /* — the student this application becomes — */
    /** Prefilled from `applicationNumber`, editable before numbers get handed out. */
    admissionNumber: identifier("Admission number"),
    firstName: personName("First name"),
    middleName: optionalText(120),
    lastName: personName("Last name"),
    /** `students.email` is NOT NULL — the institution issues an address for every child. */
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(320, "Email must be at most 320 characters.")
      .email("Enter a valid email."),
    phone: optionalPhone,
    address: optionalText(500),
    dateOfBirth: optionalCalendarDate,
    gender: optionalGender,
    rollNumber: optionalText(32),

    /* — placement and enrollment (the `students` default lifecycle is already `admitted`) — */
    academicSessionId: uuid,
    sectionId: uuid,
    academicYear: nonEmptyText("Academic year", 32),
    gradeLevel: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
      z.nullable(z.number().int().min(0).max(20)),
    ),
    departmentId: optionalId,
    /** The admission date itself (Phase 8, task 7) — defaulting to today in the form. */
    enrolledOn: calendarDate("Enrolled on"),

    /* — optional guardian: one login, one profile, one link (ADR-0004) — */
    guardianFirstName: optionalText(120),
    guardianLastName: optionalText(120),
    guardianEmail: optionalEmail,
    guardianPhone: optionalPhone,
    guardianOccupation: optionalText(120),
    guardianAddress: optionalText(500),
    // Same preprocess as `createGuardianSchema`: a blank password field arrives as `""`.
    guardianPassword: z.preprocess(
      (value) => (value === undefined || value === null || value === "" ? undefined : value),
      z
        .string()
        .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`)
        .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
        .optional()
        .transform((value) => (value === undefined ? null : value)),
    ),
    guardianRelationship: z
      .union([relationshipEnum, z.literal(""), z.undefined(), z.null()])
      .optional()
      .transform((value) => (value === null || value === undefined || value === "" ? null : value)),
    guardianContactType: z
      .union([contactTypeEnum, z.literal(""), z.undefined(), z.null()])
      .optional()
      .transform((value) => (value === null || value === undefined || value === "" ? null : value)),
    guardianIsFeePayer: z.boolean().default(false),
    guardianReceivesNotifications: z.boolean().default(true),

    /* — optional previous school (task 7) — */
    previousSchoolName: optionalText(200),
    previousSchoolAddress: optionalText(500),
    previousSchoolPhone: optionalPhone,
    previousSchoolClassAttended: optionalText(64),
    previousSchoolTcNumber: optionalText(64),
  })
  .superRefine((data, ctx) => {
    /* A half-filled guardian section is a mistake; an empty one is legitimate. Every field the
       guardian block renders counts — otherwise a partial guardian converts into thin air. */
    const guardianTouched =
      data.guardianFirstName !== null ||
      data.guardianLastName !== null ||
      data.guardianEmail !== null ||
      data.guardianRelationship !== null ||
      data.guardianPhone !== null ||
      data.guardianOccupation !== null ||
      data.guardianAddress !== null ||
      data.guardianContactType !== null ||
      data.guardianPassword !== null ||
      data.guardianIsFeePayer;
    if (guardianTouched) {
      const require = (field: keyof typeof data, message: string): void => {
        if (data[field] === null) {
          ctx.addIssue({ code: "custom", path: [field], message });
        }
      };
      require("guardianFirstName", "Guardian first name is required.");
      require("guardianLastName", "Guardian last name is required.");
      require("guardianEmail", "Guardian email is required — it is the account's login.");
      require("guardianRelationship", "Choose how this guardian is related to the student.");
    }
    /* Same for the previous-school block: name carries it, partials are refused. */
    const previousTouched =
      data.previousSchoolAddress !== null ||
      data.previousSchoolPhone !== null ||
      data.previousSchoolClassAttended !== null ||
      data.previousSchoolTcNumber !== null;
    if (previousTouched && data.previousSchoolName === null) {
      ctx.addIssue({
        code: "custom",
        path: ["previousSchoolName"],
        message: "Previous school details need the school's name.",
      });
    }
  });

/* -------------------------------------------------------------------------- */
/* Documents (task 6)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Registering a document records its *metadata*; bytes never reach PostgreSQL (`ARCHITECTURE.md`
 * §51). `storageKey` is minted by the service, never accepted from the client — a caller who chose
 * its own key could point at someone else's object.
 */
export const registerAdmissionDocumentSchema = z.object({
  institutionId: uuid,
  admissionId: uuid,
  documentType: documentTypeEnum,
  originalFileName: optionalText(255),
});

export const decideAdmissionDocumentSchema = z.object({
  institutionId: uuid,
  admissionId: uuid,
  documentId: uuid,
  decision: z.enum(["verified", "rejected"]),
  rejectionReason: optionalText(500),
});

/* -------------------------------------------------------------------------- */
/* Advisory duplicate preview (task 9)                                        */
/* -------------------------------------------------------------------------- */

/** Pre-submit look-up — the service filters by name, applying the dob veto from the domain. */
export const previewDuplicatesSchema = z.object({
  institutionId: uuid,
  firstName: personName("First name"),
  lastName: personName("Last name"),
  dateOfBirth: optionalCalendarDate,
});
