import { and, desc, eq, lt, or } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, reviewQueue, transactions } from "@/lib/db/schema";
import {
  decodeReviewQueueCursor,
  encodeReviewQueueCursor,
} from "@/lib/data/review-queue-cursor";

export type ReviewQueueStatusFilter = "open" | "resolved" | "all";

export interface ReviewQueueListItem {
  id: string;
  reason: string;
  status: string;
  runId: string;
  createdAt: Date;
  transactionId: string;
  externalTransactionId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
  taggingDecision: string | null;
  confidence: string | null;
  suggestedGlCode: string | null;
}

export interface ReviewQueueListPage {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ReviewQueueListResult {
  items: ReviewQueueListItem[];
  page: ReviewQueueListPage;
}

/**
 * Coerces a review-queue timestamp to a Date for Drizzle comparisons.
 *
 * @param value - Timestamp from DB row or cursor decode.
 * @returns Date instance for lt/eq filters.
 */
function toReviewQueueDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

/**
 * Builds a WHERE clause for keyset pagination on (created_at DESC, id DESC).
 *
 * @param cursor - Position after which to fetch older rows.
 * @returns Drizzle filter for rows strictly before the cursor.
 */
function reviewQueueCursorBefore(cursor: { createdAt: Date | string; id: string }) {
  const createdAt = toReviewQueueDate(cursor.createdAt);
  return or(
    lt(reviewQueue.createdAt, createdAt),
    and(eq(reviewQueue.createdAt, createdAt), lt(reviewQueue.id, cursor.id)),
  );
}

/**
 * Lists review queue rows for a tenant with cursor-based pagination.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param status - Status filter or all rows.
 * @param limit - Page size (max 100).
 * @param cursor - Opaque cursor from previous page.
 * @returns Items and pagination metadata.
 */
export async function listReviewQueuePage(
  db: DbClient,
  tenantId: string,
  status: ReviewQueueStatusFilter,
  limit: number,
  cursor?: string | null,
): Promise<ReviewQueueListResult> {
  const pageSize = Math.min(Math.max(limit, 1), 100);
  const decoded = cursor ? decodeReviewQueueCursor(cursor) : null;

  if (cursor && !decoded) {
    throw new Error("Invalid pagination cursor");
  }

  const tenantFilter = eq(reviewQueue.tenantId, tenantId);
  const statusFilter = status === "all" ? undefined : eq(reviewQueue.status, status);

  const cursorFilter = decoded ? reviewQueueCursorBefore(decoded) : undefined;

  const whereClause =
    statusFilter && cursorFilter
      ? and(tenantFilter, statusFilter, cursorFilter)
      : statusFilter
        ? and(tenantFilter, statusFilter)
        : cursorFilter
          ? and(tenantFilter, cursorFilter)
          : tenantFilter;

  const rows = await db
    .select({
      id: reviewQueue.id,
      reason: reviewQueue.reason,
      status: reviewQueue.status,
      runId: reviewQueue.runId,
      createdAt: reviewQueue.createdAt,
      transactionId: transactions.id,
      externalTransactionId: transactions.externalTransactionId,
      vendorRaw: transactions.vendorRaw,
      amount: transactions.amount,
      currency: transactions.currency,
      taggingDecision: transactions.taggingDecision,
      confidence: transactions.confidence,
      suggestedGlCode: chartOfAccounts.glCode,
    })
    .from(reviewQueue)
    .innerJoin(transactions, eq(reviewQueue.transactionId, transactions.id))
    .leftJoin(chartOfAccounts, eq(transactions.suggestedGlAccountId, chartOfAccounts.id))
    .where(whereClause)
    .orderBy(desc(reviewQueue.createdAt), desc(reviewQueue.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows,
    page: {
      limit: pageSize,
      hasMore,
      nextCursor:
        hasMore && last ? encodeReviewQueueCursor(last.createdAt, last.id) : null,
    },
  };
}
