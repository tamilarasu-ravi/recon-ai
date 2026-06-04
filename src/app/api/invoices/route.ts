import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { listApInvoicesForTenant } from "@/lib/data/ap-invoice-list";
import { runApPipeline } from "@/lib/orchestrator/run-ap-pipeline";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  tenant_id: z.string().uuid(),
});

const ingestInvoiceSchema = z.object({
  tenant_id: z.string().uuid(),
  external_invoice_id: z.string().min(1).max(128),
  vendor_raw: z.string().min(1).max(256),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default("USD"),
  invoice_date: z.string().datetime(),
});

/**
 * Lists AP invoices for a tenant.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = listQuerySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const items = await listApInvoicesForTenant(db, parsed.tenant_id);
      return NextResponse.json({ items });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Invoice list failed");
  }
}

/**
 * Ingests an invoice and runs the AP LangGraph workflow.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = ingestInvoiceSchema.parse(body);

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const result = await runApPipeline(db, {
        tenantId: parsed.tenant_id,
        externalInvoiceId: parsed.external_invoice_id,
        vendorRaw: parsed.vendor_raw,
        amount: parsed.amount,
        currency: parsed.currency,
        invoiceDate: parsed.invoice_date,
      });

      return NextResponse.json(result, { status: result.status === "duplicate" ? 409 : 201 });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Invoice ingest failed");
  }
}
