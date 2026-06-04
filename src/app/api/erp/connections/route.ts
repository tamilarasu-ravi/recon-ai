import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { listErpConnectionStatus } from "@/lib/integrations/erp/erp-connections";
import { getQuickBooksConfig } from "@/lib/integrations/erp/quickbooks/config";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Lists ERP OAuth connection status for a tenant (no secrets).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const connections = await listErpConnectionStatus(db, parsed.tenant_id);

      return NextResponse.json({
        connections,
        quickbooks_oauth_configured: getQuickBooksConfig() !== null,
        erp_provider: process.env.ERP_PROVIDER?.trim() || "mock",
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "ERP connections fetch failed");
  }
}
