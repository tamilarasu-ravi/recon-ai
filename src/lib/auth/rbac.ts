import type { TenantRole } from "@/lib/auth/tenant-auth-types";

/** Fine-grained permissions enforced on mutating API routes. */
export type Permission =
  | "tenant:read"
  | "ingest:write"
  | "review:write"
  | "policy:admin"
  | "platform:admin";

const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  viewer: ["tenant:read"],
  accountant: ["tenant:read", "ingest:write", "review:write"],
  admin: ["tenant:read", "ingest:write", "review:write", "policy:admin", "platform:admin"],
};

/**
 * Returns true when the role grants the requested permission.
 *
 * @param role - Tenant role or null in open dev mode.
 * @param permission - Required permission.
 * @returns Whether the action is allowed.
 */
export function roleHasPermission(role: TenantRole | null, permission: Permission): boolean {
  if (role === null) {
    return true;
  }

  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Ensures the caller role can perform an action or throws a 403-friendly error.
 *
 * @param role - Resolved tenant role (null allows all in open dev).
 * @param permission - Required permission.
 * @throws Error when permission is denied.
 */
export function assertPermission(role: TenantRole | null, permission: Permission): void {
  if (!roleHasPermission(role, permission)) {
    throw new Error(`Forbidden: ${permission} requires a higher role`);
  }
}
