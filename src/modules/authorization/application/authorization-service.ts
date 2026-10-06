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
 */
import type { Principal } from "@/shared/authorization";

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
