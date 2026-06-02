import {
  assertRateLimit,
  getClientIp,
  readRateLimitFromEnv,
} from "@/lib/security/rate-limit";

/**
 * Applies per-tenant ingest rate limiting for transaction and invoice ingest routes.
 *
 * @param tenantId - Tenant UUID from validated request body.
 * @param routeKey - Route identifier (e.g. ingest-transactions).
 */
export function assertIngestRateLimit(tenantId: string, routeKey: string): void {
  const limit = readRateLimitFromEnv("RATE_LIMIT_INGEST_PER_MIN", 60);
  assertRateLimit(`${tenantId}:${routeKey}`, limit);
}

/**
 * Applies webhook rate limiting by tenant slug and client IP (before signature verify).
 *
 * @param request - Incoming webhook request.
 * @param tenantSlug - Resolved tenant slug from query.
 */
export function assertWebhookRateLimit(request: Request, tenantSlug: string): void {
  const limit = readRateLimitFromEnv("RATE_LIMIT_WEBHOOK_PER_MIN", 120);
  const ip = getClientIp(request);
  assertRateLimit(`webhook:${tenantSlug}:${ip}`, limit);
}

/**
 * Applies default API rate limiting for authenticated tenant routes.
 *
 * @param tenantId - Tenant UUID.
 * @param routeKey - Route identifier.
 */
export function assertTenantApiRateLimit(tenantId: string, routeKey: string): void {
  const limit = readRateLimitFromEnv("RATE_LIMIT_API_PER_MIN", 300);
  assertRateLimit(`${tenantId}:api:${routeKey}`, limit);
}
