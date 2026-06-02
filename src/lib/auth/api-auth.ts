import { and, eq } from "drizzle-orm";

import { hashApiKey } from "@/lib/auth/api-key-crypto";
import type { DbClient } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";

export interface ApiAuthContext {
  tenantId: string;
  apiKeyId: string;
  keyPrefix: string;
}

/**
 * Reads whether API authentication is required from environment.
 *
 * @returns True when REQUIRE_API_AUTH is set to true.
 */
export function isApiAuthRequired(): boolean {
  return process.env.REQUIRE_API_AUTH?.trim().toLowerCase() === "true";
}

/**
 * Extracts a bearer or x-api-key token from the request headers.
 *
 * @param request - Incoming HTTP request.
 * @returns Raw API key or null when absent.
 */
export function extractApiKeyFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }

  const headerKey = request.headers.get("x-api-key")?.trim();
  return headerKey && headerKey.length > 0 ? headerKey : null;
}

/**
 * Validates an API key against active keys in the database.
 *
 * @param db - Database client.
 * @param rawKey - API key from Authorization header.
 * @returns Auth context when valid.
 */
export async function validateApiKey(
  db: DbClient,
  rawKey: string,
): Promise<ApiAuthContext | null> {
  const keyHash = hashApiKey(rawKey);

  const rows = await db
    .select({
      id: apiKeys.id,
      tenantId: apiKeys.tenantId,
      keyPrefix: apiKeys.keyPrefix,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    tenantId: row.tenantId,
    apiKeyId: row.id,
    keyPrefix: row.keyPrefix,
  };
}

/**
 * Authorizes a request when auth is required; otherwise returns null context.
 *
 * @param db - Database client.
 * @param request - Incoming HTTP request.
 * @returns Auth context, or null when auth is disabled.
 * @throws Error when auth is required but key is missing or invalid.
 */
export async function authorizeApiRequest(
  db: DbClient,
  request: Request,
): Promise<ApiAuthContext | null> {
  if (!isApiAuthRequired()) {
    return null;
  }

  const rawKey = extractApiKeyFromRequest(request);
  if (!rawKey) {
    throw new Error("API key required — use Authorization: Bearer <key>");
  }

  const context = await validateApiKey(db, rawKey);
  if (!context) {
    throw new Error("Invalid or inactive API key");
  }

  return context;
}

/**
 * Ensures the authenticated tenant matches an explicit tenant_id parameter.
 *
 * @param auth - Resolved API auth context.
 * @param tenantId - Tenant id from query or body.
 * @throws Error when tenants do not match.
 */
export function assertTenantScope(auth: ApiAuthContext | null, tenantId: string): void {
  if (!auth) {
    return;
  }

  if (auth.tenantId !== tenantId) {
    throw new Error("API key is not authorized for this tenant");
  }
}
