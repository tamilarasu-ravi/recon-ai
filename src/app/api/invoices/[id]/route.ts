import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { getApInvoiceDetail } from "@/lib/data/ap-invoice-list";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Returns AP invoice detail with recommendation metadata.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: invoiceId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const invoice = await getApInvoiceDetail(db, parsed.tenant_id, invoiceId);

      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }

      return NextResponse.json({ invoice });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Invoice fetch failed");
  }
}
