/**
 * "Which institution is this request acting in?" — resolved once per page render and shared by
 * every institution-scoped route (`/academics/*`, `/students`, `/guardians`, …).
 *
 * Three sources, in order, and never the browser's word alone (`SECURITY.md` §22):
 *
 * 1. **`?institution=`** — an explicit, URL-visible selection. It is *authorized* through
 *    `requireInstitutionRead` (affiliation bound + capability resolved at that institution), so the
 *    parameter selects among institutions this principal may already act in and can never widen
 *    one. This is how a platform administrator with several tenants reaches a specific tenant's
 *    sessions or classes; it is deliberately per-request rather than a session cookie, so the
 *    address bar and the data on screen always name the same tenant.
 * 2. **The acting institution** — derived from `user_institutions` (`MEMORY.md` §9).
 * 3. **The sole configured institution** — for a platform administrator, who has no affiliations,
 *    when exactly one tenant exists.
 *
 * `institution === null` is a real, reachable answer (no tenant exists yet, or a platform admin
 * has several and has not picked one). Pages render an empty state that says so instead of
 * guessing, and no create form is offered until a target exists.
 */
import { redirect } from "next/navigation";

import {
  getActingInstitutionId,
  getCurrentPrincipal,
  requireInstitutionRead,
  requireUserPermission,
} from "@/lib/permissions-server";
import { listInstitutions, type InstitutionRow } from "@/modules/academic";
import { hasPermission, type PermissionKey, type Principal } from "@/shared/authorization";
import { NotFoundError } from "@/shared/errors";

export interface InstitutionPageContext {
  /** The principal resolved *at* {@link institution} (or platform context when there is none). */
  readonly principal: Principal;
  /** The institution this page operates on, or `null` when there is nothing to operate on yet. */
  readonly institution: InstitutionRow | null;
  /**
   * Every institution this principal may act in — one for an affiliated user, all of them for a
   * platform administrator. Drives the switcher, which renders only when there is a choice.
   */
  readonly institutions: readonly InstitutionRow[];
  /** Whether this principal holds `permission` at platform scope (can mint and switch tenants). */
  readonly isPlatformAdmin: boolean;
}

/**
 * Gate the page, then resolve the institution it is about.
 *
 * @param permission - The capability the page needs. Ask the same key the navigation item that
 *   links to the page is gated on (e.g. `academic.manage` for `/academics/*`, `students.view`
 *   for `/students`): a menu item and the page it links to must ask the same question, or the
 *   shell offers a link the page then refuses.
 * @param requested - `searchParams.institution`, if the URL selected one.
 * @throws {ForbiddenError} When the URL named an institution this principal may not act in.
 */
export async function resolveInstitutionContext(
  permission: PermissionKey,
  requested?: string | string[],
): Promise<InstitutionPageContext> {
  // Session + capability where this user is standing. Redirects to /login when there is none.
  await requireUserPermission(permission);

  const actingId = await getActingInstitutionId();
  const platformPrincipal = await getCurrentPrincipal(null);
  const isPlatformAdmin =
    platformPrincipal !== null && hasPermission(platformPrincipal, permission);

  const all = await listInstitutions();
  const institutions = isPlatformAdmin
    ? all
    : actingId === null
      ? []
      : all.filter((institution) => institution.id === actingId);

  const selection = typeof requested === "string" ? requested.trim() : "";
  let institutionId = actingId;

  if (selection.length > 0) {
    await requireInstitutionRead(permission, selection);
    const found = institutions.find((institution) => institution.id === selection);
    if (found === undefined) {
      throw new NotFoundError("Institution does not exist.", {
        userMessage: "That institution is not available. Refresh the page and try again.",
      });
    }
    institutionId = found.id;
  } else if (institutionId === null && institutions.length === 1) {
    institutionId = institutions[0]?.id ?? null;
  }

  const institution =
    institutionId === null
      ? null
      : (institutions.find((candidate) => candidate.id === institutionId) ?? null);

  // Resolved *at* the selected institution so badges and any per-tenant decision agree with the
  // data on screen. The session was already proven above, so this cannot legitimately be null.
  const principal =
    institution === null
      ? await getCurrentPrincipal(null)
      : await getCurrentPrincipal(institution.id);
  if (principal === null) {
    redirect("/login");
  }

  return { principal, institution, institutions, isPlatformAdmin };
}
