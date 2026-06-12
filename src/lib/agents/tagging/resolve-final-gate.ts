import type { TaggingDecision } from "@/lib/orchestrator/gates";

export interface ResolveFinalGateInput {
  gateResult: { decision: TaggingDecision; reason: string };
  finalConfidence: number;
  parseFailed: boolean;
  suggestErrorMessage?: string;
  vendorIsNew: boolean;
  neighborCount: number;
  ruleHit: boolean;
}

export interface ResolveFinalGateResult {
  decision: TaggingDecision;
  reason: string;
  confidence: number;
}

/**
 * Applies post-gate overrides for LLM availability, cold-start vendors, and parse failures.
 *
 * @param input - Gate output plus agent context used for safety downgrades.
 * @returns Final tri-state decision, reason, and confidence unchanged from input.
 */
export function resolveFinalGateResult(input: ResolveFinalGateInput): ResolveFinalGateResult {
  let { decision, reason } = input.gateResult;
  const confidence = input.finalConfidence;

  if (input.parseFailed && input.suggestErrorMessage?.includes("no longer available")) {
    return { decision: "QUEUE_REVIEW", reason: "llm_unavailable", confidence };
  }
  if (input.parseFailed && input.suggestErrorMessage?.startsWith("[GoogleGenerativeAI Error]")) {
    return { decision: "QUEUE_REVIEW", reason: "llm_unavailable", confidence };
  }

  if (
    input.vendorIsNew &&
    input.neighborCount === 0 &&
    !input.ruleHit &&
    decision !== "REFUSE"
  ) {
    decision = "QUEUE_REVIEW";
    reason = "new_vendor_cold_start";
  }

  if (input.suggestErrorMessage === "llm_unavailable" && decision === "AUTO_TAG") {
    decision = "QUEUE_REVIEW";
    reason = "llm_unavailable";
  }

  return { decision, reason, confidence };
}
