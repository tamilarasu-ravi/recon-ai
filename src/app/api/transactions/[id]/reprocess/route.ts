import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { reprocessTransactionTagging } from "@/lib/orchestrator/reprocess-tagging";

const reprocessSchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Re-runs policy and tagging on an existing transaction (e.g. after receipt upload).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const body: unknown = await request.json();
    const parsed = reprocessSchema.parse(body);
    const db = getDb();

    const result = await reprocessTransactionTagging(db, parsed.tenant_id, transactionId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reprocess failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
