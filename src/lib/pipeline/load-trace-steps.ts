import { and, asc, eq } from "drizzle-orm";

import {
  PIPELINE_TRACE_EVENT_TYPE,
  type PipelineTraceStepPayload,
} from "@/lib/pipeline/trace-step";
import type { DbClient } from "@/lib/db/client";
import { auditLog, events, transactions } from "@/lib/db/schema";
import { isTerminalProcessingStatus, type ProcessingStatus } from "@/lib/orchestrator/processing-retry";
import { parseObservability } from "@/lib/ui/parse-audit";

export interface PipelineTraceSnapshot {
  steps: PipelineTraceStepPayload[];
  processing_status: ProcessingStatus | null;
  tagging_decision: string | null;
  confidence: number | null;
  done: boolean;
  audit_summary: {
    cost_usd?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    model?: string;
  } | null;
}

/**
 * Loads pipeline trace steps for a run, optionally after a cursor event id.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @param runId - LangGraph run id.
 * @param afterEventId - When set, only return trace events created after this id.
 * @returns Snapshot with new steps and terminal flags.
 */
export async function loadPipelineTraceSnapshot(
  db: DbClient,
  tenantId: string,
  transactionId: string,
  runId: string,
): Promise<PipelineTraceSnapshot> {
  const txnRows = await db
    .select({
      processingStatus: transactions.processingStatus,
      taggingDecision: transactions.taggingDecision,
      confidence: transactions.confidence,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)))
    .limit(1);

  const txn = txnRows[0];
  const processingStatus = (txn?.processingStatus ?? null) as ProcessingStatus | null;

  const eventRows = await db
    .select({
      id: events.id,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.runId, runId),
        eq(events.eventType, PIPELINE_TRACE_EVENT_TYPE),
      ),
    )
    .orderBy(asc(events.createdAt));

  const steps = eventRows
    .map((row) => row.payload as PipelineTraceStepPayload)
    .filter((payload) => payload?.step_id && payload.transaction_id === transactionId);

  const auditRows = await db
    .select({ observability: auditLog.observability })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tenantId, tenantId),
        eq(auditLog.runId, runId),
        eq(auditLog.transactionId, transactionId),
      ),
    )
    .limit(1);

  const observability = parseObservability(auditRows[0]?.observability);
  const auditSummary =
    auditRows.length > 0
      ? {
          cost_usd: observability.cost_usd,
          prompt_tokens: observability.prompt_tokens,
          completion_tokens: observability.completion_tokens,
          model: observability.model,
        }
      : null;

  const hasOrchestratorCompleteStep = steps.some(
    (step) =>
      step.step_id === "orchestrator-complete" ||
      step.step_id === "orchestrator-reprocess-complete",
  );

  const done =
    (processingStatus !== null && isTerminalProcessingStatus(processingStatus)) ||
    hasOrchestratorCompleteStep ||
    (txn?.taggingDecision !== null &&
      txn?.taggingDecision !== undefined &&
      processingStatus !== "processing" &&
      processingStatus !== "pending");

  return {
    steps,
    processing_status: processingStatus,
    tagging_decision: txn?.taggingDecision ?? null,
    confidence: txn?.confidence ? Number(txn.confidence) : null,
    done,
    audit_summary: auditSummary,
  };
}
