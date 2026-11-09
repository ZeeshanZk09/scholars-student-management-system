"use server";

/**
 * Academic server actions (Phase 6 tasks 9, 11, 13 — institute & academic master data).
 *
 * Each action is the single path from `ui/` into the academic module's use cases
 * (`src/modules/README.md`). It runs **two gates before the command**:
 *
 * 1. the institution gate — `requireInstitutionMutation` resolves `academic.manage` *at* the
 *    institution the form names and refuses an institution this user does not belong to, so a
 *    forged `institutionId` can never widen a grant (`SECURITY.md` §21, §87); and
 * 2. the boundary schema — the zod input the module's `create*`/`update*` use case accepts.
 *
 * A refusal from either comes back as a serialisable `FormState` for `useActionState`, not as an
 * error boundary: the user stays on the form and reads why. A `redirect()` (expired session) is
 * deliberately *not* converted — see `authorizeInstitution`.
 *
 * The `isBreak` checkbox is normalised here: HTML sends `"on"` for a checked box and nothing when
 * unchecked, while the schema wants a boolean. `groupNames` arrives as a comma-separated string and
 * is split into the array the class schema expects.
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation, requirePlatformPermission } from "@/lib/permissions-server";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

import {
  closeSession,
  createAcademicSession,
  createBuilding,
  createCampus,
  createClass,
  createDepartment,
  createDesignation,
  createFloor,
  createGroup,
  createInstitution,
  createSection,
  createSubject,
  createTimeSlot,
  setCurrentSession,
  updateInstitution,
} from "@/modules/academic";

/** Raw `FormData` value for a key, or `""` when the part is absent. */
function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
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

/**
 * Run an authorization gate and normalise a refusal; `null` means "proceed".
 *
 * `AppError` becomes the `error` arm of `FormState` — `ForbiddenError`, `ValidationError` and
 * `ConflictError` all carry a safe `userMessage` meant for exactly this. Anything else
 * propagates, and that includes `redirect("/login")` from an expired session: swallowing it would
 * turn "your session ended" into "something went wrong", and an unexpected failure should reach
 * the error boundary rather than be dressed up as a form message.
 */
async function authorize(gate: () => Promise<unknown>): Promise<FormState | null> {
  try {
    await gate();
    return null;
  } catch (error) {
    if (isAppError(error)) return stateFrom(error);
    throw error;
  }
}

/** Institution-scoped gate: the target comes from the form and is checked, never trusted. */
async function authorizeInstitution(formData: FormData): Promise<FormState | null> {
  return authorize(() =>
    requireInstitutionMutation("academic.manage", field(formData, "institutionId")),
  );
}

/**
 * Platform gate for the one command with no target institution: creating an institution *is* the
 * platform acting, so only a principal holding `academic.manage` at platform scope passes.
 */
async function authorizePlatform(): Promise<FormState | null> {
  return authorize(() => requirePlatformPermission("academic.manage"));
}

export async function createInstitutionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizePlatform();
  if (refused !== null) return refused;
  try {
    await createInstitution({
      name: field(formData, "name"),
      kind: field(formData, "kind"),
      email: field(formData, "email"),
      code: field(formData, "code"),
      phone: field(formData, "phone"),
      address: field(formData, "address"),
      website: field(formData, "website"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics");
  return { status: "done", message: "Institution saved." };
}

export async function updateInstitutionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await updateInstitution({
      institutionId: field(formData, "institutionId"),
      version: Number(field(formData, "version")),
      name: field(formData, "name"),
      kind: field(formData, "kind"),
      email: field(formData, "email"),
      code: field(formData, "code"),
      phone: field(formData, "phone"),
      address: field(formData, "address"),
      website: field(formData, "website"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics");
  return { status: "done", message: "Institution saved." };
}

export async function createCampusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createCampus({
      institutionId: field(formData, "institutionId"),
      name: field(formData, "name"),
      address: field(formData, "address"),
      phone: field(formData, "phone"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/facilities");
  return { status: "done", message: "Campus added." };
}

export async function createBuildingAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createBuilding({
      institutionId: field(formData, "institutionId"),
      campusId: field(formData, "campusId"),
      name: field(formData, "name"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/facilities");
  return { status: "done", message: "Building added." };
}

export async function createFloorAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createFloor({
      institutionId: field(formData, "institutionId"),
      buildingId: field(formData, "buildingId"),
      name: field(formData, "name"),
      level: field(formData, "level"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/facilities");
  return { status: "done", message: "Floor added." };
}

export async function createDepartmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createDepartment({
      institutionId: field(formData, "institutionId"),
      name: field(formData, "name"),
      description: field(formData, "description"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/departments");
  return { status: "done", message: "Department added." };
}

export async function createDesignationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createDesignation({
      institutionId: field(formData, "institutionId"),
      departmentId: field(formData, "departmentId"),
      name: field(formData, "name"),
      description: field(formData, "description"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/departments");
  return { status: "done", message: "Designation added." };
}

export async function createAcademicSessionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createAcademicSession({
      institutionId: field(formData, "institutionId"),
      name: field(formData, "name"),
      startDate: field(formData, "startDate"),
      endDate: field(formData, "endDate"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/sessions");
  return { status: "done", message: "Session added." };
}

export async function setCurrentSessionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await setCurrentSession({
      institutionId: field(formData, "institutionId"),
      sessionId: field(formData, "sessionId"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/sessions");
  return { status: "done", message: "Current session updated." };
}

export async function closeSessionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await closeSession({
      institutionId: field(formData, "institutionId"),
      sessionId: field(formData, "sessionId"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/sessions");
  return { status: "done", message: "Session closed." };
}

function groupNames(formData: FormData): string[] {
  return field(formData, "groupNames")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export async function createClassAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createClass({
      institutionId: field(formData, "institutionId"),
      academicSessionId: field(formData, "academicSessionId"),
      name: field(formData, "name"),
      gradeLevel: field(formData, "gradeLevel"),
      departmentId: field(formData, "departmentId"),
      description: field(formData, "description"),
      groupNames: groupNames(formData),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/classes");
  return { status: "done", message: "Class added." };
}

export async function createGroupAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createGroup({
      institutionId: field(formData, "institutionId"),
      classId: field(formData, "classId"),
      name: field(formData, "name"),
      description: field(formData, "description"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/classes");
  return { status: "done", message: "Group added." };
}

export async function createSectionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createSection({
      institutionId: field(formData, "institutionId"),
      groupId: field(formData, "groupId"),
      name: field(formData, "name"),
      capacity: field(formData, "capacity"),
      floorId: field(formData, "floorId"),
      campusId: field(formData, "campusId"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/classes");
  return { status: "done", message: "Section added." };
}

export async function createSubjectAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createSubject({
      institutionId: field(formData, "institutionId"),
      name: field(formData, "name"),
      code: field(formData, "code"),
      kind: field(formData, "kind"),
      departmentId: field(formData, "departmentId"),
      description: field(formData, "description"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/subjects");
  return { status: "done", message: "Subject added." };
}

export async function createTimeSlotAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await authorizeInstitution(formData);
  if (refused !== null) return refused;
  try {
    await createTimeSlot({
      institutionId: field(formData, "institutionId"),
      academicSessionId: field(formData, "academicSessionId"),
      name: field(formData, "name"),
      startTime: field(formData, "startTime"),
      endTime: field(formData, "endTime"),
      sequence: field(formData, "sequence"),
      isBreak: formData.has("isBreak"),
    });
  } catch (error) {
    return stateFrom(error);
  }
  revalidatePath("/academics/time-slots");
  return { status: "done", message: "Time slot added." };
}
