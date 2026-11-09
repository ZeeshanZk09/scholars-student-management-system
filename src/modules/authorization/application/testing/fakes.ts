/**
 * An in-memory `AuthorizationStore` for tests.
 *
 * The seed accepts already-scoped grants, mirroring what `loadUserGrants` returns — the scope
 * conversion from raw rows is the infra layer's job, not the fake's. Affiliations are passed
 * the same way: plain institution ids, already selected from `user_institutions`.
 */
import type { DirectGrant, GrantScope, RoleGrant } from "../../domain/effective-permissions";
import type { AuthorizationStore } from "../ports";

export interface StoredUserGrants {
  readonly roleGrants: readonly RoleGrant[];
  readonly directGrants: readonly DirectGrant[];
}

export interface AuthorizationFakeOptions {
  /** `user_institutions` rows, as institution ids per user. Defaults to no affiliations. */
  readonly institutionsByUser?: ReadonlyMap<string, readonly string[]>;
}

export function createAuthorizationFake(
  grantsByUser: ReadonlyMap<string, StoredUserGrants> = new Map(),
  options: AuthorizationFakeOptions = {},
): AuthorizationStore {
  const institutionsByUser = options.institutionsByUser ?? new Map<string, readonly string[]>();

  return {
    async loadUserGrants({ userId }) {
      const grants = grantsByUser.get(userId) ?? { roleGrants: [], directGrants: [] };
      return { roleGrants: grants.roleGrants, directGrants: grants.directGrants };
    },
    async listUserInstitutions({ userId }) {
      return institutionsByUser.get(userId) ?? [];
    },
  };
}

export type { GrantScope, RoleGrant, DirectGrant };
