import type {
  ReviewQueueItemDto,
  ReviewQueueListResponse,
  ReviewQueueStatusFilter,
} from "@/lib/ui/review-queue-types";

const CACHE_PREFIX = "recon-review-queue:";
const DEFAULT_TTL_MS = 60_000;

interface ReviewQueueCacheEntry {
  data: ReviewQueueListResponse;
  cachedAt: number;
}

const memoryCache = new Map<string, ReviewQueueCacheEntry>();

/**
 * Builds a stable cache key for tenant + status filter.
 *
 * @param tenantId - Tenant UUID.
 * @param status - Queue status filter.
 * @returns Cache key string.
 */
export function reviewQueueCacheKey(tenantId: string, status: ReviewQueueStatusFilter): string {
  return `${tenantId}:${status}`;
}

/**
 * Reads cached review queue list from memory or sessionStorage.
 *
 * @param tenantId - Tenant UUID.
 * @param status - Queue status filter.
 * @param ttlMs - Max age before cache is stale.
 * @returns Cached response or null when missing or expired.
 */
export function readReviewQueueCache(
  tenantId: string,
  status: ReviewQueueStatusFilter,
  ttlMs: number = DEFAULT_TTL_MS,
): ReviewQueueListResponse | null {
  const key = reviewQueueCacheKey(tenantId, status);
  const now = Date.now();

  const mem = memoryCache.get(key);
  if (mem && now - mem.cachedAt < ttlMs) {
    return mem.data;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) {
      return null;
    }
    const entry = JSON.parse(raw) as ReviewQueueCacheEntry;
    if (now - entry.cachedAt >= ttlMs) {
      sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }
    memoryCache.set(key, entry);
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Persists a review queue list response to memory and sessionStorage.
 *
 * @param tenantId - Tenant UUID.
 * @param status - Queue status filter.
 * @param data - Full list response including pagination cursor.
 */
export function writeReviewQueueCache(
  tenantId: string,
  status: ReviewQueueStatusFilter,
  data: ReviewQueueListResponse,
): void {
  const key = reviewQueueCacheKey(tenantId, status);
  const entry: ReviewQueueCacheEntry = { data, cachedAt: Date.now() };
  memoryCache.set(key, entry);

  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // sessionStorage full — memory cache still works for the session
  }
}

/**
 * Clears cached review queue data for one tenant or all tenants.
 *
 * @param tenantId - Optional tenant UUID; when omitted clears all queue caches.
 */
export function invalidateReviewQueueCache(tenantId?: string): void {
  if (tenantId) {
    for (const status of ["open", "resolved", "all"] as const) {
      const key = reviewQueueCacheKey(tenantId, status);
      memoryCache.delete(key);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
      }
    }
    return;
  }

  memoryCache.clear();
  if (typeof window !== "undefined") {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = sessionStorage.key(index);
      if (storageKey?.startsWith(CACHE_PREFIX)) {
        sessionStorage.removeItem(storageKey);
      }
    }
  }
}

/**
 * Merges a new page of items into a cached accumulated list.
 *
 * @param existing - Previously loaded items.
 * @param incoming - New page items.
 * @returns De-duplicated combined list preserving order.
 */
export function mergeReviewQueueItems(
  existing: ReviewQueueItemDto[],
  incoming: ReviewQueueItemDto[],
): ReviewQueueItemDto[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}
