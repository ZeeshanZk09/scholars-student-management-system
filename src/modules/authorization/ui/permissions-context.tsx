"use client";

/**
 * Permission-aware UI, client side (Phase 4 task 10).
 *
 * The authoritative gate is server-side (`requireUserPermission` — `RULES.md` §19: UI
 * restrictions are never security). This context exists so a client component can **hide what a
 * server call already refused**, and it deliberately receives a serializable array of keys — a
 * server layout resolves the principal and renders this provider, so the client never re-asks
 * "who am I".
 *
 * There is no "hide the button" shortcut that skips the server check: the server still throws
 * on the mutation, and `useHasPermission` only shapes whether the affordance is rendered.
 */
import { createContext, useContext, useMemo } from "react";

import type { PermissionKey } from "@/shared/authorization";

const PermissionsContext = createContext<ReadonlySet<PermissionKey>>(new Set());

export function PermissionsProvider({
  permissions,
  children,
}: Readonly<{
  permissions: readonly PermissionKey[];
  children: React.ReactNode;
}>) {
  const set = useMemo(() => new Set(permissions), [permissions]);
  return <PermissionsContext.Provider value={set}>{children}</PermissionsContext.Provider>;
}

/** Whether the signed-in principal currently holds the capability. */
export function useHasPermission(key: PermissionKey): boolean {
  return useContext(PermissionsContext).has(key);
}
