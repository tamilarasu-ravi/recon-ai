import type { AppEnv } from "@/lib/config/env";

export type TaggingDecision = "AUTO_TAG" | "QUEUE_REVIEW" | "REFUSE";

export interface TriStateGateInput {
  confidence: number;
  ruleHit: boolean;
  supportCount: number;
  top1Sim: number;
  isNewVendor: boolean;
  glInCoa: boolean;
  parseFailed: boolean;
  promptInjectionDetected: boolean;
  reviewOnlyGl: boolean;
  receiptRequiredAndNotCleared: boolean;
  env: AppEnv;
}

export interface TriStateGateResult {
  decision: TaggingDecision;
  reason: string;
}

/**
 * Applies tri-state autonomy gate per capstone thresholds and safety rules.
 *
 * @param input - Confidence, support signals, and hard safety flags.
 * @returns Final decision and human-readable reason code.
 */
export function applyTriStateGate(input: TriStateGateInput): TriStateGateResult {
  if (input.receiptRequiredAndNotCleared) {
    return { decision: "QUEUE_REVIEW", reason: "receipt_required" };
  }

  if (input.promptInjectionDetected) {
    return { decision: "QUEUE_REVIEW", reason: "prompt_injection_guard" };
  }

  if (input.parseFailed && !input.ruleHit) {
    return { decision: "QUEUE_REVIEW", reason: "llm_parse_failed" };
  }

  if (!input.glInCoa) {
    return { decision: "REFUSE", reason: "coa_mismatch" };
  }

  const hasStrongSupport = input.ruleHit || input.supportCount >= 3;

  if (
    input.confidence >= input.env.TAG_AUTO_THRESHOLD &&
    hasStrongSupport &&
    !input.isNewVendor &&
    !input.reviewOnlyGl
  ) {
    return { decision: "AUTO_TAG", reason: "auto_threshold_met" };
  }

  if (input.reviewOnlyGl && input.glInCoa) {
    return { decision: "QUEUE_REVIEW", reason: "high_risk_gl_review" };
  }

  if (input.isNewVendor && !input.ruleHit) {
    const weakRetrieval = input.top1Sim < 0.55 && input.supportCount < 2;
    if (weakRetrieval || input.confidence < input.env.TAG_REVIEW_THRESHOLD) {
      return { decision: "REFUSE", reason: "new_vendor_no_support" };
    }
    return { decision: "QUEUE_REVIEW", reason: "new_vendor" };
  }

  if (input.confidence < input.env.TAG_REVIEW_THRESHOLD) {
    return { decision: "REFUSE", reason: "low_confidence" };
  }

  return { decision: "QUEUE_REVIEW", reason: "low_confidence_review_band" };
}

/**
 * Validates that a GL account id belongs to the tenant CoA allow-list.
 *
 * @param glAccountId - Proposed GL UUID.
 * @param coaAccountIds - Set of valid CoA account ids for tenant.
 * @returns True when GL is in allow-list.
 */
export function isGlInCoaAllowList(glAccountId: string, coaAccountIds: Set<string>): boolean {
  return coaAccountIds.has(glAccountId);
}
