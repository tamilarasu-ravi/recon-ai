import type { DbClient } from "@/lib/db/client";
import { getErpConnection, upsertQuickBooksConnection } from "@/lib/integrations/erp/erp-connections";
import { getQuickBooksConfig, QUICKBOOKS_PROVIDER_ID } from "@/lib/integrations/erp/quickbooks/config";
import { refreshQuickBooksAccessToken } from "@/lib/integrations/erp/quickbooks/token-client";
import { shouldRefreshQuickBooksAccessToken } from "@/lib/integrations/erp/quickbooks/token-expiry";

export interface QuickBooksSession {
  accessToken: string;
  realmId: string;
}

/**
 * Returns a valid QuickBooks access token and realm id, refreshing OAuth tokens when needed.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Session credentials for QBO API calls.
 * @throws Error when OAuth is not configured, connection is missing, or refresh fails.
 */
export async function ensureQuickBooksSession(
  db: DbClient,
  tenantId: string,
): Promise<QuickBooksSession> {
  const config = getQuickBooksConfig();
  if (!config) {
    throw new Error("QuickBooks OAuth is not configured");
  }

  const connection = await getErpConnection(db, tenantId, QUICKBOOKS_PROVIDER_ID);
  if (!connection) {
    throw new Error("QuickBooks is not connected for this tenant");
  }

  if (!connection.realmId) {
    throw new Error("QuickBooks realm id is missing — reconnect QuickBooks");
  }

  const expiresAt = connection.accessTokenExpiresAt
    ? connection.accessTokenExpiresAt instanceof Date
      ? connection.accessTokenExpiresAt
      : new Date(String(connection.accessTokenExpiresAt))
    : null;

  if (!shouldRefreshQuickBooksAccessToken(expiresAt)) {
    return {
      accessToken: connection.accessToken,
      realmId: connection.realmId,
    };
  }

  if (!connection.refreshToken) {
    throw new Error("QuickBooks refresh token is missing — reconnect QuickBooks");
  }

  const tokens = await refreshQuickBooksAccessToken(config, connection.refreshToken);

  await upsertQuickBooksConnection(db, tenantId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? connection.refreshToken,
    expiresInSec: tokens.expires_in,
    realmId: connection.realmId,
  });

  return {
    accessToken: tokens.access_token,
    realmId: connection.realmId,
  };
}
