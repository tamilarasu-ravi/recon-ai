import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
import { runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";

/** Allow tagging pipeline + optional LLM on Vercel (Pro plan may be required for >10s). */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ingestSchema = z.object({
  tenant_id: z.string().uuid(),
  external_transaction_id: z.string().min(1).max(128),
  transaction_timestamp: z.string().datetime(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default("USD"),
  vendor_raw: z.string().min(1).max(256),
  memo: z.string().max(512).optional(),
  mcc: z.string().max(8).optional(),
});

/**
 * Accepts a synthetic transaction ingest payload and runs the orchestrator skeleton.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = ingestSchema.parse(body);
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();

    const result = await runTaggingPipeline(db, {
      tenantId: parsed.tenant_id,
      externalTransactionId: parsed.external_transaction_id,
      transactionTimestamp: parsed.transaction_timestamp,
      amount: parsed.amount,
      currency: parsed.currency,
      vendorRaw: parsed.vendor_raw,
      memo: parsed.memo,
      mcc: parsed.mcc,
    });

    return NextResponse.json(result, {
      status:
        result.status === "duplicate"
          ? 200
          : result.status === "pending_approval"
            ? 202
            : 201,
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Ingest failed");
  }
}
