import { and, eq } from "drizzle-orm";

import type { TenantRole } from "@/lib/auth/tenant-auth-types";
import type { DbClient } from "@/lib/db/client";
import { tenantMemberships, tenants } from "@/lib/db/schema";

export interface TenantMembershipRow {
  tenantId: string;
  slug: string;
  name: string;
  role: TenantRole;
}

/**
 * Loads a user's membership for a specific tenant.
 *
 * @param db - Database client (RLS bypass recommended).
 * @param clerkUserId - Clerk user id.
 * @param tenantId - Tenant UUID.
 * @returns Membership role or null when not assigned.
 */
export async function getMembershipForTenant(
  db: DbClient,
  clerkUserId: string,
  tenantId: string,
): Promise<TenantRole | null> {
  const rows = await db
    .select({ role: tenantMemberships.role })
    .from(tenantMemberships)
    .where(
      and(eq(tenantMemberships.clerkUserId, clerkUserId), eq(tenantMemberships.tenantId, tenantId)),
    )
    .limit(1);

  const role = rows[0]?.role;
  return role ?? null;
}

/**
 * Lists all tenants visible to a signed-in Clerk user.
 *
 * @param db - Database client (RLS bypass recommended).
 * @param clerkUserId - Clerk user id.
 * @returns Tenant rows with role for each membership.
 */
export async function listMembershipTenantsForUser(
  db: DbClient,
  clerkUserId: string,
): Promise<TenantMembershipRow[]> {
  return db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      role: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .where(eq(tenantMemberships.clerkUserId, clerkUserId));
}

/**
 * Returns true when the user has at least one tenant membership.
 *
 * @param db - Database client.
 * @param clerkUserId - Clerk user id.
 * @returns Whether any membership exists.
 */
export async function userHasAnyMembership(db: DbClient, clerkUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: tenantMemberships.id })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.clerkUserId, clerkUserId))
    .limit(1);

  return rows.length > 0;
}
