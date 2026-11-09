/**
 * The student module's public surface (`src/modules/README.md`): wires the Drizzle store into the
 * student service, then exports one-call functions. Nothing outside the module reaches into
 * `application/`, `domain/` or `infrastructure/`.
 *
 * Phase 7 (tasks 1–17) covers student profiles, lifecycle and archival, placement and enrollment,
 * guardian accounts and links, and document verification. Two wires meet here and nowhere else:
 *
 * - the {@link StudentStore} for persistence, and
 * - the same store as the {@link SessionGate} — the one question this module asks of academic data
 *   (*does this session exist here, and is it open?*) is answered by a scoped select the store
 *   already performs alongside its placement joins, so `index.ts` stays wiring only.
 *
 * **Callers own the gates.** Every institution-targeted command below is authorized by its caller
 * (`requireInstitutionMutation` in `ui/actions.ts`) *before* it arrives; the service owns policy
 * (zod boundary, lifecycle edges, open-session rule, one primary guardian), the store owns
 * integrity (tenant guards, unique conflicts, version checks). Raw `input: unknown` is by design —
 * the boundary schema runs inside the service, so no caller can bypass it.
 *
 * **`"use client"` files**: import *types* from this barrel; import the value option lists
 * (`GENDER_VALUES`, `LIFECYCLE_LABELS`, …) from `@/modules/student/domain/domain-rules` instead.
 * This barrel re-exports the store (`drizzle` → `pg` → `child_process`, none of which exist in a
 * browser), and a **value** import drags the whole graph into the client bundle — a type import is
 * erased, so it does not. The student module cannot offer the same escape hatch academic does
 * (`application/schemas`): that file imports the auth barrel for `PASSWORD_MIN_LENGTH`, and the
 * auth barrel is server-only too. The domain module is pure rules over `@/shared/errors`, which is
 * why the option tuples live there. Getting this backwards does not fail typecheck; it fails at
 * the first visit to `/students` with `Can't resolve 'child_process'`.
 */
import { createStudentService } from "./application/student-service";
import type { CreateResult, StudentService } from "./application/student-service";
import type {
  DocumentRow,
  EnrollmentRow,
  GuardianLinkRow,
  GuardianListRow,
  GuardianRow,
  PlacementRow,
  StudentDetail,
  StudentListRow,
} from "./application/ports";
import { createStudentStore, drizzleStudentStore } from "./infrastructure/drizzle-store";

const student: StudentService = createStudentService(drizzleStudentStore, drizzleStudentStore);

/* ---- Roster & detail (tasks 1, 7–12) ---------------------------------- */

export function listStudents(institutionId: string) {
  return student.listStudents(institutionId);
}

export function getStudent(institutionId: string, studentId: string) {
  return student.getStudent(institutionId, studentId);
}

/* ---- Profile (tasks 2, 7, 8, 9) --------------------------------------- */

export function createStudent(input: unknown) {
  return student.createStudent(input);
}

export function updateStudent(input: unknown) {
  return student.updateStudent(input);
}

export function setStudentLifecycle(input: unknown) {
  return student.setStudentLifecycle(input);
}

export function archiveStudent(input: unknown) {
  return student.archiveStudent(input);
}

export function unarchiveStudent(input: unknown) {
  return student.unarchiveStudent(input);
}

/* ---- Placement & enrollment (tasks 11, 12) ----------------------------- */

export function placeStudent(input: unknown, userId: string) {
  return student.placeStudent(input, { userId });
}

export function enrollStudent(input: unknown, userId: string) {
  return student.enrollStudent(input, { userId });
}

/* ---- Guardians (tasks 4–6, 15–16) ------------------------------------- */

export function listGuardians(institutionId: string) {
  return student.listGuardians(institutionId);
}

export function getGuardian(guardianUserId: string) {
  return student.getGuardian(guardianUserId);
}

export function createGuardian(input: unknown, userId: string) {
  return student.createGuardian(input, { userId });
}

export function updateGuardian(input: unknown) {
  return student.updateGuardian(input);
}

export function linkGuardian(input: unknown, userId: string) {
  return student.linkGuardian(input, { userId });
}

export function unlinkGuardian(input: unknown, userId: string) {
  return student.unlinkGuardian(input, { userId });
}

/* ---- Documents (task 10) ---------------------------------------------- */

export function registerDocument(input: unknown, userId: string) {
  return student.registerDocument(input, { userId });
}

export function decideDocument(input: unknown, userId: string) {
  return student.decideDocument(input, { userId });
}

/**
 * Presentation constants for **server** pages (badges, filter labels). `"use client"` files take
 * the same tuples from `@/modules/student/domain/domain-rules` — see the header.
 */
export {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  GENDER_VALUES,
  GUARDIAN_CONTACT_TYPES,
  GUARDIAN_RELATIONSHIPS,
  LIFECYCLE_LABELS,
  PLACEMENT_REASONS,
  STUDENT_LIFECYCLE_STATES,
  /**
   * The open-session placement rule (Phase 8). Conversion writes a placement, so admission asks
   * this question through the same shared rule rather than restating it — a domain value over
   * `@/shared/errors`, safe to import anywhere the service runs.
   */
  assertSessionAcceptsPlacement,
} from "./domain/domain-rules";

/**
 * The cross-module transaction seam (Phase 8). Re-creating the store over an `DbLike` runs every
 * write inside the caller's transaction — the only supported way another module touches a
 * `students`/`guardians` row. Nothing outside this module may import the store directly.
 */
export { createStudentStore };

/** The insert shapes admission conversion passes through the seam. */
export type {
  EnrollmentInsert,
  GuardianLinkSeed,
  GuardianProfileInsert,
  PlacementInsert,
  PreviousSchoolInsert,
  StudentInsert,
} from "./application/ports";

export type { CreateResult, StudentService };
export type {
  DocumentRow,
  EnrollmentRow,
  GuardianLinkRow,
  GuardianListRow,
  GuardianRow,
  PlacementRow,
  StudentDetail,
  StudentListRow,
};
export type {
  DocumentStatus,
  DocumentType,
  Gender,
  GuardianContactType,
  GuardianRelationship,
  PlacementReason,
  SessionView,
  StudentLifecycle,
} from "./domain/domain-rules";
