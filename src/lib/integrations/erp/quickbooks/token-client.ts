import { QUICKBOOKS_TOKEN_URL } from "@/lib/integrations/erp/quickbooks/constants";
import type { QuickBooksConfig } from "@/lib/integrations/erp/quickbooks/config";

export interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
}

/**
 * Exchanges a refresh token for a new QuickBooks access token.
 *
 * @param config - OAuth client configuration.
 * @param refreshToken - Stored refresh token for the tenant connection.
 * @returns Token payload from Intuit.
 * @throws Error when the token endpoint returns a non-2xx response.
 */
export async function refreshQuickBooksAccessToken(
  config: QuickBooksConfig,
  refreshToken: string,
): Promise<QuickBooksTokenResponse> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `QuickBooks token refresh failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  return body as unknown as QuickBooksTokenResponse;
}
