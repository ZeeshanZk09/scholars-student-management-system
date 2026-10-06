/**
 * The permission-resolution rules — pure, with no imports beyond `shared/`.
 *
 * `src/db/schema/authorization.ts` models the grants; `src/shared/authorization/principal.ts`
 * models the *principal* and the *gate* (`requirePermission`). This file is the step in between
 * that neither covers: turning a user's rows into the `ReadonlySet<PermissionKey>` a `Principal`
 * carries, implementing the two rules `ADR-0001` fixes:
 *
 * 1. **Scope applies before precedence.** A grant is only considered when it is live *where the
 *    user is acting*: a platform grant (`roles.institution_id is null`) applies everywhere; an
 *    institution grant applies only while acting inside that institution; and a platform-level
 *    actor (acting with no institution context) sees only platform grants. What does **not**
 *    apply here is role-vs-direct precedence — each grant is consulted independently, in its own
 *    scope, exactly once.
 * 2. **Deny wins, then difference.** A direct `deny` (`user_permissions.effect = 'deny'`) removes
 *    the capability even when a role grants it, and the SQL partial-unique indexes in the schema
 *    forbid two live grants of the same key in the same scope, so "deny beats grant" is the whole
 *    story — there is no ordering ambiguity to resolve.
 *
 * The result is deliberate about what it is **not**:
 *
 * - No role names. `RULES.md` §19 forbids branching on "is the user an Admin"; a role only ever
 *   contributes keys, and once resolved it is gone from the model.
 * - No wildcards. `ADR-0001` removes implicit scope; `*` would reintroduce it.
 * - No `isSuperAdmin` bypass. A super administrator is the platform `Super Admin` role whose
 *   grants cover every key — visible as data, revocable, auditable (`src/shared/authorization/principal.ts`).
 */
import type { PermissionKey } from "@/shared/authorization";

/** Where a grant is live. A platform grant applies in every institution; an institution grant in one. */
export type GrantScope =
  { readonly kind: "platform" } | { readonly kind: "institution"; readonly institutionId: string };

/** A capability contributed by a live `user_roles` → `role_permissions` path. */
export interface RoleGrant {
  readonly key: PermissionKey;
  readonly scope: GrantScope;
}

/** A live `user_permissions` row: it adds or removes a capability directly. */
export interface DirectGrant {
  readonly key: PermissionKey;
  readonly effect: "grant" | "deny";
  readonly scope: GrantScope;
}

export interface EffectivePermissionsInput {
  readonly roleGrants: readonly RoleGrant[];
  readonly directGrants: readonly DirectGrant[];
  /**
   * The institution the user is acting within, or `null` for a platform-level context.
   * `null` is "no institution chosen", deliberately distinct from an institution whose grant
   * list happens to be empty.
   */
  readonly actingInstitutionId: string | null;
}

/** Does a grant apply to the context the user is acting in? */
export function grantAppliesIn(scope: GrantScope, actingInstitutionId: string | null): boolean {
  if (scope.kind === "platform") return true;
  return actingInstitutionId !== null && scope.institutionId === actingInstitutionId;
}

/**
 * Resolve a principal's effective capability set.
 *
 * The union of in-scope role grants and in-scope direct `grant`s, minus the set of in-scope
 * direct `deny`s. Asymmetry is intended: only a `deny` can remove, and only a direct grant can
 * add beyond the roles — a role can neither contradict another role nor subtract.
 */
export function resolveEffectivePermissions(
  input: EffectivePermissionsInput,
): ReadonlySet<PermissionKey> {
  const effective = new Set<PermissionKey>();

  for (const grant of input.roleGrants) {
    if (grantAppliesIn(grant.scope, input.actingInstitutionId)) {
      effective.add(grant.key);
    }
  }

  for (const grant of input.directGrants) {
    if (grantAppliesIn(grant.scope, input.actingInstitutionId)) {
      if (grant.effect === "grant") {
        effective.add(grant.key);
      } else {
        // The scope test above is deliberate: an institution-scoped deny must not cancel a
        // platform grant while the user is elsewhere, where the grant is still meant to apply.
        effective.delete(grant.key);
      }
    }
  }

  return effective;
}
