import { eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";

/**
 * Resolves a tenant UUID from its slug for webhook URL paths.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug (e.g. tenant-a).
 * @returns Tenant id or null when not found.
 */
export async function resolveTenantIdBySlug(
  db: DbClient,
  tenantSlug: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  return rows[0]?.id ?? null;
}
