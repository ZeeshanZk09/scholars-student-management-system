/**
 * The authorization module's public surface (`src/modules/README.md`): wires the Drizzle store
 * into the resolution service, then exports one-call functions. Nothing outside the module
 * reaches into `application/`, `domain/` or `infrastructure/`.
 *
 * The primitives consumers also need live in `src/shared/authorization` already
 * (`requirePermission`, `hasPermission`, `requireInstitutionScope`, `requireSelfScope`,
 * `Principal`, `PermissionKey`). This module is the step that turns a `userId` into a
 * `Principal`; the shared package is the gate that consumes one.
 *
 * It also answers the two institution questions a gate alone cannot: *where* this user acts when
 * the request is silent (`resolveActingInstitutionId`), and *whether they may act there at all*
 * (`authorizeInstitutionCommand`) — the checks `SECURITY.md` §21/§87 require of every write.
 */
import {
  authorizeInstitutionCommand as authorizeCommand,
  resolveActingInstitutionId as resolveActing,
  resolvePrincipal as resolve,
} from "./application/authorization-service";
import type {
  AuthorizeInstitutionCommandInput,
  ResolvePrincipalInput,
} from "./application/authorization-service";
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
 * The institution this user acts within when the request does not name one (Phase 6 task 1) —
 * derived from `user_institutions`, never from the client.
 */
export function resolveActingInstitutionId(userId: string) {
  return resolveActing(drizzleAuthorizationStore, { userId });
}

/**
 * The authorization boundary for one institution-targeted command: affiliation bound, then a
 * capability resolved *at* the target institution. Every mutating server action calls this (or a
 * wrapper around it) instead of asserting an `institutionId` of its own.
 */
export function authorizeInstitutionCommand(input: AuthorizeInstitutionCommandInput) {
  return authorizeCommand(drizzleAuthorizationStore, input);
}

/**
 * The pure resolution rule, exported so callers can reason about / test grant semantics without
 * a database and so the store port stays free of policy.
 */
export { resolveEffectivePermissions };
export type {
  AuthorizeInstitutionCommandInput,
  DirectGrant,
  EffectivePermissionsInput,
  GrantScope,
  RoleGrant,
  ResolvePrincipalInput,
};
