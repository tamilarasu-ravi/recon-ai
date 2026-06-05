import { NextResponse } from "next/server";
import { z } from "zod";

import { buildTenantApCashForecast } from "@/lib/agents/ap/forecast-loader";
import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Returns deterministic AP cash forecast for a tenant (recommend-only planning).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const forecast = await buildTenantApCashForecast(db, parsed.tenant_id);
      return NextResponse.json({ forecast });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "AP cash forecast failed");
  }
}
