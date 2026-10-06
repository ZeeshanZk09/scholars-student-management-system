/**
 * An in-memory `AuthorizationStore` for tests.
 *
 * The seed accepts already-scoped grants, mirroring what `loadUserGrants` returns — the scope
 * conversion from raw rows is the infra layer's job, not the fake's.
 */
import type { DirectGrant, GrantScope, RoleGrant } from "../../domain/effective-permissions";
import type { AuthorizationStore } from "../ports";

export interface StoredUserGrants {
  readonly roleGrants: readonly RoleGrant[];
  readonly directGrants: readonly DirectGrant[];
}

export function createAuthorizationFake(
  grantsByUser: ReadonlyMap<string, StoredUserGrants> = new Map(),
): AuthorizationStore {
  return {
    async loadUserGrants({ userId }) {
      const grants = grantsByUser.get(userId) ?? { roleGrants: [], directGrants: [] };
      return { roleGrants: grants.roleGrants, directGrants: grants.directGrants };
    },
  };
}

export type { GrantScope, RoleGrant, DirectGrant };
