import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { chartOfAccounts, reviewQueue, transactions } from "@/lib/db/schema";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  status: z.enum(["open", "resolved", "all"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Lists review queue items for a tenant with transaction and GL context.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      tenant_id: url.searchParams.get("tenant_id"),
      status: url.searchParams.get("status") ?? "open",
      limit: url.searchParams.get("limit") ?? 50,
    });

    const db = getDb();
    const statusFilter =
      parsed.status === "all" ? undefined : eq(reviewQueue.status, parsed.status);

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
      .where(
        statusFilter
          ? and(eq(reviewQueue.tenantId, parsed.tenant_id), statusFilter)
          : eq(reviewQueue.tenantId, parsed.tenant_id),
      )
      .orderBy(desc(reviewQueue.createdAt))
      .limit(parsed.limit);

    return NextResponse.json({ items: rows, count: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review queue fetch failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
