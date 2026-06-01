import { and, eq } from "drizzle-orm";

import { findDuplicateInvoice } from "@/lib/agents/ap/duplicate";
import { recommendApPayment } from "@/lib/agents/ap/recommend";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { newRunId } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { apRecommendations, invoices, tenants } from "@/lib/db/schema";

export interface InvoiceReceivedInput {
  tenantId: string;
  externalInvoiceId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
  invoiceDate: string;
}

export interface ApPipelineResult {
  runId: string;
  invoiceId: string;
  status: "accepted" | "duplicate";
  recommendationStatus: "recommend" | "duplicate_refused";
  recommendedPayDate?: string;
  fundingSource?: string;
  rationale?: string;
  duplicateOfExternalId?: string;
}

/**
 * Ingests an invoice and runs recommend-only AP (duplicate check + pay-date stub).
 *
 * @param db - Database client.
 * @param input - Invoice ingest payload.
 * @returns AP pipeline result with recommendation or duplicate refusal.
 */
export async function runApPipeline(
  db: DbClient,
  input: InvoiceReceivedInput,
): Promise<ApPipelineResult> {
  const runId = newRunId();
  const invoiceDateIso = new Date(input.invoiceDate).toISOString();

  const duplicate = await findDuplicateInvoice(db, {
    tenantId: input.tenantId,
    vendorRaw: input.vendorRaw,
    amount: input.amount,
    invoiceDateIso,
  });

  if (duplicate) {
    await appendEvent(db, {
      tenantId: input.tenantId,
      eventType: "InvoiceDuplicateRefused",
      runId,
      payload: {
        external_invoice_id: input.externalInvoiceId,
        duplicate_of: duplicate.externalInvoiceId,
      },
    });

    await appendAuditLog(db, {
      tenantId: input.tenantId,
      runId,
      agent: "ap",
      observability: {
        status: "duplicate_refused",
        external_invoice_id: input.externalInvoiceId,
        duplicate_of: duplicate.externalInvoiceId,
        would_execute_payment: false,
      },
    });

    return {
      runId,
      invoiceId: duplicate.id,
      status: "duplicate",
      recommendationStatus: "duplicate_refused",
      duplicateOfExternalId: duplicate.externalInvoiceId,
      rationale: "Duplicate invoice (vendor + amount + date).",
    };
  }

  const [invoice] = await db
    .insert(invoices)
    .values({
      tenantId: input.tenantId,
      externalInvoiceId: input.externalInvoiceId,
      vendorRaw: input.vendorRaw,
      amount: input.amount,
      currency: input.currency,
      invoiceDate: new Date(input.invoiceDate),
    })
    .returning({ id: invoices.id });

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "InvoiceReceived",
    runId,
    payload: {
      invoice_id: invoice.id,
      external_invoice_id: input.externalInvoiceId,
      vendor_raw: input.vendorRaw,
      amount: input.amount,
    },
  });

  const recommendation = recommendApPayment({
    amount: input.amount,
    currency: input.currency,
    invoiceDateIso,
    isDuplicate: false,
  });

  await db.insert(apRecommendations).values({
    tenantId: input.tenantId,
    invoiceId: invoice.id,
    recommendedPayDate: new Date(recommendation.recommendedPayDateIso),
    fundingSource: recommendation.fundingSource,
    rationale: recommendation.rationale,
    runId,
  });

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "ApRecommended",
    runId,
    payload: {
      invoice_id: invoice.id,
      recommended_pay_date: recommendation.recommendedPayDateIso,
      funding_source: recommendation.fundingSource,
      would_execute_payment: false,
    },
  });

  await appendAuditLog(db, {
    tenantId: input.tenantId,
    runId,
    agent: "ap",
    invoiceId: invoice.id,
    observability: {
      status: recommendation.status,
      recommended_pay_date: recommendation.recommendedPayDateIso,
      funding_source: recommendation.fundingSource,
      rationale: recommendation.rationale,
      would_execute_payment: false,
    },
  });

  return {
    runId,
    invoiceId: invoice.id,
    status: "accepted",
    recommendationStatus: recommendation.status,
    recommendedPayDate: recommendation.recommendedPayDateIso,
    fundingSource: recommendation.fundingSource,
    rationale: recommendation.rationale,
  };
}

/**
 * Loads tenant id by slug for demo and scripts.
 *
 * @param db - Database client.
 * @param slug - Tenant slug (e.g. tenant-a).
 * @returns Tenant UUID.
 * @throws Error when slug is not found.
 */
export async function getTenantIdBySlug(db: DbClient, slug: string): Promise<string> {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`Tenant not found: ${slug}`);
  }
  return row.id;
}
