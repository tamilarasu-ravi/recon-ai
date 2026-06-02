import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getTenantMetrics } from "@/lib/data/tenant-metrics";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Returns aggregate dashboard metrics for a tenant.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();
    const metrics = await getTenantMetrics(db, parsed.tenant_id);

    return NextResponse.json({ metrics });
  } catch (error) {
    return toRouteErrorResponse(error, "Metrics fetch failed");
  }
}
