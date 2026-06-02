import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { newRunId } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { syncAutoTagToErp } from "@/lib/integrations/erp/sync-auto-tag";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
});

/**
 * Manually triggers ERP post for an AUTO_TAG transaction (sandbox mock by default).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = bodySchema.parse(body);
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();
    const txnRows = await db
      .select({
        taggingDecision: transactions.taggingDecision,
        suggestedGlAccountId: transactions.suggestedGlAccountId,
        glAccountId: transactions.glAccountId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, parsed.transaction_id),
          eq(transactions.tenantId, parsed.tenant_id),
        ),
      )
      .limit(1);

    const txn = txnRows[0];
    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (txn.taggingDecision !== "AUTO_TAG") {
      return NextResponse.json(
        { error: "Only AUTO_TAG transactions can be posted to ERP" },
        { status: 400 },
      );
    }

    const glAccountId = txn.glAccountId ?? txn.suggestedGlAccountId;
    if (!glAccountId) {
      return NextResponse.json({ error: "No GL account available to post" }, { status: 400 });
    }

    const runId = newRunId();
    const result = await syncAutoTagToErp(db, {
      tenantId: parsed.tenant_id,
      transactionId: parsed.transaction_id,
      runId,
      glAccountId,
    });

    return NextResponse.json({ posted: result, run_id: runId });
  } catch (error) {
    return toRouteErrorResponse(error, "ERP post failed");
  }
}
