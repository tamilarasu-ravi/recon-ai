import type { AppEnv } from "@/lib/config/env";

export interface VerifierInput {
  ruleHit: boolean;
  ruleGlAccountId: string | null;
  llmSuggestedGl: string | null;
  retrievalSkipped: boolean;
  isNewVendor: boolean;
  neighborCount: number;
  supportCount: number;
  confidence: number;
  env: AppEnv;
}

export interface VerifierResult {
  confidenceAdjustment: number;
  forceReview: boolean;
  reason?: string;
  concerns: string[];
}

/**
 * Heuristically challenges weak evidence before the tri-state gate (agentic v2 Phase 3).
 *
 * @param input - Rule, retrieval, and confidence signals after tagging suggestion.
 * @returns Confidence adjustment and optional forced review downgrade.
 */
export function verifyEvidence(input: VerifierInput): VerifierResult {
  const concerns: string[] = [];
  let confidenceAdjustment = 0;
  let forceReview = false;
  let reason: string | undefined;

  if (
    input.ruleHit &&
    input.ruleGlAccountId &&
    input.llmSuggestedGl &&
    input.llmSuggestedGl !== input.ruleGlAccountId
  ) {
    forceReview = true;
    reason = "verifier_rule_llm_mismatch";
    concerns.push("rule_llm_gl_mismatch");
  }

  if (input.retrievalSkipped && input.isNewVendor) {
    forceReview = true;
    reason = reason ?? "verifier_cold_start";
    concerns.push("retrieval_skipped_new_vendor");
  }

  if (
    input.supportCount < 2 &&
    input.confidence >= input.env.TAG_REVIEW_THRESHOLD &&
    !input.ruleHit
  ) {
    confidenceAdjustment = -0.1;
    concerns.push("weak_neighbor_support");
  }

  if (input.neighborCount === 0 && !input.ruleHit) {
    concerns.push("no_retrieval_neighbors");
  }

  return {
    confidenceAdjustment,
    forceReview,
    reason,
    concerns,
  };
}

/**
 * Applies verifier output to confidence and gate decision without bypassing gates.ts.
 *
 * @param confidence - Raw confidence from scorer.
 * @param gateDecision - Decision from applyTriStateGate.
 * @param gateReason - Reason from applyTriStateGate.
 * @param verifier - Verifier result.
 * @returns Adjusted confidence and possibly downgraded decision.
 */
export function applyVerifierToGate(
  confidence: number,
  gateDecision: "AUTO_TAG" | "QUEUE_REVIEW" | "REFUSE",
  gateReason: string,
  verifier: VerifierResult,
): {
  confidence: number;
  decision: "AUTO_TAG" | "QUEUE_REVIEW" | "REFUSE";
  reason: string;
} {
  const adjustedConfidence = Math.max(
    0,
    Math.min(1, confidence + verifier.confidenceAdjustment),
  );

  if (verifier.forceReview && gateDecision === "AUTO_TAG") {
    return {
      confidence: adjustedConfidence,
      decision: "QUEUE_REVIEW",
      reason: verifier.reason ?? "verifier_force_review",
    };
  }

  return {
    confidence: adjustedConfidence,
    decision: gateDecision,
    reason: gateReason,
  };
}
