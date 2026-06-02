import { eq, sql } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { apiKeys, tenants } from "@/lib/db/schema";

/**
 * Returns whether unauthenticated callers may create the first API key for a tenant.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns True when auth is required and the tenant has no API keys yet.
 */
export async function canBootstrapApiKey(db: DbClient, tenantId: string): Promise<boolean> {
  const result = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId));

  const count = Number(result[0]?.count ?? 0);
  return count === 0;
}

/**
 * Resolves a tenant slug to UUID.
 *
 * @param db - Database client.
 * @param slug - Tenant slug (e.g. tenant-a).
 * @returns Tenant id or null when slug is unknown.
 */
export async function resolveTenantIdBySlug(db: DbClient, slug: string): Promise<string | null> {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  return rows[0]?.id ?? null;
}
