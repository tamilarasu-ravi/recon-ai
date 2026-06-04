import { QUICKBOOKS_TOKEN_REFRESH_BUFFER_MS } from "@/lib/integrations/erp/quickbooks/constants";

/**
 * Returns true when the access token should be refreshed before use.
 *
 * @param expiresAt - Stored access token expiry, or null when unknown.
 * @param nowMs - Current time in milliseconds (defaults to Date.now()).
 * @returns True when refresh is needed.
 */
export function shouldRefreshQuickBooksAccessToken(
  expiresAt: Date | null,
  nowMs: number = Date.now(),
): boolean {
  if (!expiresAt) {
    return true;
  }
  return expiresAt.getTime() - nowMs <= QUICKBOOKS_TOKEN_REFRESH_BUFFER_MS;
}
