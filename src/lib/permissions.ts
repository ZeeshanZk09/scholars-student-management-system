/**
 * Client-safe authorization utilities.
 *
 * Client components should only use `useHasPermission` from the PermissionsProvider
 * for presentational gating. Server-side permission checks must go through
 * `src/lib/permissions-server.ts` or Server Actions.
 */
export { useHasPermission } from "@/modules/authorization/ui/permissions-context";
export type { PermissionKey } from "@/shared/authorization";
