import { useMemo } from "react";

import { useTenant } from "@/app/components/tenant-provider";
import { roleHasPermission, type Permission } from "@/lib/auth/rbac";
import type { TenantRole } from "@/lib/auth/tenant-auth-types";

/**
 * Returns the RBAC role for the currently selected tenant.
 *
 * @returns Role from tenant list or null when open dev / unknown.
 */
export function useTenantRole(): TenantRole | null {
  const { tenants, tenantId } = useTenant();

  return useMemo(() => {
    const match = tenants.find((tenant) => tenant.id === tenantId);
    const role = match?.role;
    if (role === "admin" || role === "accountant" || role === "viewer") {
      return role;
    }
    return null;
  }, [tenants, tenantId]);
}

/**
 * Returns true when the current tenant role grants a permission.
 *
 * @param permission - Permission to check.
 * @returns Whether UI should show the action.
 */
export function useCan(permission: Permission): boolean {
  const role = useTenantRole();
  return roleHasPermission(role, permission);
}
