import type { PipelineResult } from "@/lib/orchestrator/run-pipeline";
import type { invokeTaggingGraph } from "@/lib/orchestrator/langgraph/tagging-graph";

/**
 * Maps completed graph state to pipeline API result fields.
 *
 * @param runId - Orchestrator run identifier.
 * @param transactionId - Transaction UUID.
 * @param graphState - Final LangGraph state after invoke or resume.
 * @returns Accepted pipeline result payload.
 * @throws Error when required graph fields are missing.
 */
export function toAcceptedPipelineResult(
  runId: string,
  transactionId: string,
  graphState: Awaited<ReturnType<typeof invokeTaggingGraph>>["state"],
): PipelineResult {
  if (!graphState.policyResult || !graphState.taggingResult || !graphState.finalDecision) {
    throw new Error("LangGraph tagging workflow did not produce a final decision");
  }

  return {
    runId,
    transactionId,
    status: "accepted",
    policyOutcome: graphState.policyResult.outcome,
    policyVersion: graphState.policyResult.policyVersion,
    decision: graphState.finalDecision,
    confidence: graphState.taggingResult.confidence,
    suggestedGlAccountId: graphState.taggingResult.suggestedGlAccountId,
  };
}
