import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { deletePolicyRule } from "@/lib/data/policy-admin";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Deletes a policy rule for a tenant.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: ruleId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();
    const deleted = await deletePolicyRule(db, parsed.tenant_id, ruleId);

    if (!deleted) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toRouteErrorResponse(error, "Policy rule delete failed");
  }
}
