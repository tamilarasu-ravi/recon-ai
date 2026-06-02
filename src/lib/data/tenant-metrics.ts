import { and, count, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { auditLog, invoices, reviewQueue, transactions } from "@/lib/db/schema";

export interface TenantMetricsDto {
  transactionsTotal: number;
  autoTagCount: number;
  queueReviewCount: number;
  refuseCount: number;
  openReviewQueueCount: number;
  erpPostedCount: number;
  invoiceCount: number;
  autoTagRate: number;
  llmCostUsdTotal: number;
  llmPromptTokensTotal: number;
  llmCompletionTokensTotal: number;
  llmRunsWithLiveCall: number;
}

/**
 * Aggregates dashboard metrics for a tenant from transactions, queue, and invoices.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Counts and AUTO_TAG rate (0–1).
 */
export async function getTenantMetrics(
  db: DbClient,
  tenantId: string,
): Promise<TenantMetricsDto> {
  const [txnStats] = await db
    .select({
      total: count(),
      autoTag: sql<number>`count(*) filter (where ${transactions.taggingDecision} = 'AUTO_TAG')`,
      queueReview: sql<number>`count(*) filter (where ${transactions.taggingDecision} = 'QUEUE_REVIEW')`,
      refuse: sql<number>`count(*) filter (where ${transactions.taggingDecision} = 'REFUSE')`,
      erpPosted: sql<number>`count(*) filter (where ${transactions.erpExternalId} is not null)`,
    })
    .from(transactions)
    .where(eq(transactions.tenantId, tenantId));

  const [openQueue] = await db
    .select({ total: count() })
    .from(reviewQueue)
    .where(and(eq(reviewQueue.tenantId, tenantId), eq(reviewQueue.status, "open")));

  const [invoiceStats] = await db
    .select({ total: count() })
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId));

  const [llmCostStats] = await db
    .select({
      costUsd: sql<number>`coalesce(sum((${auditLog.observability}->>'cost_usd')::numeric), 0)`,
      promptTokens: sql<number>`coalesce(sum((${auditLog.observability}->>'prompt_tokens')::bigint), 0)`,
      completionTokens: sql<number>`coalesce(sum((${auditLog.observability}->>'completion_tokens')::bigint), 0)`,
      liveCalls: sql<number>`count(*) filter (where ${auditLog.observability}->>'llm_skipped' = 'false')`,
    })
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.agent, "tagging")));

  const transactionsTotal = Number(txnStats?.total ?? 0);
  const autoTagCount = Number(txnStats?.autoTag ?? 0);
  const autoTagRate = transactionsTotal > 0 ? autoTagCount / transactionsTotal : 0;

  return {
    transactionsTotal,
    autoTagCount,
    queueReviewCount: Number(txnStats?.queueReview ?? 0),
    refuseCount: Number(txnStats?.refuse ?? 0),
    openReviewQueueCount: Number(openQueue?.total ?? 0),
    erpPostedCount: Number(txnStats?.erpPosted ?? 0),
    invoiceCount: Number(invoiceStats?.total ?? 0),
    autoTagRate,
    llmCostUsdTotal: Number(llmCostStats?.costUsd ?? 0),
    llmPromptTokensTotal: Number(llmCostStats?.promptTokens ?? 0),
    llmCompletionTokensTotal: Number(llmCostStats?.completionTokens ?? 0),
    llmRunsWithLiveCall: Number(llmCostStats?.liveCalls ?? 0),
  };
}
