import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
import { applyTransactionOverride } from "@/lib/orchestrator/apply-override";

const overrideSchema = z.object({
  tenant_id: z.string().uuid(),
  gl_code: z.string().min(1).max(16),
  tax_code: z.string().max(32).optional(),
});

/**
 * Applies an accountant override: persists vendor_rules and updates transaction GL.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const body: unknown = await request.json();
    const parsed = overrideSchema.parse(body);
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();

    const result = await applyTransactionOverride(db, {
      tenantId: parsed.tenant_id,
      transactionId,
      glCode: parsed.gl_code,
      taxCode: parsed.tax_code,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Override failed";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return toRouteErrorResponse(error, "Override failed");
  }
}
