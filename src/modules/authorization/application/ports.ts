/**
 * The authorization module's ports — what the application layer needs from the outside world.
 *
 * Two questions, deliberately separate. `loadUserGrants` asks for *what* a user may do — every
 * live grant with its scope, unscoped, leaving the "which grants apply here" rule to the domain
 * (`effective-permissions.ts`), where it exists exactly once. `listUserInstitutions` asks for
 * *where* a user may do it: the `user_institutions` affiliations (`src/db/schema/identity.ts`),
 * which `SECURITY.md` §21 names as the thing that keeps an Institution A user out of Institution
 * B. Neither store method pre-filters by institution; a store that duplicated the scope rule
 * would let two copies drift.
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

  /**
   * The institutions one user is affiliated with (`user_institutions.institution_id`), in a
   * stable order. An empty array is meaningful and not an error: it is a platform-level user who
   * belongs to no single institution — the shape of a super administrator.
   */
  listUserInstitutions(input: { readonly userId: string }): Promise<readonly string[]>;
}
