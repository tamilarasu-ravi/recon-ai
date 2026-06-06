import { eq } from "drizzle-orm";

import {
  isAuthEnforced,
  resolveAuthenticatedCaller,
} from "@/lib/auth/resolve-tenant-auth";
import { listMembershipTenantsForUser } from "@/lib/auth/tenant-membership";
import { isSsoEnabled } from "@/lib/auth/sso-config";
import type { TenantAuthContext } from "@/lib/auth/tenant-auth-types";
import { validateApiKey, extractApiKeyFromRequest } from "@/lib/auth/api-auth";
import { getDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { tenants } from "@/lib/db/schema";

export type { TenantAuthContext } from "@/lib/auth/tenant-auth-types";

/**
 * Requires a valid API key or SSO session when auth is enforced.
 *
 * @param request - Incoming HTTP request.
 * @returns Auth context, or null when auth is disabled in non-production dev.
 * @throws Error when authentication is required but missing or invalid.
 */
export async function requireAuthenticatedApi(
  request: Request,
): Promise<TenantAuthContext | null> {
  return runWithRlsBypass(async () => {
    const db = getDb();
    return resolveAuthenticatedCaller(db, request);
  });
}

export interface TenantListItem {
  id: string;
  slug: string;
  name: string;
  role?: string;
}

/**
 * Lists tenants visible to the caller — memberships for SSO, API key tenant, or all in open dev.
 *
 * @param request - Incoming HTTP request.
 * @returns Tenant rows safe to expose to the caller.
 * @throws Error when production requires auth and caller is unauthenticated.
 */
export async function listTenantsForCaller(request: Request): Promise<TenantListItem[]> {
  return runWithRlsBypass(async () => {
    const db = getDb();

    const rawKey = extractApiKeyFromRequest(request);
    if (rawKey) {
      const context = await validateApiKey(db, rawKey);
      if (!context) {
        throw new Error("Invalid or inactive API key");
      }

      const rows = await db
        .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);

      return rows.map((row) => ({ ...row, role: "admin" }));
    }

    if (!isAuthEnforced()) {
      return db.select({ id: tenants.id, slug: tenants.slug, name: tenants.name }).from(tenants);
    }

    if (isSsoEnabled()) {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) {
        const memberships = await listMembershipTenantsForUser(db, userId);
        return memberships.map((row) => ({
          id: row.tenantId,
          slug: row.slug,
          name: row.name,
          role: row.role,
        }));
      }
    }

    throw new Error("Authentication required — sign in or use Authorization: Bearer <key>");
  });
}
