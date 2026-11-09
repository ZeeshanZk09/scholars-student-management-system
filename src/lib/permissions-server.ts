/**
 * The server-side authorization boundary every protected route and server action goes through.
 *
 * Three gates, in the order `RULES.md` §18 and `ADR-0001` require, and nothing else:
 *
 * 1. **Session** — `verifySession` (which redirects to `/login` when absent).
 * 2. **Capability** — `requirePermission` against a `Principal` resolved here.
 * 3. **Scope** — for institution-targeted writes, {@link requireInstitutionMutation}, which
 *    resolves the capability *at* the target institution and refuses an institution the user does
 *    not belong to (`SECURITY.md` §21, §87).
 *
 * ## Where the institution comes from
 *
 * Never from the request unless the request is the thing being scoped. A page has no institution
 * in it, so {@link getCurrentPrincipal} asks {@link getActingInstitutionId}, which derives the
 * context from the `user_institutions` affiliations — the server's own answer to "where is this
 * user acting?", exactly as `SECURITY.md` §22 requires ("verify the institution context"; never
 * "trust the claim"). A write *does* name an institution, and that name is used as a **scope
 * filter for the grant lookup**, not as an assertion of authority: a forged `institutionId` can
 * only ever make the visible grant set smaller.
 *
 * Reading `institutionId` out of a `FormData` and passing it to a permission check that resolves
 * at `null` — which is what every caller did before this file existed — is the hole `§87` names
 * (`institutionId = "another-institution"`): the check ran in a context where no institution-scoped
 * grant could ever apply, so a platform grant of the capability authorised a write into any
 * tenant. Scoping the lookup closes it structurally rather than by asking each caller to remember.
 */
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import {
  authorizeInstitutionCommand,
  resolveActingInstitutionId,
  resolvePrincipal,
} from "@/modules/authorization";
import { ValidationError } from "@/shared/errors";
import {
  hasPermission,
  requirePermission,
  type PermissionKey,
  type Principal,
} from "@/shared/authorization";

import { verifySession } from "./dal";

/**
 * The institution to act within when the request does not name one.
 *
 * Derived from `user_institutions` and memoised for the request, so a layout, a page and an
 * action all agree on one context instead of each inventing its own. `null` is a real answer —
 * a platform-level user — not a failure.
 */
export const getActingInstitutionId = cache(async (): Promise<string | null> => {
  const session = await verifySession();
  if (session === null) return null;
  return resolveActingInstitutionId(session.userId);
});

/**
 * The principal for a request, resolved at the acting institution unless one is supplied.
 *
 * Callers that pass `null` explicitly are asking for platform context on purpose; callers that
 * pass an institution are scoping to it. The default (no argument) is the common case — a page
 * rendering inside whatever institution this user belongs to.
 */
export const getCurrentPrincipal = cache(
  async (institutionId?: string | null): Promise<Principal | null> => {
    const session = await verifySession();
    if (session === null) return null;
    const scope = institutionId === undefined ? await getActingInstitutionId() : institutionId;
    return resolvePrincipal({ userId: session.userId, institutionId: scope });
  },
);

/**
 * Step 2 for a page or any other read: does this principal hold `permission` where they are
 * standing?
 *
 * @throws a redirect to `/login` when there is no session — a page must never render for an
 *   anonymous visitor, even one whose capabilities would be empty anyway.
 */
export async function requireUserPermission(permission: PermissionKey): Promise<Principal> {
  const session = await verifySession();
  if (session === null) {
    redirect("/login");
  }

  const principal = await getCurrentPrincipal();
  if (principal === null) {
    redirect("/login");
  }

  requirePermission(principal, permission);
  return principal;
}

/**
 * Step 2 for an operation that *is* the platform acting — creating an institution, managing the
 * role catalogue. The principal is resolved with no institution context at all, so only platform
 * grants (`roles.institution_id is null`) can satisfy it: an institution-scoped `academic.manage`
 * holder administers their own academic structure but cannot mint a sibling tenant.
 */
export async function requirePlatformPermission(permission: PermissionKey): Promise<Principal> {
  const session = await verifySession();
  if (session === null) {
    redirect("/login");
  }

  const principal = await resolvePrincipal({ userId: session.userId, institutionId: null });
  requirePermission(principal, permission);
  return principal;
}

/**
 * Steps 2 and 3 for one institution-targeted command — the call every mutating server action
 * makes, in place of a permission check plus a client-supplied `institutionId`.
 *
 * @param institutionId - The institution the command writes to, as asserted by the request. It is
 *   checked against `user_institutions` and used to scope the grant lookup; it is never trusted.
 * @throws {ValidationError} When the request named no institution at all (a malformed form, not
 *   a refused user — the client shows it as a field issue).
 * @throws {ForbiddenError} When the user does not belong to that institution, or holds no live
 *   grant covering `permission` there.
 */
export async function requireInstitutionMutation(
  permission: PermissionKey,
  institutionId: string,
): Promise<Principal> {
  const session = await verifySession();
  if (session === null) {
    redirect("/login");
  }

  if (institutionId.length === 0) {
    throw new ValidationError("Missing institution", { institutionId: ["Select an institution."] });
  }

  return authorizeInstitutionCommand({ userId: session.userId, institutionId, permission });
}

/**
 * Steps 2 and 3 for one institution-targeted **read**.
 *
 * A read makes the same claim a write does — "I may act on this institution" — so it goes through
 * the identical three gates rather than trusting an `?institution=` query parameter. Without this,
 * a URL would be the only thing standing between a signed-in user and a sibling tenant's class
 * list, which is `SECURITY.md` §22's "verify the institution context, never trust the claim" applied
 * to navigation instead of to a form.
 *
 * Callers resolve the institution first (see `src/app/(app)/_lib/context.ts`); an empty
 * id here is a programming error, not a user error, and it still surfaces as a `ValidationError`
 * rather than as a silent platform-wide read.
 */
export async function requireInstitutionRead(
  permission: PermissionKey,
  institutionId: string,
): Promise<Principal> {
  return requireInstitutionMutation(permission, institutionId);
}

/** Whether the current principal holds a capability at the acting institution. Never a gate. */
export async function canUser(permission: PermissionKey): Promise<boolean> {
  const principal = await getCurrentPrincipal();
  return principal !== null && hasPermission(principal, permission);
}

export type { PermissionKey, Principal };
export { hasPermission, requirePermission };
