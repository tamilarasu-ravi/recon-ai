import { and, eq, gt, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { transactions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Lists transactions in retry or dead-letter states for operator triage.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      tenant_id: url.searchParams.get("tenant_id"),
      limit: url.searchParams.get("limit") ?? undefined,
    });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const rows = await db
        .select({
          id: transactions.id,
          externalTransactionId: transactions.externalTransactionId,
          processingStatus: transactions.processingStatus,
          processingAttemptCount: transactions.processingAttemptCount,
          processingLastError: transactions.processingLastError,
          processingNextRetryAt: transactions.processingNextRetryAt,
          updatedAt: transactions.updatedAt,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, parsed.tenant_id),
            or(
              eq(transactions.processingStatus, "dead_letter"),
              and(
                eq(transactions.processingStatus, "pending"),
                gt(transactions.processingAttemptCount, 0),
              ),
            ),
          ),
        )
        .limit(parsed.limit);

      return NextResponse.json({
        tenant_id: parsed.tenant_id,
        count: rows.length,
        transactions: rows.map((row) => ({
          transaction_id: row.id,
          external_transaction_id: row.externalTransactionId,
          processing_status: row.processingStatus,
          attempt_count: row.processingAttemptCount,
          last_error: row.processingLastError,
          next_retry_at: row.processingNextRetryAt?.toISOString() ?? null,
          updated_at: row.updatedAt.toISOString(),
        })),
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Processing failures fetch failed");
  }
}
