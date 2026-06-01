import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";

export interface InvoiceDuplicateInput {
  tenantId: string;
  vendorRaw: string;
  amount: string;
  invoiceDateIso: string;
}

/**
 * Derives a stable duplicate-detection hash for an invoice (vendor + amount + date).
 *
 * @param input - Tenant-scoped invoice identity fields.
 * @returns SHA-256 hex digest used for duplicate comparison.
 */
export function deriveInvoiceDuplicateHash(input: InvoiceDuplicateInput): string {
  const vendorKey = input.vendorRaw.trim().toLowerCase().replace(/\s+/g, " ");
  const dateKey = input.invoiceDateIso.slice(0, 10);
  return createHash("sha256")
    .update(`${input.tenantId}:${vendorKey}:${input.amount}:${dateKey}`)
    .digest("hex");
}

/**
 * Finds an existing invoice with the same duplicate hash for a tenant.
 *
 * @param db - Database client.
 * @param input - Invoice fields used for hashing.
 * @returns Matching invoice id and external id, or null when unique.
 */
export async function findDuplicateInvoice(
  db: DbClient,
  input: InvoiceDuplicateInput,
): Promise<{ id: string; externalInvoiceId: string } | null> {
  const hash = deriveInvoiceDuplicateHash(input);
  const rows = await db
    .select({
      id: invoices.id,
      externalInvoiceId: invoices.externalInvoiceId,
      vendorRaw: invoices.vendorRaw,
      amount: invoices.amount,
      invoiceDate: invoices.invoiceDate,
    })
    .from(invoices)
    .where(eq(invoices.tenantId, input.tenantId));

  for (const row of rows) {
    const rowHash = deriveInvoiceDuplicateHash({
      tenantId: input.tenantId,
      vendorRaw: row.vendorRaw,
      amount: row.amount,
      invoiceDateIso: row.invoiceDate.toISOString(),
    });
    if (rowHash === hash) {
      return { id: row.id, externalInvoiceId: row.externalInvoiceId };
    }
  }

  return null;
}
