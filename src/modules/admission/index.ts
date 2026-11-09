/**
 * The admission module's public surface (`src/modules/README.md`): wires the Drizzle store into
 * the admission service, then exports one-call functions. Nothing outside the module reaches into
 * `application/`, `domain/` or `infrastructure/`.
 *
 * Phase 8 (tasks 1–15) covers applications, advisory duplicates, decisions, conversion into a
 * student, and document verification. Two wires meet here and nowhere else:
 *
 * - the {@link AdmissionStore} for persistence, and
 * - the student store as the {@link SessionGate} — the one question this module asks of academic
 *   data (*is this session open here?* — `assertSessionAcceptsPlacement`, shared through the
 *   student barrel) is answered by a scoped select that store already performs, so `index.ts`
 *   stays wiring only.
 *
 * **Callers own the gates.** Every institution-targeted command below is authorized by its caller
 * (`requireInstitutionMutation` in `ui/actions.ts`, permissions `admissions.view/create/update/
 * approve`) *before* it arrives; the service owns policy (zod boundary, transition legality,
 * rejection-reason rule, one-time conversion, advisory duplicates), the store owns integrity
 * (tenant guards, version checks, unique conflicts, and the single conversion transaction). Raw
 * `input: unknown` is by design — the boundary schema runs inside the service, so no caller can
 * bypass it.
 *
 * **`"use client"` files**: import *types* from this barrel; import value tuples and labels
 * (`ADMISSION_STATUS_LABELS`, `DECISION_STATUSES`, `ADMISSION_TRANSITIONS`, …) from
 * `@/modules/admission/domain/domain-rules` instead. This barrel re-exports the store
 * (`drizzle` → `pg` → `child_process`, none of which exist in a browser), and a **value** import
 * drags the whole graph into the client bundle — a type import is erased, so it does not. The
 * domain module is pure rules over `@/shared/errors`, which is why the presentation vocabulary
 * lives there (unlike the student module, whose option tuples are equally pure but historically
 * exported from here first). Getting this backwards does not fail typecheck; it fails at the
 * first visit to `/admissions` with `Can't resolve 'child_process'`.
 */
import { db } from "@/db/client";
import { createStudentStore } from "@/modules/student";

import { createAdmissionService } from "./application/admission-service";
import type {
  AdmissionService,
  Actor,
  CreateAdmissionResult,
} from "./application/admission-service";
import type {
  AdmissionDetail,
  AdmissionDetailRow,
  AdmissionDocumentRow,
  AdmissionHistoryRow,
  AdmissionListRow,
  DuplicateCandidateRow,
} from "./application/ports";
import type { AdmissionStatus } from "./domain/domain-rules";
import { drizzleAdmissionStore } from "./infrastructure/drizzle-store";

const admission: AdmissionService = createAdmissionService(
  drizzleAdmissionStore,
  createStudentStore(db),
);

/* ---- Applications (tasks 1, 2, 8) --------------------------------------- */

export function listAdmissions(institutionId: string, status?: AdmissionStatus | null) {
  return admission.listAdmissions(institutionId, status);
}

export function getAdmission(input: unknown) {
  return admission.getAdmission(input);
}

export function createAdmission(input: unknown, userId: string) {
  return admission.createAdmission(input, { userId });
}

export function updateAdmission(input: unknown) {
  return admission.updateAdmission(input);
}

/* ---- Decisions & conversion (tasks 10, 11, 3) --------------------------- */

export function decide(input: unknown, userId: string) {
  return admission.decide(input, { userId });
}

export function convert(input: unknown, userId: string) {
  return admission.convert(input, { userId });
}

/* ---- Advisory duplicates (task 9) --------------------------------------- */

export function previewDuplicates(input: unknown) {
  return admission.previewDuplicates(input);
}

/* ---- Documents (task 6) ------------------------------------------------- */

export function registerDocument(input: unknown, userId: string) {
  return admission.registerDocument(input, { userId });
}

export function decideDocument(input: unknown, userId: string) {
  return admission.decideDocument(input, { userId });
}

/**
 * Presentation vocabulary for **both** server pages and `"use client"` dialogs: the domain is
 * pure rules over `@/shared/errors`, safe to value-import anywhere (see the header).
 */
export {
  ADMISSION_STATUSES,
  ADMISSION_STATUS_LABELS,
  ADMISSION_TRANSITIONS,
  DECISION_STATUSES,
  EDITABLE_ADMISSION_STATUSES,
} from "./domain/domain-rules";

export type { AdmissionService, Actor, CreateAdmissionResult };
export type {
  AdmissionDetail,
  AdmissionDetailRow,
  AdmissionDocumentRow,
  AdmissionHistoryRow,
  AdmissionListRow,
  DuplicateCandidateRow,
};
export type { AdmissionStatus } from "./domain/domain-rules";
