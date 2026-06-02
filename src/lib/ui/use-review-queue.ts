"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/ui/api-fetch";
import {
  invalidateReviewQueueCache,
  mergeReviewQueueItems,
  readReviewQueueCache,
  writeReviewQueueCache,
} from "@/lib/ui/review-queue-cache";
import type {
  ReviewQueueItemDto,
  ReviewQueueListResponse,
  ReviewQueueStatusFilter,
} from "@/lib/ui/review-queue-types";

const DEFAULT_PAGE_SIZE = 20;
const CACHE_TTL_MS = 60_000;

interface UseReviewQueueOptions {
  tenantId: string | null;
  status: ReviewQueueStatusFilter;
  enabled: boolean;
  pageSize?: number;
}

interface UseReviewQueueResult {
  items: ReviewQueueItemDto[];
  loading: boolean;
  loadingMore: boolean;
  revalidating: boolean;
  error: string | null;
  hasMore: boolean;
  fromCache: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Serializes API row dates to ISO strings for cache storage.
 *
 * @param items - Raw API items.
 * @returns DTO items with string dates.
 */
function normalizeItems(items: ReviewQueueItemDto[]): ReviewQueueItemDto[] {
  return items.map((item) => ({
    ...item,
    createdAt: String(item.createdAt),
  }));
}

/**
 * Fetches one page from the review-queue API.
 *
 * @param tenantId - Tenant UUID.
 * @param status - Status filter.
 * @param pageSize - Page limit.
 * @param cursor - Optional pagination cursor.
 * @returns Parsed list response.
 */
async function fetchReviewQueuePage(
  tenantId: string,
  status: ReviewQueueStatusFilter,
  pageSize: number,
  cursor?: string | null,
): Promise<ReviewQueueListResponse> {
  const params = new URLSearchParams({
    tenant_id: tenantId,
    status,
    limit: String(pageSize),
  });
  if (cursor) {
    params.set("cursor", typeof cursor === "string" ? cursor : String(cursor));
  }

  const response = await apiFetch(`/api/review-queue?${params}`);
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  const data = (await response.json()) as ReviewQueueListResponse;
  return {
    items: normalizeItems(data.items),
    page: data.page,
  };
}

/**
 * Loads the review queue with client cache (stale-while-revalidate) and cursor pagination.
 *
 * @param options - Tenant, status filter, and enable flag.
 * @returns Queue state and pagination actions.
 */
export function useReviewQueue({
  tenantId,
  status,
  enabled,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseReviewQueueOptions): UseReviewQueueResult {
  const [items, setItems] = useState<ReviewQueueItemDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const nextCursorRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const loadFirstPage = useCallback(
    async (options: { force: boolean }): Promise<void> => {
      if (!tenantId) {
        return;
      }

      const requestId = ++requestIdRef.current;
      const cached = !options.force ? readReviewQueueCache(tenantId, status, CACHE_TTL_MS) : null;

      if (cached) {
        setItems(cached.items);
        nextCursorRef.current = cached.page.nextCursor;
        setHasMore(cached.page.hasMore);
        setFromCache(true);
        setLoading(false);
      } else {
        setLoading(true);
        setFromCache(false);
      }

      setRevalidating(true);
      setError(null);

      try {
        const data = await fetchReviewQueuePage(tenantId, status, pageSize);
        if (requestId !== requestIdRef.current) {
          return;
        }

        setItems(data.items);
        nextCursorRef.current = data.page.nextCursor;
        setHasMore(data.page.hasMore);
        writeReviewQueueCache(tenantId, status, data);
        setFromCache(false);
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (!cached) {
          const message = err instanceof Error ? err.message : "Failed to load queue";
          setError(message);
          setItems([]);
          setHasMore(false);
          if (tenantId) {
            invalidateReviewQueueCache(tenantId);
          }
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRevalidating(false);
        }
      }
    },
    [tenantId, status, pageSize],
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (!tenantId || !nextCursorRef.current || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const data = await fetchReviewQueuePage(
        tenantId,
        status,
        pageSize,
        nextCursorRef.current,
      );

      setItems((prev) => {
        const merged = mergeReviewQueueItems(prev, data.items);
        writeReviewQueueCache(tenantId, status, {
          items: merged,
          page: data.page,
        });
        return merged;
      });
      nextCursorRef.current = data.page.nextCursor;
      setHasMore(data.page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [tenantId, status, pageSize, loadingMore]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!tenantId) {
      return;
    }
    invalidateReviewQueueCache(tenantId);
    nextCursorRef.current = null;
    await loadFirstPage({ force: true });
  }, [tenantId, loadFirstPage]);

  useEffect(() => {
    if (!enabled || !tenantId) {
      return;
    }

    nextCursorRef.current = null;
    setItems([]);
    setHasMore(false);
    setFromCache(false);

    void loadFirstPage({ force: false });
  }, [enabled, tenantId, status, loadFirstPage]);

  return {
    items,
    loading,
    loadingMore,
    revalidating,
    error,
    hasMore,
    fromCache,
    loadMore,
    refresh,
  };
}

export { invalidateReviewQueueCache };
