/**
 * The use case Phase 4 task 7 exists to provide: turning a `userId` into a `Principal`.
 *
 * It is deliberately small — fetch every live grant, resolve the effective set, return the
 * principal — because all the rules live in `domain/effective-permissions.ts` and the gate in
 * `src/shared/authorization/principal.ts`. What is decided *here* is the shape of the result:
 *
 * - the principal carries **no roles** (`RULES.md` §19: never branch on a role name), and
 * - the acting institution is the caller's context, not something a user asserts. The store is
 *   never asked "who can act anywhere"; it is asked "who is this, and where are they acting?"
 *
 * The two later functions close the gap that leaves (`SECURITY.md` §21, §87): a capability check
 * with no institution context answers only "may a platform-level actor do this?", so every
 * institution-scoped write needs both *where* (`resolveActingInstitutionId`) and a target-scoped
 * capability plus an affiliation bound (`authorizeInstitutionCommand`).
 */
import { ForbiddenError } from "@/shared/errors";
import { requirePermission, type PermissionKey, type Principal } from "@/shared/authorization";

import { resolveEffectivePermissions } from "../domain/effective-permissions";
import type { AuthorizationStore } from "./ports";

export interface ResolvePrincipalInput {
  readonly userId: string;
  /** The institution the user is acting within, or `null` for a platform-level principal. */
  readonly institutionId: string | null;
}

export async function resolvePrincipal(
  store: AuthorizationStore,
  input: ResolvePrincipalInput,
): Promise<Principal> {
  const { roleGrants, directGrants } = await store.loadUserGrants({ userId: input.userId });

  return {
    userId: input.userId,
    institutionId: input.institutionId,
    permissions: resolveEffectivePermissions({
      roleGrants,
      directGrants,
      actingInstitutionId: input.institutionId,
    }),
  };
}

/**
 * The institution to act within when the request does not name one — Phase 6 task 1's "institute
 * context", derived server-side from `user_institutions` and never from the client.
 *
 * - **No affiliation** → `null`: a platform-level user (a super administrator) acts everywhere by
 *   virtue of platform grants (`ADR-0001`), which is exactly what an empty affiliation set means.
 * - **Exactly one** → that institution: the unambiguous case, and the one the seed produces once
 *   affiliations are seeded.
 * - **More than one** → `null`, deliberately. There is no institution switcher in the product yet
 *   (no session field, no preference), so picking one arbitrarily would show a user *some other
 *   tenant's* numbers while they believed they were looking at their own. Falling back to platform
 *   context withholds every institution-scoped grant instead — fail-closed for that user, and
 *   harmless for writes, which {@link authorizeInstitutionCommand} bounds separately. Revisit with
 *   a real switcher; see the open question recorded in `MEMORY.md`.
 */
export async function resolveActingInstitutionId(
  store: AuthorizationStore,
  input: { readonly userId: string },
): Promise<string | null> {
  const affiliations = await store.listUserInstitutions({ userId: input.userId });
  return affiliations.length === 1 ? (affiliations[0] ?? null) : null;
}

export interface AuthorizeInstitutionCommandInput {
  readonly userId: string;
  /** The institution the command writes to — asserted by the request, checked against the store. */
  readonly institutionId: string;
  readonly permission: PermissionKey;
}

/**
 * Step 2 + step 3 of `RULES.md` §18 for one institution-targeted command.
 *
 * Two independent questions, both answered from data rather than from the request:
 *
 * 1. **Is this user affiliated here?** `SECURITY.md` §21 ("a user belonging to Institution A must
 *    never access Institution B's data") and §87 (`institutionId = "another-institution"` is a
 *    field the server must not blindly accept) are enforced against `user_institutions`, not
 *    against whatever the form claimed. A user with no affiliations is a platform-level user and
 *    is not bound — that is the same exemption `requireInstitutionScope` grants a platform
 *    principal, and the reason a super administrator can administer institutions at all.
 * 2. **May they do *this* here?** The principal is resolved *at the target*, so an
 *    institution-scoped grant held at another institution simply does not apply, while platform
 *    grants do (`effective-permissions.ts`). Scoping the lookup — rather than looking up first and
 *    comparing afterwards — is what makes a stale or forged `institutionId` inert: it changes which
 *    grants are visible, never which grants are held.
 *
 * @throws {ForbiddenError} When the command targets an institution the user does not belong to,
 *   or when no live grant covers `permission` there.
 */
export async function authorizeInstitutionCommand(
  store: AuthorizationStore,
  input: AuthorizeInstitutionCommandInput,
): Promise<Principal> {
  const affiliations = await store.listUserInstitutions({ userId: input.userId });
  if (affiliations.length > 0 && !affiliations.includes(input.institutionId)) {
    // Same message as `requireInstitutionScope`, so a refused tenant crossing is indistinguishable
    // from a refused record crossing on the client.
    throw new ForbiddenError("Outside your institution", {
      details: { userId: input.userId },
    });
  }

  const principal = await resolvePrincipal(store, {
    userId: input.userId,
    institutionId: input.institutionId,
  });
  requirePermission(principal, input.permission);
  return principal;
}
