import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/api/cron-auth";
import { getDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { drainPendingTransactions } from "@/lib/orchestrator/drain-pending-transactions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Worker endpoint — claims pending/stale transactions and runs the tagging pipeline.
 * Secure with CRON_SECRET (Bearer or X-Cron-Secret). Schedule via Vercel Cron or external scheduler.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const batchParam = url.searchParams.get("batch_size");
  const batchSize = batchParam ? Number.parseInt(batchParam, 10) : undefined;

  const result = await runWithRlsBypass(async () => {
    const db = getDb();
    return drainPendingTransactions(db, {
      batchSize: Number.isFinite(batchSize) && batchSize! > 0 ? batchSize : undefined,
    });
  });

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
