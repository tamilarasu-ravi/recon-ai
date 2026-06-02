import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
import { resumeAutoTagApproval } from "@/lib/orchestrator/run-pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const approveSchema = z.object({
  tenant_id: z.string().uuid(),
  run_id: z.string().uuid(),
  approved: z.boolean(),
});

/**
 * Resumes a LangGraph AUTO_TAG interrupt after human approval or rejection.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const body: unknown = await request.json();
    const parsed = approveSchema.parse(body);
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();

    const result = await resumeAutoTagApproval(
      db,
      parsed.tenant_id,
      transactionId,
      parsed.run_id,
      parsed.approved,
    );

    return NextResponse.json(result);
  } catch (error) {
    return toRouteErrorResponse(error, "Approve failed");
  }
}
