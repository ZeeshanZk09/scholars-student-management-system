"use server";

/**
 * Admission server actions (Phase 8 tasks 13–15).
 *
 * Each action is the single path from `ui/` into the admission module's use cases
 * (`src/modules/README.md`). It runs **two gates before the command** — the same pattern as
 * `src/modules/student/ui/actions.ts`, with the admission module's own permission keys:
 *
 * 1. the institution gate — `requireInstitutionMutation` resolves the key *at* the institution
 *    the form names and refuses an institution this user does not belong to, so a forged
 *    `institutionId` can never widen a grant (`SECURITY.md` §21, §87). The keys, paired with the
 *    navigation item that links to the page:
 *
 *    | command                          | key                  | gate   |
 *    |----------------------------------|----------------------|--------|
 *    | create application               | `admissions.create`  | mutate |
 *    | edit application, documents      | `admissions.update`  | mutate |
 *    | decide (approve/reject/…)        | `admissions.approve` | mutate |
 *    | convert to student               | `admissions.approve` | mutate |
 *
 *    (`admissions.view` is the *page* gate and the duplicate preview's gate — it authorizes
 *    reads in `page.tsx` / `previewDuplicatesAction`, never a mutation. The UI's own hiding of
 *    buttons is a courtesy, not authorization: every one of these actions re-checks server-side.
 *    Splitting `approve` from `update` is SECURITY.md §14: a receptionist who files paperwork
 *    cannot also decide it.)
 *
 * 2. the boundary schema — the zod input the module's use case accepts
 *    (`application/schemas.ts`). Normalisations the schema cannot make from a string arrive here:
 *    `version` becomes a number, checkboxes become booleans (`formData.has` — an unchecked box
 *    sends nothing, and `guardianReceivesNotifications` must be `false`, not its schema default).
 *
 * A refusal from either comes back as a serialisable `FormState` for `useActionState`, not as an
 * error boundary: the user stays on the form and reads why. A `redirect()` (expired session) is
 * deliberately *not* converted — see `gate`.
 *
 * Commands that stamp an actor (`createAdmission`, `decide`, `convert`, document registration and
 * verification) receive the acting `principal.userId` from the gate itself; the client never
 * supplies the "who did this" field.
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation, requireInstitutionRead } from "@/lib/permissions-server";
import type { PermissionKey, Principal } from "@/shared/authorization";
import { ConflictError, isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

import {
  convert,
  createAdmission,
  decide,
  decideDocument,
  previewDuplicates,
  registerDocument,
  updateAdmission,
} from "@/modules/admission";
import type { DuplicateCandidateRow } from "@/modules/admission";

/** Anything naming a route must be a uuid — a raw form value would let an updater purge caches
 *  for paths outside this module, and a malformed one would throw out of the action contract. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The list always moves with the application; the detail page only when the form names it. */
function revalidateAdmission(formData: FormData): void {
  revalidatePath("/admissions");
  const admissionId = field(formData, "admissionId");
  if (UUID_PATTERN.test(admissionId)) revalidatePath(`/admissions/${admissionId}`);
}

/**
 * Conversion creates the student, guardian and placement rows the student screens render — the
 * same paths the student module revalidates, so the new child appears without a manual refresh.
 */
function revalidateAfterConvert(admissionId: string): void {
  revalidatePath("/admissions");
  if (UUID_PATTERN.test(admissionId)) revalidatePath(`/admissions/${admissionId}`);
  for (const path of ["/students", "/student-info", "/guardians"]) revalidatePath(path);
}

/** Raw `FormData` value for a key, or `""` when the part is absent. */
function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** An optimistic-concurrency token the schema wants as a number. */
function version(formData: FormData): number {
  return Number(field(formData, "version"));
}

/** HTML checkboxes send `"on"` when checked and nothing when unchecked. */
function checked(formData: FormData, key: string): boolean {
  return formData.has(key);
}

/** Normalise a command failure into a serialisable form state. */
function stateFrom(error: unknown): FormState {
  if (isAppError(error)) {
    if (error instanceof ValidationError) {
      return {
        status: "error",
        message: error.userMessage,
        issues: Object.values(error.fieldErrors).flat(),
      };
    }
    return { status: "error", message: error.userMessage };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

type Gate =
  | { readonly ok: true; readonly principal: Principal }
  | { readonly ok: false; readonly state: FormState };

/**
 * Gate 1: resolve `permission` at the institution the form names, returning the acting principal
 * so caller-stamped commands can use its `userId`.
 *
 * `AppError` becomes the `error` arm of `FormState` — `ForbiddenError`, `ValidationError` and
 * `ConflictError` all carry a safe `userMessage` meant for exactly this. Anything else
 * propagates, and that includes `redirect("/login")` from an expired session: swallowing it would
 * turn "your session ended" into "something went wrong", and an unexpected failure should reach
 * the error boundary rather than be dressed up as a form message.
 */
async function gate(formData: FormData, permission: PermissionKey): Promise<Gate> {
  try {
    const principal = await requireInstitutionMutation(
      permission,
      field(formData, "institutionId"),
    );
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

/* ---- Applications (tasks 1, 2, 8) --------------------------------------- */

export async function createAdmissionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "admissions.create");
  if (!result.ok) return result.state;
  try {
    const created = await createAdmission(
      {
        institutionId: field(formData, "institutionId"),
        applicationNumber: field(formData, "applicationNumber"),
        firstName: field(formData, "firstName"),
        middleName: field(formData, "middleName"),
        lastName: field(formData, "lastName"),
        dateOfBirth: field(formData, "dateOfBirth"),
        gender: field(formData, "gender"),
        email: field(formData, "email"),
        phone: field(formData, "phone"),
        address: field(formData, "address"),
        academicSessionId: field(formData, "academicSessionId"),
        appliedClassId: field(formData, "appliedClassId"),
        appliedGroupId: field(formData, "appliedGroupId"),
        appliedGradeLevel: field(formData, "appliedGradeLevel"),
        testScore: field(formData, "testScore"),
        interviewScore: field(formData, "interviewScore"),
      },
      result.principal.userId,
    );
    revalidatePath("/admissions");
    return { status: "done", message: `Application ${created.applicationNumber} submitted.` };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function updateAdmissionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "admissions.update");
  if (!result.ok) return result.state;
  try {
    await updateAdmission({
      institutionId: field(formData, "institutionId"),
      admissionId: field(formData, "admissionId"),
      version: version(formData),
      firstName: field(formData, "firstName"),
      middleName: field(formData, "middleName"),
      lastName: field(formData, "lastName"),
      dateOfBirth: field(formData, "dateOfBirth"),
      gender: field(formData, "gender"),
      email: field(formData, "email"),
      phone: field(formData, "phone"),
      address: field(formData, "address"),
      academicSessionId: field(formData, "academicSessionId"),
      appliedClassId: field(formData, "appliedClassId"),
      appliedGroupId: field(formData, "appliedGroupId"),
      appliedGradeLevel: field(formData, "appliedGradeLevel"),
      testScore: field(formData, "testScore"),
      interviewScore: field(formData, "interviewScore"),
    });
  } catch (error) {
    /* A version conflict still refreshes the page: the hidden `version` token must pick up the
       current row, or every retry from the open dialog fails until a hard refresh. */
    if (error instanceof ConflictError) revalidateAdmission(formData);
    return stateFrom(error);
  }
  revalidateAdmission(formData);
  return { status: "done", message: "Application saved." };
}

/* ---- Decisions & conversion (tasks 10, 11, 3) --------------------------- */

export async function decideAdmissionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "admissions.approve");
  if (!result.ok) return result.state;
  try {
    await decide(
      {
        institutionId: field(formData, "institutionId"),
        admissionId: field(formData, "admissionId"),
        version: version(formData),
        to: field(formData, "to"),
        rejectionReason: field(formData, "rejectionReason"),
        decisionNotes: field(formData, "decisionNotes"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidateAdmission(formData);
    return stateFrom(error);
  }
  revalidateAdmission(formData);
  return { status: "done", message: "Decision recorded." };
}

export async function convertAdmissionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "admissions.approve");
  if (!result.ok) return result.state;
  try {
    await convert(
      {
        institutionId: field(formData, "institutionId"),
        admissionId: field(formData, "admissionId"),
        version: version(formData),

        admissionNumber: field(formData, "admissionNumber"),
        firstName: field(formData, "firstName"),
        middleName: field(formData, "middleName"),
        lastName: field(formData, "lastName"),
        email: field(formData, "email"),
        phone: field(formData, "phone"),
        address: field(formData, "address"),
        dateOfBirth: field(formData, "dateOfBirth"),
        gender: field(formData, "gender"),
        rollNumber: field(formData, "rollNumber"),

        academicSessionId: field(formData, "academicSessionId"),
        sectionId: field(formData, "sectionId"),
        academicYear: field(formData, "academicYear"),
        gradeLevel: field(formData, "gradeLevel"),
        departmentId: field(formData, "departmentId"),
        enrolledOn: field(formData, "enrolledOn"),

        guardianFirstName: field(formData, "guardianFirstName"),
        guardianLastName: field(formData, "guardianLastName"),
        guardianEmail: field(formData, "guardianEmail"),
        guardianPhone: field(formData, "guardianPhone"),
        guardianOccupation: field(formData, "guardianOccupation"),
        guardianAddress: field(formData, "guardianAddress"),
        guardianPassword: field(formData, "guardianPassword"),
        guardianRelationship: field(formData, "guardianRelationship"),
        guardianContactType: field(formData, "guardianContactType"),
        guardianIsFeePayer: checked(formData, "guardianIsFeePayer"),
        guardianReceivesNotifications: checked(formData, "guardianReceivesNotifications"),

        previousSchoolName: field(formData, "previousSchoolName"),
        previousSchoolAddress: field(formData, "previousSchoolAddress"),
        previousSchoolPhone: field(formData, "previousSchoolPhone"),
        previousSchoolClassAttended: field(formData, "previousSchoolClassAttended"),
        previousSchoolTcNumber: field(formData, "previousSchoolTcNumber"),
      },
      result.principal.userId,
    );
  } catch (error) {
    if (error instanceof ConflictError) revalidateAdmission(formData);
    return stateFrom(error);
  }
  revalidateAfterConvert(field(formData, "admissionId"));
  return { status: "done", message: "Application converted to a student." };
}

/* ---- Advisory duplicates (task 9) --------------------------------------- */

/**
 * The pre-submit name look-up — not a `FormState` action: the create dialog calls this directly
 * and renders the candidates inline before the real submit. `admissions.view` authorizes the read
 * (`SECURITY.md` §21 applies to look-ups too); failures come back as an `error` arm rather than
 * throwing across the wire.
 */
export async function previewDuplicatesAction(
  formData: FormData,
): Promise<
  | { readonly status: "ok"; readonly candidates: readonly DuplicateCandidateRow[] }
  | { readonly status: "error"; readonly message: string }
> {
  try {
    await requireInstitutionRead("admissions.view", field(formData, "institutionId"));
    const candidates = await previewDuplicates({
      institutionId: field(formData, "institutionId"),
      firstName: field(formData, "firstName"),
      lastName: field(formData, "lastName"),
      dateOfBirth: field(formData, "dateOfBirth"),
    });
    return { status: "ok", candidates };
  } catch (error) {
    /* Same contract as `gate`: only AppErrors become messages. `redirect("/login")` from an
       expired session and unexpected faults must keep their own handling, not be dressed up
       as "something went wrong". */
    if (isAppError(error)) return { status: "error", message: error.userMessage };
    throw error;
  }
}

/* ---- Documents (task 6) ------------------------------------------------- */

export async function registerAdmissionDocumentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "admissions.update");
  if (!result.ok) return result.state;
  try {
    await registerDocument(
      {
        institutionId: field(formData, "institutionId"),
        admissionId: field(formData, "admissionId"),
        documentType: field(formData, "documentType"),
        originalFileName: field(formData, "originalFileName"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateAdmission(formData);
  return { status: "done", message: "Document registered." };
}

export async function decideAdmissionDocumentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "admissions.update");
  if (!result.ok) return result.state;
  try {
    await decideDocument(
      {
        institutionId: field(formData, "institutionId"),
        admissionId: field(formData, "admissionId"),
        documentId: field(formData, "documentId"),
        decision: field(formData, "decision"),
        rejectionReason: field(formData, "rejectionReason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateAdmission(formData);
  return { status: "done", message: "Document decision saved." };
}
