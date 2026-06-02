import { eq } from "drizzle-orm";

import { newRunId } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";
import { invokeApGraph } from "@/lib/orchestrator/langgraph/ap-graph";

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
 * Ingests an invoice and runs recommend-only AP via LangGraph (duplicate check + pay-date stub).
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

  const graphState = await invokeApGraph(db, {
    runId,
    tenantId: input.tenantId,
    externalInvoiceId: input.externalInvoiceId,
    vendorRaw: input.vendorRaw,
    amount: input.amount,
    currency: input.currency,
    invoiceDateIso,
  });

  if (graphState.status === "duplicate") {
    if (!graphState.duplicateInvoiceId || !graphState.duplicateExternalId) {
      throw new Error("LangGraph AP duplicate path missing invoice metadata");
    }

    return {
      runId,
      invoiceId: graphState.duplicateInvoiceId,
      status: "duplicate",
      recommendationStatus: "duplicate_refused",
      duplicateOfExternalId: graphState.duplicateExternalId,
      rationale: "Duplicate invoice (vendor + amount + date).",
    };
  }

  if (!graphState.invoiceId || !graphState.recommendation) {
    throw new Error("LangGraph AP accept path missing recommendation");
  }

  return {
    runId,
    invoiceId: graphState.invoiceId,
    status: "accepted",
    recommendationStatus: graphState.recommendation.status,
    recommendedPayDate: graphState.recommendation.recommendedPayDateIso,
    fundingSource: graphState.recommendation.fundingSource,
    rationale: graphState.recommendation.rationale,
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
