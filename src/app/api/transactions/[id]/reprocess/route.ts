import { after } from "next/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { newRunId } from "@/lib/config/env";
import { transactions } from "@/lib/db/schema";
import { resetTransactionForReprocess } from "@/lib/orchestrator/processing-failure";
import { runQueuedTransactionInBackground } from "@/lib/orchestrator/queue-transaction-ingest";
import { reprocessTransactionTagging } from "@/lib/orchestrator/reprocess-tagging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const tenantIdSchema = z.string().uuid();

const bodySchema = z
  .object({
    tenant_id: tenantIdSchema.optional(),
    run_immediately: z.boolean().optional(),
  })
  .optional();

/**
 * Resolves tenant_id from query string or JSON body (UI sends body; other routes use query).
 *
 * @param request - Incoming POST request.
 * @param url - Parsed request URL.
 * @returns Tenant UUID and optional parsed body for further fields.
 * @throws ZodError when tenant_id is missing or invalid.
 */
async function resolveReprocessRequest(
  request: Request,
  url: URL,
): Promise<{ tenantId: string; body: z.infer<typeof bodySchema> }> {
  const fromQuery = url.searchParams.get("tenant_id");
  const contentLength = request.headers.get("content-length");
  const hasBody = contentLength !== null && contentLength !== "0";

  let rawBody: unknown;
  if (hasBody) {
    rawBody = await request.json();
  }

  const body = bodySchema.parse(rawBody);
  const tenantId = tenantIdSchema.parse(fromQuery ?? body?.tenant_id);

  return { tenantId, body };
}

/**
 * Re-runs tagging on completed transactions or resets failed rows for queue retry.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const url = new URL(request.url);
    const { tenantId, body: options } = await resolveReprocessRequest(request, url);

    return await withTenantAccess(
      request,
      tenantId,
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
          .where(and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)))
          .limit(1);

        const txn = rows[0];
        if (!txn) {
          return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
        }

        if (txn.processingStatus === "completed") {
          const result = await reprocessTransactionTagging(db, tenantId, transactionId);
          return NextResponse.json({
            transaction_id: transactionId,
            run_id: result.runId,
            decision: result.decision,
            reason: result.reason,
            confidence: result.confidence,
            policy_outcome: result.policyOutcome,
            reprocess_mode: "tagging",
          });
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
          reprocess_mode: "queue_retry",
        });
      },
      { permission: "review:write" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Transaction reprocess failed");
  }
}
