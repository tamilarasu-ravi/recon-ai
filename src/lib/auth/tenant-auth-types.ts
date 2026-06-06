/** RBAC role scoped to a single tenant membership. */
export type TenantRole = "admin" | "accountant" | "viewer";

/** How the caller authenticated to the API. */
export type AuthSource = "api_key" | "session" | "open";

/**
 * Unified tenant auth context for API routes and UI.
 */
export interface TenantAuthContext {
  tenantId: string;
  source: AuthSource;
  /** Null in open dev mode — all permissions allowed. */
  role: TenantRole | null;
  apiKeyId?: string;
  keyPrefix?: string;
  userId?: string;
}
