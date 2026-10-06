/**
 * The server-side authorization gate — the bridge between a live session (Phase 3) and the
 * authorization module (Phase 4). This is where `PHASES.md` §12 tasks 7–9, 11 meet the request:
 * every protected server component, layout and server action asks "who is this and may they do X".
 *
 * Three shapes, split by intent (`src/lib/dal.ts` does the same for sessions):
 *
 * - `getCurrentPrincipal` — ask, don't insist. Returns `null` instead of redirecting, so callers
 *   that want the principal just to decide what to render can use it directly. `React.cache`
 *   keyed on the acting institution deduplicates repeated resolutions within a single render,
 *   and the inner session read is itself cached by `verifySession`.
 * - `requireUserPermission` — insist (route authorization, task 9, and server-action
 *   authorization, tasks 8 & 11). No session ⇒ redirects to `/login`; session but no capability
 *   ⇒ throws `ForbiddenError`, which becomes a 403 at the boundary. Returns the principal so the
 *   caller can go on to the resource-scope gates (`requireInstitutionScope`, `requireSelfScope`).
 * - `canUser` — boolean filter for permission-aware UI (task 10, server flavour). Never throws,
 *   never redirects; `false` is the safe answer for both "signed out" and "not permitted".
 *
 * The principal is always *meaningfully scoped*: `PERMISSION_KEYS` contains no wildcard and no
 * `view_all`, so `students.view` here does not say which students — that is the resource layer's
 * job (`ADR-0001` §2), and `requireUserPermission` returns the principal precisely so the same
 * call site can then run `requireInstitutionScope`/`requireSelfScope`.
 */
import { cache } from "react";
import { redirect } from "next/navigation";

import { resolvePrincipal } from "@/modules/authorization";
import {
  hasPermission,
  requirePermission,
  type PermissionKey,
  type Principal,
} from "@/shared/authorization";

import { verifySession } from "./dal";

/**
 * The acting institution, as a plain value for `React.cache` memoization (object arguments
 * compare by reference, which would defeat the dedup). `null` = platform-level principal.
 */
export const getCurrentPrincipal = cache(
  async (institutionId: string | null): Promise<Principal | null> => {
    const session = await verifySession();
    if (session === null) return null;
    return resolvePrincipal({ userId: session.userId, institutionId });
  },
);

/**
 * The authoritative gate: insist on a session, then insist on a capability.
 *
 * @throws {ForbiddenError} when the session exists but lacks the permission.
 */
export async function requireUserPermission(
  permission: PermissionKey,
  institutionId: string | null = null,
): Promise<Principal> {
  const session = await verifySession();
  if (session === null) {
    redirect("/login");
  }

  const principal = await getCurrentPrincipal(institutionId);
  requirePermission(principal as Principal, permission);
  return principal as Principal;
}

/** Non-throwing capability test for filtering UI — `false` answers "signed out" safely too. */
export async function canUser(
  permission: PermissionKey,
  institutionId: string | null = null,
): Promise<boolean> {
  const principal = await getCurrentPrincipal(institutionId);
  return principal !== null && hasPermission(principal, permission);
}
