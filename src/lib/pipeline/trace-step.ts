import { appendEvent } from "@/lib/audit/writers";
import type { DbClient } from "@/lib/db/client";

/** High-level workflow phase for the ingest UI timeline. */
export type PipelineTracePhase =
  | "ingest"
  | "orchestrator"
  | "policy"
  | "receipt"
  | "normalize"
  | "rules"
  | "embedding"
  | "rag"
  | "llm"
  | "confidence"
  | "decision"
  | "persist";

/** Step lifecycle for streaming UI. */
export type PipelineTraceStatus = "running" | "complete" | "error" | "skipped";

export const PIPELINE_TRACE_EVENT_TYPE = "PipelineTraceStep";

/** Payload stored on events.event_type = PipelineTraceStep. */
export interface PipelineTraceStepPayload {
  transaction_id: string;
  step_id: string;
  phase: PipelineTracePhase;
  title: string;
  description?: string;
  status: PipelineTraceStatus;
  latency_ms?: number;
  detail?: Record<string, unknown>;
}

export interface PipelineTraceContext {
  tenantId: string;
  transactionId: string;
  runId: string;
}

/**
 * Appends an immutable pipeline trace step for live ingest UI streaming.
 *
 * @param db - Database client.
 * @param context - Tenant, transaction, and run correlation ids.
 * @param step - Trace step payload (step_id must be unique per run).
 * @returns Inserted event row id.
 */
export async function emitPipelineTraceStep(
  db: DbClient,
  context: PipelineTraceContext,
  step: Omit<PipelineTraceStepPayload, "transaction_id">,
): Promise<string> {
  const payload: PipelineTraceStepPayload = {
    transaction_id: context.transactionId,
    ...step,
  };

  return appendEvent(db, {
    tenantId: context.tenantId,
    eventType: PIPELINE_TRACE_EVENT_TYPE,
    runId: context.runId,
    payload: payload as unknown as Record<string, unknown>,
  });
}

/**
 * Maps internal agent step names to user-facing trace metadata.
 *
 * @param stepName - Agent step span name from runTaggingAgent.
 * @returns Phase and default title for the UI.
 */
export function agentStepToTraceMeta(stepName: string): {
  phase: PipelineTracePhase;
  title: string;
} {
  switch (stepName) {
    case "vendor_normalize":
      return { phase: "normalize", title: "Vendor normalization" };
    case "rule_lookup":
      return { phase: "rules", title: "Vendor rule lookup" };
    case "retrieval":
      return { phase: "rag", title: "RAG retrieval (pgvector)" };
    case "llm_tagging":
      return { phase: "llm", title: "LLM structured tagging" };
    case "confidence_gate":
      return { phase: "confidence", title: "Confidence scoring" };
    case "tri_state_decision":
      return { phase: "decision", title: "Tri-state autonomy gate" };
    default:
      return { phase: "orchestrator", title: stepName };
  }
}
