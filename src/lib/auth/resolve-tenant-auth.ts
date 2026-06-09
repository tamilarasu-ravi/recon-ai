import { auth } from "@clerk/nextjs/server";

import { validateApiKey, extractApiKeyFromRequest } from "@/lib/auth/api-auth";
import { isSsoEnabled } from "@/lib/auth/sso-config";
import type { TenantAuthContext } from "@/lib/auth/tenant-auth-types";
import { getMembershipForTenant, userHasAnyMembership } from "@/lib/auth/tenant-membership";
import { isApiAuthRequired } from "@/lib/config/runtime";
import type { DbClient } from "@/lib/db/client";

const API_KEY_ADMIN_ROLE = "admin" as const;

/**
 * Returns true when callers must authenticate (API key and/or SSO session).
 *
 * When REQUIRE_API_AUTH=false, the app runs in open demo mode even if Clerk env vars exist.
 *
 * @returns Whether auth is mandatory.
 */
export function isAuthEnforced(): boolean {
  return isApiAuthRequired();
}

/**
 * Resolves auth for routes that are not tenant-scoped (e.g. orchestrator graph).
 *
 * @param db - Database client.
 * @param request - Incoming HTTP request.
 * @returns Auth context without tenant binding, or null in open dev.
 * @throws Error when auth is required but missing or invalid.
 */
export async function resolveAuthenticatedCaller(
  db: DbClient,
  request: Request,
): Promise<TenantAuthContext | null> {
  if (!isAuthEnforced()) {
    return null;
  }

  const apiKeyContext = await tryResolveApiKey(db, request);
  if (apiKeyContext) {
    return apiKeyContext;
  }

  const sessionContext = await tryResolveSessionAnyTenant(db);
  if (sessionContext) {
    return sessionContext;
  }

  throw new Error("Authentication required — sign in or use Authorization: Bearer <key>");
}

/**
 * Resolves tenant-scoped auth from API key or Clerk session membership.
 *
 * @param db - Database client.
 * @param request - Incoming HTTP request.
 * @param tenantId - Tenant id from query or body.
 * @returns Auth context for the tenant, or null in open dev.
 * @throws Error when auth fails or tenant access is denied.
 */
export async function resolveTenantAuth(
  db: DbClient,
  request: Request,
  tenantId: string,
): Promise<TenantAuthContext | null> {
  if (!isAuthEnforced()) {
    return null;
  }

  const apiKeyContext = await tryResolveApiKey(db, request);
  if (apiKeyContext) {
    if (apiKeyContext.tenantId !== tenantId) {
      throw new Error("Forbidden: API key is not authorized for this tenant");
    }
    return { ...apiKeyContext, tenantId };
  }

  const sessionContext = await tryResolveSessionForTenant(db, tenantId);
  if (sessionContext) {
    return sessionContext;
  }

  if (isApiAuthRequired()) {
    throw new Error("API key required — use Authorization: Bearer <key>");
  }

  throw new Error("Sign in required for this tenant");
}

/**
 * Attempts API key validation and maps keys to admin role for M2M access.
 *
 * @param db - Database client.
 * @param request - Incoming HTTP request.
 * @returns Tenant auth from API key or null when absent/invalid.
 */
async function tryResolveApiKey(
  db: DbClient,
  request: Request,
): Promise<TenantAuthContext | null> {
  const rawKey = extractApiKeyFromRequest(request);
  if (!rawKey) {
    return null;
  }

  const context = await validateApiKey(db, rawKey);
  if (!context) {
    throw new Error("Invalid or inactive API key");
  }

  return {
    tenantId: context.tenantId,
    source: "api_key",
    role: API_KEY_ADMIN_ROLE,
    apiKeyId: context.apiKeyId,
    keyPrefix: context.keyPrefix,
  };
}

/**
 * Resolves a Clerk session for a specific tenant via membership lookup.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID to authorize.
 * @returns Session auth context or null when SSO is off or user is unsigned.
 * @throws Error when signed in but not a member of the tenant.
 */
async function tryResolveSessionForTenant(
  db: DbClient,
  tenantId: string,
): Promise<TenantAuthContext | null> {
  if (!isSsoEnabled()) {
    return null;
  }

  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const role = await getMembershipForTenant(db, userId, tenantId);
  if (!role) {
    throw new Error("Forbidden: user is not a member of this tenant");
  }

  return {
    tenantId,
    source: "session",
    role,
    userId,
  };
}

/**
 * Resolves any authenticated Clerk session with at least one tenant membership.
 *
 * @param db - Database client.
 * @returns Session auth with first membership tenant, or null.
 * @throws Error when signed in without memberships.
 */
async function tryResolveSessionAnyTenant(db: DbClient): Promise<TenantAuthContext | null> {
  if (!isSsoEnabled()) {
    return null;
  }

  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const hasMembership = await userHasAnyMembership(db, userId);
  if (!hasMembership) {
    throw new Error("Forbidden: user has no tenant memberships");
  }

  return {
    tenantId: "",
    source: "session",
    role: null,
    userId,
  };
}
