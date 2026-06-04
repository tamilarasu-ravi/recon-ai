import { QUICKBOOKS_TOKEN_URL } from "@/lib/integrations/erp/quickbooks/constants";

export const QUICKBOOKS_PROVIDER_ID = "quickbooks_sandbox" as const;

const QUICKBOOKS_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";

export interface QuickBooksConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Returns QuickBooks OAuth config when all required env vars are set.
 *
 * @returns Config object or null when sandbox OAuth is not configured.
 */
export function getQuickBooksConfig(): QuickBooksConfig | null {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Builds the Intuit OAuth authorization URL for a tenant connect flow.
 *
 * @param config - QuickBooks OAuth client configuration.
 * @param state - Signed state parameter including tenant id.
 * @returns Authorization redirect URL.
 */
export function buildQuickBooksAuthorizeUrl(config: QuickBooksConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: QUICKBOOKS_SCOPE,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
  });

  return `${QUICKBOOKS_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchanges an authorization code for OAuth tokens.
 *
 * @param config - QuickBooks OAuth client configuration.
 * @param code - Authorization code from Intuit redirect.
 * @returns Token payload from Intuit.
 * @throws Error when the token endpoint returns a non-2xx response.
 */
export async function exchangeQuickBooksAuthCode(
  config: QuickBooksConfig,
  code: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
}> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `QuickBooks token exchange failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  return body as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}
