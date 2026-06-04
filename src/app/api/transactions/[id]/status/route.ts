import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { transactions } from "@/lib/db/schema";
import {
  isTerminalProcessingStatus,
  type ProcessingStatus,
} from "@/lib/orchestrator/processing-retry";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Lightweight poll endpoint for async ingest — returns processing and tagging fields only.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const rows = await db
        .select({
          id: transactions.id,
          processingStatus: transactions.processingStatus,
          processingAttemptCount: transactions.processingAttemptCount,
          processingLastError: transactions.processingLastError,
          processingNextRetryAt: transactions.processingNextRetryAt,
          taggingDecision: transactions.taggingDecision,
          confidence: transactions.confidence,
          suggestedGlAccountId: transactions.suggestedGlAccountId,
          updatedAt: transactions.updatedAt,
        })
        .from(transactions)
        .where(
          and(eq(transactions.id, transactionId), eq(transactions.tenantId, parsed.tenant_id)),
        )
        .limit(1);

      const txn = rows[0];
      if (!txn) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }

      const processingStatus = txn.processingStatus as ProcessingStatus;

      return NextResponse.json({
        transaction_id: txn.id,
        processing_status: txn.processingStatus,
        attempt_count: txn.processingAttemptCount,
        last_error: txn.processingLastError,
        next_retry_at: txn.processingNextRetryAt?.toISOString() ?? null,
        tagging_decision: txn.taggingDecision,
        confidence: txn.confidence ? Number(txn.confidence) : null,
        suggested_gl_account_id: txn.suggestedGlAccountId,
        updated_at: txn.updatedAt.toISOString(),
        ready: isTerminalProcessingStatus(processingStatus),
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Transaction status fetch failed");
  }
}
