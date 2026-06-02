import { NextResponse } from "next/server";

import { listTenantsForCaller } from "@/lib/api/require-authenticated";
import { toRouteErrorResponse } from "@/lib/api/tenant-auth";

/**
 * Lists tenants visible to the caller (all in dev; API-key tenant only when auth is on).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const rows = await listTenantsForCaller(request);
    return NextResponse.json({ tenants: rows });
  } catch (error) {
    return toRouteErrorResponse(error, "Tenant list failed");
  }
}
