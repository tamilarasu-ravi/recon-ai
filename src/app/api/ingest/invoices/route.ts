import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
import { runApPipeline } from "@/lib/orchestrator/run-ap-pipeline";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const ingestInvoiceSchema = z.object({
  tenant_id: z.string().uuid(),
  external_invoice_id: z.string().min(1).max(128),
  vendor_raw: z.string().min(1).max(256),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default("USD"),
  invoice_date: z.string().datetime(),
});

/**
 * Accepts a mock invoice and runs recommend-only AP (duplicate check + pay-date stub).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = ingestInvoiceSchema.parse(body);
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();

    const result = await runApPipeline(db, {
      tenantId: parsed.tenant_id,
      externalInvoiceId: parsed.external_invoice_id,
      vendorRaw: parsed.vendor_raw,
      amount: parsed.amount,
      currency: parsed.currency,
      invoiceDate: parsed.invoice_date,
    });

    return NextResponse.json(result, { status: result.status === "duplicate" ? 409 : 201 });
  } catch (error) {
    return toRouteErrorResponse(error, "Invoice ingest failed");
  }
}
