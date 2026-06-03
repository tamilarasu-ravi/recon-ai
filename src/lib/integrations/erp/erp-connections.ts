import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { erpConnections } from "@/lib/db/schema";
import { QUICKBOOKS_PROVIDER_ID } from "@/lib/integrations/erp/quickbooks/config";

export interface ErpConnectionDto {
  provider: string;
  realmId: string | null;
  connectedAt: string;
  accessTokenExpiresAt: string | null;
}

/**
 * Loads an active ERP connection for a tenant and provider.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param provider - Provider id (e.g. quickbooks_sandbox).
 * @returns Connection row fields needed for API calls, or null.
 */
export async function getErpConnection(
  db: DbClient,
  tenantId: string,
  provider: string,
): Promise<{
  id: string;
  realmId: string | null;
  accessToken: string;
  refreshToken: string | null;
} | null> {
  const rows = await db
    .select({
      id: erpConnections.id,
      realmId: erpConnections.realmId,
      accessToken: erpConnections.accessToken,
      refreshToken: erpConnections.refreshToken,
    })
    .from(erpConnections)
    .where(and(eq(erpConnections.tenantId, tenantId), eq(erpConnections.provider, provider)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Returns public ERP connection status for Settings UI (no tokens).
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Connection metadata per provider.
 */
export async function listErpConnectionStatus(
  db: DbClient,
  tenantId: string,
): Promise<ErpConnectionDto[]> {
  const rows = await db
    .select({
      provider: erpConnections.provider,
      realmId: erpConnections.realmId,
      connectedAt: erpConnections.connectedAt,
      accessTokenExpiresAt: erpConnections.accessTokenExpiresAt,
    })
    .from(erpConnections)
    .where(eq(erpConnections.tenantId, tenantId));

  return rows.map((row) => ({
    provider: row.provider,
    realmId: row.realmId,
    connectedAt:
      row.connectedAt instanceof Date
        ? row.connectedAt.toISOString()
        : new Date(String(row.connectedAt)).toISOString(),
    accessTokenExpiresAt: row.accessTokenExpiresAt
      ? row.accessTokenExpiresAt instanceof Date
        ? row.accessTokenExpiresAt.toISOString()
        : new Date(String(row.accessTokenExpiresAt)).toISOString()
      : null,
  }));
}

/**
 * Upserts QuickBooks OAuth tokens for a tenant after successful connect.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param tokens - OAuth token response fields.
 * @param realmId - Optional QuickBooks company realm id.
 */
export async function upsertQuickBooksConnection(
  db: DbClient,
  tenantId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresInSec?: number;
    realmId?: string;
  },
): Promise<void> {
  const expiresAt =
    tokens.expiresInSec !== undefined
      ? new Date(Date.now() + tokens.expiresInSec * 1000)
      : null;

  const existing = await getErpConnection(db, tenantId, QUICKBOOKS_PROVIDER_ID);

  if (existing) {
    await db
      .update(erpConnections)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? existing.refreshToken,
        realmId: tokens.realmId ?? existing.realmId,
        accessTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(erpConnections.id, existing.id));
    return;
  }

  await db.insert(erpConnections).values({
    tenantId,
    provider: QUICKBOOKS_PROVIDER_ID,
    realmId: tokens.realmId ?? null,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    accessTokenExpiresAt: expiresAt,
  });
}
