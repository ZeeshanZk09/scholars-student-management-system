/**
 * Authorization enforcement primitives, per `RULES.md` §18 and `ADR-0001`.
 *
 * ## The five steps, and what this module covers
 *
 * `RULES.md` §18 requires every protected operation to pass through five gates:
 *
 * 1. has the required role → resolved into 2, since a role only ever confers permissions;
 * 2. has the required **capability** → {@link requirePermission};
 * 3. has access to **this resource** → {@link requireInstitutionScope} and {@link requireSelfScope}
 *    for the two pure id comparisons; the guardian and teaching-assignment rules need the
 *    relationship loaded first and therefore belong in the application layer;
 * 4. is the action legal in the **current state** → domain-specific, so it lives with the domain;
 * 5. perform the operation.
 *
 * Only the steps that can be decided without a database are here. The others are deliberately
 * absent: a shared module cannot load a guardian link or a teaching assignment, and a "framework"
 * that took callbacks for them would only move the decision somewhere less readable.
 *
 * ## What is deliberately not here
 *
 * **No super-administrator bypass flag.** It would be a single boolean that skips every check, which
 * is the shape of the bug `RULES.md` §19 warns about and `ADR-0001` was written to remove. A
 * super administrator holds the system role whose grants cover everything, so its authority is
 * visible as data and appears in the same audit trail as any other grant. If a bypass is ever
 * genuinely required, it belongs in an ADR with its audit consequences, not in this file.
 */
import { ForbiddenError } from "../errors";
import type { PermissionKey } from "./permissions";

/**
 * Who is asking, and what they currently hold.
 *
 * Assembled from the session in Phase 4. Carries no roles: roles are an implementation detail that
 * resolves to permissions, and keeping them out of this type makes it impossible to write a check
 * that branches on a role name.
 */
export interface Principal {
  readonly userId: string;
  /**
   * The institution this principal acts within, or `null` for a platform-level principal.
   *
   * `null` means "not scoped to one institution" and is deliberately distinct from being scoped to
   * an institution that happens to be missing.
   */
  readonly institutionId: string | null;
  readonly permissions: ReadonlySet<PermissionKey>;
}

/**
 * Step 2 — require a capability.
 *
 * @throws {ForbiddenError} When the principal does not hold the permission.
 */
export function requirePermission(principal: Principal, permission: PermissionKey): void {
  if (!principal.permissions.has(permission)) {
    throw new ForbiddenError("Missing permission", {
      details: { permission, userId: principal.userId },
    });
  }
}

/** Return whether a principal holds a capability, for filtering a list rather than guarding one row. */
export function hasPermission(principal: Principal, permission: PermissionKey): boolean {
  return principal.permissions.has(permission);
}

/**
 * Step 3 — require that a record belongs to the principal's institution.
 *
 * A platform-level principal (`institutionId === null`) passes: its authority is not scoped to a
 * single institution, which is the point of a super administrator.
 *
 * @param recordInstitutionId - The `institutionId` of the record being acted on.
 * @throws {ForbiddenError} When the record belongs to a different institution.
 */
export function requireInstitutionScope(principal: Principal, recordInstitutionId: string): void {
  if (principal.institutionId === null) {
    return;
  }

  if (principal.institutionId !== recordInstitutionId) {
    throw new ForbiddenError("Outside your institution", {
      details: { userId: principal.userId },
    });
  }
}

/**
 * Step 3 — require that a record is the principal's own (`PRD.md` §5.7).
 *
 * @throws {ForbiddenError} When the record belongs to somebody else.
 */
export function requireSelfScope(principal: Principal, recordOwnerUserId: string): void {
  if (principal.userId !== recordOwnerUserId) {
    throw new ForbiddenError("Not your record", { details: { userId: principal.userId } });
  }
}
