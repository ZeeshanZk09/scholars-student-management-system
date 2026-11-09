export { ALL_PERMISSION_KEYS, isPermissionKey, PERMISSION_KEYS } from "./permissions";

export type { PermissionKey } from "./permissions";

export {
  hasPermission,
  requireInstitutionScope,
  requirePermission,
  requireSelfScope,
} from "./principal";

export type { Principal } from "./principal";
