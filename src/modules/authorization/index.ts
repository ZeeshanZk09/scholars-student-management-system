/**
 * The authorization module's public surface (`src/modules/README.md`): wires the Drizzle store
 * into the resolution service, then exports one-call functions. Nothing outside the module
 * reaches into `application/`, `domain/` or `infrastructure/`.
 *
 * The primitives consumers also need live in `src/shared/authorization` already
 * (`requirePermission`, `hasPermission`, `requireInstitutionScope`, `requireSelfScope`,
 * `Principal`, `PermissionKey`). This module is the step that turns a `userId` into a
 * `Principal`; the shared package is the gate that consumes one.
 */
import { resolvePrincipal as resolve } from "./application/authorization-service";
import type { ResolvePrincipalInput } from "./application/authorization-service";
import { drizzleAuthorizationStore } from "./infrastructure/drizzle-store";
import { resolveEffectivePermissions } from "./domain/effective-permissions";
import type {
  DirectGrant,
  EffectivePermissionsInput,
  GrantScope,
  RoleGrant,
} from "./domain/effective-permissions";

/** Resolve a user's effective permissions for one acting context (Phase 4 task 7). */
export function resolvePrincipal(input: ResolvePrincipalInput) {
  return resolve(drizzleAuthorizationStore, input);
}

/**
 * The pure resolution rule, exported so callers can reason about / test grant semantics without
 * a database and so the store port stays free of policy.
 */
export { resolveEffectivePermissions };
export type {
  DirectGrant,
  EffectivePermissionsInput,
  GrantScope,
  RoleGrant,
  ResolvePrincipalInput,
};
