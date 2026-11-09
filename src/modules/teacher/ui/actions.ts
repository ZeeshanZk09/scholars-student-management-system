"use server";

/**
 * Teacher domain server actions (`PHASES.md` §22, `ADR-0002`).
 */
import { revalidatePath } from "next/cache";

import { requireInstitutionMutation } from "@/lib/permissions-server";
import {
  addCompetence,
  assignTeacher,
  createTeacher,
  removeAssignment,
  updateTeacher,
} from "@/modules/teacher";
import type { Principal } from "@/shared/authorization";
import { isAppError, ValidationError } from "@/shared/errors";
import type { FormState } from "@/shared/forms";

function field(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function stateFrom(error: unknown): FormState {
  console.error("teacher action error:", error);
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

async function authorizeInstitution(
  formData: FormData,
): Promise<{ readonly ok: true; readonly principal: Principal } | { readonly ok: false; readonly state: FormState }> {
  try {
    const principal = await requireInstitutionMutation("academic.manage", field(formData, "institutionId"));
    return { ok: true, principal };
  } catch (error) {
    if (isAppError(error)) return { ok: false, state: stateFrom(error) };
    throw error;
  }
}

export async function createTeacherAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorizeInstitution(formData);
  if (!auth.ok) return auth.state;

  const institutionId = field(formData, "institutionId");
  const maxPeriods = field(formData, "maxPeriodsPerDay");

  try {
    await createTeacher({
      userId: field(formData, "userId"),
      institutionId,
      employeeCode: field(formData, "employeeCode") || null,
      firstName: field(formData, "firstName"),
      lastName: field(formData, "lastName") || null,
      email: field(formData, "email") || null,
      phone: field(formData, "phone") || null,
      departmentId: field(formData, "departmentId") || null,
      qualification: field(formData, "qualification") || null,
      maxPeriodsPerDay: maxPeriods ? Number.parseInt(maxPeriods, 10) : null,
      bio: field(formData, "bio") || null,
    });

    revalidatePath("/academics");
    revalidatePath("/teachers");
    return { status: "done", message: "Teacher profile created successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function updateTeacherAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorizeInstitution(formData);
  if (!auth.ok) return auth.state;

  const userId = field(formData, "userId");
  const institutionId = field(formData, "institutionId");
  const maxPeriods = field(formData, "maxPeriodsPerDay");

  try {
    await updateTeacher(
      userId,
      {
        firstName: field(formData, "firstName"),
        lastName: field(formData, "lastName") || null,
        employeeCode: field(formData, "employeeCode") || null,
        email: field(formData, "email") || null,
        phone: field(formData, "phone") || null,
        departmentId: field(formData, "departmentId") || null,
        qualification: field(formData, "qualification") || null,
        maxPeriodsPerDay: maxPeriods ? Number.parseInt(maxPeriods, 10) : null,
        bio: field(formData, "bio") || null,
      },
      institutionId,
    );

    revalidatePath("/teachers");
    revalidatePath(`/teachers/${userId}`);
    return { status: "done", message: "Teacher profile updated." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function assignTeacherAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorizeInstitution(formData);
  if (!auth.ok) return auth.state;

  const institutionId = field(formData, "institutionId");
  const teacherId = field(formData, "teacherId");
  const until = field(formData, "assignedUntil");

  try {
    await assignTeacher({
      institutionId,
      teacherId,
      academicSessionId: field(formData, "academicSessionId"),
      subjectId: field(formData, "subjectId") || null,
      classId: field(formData, "classId") || null,
      groupId: field(formData, "groupId") || null,
      sectionId: field(formData, "sectionId") || null,
      isClassTeacher: field(formData, "isClassTeacher") === "true",
      assignedFrom: new Date(),
      assignedUntil: until ? new Date(until) : null,
    });

    revalidatePath(`/teachers/${teacherId}`);
    revalidatePath("/teacher-portal");
    return { status: "done", message: "Teaching assignment added successfully." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function removeAssignmentFormAction(formData: FormData): Promise<void> {
  const institutionId = field(formData, "institutionId");
  await requireInstitutionMutation("academic.manage", institutionId);

  const assignmentId = field(formData, "assignmentId");
  const teacherId = field(formData, "teacherId");

  await removeAssignment(assignmentId, institutionId);
  revalidatePath(`/teachers/${teacherId}`);
  revalidatePath("/teacher-portal");
}

export async function removeTeacherAssignmentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorizeInstitution(formData);
  if (!auth.ok) return auth.state;

  const assignmentId = field(formData, "assignmentId");
  const teacherId = field(formData, "teacherId");
  const institutionId = field(formData, "institutionId");

  try {
    await removeAssignment(assignmentId, institutionId);
    revalidatePath(`/teachers/${teacherId}`);
    revalidatePath("/teacher-portal");
    return { status: "done", message: "Assignment removed." };
  } catch (error) {
    return stateFrom(error);
  }
}

export async function addTeacherCompetenceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await authorizeInstitution(formData);
  if (!auth.ok) return auth.state;

  const teacherUserId = field(formData, "teacherUserId");
  const institutionId = field(formData, "institutionId");
  const effectiveFrom = field(formData, "effectiveFrom") || new Date().toISOString().slice(0, 10);

  try {
    await addCompetence(
      {
        teacherUserId,
        subjectId: field(formData, "subjectId"),
        isVerified: true,
        verifiedByUserId: auth.principal.userId,
        effectiveFrom,
      },
      institutionId,
    );

    revalidatePath(`/teachers/${teacherUserId}`);
    return { status: "done", message: "Subject competence added." };
  } catch (error) {
    return stateFrom(error);
  }
}
