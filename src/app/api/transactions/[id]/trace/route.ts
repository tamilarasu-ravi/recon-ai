import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { loadPipelineTraceSnapshot } from "@/lib/pipeline/load-trace-steps";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  run_id: z.string().uuid(),
});

/**
 * Returns a one-shot JSON snapshot of pipeline trace steps (for replay / DevTools).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      tenant_id: url.searchParams.get("tenant_id"),
      run_id: url.searchParams.get("run_id"),
    });

    await requireTenantAccess(request, parsed.tenant_id);

    const snapshot = await runWithRlsBypass(async () => {
      const db = getDb();
      return loadPipelineTraceSnapshot(
        db,
        parsed.tenant_id,
        transactionId,
        parsed.run_id,
      );
    });

    if (snapshot.processing_status === null && snapshot.steps.length === 0) {
      return NextResponse.json({ error: "Transaction not found for tenant" }, { status: 404 });
    }

    return NextResponse.json({
      transaction_id: transactionId,
      run_id: parsed.run_id,
      ...snapshot,
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Trace snapshot failed");
  }
}
