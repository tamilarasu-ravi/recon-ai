import { NextResponse } from "next/server";

import { assertTenantScope, authorizeApiRequest } from "@/lib/auth/api-auth";
import type { ApiAuthContext } from "@/lib/auth/api-auth";
import { assertTenantApiRateLimit } from "@/lib/api/apply-rate-limit";
import type { DbClient } from "@/lib/db/client";
import { runWithRlsBypass, runWithTenantRls } from "@/lib/db/tenant-rls";
import { RateLimitExceededError } from "@/lib/security/rate-limit";

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
  return runWithRlsBypass(async () => {
    const { getDb } = await import("@/lib/db/client");
    const auth = await authorizeApiRequest(getDb(), request);
    assertTenantScope(auth, tenantId);
    assertTenantApiRateLimit(tenantId, "tenant-api");
    return auth;
  });
}

/**
 * Authorizes the request and runs handler work inside a tenant-scoped RLS transaction.
 *
 * @param request - Incoming HTTP request.
 * @param tenantId - Tenant id from query or body.
 * @param handler - Route logic using getDb() within the RLS scope.
 * @returns Handler result.
 */
export async function withTenantAccess<T>(
  request: Request,
  tenantId: string,
  handler: (db: DbClient, auth: ApiAuthContext | null) => Promise<T>,
): Promise<T> {
  const auth = await requireTenantAccess(request, tenantId);
  return runWithTenantRls(tenantId, async () => {
    const { getDb } = await import("@/lib/db/client");
    return handler(getDb(), auth);
  });
}

/**
 * Maps auth errors to HTTP responses for route handlers.
 *
 * @param error - Caught error from route handler.
 * @param fallbackMessage - Default message for non-Error values.
 * @returns NextResponse with appropriate status.
 */
export function toRouteErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSec) },
      },
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = resolveRouteErrorStatus(message);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Maps error messages to HTTP status codes for API routes.
 *
 * @param message - Error message text.
 * @returns HTTP status code.
 */
function resolveRouteErrorStatus(message: string): number {
  if (message.includes("Forbidden:")) {
    return 403;
  }
  if (message.includes("API key") || message.includes("Invalid or inactive")) {
    return 401;
  }
  if (message.includes("not found") || message.includes("Unknown tenant")) {
    return 404;
  }
  return 400;
}
