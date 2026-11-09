"use server";

/**
 * Student & guardian server actions (Phase 7 tasks 14–17).
 *
 * Each action is the single path from `ui/` into the student module's use cases
 * (`src/modules/README.md`). It runs **two gates before the command** — the same pattern as
 * `src/modules/academic/ui/actions.ts`, with the student module's own permission keys:
 *
 * 1. the institution gate — `requireInstitutionMutation` resolves the key *at* the institution
 *    the form names and refuses an institution this user does not belong to, so a forged
 *    `institutionId` can never widen a grant (`SECURITY.md` §21, §87). The keys, paired exactly
 *    with the navigation items that link to the pages (`PHASES.md` Phase 7 task 14):
 *
 *    | command                          | key               | gate   |
 *    |----------------------------------|-------------------|--------|
 *    | create student                   | `students.create` | mutate |
 *    | update / lifecycle / archive / enroll / place / documents | `students.update` | mutate |
 *    | guardian create / update / link / unlink | `guardians.manage` | mutate |
 *
 *    (`students.view` / `guardians.view` are *page* gates — they authorize the reads in
 *    `page.tsx` via `resolveInstitutionContext`, never a mutation here. The UI's own hiding of
 *    buttons is a courtesy, not authorization: every one of these actions re-checks server-side.)
 *
 * 2. the boundary schema — the zod input the module's `create*`/`update*` use case accepts
 *    (`application/schemas.ts`). Normalisations the schema cannot make from a string arrive here:
 *    `version` becomes a number, checkboxes become booleans (`formData.has` — an unchecked box
 *    sends nothing, and `receivesNotifications` must be `false`, not its schema default).
 *
 * A refusal from either comes back as a serialisable `FormState` for `useActionState`, not as an
 * error boundary: the user stays on the form and reads why. A `redirect()` (expired session) is
 * deliberately *not* converted — see `gate`.
 *
 * Commands that stamp an actor (`placeStudent`, `enrollStudent`, guardian link/unlink, document
 * registration and verification) receive the acting `principal.userId` from the gate itself; the
 * client never supplies the "who did this" field.
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import type { PermissionKey, Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

import {
  archiveStudent,
  createGuardian,
  createStudent,
  decideDocument,
  enrollStudent,
  linkGuardian,
  placeStudent,
  registerDocument,
  setStudentLifecycle,
  unlinkGuardian,
  unarchiveStudent,
  updateGuardian,
  updateStudent,
} from "@/modules/student";

/** Two views of a child's record always move together. */
const STUDENT_PATHS = ["/students", "/student-info"] as const;
/** A guardian is rendered on its own roster and inside the student's detail. */
const GUARDIAN_PATHS = ["/guardians", "/student-info"] as const;

function revalidateStudent(): void {
  for (const path of STUDENT_PATHS) revalidatePath(path);
}

function revalidateGuardians(): void {
  for (const path of GUARDIAN_PATHS) revalidatePath(path);
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

/* ---- Roster & profile (tasks 1, 7–9) ------------------------------------ */

export async function createStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.create");
  if (!result.ok) return result.state;
  try {
    await createStudent({
      institutionId: field(formData, "institutionId"),
      admissionNumber: field(formData, "admissionNumber"),
      firstName: field(formData, "firstName"),
      middleName: field(formData, "middleName"),
      lastName: field(formData, "lastName"),
      dateOfBirth: field(formData, "dateOfBirth"),
      gender: field(formData, "gender"),
      email: field(formData, "email"),
      phone: field(formData, "phone"),
      address: field(formData, "address"),
      rollNumber: field(formData, "rollNumber"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidateStudent();
  return { status: "done", message: "Student added." };
}

export async function updateStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await updateStudent({
      institutionId: field(formData, "institutionId"),
      studentId: field(formData, "studentId"),
      version: version(formData),
      admissionNumber: field(formData, "admissionNumber"),
      firstName: field(formData, "firstName"),
      middleName: field(formData, "middleName"),
      lastName: field(formData, "lastName"),
      dateOfBirth: field(formData, "dateOfBirth"),
      gender: field(formData, "gender"),
      email: field(formData, "email"),
      phone: field(formData, "phone"),
      address: field(formData, "address"),
      rollNumber: field(formData, "rollNumber"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidateStudent();
  return { status: "done", message: "Student saved." };
}

export async function setStudentLifecycleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await setStudentLifecycle({
      institutionId: field(formData, "institutionId"),
      studentId: field(formData, "studentId"),
      lifecycle: field(formData, "lifecycle"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidateStudent();
  return { status: "done", message: "Student status updated." };
}

export async function archiveStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await archiveStudent({
      institutionId: field(formData, "institutionId"),
      studentId: field(formData, "studentId"),
      version: version(formData),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidateStudent();
  return { status: "done", message: "Student archived." };
}

export async function unarchiveStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await unarchiveStudent({
      institutionId: field(formData, "institutionId"),
      studentId: field(formData, "studentId"),
      version: version(formData),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidateStudent();
  return { status: "done", message: "Student restored." };
}

/* ---- Placement & enrollment (tasks 11–12) -------------------------------- */

export async function placeStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await placeStudent(
      {
        institutionId: field(formData, "institutionId"),
        studentId: field(formData, "studentId"),
        academicSessionId: field(formData, "academicSessionId"),
        sectionId: field(formData, "sectionId"),
        placementReason: field(formData, "placementReason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateStudent();
  return { status: "done", message: "Student placed." };
}

export async function enrollStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await enrollStudent(
      {
        institutionId: field(formData, "institutionId"),
        studentId: field(formData, "studentId"),
        academicSessionId: field(formData, "academicSessionId"),
        academicYear: field(formData, "academicYear"),
        gradeLevel: field(formData, "gradeLevel"),
        departmentId: field(formData, "departmentId"),
        enrolledOn: field(formData, "enrolledOn"),
        description: field(formData, "description"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateStudent();
  return { status: "done", message: "Student enrolled." };
}

/* ---- Guardians (tasks 4–6, 15–16) ---------------------------------------- */

export async function createGuardianAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "guardians.manage");
  if (!result.ok) return result.state;
  try {
    await createGuardian(
      {
        firstName: field(formData, "firstName"),
        lastName: field(formData, "lastName"),
        email: field(formData, "email"),
        phone: field(formData, "phone"),
        occupation: field(formData, "occupation"),
        address: field(formData, "address"),
        password: field(formData, "password"),
        institutionId: field(formData, "institutionId"),
        studentId: field(formData, "studentId"),
        relationship: field(formData, "relationship"),
        contactType: field(formData, "contactType"),
        isFeePayer: checked(formData, "isFeePayer"),
        receivesNotifications: checked(formData, "receivesNotifications"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateGuardians();
  return { status: "done", message: "Guardian added." };
}

export async function updateGuardianAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "guardians.manage");
  if (!result.ok) return result.state;
  try {
    await updateGuardian({
      institutionId: field(formData, "institutionId"),
      guardianUserId: field(formData, "guardianUserId"),
      firstName: field(formData, "firstName"),
      lastName: field(formData, "lastName"),
      phone: field(formData, "phone"),
      occupation: field(formData, "occupation"),
      address: field(formData, "address"),
      version: version(formData),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidateGuardians();
  return { status: "done", message: "Guardian saved." };
}

export async function linkGuardianAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "guardians.manage");
  if (!result.ok) return result.state;
  try {
    await linkGuardian(
      {
        institutionId: field(formData, "institutionId"),
        guardianUserId: field(formData, "guardianUserId"),
        studentId: field(formData, "studentId"),
        relationship: field(formData, "relationship"),
        contactType: field(formData, "contactType"),
        isFeePayer: checked(formData, "isFeePayer"),
        receivesNotifications: checked(formData, "receivesNotifications"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateGuardians();
  return { status: "done", message: "Guardian linked." };
}

export async function unlinkGuardianAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "guardians.manage");
  if (!result.ok) return result.state;
  try {
    await unlinkGuardian(
      {
        institutionId: field(formData, "institutionId"),
        guardianUserId: field(formData, "guardianUserId"),
        studentId: field(formData, "studentId"),
        reason: field(formData, "reason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidateGuardians();
  return { status: "done", message: "Guardian unlinked." };
}

/* ---- Documents (task 10) ------------------------------------------------- */

export async function registerDocumentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await registerDocument(
      {
        institutionId: field(formData, "institutionId"),
        studentId: field(formData, "studentId"),
        documentType: field(formData, "documentType"),
        originalFileName: field(formData, "originalFileName"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/student-info");
  return { status: "done", message: "Document registered." };
}

export async function decideDocumentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await gate(formData, "students.update");
  if (!result.ok) return result.state;
  try {
    await decideDocument(
      {
        institutionId: field(formData, "institutionId"),
        studentId: field(formData, "studentId"),
        documentId: field(formData, "documentId"),
        decision: field(formData, "decision"),
        rejectionReason: field(formData, "rejectionReason"),
      },
      result.principal.userId,
    );
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/student-info");
  return { status: "done", message: "Document decision saved." };
}
