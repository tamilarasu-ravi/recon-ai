import { eq } from "drizzle-orm";

import { generateApiKeyMaterial } from "@/lib/auth/api-key-crypto";
import type { DbClient } from "@/lib/db/client";
import { apiKeys, tenants } from "@/lib/db/schema";

export interface SeededApiKey {
  tenantSlug: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
}

/**
 * Creates default API keys for each tenant slug when none exist (idempotent per tenant).
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug to seed.
 * @returns New key material when created, or null when tenant already has an active key.
 */
export async function seedApiKeyForTenant(
  db: DbClient,
  tenantSlug: string,
): Promise<SeededApiKey | null> {
  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  const tenantId = tenantRows[0]?.id;
  if (!tenantId) {
    return null;
  }

  const existing = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .limit(1);

  if (existing[0]) {
    return null;
  }

  const { rawKey, keyPrefix, keyHash } = generateApiKeyMaterial();

  await db.insert(apiKeys).values({
    tenantId,
    name: `${tenantSlug} default`,
    keyPrefix,
    keyHash,
    isActive: true,
  });

  return {
    tenantSlug,
    name: `${tenantSlug} default`,
    rawKey,
    keyPrefix,
  };
}
