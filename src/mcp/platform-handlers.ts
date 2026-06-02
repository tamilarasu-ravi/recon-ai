import { and, eq } from "drizzle-orm";

import { newRunId } from "@/lib/config/env";

import { listApInvoicesForTenant } from "@/lib/data/ap-invoice-list";
import { getActivePolicyPack } from "@/lib/data/policy-admin";
import { listReviewQueuePage } from "@/lib/data/review-queue-list";
import { syncAutoTagToErp } from "@/lib/integrations/erp/sync-auto-tag";
import { applyTransactionOverride } from "@/lib/orchestrator/apply-override";
import { getTenantIdBySlug, runApPipeline } from "@/lib/orchestrator/run-ap-pipeline";
import { reprocessTransactionTagging } from "@/lib/orchestrator/reprocess-tagging";
import { resumeAutoTagApproval, runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";
import type { DbClient } from "@/lib/db/client";
import { receipts, tenants, transactions } from "@/lib/db/schema";

/**
 * Serializes a handler result as MCP text content JSON.
 *
 * @param payload - Structured tool result.
 * @returns MCP content block array.
 */
export function mcpJsonResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * Resolves tenant UUID from slug for MCP tool calls.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug (e.g. tenant-a).
 * @returns Tenant UUID.
 * @throws Error when slug is unknown.
 */
export async function resolveTenantId(db: DbClient, tenantSlug: string): Promise<string> {
  return getTenantIdBySlug(db, tenantSlug);
}

/**
 * Ingests a transaction through the tagging orchestrator.
 *
 * @param db - Database client.
 * @param input - Ingest fields.
 * @returns Pipeline result JSON-serializable object.
 */
export async function handleIngestTransaction(
  db: DbClient,
  input: {
    tenant_slug: string;
    external_transaction_id: string;
    transaction_timestamp: string;
    amount: string;
    currency: string;
    vendor_raw: string;
    memo?: string;
    mcc?: string;
  },
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, input.tenant_slug);
  return runTaggingPipeline(db, {
    tenantId,
    externalTransactionId: input.external_transaction_id,
    transactionTimestamp: input.transaction_timestamp,
    amount: input.amount,
    currency: input.currency,
    vendorRaw: input.vendor_raw,
    memo: input.memo,
    mcc: input.mcc,
  });
}

/**
 * Lists open review queue items for a tenant.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug.
 * @param status - Queue filter.
 * @param limit - Max rows.
 * @returns Queue items with transaction context.
 */
export async function handleGetReviewQueue(
  db: DbClient,
  tenantSlug: string,
  status: "open" | "resolved" | "all" = "open",
  limit = 25,
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, tenantSlug);
  const result = await listReviewQueuePage(db, tenantId, status, limit);

  return {
    items: result.items.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    page: result.page,
  };
}

/**
 * Applies an accountant override for a transaction.
 *
 * @param db - Database client.
 * @param input - Override payload.
 * @returns Override result from orchestrator.
 */
export async function handleSubmitOverride(
  db: DbClient,
  input: { tenant_slug: string; transaction_id: string; gl_code: string; tax_code?: string },
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, input.tenant_slug);
  return applyTransactionOverride(db, {
    tenantId,
    transactionId: input.transaction_id,
    glCode: input.gl_code,
    taxCode: input.tax_code,
  });
}

/**
 * Uploads mock receipt text and marks receipt cleared.
 *
 * @param db - Database client.
 * @param input - Receipt upload fields.
 * @returns Cleared receipt metadata.
 */
export async function handleUploadReceipt(
  db: DbClient,
  input: { tenant_slug: string; transaction_id: string; receipt_text: string },
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, input.tenant_slug);
  const clearedAt = new Date();

  const existing = await db
    .select({ id: receipts.id })
    .from(receipts)
    .where(
      and(eq(receipts.tenantId, tenantId), eq(receipts.transactionId, input.transaction_id)),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(receipts)
      .set({ receiptText: input.receipt_text, clearedAt })
      .where(eq(receipts.id, existing[0].id));
  } else {
    await db.insert(receipts).values({
      tenantId,
      transactionId: input.transaction_id,
      receiptText: input.receipt_text,
      clearedAt,
    });
  }

  return {
    status: "cleared",
    transaction_id: input.transaction_id,
    cleared_at: clearedAt.toISOString(),
  };
}

/**
 * Re-runs tagging after receipt or policy state changes.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug.
 * @param transactionId - Transaction UUID.
 * @returns Reprocess tagging result.
 */
export async function handleReprocessTagging(
  db: DbClient,
  tenantSlug: string,
  transactionId: string,
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, tenantSlug);
  return reprocessTransactionTagging(db, tenantId, transactionId);
}

/**
 * Lists seeded tenants for MCP clients.
 *
 * @param db - Database client.
 * @returns Tenant id, slug, name rows.
 */
export async function handleListTenants(db: DbClient): Promise<unknown> {
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants);
  return { tenants: rows };
}

/**
 * Resumes a paused AUTO_TAG LangGraph interrupt after human approval.
 *
 * @param db - Database client.
 * @param input - Tenant slug, transaction id, run id, and approval flag.
 * @returns Resume result from orchestrator.
 */
export async function handleApproveAutoTag(
  db: DbClient,
  input: {
    tenant_slug: string;
    transaction_id: string;
    run_id: string;
    approved: boolean;
  },
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, input.tenant_slug);
  return resumeAutoTagApproval(
    db,
    tenantId,
    input.transaction_id,
    input.run_id,
    input.approved,
  );
}

/**
 * Ingests an invoice and runs the AP recommend-only graph.
 *
 * @param db - Database client.
 * @param input - Invoice ingest fields.
 * @returns AP pipeline result.
 */
export async function handleIngestInvoice(
  db: DbClient,
  input: {
    tenant_slug: string;
    external_invoice_id: string;
    vendor_raw: string;
    amount: string;
    currency: string;
    invoice_date: string;
  },
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, input.tenant_slug);
  return runApPipeline(db, {
    tenantId,
    externalInvoiceId: input.external_invoice_id,
    vendorRaw: input.vendor_raw,
    amount: input.amount,
    currency: input.currency,
    invoiceDate: input.invoice_date,
  });
}

/**
 * Lists AP invoices for a tenant.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug.
 * @returns Invoice list DTOs.
 */
export async function handleListInvoices(db: DbClient, tenantSlug: string): Promise<unknown> {
  const tenantId = await resolveTenantId(db, tenantSlug);
  const items = await listApInvoicesForTenant(db, tenantId);
  return { items };
}

/**
 * Returns the active policy pack and rules for a tenant.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug.
 * @returns Policy pack or null.
 */
export async function handleGetActivePolicy(db: DbClient, tenantSlug: string): Promise<unknown> {
  const tenantId = await resolveTenantId(db, tenantSlug);
  return { policy: await getActivePolicyPack(db, tenantId) };
}

/**
 * Posts an AUTO_TAG transaction to the configured ERP adapter.
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug.
 * @param transactionId - Transaction UUID.
 * @param glAccountId - GL account to post (optional; uses txn GL if omitted).
 * @returns ERP post result.
 */
export async function handlePostErp(
  db: DbClient,
  tenantSlug: string,
  transactionId: string,
  glAccountId?: string,
): Promise<unknown> {
  const tenantId = await resolveTenantId(db, tenantSlug);

  let resolvedGlId = glAccountId;
  if (!resolvedGlId) {
    const txnRows = await db
      .select({
        glAccountId: transactions.glAccountId,
        suggestedGlAccountId: transactions.suggestedGlAccountId,
      })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
      )
      .limit(1);

    const txn = txnRows[0];
    if (!txn) {
      throw new Error("Transaction not found for tenant");
    }
    resolvedGlId = txn.glAccountId ?? txn.suggestedGlAccountId ?? undefined;
  }

  if (!resolvedGlId) {
    throw new Error("No GL account available for ERP post");
  }

  const runId = newRunId();
  const posted = await syncAutoTagToErp(db, {
    tenantId,
    transactionId,
    runId,
    glAccountId: resolvedGlId,
  });

  return { run_id: runId, posted };
}
