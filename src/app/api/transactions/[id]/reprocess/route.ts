import { after } from "next/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { transactions } from "@/lib/db/schema";
import { resetTransactionForReprocess } from "@/lib/orchestrator/processing-failure";
import { runQueuedTransactionInBackground } from "@/lib/orchestrator/queue-transaction-ingest";
import { newRunId } from "@/lib/config/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

const bodySchema = z
  .object({
    run_immediately: z.boolean().optional(),
  })
  .optional();

/**
 * Resets a transaction for another processing attempt (manual recovery / dead-letter replay).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    const body: unknown =
      request.headers.get("content-length") === "0" ? undefined : await request.json();
    const options = bodySchema.parse(body);

    return await withTenantAccess(
      request,
      parsed.tenant_id,
      async (db) => {
      const rows = await db
        .select({
          id: transactions.id,
          tenantId: transactions.tenantId,
          externalTransactionId: transactions.externalTransactionId,
          transactionTimestamp: transactions.transactionTimestamp,
          amount: transactions.amount,
          currency: transactions.currency,
          vendorRaw: transactions.vendorRaw,
          memo: transactions.memo,
          mcc: transactions.mcc,
          processingStatus: transactions.processingStatus,
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

      if (txn.processingStatus === "completed") {
        return NextResponse.json(
          { error: "Transaction already completed — ingest a new external_transaction_id instead" },
          { status: 409 },
        );
      }

      const immediate = options?.run_immediately ?? true;
      const updated = await resetTransactionForReprocess(db, transactionId, {
        immediate,
      });

      if (!updated) {
        return NextResponse.json({ error: "Reprocess reset failed" }, { status: 500 });
      }

      const runId = newRunId();

      if (immediate) {
        after(() =>
          runQueuedTransactionInBackground({
            runId,
            transactionId: txn.id,
            tenantId: txn.tenantId,
            externalTransactionId: txn.externalTransactionId,
            transactionTimestamp: txn.transactionTimestamp.toISOString(),
            amount: String(txn.amount),
            currency: txn.currency,
            vendorRaw: txn.vendorRaw,
            memo: txn.memo ?? undefined,
            mcc: txn.mcc ?? undefined,
          }),
        );
      }

      return NextResponse.json({
        transaction_id: transactionId,
        run_id: runId,
        processing_status: "pending",
        scheduled_immediately: immediate,
      });
    },
      { permission: "review:write" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Transaction reprocess failed");
  }
}
