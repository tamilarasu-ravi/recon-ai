import { NextResponse } from "next/server";

import { assertTenantScope, authorizeApiRequest } from "@/lib/auth/api-auth";
import type { ApiAuthContext } from "@/lib/auth/api-auth";
import { getDb } from "@/lib/db/client";

/**
 * Authorizes an API request and validates tenant scope when auth is enabled.
 *
 * @param request - Incoming request.
 * @param tenantId - Tenant id from query or body.
 * @returns Auth context (null when auth disabled).
 * @throws Error when authorization fails.
 */
export async function requireTenantAccess(
  request: Request,
  tenantId: string,
): Promise<ApiAuthContext | null> {
  const db = getDb();
  const auth = await authorizeApiRequest(db, request);
  assertTenantScope(auth, tenantId);
  return auth;
}

/**
 * Maps auth errors to HTTP responses for route handlers.
 *
 * @param error - Caught error from route handler.
 * @param fallbackMessage - Default message for non-Error values.
 * @returns NextResponse with appropriate status.
 */
export function toRouteErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const status =
    message.includes("API key") || message.includes("authorized") ? 401 : 400;
  return NextResponse.json({ error: message }, { status });
}
