import { eq } from "drizzle-orm";

import { generateApiKeyMaterial } from "@/lib/auth/api-key-crypto";
import type { DbClient } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";

export interface ApiKeyListItemDto {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Lists API keys for a tenant (never returns raw secrets).
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Masked key list.
 */
export async function listApiKeysForTenant(
  db: DbClient,
  tenantId: string,
): Promise<ApiKeyListItemDto[]> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    isActive: row.isActive,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(String(row.createdAt)).toISOString(),
  }));
}

/**
 * Creates a new API key for a tenant and returns the raw secret once.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param name - Human-readable key label.
 * @returns List item plus raw key for one-time display.
 */
export async function createApiKeyForTenant(
  db: DbClient,
  tenantId: string,
  name: string,
): Promise<ApiKeyListItemDto & { rawKey: string }> {
  const { rawKey, keyPrefix, keyHash } = generateApiKeyMaterial();

  const [inserted] = await db
    .insert(apiKeys)
    .values({
      tenantId,
      name,
      keyPrefix,
      keyHash,
      isActive: true,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
    });

  return {
    id: inserted.id,
    name: inserted.name,
    keyPrefix: inserted.keyPrefix,
    isActive: inserted.isActive,
    createdAt:
      inserted.createdAt instanceof Date
        ? inserted.createdAt.toISOString()
        : new Date(String(inserted.createdAt)).toISOString(),
    rawKey,
  };
}
