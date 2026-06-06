import { NextResponse } from "next/server";

import { assertIngestRateLimit } from "@/lib/api/apply-rate-limit";
import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { bulkIngestBodySchema } from "@/lib/ingest/bulk-transaction-schema";
import { runBulkTransactionIngest } from "@/lib/ingest/run-bulk-ingest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Ingests up to 50 transactions in one request (async by default).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = bulkIngestBodySchema.parse(body);
    assertIngestRateLimit(parsed.tenant_id, "ingest-transactions-bulk");

    return await withTenantAccess(
      request,
      parsed.tenant_id,
      async (db) => {
        const summary = await runBulkTransactionIngest(
          db,
          parsed.tenant_id,
          parsed.transactions,
          { async: parsed.async },
        );

        return NextResponse.json(
          {
            ...summary,
            async: parsed.async,
          },
          { status: parsed.async ? 202 : 201 },
        );
      },
      { permission: "ingest:write" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Bulk ingest failed");
  }
}
