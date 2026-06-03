import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
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
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();
    const connections = await listErpConnectionStatus(db, parsed.tenant_id);

    return NextResponse.json({
      connections,
      quickbooks_oauth_configured: getQuickBooksConfig() !== null,
      erp_provider: process.env.ERP_PROVIDER?.trim() || "mock",
    });
  } catch (error) {
    return toRouteErrorResponse(error, "ERP connections fetch failed");
  }
}
