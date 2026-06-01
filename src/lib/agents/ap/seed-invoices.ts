import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { invoices, tenants } from "@/lib/db/schema";
import { runApPipeline } from "@/lib/orchestrator/run-ap-pipeline";

interface MockInvoiceRow {
  external_invoice_id: string;
  vendor_raw: string;
  amount: string;
  currency: string;
  invoice_date: string;
}

/**
 * Seeds mock invoices from data/mock_invoices/{slug}.json via AP pipeline.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug matching JSON filename.
 * @returns Count of invoices accepted (skips existing external ids).
 */
export async function seedMockInvoicesForTenant(
  db: DbClient,
  tenantSlug: string,
): Promise<number> {
  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  const tenantId = tenantRows[0]?.id;
  if (!tenantId) {
    throw new Error(`Tenant not found for invoice seed: ${tenantSlug}`);
  }

  const filePath = join(process.cwd(), "data/mock_invoices", `${tenantSlug}.json`);
  const rows = JSON.parse(readFileSync(filePath, "utf8")) as MockInvoiceRow[];

  let accepted = 0;

  for (const row of rows) {
    const existing = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.externalInvoiceId, row.external_invoice_id),
        ),
      )
      .limit(1);

    if (existing[0]) {
      continue;
    }

    const result = await runApPipeline(db, {
      tenantId,
      externalInvoiceId: row.external_invoice_id,
      vendorRaw: row.vendor_raw,
      amount: row.amount,
      currency: row.currency,
      invoiceDate: row.invoice_date,
    });

    if (result.status === "accepted") {
      accepted += 1;
    }
  }

  return accepted;
}
