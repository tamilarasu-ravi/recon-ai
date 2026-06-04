/** Refresh access tokens this many ms before recorded expiry. */
export const QUICKBOOKS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export const QUICKBOOKS_SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com/v3/company";

/** QBO API minor version — see Intuit developer docs for supported values. */
export const QUICKBOOKS_MINOR_VERSION = "65";
