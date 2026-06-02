import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getActivePolicyPack } from "@/lib/data/policy-admin";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Returns the active policy pack and compiled rules for a tenant.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();
    const pack = await getActivePolicyPack(db, parsed.tenant_id);

    return NextResponse.json({ policy: pack });
  } catch (error) {
    return toRouteErrorResponse(error, "Policy fetch failed");
  }
}
