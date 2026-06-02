import type { Runtime } from "@langchain/langgraph";

import { findDuplicateInvoice } from "@/lib/agents/ap/duplicate";
import { recommendApPayment } from "@/lib/agents/ap/recommend";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { apRecommendations, invoices } from "@/lib/db/schema";
import type { ApGraphContext } from "@/lib/orchestrator/langgraph/context";
import type { ApGraphStateType } from "@/lib/orchestrator/langgraph/ap-state";
import { traceGraphStep } from "@/lib/orchestrator/langgraph/trace-step";
import type { GraphStepRecord } from "@/lib/orchestrator/langgraph/trace-step";

/**
 * Resolves typed runtime context for AP graph nodes.
 *
 * @param runtime - LangGraph runtime from node invocation.
 * @returns Validated AP graph context with db client.
 * @throws Error when db is missing from context.
 */
function getApContext(runtime: Runtime<ApGraphContext>): ApGraphContext {
  const context = runtime.context;
  if (!context?.db) {
    throw new Error("AP graph requires db in runtime context");
  }
  return context;
}

/**
 * Merges prior graph steps with the current node step for audit observability.
 *
 * @param priorSteps - Steps accumulated in graph state.
 * @param node - Current node name.
 * @param startedAtMs - Node entry timestamp.
 * @returns Full step list including the current node.
 */
function mergeGraphSteps(
  priorSteps: GraphStepRecord[],
  node: string,
  startedAtMs: number,
): GraphStepRecord[] {
  return [...priorSteps, ...traceGraphStep(node, startedAtMs).graphSteps];
}

/**
 * Checks for duplicate invoices by vendor, amount, and date.
 *
 * @param state - Current AP graph state.
 * @param runtime - Runtime context with db.
 * @returns Partial state with duplicate flags.
 */
export async function checkApDuplicateNode(
  state: ApGraphStateType,
  runtime: Runtime<ApGraphContext>,
): Promise<Partial<ApGraphStateType>> {
  const started = Date.now();
  const { db } = getApContext(runtime);

  const duplicate = await findDuplicateInvoice(db, {
    tenantId: state.tenantId,
    vendorRaw: state.vendorRaw,
    amount: state.amount,
    invoiceDateIso: state.invoiceDateIso,
  });

  if (duplicate) {
    return {
      duplicateFound: true,
      duplicateInvoiceId: duplicate.id,
      duplicateExternalId: duplicate.externalInvoiceId,
      status: "duplicate",
      ...traceGraphStep("checkApDuplicate", started),
    };
  }

  return {
    duplicateFound: false,
    duplicateInvoiceId: null,
    duplicateExternalId: null,
    ...traceGraphStep("checkApDuplicate", started),
  };
}

/**
 * Persists duplicate refusal events and audit when a duplicate invoice is detected.
 *
 * @param state - Graph state with duplicate metadata.
 * @param runtime - Runtime context with db.
 * @returns Empty partial state.
 */
export async function persistApDuplicateRefusalNode(
  state: ApGraphStateType,
  runtime: Runtime<ApGraphContext>,
): Promise<Partial<ApGraphStateType>> {
  const started = Date.now();
  const { db } = getApContext(runtime);

  if (!state.duplicateInvoiceId || !state.duplicateExternalId) {
    throw new Error("persistApDuplicateRefusalNode requires duplicate invoice metadata");
  }

  await appendEvent(db, {
    tenantId: state.tenantId,
    eventType: "InvoiceDuplicateRefused",
    runId: state.runId,
    payload: {
      external_invoice_id: state.externalInvoiceId,
      duplicate_of: state.duplicateExternalId,
    },
  });

  await appendAuditLog(db, {
    tenantId: state.tenantId,
    runId: state.runId,
    agent: "ap",
    observability: {
      orchestrator: "langgraph",
      node: "persistApDuplicateRefusal",
      graph_steps: mergeGraphSteps(state.graphSteps, "persistApDuplicateRefusal", started),
      status: "duplicate_refused",
      external_invoice_id: state.externalInvoiceId,
      duplicate_of: state.duplicateExternalId,
      would_execute_payment: false,
    },
  });

  return traceGraphStep("persistApDuplicateRefusal", started);
}

/**
 * Inserts a new invoice row and emits InvoiceReceived event.
 *
 * @param state - Graph state with invoice ingest fields.
 * @param runtime - Runtime context with db.
 * @returns Partial state with invoiceId.
 */
export async function ingestApInvoiceNode(
  state: ApGraphStateType,
  runtime: Runtime<ApGraphContext>,
): Promise<Partial<ApGraphStateType>> {
  const started = Date.now();
  const { db } = getApContext(runtime);

  const [invoice] = await db
    .insert(invoices)
    .values({
      tenantId: state.tenantId,
      externalInvoiceId: state.externalInvoiceId,
      vendorRaw: state.vendorRaw,
      amount: state.amount,
      currency: state.currency,
      invoiceDate: new Date(state.invoiceDateIso),
    })
    .returning({ id: invoices.id });

  await appendEvent(db, {
    tenantId: state.tenantId,
    eventType: "InvoiceReceived",
    runId: state.runId,
    payload: {
      invoice_id: invoice.id,
      external_invoice_id: state.externalInvoiceId,
      vendor_raw: state.vendorRaw,
      amount: state.amount,
    },
  });

  return { invoiceId: invoice.id, status: "accepted", ...traceGraphStep("ingestApInvoice", started) };
}

/**
 * Computes recommend-only AP payment date and funding source.
 *
 * @param state - Graph state with invoice fields.
 * @returns Partial state with recommendation.
 */
export async function recommendApNode(
  state: ApGraphStateType,
): Promise<Partial<ApGraphStateType>> {
  const started = Date.now();
  const recommendation = recommendApPayment({
    amount: state.amount,
    currency: state.currency,
    invoiceDateIso: state.invoiceDateIso,
    isDuplicate: false,
  });

  return { recommendation, ...traceGraphStep("recommendAp", started) };
}

/**
 * Persists AP recommendation, events, and audit log.
 *
 * @param state - Graph state with invoiceId and recommendation.
 * @param runtime - Runtime context with db.
 * @returns Empty partial state.
 */
export async function persistApRecommendationNode(
  state: ApGraphStateType,
  runtime: Runtime<ApGraphContext>,
): Promise<Partial<ApGraphStateType>> {
  const started = Date.now();
  const { db } = getApContext(runtime);

  if (!state.invoiceId || !state.recommendation) {
    throw new Error("persistApRecommendationNode requires invoiceId and recommendation");
  }

  const recommendation = state.recommendation;

  await db.insert(apRecommendations).values({
    tenantId: state.tenantId,
    invoiceId: state.invoiceId,
    recommendedPayDate: new Date(recommendation.recommendedPayDateIso),
    fundingSource: recommendation.fundingSource,
    rationale: recommendation.rationale,
    runId: state.runId,
  });

  await appendEvent(db, {
    tenantId: state.tenantId,
    eventType: "ApRecommended",
    runId: state.runId,
    payload: {
      invoice_id: state.invoiceId,
      recommended_pay_date: recommendation.recommendedPayDateIso,
      funding_source: recommendation.fundingSource,
      would_execute_payment: false,
    },
  });

  await appendAuditLog(db, {
    tenantId: state.tenantId,
    runId: state.runId,
    agent: "ap",
    invoiceId: state.invoiceId,
    observability: {
      orchestrator: "langgraph",
      node: "persistApRecommendation",
      graph_steps: mergeGraphSteps(state.graphSteps, "persistApRecommendation", started),
      status: recommendation.status,
      recommended_pay_date: recommendation.recommendedPayDateIso,
      funding_source: recommendation.fundingSource,
      rationale: recommendation.rationale,
      would_execute_payment: false,
    },
  });

  return traceGraphStep("persistApRecommendation", started);
}

/**
 * Routes to duplicate refusal or invoice ingest based on duplicate check.
 *
 * @param state - Graph state with duplicateFound flag.
 * @returns Next node name for conditional edge.
 */
export function routeApAfterDuplicateCheck(
  state: ApGraphStateType,
): "persistApDuplicateRefusal" | "ingestApInvoice" {
  return state.duplicateFound ? "persistApDuplicateRefusal" : "ingestApInvoice";
}
