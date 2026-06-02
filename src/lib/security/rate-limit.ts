const buckets = new Map<string, { count: number; windowStartMs: number }>();

const DEFAULT_WINDOW_MS = 60_000;

/**
 * Error thrown when a client exceeds the configured request rate.
 */
export class RateLimitExceededError extends Error {
  readonly retryAfterSec: number;

  /**
   * @param retryAfterSec - Seconds until the client should retry.
   */
  constructor(retryAfterSec: number) {
    super(`Rate limit exceeded — retry after ${retryAfterSec}s`);
    this.name = "RateLimitExceededError";
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Reads a positive integer rate limit from environment.
 *
 * @param envKey - Environment variable name.
 * @param fallback - Default max requests per window.
 * @returns Max requests allowed per window.
 */
export function readRateLimitFromEnv(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

/**
 * Enforces a fixed-window request count for a composite key (tenant + route).
 *
 * @param key - Unique bucket key (e.g. tenantId:ingest).
 * @param maxRequests - Maximum requests per window.
 * @param windowMs - Window size in milliseconds.
 * @throws RateLimitExceededError when the limit is exceeded.
 */
export function assertRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return;
  }

  if (existing.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - existing.windowStartMs)) / 1000));
    throw new RateLimitExceededError(retryAfterSec);
  }

  existing.count += 1;
  buckets.set(key, existing);
}

/**
 * Resets in-memory buckets — for unit tests only.
 */
export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}

/**
 * Derives a stable client identifier from proxy headers.
 *
 * @param request - Incoming HTTP request.
 * @returns Client IP or fallback label.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : "unknown";
}
