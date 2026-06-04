import { eq } from "drizzle-orm";

import { authorizeApiRequest } from "@/lib/auth/api-auth";
import type { ApiAuthContext } from "@/lib/auth/api-auth";
import { getDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { tenants } from "@/lib/db/schema";

/**
 * Requires a valid API key when auth is enabled or on production deployments.
 *
 * @param request - Incoming HTTP request.
 * @returns Auth context, or null when auth is disabled in non-production.
 * @throws Error when authentication is required but missing or invalid.
 */
export async function requireAuthenticatedApi(
  request: Request,
): Promise<ApiAuthContext | null> {
  return runWithRlsBypass(async () => {
    const db = getDb();
    return authorizeApiRequest(db, request);
  });
}

/**
 * Lists tenants visible to the caller — all in dev, scoped to API key tenant in production auth.
 *
 * @param request - Incoming HTTP request.
 * @returns Tenant rows safe to expose to the caller.
 * @throws Error when production requires auth and key is missing.
 */
export async function listTenantsForCaller(
  request: Request,
): Promise<Array<{ id: string; slug: string; name: string }>> {
  return runWithRlsBypass(async () => {
    const db = getDb();
    const auth = await authorizeApiRequest(db, request);

    if (auth) {
      const rows = await db
        .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, auth.tenantId))
        .limit(1);

      return rows;
    }

    return db.select({ id: tenants.id, slug: tenants.slug, name: tenants.name }).from(tenants);
  });
}
