import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";

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
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();

    const rows = await db
      .select({
        id: transactions.id,
        processingStatus: transactions.processingStatus,
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

    return NextResponse.json({
      transaction_id: txn.id,
      processing_status: txn.processingStatus,
      tagging_decision: txn.taggingDecision,
      confidence: txn.confidence ? Number(txn.confidence) : null,
      suggested_gl_account_id: txn.suggestedGlAccountId,
      updated_at: txn.updatedAt.toISOString(),
      ready:
        txn.processingStatus === "completed" ||
        txn.processingStatus === "failed",
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Transaction status fetch failed");
  }
}
