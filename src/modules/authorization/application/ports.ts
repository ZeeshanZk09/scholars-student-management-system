/**
 * The authorization module's ports — what the application layer needs from the outside world.
 *
 * One port, deliberately. `loadUserGrants` asks the store for *all* of a user's live grants,
 * each with its scope, and leaves the scope filtering to the domain (`effective-permissions.ts`).
 * The store must not pre-filter by institution: the "which grants apply here" rule exists exactly
 * once, in the domain, and a store that duplicated it would let the two copies drift.
 *
 * "Live" is defined by the schema itself: `user_roles.revoked_at is null` and
 * `user_permissions.revoked_at is null`. Revoked rows are history (`RULES.md` §51) and are never
 * consulted for resolution.
 */
import type { DirectGrant, RoleGrant } from "../domain/effective-permissions";

export interface AuthorizationStore {
  /** All live grants for one user, unscoped. */
  loadUserGrants(input: { readonly userId: string }): Promise<{
    readonly roleGrants: readonly RoleGrant[];
    readonly directGrants: readonly DirectGrant[];
  }>;
}
